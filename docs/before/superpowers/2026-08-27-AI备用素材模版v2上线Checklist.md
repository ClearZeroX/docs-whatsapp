# AI 备用素材模版 v2 上线 Checklist

> 功能：同步创建 AI 备用素材模版（body copy 主用）+ 异步替换 body（AI 生成完成后替换）
>
> 技术方案：`2026-08-27-AI备用素材模版v2-同步创建与异步替换body完整技术方案.md`

---

## 一、数据库变更（DDL）

> ⚠️ 必须在应用部署前执行完成。

| # | 类型 | 内容 | 状态 |
|---|---|---|---|
| 1 | ALTER | `message_material_group` 新增 `primary_group_id`、`source_type`、`ai_suggest_type` 字段 | ☐ |
| 2 | ALTER | `message_material_group.name` 扩展为 `varchar(255)` | ☐ |
| 3 | ALTER | `message_material_combination` 新增 `primary_combination_id`、`source_type` 字段 | ☐ |
| 4 | ALTER | `message_material_combination` 新增 `idx_primary_combination_id` 索引 | ☐ |
| 6 | CREATE | 新建表 `ai_backup_material_update_log` | ☐ |
| 7 | 确认 | 确认 `ai_material_suggestion` 表的 `status` 字段已有 `tinyint(4)`，注释更新为 5 个值（1/2/3/4/5） | ☐ |
| 8 | 确认 | 确认 `ai_material_suggestion` 表已有 `idx_material_id` 索引（用于 `listAiBackupMaterials` 按 `materialId` 查询） | ☐ |

SQL 脚本路径：`doc/sql/ai_backup_material_group.sql`

```
-- AI backup material group DDL
-- Adjust message_material_group name length
ALTER TABLE `message_material_group`
  MODIFY COLUMN `name` varchar(255) NOT NULL DEFAULT '' COMMENT 'Material group name';

-- Add columns to message_material_group
ALTER TABLE `message_material_group`
  ADD COLUMN `primary_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Associated primary material group ID, 0 for non-AI-backup material groups',
  ADD COLUMN `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Source type: 0=manual, 1=AI auto-generated',
  ADD COLUMN `ai_suggest_type` varchar(50) NOT NULL DEFAULT '' COMMENT 'AI suggest type from SuggestTypeEnum, including AI_BACKUP_MATERIAL_GROUP';

-- Add columns to message_material_combination
ALTER TABLE `message_material_combination`
  ADD COLUMN `primary_combination_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Associated primary combination ID, 0 for non-AI-backup',
  ADD COLUMN `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Source type: 0=manual, 1=AI auto-generated',
  ADD INDEX `idx_primary_combination_id` (`primary_combination_id`);
  
alter table ai_material_suggestion
    modify  `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'record status: 1 accepted for AI backup, 2 not accepted for AI backup, 3 generation failed, 4 applied_to_ai_backup, 5 applied_to_ai_backup_failed';

