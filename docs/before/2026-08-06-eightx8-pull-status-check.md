# 8x8 状态拉取（pull）链路盘点：已有 job 入口与缺口

> 日期：2026-08-06
> 背景：8x8 状态变更是推拉结合。推（push）侧已全覆盖（入站 / 出站回执 / 模板变更 / 号码质量 / 账号更新 webhook 均已实现）；本文档盘点**拉（pull）侧**：哪些 job 入口已有、哪些缺失已新增、哪些实现了但 8x8 侧未接通。
> 进度：2026-08-06 已实现 **消息状态拉取（pullMsgStatusJob → get-chatapps-message-details，见 §6）** 与 **模板状态拉取（updateMsgTemplateJob → get-whatsapp-templates，见 §7）**。

---

## 1. Pull 通用链路（openplatform）

- 调度：xxl-job 入口（whatsapp-crm-job 模块 `job/job/task` 包）
- 路由：`unifiedProviderService.supportedAgent(agent, scene)` 为 true → 走 openplatform（`UnifiedProviderServiceImpl` → `QueryProviderHandler`）；否则走 legacy `AgentStrategy`
- 判断依据：Apollo `provider.{providerCode}.supportedScenes` 是否包含对应场景
- 8x8 场景声明（apollo）：`SEND_MESSAGE / TEMPLATE / BUSINESS_PHONE / BUSINESS_ACCOUNT / FLOW / MEDIA_DOWNLOAD / MESSAGE_STATUS_PULL / WEBHOOK` → 三类拉取都会被路由到 openplatform 分支

## 2. 已有 job 入口（无需新增）

| Job 名称（@XxlJob） | 入口类（whatsapp-crm-job） | 调用 Service | 拉取场景 |
| --- | --- | --- | --- |
| `pullMsgStatusJob` | `PullMsgStatusJob.java:18-20` | `PullMsgStatusJobService.pullMsgStatusJob()` | 消息状态拉取（MESSAGE_STATUS_PULL） |
| `updateMsgTemplateJob` | `UpdateMsgTemplateJob.java:19-22` | `UpdateMsgTemplateJobService.updateMsgTemplateJob(param)` | 模板状态拉取（TEMPLATE） |
| `refreshTemplateStatusJob` | `RefreshTemplateStatusJob.java:37-38` | 本地状态流转 + `queryProvider.getTemplateById(VONAGE,...)` | 模板状态刷新（当前 Vonage 专用） |
| `taskDataPullJob` | `TaskDataPullJob.java:18-20` | `TaskDataPullJobService.taskDataPullJob()` | 任务数据拉取/补偿 |

RefreshVonageTemplateStatusJob

## 3. 本次新增的 job 入口（原缺失）

- `SyncWabaStatusJob.java` → `@XxlJob("syncWabaStatusJob")` → `SyncWabaStatusJobService.syncWabaStatus()`
- `SyncWabaMetaStatusJob.java` → `@XxlJob("syncWabaMetaStatusJob")` → `SyncWabaMetaStatusJobService.syncWabaMetaStatus()`
- 说明：两个 Service 在 whatsapp-crm-data 已存在（内部已接 `supportedAgent(BUSINESS_ACCOUNT)` + `unifiedProviderService.getBusinessAccount`），此前无 xxl-job 入口，本次按 `PullMsgStatusJob` 风格补齐；编译已通过，未提交 git。

## 4. 8x8 未接通/缺失明细

| 拉取场景 | 调度 | openplatform 通用处理器 | 8x8 URL 配置 | 8x8 响应解析 | 现状 |
| --- | --- | --- | --- | --- | --- |
| 消息状态拉取 | ✅ job 入口 | ✅ `QueryProviderHandler.handelPullMessageStatus` | ✅ `retrieveMessage = /api/v1/subaccounts/%s/messages/%s`（本次配置） | ✅ `EightX8MessagePlugin#parseRetrieveStatusResult`（本次实现） | **已实现（2026-08-06）** |
| 模板状态拉取 | ✅ job 入口 | ✅ `listTemplates`（8x8 不走 `getTemplateById`） | ✅ apollo `listTemplates = /api/v1/accounts/%s/channels/%s/templates` | ✅ `EightX8TemplatePlugin#parseListTemplatesResult`（本次修正 data 包装+字段映射） | **已实现（2026-08-06）**，见 §7 |
| 业务账号/号码状态拉取 | ✅ 本次新增入口 | ✅ `getBusinessAccount` | ❌ apollo `businessAccount` 为空 | ⚠️ 有 webhook push 解析（phone_number_quality_update/account_update） | **未接通**（端点补齐后生效） |

