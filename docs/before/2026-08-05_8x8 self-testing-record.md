# 8x8 入站消息（inbound_message_received）自测问题记录

> 日期：2026-08-05
> 场景：8x8 回调 `inbound_message_received` 入站消息自测
> 结论：**2026-08-05 首测失败：入站消息能收、能存，但没有归属到业务号码/agent，链路不完整；2026-08-06 复测归属已修复生效，另发现 receiver/chatType 两个遗留小问题（见 §7）。**

---

## 1. 自测日志（2026-08-05）

- 回调内容：

```json
{
  "version": 3,
  "namespace": "ChatApps",
  "eventType": "inbound_message_received",
  "payload": {
    "umid": "4f7e8018-b53e-44e1-b389-69b7e42fe1b5",
    "subAccountId": "RupiahCepat_CA_WA",
    "timestamp": "2026-08-05T08:25:07.00Z",
    "user": { "msisdn": "+8618716030179", "channelUserId": "CN.1363377225858925", "name": "zlc" },
    "recipient": { "channel": "whatsapp", "channelId": "4f9478dd-b3db-475c-9e49-778d8c87046b" },
    "type": "Text",
    "content": { "text": "test inbound message" }
  }
}
```

- 处理链路日志摘要：

| 步骤 | 日志 | 结果 |
| --- | --- | --- |
| 1 接收 | `[EightX8Callback] Receive callback, bodyLen=475` | OK |
| 2 事件识别 | `Identified events for EIGHTX8: [INBOUND_MESSAGE]` | OK |
| 3 查业务号码 | `BusinessPhoneMapper: WHERE business_phone='4f9478dd-b3db-…' → Total: 0` | **失败** |
| 4 保存 | `saveOpayMessageListWithBpInfo has no bp:[4f9478dd-b3db-…]` | 无归属 |
| 5 落库 | `agent=null, agentName=null, wabaId=null, chatType=null, business_phone=4f9478dd-b3db-…` | 内容可查，归属为空 |

---

## 2. 问题根因（2026-08-05）

**入站解析逻辑把 8x8 的 `recipient.channelId`（UUID）直接当成业务号码使用，而系统按 `business_phone` 列（唯一索引、业务号码）反查号码记录，二者对不上。**

代码位置：`EightX8MessagePlugin#parseInboundMessage`：

```java
JSONObject recipient = payload.getJSONObject("recipient");
if (recipient != null) {
    msg.setReceiver(recipient.getString("channelId"));
    msg.setBusiness_phone(recipient.getString("channelId"));
}
```

对照官方文档（`inbound-chatapps-message`）：

| 8x8 回调字段 | 含义 | 是否等于业务号码 |
| --- | --- | --- |
| `payload.umid` | 消息 ID | 否，是消息 ID |
| `payload.subAccountId` | 子账号 ID（如 `RupiahCepat_CA_WA`） | 否，是子账号 |
| `payload.user.msisdn` | 客户号码（发送方） | 否，是客户 |
| `payload.recipient.channelId` | 我方通道 ID（UUID，36 位） | **否，是通道 ID** |
| `payload.recipient.channel` | 通道类型（whatsapp） | 否 |

系统侧：

- `business_phone` 表：`business_phone` 列 `varchar(30)` + 唯一索引，语义是「业务号码」（E.164 展示号），`app_key` 列按方案存 8x8 的 channelId（旧实现存 `subAccountId,channelId`）。
- `channelId` 是 36 位 UUID，`varchar(30)` 存不下，也不等于任何业务号码，用它查 `business_phone` 必然 `Total: 0`。

## 3. 影响（2026-08-05）

- 入站消息落库了（`message_record` 有记录，`umid` 写入 `msg_id`，客户号码写入 `customer_phone`）。
- 但 `agent / agentName / wabaId / chatType` 全部为空：
  - 消息不归属到任何业务号码/agent；
  - 后续自动回复、客服分配、路由、会话关联、会话统计全部失效。
- 现象特征：日志出现 `saveOpayMessageListWithBpInfo has no bp:[<36位UUID>]`。

## 4. 建议修复方向（2026-08-05，已实施）

入站时**先用 8x8 通道标识反查 `business_phone` 记录**，再写入归属信息，而不是直接用 `channelId` 当业务号码：

1. 用 `payload.recipient.channelId` 查 `business_phone.app_key`（新实现 app_key 只存 channelId，旧格式 `subAccountId,channelId` 取第二段）；
2. 查到记录后把该记录的 `business_phone` / `agent` / `agent_name` / `waba_id` / `support_chat_type` 设到消息上；查不到则保留原始值并记录告警。

