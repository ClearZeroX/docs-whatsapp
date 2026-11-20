# 8x8 Connect WhatsApp API 对接文档

AI整理，原API doc: https://developer.8x8.com/connect/reference/send-sms-single

本文档用于指导通过 API 对接 8x8 Connect 平台的 WhatsApp 业务，包含**模板管理**、**消息发送**（营销/服务类与验证码）以及**接收回调通知 (Webhook)** 的完整规范。

---

## 一、 基础配置与鉴权

### 1. 通用请求头 (Request Headers)

所有 API 请求均须在 Header 中携带 Bearer Token 进行身份验证：

| Header 名称 | 必填 | 示例值 | 说明 |
|---|---|---|---|
| `Authorization` | 是 | `Bearer YOUR_API_KEY` | 8x8 Connect 后台生成的 API Key |
| `Content-Type` | 是 | `application/json` | 数据格式固定为 `application/json` |

### 2. 核心账号参数

- Subaccount ID (`:accountId` / `:subAccountId`): RupiahCepat_CA_WA
- WhatsApp Channel ID (`:channelId`): 4f9478dd-b3db-475c-9e49-778d8c87046b

---

## 二、 模板管理 API (WhatsApp Templates)

在发送营销或服务类消息前，必须先创建模板并提交 Meta 审核。

### 1. 创建 WhatsApp 模板

