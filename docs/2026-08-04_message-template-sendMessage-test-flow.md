# admin/api/messageTemplate/sendMessage 测试接口梳理

> 说明：本文档梳理后台「测试发送模板」接口 `POST admin/api/messageTemplate/sendMessage` 的完整执行链路、与正常任务发送流程的差异，并评估新接入 agent 时能否用该接口做验证、覆盖范围如何。

---

## 1. 接口概览

| 项 | 内容 |
| --- | --- |
| 接口 | `POST admin/api/messageTemplate/sendMessage` |
| Controller | `MessageTemplateController#sendMessage`（whatsapp-crm-api） |
| Service | `MessageTemplateServiceImpl#sendMessageTest`（whatsapp-crm-data） |
| 入参 | `MessageTemplateSendReqDTO` |
| 用途 | 后端/管理员手动对某个客户号码发一条模板消息做连通性测试 |

**核心结论：该接口是「真实发送」链路，但不是「完整业务」链路。** 它复用了正式发送的 agent 路由与第三方 HTTP 调用，但跳过了任务上下文、真实参数、重试、统计、计费等外围逻辑。

---

## 2. 接口入参结构（MessageTemplateSendReqDTO）

| 字段 | 说明 | 校验 |
| --- | --- | --- |
| `id` | 模板 ID（主表 `message_template.id`） | `@NotNull` |
| `customerPhone` | 收件人号码 | `@NotBlank` |
| `wabaId` | WhatsApp Business Account ID | `@NotBlank` |

---

## 3. 接口同步执行流程

### 3.1 模板 & WABA 校验：`validateTemplateAndWaba`

- 查询模板绑定的 `message_template_waba` 列表；
- 要求存在 `waba_id = 入参 wabaId` 且 `status = APPROVED` 的记录，否则抛 `APPROVED messageTemplate waba not exist`。

> 含义：**发送前模板必须已在第三方（Meta）创建成功且审核通过**，因此该接口无法替代「模板创建链路」的验证。

### 3.2 BP（业务号码）随机选取

1. `businessPhoneService.selectByWabaId(wabaId)` 查该 waba 下全部业务号码；
2. 过滤 `enable_status = YES` 且 `status` 在 `BPStatusEnum.VALID_STATUS_SET` 中的号码；
3. `Collections.shuffle` 后取第一条；
4. 为空则抛 `business_phone_not_exist`。

### 3.3 mock 模板参数

| 模板类型 | 参数来源 |
| --- | --- |
| AUTHENTICATION（OTP） | 固定 `OTP_CODE = "123456"` |
| 其他 | `mockParams2ParamValueMap`：按模板变量集合生成 `RandomUtil.randomString(3)` 随机值；`idn_server_unsubscribe_short_url` / `idn_server_normal_trace_link` 特殊生成长随机串 |

另外把配置 `commonTemplateBusinessParamNames` 里的通用业务参数也随机填充进 `bizInfo`，随消息下发。

### 3.4 消息组装：`OpayMessageTemplate2OpayMessageAdapter.convert`

- `message_type = template`；
- 模板信息（name / agentTemplateId / language / components）随消息；
- 根据模板类型走 `otpMessageComments`（固定 body+button 结构）或 `commonMessageComments`（按 components 变量渲染，含 header 媒体、短链回填）；
- `relate_extra` 打标：
  - `test = true`
  - `TASK_BUSINESS_TYPE = 模板类型`
  - `SUB_TASK_DATA_RETRY_ENABLE = false`
  - `CALLBACK_RETRY_ENABLE = false`

### 3.5 发送：`OpayMessageServiceImpl#sendMessageTest`

与正常发送共用同一套 agent 路由：

1. `messagePostProcessorMgr.before(opayMessage)`；
2. 填充 sender / receiver / agent / agentName / wabaId / business_phone 等；
3. 若非 SPAM 状态：按 agent 路由发送（unifiedProvider 插件 / NXCLOUD / ADA / YCLOUD / GPI）；
4. `saveOpayMessage`：消息写入 mongo `opay_message` 集合；
5. `messagePostProcessorMgr.after(opayMessage, null)`（注意 response 传 null）。

