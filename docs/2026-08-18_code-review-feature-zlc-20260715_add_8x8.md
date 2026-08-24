# Code Review：feature/zlc/20260715_add_8x8 vs master

- 分支：`feature/zlc/20260715_add_8x8`
- 基线：`master`
- 审查日期：2026-08-18
- 范围：44 文件，+4119/-91 行
- 编译验证：`mvn compile` 通过

## 变更概述

新增 8x8 Connect 供应商接入（消息收发、模板管理、回调、Webhook、账号/号码查询），并将统一供应商能力开关从"整体支持"细化为按场景（`UnifiedProviderSceneEnum`）控制。

---

## 严重问题（High）

### 1. [P0] agentTemplateId 回填标识不一致导致 Webhook 全部模板回调失效

#### 根因：表里存的是"模板名"，Webhook 用的是"数字 id"

8x8 列模板 API 无稳定 id（代码注释明确："template name is used as the template id"），但模板状态 Webhook 携带的是数字 `templateId`（如 `452452411`）。Job 先跑，把 `agentTemplateId` 写成了**模板名**：

```java
// UpdateMsgTemplateJobService.pullEightX8TemplateByList
boolean backfilled = messageTemplateWabaService.backfillAgentTemplateIdByTemplateName(
        matched.getName(), templateName, templateWaba.getWabaId());
```

而 Webhook 回调三类 handler 全都拿**数字 id** 去查表，查不到就静默丢弃。

#### 影响范围：三类 Webhook 回调全部失效（不止 agentTemplateId）

1. **`template_status_update` → `TemplateReviewedHandler`**
   - 先 `beforeTemplateStatusUpdate` 回填：条件是 `agentTemplateId IS NULL OR ''`，但 Job 已写入模板名 → 回填落空
   - 再 `updateTemplateStatus(数字id, status, ...)`：`MessageTemplateWabaServiceImpl.java:144` 按 `agentTemplateId = 数字id` 查询，查不到 → `messageTemplateWaba == null` 直接 return
   - **状态变更丢失**

2. **`template_category_update` → `TemplateCategoryUpdatedHandler`**
   - `selectByAgentTemplateId(数字id)`：同样按数字 id 查不到 → `log.error` + return
   - **分类变更丢失**（连 `message_template` 表的 `updateTemplateCategory` 也不执行）

3. **`template_quality_update` → `TemplateQualityUpdatedHandler`**
   - `updateTemplateStatus(数字id, null, qualityRating, ...)`：同样查不到 → return
   - **质量变更丢失**

#### Job 兜底情况

Job 下一轮轮询用模板名作为 key 匹配更新，能部分补偿：

- **status**：能补偿（`doUpdate` 用模板名更新成功）
- **category**：只能补偿 `message_template_waba` 表层面；`TemplateCategoryUpdatedHandler` 里额外的 `messageTemplateService.updateTemplateCategory`（`message_template` 表分类）不会被执行
- **quality**：**完全补偿不了**——代码注释明确 `8x8 Get WhatsApp templates API does not expose a quality rating`，Job 拿到的 qualityRating 是 null

#### 例外

若 Webhook 在 Job 之前到达（审核极快、Job 还没跑），`beforeTemplateStatusUpdate` 回填成功写入数字 id，后续回调可正常处理。但模板审核通常耗时较长、Job 是定时的，**大多数情况 Job 先跑**，Webhook 实时性丢失。

#### 修复建议

统一标识。两条路径二选一：
- 方案 A：Job 不回填 agentTemplateId（保留空），由 Webhook 写入真实数字 id；Job 改为按 `messageTemplateId + businessPhone` 匹配更新
- 方案 B：Webhook 回填时允许覆盖已有的"名称型" agentTemplateId，并在回填后用同一数字 id 跑后续状态更新

同时需确认 8x8 列模板 API 是否真的不返回 id；若返回，则两边统一用该 id，根因消除。

- 文件：`whatsapp-crm-data/.../xxljob/UpdateMsgTemplateJobService.java:234-282`
- 文件：`whatsapp-openplatform/.../plugin/eightx8/EightX8CallbackPlugin.java`（beforeTemplateStatusUpdate）
- 文件：`whatsapp-openplatform/.../plugin/handler/TemplateReviewedHandler.java:52-58`

---

## 中等问题（Medium）

### 2. [P1] Webhook 状态更新未按 businessPhone 作用域

`TemplateReviewedHandler` 调用的是 5 参数 `updateTemplateStatus(templateId, status, quality, source, null)`，`businessPhone=null`。该方法在 businessPhone 为空时仅按 agentTemplateId + `orderByDesc(id) limit 1` 取最新行。8x8 模板名可能跨 channel/WABA 共用，存在更新到其他 channel 记录的风险。Job 路径（`doUpdate`）已正确传入 `businessPhone.getBusinessPhone()`，建议 Webhook 路径也对齐。