- HTTP 方法与路径: POST [https://chatapps.8x8.com/api/v1/accounts/RupiahCepat_CA_WA/channels/4f9478dd-b3db-475c-9e49-778d8c87046b/templates](https://chatapps.8x8.com/api/v1/accounts/RupiahCepat_CA_WA/channels/4f9478dd-b3db-475c-9e49-778d8c87046b/templates)

#### 请求参数示例：

```JSON
{
  "name": "order_update_notification",
  "category": "UTILITY",
  "language": "id",
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT",
      "text": "Informasi Pesanan"
    },
    {
      "type": "BODY",
      "text": "Halo {{1}}, pesanan Anda dengan ID {{2}} telah berhasil dikirim."
    },
    {
      "type": "FOOTER",
      "text": "Rupiah Cepat"
    }
  ]
}
```

#### 关键参数说明：

- `name`: 模板名称，仅支持小写字母、数字及下划线。
- `category`: 模板类型：
- MARKETING（营销/促销，走 MM Lite API 通道优化）
- UTILITY（服务/通知，走标准 Cloud API）
- AUTHENTICATION（身份验证/验证码，走标准 Cloud API）
- `language`: 语言代码（如 id 印尼语、en_US 英语、zh_CN 简体中文）。

#### 响应示例：

```JSON
{
  "id": "tpl_1234567890",
  "status": "PENDING",
  "name": "order_update_notification",
  "category": "UTILITY",
  "language": "id"
}
```

---

## 三、 消息发送 API (Send Messaging)

8x8 支持发送不同类型的 WhatsApp 消息。

### 1. 发送 WhatsApp 模板消息 (Outbound Template)

用于主动给用户发送营销推广或订单通知。

- HTTP 方法与路径: POST [https://chatapps.8x8.com/api/v1/accounts/RupiahCepat_CA_WA/channels/4f9478dd-b3db-475c-9e49-778d8c87046b/messages](https://chatapps.8x8.com/api/v1/accounts/RupiahCepat_CA_WA/channels/4f9478dd-b3db-475c-9e49-778d8c87046b/messages)

#### 请求参数示例：

```JSON
{
  "destination": "+628123456789",
  "clientMessageId": "MSG_20260803_001",
  "template": {
    "name": "order_update_notification",
    "language": {
      "code": "id"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Budi" },
          { "type": "text", "text": "ORD-998811" }
        ]
      }
    ]
  }
}
```

#### 响应示例：

```JSON
{
  "umid": "8x8_msg_waba_992011a882",
  "clientMessageId": "MSG_20260803_001",
  "status": "ACCEPTED"
}
```

---

### 2. 发送会话/自由文本消息 (Session / Freeform Text)

用于在**用户主动发消息后的 24 小时会话窗口内**进行回复。

- HTTP 方法与路径: POST [https://chatapps.8x8.com/api/v1/accounts/RupiahCepat_CA_WA/channels/4f9478dd-b3db-475c-9e49-778d8c87046b/messages](https://chatapps.8x8.com/api/v1/accounts/RupiahCepat_CA_WA/channels/4f9478dd-b3db-475c-9e49-778d8c87046b/messages)

#### 请求参数示例：

```JSON
{
  "destination": "+628123456789",
  "clientMessageId": "MSG_REPLY_002",
  "type": "text",
  "text": {
    "body": "Halo, ada yang bisa kami bantu terkait pesanan Anda?"
  }
}
```

---

## 四、 回调通知 API (Webhook / Callbacks)

您需要在 8x8 后台配置 Webhook URL，8x8 会将**消息送达状态**和**用户回复内容**推送至您的服务器。

### 1. 消息状态回调 (Delivery Receipt / DLR Callback)

当发出的消息状态发生变更（如发送中、已送达、已读、失败）时，8x8 会向您的服务器发送 `POST` 请求。

#### 示例请求体 (Payload)：

```JSON
{
  "umid": "8x8_msg_waba_992011a882",
  "clientMessageId": "MSG_20260803_001",
  "accountId": "RupiahCepat_CA_WA",
  "channelId": "4f9478dd-b3db-475c-9e49-778d8c87046b",
  "destination": "+628123456789",
  "status": "DELIVERED",
  "timestamp": "2026-08-03T10:15:30Z",
  "error": null
}
```

#### 常见状态说明：

- `SENT`：已成功提交至 Meta 官方服务器。
- `DELIVERED`：消息已成功送达用户手机。
- `READ`：用户已打开/读取该消息。
- `FAILED`：发送失败（错误原因参见 payload 中的 error 字段，如号码未注册 WhatsApp）。

---

### 2. 接收用户上行消息回调 (Inbound Message Callback)

当用户在 WhatsApp 中主动发送文本或回复您的消息时触发。

#### 示例请求体 (Payload)：

```JSON
{
  "umid": "inbound_msg_772619201",
  "accountId": "RupiahCepat_CA_WA",
  "channelId": "4f9478dd-b3db-475c-9e49-778d8c87046b",
  "sender": "+628123456789",
  "timestamp": "2026-08-03T10:16:05Z",
  "message": {
    "type": "text",
    "text": {
      "body": "Saya ingin menanyakan tentang pesanan saya."
    }
  }
}
```

---

### 3. 模板状态变更回调 (Template Status Callback)

当您通过 API 提交的 WhatsApp 消息模板被 Meta 审核，或后续状态发生变化时，8x8 会向您的 Webhook URL 发送 `POST` 请求通知。

#### 示例请求体 (Payload)：

JSON

```text
{
  "event": "TEMPLATE_STATUS_UPDATE",
  "accountId": "RupiahCepat_CA_WA",
  "channelId": "4f9478dd-b3db-475c-9e49-778d8c87046b",
  "templateId": "tpl_1234567890",
  "templateName": "order_update_notification",
  "language": "id",
  "status": "APPROVED",
  "reason": null,
  "timestamp": "2026-08-03T10:20:00Z"
}
```

#### 模板状态枚举说明 (`status`)：

> 内嵌电子表格（sheet-id: xihhrd）：https://q6oisf77xb.feishu.cn/sheets/Ht2hsJEDPhDrkQtbYGDcBd6un0c

---

## 五、 响应码及处理建议

您的 Webhook 接口在接收到 8x8 的回调推送后，**必须在 3 秒内返回 `HTTP 200 OK**` 响应，否则 8x8 系统会判定推送超时并触发重试机制。

| HTTP 状态码 | 含义 | 说明 |
|---|---|---|
| **`200 OK` / `201 Created**` | 请求成功 | 接口处理正常 |
| **`400 Bad Request`** | 请求格式错误 | 检查 JSON 字段拼写及必填项 |
| **`401 Unauthorized`** | 鉴权失败 | 检查 API Key 是否有效或过期 |
| **`404 Not Found`** | 资源未找到 | 检查 URL 中的 `:accountId` 或 `:channelId` 是否正确 |
| **`500 Internal Error`** | 8x8 服务器错误 | 建议稍后重试或联系 8x8 技术支持 |
