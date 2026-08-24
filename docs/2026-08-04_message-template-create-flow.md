# admin/api/messageTemplate/create 接口执行流程详解

> 说明：本文档梳理后台「创建消息模板」接口 `POST admin/api/messageTemplate/create` 从接收到最终在 Meta 侧生效的完整链路，包含涉及的表与核心字段、异步 Job、第三方调用、状态回写闭环。

---

## 1. 接口概览

| 项 | 内容 |
| --- | --- |
| 接口 | `POST admin/api/messageTemplate/create` |
| Controller | `MessageTemplateController#createMsgTemplate`（whatsapp-crm-api） |
| Service | `MessageTemplateServiceImpl#createMsgTemplate`（whatsapp-crm-data） |
| 入参 | `MessageTemplateCreateReqDTO` |
| 归属模块 | `whatsapp-crm-api` + `whatsapp-crm-data` |

**核心结论：接口本身是"只落库、不通信"**。它不会直接调用 Meta/第三方网关，只负责：

1. 参数 & 业务校验；
2. 写入主表 `message_template`；
3. 批量写入子表 `message_template_waba`（每个 `agent + waba` 一条，状态 `WAITCREATE`）。

真正"去 Meta 创建"的工作由 XXL-Job `createMsgTemplateJob` 异步消费子表完成。

---

## 2. 接口入参结构（MessageTemplateCreateReqDTO）

| 字段 | 说明 |
| --- | --- |
| `name` | 模板名称（全局唯一） |
| `language` | 模板语言（如 `en_US`） |
| `category` | 模板分类：`OTP` / `MARKETING` / `UTILITY`（对应 `MessageTemplateTypeEnum`） |
| `components` | 模板组件列表 `List<OpayTemplateComponent>`（header / body / footer / button 等） |
| `selectedAgentAndWabaIds` | 选择的渠道与 WABA 列表：`[{agent, wabaId}]`，可多选 |
| `creator` | 创建人（接口内用当前登录用户名填充） |

---

## 3. 接口同步执行流程

### 3.1 校验阶段

| 步骤 | 方法 | 校验内容 |
| --- | --- | --- |
| 1 | `validateExampleNoChinese` | 示例文本 `body_text` / `body_text_variables` 不允许包含中文（Meta 要求示例内容合规） |
| 2 | `validateTemplateDuplicate` | 按 `name` 查重，模板名已存在则报 `TEMPLATE_IS_EXIST` |
| 3 | `validateTemplateSupportCategory` | 所选 WABA 关联业务号的 `support_task_types` 必须包含 `category`，否则报 `TEMPLATE_BUSINESSPHONE_NOT_SUPPORT_TYPE` |
| 4 | `handleFlowWaba` | FLOW 类型模板只能选单个 WABA；校验 FLOW 按钮的 `flow_id` 对应 flow 已上线且 WABA 匹配，并将 flow 名称/动作回填到组件 |

### 3.2 落库阶段

#### 3.2.1 主表 `message_template`

转换逻辑在 `ConvertUtil#dto2MessageTemplate`，生成一条主记录并 `save`：

| 字段 | 写入值 | 说明 |
| --- | --- | --- |
| `id` | 自增 | 主键 |
| `name` | 入参 | 模板名称 |
| `template_type` | 入参 `category` | 分类：OTP/MARKETING/UTILITY |
| `language` | 入参 | 语言 |
| `components` | components 序列化为 JSON | 组件内容（含示例、按钮） |
| `status` | `WAIT_ALL_SUBTEMPLATES_CREATE` | 初始状态：等待所有子模板创建完成 |
| `creator` | 入参/登录用户名 | 创建人 |
| `updater` | 无 | 更新人（初始为空） |
| `ctime` / `utime` | 当前时间戳（ms） | 创建/更新时间 |
| `ever_utility` | `category==UTILITY ? 1 : 0` | 是否曾是 UTILITY 模板 |

> 说明：`message_template` 表还包含后续异步流程才会写入的字段：`copy_template_id`（复制来源）、`material_group_id` / `material_combination_id`（素材组合）、`agent_template_id`（主模板维度三方 ID）、`grade`、`waba_category`、`shadow_status`、`message_send_ttl_seconds`、`header_media_id`、`header_media_upload_time` 等。

#### 3.2.2 变更日志（异步）

`dataChangeLogService.asyncSaveTemplateChangeLog(null, templateId, CREATE, "back", ...)` 异步记录模板变更日志。

#### 3.2.3 子表 `message_template_waba`

对入参 `selectedAgentAndWabaIds` 逐条构建 `MessageTemplateWaba`，`saveBatch` 批量插入：

