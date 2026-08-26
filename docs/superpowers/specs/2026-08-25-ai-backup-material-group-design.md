# AI 备用素材模版 — 后端设计文档

## 1. 概述

### 1.1 背景

群发任务创建时，运营可手动配置备用素材模版。当主用素材模版发送消息失败且回调码为 `131049`、`130472` 时，在失败重试阶段切换到备用素材模版发送。

当前备用素材模版依赖运营手动创建和配置，工作量大且容易遗漏。本需求通过 AI 基于主用素材模版的运营采纳建议，自动生成备用素材模版（AI 备用素材组），在运营未手动配置备用组时，系统可自动关联 AI 备用素材组。

### 1.2 核心链路

```
运营创建主素材组 → 各泳道生成 AI body 建议 → 运营勾选采纳
    → 提交主素材组 → MQ 异步创建 AI 备用素材组（每个泳道 1 个）
    → 定时任务刷新稳定性评级缓存
    → 发送失败时，对方通过接口动态获取 AI 备用素材组（含评级门槛判断）
```

### 1.3 依赖关系

| 依赖 | 说明 |
|------|------|
| `AiMaterialSuggestion` | 运营已采纳的 AI body 建议（`feedbackType=ADOPT`） |
| RocketMQ | 异步创建消息 |
| `MessageMaterialCombination` | 组合复制与关联 |
| XXL-Job | 稳定性缓存刷新 + 创建补偿 |

---

## 2. 数据模型

### 2.1 `message_material_group` 新增字段

```sql
ALTER TABLE `message_material_group`
  ADD COLUMN `primary_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Associated primary material group ID, 0 for non-AI-backup',
  ADD COLUMN `ai_source_lane` varchar(50) DEFAULT '' COMMENT 'Source lane code, e.g. MARKETING_DEFAULT',
  ADD COLUMN `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Source type: 0=manual, 1=AI auto-generated';
```

**字段说明：**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `primary_group_id` | bigint(20) | 0 | 关联的主素材组 ID。0 表示非 AI 备用素材组（人工创建的主素材组或手动备用组） |
| `ai_source_lane` | varchar(50) | '' | 对应泳道编码，如 `MARKETING_DEFAULT`、`COLLECTION_CHAT` |
| `source_type` | tinyint(4) | 0 | 0=人工创建，1=AI 自动生成 |

**关联关系示例：**

```
主素材组 (id=100, source_type=0, primary_group_id=0, ai_source_lane='')
    ├── AI备用组 (id=200, source_type=1, primary_group_id=100, ai_source_lane='MARKETING_DEFAULT')
    └── AI备用组 (id=201, source_type=1, primary_group_id=100, ai_source_lane='COLLECTION_CHAT')
```

### 2.2 `message_material_combination` 新增字段

```sql
ALTER TABLE `message_material_combination`
  ADD COLUMN `primary_combination_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Associated primary combination ID, 0 for non-AI-backup',
  ADD COLUMN `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Source type: 0=manual, 1=AI auto-generated',
  ADD INDEX `idx_primary_combination_id` (`primary_combination_id`);
```

**字段说明：**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `primary_combination_id` | bigint(20) | 0 | 关联的主组合 ID。发送时权重大小分流通过此字段对映到主组合 |
| `source_type` | tinyint(4) | 0 | 0=人工创建，1=AI 自动生成 |

**关联关系示例：**

```
主组合 (id=10, primary_combination_id=0, source_type=0, material_group_id=100)
    └── AI备用组合 (id=20, primary_combination_id=10, source_type=1, material_group_id=200)
```

### 2.3 `ai_backup_material_update_log` 操作历史表（新建）

```sql
CREATE TABLE `ai_backup_material_update_log` (
  `id` bigint(20) unsigned AUTO_INCREMENT COMMENT 'Primary key',
  `primary_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Primary material group ID',
  `backup_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'AI backup material group ID',
  `ai_source_lane` varchar(50) DEFAULT '' COMMENT 'Source lane code',
  `operate_type` varchar(50) NOT NULL DEFAULT '' COMMENT 'Operation type: CREATE/UPDATE/ENABLE/DISABLE/DELETE',
  `trigger_source` varchar(50) NOT NULL DEFAULT '' COMMENT 'Trigger source: HOOK/MQ/JOB/MANUAL',
  `before_content` text COMMENT 'Content before change, JSON format',
  `after_content` text COMMENT 'Content after change, JSON format',
  `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Reserved for future use',
  `remark` varchar(1024) DEFAULT '' COMMENT 'Reserved for future use',
  `operator` varchar(128) DEFAULT '' COMMENT 'Operator',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_primary_group_id` (`primary_group_id`),
  KEY `idx_backup_group_id` (`backup_group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI backup material group update history log';