-- Create ai_backup_material_update_log table
CREATE TABLE IF NOT EXISTS `ai_backup_material_update_log` (
  `id` bigint(20) unsigned AUTO_INCREMENT COMMENT 'Primary key',
  `primary_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Primary material group ID',
  `backup_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'AI backup material group ID',
  `ai_suggest_type` varchar(50) NOT NULL DEFAULT '' COMMENT 'AI suggest type from SuggestTypeEnum, including AI_BACKUP_MATERIAL_GROUP',
  `operate_type` varchar(50) NOT NULL DEFAULT '' COMMENT 'Operation type: CREATE/UPDATE/ENABLE/DISABLE/DELETE',
  `trigger_source` varchar(50) NOT NULL DEFAULT '' COMMENT 'Trigger source: SYNC/JOB',
  `before_content` text COMMENT 'Content before change, JSON format',
  `after_content` text COMMENT 'Content after change, JSON format',
  `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Reserved for future use',
  `remark` varchar(1024) NOT NULL DEFAULT '' COMMENT 'Reserved for future use',
  `operator` varchar(128) NOT NULL DEFAULT '' COMMENT 'Operator',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_primary_group_id` (`primary_group_id`),
  KEY `idx_backup_group_id` (`backup_group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI backup material group update history log';

```

Todo: 确认索引

---

## 二、Apollo 配置变更

> ⚠️ 可在应用部署前或部署中配置，但必须在功能开启前完成。

### 2.1 开关配置

| # | key | 值 | 说明 | 状态 |
|---|---|---|---|---|
| 3 | `ai_backup.enabled` | `true` | AI 备用素材模版总开关 | ☐ |
| 4 | `ai_backup.sync_create_enabled` | `true` | 主素材模版提交后同步创建 AI 备用素材模版开关 | ☐ |
| 5 | `ai_backup.min_stability_level` | `B`（或按产品要求） | 发送链路可使用 AI 备用素材模版的最低稳定性评级 | ☐ |

### 2.1.1 稳定性统计 Redis 链路配置

| # | key | 默认值 | 说明 | 状态 |
|---|---|---|---|---|
| 2 | `material.group.stability.redisSwitch` | `false` | 新稳定性统计 Redis 链路开关；打开后 `batchFillMaterialTemplateStabilityStat` 优先读 Redis，miss 时实时计算并回写 Redis | ☐ |
| 3 | `material.group.stability.redisRefreshDays` | `14` | Job 刷新非 AI_SOURCE 素材组的时间范围，按 `utime` 倒序；AI 备用组全量刷新 | ☐ |
| 4 | `material.group.stability.redisCacheMinutes` | `30` | 稳定性统计 Redis 缓存 TTL（分钟） | ☐ |
| 8 | `ai_backup.stability_rules` | AI 备用素材组规则 JSON | AI 备用素材组稳定性评级规则，使用 `utilityPercent`、`historyUtilityPercent` 等变量；服务入参已与普通规则统计上下文对齐 | ☐ |

Redis Key：

| Key | Value | 说明 |
|---|---|---|
| `material_group_stability:{materialGroupId}` | `MaterialGroupTemplateStatsVO` JSON | 通用素材组统计缓存，包含当前/历史统计和 `stabilityLevel`；AI 备用组按备用素材组 ID 写入 |

查询顺序：`getAiBackupMaterialGroup` 先按主素材组 ID 查询备用素材组，再按备用素材组 ID 读取稳定性统计缓存。

### 2.2 批量生成配置

| # | key | 值 | 说明 | 状态 |
|---|---|---|---|---|
| 6 | `ai_suggestion.batch_generate_size` | `5` | 单次 LLM 批量生成最多条数 | ☐ |
| 7 |                                     |      |                           |      |
|      |                                     |      |                           |      |

新增AI_BACKUP_MATERIAL_GROUP 类规则



### 2.3 Prompt 配置

| # | key | 值 | 说明 | 状态 |
|---|---|---|---|---|
| 9 | `ai_suggestion.system_prompt` | 确认已配置 | 单条/批量共用 system prompt | ☐ |
| 10 | `ai_suggestion.user_prompt_template` | 确认已配置 | 单条生成 user prompt 模板 | ☐ |
| 11 | `ai_suggestion.batch_user_prompt_template` | **新增配置** | 批量生成 user prompt 模板 | ☐ |
| 12 | `ai_suggestion.batch_system_prompt` | **新增配置** | 批量生成 system prompt（不配则复用 `ai_suggestion.system_prompt`，但输出格式需为 JSON 数组，**建议单独配置**） | ☐ |

---

  **`ai_suggestion.batch_system_prompt` 完整值：**

  ```text
  你是一位 WhatsApp UTILITY 模版内容伪装专家。

  核心策略：Keep MARKETING Purpose, Wear UTILITY Skin。
  将营销话术包装为系统自动通知/账户事务公告，保留业务意图但消除营销感知。

  背景：
  - Meta 会检测并降级 MARKETING 风格的模版，导致失去 UTILITY 发送配额和更高的消息频率
  - 你需要将内容调整为 UTILITY 风格（服务通知、事务性消息）以通过 Meta 审核，同时保持用户转化效果

  伪装策略：
  1. 用"系统通知/状态更新/额度提醒/账户变更"替代"促销/优惠/活动"等营销话术
  2. 将祈使句（"快来领取/立即申请"）改为陈述句（"系统已为您准备/已生效"），将行动号召隐含在信息告知中
  3. 保留核心利益点（额度、利率、时效）但用通知口吻表述
  4. 禁止商业折扣、限时抢购、抽奖活动等明显促销表述
  5. 修改变量/按钮文案为业务操作语（如"查看状态"而非"立即购买"）

  规则优先级：
  - Red-line Rules（must not violate）：绝对不能违反的合规红线
  - Constraint Rules（must satisfy）：必须满足的条件约束
  - Positive Suggestions（recommended direction）：推荐的伪装改写方向
  - Reference Information（for reference only）：参考范例

  你将收到多条素材内容，需要逐条进行伪装改写。

  输出要求：
  - 输出语言与每条原始内容语言保持一致
  - 输出纯 JSON 数组，不含 markdown 标记或 thinking 标签
  - 输出内容长度必须在原文的 ±10% 范围内，超过视为不合格
  - 规则仅用于指导生成，规则中的监管声明、免责声明等文字不得直接追加到输出内容中
  - 如有 userFeedback，必须在本次伪装中体现
  - 原内容中不含OJK相关说明时，生成的内容中也不能包含OJK合规监管声明、费用构成说明与免责条款，OJK规则仅用于约束
  - 保留所有 WhatsApp 模版变量（如 {{1}}、{{2}}）
  - 返回的数组长度必须与输入的 items 数组长度一致
  - 每个元素的 clientMaterialKey 必须与输入一一对应

  输出格式（纯 JSON 数组）：
  [
    {
      "clientMaterialKey": "对应的 clientMaterialKey",
      "suggestedContent": "伪装后的 UTILITY 风格内容",
      "score": 0.00-5.00,
      "scoreReason": "评分理由，简述生成策略即可，不要过长"
    }
  ]
  ```

---

  **`ai_suggestion.batch_user_prompt_template` 完整值：**

  ```text
  请将以下多条素材部位内容批量伪装为 UTILITY 风格：

  【规则】
  {ruleSnapshot}

  【原始内容】
  类型：{materialType}
  内容列表：
  {items}

  请根据以上信息，为每条内容生成伪装后的 UTILITY 风格内容，并给出自评分与理由。
  ```

---

  **`{items}` 实际替换后的结构示例：**

  ```json
  [
    {
      "clientMaterialKey": "body-key-1",
      "content": "原始 body 内容1",
      "lastSuggestedContent": "上次伪装结果1",
      "userFeedback": "用户反馈1"
    },
    {
      "clientMaterialKey": "body-key-2",
      "content": "原始 body 内容2",
      "lastSuggestedContent": "",
      "userFeedback": ""
    }
  ]
  ```

---

  **与单条 prompt 对照：**

  | 维度 | 单条 `user_prompt_template` | 批量 `batch_user_prompt_template` |
  |---|---|---|
  | 输入方式 | `{originalContent}` / `{lastSuggestedContent}` / `{userFeedback}` 分别替换 | `{items}` 一次性传入 JSON 数组 |
  | 输出格式 | 单个 JSON 对象 | JSON 数组，每个元素额外带 `clientMaterialKey` |
  | system prompt | `ai_suggestion.system_prompt`（输出单个 JSON） | `ai_suggestion.batch_system_prompt`（输出 JSON 数组，**建议单独配置**） |
  | 占位符 | `{ruleSnapshot}` / `{materialType}` / `{originalContent}` / `{lastSuggestedContent}` / `{userFeedback}` | `{ruleSnapshot}` / `{materialType}` / `{items}` |
| 12 | `ai_suggestion.batch_system_prompt` | 可选 | 批量专用 system prompt（不配则复用 `system_prompt`） | ☐ |

### 2.4 稳定性评级配置

| # | key | 值 | 说明 | 状态 |
|---|---|---|---|---|
| 13 | `ai_backup.stability_rules` | JSON 数组 | AI 备用素材模版稳定性评级规则 | ☐ |

配置:

```
```



---

## 三、XXL-Job 配置

> ⚠️ 部署后在 XXL-Job 管理后台注册以下 Job。

| # | Job 名称 | 说明 | Cron 建议 | 状态 |
|---|---|---|---|---|
| 1 | `CreateAiBackupMaterialGroupJob` | AI 备用素材模版创建补偿（支持传 `materialGroupId` 参数手动触发） | 按需，或不设定时只手动触发 | ☐ |
| 2 | `ApplyAiBackupBodyJob` | **新增**：body 替换补偿（扫 `status IN (1,5)` 重新执行替换） | 建议 5 分钟一次 | ☐ |
| 3 | `RefreshMaterialGroupStabilityCacheJob` | AI 备用素材模版稳定性评级缓存刷新 | 按现有配置 | ☐ |
| 4 | `TemplateStabilityContentAnalysisJob` | 素材模版稳定性内容分析 | 按现有配置 | ☐ |

> 注意：`whatsapp-crm-job` 和 `whatsapp-crm-job2-1-1` 两个模块都注册了相同的 Job handler，确认 XXL-Job 执行器指向正确。

---

## 四、MongoDB 确认

| # | 确认项 | 状态 |
|---|---|---|
| 1 | `message_material` 集合中 AI 备用 body 的 `element` 已新增 `source_type` 字段（值为 `1`） | ☐ |
| 2 | `message_material` 集合中主用 body 的 `element` 不写 `source_type`（保持 `null`） | ☐ |
| 3 | body 替换时 `element.text` 更新正常（`MongoTemplate.updateFirst`） | ☐ |



---

## 六、部署顺序

> 

---

## 七、上线后验证

### 7.1 基础验证

| # | 验证项 | 预期结果 | 状态 |
|---|---|---|---|
| 1 | 调用 `POST /api/admin/ai-suggestion/generate`（不传 sourceLanes） | 正常生成，`source_lane=''`，不报错 | ☐ |
| 2 | 调用 `POST /api/admin/ai-suggestion/generate`（传 sourceLanes） | 按泳道生成，白名单校验正常 | ☐ |
| 3 | 调用 `POST /api/admin/ai-suggestion/batchGenerate` | 异步生成成功，插入 `status=1` 记录 | ☐ |
| 4 | 调用 `POST /api/admin/ai-suggestion/backup-material/listAiBackupMaterials` | 返回 `totalCount`/`successCount`，items 展示枚举名 | ☐ |
| 5 | 调用 `POST /api/admin/ai-suggestion/feedback` | 只更新反馈字段，不更新 `status` | ☐ |
| 6 | 调用 `POST /api/admin/material/listAll` | 不返回 AI 备用素材模版（`ai_suggest_type=AI_BACKUP_MATERIAL_GROUP`） | ☐ |

### 7.2 核心链路验证

| # | 验证项 | 预期结果 | 状态 |
|---|---|---|---|
| 7 | 创建主素材模版 | 同步创建 AI 备用素材模版，body=copy 主用 body，`source_type=1` | ☐ |
| 8 | 编辑主素材模版组合方式 | AI 备用素材模版 `combination_mode` 同步更新 | ☐ |
| 9 | 新增 body | AI 备用素材组合同步新增 | ☐ |
| 10 | `batchGenerate` 成功后 | `status=1` → 同线程触发 `applyAiBackupBody` → `status=4` | ☐ |
| 11 | `applyAiBackupBody` 前置条件不满足 | 保持 `status=1`，不报错 | ☐ |
| 12 | `message_material.element.text` 替换 | AI 备用 body 的 `element.text` = AI 生成内容 | ☐ |
| 13 | `message_template.components` BODY 替换 | 若 template 已存在，BODY 组件 `text` 更新 | ☐ |
| 14 | 开关 `ai_backup.enabled=false` | 主素材模版正常返回 ID，不创建 AI 备用 | ☐ |
| 15 | 开关 `ai_backup.sync_create_enabled=false` | 主素材模版正常返回 ID，不创建 AI 备用 | ☐ |
| 16 | 同步创建异常 | 主素材模版正常返回 ID，日志记录异常 | ☐ |

### 7.3 Job 验证

| # | 验证项 | 预期结果 | 状态 |
|---|---|---|---|
| 17 | `CreateAiBackupMaterialGroupJob`（传 `materialGroupId`） | 补偿生成 AI 备用素材模版 | ☐ |
| 18 | `ApplyAiBackupBodyJob` 执行 | 扫描 `status IN (1,5)` 记录，执行替换，成功→4，失败→5 | ☐ |
| 19 | `ApplyAiBackupBodyJob` 幂等性 | 重复执行不报错，`status=4` 的不被重复处理 | ☐ |
| 20 | `RefreshMaterialGroupStabilityCacheJob` | 稳定性评级缓存正常刷新 | ☐ |

### 7.4 发送链路验证

| # | 验证项 | 预期结果 | 状态 |
|---|---|---|---|
| 21 | 发送时查询 AI 备用素材模版 | `getAiBackupMaterialGroup(primaryGroupId, aiSuggestType)` 正常返回 | ☐ |
| 22 | 稳定性低于阈值 | 返回 `null`，不使用 AI 备用 | ☐ |
| 23 | 主用发送失败切换备用 | 正常切换到 AI 备用素材模版 | ☐ |

---

## 八、状态枚举速查

| status | 枚举名 | 含义 | successCount 计入？ |
|---:|---|---|---|
| 1 | `ACCEPTED_FOR_AI_BACKUP` | 生成成功，待替换 body | ✅ 是 |
| 2 | `NOT_ACCEPTED_FOR_AI_BACKUP` | 不接受用于 AI 备用 | ❌ 否 |
| 3 | `GENERATION_FAILED` | 生成失败（suggested_content=主用 body） | ✅ 是 |
| 4 | `APPLIED_TO_AI_BACKUP` | 替换 body 成功 | ✅ 是 |
| 5 | `APPLIED_TO_AI_BACKUP_FAILED` | 替换 body 失败 | ✅ 是 |

Job 补偿范围：`status IN (1, 5)`

---

## 九、回滚方案

| 场景 | 回滚动作 |
|---|---|
| 功能异常需紧急关闭 | Apollo 设置 `ai_backup.enabled=false` + `ai_backup.sync_create_enabled=false`，主流程不受影响 |
| 接口路径变更导致前端报错 | 前端回滚到旧路径 `/backup-material/status`（需确认前端是否已同步更新） |
| MQ Consumer 删除后残留消息 | 无影响，Consumer 已删除不会消费；如需恢复可重新部署旧版本 |
| DDL 不可逆 | 新增字段均有默认值，不影响现有数据；如需回滚应用版本，新字段保持默认值即可 |

---

## 十、注意事项

1. **前端联动**：接口路径从 `/backup-material/status` 改为 `/backup-material/listAiBackupMaterials`，请求参数从 `clientMaterialKeys` 改为 `materialIdList`，响应去掉 `failedCount`/`processingCount`，`items[].status` 改为枚举名展示——**前端需同步上线**。
2. **`OpayTemplateComponent.source_type`**：该类位于 `whatsapp-agent-sdk`，新增字段后下游消费方需兼容 `null` 值（主用素材不写该字段）。
3. **批量 Prompt**：`ai_suggestion.batch_user_prompt_template` 必须在功能开启前配置，否则 `batchGenerate` 会插入失败记录（`status=3`）。
4. **AI 生成失败时**：`suggested_content` 写入主用 body 内容（不再是 `Generation failed`），`status=3`。
7. **并发**：实时触发与 Job 补偿可能并发处理同一条记录，body 替换幂等，不引入锁。