| 字段 | 写入值 | 说明 |
| --- | --- | --- |
| `id` | 自增 | 主键 |
| `message_template_id` | 主表模板 ID | 关联主表 |
| `waba_id` | 入参 | WhatsApp Business Account ID |
| `agent` | 入参 | 渠道：GPI / NXCLOUD / ADA / YCLOUD / EIGHTX8 等 |
| `agent_name` | 从 `waba_base` 反查 | 三方渠道账户名（按 `waba_id` 批量查询 + 缓存） |
| `status` | `WAITCREATE` | 初始状态：等待 Job 创建 |
| `quality` | `UNKNOWN` | 模板质量分初始未知 |
| `category` | 主模板 `template_type` | 分类快照 |
| `creator` | 入参 | 创建人 |
| `ctime` / `utime` | 当前时间戳（ms） | 创建/更新时间 |

> 后续 Job / 回调才会写入 `message_template_waba` 的字段：`agent_template_id`（Meta 返回的模板 ID）、`business_phone`（业务号码）、`agent_name`、`updater`、`header_media_id`、`header_media_upload_time`、`ever_utility` 等。

**关键点：子表数据在同步接口里已插入，Job 只负责消费 `WAITCREATE` 记录，不再新增子表数据。**

---

## 4. 异步创建 Job（真正去 Meta 创建）

### 4.1 调度入口

- XXL-Job Handler：`createMsgTemplateJob`
- Job 类：`CreateMsgTemplateJob`（whatsapp-crm-job，注解 `@XxlJob("createMsgTemplateJob")`）
- 业务逻辑：`CreateMsgTemplateJobService#createMsgTemplateJob`（whatsapp-crm-data）

### 4.2 取数 & 限流：`getCreateTemplateWabalist`

1. `getTodayAlreadyCreateTemplateCount()` / `getAlreadyCreateTemplateCount()`：用 Redis ZSet（`SOURCE_TEMPLATE_CREATE_SET_KEY`）统计当日 / 时间窗内已创建数；
2. 已达今日上限（`create_up_limit`）→ 只允许线上已存在的手工模板继续创建；
3. 本次可创建数 = `create_up_limit_per_time - 窗口内已创建数`，<= 0 时返回空；
4. 查询 `selectWaitCreateList(canCreateCount, copy, rejectedList)`：
   - `WHERE mtw.status = 'WAITCREATE'`（join `message_template`）；
   - 优先非 copy 模板（`copy_template_id` / `material_group_id` 为空），不足再补 copy 模板；
   - 排除近期 REJECTED 过的 waba（`recordFailedIntervalMin` 时间窗）；
   - `ORDER BY id ASC LIMIT canCreateCount`；
5. `sourcePoolService.filterMessageTemplateWaba` 二次过滤（模板有效期等）。

### 4.3 逐条创建：`doCreate(messageTemplateWaba)`

1. `needRejectedPause`：copy 模板且有近期拒绝记录则跳过（暂停）；
2. 取主模板 `message_template`；若 `message_send_ttl_seconds` 为空，按 `template_type` 从配置 `automaticTemplateTypeMessageSendTtlSeconds` 解析填充；
3. `businessPhoneService.selectByWabaIdAndAgentForCreateTemplate(wabaId, agent)` 找到业务号码（含三方 token / 账号信息）；
4. `updateMessageTemplateInfoWabaById`：子记录状态置为 `RUNCREATE`（创建中），回填 `agent_name`、`business_phone`；
5. 调用 `opayManageService.createMessageTemplate(template, businessPhone, messageTemplateWaba)`（第 5 节详述）；
6. `updateTemplateId` 写回：
   - `agent_template_id` = 三方返回的模板 ID；`status` = 三方返回状态（通常 `PENDING`）；
   - 记入 `RECORD_TEMPLATE_CREATE_SET_KEY`（限流统计）；
   - 若状态在 `record_failed_status`（如 `REJECTED` / `CREATEFAIL`）内，把该 waba 记入失败 ZSet（后续暂停该 waba 创建）；
   - ycloud 若返回 `category` 与主模板不同，则同步主表 `template_type`；
7. 异常：飞书告警 `CREATEMSGTEMPLATEJOB_EXCEPTION`。

每条记录创建前 `Thread.sleep` 随机毫秒数（`create_time_interval` 配置区间），避免瞬时打爆网关/触发频控。

### 4.4 收尾 `doUpdate`（主模板状态聚合）

扫描主表 `status = WAIT_ALL_SUBTEMPLATES_CREATE` 的模板，检查其所有子记录：

| 子表状态组合 | 主表状态 |
| --- | --- |
| 全部 `APPROVED` | `APPROVED` |
| 存在 `REJECTED` | `REJECTED` |
| 存在 `CREATEFAIL` | `CREATEFAIL` |

同时 `clearTemplateCreateZSet` 清理 48 小时前的创建/拒绝流水记录。

---

## 5. 第三方创建调用链（“去 Meta 创建”）

### 5.1 统一入口 `OpayManageServiceImpl#createMessageTemplate`

1. 若模板带头部媒体：先 `unifiedProviderService.uploadMedia` 上传，拿到 `media_id` 挂到模板（`headerMediaId` / `headerMediaUploadTime`）；
2. 按 agent 路由：