```

**字段说明：**

| 字段 | 说明 |
|------|------|
| `primary_group_id` | 主素材组 ID |
| `backup_group_id` | AI 备用素材组 ID |
| `ai_source_lane` | 泳道编码 |
| `operate_type` | 操作类型：`CREATE`（创建）、`UPDATE`（更新 body） |
| `trigger_source` | 触发来源：`HOOK`（埋点同步）、`MQ`（消息消费）、`JOB`（定时补偿） |
| `before_content` | 变更前内容（JSON） |
| `after_content` | 变更后内容（JSON） |
| `operator` | 操作人用户名 |

---

## 3. 配置项

### 3.1 Apollo `application` namespace 新增

| 配置 key | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `ai_backup.enabled` | Boolean | `false` | AI 备用素材组总开关 |
| `ai_backup.create_async` | Boolean | `false` | 异步创建开关 |
| `ai_backup.min_stability_level` | String | `B` | 最低可用稳定性评级 |
| `ai_backup.stability_rules` | String | `[]` | 稳定性评级规则 JSON 数组 |

### 3.2 Apollo RocketMQ 配置

| 配置 key | 值 | 说明 |
|----------|-----|------|
| `rocketmq.topic.aiBackupMaterialGroupCreate` | `ai_backup_material_group_create` | MQ Topic |
| `rocketmq.consumer.aiBackupMaterialGroupCreate.groupName` | `ai_backup_material_group_create_consumer` | MQ Consumer Group |

### 3.3 `ConfigConstant` 新增常量

```java
// AI backup material group
String AI_BACKUP_MATERIAL_GROUP_CREATE_TOPIC = "rocketmq.topic.aiBackupMaterialGroupCreate";
String AI_BACKUP_MATERIAL_GROUP_CREATE_CONSUMER_GROUP = "rocketmq.consumer.aiBackupMaterialGroupCreate.groupName";
```

### 3.4 `BusinessConfig` 新增字段

```java
@Value("${ai_backup.enabled:false}")
private Boolean aiBackupEnabled;

@Value("${ai_backup.create_async:false}")
private Boolean aiBackupCreateAsync;

@Value("${ai_backup.min_stability_level:B}")
private String aiBackupMinStabilityLevel;
```

---

## 4. 核心流程详解

### 4.1 创建 AI 备用素材组

#### 4.1.1 触发时机

运营在 `MessageMaterialGroupServiceImpl` 中创建/更新主素材组并提交。提交前，运营已对各泳道的 body 调用 AI 建议接口并勾选采纳（`feedbackType=ADOPT`）。

**前置条件：**
- 运营至少对某个泳道的 1 个 body 采纳了 AI 建议
- `ai_backup.enabled=true`
- `ai_backup.create_async=true`

#### 4.1.2 创建流程

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: Hook 埋点（MessageMaterialGroupServiceImpl.saveOrUpdate）      │
│   判断 ai_backup.enabled && ai_backup.create_async                     │
│   → 发送 RocketMQ 消息: { materialGroupId, operator }                  │
│   → 异常 catch 不抛，不影响主流程                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Step 2: MQ Consumer 消费                                              │
│   2.1 根据 materialGroupId 查询主素材组信息                             │
│   2.2 查询 AiMaterialSuggestion 表：                                   │
│       WHERE materialGroupId = ?                                       │
│         AND feedbackType = 2 (ADOPT)                                  │
│         AND status = 2                                                │
│       GROUP BY sourceLane                                             │
│   2.3 如果没有采纳记录 → 直接返回                                       │
│   2.4 按 sourceLane 分组，每个泳道独立处理：                             │
│       a. 检查是否已存在该泳道的 AI 备用组（primary_group_id + lane）     │
│          - 已存在 → 走更新逻辑（4.2）                                  │
│          - 不存在 → 走创建逻辑                                          │
│       b. 获取该泳道下所有已采纳的 body 建议列表                           │
│       c. 每个采纳的 body 找到其所在的原组合（通过 body materialId）       │
│       d. 从原组合复制 header/footer/buttons 素材内容，创建新素材记录     │
│       e. 用采纳的 AI body 建议内容创建新 body 素材记录                   │
│       f. 创建 message_material_combination 记录                        │
│          （每个采纳 body 对应 1 个组合）                                 │
│       g. 创建 AI 备用素材组（message_material_group）                   │
│          primary_group_id = 主素材组ID                                  │
│          ai_source_lane = 泳道编码                                      │
│          source_type = 1                                               │
│       h. 记录操作日志（ai_backup_material_update_log）                  │
│   2.5 MQ 消费异常 → 重试 + 记录日志，不影响其他泳道                       │
├─────────────────────────────────────────────────────────────────────┤
│ Step 3: XXL-Job 补偿（CreateAiBackupMaterialGroupJob）                 │
│   扫描 AiMaterialSuggestion 中 feedbackType=ADOPT 但未创建 AI 备用组的   │
│   记录，补偿创建。用于 MQ 消费失败或开关关闭期间的补偿。                   │
└─────────────────────────────────────────────────────────────────────┘
```