## 5. 待办（未开始）

1. ~~8x8 消息状态拉取~~：已完成（2026-08-06），见 §6。
2. ~~8x8 模板状态拉取~~：已完成（2026-08-06），见 §7。
3. 8x8 业务账号状态拉取：补齐 `businessAccount` 端点与解析，使新增的 `syncWabaStatusJob` / `syncWabaMetaStatusJob` 对 8x8 生效。

---
（文档完）

---

## 7. 模板状态拉取实现记录（2026-08-06）

### 7.1 官方接口

- 接口：`get-whatsapp-templates` → `GET /api/v1/accounts/{accountId}/channels/{channelId}/templates`（Management API）
- 响应结构（官方 OpenAPI 确认）：
  ```json
  {
    "data": [
      {
        "channelId": "ec36a867-...",
        "channelName": "My WhatsApp instance",
        "templateName": "ticket_closed",
        "language": "en",
        "components": [...],
        "category": "UTILITY",
        "categoryName": "Utility",
        "status": "APPROVED",
        "statusName": "Approved",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
  ```
- **关键点**：8x8 模板无稳定 ID（响应只有 `templateName`，无 `id`）；8x8 无按模板 ID 单查接口（`get-template-by-id` 不存在）
- 状态枚举为全大写（`APPROVED / PENDING / REJECTED ...`），与本地 `TemplateStatusEnum` 一致，无需转换

### 7.2 改动文件（未提交 git）

| 文件 | 改动 |
| --- | --- |
| `EightX8TemplatePlugin.java` | `parseListTemplatesResult` 兼容官方 `data` 数组包装（同时保留裸数组兼容）；`parseSingleTemplate` 兼容 `templateName` 字段，无 `id` 时用模板名作为 templateId/键 |
| `UpdateMsgTemplateJobService.java` | `doUpdate` 对 EIGHTX8 走 `listTemplates` 全量拉回 + 按本地模板名匹配（不走 `getTemplateById`）；三个入口（pending/time/task）对 8x8 放开「必须有 agentTemplateId」限制；8x8 跳过 PENDING 超 12 小时自动删除；按 businessPhone 缓存当轮 list 结果避免同号码重复拉取 |

### 7.3 拉取与匹配逻辑

1. `isEligibleForTemplatePull`：EIGHTX8 恒为 true；其他 provider 仍需 `agentTemplateId` 非空（行为不变）
2. **批量处理策略**：`get-whatsapp-templates` 是**按 channel 一次返回全量模板**的批量接口，本次实现按 `businessPhone|wabaId` 做 job 级缓存（`eightX8TemplateListCache`），同一轮 job 内同一 channel 的多个待更新模板**只发一次 HTTP 拉取**；匹配与落库仍逐条：
   - `pullEightX8TemplateByList`：`unifiedProviderService.listTemplates(EIGHTX8, businessPhone, wabaId)` → 按本地 `message_template.name`（忽略大小写）在缓存的全量结果中匹配 8x8 `templateName`
   - 落库调 `updateTemplateStatus`（单条语义：保留写屏障防 webhook 冲突、模板创建完成通知、changelog 记录），不做多条合并 UPDATE
3. 匹配成功后：若本地 `agentTemplateId` 为空，先 `backfillAgentTemplateIdByTemplateName(templateName,...)` 回填（复用现有按名回填，限定 PENDING + EIGHTX8 + 空 id），再用 模板名/agentTemplateId 调 `updateTemplateStatus` 持久化状态
4. 状态映射：官方大写枚举直接入库；`qualityRating`、`subCategory` 官方 list 响应无该字段 → null，`updateTemplateStatus` 只更新 status/quality/category

### 7.4 为什么批量拉取但逐条落库

