# 素材模版与群发任务创建流程梳理

> 说明：本文档梳理「素材模版创建 → 启用 → 自动生成消息模版 → 创建群发任务」的完整链路，覆盖涉及的表与字段、异步 Job/MQ、策略配置保存细节。

---

## 一、创建素材模版（素材组）流程

### 1.1 入口

`MessageMaterialController.create()` → `MessageMaterialGroupServiceImpl.create()`（`MessageMaterialGroupServiceImpl.java:380`）

请求 DTO：`MessageMaterialGroupCreateReqDTO`，包含素材组名称、语言、模版类型、组合模式（RANDOM/MANUAL）、车道配置、header/body/footer/buttons 素材列表等。

### 1.2 create() 主流程（同步事务）

整个方法标注 `@Transactional`，步骤如下：

1. **校验**
   - `validateMaterialGroupName` — 名称唯一性校验
   - `validateMaterial` — 素材内容合法性（如 example 不含中文等）
   - `validateCombinationMode` — 组合模式校验（RANDOM/MANUAL），MANUAL 须有 manualCombinations，禁止 MANUAL→RANDOM 切换
   - `validateLaneConfig` — 车道配置校验（车道 code 合法、预估发送量 > 0、无重复车道）

2. **保存素材组主表** `MessageMaterialGroup`
   - 状态设为 `NOT_ENABLED`
   - 写入 name / language / templateType / combinationMode 等

3. **保存素材元素** `messageMaterialService.insertBatch()`（`MessageMaterialServiceImpl.java:75`）
   - 按 header / body / footer / buttons 分别保存到 **MongoDB**（`MessageMaterial` collection）

4. **保存车道配置** `saveLaneConfig()` → `MessageMaterialGroupLane` 表

5. **生成素材组合**（写入 `MessageMaterialCombination` 表）
   - **MANUAL 模式**：`generateManualMaterialCombinations()` — 按用户手动指定的组合关系生成
   - **RANDOM 模式（默认）**：`generateMaterialCombinations()`（`:775`）— 对 header×body×footer×buttons 做**笛卡尔积**，生成全部组合

6. **异步 MQ：AI 标签提取** `tagExtractService.sendExtractTagMessage(materialGroupId)`（`TagExtractServiceImpl.java:278`）
   - 受 `businessConfig.getAiTagExtractConfig()` 开关控制
   - 向 RocketMQ topic `materialTagExtractConsumerTopic` 发送 `MaterialTagExtractMqMessage`
   - 消费者 `MaterialTagExtractConsumer` 调用 `tagExtractService.autoExtractAndBindTags()` 对素材文本调用 AI 提取关键词标签并绑定

### 1.3 涉及的表与存储

| 存储 | 表/集合 | 写入内容 |
|------|---------|----------|
| MySQL | `message_material_group` | 素材组主信息（name/language/templateType/combinationMode/status=NOT_ENABLED） |
| MongoDB | `message_material` | 素材元素（header/body/footer/buttons） |
| MySQL | `message_material_group_lane` | 车道配置（sourceLane/estimatedSendCount） |
| MySQL | `message_material_combination` | 素材组合（headerMaterialId/bodyMaterialId/footerMaterialId/buttonsMaterialId） |
| RocketMQ | `materialTagExtractConsumerTopic` | AI 标签提取消息 |

### 1.4 流程图

```
[创建素材组]
  Controller.create → Service.create
    ├─ 校验(名称/素材/组合模式/车道)
    ├─ 保存素材组主表(NOT_ENABLED)
    ├─ 保存素材元素(MongoDB)
    ├─ 保存车道配置
    ├─ 生成素材组合(笛卡尔积/手动) → Combination表
    └─ MQ → AI标签提取(异步)
```

---

## 二、素材组启用（Enable）与 Create 校验对比

### 2.1 enable() 校验内容

`MessageMaterialGroupServiceImpl.enable()`（`:2294`）共 3 项校验：

1. **素材组存在性** — `getById(id)` 为 null 则报 `DATA_NOT_EXIST`
2. **状态机合法性** — 当前状态必须是 `NOT_ENABLED` 或 `DISABLED`，否则报错
3. **车道配置已落库** — 查 DB `MessageMaterialGroupLane`，为空则报错

### 2.2 create() 校验内容