#### 4.1.3 传参示例

**MQ 消息体：**

```json
{
  "materialGroupId": 100,
  "operator": "admin@opay.com"
}
```

**采纳的 AI 建议查询结果示例：**

```
materialGroupId=100, sourceLane=MARKETING_DEFAULT:
  suggestionId=1001, body_original_combo_id=10, suggestedContent="最快当天到账..."
  suggestionId=1002, body_original_combo_id=12, suggestedContent="限时优惠，立即申请..."

materialGroupId=100, sourceLane=COLLECTION_CHAT:
  suggestionId=1003, body_original_combo_id=10, suggestedContent="请尽快还款..."
```

**创建结果：**

```
AI备用组 (id=200, primary_group_id=100, ai_source_lane='MARKETING_DEFAULT')
  ├── 组合 (id=20, primary_combination_id=10, body=最快当天到账...)
  └── 组合 (id=21, primary_combination_id=12, body=限时优惠，立即申请...)

AI备用组 (id=201, primary_group_id=100, ai_source_lane='COLLECTION_CHAT')
  └── 组合 (id=22, primary_combination_id=10, body=请尽快还款...)
```

### 4.2 新增 body 联动

运营在主素材组中新增 body 素材并采纳 AI 建议时，同步为对应泳道的 AI 备用组新增组合。

---

## 5. 稳定性评级（独立规则体系）

### 5.1 设计背景

原有 `MaterialGroupStabilityConfig`（`material.group.stabilityRules`）评级规则包含数量门槛，对 AI 备用素材组不适用。因此采用独立的评级规则 `AiBackupStabilityConfig`。

### 5.2 配置结构

**Apollo 配置 key：** `ai_backup.stability_rules`

**配置格式（JSON 数组）：**

```json
[
  {"level": "A", "condition": "utilityPercent >= 0.7", "reason": "Utility rate >= 70%, stable"},
  {"level": "B", "condition": "utilityPercent >= 0.5", "reason": "Utility rate >= 50%, relatively stable"},
  {"level": "C", "condition": "utilityPercent >= 0.3", "reason": "Utility rate >= 30%, acceptable"},
  {"level": "D", "condition": "true", "reason": "Utility rate < 30%, needs improvement"}
]
```

**SpEL 变量：** `utilityPercent`, `utilityCount`, `totalSentCount`, `avgScore`, `avgAiScore`

**评级比较规则：** A > B > C > D，按数组顺序匹配第一个满足条件的规则。

### 5.3 缓存

| 项 | 值 |
|----|-----|
| 缓存类型 | Redis |
| Key 格式 | `material_group_stability:{materialGroupId}` |
| TTL | 可配置，默认 30 分钟 |
| 刷新频率 | XXL-Job 每 10 分钟 |

---

## 6. 接口设计

### 6.1 Service 方法 — 获取 AI 备用素材组

供后端发送流程调用，非 HTTP 接口。方法签名：