- 8x8 列表接口本身无增量/过滤参数（只能全量返回，且无模板 ID），「批量拉取」是必然形态，已通过缓存收敛为单次请求
- 每个本地模板记录更新需要触发独立副作用（写屏障防 webhook 冲突、模板创建完成通知、数据变更日志、模板分类映射），现有 `updateTemplateStatus(templateId, ...)` 以单条 agentTemplateId 为粒度，批量合并会丢失这些语义
- 若后续要减少 DB 操作，可另做「按 channel 一次比对 + 批量 updateById」的独立优化，不在本次范围内
- **更新限定（2026-08-06 增量）**：`updateTemplateStatus` 新增带 `businessPhone` 的重载，8x8 落库时按 `agentTemplateId + business_phone` 双条件过滤，并 `orderByDesc(id)` 取最新一条、按主键 id 更新，避免不同 channel 同名模板相互覆盖；原 5 参方法委托新方法（businessPhone 为空，行为兼容）。

### 7.5 兼容性说明

- 其他 provider（NXCLOUD/ADA/YCLOUD/GPI）走原 legacy 分支；VONAGE 模板刷新仍用 `refreshTemplateStatusJob`（getTemplateById），本次未触碰
- 官方无 id：匹配完全依赖模板名，重复同名模板（不同语言）会在首个匹配处返回；同名罕见，暂不做语言维度二次匹配
- 8x8 模板若无权拉取或 mapping 缺失 → `listTemplates` 返回空/解析失败 → job 记 warn 跳过，不脏更新
- 非 8x8 provider 的 `doUpdate` 链路保持原样（legacy 查询 → unified 覆盖），8x8 仅作为旁路分支接入，不影响原链路

### 7.6 上线前

- 线上 Apollo `provider.eightx8.listTemplates = /api/v1/accounts/%s/channels/%s/templates`（已存在于本地样例）
- `eightx8.account.mapping` 需包含该 channel 的 accountId（list URL 由 channelId 反查 accountId 构建）
- 验证：手动触发 `updateMsgTemplateJob`（或 `updateMsgTemplateJob pending`），观察日志 `updateTemplateJob 8x8 ...` 与 `updateTemplateStatus_templateWaba status changed`；模板名必须与 8x8 侧一致

### 7.7 遗留问题

- 8x8 `templateUpdateAlert` 飞书告警未接（eventMap 仅 NXCLOUD/YCLOUD/ADA，EIGHTX8 会打 Unknown agent 日志）
- 同名模板多语言（同一 templateName 不同 language）只按 name 匹配，未校验 language
- 模板删除后 8x8 侧不可复用同名模板 30 天（官方限制），本地删除逻辑未感知

---
（文档完）

---

## 6. 消息状态拉取实现记录（2026-08-06）

### 6.1 改动文件（未提交 git）

| 文件 | 改动 |
| --- | --- |
| `MessagePlugin.java` | SPI 新增默认方法 `resolveRetrievePathParams(businessPhone, config, messageId)`，默认返回空数组（其他 provider 行为不变） |
| `EightX8MessagePlugin.java` | 重写 `resolveRetrievePathParams`（channelId→Apollo 映射取 subAccountId + umid）；实现 `parseRetrieveStatusResult`；补齐 `parseAndFillPrice/parseAndFillCategory` 空实现 |
| `QueryProviderHandler.java` | `handelPullMessageStatus` 优先用插件返回的路径参数拼 URL（2 个占位符），无参数回退原逻辑（单参数） |
| `xcloud-apollo-config.properties` | 8x8 `retrieveMessage`：`""` → `/api/v1/subaccounts/%s/messages/%s`（本地样例，线上 Apollo 需同步） |

### 6.2 接口与参数

- 官方接口：`get-chatapps-message-details` → `GET /api/v1/subaccounts/{subAccountId}/messages/{umid}`
- 参数：`subAccountId`（`business_phone.app_key`(channelId) → `eightx8.account.mapping` 反查），`umid`（`opayMessage.getMsgId()`）
- 响应解析：`data[0].status.state`（经 `STATUS_MAPPING` 映射：`queued→sent`、`delivered→delivered`、`read→read`、`undelivered→failed` 等），`status.errorCode/errorMessage` 落入 `RetrieveStatusResult`

### 6.3 未做的部分

- 价格/计费：响应无 pricing 字段，仅初始化空 `PricingInfo` 防 NPE，不回填价格
- 模板分类：`parseAndFillCategory` 留空
- 批量对账：`messages/exports` 异步导出未接入（本次只做单条）
- `key`/简单的 `detail/timestamp/contentType` 未单独取值（原始 body 已在 `third_status_extra`）

### 6.4 兼容性说明

