# WhatsApp CRM 交互流程文档

> 本文档基于 `whatsapp-openplatform` 模块的插件化 SPI 架构，描述系统与第三方 WhatsApp 提供商（Vonage、XCloud、Ada、NxCloud、YCloud）之间的所有交互流程。

---

## 目录

1. [系统架构概览](#1-系统架构概览)
2. [消息发送流程](#2-消息发送流程)
3. [回调处理流程](#3-回调处理流程)
4. [模板创建与更新流程](#4-模板创建与更新流程)
5. [Webhook 注册与管理](#5-webhook-注册与管理)
6. [Business Account & Phone Number 管理](#6-business-account--phone-number-管理)
7. [批处理定时任务](#7-批处理定时任务)
8. [SPI 插件接口一览](#8-spi-插件接口一览)

---

## 1. 系统架构概览

### 1.1 模块分层

```
┌──────────────────────────────────────────────────┐
│                API 层 (REST Controller)            │
│  UnifiedCallbackController / BusinessPhoneController │
└──────────────────────┬───────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────┐
│            UnifiedProviderServiceImpl              │
│     统一入口门面，按 providerCode 路由到各模块         │
└──────┬──────────────┬──────────────────┬─────────┘
       │              │                  │
┌──────▼──────┐ ┌─────▼───────┐  ┌──────▼────────┐
│WriteProvider │ │QueryProvider│  │CallbackProvider│
│  Handler     │ │  Handler   │  │   Handler      │
└──────┬──────┘ └─────┬───────┘  └──────┬────────┘
       │              │                  │
┌──────▼──────────────▼──────────────────▼─────────┐
│                  PluginEngine                      │
│     SPI 插件注册中心 — 管理所有 Provider 的插件实例    │
└──────┬──────┬──────┬──────┬──────┬──────┬─────────┘
       │      │      │      │      │      │
  Message  Auth Callback Template Webhook BusinessAccount
  Plugin  Plugin  Plugin   Plugin   Plugin    Plugin
       │                          │
       ▼                          ▼
    HTTP 请求 (ConfigEngine)    回调事件分发 (Handler)
```

### 1.2 核心模块依赖关系

| 模块 | 角色 | 依赖 |
|---|---|---|
| `whatsapp-openplatform` | 统一开放平台层 | `whatsapp-agent-sdk`、`whatsapp-crm-common`、`whatsapp-crm-data` |
| `whatsapp-agent-sdk` | 提供商 SDK 适配层 | 无（纯适配层） |
| `whatsapp-crm-data` | 数据访问层 | `whatsapp-crm-common`、`whatsapp-crm-proto` |
| `whatsapp-crm-mq` | RocketMQ 消息处理 | `whatsapp-crm-data`、`whatsapp-crm-common` |
| `whatsapp-crm-otp` | OTP 回调处理 | `whatsapp-crm-data`、`whatsapp-crm-common` |
| `whatsapp-crm-job` | XXL-Job 批处理任务 | `whatsapp-crm-data`、`whatsapp-crm-common` |
| `whatsapp-crm-job2-1-1` | 批处理任务（独立部署） | `whatsapp-crm-data`、`whatsapp-crm-common` |

### 1.3 支持的 WhatsApp 提供商

| 提供商 | AgentEnum | MessagePlugin | CallbackPlugin | 说明 |
|---|---|---|---|---|
| Vonage | `VONAGE` | `VonageMessagePlugin` | `VonageCallbackPlugin` | 主要提供商，功能最完整 |
| XCloud (8x8) | `XCLOUD` | `XCloudMessagePlugin` | `XCloudCallbackPlugin` | 8x8 平台 |
| Ada | `ADA` | `AdaMessageService` | — | 通过 `whatsapp-agent-sdk` 适配 |
| NxCloud | `NX` | — | — | 通过 SDK 适配 |
| YCloud | `YCLOUD` | — | — | 通过 SDK 适配 |
| GPI | `GPI` | — | — | 旧有提供商 |

---

## 2. 消息发送流程

### 2.1 完整发送链路

```
调用方
  │
  ▼
UnifiedProviderServiceImpl.sendMessage(providerCode, businessPhone, opayMessage, useDirectSend)
  │
  ▼
WriteProviderHandler.sendMessage()
  │
  ├── 1. ConfigEngine.getConfig(providerCode)         // 读取提供商配置
  ├── 2. PluginEngine.getMessagePlugin(providerCode)  // 获取消息插件
  ├── 3. plugin.toRequestBody(opayMessage, config)   // OpayMessage → 第三方请求体
  │       └── 或 toDirectSendRequestBody() (直连模式)
  ├── 4. 构建认证头: buildAuthHeaders()
  │       └── AuthPlugin.buildAuth(config, agentName)
  ├── 5. ConfigEngine.getApiUrl(config, SEND_MESSAGE) // 获取 API 地址
  ├── 6. ConfigEngine.postJson(url, body, headers, timeout)
  │       ├── 超时: OTP 5s / 普通 10s (可配置)
  │       └── 序列化: FASTJSON / GSON (按插件)
  ├── 7. plugin.parseSendResult(rawResponse, config)  // 解析响应
  ├── 8. OpayMessageService 保存消息记录
  ├── 9. 熔断保护 (Resilience4j)
  └── 10. Prometheus 监控埋点
```

### 2.2 消息类型映射

`OpayMessage` 统一模型支持以下消息类型，每个 `MessagePlugin` 实现将其转换为第三方对应的格式：

| OpayMessageType | 描述 | Vonage 映射 | 关键字段 |
|---|---|---|---|
| `text` | 纯文本消息 | `message_type=text`, `text=body` | `from`, `to`, `text.body` |
| `image` | 图片消息 | `message_type=image`, `image.url` | `image.link`, `image.caption` |
| `video` | 视频消息 | `message_type=video`, `video.url` | `video.link`, `video.caption` |
| `audio` | 音频消息 | `message_type=audio`, `audio.url` | `audio.link` |
| `document` | 文件消息 | `message_type=file`, `file.url` | `document.link`, `document.filename` |
| `template` | 模板消息 | 通过 `template` 相关字段 | `template.name`, `template.language`, `template.components[]` |
| `interactive` | 交互消息 | 按钮/列表等 | `interactive.type`, `interactive.action` |

### 2.3 直连发送模式

`useDirectSend=true` 时，请求不走中间代理，直接打到第三方 API：

```java
if (useDirectSend) {
    requestBody = plugin.toDirectSendRequestBody(opayMessage, config);
} else {
    requestBody = plugin.toRequestBody(opayMessage, config);
}
```

两种模式的 API URL 通过 `ApiOperation` 区分：
- `SEND_MESSAGE` — 普通发送
- `SEND_DIRECTLY` — 直连发送

### 2.4 超时控制

超时时间通过 `ProviderConfig.behaviorConfig.timeoutConfig` 配置：

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `sendMessageTimeoutMs` | 10000ms | 普通消息发送超时 |
| `otpTimeoutMs` | 5000ms | OTP 消息发送超时 |
| `managePostTimeoutMs` | 30000ms | 模板管理等管理操作超时 |

---

## 3. 回调处理流程

### 3.1 回调入口

```
第三方平台
  │
  ▼
POST /api/v2/callback/{providerCode}/callback
  │
  ├── GET /api/v2/callback/{providerCode}/webhook/verify  (Webhook 验证)
  │
  ▼
UnifiedCallbackController.callback(providerCode, rawBody, request)
  │
  ▼
CallbackProviderHandlerImpl.processCallback()
  │
  ├── 1. CallbackPlugin.verifySignature(request, config)  // 验签
  ├── 2. CallbackPlugin.identifyEventType(rawBody, config) // 识别事件类型
  ├── 3. 解析事件数据 (fillContextByEvent)
  ├── 4. 分发到对应 CallbackHandler.handle()
  └── 5. distributeIfNeeded() → RocketMQ 分发 (OTP/非OTP)
```

### 3.2 事件类型一览

CallbackEvent 按域分为 6 类，共 15 种事件：

#### 消息事件 (MESSAGE)

| 事件 | 触发条件 | 处理 Handler | 关键处理逻辑 |
|---|---|---|---|
| `inbound_message` | 客户回复消息 | `InboundMessageHandler` | `MessagePlugin.parseInboundMessage()` → `OpayMessageService.saveOpayMessageListWithBpInfo()` 保存入站消息 |
| `message_status_updated` | 消息投递状态变更 | `MessageStatusUpdatedHandler` | `MessagePlugin.parseMessageStatus()` → 计费信息解析 → `OpayMessageService.updateReplyStatus()` 更新消息状态 |

#### 模板事件 (TEMPLATE)

| 事件 | 触发条件 | 处理 Handler | 关键处理逻辑 |
|---|---|---|---|
| `template_reviewed` | 模板审核通过/拒绝 | `TemplateReviewedHandler` | 更新模板审核状态 |
| `template_category_updated` | 模板类别变更 | `TemplateCategoryUpdatedHandler` | `TemplatePlugin.parseTemplateStatus()` → `MessageTemplateService.updateTemplateCategory()` + `updateEverUtility()` |
| `template_quality_updated` | 模板质量分更新 | `TemplateQualityUpdatedHandler` | 更新质量评分 |
| `message_template_status_update` | 模板状态更新 | `TemplateReviewedHandler` | 同步模板状态 |

#### 账户事件 (ACCOUNT)

| 事件 | 触发条件 | 处理 Handler |
|---|---|---|
| `business_account_updated` | WABA 账户信息变更 | `BusinessAccountUpdatedHandler` |
| `business_account_deleted` | WABA 账户被删除 | `BusinessAccountDeletedHandler` |
| `business_account_reviewed` | WABA 账户审核完成 | `BusinessAccountReviewedHandler` |
| `business_account_restricted` | WABA 账户受限 | `BusinessAccountUpdatedHandler` (复用) |

#### 号码事件 (PHONE)

| 事件 | 触发条件 | 处理 Handler |
|---|---|---|
| `phone_number_quality_updated` | 号码质量分更新 | `PhoneNumberQualityUpdatedHandler` |
| `phone_number_name_updated` | 号码名称变更 | — |
| `phone_number_deleted` | 号码被删除 | `PhoneNumberDeletedHandler` |

#### 其他事件

| 事件 | 域 | 处理逻辑 |
|---|---|---|
| `security` | SECURITY | `BusinessAccountPlugin.parseSecurityUpdate()` → `SecurityEventHandler` |
| `flow_endpoint` | FLOW | Flow 交互端点回调 |

### 3.3 OTP 回调分发机制

消息状态变更回调在 `UnifiedCallbackController.distributeIfNeeded()` 中判断是否需要分发到 RocketMQ：

```java
// 仅 MESSAGE_STATUS_UPDATED 事件参与分发
if (event != CallbackEvent.MESSAGE_STATUS_UPDATED) return;

// 查询消息，判断业务类型
boolean isOtpCallback = "AUTHENTICATION".equals(opayMessage.getBusinessType());

if (isOtpCallback) {
    // 发送到 OTP topic
    rocketMQTemplate.syncSend(otpTopic, body);
} else {
    // 发送到非 OTP topic
    rocketMQTemplate.syncSend(notOtpTopic, body);
}
```

OTP 回调由 `whatsapp-crm-otp` 模块的 `OtpCallbackConsumer` 消费，根据提供商选择对应的 `OtpCallbackStrategy`（`AdaOtpCallbackStrategy`、`NxOtpCallbackStrategy`、`GpiOtpCallbackStrategy`、`YcloudOtpCallbackStrategy`）。

### 3.4 回调验证机制

每个 `CallbackPlugin` 实现不同的验签逻辑：

- **Vonage**: JWT Bearer Token + HMAC SHA256 签名验证（WebhookConfig 配置）
- **XCloud**: 自定义签名头验证
- **Ada/Nx/YCloud**: 通过各自 SDK 提供的验证机制

可选的 IP 白名单过滤：

```java
BehaviorConfig callbackIgnoreBpListKey — 配置需要忽略的 Business Phone 列表
```

---

## 4. 模板创建与更新流程

### 4.1 模板创建

#### 4.1.1 单模板创建

```
UnifiedProviderServiceImpl.createTemplate(providerCode, businessPhone, messageTemplate)
  │
  ▼
WriteProviderHandler.createTemplate()
  │
  ├── 1. TemplatePlugin.toCreateTemplateRequest()     // 构建第三方请求
  ├── 2. Build Auth Headers
  ├── 3. ConfigEngine.getApiUrl(config, CREATE_TEMPLATE, wabaId)
  ├── 4. HTTP POST (超时: 30s)
  ├── 5. TemplatePlugin.parseCreateTemplateResult()  // 解析响应
  └── 6. toOpayTemplate() → 统一模型返回
```

**TemplatePlugin 接口：**

```java
public interface TemplatePlugin<T> {
    T toCreateTemplateRequest(BusinessPhone, MessageTemplate, ProviderConfig);
    TemplateResult parseCreateTemplateResult(String rawResponse, ProviderConfig);
    TemplateResult parseTemplateResult(String rawResponse, ProviderConfig);
    TemplateStatusUpdate parseTemplateStatus(String rawBody, ProviderConfig);
    List<TemplateResult> parseListTemplatesResult(String rawResponse, ProviderConfig); // 默认空列表
    default String uploadMedia(String mediaUrl, String fileType, ProviderConfig config); // 可选
}
```

#### 4.1.2 批量模板创建

由 XXL-Job 定时任务触发，通过 `whatsapp-crm-data` 模块的 JobService 执行：

| 任务类 | JobService | 策略 |
|---|---|---|
| `CreateTemplateForLevelJob` | `CreateTemplateForLevelJobService` | 按模板等级创建 |
| `CreateTemplateForLaneV2Job` | `CreateTemplateForLaneV2JobService` | 按渠道策略创建 |
| `PriorityCreateTemplateForQualityRatioJob` | `TemplateQuantityRatioPriorityCreateTemplateJobService` | 按质量比优先级创建 |

### 4.2 模板状态同步

#### 4.2.1 被动更新（回调驱动）

| 回调事件 | 更新内容 | 数据库操作 |
|---|---|---|
| `template_reviewed` | 审核状态（通过/拒绝） | `message_template_waba` 表 |
| `template_category_updated` | 模板类别 | `message_template` 表：`updateTemplateCategory()` + `updateEverUtility()` |
| `template_quality_updated` | 质量评分 | 质量分相关表 |

#### 4.2.2 主动刷新（定时任务）

```
RefreshVonageTemplateStatusJob
  │
  ▼
UnifiedProviderServiceImpl.getTemplateById(providerCode, wabaId, templateId)
  │
  ▼
QueryProviderHandler.getTemplateById()
  │
  ├── ConfigEngine.getApiUrl(config, GET_TEMPLATE_BY_ID)
  ├── HTTP GET (带认证头)
  ├── TemplatePlugin.parseTemplateResult() → OpayTemplate
  └── 同步到 message_template_waba 表
```

---

## 5. Webhook 注册与管理

### 5.1 Webhook 注册

```java
WebhookManageService.registerWebhook(providerCode, callbackUrl, events)
  │
  ├── PluginEngine.getWebhookPlugin(providerCode)
  ├── ConfigEngine.getConfig(providerCode) → WebhookConfig
  │     ├── enabled: boolean
  │     ├── webhookUrl: string
  │     └── subscribedEvents: string[]
  └── WebhookPlugin.registerWebhook(config, callbackUrl, events)
       └── 向第三方平台注册回调地址
```

### 5.2 Webhook 验证

```
GET /api/v2/callback/{providerCode}/webhook/verify
  │
  ├── WebhookPlugin.verifyWebhook() — 处理挑战(challenge)验证
  └── 返回验证结果 + challenge token
```

### 5.3 Webhook 注销

```java
WebhookManageService.unregisterWebhook(providerCode, webhookId)
  └── WebhookPlugin.unregisterWebhook(config, webhookId)
```

当前实现：Vonage 和 XCloud 提供了完整的 WebhookPlugin 实现（`VonageWebhookPlugin` / `XCloudWebhookPlugin`）。

---

## 6. Business Account & Phone Number 管理

### 6.1 Account 管理

通过 `BusinessAccountPlugin` SPI 实现：

```java
public interface BusinessAccountPlugin {
    BusinessAccountResult parseBusinessAccountResult(String rawResponse, ProviderConfig config);
    BusinessAccountUpdate parseBusinessAccountUpdate(String rawBody, ProviderConfig config);
    BusinessAccountUpdate parseBusinessAccountReviewResult(String rawBody, ProviderConfig config);
    SecurityUpdate parseSecurityUpdate(String rawBody, ProviderConfig config);
    BusinessAccountResult parseListBusinessAccountResult(String rawResponse, ProviderConfig config);
}
```

实现类：`VonageBusinessAccountPlugin`、`XCloudBusinessAccountPlugin`

### 6.2 Phone Number 管理

通过 `BusinessPhonePlugin` SPI 实现：

```java
public interface BusinessPhonePlugin {
    PhoneNumberUpdate parsePhoneNumberUpdate(String rawBody, ProviderConfig config);
}
```

实现类：`VonageBusinessPhonePlugin`、`XCloudBusinessPhonePlugin`

质量分更新时，`PhoneNumberQualityUpdatedHandler` 会触发：
- 号码发送暂停/恢复逻辑
- 监控告警（通过 Prometheus）

### 6.3 Security 事件处理

`SecurityEventHandler` 处理安全事件（如账户密码重置、API key 变更等），调用 `BusinessAccountPlugin.parseSecurityUpdate()` 解析并记录。

---

## 7. 批处理定时任务

### 7.1 XXL-Job 任务

由 `whatsapp-crm-job` 和 `whatsapp-crm-job2-1-1` 两个模块执行。

| 任务类 | JobService | 说明 | 执行频率 (cron) |
|---|---|---|---|
| `RefreshTemplateStatusJob` | — | 统一模板状态刷新 | 可配置 |
| `RefreshVonageTemplateStatusJob` | — | Vonage 模板状态专用刷新 | 可配置 |
| `TaskMetricScoreJob` | `TaskMetricScoreJobService` | 模板/渠道质量评分计算 | 可配置 |
| `TaskMetricScoreRealtimeJob` | `TaskMetricScoreRealtimeJobService` | 实时评分计算 | 高频 |
| `AllTaskMetricScoreJob` | — | 全量指标评分 | 可配置 |
| `TaskDataPullJob` | `TaskDataPullJobService` | 从第三方拉取数据 | 可配置 |
| `CreateTemplateForLevelJob` | `CreateTemplateForLevelJobService` | 按等级创建模板 | 可配置 |
| `CreateTemplateForLaneV2Job` | `CreateTemplateForLaneV2JobService` | 按渠道创建模板 V2 | 可配置 |
| `PriorityCreateTemplateForQualityRatioJob` | `TemplateQuantityRatioPriorityCreateTemplateJobService` | 质量比优先创建模板 | 可配置 |
| `ClearSourceSetRecordJob` | — | 清理过期源记录 | 每日 |
| `FailedMessageRetryJob` | — | 重试发送失败的消息 | 可配置 |
| `WABAWithBPStatisticMonitorJob` | — | WABA + BusinessPhone 错误码监控 | 可配置 |
| `NotifyPendingTasks` | — | 待处理任务通知 | 可配置 |
| `SaveSourceSnapshotJob` | — | 源数据快照保存 | 可配置 |
| `UpdateMsgTemplateJob` | — | 消息模板批量更新 | 可配置 |

### 7.2 MQ 消息消费

| 消费者 | Topic | 功能 |
|---|---|---|
| `TaskDataPullConsumer` | `TASK_DATA_PULL` | 异步执行数据拉取任务 |
| `OtpCallbackConsumer` | `whatsapp-crm-otp-callback-consumer` | OTP 回调处理 |
| `OpenPlatformNotOtpCallbackStrategyProvider` | `whatsapp-crm-not-otp-callback-consumer` | 非 OTP 回调处理 |

---

## 8. SPI 插件接口一览

### 8.1 插件体系

```
PluginEngine (插件注册中心)
  │
  ├── MessagePlugin<R, D>        — 消息发送/状态查询
  ├── CallbackPlugin             — 回调验签/事件识别
  ├── AuthPlugin                 — 认证头构建
  ├── WebhookPlugin              — Webhook 注册/注销/验证
  ├── TemplatePlugin<T>          — 模板CRUD
  ├── BusinessAccountPlugin      — WABA 账户管理
  ├── BusinessPhonePlugin        — 电话号码管理
  └── FlowPlugin                 — Flow 交互
```

### 8.2 各提供商插件实现矩阵

| SPI | Vonage | XCloud | Ada | NxCloud | YCloud |
|---|---|---|---|---|---|
| MessagePlugin | ✅ `VonageMessagePlugin` | ✅ `XCloudMessagePlugin` | ✅ (SDK) | ✅ (SDK) | ✅ (SDK) |
| CallbackPlugin | ✅ `VonageCallbackPlugin` | ✅ `XCloudCallbackPlugin` | ✅ (SDK) | ✅ (SDK) | ✅ (SDK) |
| AuthPlugin | ✅ `VonageAuthPlugin` | ✅ `XCloudAuthPlugin` | ✅ (SDK) | — | — |
| WebhookPlugin | ✅ `VonageWebhookPlugin` | ✅ `XCloudWebhookPlugin` | — | — | — |
| TemplatePlugin | ✅ `VonageTemplatePlugin` | ✅ `XCloudTemplatePlugin` | — | — | — |
| BusinessAccountPlugin | ✅ `VonageBusinessAccountPlugin` | ✅ `XCloudBusinessAccountPlugin` | — | — | — |
| BusinessPhonePlugin | ✅ `VonageBusinessPhonePlugin` | ✅ `XCloudBusinessPhonePlugin` | — | — | — |
| FlowPlugin | — | ✅ `XCloudFlowPlugin` | — | — | — |

### 8.3 CallbackHandler 注册机制

`CallbackProviderHandlerImpl.init()` 通过 Spring 自动注入所有 `CallbackHandler` Bean，注册到事件映射表：

```java
@PostConstruct
public void init() {
    handlerList.forEach(handler -> {
        handlerMap.put(handler.supportedEvent(), handler);
    });
}
```

`CallbackHandler` 接口：

```java
public interface CallbackHandler {
    CallbackEvent supportedEvent();     // 支持的事件类型
    void handle(AgentEnum providerCode, CallbackContext context);  // 处理逻辑
}
```

---

## 附录

### A. 关键配置项

| 配置 Key | 作用 | 默认值 |
|---|---|---|
| `rocketmq.config.whatsappCrmOtpCallbackConsumerTopic` | OTP 回调 MQ Topic | `whatsapp-crm-otp-callback-consumer` |
| `rocketmq.config.whatsappCrmNotOtpCallbackConsumerTopic` | 非 OTP 回调 MQ Topic | `whatsapp-crm-not-otp-callback-consumer` |
| `template.category.update` | 模板类别更新开关 | `false` |

### B. 关键数据表

| 表名 | 说明 | 关键字段 |
|---|---|---|
| `opay_message` | 消息记录 | `msg_id`, `business_phone`, `msg_status`, `business_type` |
| `message_template` | 消息模板 | `id`, `name`, `category`, `status`, `quality_rating` |
| `message_template_waba` | WABA 模板关联 | `agent_template_id`, `message_template_id`, `status` |
| `business_phone` | 业务号码 | `business_phone`, `waba_id`, `agent_name` |
| `waba_base` | WABA 基础信息 | `waba_id`, `provider` |
| `task_metric_score` | 任务指标评分 | `business_phone`, `score`, `config_id` |
| `template_metrics_snapshot` | 模板指标快照 | `template_id`, `snapshot_date`, `metrics` |