落地改动（2026-08-06 上线验证）：
- `EightX8MessagePlugin`：入站不再把 36 位 UUID 写入 `business_phone`，改为通过 `BusinessPhoneService.selectByAppKey(channelId, agent)` 反查本地行再填充归属字段；
- `BusinessPhoneServiceImpl`：新增 `selectByAppKey(appKey, agent)`，带 10 分钟 Guava 缓存。

## 5. 如何确认入站是否成功

| 检查项 | 成功标识 |
| --- | --- |
| 回调识别 | `Identified events for EIGHTX8: [INBOUND_MESSAGE]` |
| 消息落库 | `db.message_record.find({msg_id:"<umid>"})` 有记录 |
| 客户号码 | `customer_phone` = `payload.user.msisdn` |
| **归属成功（关键）** | `agent` / `agent_name` / `business_phone` 非空，非 36 位 UUID |
| 失败特征 | `business_phone` 是 36 位 UUID，或日志 `has no bp` |

---

## 6. 2026-08-06 复测结果

- 复测时间：2026-08-06 09:35（traceId `f5f8b2f7-7306-4b18-a790-c4f1108df58f`，whatsapp-crm-api）
- 回调内容：与 §1 同结构（`umid=82b6566b-…-d74cff86d5a9`，`subAccountId=RupiahCepat_CA_WA`，`channelId=4f9478dd-b3db-475c-9e49-778d8c87046b`）
- 处理链路日志摘要：

| 步骤 | 日志 | 结果 |
| --- | --- | --- |
| 1 接收 | `Receive callback, bodyLen=478` | OK |
| 2 事件识别 | `Identified events for EIGHTX8: [INBOUND_MESSAGE]` | OK |
| 3 按 channelId 反查归属 | `WHERE agent=EIGHTX8 AND app_key=4f9478dd-b3db-… → Total: 1` | OK |
| 4 保存 | `saveOpayMessageListWithBpInfo detail bp:[6281313244986] chatType:[] agentName:[TEST_ZLC]` | 归属成功 |
| 5 落库 | `agent=EIGHTX8, agentName=TEST_ZLC, wabaId=1667444894367051, business_phone=6281313244986, customer_phone=+8618716030179` | 归属完整 |
| 6 流转 | `receiveInboundMessage` 正常执行 | OK |

- 结论：**§2-§4 描述的「channelId 被当成业务号码导致无法归属」问题已修复生效，`business_phone/agent/agentName/wabaId` 均已正确填充**。

---

## 7. 2026-08-06 复测遗留问题

### 7.1 receiver 字段仍为 channelId（建议修复）

- 现象：落库记录 `sender=+8618716030179`（客户，正确），`receiver=4f9478dd-b3db-475c-9e49-778d8c87046b`（8x8 channelId UUID，不正确）。
- 说明：`OpayMessage.receiver` 语义是「入站消息的接收方，即我方业务号码」；当前 `parseInboundMessage` 仍执行 `msg.setReceiver(recipient.channelId)`，把 UUID 放进 receiver（`business_phone` 字段已改为真实号码，但 `receiver` 残留了旧逻辑）。
- 建议：入站时将 `receiver` 设为 `business_phone` 行的 `business_phone` 字段（`6281313244986`），反查不到时再退回 channelId。
- 待办：`EightX8MessagePlugin#parseInboundMessage` 约 10 行内改动，待确认后实施。

### 7.2 chatType 为空（数据配置）

- 现象：`saveOpayMessageListWithBpInfo ... chatType:[]`，`msg.chatType=null`。
- 原因：`business_phone.support_chat_type` 列为空（未配置该号码支持的会话类型）。
- 影响：若下游按 `chatType` 做会话/路由/计费分类，空值会导致分类异常；若「默认支持全部类型」则可接受。
- 待办：配置 `support_chat_type`（数据问题，非代码问题）；代码侧无需改动（取值已实现 `inboundPhone.getSupportChatType()`）。

### 7.3 其它：8x8 模板创建失败（mapping 未配置）



- 现象（traceId `1a0db188-03a0-43f8-8336-c2be44817996` / `fb2e6aca…`，whatsapp-crm-job）：`[EightX8Template] Missing 8x8 account mapping for channelId: 4f9478dd-b3db-475c-9e49-778d8c87046b, expected key: eightx8.account.mapping`；随后以 URL `https://chatapps.8x8.com/api/v1/accounts/%s/channels/%s/templates`（`%s` 未替换）请求 8x8，返回 `code:1200 Request was not authenticated properly`，模板置 `CREATEFAIL`。
- 根因：Apollo namespace `openplatform.provider` 下未配置（或 key 不匹配）`eightx8.account.mapping = {"<channelId>":{"accountId":"...","subAccountId":"RupiahCepat_CA_WA"}}`，导致模板创建 URL 的 accountId 解析为空。
- 影响：模板创建/列表、消息发送、媒体上传、webhook 注册的 URL 都需要该映射，属于全局 8x8 配置项。
- 待办：接入 Apollo 配置 mapping 后重跑模板创建任务验证。