`create()`（`:380`）做 4 项校验，偏创建时结构正确性：

1. `validateMaterialGroupName` — 名称唯一性
2. `validateMaterial` — 素材内容合法性
3. `validateCombinationMode` — 组合模式合法性
4. `validateLaneConfig` — 车道配置 DTO 结构校验

### 2.3 对比表

| 维度 | create() | enable() |
|------|----------|----------|
| 名称唯一性 | ✅ 校验 | ❌ 不校验 |
| 素材内容合法性 | ✅ 校验 | ❌ 不校验 |
| 组合模式合法性 | ✅ 校验 | ❌ 不校验 |
| 车道配置 | 校验**入参 DTO**结构 | 校验**DB 已落库**非空 |
| 状态机合法性 | ❌（直接写 NOT_ENABLED） | ✅ 校验 |

**结论：两者不等价。** create 的校验保证"数据写对了"，enable 的校验保证"此刻可以激活"，二者互补。

### 2.4 为什么 create 不直接设为 ENABLED？

1. **业务流程是"草稿 → 审核 → 启用"**：创建后可能需要人工 review 素材内容、确认无误后再启用
2. **enable 是独立的显式动作**：服务于状态流转（`NOT_ENABLED/DISABLED → ENABLED`），disable 后再次启用也走同一路径
3. **enable 做"激活时点"校验**：检查此刻是否满足启用条件，create 只能保证创建时数据合法
4. **解耦创建与激活**：创建是重操作（写 MongoDB + 生成组合 + 发 MQ），激活是轻操作（改状态），分开后可独立重试、独立审计

---

## 三、消息模版创建（两条路径）

### 3.1 路径 A：手动创建模版（同步）

**入口**：`MessageTemplateController.createMsgTemplate()` → `MessageTemplateServiceImpl.createMsgTemplate()`（`MessageTemplateServiceImpl.java:207`）

1. 校验：example 不含中文、模版名称不重复、业务手机支持该 category、flow 模版只能选单个 waba
2. 保存 `MessageTemplate` 主表
3. 异步保存变更日志：`dataChangeLogService.asyncSaveTemplateChangeLog(..., CREATE, ...)`
4. 保存 `MessageTemplateWaba` 关联表，状态为 `WAITCREATE`（等待第三方创建）

> 详细流程参见 `docs/2026-08-04_message-template-create-flow.md`

### 3.2 路径 B：基于素材组自动创建模版（异步 Job）

**入口**：`CreateTemplateForLaneV2Job`（XXL-Job, handler=`createTemplateForLaneJobV2`）→ `CreateTemplateForLaneV2JobService.createTemplateForLaneJobV2()`（`:99`）

核心逻辑：

1. 获取需要执行的任务 ID 集合，过滤出**源模版**（`copyTemplateId` 为空的模版）
2. `tryCreateOnce()` → 遍历 `AutoTempConfig` 配置
3. `doMaterialGroupConfigIfNotFull()` → 按车道遍历，从**已启用的素材组**中按权重随机选取素材元素
4. `assembleTemplate()`（`:906`）→ 将 header/body/footer/buttons 组装成一个 `MessageTemplate`：
   - 名称 = 素材组名 + `l` 后缀 + 随机串
   - 状态 = `WAIT_ALL_SUBTEMPLATES_CREATE`
   - 记录 `materialGroupId` 和 `materialCombinationId`
   - body 文本调用 `shuffleEmojisWithFullPool()` 做表情打乱
5. `createMessageTemplate()`（`:832`）→ 保存模版（`copyTemplateId` 指向源模版，creator=`materialBack`）
6. `createMessageTemplateWaba()`（`:875`）→ 为各 waba 保存 `MessageTemplateWaba`（状态 `WAITCREATE`）

> 另有 `CreateTemplateForLevelJob`（按等级创建）走类似链路。

---

## 四、模版推送到第三方平台（异步 Job）

**入口**：`CreateMsgTemplateJob`（XXL-Job, handler=`createMsgTemplateJob`）→ `CreateMsgTemplateJobService.createMsgTemplateJob()`（`:70`）