```java
AiBackupMaterialGroupVO getAiBackupMaterialGroup(Long primaryGroupId, String laneCode);
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `primaryGroupId` | Long | 是 | 主素材组 ID |
| `laneCode` | String | 是 | 泳道编码 |

**返回 `AiBackupMaterialGroupVO`：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `backupGroupId` | Long | AI 备用素材组 ID |
| `backupGroupName` | String | AI 备用素材组名称 |
| `stabilityLevel` | String | 稳定性评级 (A/B/C/D) |
| `combinations` | List\<CombinationVO> | 组合列表，含 combinationId、primaryCombinationId、各部位 materialId |

**不可用时返回 null**（不存在、评级不达标等）。

### 6.2 素材组列表接口 — 过滤 AI 备用组

`POST /api/admin/material/listAll`（创建群发任务选择素材组）自动过滤 `source_type=1` 的 AI 备用组。

`POST /api/admin/material/page`（管理页面）不过滤，可正常查看 AI 备用组。前端无需改动。

---

## 7. RocketMQ 消息设计

| 项 | 值 |
|----|-----|
| Topic | `ai_backup_material_group_create`（通过 `rocketmq.topic.aiBackupMaterialGroupCreate` 配置） |
| Consumer Group | `ai_backup_material_group_create_consumer`（通过 `rocketmq.consumer.aiBackupMaterialGroupCreate.groupName` 配置） |

**消息体：**

```json
{
  "materialGroupId": 100,
  "operator": "admin@opay.com",
  "timestamp": 1724567890123
}
```

**Consumer：** `AiBackupMaterialGroupCreateConsumer`，通过 `@RocketMQMessageListener` 注解引用 `ConfigConstant` 常量。

---

## 8. XXL-Job 任务设计

| Job | 执行器 | 频率 | 说明 |
|-----|--------|------|------|
| `CreateAiBackupMaterialGroupJob` | job / job2-1-1 | 每 5 分钟 | 创建补偿 |
| `RefreshAiBackupStabilityCacheJob` | job / job2-1-1 | 每 10 分钟 | 缓存刷新 |

---

## 9. 异常处理与降级

| 场景 | 处理 |
|------|------|
| `ai_backup.enabled=false` | 所有功能不可用 |
| MQ 发送/消费失败 | 日志 + XXL-Job 补偿 |
| 采纳建议为空 | 跳过该泳道 |
| 素材复制失败 | 跳过该泳道 |
| Redis 缓存未命中 | 返回 D 级别 |

---

## 10. 代码结构

### 10.1 新增文件

```
whatsapp-crm-common/
  ConfigConstant.java                          # 新增 2 个 MQ 常量

whatsapp-crm-data/
  config/AiBackupStabilityConfig.java           # 独立稳定性规则配置
  service/AiBackupStabilityService.java         # 独立稳定性评级计算
  service/AiBackupMaterialGroupService.java     # AI 备用组 Service 接口
  service/impl/AiBackupMaterialGroupServiceImpl.java  # AI 备用组 Service 实现
  entity/po/AiBackupMaterialUpdateLog.java      # 操作历史 PO
  entity/dto/response/AiBackupMaterialGroupVO.java  # 查询响应 VO
  mapper/AiBackupMaterialUpdateLogMapper.java   # 操作历史 Mapper
  xxljob/CreateAiBackupMaterialGroupJobService.java   # 创建补偿 Job
  xxljob/RefreshAiBackupStabilityCacheJobService.java # 缓存刷新 Job

whatsapp-crm-api/

whatsapp-crm-mq/
  rocket/consumer/AiBackupMaterialGroupCreateConsumer.java  # MQ Consumer

whatsapp-crm-job/ + whatsapp-crm-job2-1-1/
  job/task/CreateAiBackupMaterialGroupJob.java     # XXL-Job 入口
  job/task/RefreshAiBackupStabilityCacheJob.java   # XXL-Job 入口
```

### 10.2 修改文件

```
MessageMaterialGroup.java              # PO 新增 3 字段
MessageMaterialCombination.java        # PO 新增 2 字段
MessageMaterialGroupService.java       # 接口新增 listAllForTaskSelection()
MessageMaterialGroupServiceImpl.java   # Hook 埋点 + listAllForTaskSelection() 实现
MessageMaterialController.java         # 新增 /listAllForTaskSelection 接口
BusinessConfig.java                    # 新增 3 配置项
```