| Agent | 路由实现 |
| --- | --- |
| 已接入 openplatform 插件体系 | `UnifiedProviderService#createTemplate` → `WriteProviderHandler#createTemplate`（模板插件 `TemplatePlugin`，如 8x8、Vonage） |
| NXCLOUD | `NxCloudManageService#createTemplateMessage` |
| ADA | `AdaManageService#createTemplate` |
| YCLOUD | `YCloudManageService#createTemplate` |
| GPI | `GpiManageService#createTemplate` |

### 5.2 GPI（Meta 渠道）链路

`GpiManageServiceImpl#createMessageTemplate`：

1. `OpayMessageTemplate2GpiMessageTemplateAdapter.convert(template)` 转换请求体：`name`、`language`、`category`、`message_send_ttl_seconds`、`components`（type / format / text / example / buttons[含 FLOW]）；
2. `request.setWabaId(businessPhone.getWabaId())`；
3. 按业务号码构造 `GpiClientImpl(token)`，`BASE_URL = https://messaging.mahadata.io`；
4. 发送：
   - 路径：`POST /v1/{wabaId}/templates`（`RequestAction#createTemplate`），即 Meta Cloud API `POST /{WABA_ID}/message_templates` 的网关代理；
   - 认证：Bearer token；
   - 超时：10s；
5. 响应 `GpiTemplateResponse` → `GpiTemplate2OpayTemplateAdapter` 转 `OpayTemplate`（`id` = `agent_template_id`，`status` = `PENDING` 等）；
6. 全链路 Prometheus 指标统计 + 飞书告警（REJECTED 时 @所有人）。

---

## 6. 状态回写闭环

### 6.1 Webhook 回调（GPI）

- 地址：`POST {AGENT_CALLBACK_PREFIX}/gpi/webhook`（`GpiCallBackController#gpiCallback`）；
- 防护：来源 IP 白名单校验 + `hub.verify_token` 校验；
- 按 `entry[].changes[].field` 分发：

| field | 处理 | 落库动作 |
| --- | --- | --- |
| `message_template_status_update` | `messageTemplateStatusUpdateCallback` | `updateTemplateStatus(agentTemplateId, status, ...)`：把子表状态从 `PENDING` 推进到 `APPROVED` / `REJECTED` 等 |
| `message_template_quality_update` | `messageTemplateQualityUpdateCallback` | 更新子表 `quality_score`（质量分） |
| `message_template_category_update` | `templateCategoryCallback` | 更新主表 `template_type`（分类变更） |
| `messages` | 消息回调 | 消息收发、投递状态等（MQ 分发） |

- 写入屏障：回调处理前写入 `template` 相关 Redis 写屏障，防止回调与 Job 并发覆盖（`MESSAGE_CALLBACK_CHANGE`）。

### 6.2 兜底同步 Job

- `RefreshTemplateStatusJob`：定期拉取 `PENDING` 的 VONAGE 模板状态（分页 + 时间窗口）；
- 其他 agent 亦有各自的状态同步 / 拉取 Job。

---

## 7. 状态流转一览（核心）

主表 `message_template.status`：

```
WAIT_ALL_SUBTEMPLATES_CREATE ──(Job 聚),成功──> APPROVED
        │
        ├─(存在子表 REJECTED)──> REJECTED
        └─(存在子表 CREATEFAIL)──> CREATEFAIL
```

子表 `message_template_waba.status`：

```
WAITCREATE ──(Job 开始)──> RUNCREATE ──(三方返回 PENDING)──> PENDING ──(Meta 回调)──> APPROVED / REJECTED
     │                              └──(三方返回失败/超时)──> CREATEFAIL
     └──(暂停中) ── 维持 WAITCREATE（下次 Job 重试）
```

---

## 8. 相关代码索引

| 环节 | 文件 |
| --- | --- |
| 接口入口 | `whatsapp-crm-api/.../controller/admin/MessageTemplateController.java` |
| 同步业务逻辑 | `whatsapp-crm-data/.../service/impl/MessageTemplateServiceImpl.java#createMsgTemplate` |
| DTO 转换 | `whatsapp-crm-data/.../util/ConvertUtil.java#dto2MessageTemplate` |
| 异步 Job | `whatsapp-crm-job/.../task/CreateMsgTemplateJob.java`（`@XxlJob("createMsgTemplateJob")`） |
| Job 业务逻辑 | `whatsapp-crm-data/.../xxljob/CreateMsgTemplateJobService.java` |
| 三方路由分发 | `whatsapp-crm-data/.../agent/opay/impl/OpayManageServiceImpl.java` |
| GPI 创建实现 | `whatsapp-crm-data/.../agent/gpi/impl/GpiManageServiceImpl.java` |
| GPI SDK 底层 | `whatsapp-agent-sdk/.../gpi/service/manage/impl/GpiManageServiceImpl.java`、`.../gpi/service/impl/RequestAction.java` |
| 回调入口 | `whatsapp-crm-api/.../controller/callback/GpiCallBackController.java` |
| 状态枚举 | `whatsapp-crm-common/.../enums/TemplateStatusEnum.java` |
| 表结构 | `doc/sql/whatsapp_crm.sql`（`message_template` / `message_template_waba`） |