1. 查询 `WAITCREATE` 状态的 `MessageTemplateWaba`
2. `doCreate()`（`:109`）：
   - `needRejectedPause()` — 若近期有被拒记录则暂停创建
   - 更新 waba 关联状态为 `RUNCREATE`
   - `opayManageService.createMessageTemplate()` — 调用第三方 API 创建模版
   - 回写 `agentTemplateId` 和审核状态；失败则飞书告警 `CREATEMSGTEMPLATEJOB_EXCEPTION`
3. 查询 `WAIT_ALL_SUBTEMPLATES_CREATE` 状态的 `MessageTemplate`，当所有子模版创建完成后更新主模版状态
4. 清理 Redis ZSet 中已提交的记录

---

## 五、后续相关 Job / MQ 汇总

| 类型 | 名称 | 作用 |
|------|------|------|
| MQ | `MaterialTagExtractConsumer` | 素材创建后异步 AI 提取标签 |
| 异步日志 | `asyncSaveTemplateChangeLog` | 模版创建/更新变更日志 |
| XXL-Job | `createTemplateForLaneJobV2` | 基于素材组自动生成消息模版 |
| XXL-Job | `createTemplateForLevelJob` | 按等级创建模版 |
| XXL-Job | `createMsgTemplateJob` | 将模版推送到第三方供应商创建 |
| XXL-Job | `refreshVonageTemplateStatusJob` / `refreshTemplateStatusJob` | 刷新模版审核状态 |
| XXL-Job | `deleteMsgTemplateJob` | 删除模版 |
| XXL-Job | `templateStabilityContentAnalysisJob` | 模版稳定性内容分析 |
| XXL-Job | `templateDisguiseSuggestionScanJob` | 模版伪装建议扫描 |

---

## 六、创建群发任务流程

### 6.1 入口

`TaskBaseController.createTask()` → `TaskBaseServiceImpl.createTask()`（`TaskBaseServiceImpl.java:230`）

请求 DTO：`TaskBaseSaveReqDTO`，核心字段包括任务名、业务类型、数据源、起止日期、车道、策略（strategy）、素材组ID、模版列表等。

### 6.2 createTask 主流程（同步）

```
createTask()
  ├─ 1. fillTemplateListViaMixStrategy()  — 混合策略时把 subTaskList 转成 templateList
  ├─ 2. validateForm()                    — 校验起止日期
  ├─ 3. validateTaskName()               — 校验任务名唯一
  ├─ 4. configStrategy.validateTask()    — 策略校验（按 strategy 分派）
  ├─ 5. validateDataSourceAndLane()      — 校验数据源与车道一致性
  ├─ 6. dto2taskBase() → insert task_base 表
  ├─ 7. setPredictedSendCount()          — 预估发送量写入 Redis
  └─ 8. configStrategy.initTaskStrategyConfig()  — 保存策略配置
```

### 6.3 保存到哪些表（通用部分）

#### task_base 表（TaskBase 实体）

通过 `ConvertUtil.dto2taskBase()` 转换后 insert，写入字段：

| 字段 | 说明 |
|------|------|
| `name` | 任务名 |
| `business_type` | 业务类型（OTP/MARKETING/NOTIFY 等） |
| `data_source` / `data_source_meta` | 数据源及元数据 |
| `start_date` / `end_date` / `push_start_time` | 执行时间范围 |
| `shield_rule` | 特殊日期屏蔽规则 |
| `tag_filter_expression` | 实时标签过滤表达式 |
| `lane_code` | 车道 |
| `message_template_id` | 消息模版ID（手动选模版时） |
| `template_waba_weight` | 模版waba权重 JSON（已废弃字段） |
| `schedule_status` | 调度状态，默认0（未启用） |
| `ds_strategy_type` / `ds_range` / `ds_header_degradation` | 数据源策略类型/范围/header降级 |
| `backup_ds_strategy_type` / `backup_ds_range` / `backup_ds_header_degradation` | 备用素材组的数据源策略 |
| `creator` / `ctime` / `updater` / `utime` | 审计字段 |

#### Redis：预估发送量

`setPredictedSendCount()` → key = `task:predictedSendCount:{taskId}`，value = 预估发送量。该值在素材模版数量校验时使用。

### 6.4 策略配置保存（按 strategy 分两条路径）

系统支持 4 种策略（`TemplateLoadbBalancingAlgorithmEnum`）：