### 7.4 出站回执同步给下游的 businessPhone 传成了 subAccountId（待修复确认）

- 场景/日志（2026-08-06 09:33，traceId `6b1e2d95-47b0-4f6c-beed-34d15290a5ba`，whatsapp-crm-api）：8x8 回调 `outbound_message_status_changed`（`state=read`，umid=`c2c9fe2a-2904-480f-9f49-49a21ff8df24`）。
- 现象：主链路正常（`Identified events: [MESSAGE_STATUS_UPDATED]`、`newIndex:6, dbIndex:5` 状态正常升级、Mongo `matchedCount=1, modifiedCount=1`），但同步给 RocketMQ 下游时打印 `receiveMessageReply send sync message businessPhone:[RupiahCepat_CA_WA]` —— **发送的 businessPhone 是 8x8 的 subAccountId，不是真实业务号码**。
- 原因（两层）：
  1. `EightX8MessagePlugin#parseMessageStatus`：v9/v10 交付回执的 payload 里没有 `recipient`，代码兜底 `update.setFrom(payload.getString("subAccountId"))`，把 subAccountId 当成了业务号码；
  2. `OpayMessageServiceImpl#executeUpdateReplyStatus` 把这个值直接当作 `businessPhone` 参数传给 `opayMessagePostProcessor.receiveMessageReply(...)`，最终封装进 RocketMQ 回执事件 `setBusinessPhone(...)` 发给下游。
- 数据验证：Mongo 消息记录 `business_phone=6281313244986` 是正确的（发送侧写入无误），问题只出在「回调同步透传」环节。
- 影响：下游任务/回执消费方按 `businessPhone` 关联业务号码，拿到 `RupiahCepat_CA_WA` 会关联失败；与入站早期「channelId 被当业务号码」同类的问题，只是发生在出站回执链路上。
- 待办（尚未改代码）：回执处理时优先使用本地已查询到的 `opayMessage.getBusiness_phone()` 作为同步 businessPhone，为空再退回回调值；`parseMessageStatus` 的 subAccountId 兜底仅保留用于日志/兜底。改动约 3 行（`executeUpdateReplyStatus` 传参处）。


### 7.5 8x8 媒体上传失败（403 code:1201，需对接方确认，2026-08-06）

- 场景/日志（2026-08-06 15:57，traceId `926760d0-7c00-4e62-aeb1-08387d924f22`，whatsapp-crm-job）：创建 IMAGE header 模板 `0806_test_8x8_6_media`（message_template_waba id 5071，agent TEST_ZLC）。
- 现象（失败链）：
  1. OBS 下载图片成功：`whatsapp-crm-test.obs.ap-southeast-4.../media/uploads/20260806155728/test-upload.png`；
  2. 上传 8x8 两次均失败：`POST https://chatapps.8x8.com/api/v1/subaccounts/RupiahCepat_CA_WA/files`（multipart）→ **403 `code:1201` `"Account was not found in SG. Please use the ID endpoint!"`**；
  3. 代码兜底跳过 header example（WARN：`HEADER rich media example is missing the 8x8 file URL .. Skipping header example`）；
  4. 创建模板 `POST /api/v1/accounts/RupiahCepat/channels/4f9478dd-.../templates`，IMAGE header 无 example → **400 `code:3032` `"Templates with IMAGE header type need an example/sample, but it was not provided."`**；
  5. 模板置 `CREATEFAIL`（waba 表 + message_template 表）。
- 根因定位：`files` 上传端点（SG 区域）不接受 subAccountId 名称 `RupiahCepat_CA_WA`，提示 `Please use the ID endpoint!` —— 应使用数字 ID（或其它特定标识），需 8x8 对接方确认「ID endpoint」具体指什么、从哪获取。
- 影响：任何带 IMAGE/VIDEO header 的 8x 模板都会创建失败；纯文本模板不受影响。
- 待办（需对接方确认后才能定方案）：确认上传端点正确的 subAccountId 取值；若需「数字 ID」，确认其与 `RupiahCepat_CA_WA` 的对应关系及获取方式；同时确认发送消息端点 `POST /api/v1/subaccounts/{subAccountId}/messages` 是否同样要求数字 ID。

---

（文档完）