### 3.6 结果判断

- 发送后检查 `msg_status` 是否在失败集合（`REQUEST_FAIL` / `REQUEST_FAIL_SPAM`），是则抛 `message_send_failed`，接口返回 false 语义；
- 否则返回 `true`。

> ⚠️ 风险点：如果新 agent **未注册进发送路由**（`supportedAgent` 或 else-if 链均未命中），`sendMessageTest` 不会调用任何第三方，`msg_status` 保持空，**接口照样返回 true（静默假成功）**。排查时需看 agent 实际请求日志。

---

## 4. 与正常发送流程的差异

### 4.1 正常发送入口

- 任务链路：`TaskMessageSenderImpl#sendMessageNow`（whatsapp-crm-data/data/task/send）→ `getOpayMessage`（携带完整任务上下文）→ `OpayManagementServiceImpl#sendMessage`；
- relate_extra 会带：`TASK_ID`、`SUB_TASK_ID`、`SUB_TASK_DATA_ID`、`RESOURCE_GRADE`、`MATCH_STRATEGY`、`LANE`、业务参数（`TASK_BIZ_INFO_MAP` 等）以及各重试开关。

### 4.2 差异对照表

| 维度 | 正常任务发送（sendMessage） | 测试发送（sendMessageTest） |
| --- | --- | --- |
| 收件号码 | 统一 `formatPhoneNumberWithCountryCode` | 直接用入参，不格式化 |
| 参数来源 | 真实业务参数 `queryParams`（短链、业务变量） | mock 随机值；OTP 固定 `123456` |
| BP 选择 | 任务上下文指定 | 该 waba 下随机挑一个可用 BP |
| relate_extra | 完整任务上下文 + 重试开关 | `test=true` + 模板类型，重试全关 |
| 发送路由 | `sendMessage(...)`，支持灰度 `useDirectSend`、SPAM 拦截 | `sendMessageTest(...)`，固定不直连 |
| OTP 重试 | `retryForOTPTError`（API 错误自动换 BP 重试） | 无 |
| 耗时指标 | `summaryAgentTime` + 发送耗时/状态指标 | 无耗时统计 |
| 熔断 | OTP 触发 `breakerForOtpReqError` | 会走（在 GPI 实现内） |
| after 后处理 | 携带真实 response | `response = null` |
| 模板发送计数 | `SourceSendCountProcessor` 增加 BP/模板计数（影响分层模板排序） | **同样会增加**（无 TASK_ID 隔离） |
| 营销/Dashboard 统计 | 有 TASK_ID → 实时统计 | 不统计（无 TASK_ID） |
| 任务进度/计费 | `updateSubTaskCountInfo`、计费、失败落库重试 | 无 |
| 入库 | mongo `opay_message` | 同样入库，回调可按 msg_id 找到 |
| 失败回调重试 | 按各重试开关 | 禁止重试 |

---

## 5. 新接入 agent 能否用该接口验证

### 5.1 能覆盖的（发送连通性闭环）

- 模板 → 消息转换、参数 mock；
- **第三方发送主链路**：适配器转换 → HTTP 请求发出 → 响应解析 → `msg_status` 落 mongo；
- 消息状态基础回调：发送成功后按 msg_id 更新 delivered / read / failed；
- 发送渠道路由命中验证（agent 分支是否走通）；
- Prometheus 发送指标。

### 5.2 硬性前提（不满足则无法使用）

1. **模板必须已创建并 APPROVED**（接口强校验）→ 模板创建链路必须先验证；
2. **新 agent 必须已注册在发送路由**：`OpayManageServiceImpl#sendMessage` 的 `unifiedProviderService.supportedAgent` 或 legacy else-if 链（GPI / NXCLOUD / ADA / YCLOUD / EIGHTX8 等）——这是新接入的核心代码改动；
3. **渠道配置齐全**：`business_phone`（enable/valid）、`waba_base`、token/密钥映射。