- `WEIGHTED_ROUND_ROBIN` — 加权轮询
- `PRIORITY_ROUND_ROBIN` — 优先级轮询
- `PRIORITY_LOOP_WEIGHTED_ROUND_ROBIN` — 优先级分组加权轮询
- `AUTOMATIC_MATERIAL` — 自动素材策略

---

#### 路径 A：AUTOMATIC_MATERIAL（使用素材模版）

**校验** `AutomaticMaterialConfigStrategy.validateTask()`（`AutomaticMaterialConfigStrategy.java:87`）

| 校验项 | 说明 |
|--------|------|
| `materialGroupId` 非空 | 素材组ID必须传 |
| `validateBackupMaterialConfig` | 备用素材组配置校验（trafficSplit、不等于主素材组、组合权重匹配等） |
| `validateMaterialTemplateCount` | **模版数量是否足够**：按车道下所有关联任务的预估发送量总和 ÷ 2000 计算所需模版数，与该车道已 APPROVED 的模版数比较 |
| `trafficSplit` 非空 | 流量分配策略（RANDOM / WEIGHTED / CUSTOM_WEIGHT） |
| `canSendCombinations` 非空 | 素材组下可发送的组合不为空 |
| CUSTOM_WEIGHT 时校验 | 自定义权重列表 size = 可发送组合 size，且每个组合ID都有对应权重 |

**保存** `initTaskStrategyConfig()`（`:169`）— 写入 `task_sender_channel_config` 表

| 字段 | 内容 |
|------|------|
| `task_id` | 任务ID |
| `strategy` | `AUTOMATIC_MATERIAL` |
| `config` | JSON，结构为 `TaskChannelConfigModel`（见下） |
| `chat_robot` | 聊天机器人配置 |
| `end_chat_jump_link` | 结束跳转链接 |
| `traffic_split` | 流量分配策略 |
| `custom_combination_weight` | 自定义组合权重 JSON（CUSTOM_WEIGHT 时） |
| `deduplication_period` | 去重周期（天） |

config 字段 JSON 结构（`TaskChannelConfigModel`）：

```json
{
  "materialGroupId": 123,
  "backupMaterialConfig": {
    "materialGroupId": 456,
    "trafficSplit": "RANDOM",
    "customCombinationWeight": [{"i": 1, "w": 10}],
    "deduplicationPeriod": 7
  }
}
```

**额外操作：`syncMaterialGroupRelatedTasks()`**

调用 `messageMaterialGroupService.updateRelatedTasks()`（`:2525`），在 `message_material_group` 表的 `related_tasks` 字段（JSON）中写入/更新当前任务的引用（taskId + taskName）。更新时清除旧素材组的引用、添加新素材组的引用。实现了素材组 ↔ 任务的**双向关联**。

---

#### 路径 B：History 策略（WEIGHTED_ROUND_ROBIN / PRIORITY_ROUND_ROBIN / PRIORITY_LOOP_WEIGHTED_ROUND_ROBIN）

**校验** `HistoryConfigStrategy.validateTask()` — 校验模版数据（templateList 非空、优先级不重复等）

**保存** `initTaskStrategyConfig()` — 通过 `ConvertUtil.dto2TaskSenderChannelConfig()` 构建，写入 `task_sender_channel_config` 表

| 字段 | 内容 |
|------|------|
| `task_id` | 任务ID |
| `strategy` | 具体策略名 |
| `config` | JSON，`TaskChannelConfigModel`（见下） |
| `chat_robot` / `end_chat_jump_link` | 同上 |

config 字段 JSON 结构：

```json
{
  "circleNum": 1,
  "groupTemplateList": [
    {"templateId": "1", "agentTemplateId": "xxx", "wabaId": "123", "agent": "Vonage", "weight": 10, "priority": 1}
  ],
  "templateIdList": ["1", "2"]
}
```

不同策略对权重的处理：

- `PRIORITY_ROUND_ROBIN`：强制 `weight=10`
- `PRIORITY_LOOP_WEIGHTED_ROUND_ROBIN`：使用 `subTaskList` 分组结构
- `WEIGHTED_ROUND_ROBIN`：使用 `templateList` + weight

### 6.5 任务创建后的异步处理

任务创建本身**不直接触发 MQ 或 Job**，但启用调度（`setScheduleStatus`）后，以下异步链路会介入：

#### 调度启用