- 其他 provider（Vonage/XCloud/YCloud/NxCloud）不重写 SPI 默认方法 → 拉取 URL 行为不变
- 8x8 无 mapping 或未知状态时：返回空参数 / `systemError` / `error`，handler 记 warn 跳过，不脏更新
- 状态映射复用回调链路 `STATUS_MAPPING`，拉取与 webhook 语义一致
- `result.getPricingInfo()` 保证非空，避免 handler `getTotalPrice()` NPE（与其它 provider 共用）

### 6.5 上线前

- 线上 Apollo `provider.eightx8` 需同步 `retrieveMessage = /api/v1/subaccounts/%s/messages/%s`，且 `eightx8.account.mapping` 已配置（否则拉取回退单号 URL，不生效）
- 验证：手动触发 `pullMsgStatusJob`，观察日志 `handelPullMessageStatus msg_id:... rawStatus:... mappedStatus:...`；状态推进与回执 `updateMessageStatus` 一致

---
（文档完）

---

## 8. 三个模板状态 job 对比（updateMsgTemplateJob / refreshTemplateStatusJob / refreshVonageTemplateStatusJob）

> 结论先行：**8x8 只走第 1 个 `updateMsgTemplateJob`**（`UpdateMsgTemplateJobService.doUpdate` 内 EIGHTX8 分支 → `listTemplates` 全量 + 按模板名匹配）；后两个是 VONAGE 专用，8x8 不参与。

| 维度 | updateMsgTemplateJob | refreshTemplateStatusJob | refreshVonageTemplateStatusJob |
| --- | --- | --- | --- |
| 模块 / 注解 | whatsapp-crm-job `@XxlJob`；whatsapp-crm-job2-1-1 旧版 `@JobHandler`（同一 Service） | whatsapp-crm-job `@XxlJob` | whatsapp-crm-job2-1-1 旧版 `@JobHandler` |
| 核心逻辑 | `UpdateMsgTemplateJobService.updateMsgTemplateJob(param)` | `RefreshTemplateStatusJob#refreshTemplateStatusJob` | `RefreshVonageTemplateStatusJob#execute` |
| 目标 provider | 全部 agent（NXCLOUD/ADA/YCLOUD/GPI legacy；EIGHTX8 → listTemplates 按名匹配；其他 unified → getTemplateById） | VONAGE 专用 | VONAGE 专用 |
| 覆盖范围 | `param=pending`：仅 PENDING；默认：近 4 天任务涉及模板 + 10 天内更新过且状态∈{APPROVED/PENDING/FLAGGED/CREATEFAIL/PAUSED}，去重 | 仅 PENDING 且 agentTemplateId 非空、utime 在过去 60 秒窗口内 | 全部 VONAGE 的 wabaId（无时间窗口，全量对账） |
| 拉取方式 | 8x8：`listTemplates` 全量 + 按本地模板名匹配；其他：`getTemplateById` / legacy | waba 分组后逐条 `queryProvider.getTemplateById(VONAGE, wabaId, agentTemplateId)` | 每个 waba `queryProvider.listTemplates(VONAGE, null, wabaId)` 全量，按模板名 + 语言匹配 |
| 更新方式 | `updateTemplateStatus`（模板 waba 表，含写屏障/changelog/创建完成通知）；8x8 限定 business_phone 且按 ID 最新一条；飞书告警 | `updateMessageTemplateInfo` + `updateMessageTemplateStatus`（主表+waba 表）+ `updateTemplateCategory` | `updateMessageTemplateStatus`（主表）+ `updateTemplateStatusAndSetBarrier`（waba 表，带写屏障） |
| 批次/限制 | rateLimiter 限速；8x8 按 businessPhone 缓存当轮 list | ID 游标分批 limit 100，最长运行 30 分钟 | 简单遍历 wabaId 集合 |
| 定位 | 通用统一对账/补偿（低频） | 短窗口增量补偿（高频，盯新提交的 VONAGE 模板） | 全量对账（中低频） |

补充说明：

- 8x8 模板状态拉取**只依赖第 1 个 job**；`param=pending` 可单独把 PENDING 模板快速拉起。
- 第 2、3 个 job 功能重叠（都在拉 VONAGE 模板状态），且分属 whatsapp-crm-job / whatsapp-crm-job2-1-1 两个模块，建议确认线上实际启用的是哪个，避免重复调度。

---
（文档完）