### 5.3 覆盖不到的（盲区）

| 模块 | 缺失点 |
| --- | --- |
| 模板创建链路 | 模板 create / preview / createTemplateOnProvider / 审核状态流转 |
| 媒体上传 | header 图片/视频 `uploadMedia`（测试消息带媒体时仅依赖已上传 media id） |
| OTP 重试/熔断降级 | `retryForOtpError`、`breakerForOtpReqError` 的完整行为 |
| 任务全链路 | 建任务、批次入库、真实参数、灰度直发、任务统计/计费/Dashboard |
| 回调业务闭环 | 测试消息不关联任务，回调只更新 mongo 状态，不更新任务统计/计费 |
| 并发/频控/风控 | SPAM 拦截、线程池、配额限流 |

### 5.4 结论

**能用，但不能覆盖全。** 它适合做「模板 APPROVED 后，消息发送主链路的连通性冒烟验证」：验证路由注册正确、HTTP 请求格式正确、三方能收到并回执。

---

## 6. 新 agent 完整接入验证建议（四步）

| 步骤 | 验证内容 | 对应接口/手段 |
| --- | --- | --- |
| 1. 模板创建链路 | 模板在三方成功创建、状态推进到 APPROVED | `create` → `previewCreateTemplateRequest` / `createTemplateOnProvider` → `getTemplate`/`listTemplatesFromProvider` |
| 2. 媒体上传（如有 header） | 图片/视频上传成功拿到 media id | 各 agent `uploadMedia`（插件 `TemplatePlugin.uploadMedia`） |
| 3. 发送链路 | 模板消息发送成功、msg_id 回执 | `sendMessage`（本文档接口），查看日志确认有真实请求 |
| 4. 回调闭环 | 三方 webhook 能回调（模板状态、消息状态、质量分） | agent 对应 `*CallBackController` |
| 5. 任务链路（可选） | 挂真实小任务验证统计/计费/重试 | 任务列表创建 → 跑任务 → Dashboard |

> 排查提示：若 `sendMessage` 返回 `true` 但三方未收到消息，优先怀疑**新 agent 未进入发送路由分支**（接口静默假成功），检查日志中是否出现 agent 实际发送日志。

---

## 7. 相关代码索引

| 环节 | 文件 |
| --- | --- |
| 接口入口 | `whatsapp-crm-api/.../controller/admin/MessageTemplateController.java#sendMessage` |
| 测试发送业务逻辑 | `whatsapp-crm-data/.../service/impl/MessageTemplateServiceImpl.java#sendMessageTest` |
| 消息构造 | `whatsapp-crm-data/.../agent/opay/adapter/OpayMessageTemplate2OpayMessageAdapter.java` |
| 发送核心 | `whatsapp-crm-data/.../agent/opay/impl/OpayMessageServiceImpl.java`（`sendMessage` / `sendMessageTest`） |
| 路由分发 | `whatsapp-crm-data/.../agent/opay/impl/OpayManageServiceImpl.java`（模板创建路由）、`.../OpayMessageServiceImpl.java`（消息发送路由） |
| 后处理链 | `whatsapp-crm-data/.../agent/opay/postprocessor/MessagePostProcessorMgr.java`、`SourceSendCountProcessor.java`、`MarketingStatisticMessagePostProcessor.java` |
| 正常任务发送 | `whatsapp-crm-data/.../task/send/impl/TaskMessageSenderImpl.java` |
| GPI 发送实现 | `whatsapp-crm-data/.../agent/gpi/impl/GpiMessageServiceImpl.java`、`whatsapp-agent-sdk/.../gpi/service/message/impl/GpiMessageServiceImpl.java` |
| 消息回执回调 | `whatsapp-crm-api/.../controller/callback/GpiCallBackController.java#messagesCallback` |
| 状态枚举 | `whatsapp-agent-sdk/.../agent/enums/MessageStatusEnum.java` |