`TaskBaseController.setScheduleStatus()` → `TaskBaseServiceImpl.setScheduleStatus()`（`:454`）
- 设置 `schedule_status` 最低位为 1
- 如果停用，调用 `taskSubService.stopAllTodaySubTask()` 停止当天子任务

#### 数据拉取 Job（XXL-Job）

`TaskDataPullJob`（handler=`taskDataPullJob`）→ `TaskDataPullJobService.taskDataPullJob()`（`:38`）
- 查询当天需要执行的任务（`schedule_status=YES` 且日期范围内）
- 对文件导入类数据源，发送 MQ：`TaskDataPullEvent`
- 消费者 `TaskDataPullConsumer` 处理数据拉取

#### 子任务生成

`TaskSubServiceImpl.createTaskSub()`（`:139`）
- 为当天创建 `task_sub` 记录（taskId + taskDate）
- 初始化执行游标 `taskExecuteCursorHolder.updateCursorBeforeExecute()`

#### 消息发送

消息发送阶段通过 `ConfigStrategy.getTemplateAndBusinessPhone()` 选择模版和 BP：
- **AUTOMATIC_MATERIAL 策略**：从素材组组合中按权重/流量分配选一个组合 → 取对应 `MessageTemplate`
- **History 策略**：从 `groupTemplateList` 按权重/优先级选模版 → 再按权重选 BP

### 6.6 涉及的表与存储汇总

| 存储 | 表/Key | 写入内容 | 触发时机 |
|------|--------|----------|----------|
| MySQL | `task_base` | 任务主信息 | createTask |
| MySQL | `task_sender_channel_config` | 策略配置（config JSON + strategy + trafficSplit 等） | createTask |
| MySQL | `message_material_group` | `related_tasks` 字段更新（任务引用） | createTask（AUTOMATIC_MATERIAL 时） |
| Redis | `task:predictedSendCount:{taskId}` | 预估发送量 | createTask |
| MySQL | `task_sub` | 当天子任务 | 调度后 TaskDataPullJob 链路 |

### 6.7 群发任务流程图

```
[创建任务]
  TaskBaseController.createTask
    ├─ 校验(日期/名称/策略/数据源车道)
    ├─ 保存 task_base 表
    ├─ 预估发送量 → Redis
    └─ 策略配置保存:
        ├─ AUTOMATIC_MATERIAL:
        │   ├─ 校验(素材组/模版数量/组合/流量分配)
        │   ├─ 保存 task_sender_channel_config
        │   │   (config含materialGroupId + backupMaterialConfig)
        │   │   (trafficSplit + customCombinationWeight + deduplicationPeriod)
        │   └─ 更新 message_material_group.related_tasks
        │
        └─ History策略(WEIGHTED/PRIORITY/LOOP):
            ├─ 校验(模版数据/优先级)
            └─ 保存 task_sender_channel_config
                (config含groupTemplateList + circleNum)

[启用调度]
  setScheduleStatus → task_base.schedule_status = 1

[异步执行 - Job]
  TaskDataPullJob
    ├─ 查询当天任务 → 发MQ TaskDataPullEvent
    ├─ 消费者 → 创建 task_sub(当天子任务)
    └─ 消息发送 → 按策略选模版+BP → 发送
```

---

## 七、整体链路总览

```
[创建素材组](同步)
  → 保存素材组+素材元素(MongoDB)+车道+组合
  → MQ: AI标签提取(异步)

[启用素材组](同步)
  → 状态 NOT_ENABLED/DISABLED → ENABLED

[自动创建模版](XXL-Job: createTemplateForLaneJobV2)
  → 从已启用素材组选素材 → 组装MessageTemplate
  → 保存MessageTemplate + MessageTemplateWaba(WAITCREATE)

[手动创建模版](同步)
  → 保存MessageTemplate + MessageTemplateWaba(WAITCREATE)

[推送第三方](XXL-Job: createMsgTemplateJob)
  → 调第三方API创建模版 → 回写状态

[创建群发任务](同步)
  → 保存task_base + task_sender_channel_config
  → AUTOMATIC_MATERIAL时更新素材组related_tasks
  → 预估发送量写Redis

[启用调度](同步)
  → task_base.schedule_status = 1

[数据拉取](XXL-Job: taskDataPullJob)
  → 发MQ → 创建task_sub → 消息发送
```