- 文件：`whatsapp-openplatform/.../plugin/handler/TemplateReviewedHandler.java:57-58`

### 3. [P1] 回调鉴权在未配置时默认放行

`EightX8CallbackPlugin.verifySignature` 在 `callbackConfig`/`signatureConfig` 为 null、或 Basic 凭证均为空时直接返回 `true`；`IpValidator.validateIp(..., true)` 在白名单为空时也放行。配置文件中 `agent.callBack.allowIps.eightx8` 与 Basic 凭证均为注释状态。若上线时遗漏配置，回调端点将完全开放。

- 文件：`whatsapp-openplatform/.../plugin/eightx8/EightX8CallbackPlugin.java:109-116`
- 建议：上线前确认 IP 白名单与 Basic 凭证已配置，或在未配置时拒绝而非放行。

### 4. 状态回执 from 字段回退返回 subAccountId

`EightX8MessagePlugin.resolveBusinessPhone` 在找不到 channel 映射或本地号码时，回退返回原始 `subAccountId` 作为 `from`。下游若期望 `from` 为手机号格式，可能解析异常。建议回退时返回 null 并告警，而非返回一个非手机号字符串。

- 文件：`whatsapp-openplatform/.../plugin/eightx8/EightX8MessagePlugin.java`（resolveBusinessPhone）

---

## 轻微问题（Low）

### 5. eightX8TemplateListCache 非线程安全

`UpdateMsgTemplateJobService` 用普通 `HashMap` 作为实例字段缓存 8x8 模板列表。xxl-job 通常单线程执行问题不大，但若存在并发触发风险，建议改用 `ConcurrentHashMap` 或局部变量传递。

### 6. getApiUrl 使用 String.format 的潜在风险

`ConfigEngine.getApiUrl` 用 `String.format(url, pathParams)` 填充 `%s`。若 endpoint 路径含非 `%s` 的 `%` 字符（如 URL 编码 `%20`）会抛 `IllegalFormatException`。8x8 当前 URL 无此问题，但对所有供应商是潜在隐患。

### 7. 残留注释代码与 TODO

`EightX8MessagePlugin` 有多处注释掉的代码（`// result.setTimestamp`、`// msg.setMsg_type(type)`、`// msg.setTimestamp`）；`QueryProviderHandler`、`MessageTemplateServiceImpl`、`UpdateMsgTemplateJobService` 各有 `TODO z` 待优化标记。建议清理注释代码，TODO 可保留但建议补充负责人/计划。

### 8. 状态大小写一致性

8x8 返回大写状态（如 `APPROVED`），`TemplateReviewedHandler` 用 `"APPROVED".equals(status)` 精确匹配。Job 路径用 `equalsAnyIgnoreCase`。需确认系统其他模块对状态大小写的一致性预期，避免大小写敏感的比较遗漏。

---

## 优点

- **SPI 扩展设计合理**：`resolveXPathParams` 系列默认方法 + `parseCreateTemplateResult(httpCode, ...)` 重载，对现有供应商零侵入，新供应商按需覆写。
- **文档详尽**：每个插件类和关键方法都有 javadoc，并引用 8x8 官方文档链接与请求/响应示例。
- **容错良好**：列表解析兼容 `templates`/`data`/裸数组三种包装；状态解析兼容 `state`/`detail`/`status`/`deliveryStatus` 多种字段；`eventDetails`/`payload` 双结构兜底。
- **遵循 IN 批量分批**：`backfillAgentTemplateIdByTemplateName` 按 500 分批 `Lists.partition`，符合大数据量 in 查询规范。
- **失败快速**：`WriteProviderHandler.resolveApiUrl` 检测未解析的 `%s` 占位符即中止，避免发出畸形 URL。
- **HTTP 码感知**：`postJsonWithStatus` + `parseCreateTemplateResult(httpCode, ...)` 正确处理 8x8 创建模板"200 空体成功 / 非 2xx 失败"的语义。
- **Multipart 上传 Content-Type 处理**：`EightX8AuthPlugin` 在 `UPLOAD_MEDIA` 时移除固定 JSON Content-Type，让 OkHttp 自动生成 boundary。
- **Apollo 热更新**：`agent.eightx8.account.mapping` 通过 `@Value` setter 注入，运行时自动刷新无需重启。

---

## 建议优先级

1. **P0**：修复 agentTemplateId 回填标识不一致问题（问题 1），这是影响 8x8 模板审批实时性的核心缺陷。
2. **P1**：Webhook 状态更新补齐 businessPhone 作用域（问题 2）；确认上线鉴权配置（问题 3）。
3. **P2**：清理注释代码、确认状态大小写一致性、缓存线程安全。
