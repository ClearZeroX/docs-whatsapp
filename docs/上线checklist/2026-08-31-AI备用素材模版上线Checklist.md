# AI 备用素材模版上线 Checklist

> 分支：`feature/zlc/0826-ai-backup-material`  
> 基准：`master`  
> 说明：只包含本次分支新增或变更的 DDL、Apollo 配置、XXL-Job、部署与验证事项。

---

## 1. 数据库变更

> 建议在应用部署前完成。

| # | 类型 | 内容 | 环境 | 状态 |
|---|---|---|---|---|
| 1.1 | ALTER | `message_material_group.name` 扩展为 `varchar(255)` | 测试 | ☐ |
| 1.2 | ALTER | `message_material_group` 新增 `primary_group_id`、`source_type`、`ai_suggest_type` | 测试 | ☐ |
| 1.3 | ALTER | `message_material_combination` 新增 `primary_combination_id`、`source_type` | 测试 | ☐ |
| 1.4 | INDEX | `message_material_combination` 新增 `idx_primary_combination_id` | 测试 | ☐ |
| 1.5 | MODIFY | `ai_material_suggestion.status` 注释更新为 AI 备用状态语义 | 测试 | ☐ |
| 1.6 | CREATE | 创建 `ai_backup_material_update_log` 表 | 测试 | ☐ |
| 1.7 | 确认 | `ai_material_suggestion` 已有 `uk_client_material_seq` 唯一键和 `idx_material_id` 索引 | 测试 | ☐ |
| 1.8 | 同步 | 将 1.1 至 1.6 在预发环境执行 | 预发 | ☐ |
| 1.9 | 同步 | 将 1.1 至 1.6 在生产环境执行 | 生产 | ☐ |

SQL 脚本：

```text
doc/sql/ai_backup_material_group.sql
doc/sql/ai_material_suggestion.sql
```

---

## 2. Apollo 配置变更

> 只包含本次分支新增配置。  
> 未列出的既有配置不代表不需要检查，上线前应确认当前环境已有值满足依赖。

### 2.1 AI 备用素材开关

| # | key | 建议值 | 说明 | 环境 | 状态 |
|---|---|---|---|---|---|
| 2.1.1 | `ai_backup.enabled` | 先 `false`，灰度打开 `true` | AI 备用素材总开关 | 测试 | ☐ |
| 2.1.2 | `ai_backup.sync_create_enabled` | `true` | 主素材模版保存后同步创建/更新备用素材组 | 测试 | ☐ |
| 2.1.3 | `ai_backup.min_stability_level` | `B` 或按产品要求 | 发送侧可使用备用组的最低稳定性等级 | 测试 | ☐ |

### 2.2 批量生成配置

| # | key | 建议值 | 说明 | 环境 | 状态 |
|---|---|---|---|---|---|
| 2.2.1 | `ai_suggestion.batch_generate_size` | `5` | 批量生成单批条数 | 测试 | ☐ |

### 2.3 批量生成 Prompt

| # | key | 说明 | 环境 | 状态 |
|---|---|---|---|---|
| 2.3.1 | `ai_suggestion.batch_system_prompt` | 批量生成 system prompt | 测试 | ☐ |
| 2.3.2 | `ai_suggestion.batch_user_prompt_template` | 批量生成 user prompt 模板 | 测试 | ☐ |

Prompt 配置命名空间：

```text
prompt.properties
```

### 2.4 稳定性 Redis 链路

| # | key | 建议值 | 说明 | 环境 | 状态 |
|---|---|---|---|---|---|
| 2.4.1 | `material.group.stability.redisSwitch` | 先 `false`，验证 Job 后打开 `true` | 素材组稳定性 Redis 链路开关 | 测试 | ☐ |
| 2.4.2 | `material.group.stability.redisRefreshDays` | `14` | 非 AI 素材组刷新时间范围 | 测试 | ☐ |
| 2.4.3 | `material.group.stability.redisCacheMinutes` | `30` | Redis 统计缓存 TTL | 测试 | ☐ |

### 2.5 AI 备用素材稳定性规则

| # | key | 说明 | 环境 | 状态 |
|---|---|---|---|---|
| 2.5.1 | `ai_backup.stability_rules` | AI 备用素材组稳定性评分规则 JSON | 测试 | ☐ |

规则 JSON 示例结构：

```json
[
  {
    "level": "S",
    "condition": "#utilityPercent>=0.5&&#historyUtilityPercent>=0.5",
    "reason": "当前可用占比${utilityPercent}，历史占比${historyUtilityPercent}，等级S"
  },
  {
    "level": "A",
    "condition": "#utilityPercent>=0.4&&#historyUtilityPercent>=0.4",
    "reason": "当前可用占比${utilityPercent}，历史占比${historyUtilityPercent}，等级A"
  },
  {
    "level": "B",
    "condition": "#utilityPercent>=0.3",
    "reason": "当前可用占比${utilityPercent}，等级B"
  },
  {
    "level": "C",
    "condition": "#utilityPercent>=0.2",
    "reason": "当前可用占比${utilityPercent}，等级C"
  },
  {
    "level": "D",
    "condition": "true",
    "reason": "通知占比偏低，${utilityPercent}，等级D"
  }
]
```

### 2.6 预发与生产配置同步

| # | 内容 | 环境 | 状态 |
|---|---|---|---|
| 2.6.1 | 同步 2.1 至 2.5 配置 | 预发 | ☐ |
| 2.6.2 | 同步 2.1 至 2.5 配置 | 生产 | ☐ |

---

## 3. XXL-Job 注册

> 本次分支新增 3 个 Job，需要在两个执行器工程都确认部署与注册。

### 3.1 whatsapp-crm-job

| # | Job Handler | 说明 | 建议 Cron | 环境 | 状态 |
|---|---|---|---|---|---|
| 3.1.1 | `CreateAiBackupMaterialGroupJob` | AI 备用素材组创建补偿 | `0 */5 * * * ?` | 测试 | ☐ |
| 3.1.2 | `ApplyAiBackupBodyJob` | AI 备用 body 替换补偿 | `0 */5 * * * ?` | 测试 | ☐ |
| 3.1.3 | `RefreshMaterialGroupStabilityCacheJob` | 素材组稳定性缓存刷新 | `0 */10 * * * ?` | 测试 | ☐ |

### 3.2 whatsapp-crm-job2-1-1

| # | Job Handler | 说明 | 建议 Cron | 环境 | 状态 |
|---|---|---|---|---|---|
| 3.2.1 | `CreateAiBackupMaterialGroupJob` | AI 备用素材组创建补偿 | `0 */5 * * * ?` | 测试 | ☐ |
| 3.2.2 | `ApplyAiBackupBodyJob` | AI 备用 body 替换补偿 | `0 */5 * * * ?` | 测试 | ☐ |
| 3.2.3 | `RefreshMaterialGroupStabilityCacheJob` | 素材组稳定性缓存刷新 | `0 */10 * * * ?` | 测试 | ☐ |

### 3.3 预发与生产

| # | 内容 | 环境 | 状态 |
|---|---|---|---|
| 3.3.1 | 注册并启用上述 3 个 Job | 预发 | ☐ |
| 3.3.2 | 注册并启用上述 3 个 Job | 生产 | ☐ |

---

## 4. 服务部署

| # | 检查项 | 环境 | 状态 |
|---|---|---|---|
| 4.1 | `whatsapp-crm-common` 构建通过 | — | ☐ |
| 4.2 | `whatsapp-agent-sdk` 构建通过 | — | ☐ |
| 4.3 | `whatsapp-crm-data` 构建通过 | — | ☐ |
| 4.4 | `whatsapp-crm-api` 构建通过 | — | ☐ |
| 4.5 | `whatsapp-crm-job` 构建通过 | — | ☐ |
| 4.6 | `whatsapp-crm-job2-1-1` 构建通过 | — | ☐ |
| 4.7 | API 服务部署 | 测试 | ☐ |
| 4.8 | Job 执行器部署 | 测试 | ☐ |
| 4.9 | API 服务部署 | 预发 | ☐ |
| 4.10 | Job 执行器部署 | 预发 | ☐ |
| 4.11 | API 服务部署 | 生产 | ☐ |
| 4.12 | Job 执行器部署 | 生产 | ☐ |

---

## 5. 上线前检查

| # | 检查项 | 说明 | 状态 |
|---|---|---|---|
| 5.1 | DDL 已执行 | 确认新增字段、索引、表存在 | ☐ |
| 5.2 | 新增 Apollo key 已配置 | 且 key 拼写正确 | ☐ |
| 5.3 | Prompt 模板已配置 | `batch_system_prompt`、`batch_user_prompt_template` | ☐ |
| 5.4 | `ai_backup.stability_rules` 可解析 | 规则为合法 JSON 数组 | ☐ |
| 5.5 | XXL-Job handler 名称正确 | `CreateAiBackupMaterialGroupJob` / `ApplyAiBackupBodyJob` / `RefreshMaterialGroupStabilityCacheJob` | ☐ |
| 5.6 | 首次上线保持总开关关闭 | `ai_backup.enabled=false` | ☐ |
| 5.7 | Redis 连接正常 | 稳定性统计依赖 StringRedisTemplate | ☐ |
| 5.8 | LLM Agent 配置正常 | 批量 prompt 可正常调用 | ☐ |

---

## 6. 功能验证

### 6.1 AI 建议生成

| # | 场景 | 预期 | 环境 | 状态 |
|---|---|---|---|---|
| 6.1.1 | 调用 `generate` | 生成一条建议并写库 | 测试 | ☐ |
| 6.1.2 | 调用 `batchGenerate` 多个 body | 返回受理成功，异步生成完成 | 测试 | ☐ |
| 6.1.3 | `batchGenerate` 传入 `status=ACCEPTED_FOR_AI_BACKUP` | 记录 `status=1` | 测试 | ☐ |
| 6.1.4 | `batchGenerate` 传入 `status=NOT_ACCEPTED_FOR_AI_BACKUP` | 记录 `status=2` | 测试 | ☐ |
| 6.1.5 | LLM 返回缺失某项结果 | 未匹配项写失败原因 | 测试 | ☐ |
| 6.1.6 | 未接受项生成失败 | `status=2`，不写 `3` | 测试 | ☐ |

### 6.2 素材模版保存与回填

| # | 场景 | 预期 | 环境 | 状态 |
|---|---|---|---|---|
| 6.2.1 | 新建素材模版，body 带正确 `clientMaterialKey` | `ai_material_suggestion.material_id/material_group_id` 回填 | 测试 | ☐ |
| 6.2.2 | 编辑素材模版，body 带正确 `clientMaterialKey` | 对应建议可更新 | 测试 | ☐ |
| 6.2.3 | body 的 `clientMaterialKey` 缺失或错误 | backfill 日志出现 `matched none` 或 `skipped` | 测试 | ☐ |

### 6.3 AI 备用素材组创建与更新

| # | 场景 | 预期 | 环境 | 状态 |
|---|---|---|---|---|
| 6.3.1 | 无已接受 body 且无备用组 | 不创建备用组 | 测试 | ☐ |
| 6.3.2 | 一个 body 被接受 | 创建备用组，且只同步包含该 body 的主用组合 | 测试 | ☐ |
| 6.3.3 | 多个 body 被接受 | 同步所有被接受 body 对应组合 | 测试 | ☐ |
| 6.3.4 | 已有备用组，取消全部接受状态 | 备用组保留，原 AI 组合停用 | 测试 | ☐ |
| 6.3.5 | 已有备用组，部分 body 取消接受 | 未接受 body 对应备用组合停用 | 测试 | ☐ |
| 6.3.6 | 备用组名称超长 | 正确截断且不超过 255 | 测试 | ☐ |
| 6.3.7 | 备用泳道同步 | 与主用泳道一致 | 测试 | ☐ |

### 6.4 body 替换

| # | 场景 | 预期 | 环境 | 状态 |
|---|---|---|---|---|
| 6.4.1 | 已接受 body 生成成功 | 备用 body Mongo `element.text` 替换为 AI 内容 | 测试 | ☐ |
| 6.4.2 | 备用组合下已有模板 | `message_template.components` 中 BODY 文本替换 | 测试 | ☐ |
| 6.4.3 | 未接受 body | 不替换，状态保持 `2` | 测试 | ☐ |
| 6.4.4 | 替换失败 | 建议 `status=5` | 测试 | ☐ |
| 6.4.5 | 补偿 Job 执行 | `status in (1,5)` 的记录重试 | 测试 | ☐ |

### 6.5 发送侧查询

| # | 场景 | 预期 | 环境 | 状态 |
|---|---|---|---|---|
| 6.5.1 | 主素材组有可用备用组 | 返回备用组 ID、名称、组合 | 测试 | ☐ |
| 6.5.2 | 稳定性低于最低等级 | 返回空 | 测试 | ☐ |
| 6.5.3 | Redis 无稳定性缓存 | 默认 `D`，可能低于阈值返回空 | 测试 | ☐ |
| 6.5.4 | 主素材组无备用组 | 返回空 | 测试 | ☐ |

### 6.6 稳定性 Redis 链路

| # | 场景 | 预期 | 环境 | 状态 |
|---|---|---|---|---|
| 6.6.1 | `redisSwitch=false` | 走旧实时统计逻辑 | 测试 | ☐ |
| 6.6.2 | `redisSwitch=true`，Redis 无缓存 | 实时计算并回写 Redis | 测试 | ☐ |
| 6.6.3 | `redisSwitch=true`，Redis 有缓存 | 列表直接读取 Redis 统计 | 测试 | ☐ |
| 6.6.4 | `RefreshMaterialGroupStabilityCacheJob` 执行 | AI 备用组全量刷新；非 AI 组刷新最近 N 天 | 测试 | ☐ |
| 6.6.5 | Redis key 检查 | `material_group_stability:{groupId}` 为 JSON | 测试 | ☐ |

---

## 7. 灰度发布步骤

| # | 步骤 | 说明 | 状态 |
|---|---|---|---|
| 7.1 | 数据库变更完成 | 避免应用启动后缺字段 | ☐ |
| 7.2 | 部署代码 | 保持 `ai_backup.enabled=false` | ☐ |
| 7.3 | 注册 Job | 确认三个 Job 可手动执行一次 | ☐ |
| 7.4 | 验证基础接口 | `batchGenerate`、状态查询接口 | ☐ |
| 7.5 | 打开 `ai_backup.enabled=true` | 允许创建备用素材组 | ☐ |
| 7.6 | 打开 `ai_backup.sync_create_enabled=true` | 保存主素材模版后同步创建 | ☐ |
| 7.7 | 测试创建主素材模版 | 验证备用组和 body 替换 | ☐ |
| 7.8 | 打开稳定性 Redis 链路 | `material.group.stability.redisSwitch=true` | ☐ |
| 7.9 | 验证发送侧备用组查询 | 稳定性满足最低等级时返回 | ☐ |
| 7.10 | 预发重复验证 | 通过后再生产 | ☐ |

---

## 8. 监控与日志

| # | 检查项 | 关键日志/指标 | 状态 |
|---|---|---|---|
| 8.1 | 批量生成异步异常 | `[ai-suggestion-batch-generate] async failed` | ☐ |
| 8.2 | LLM 匹配失败 | `generation failed` / `Missing batch result` | ☐ |
| 8.3 | 建议回填失败 | `AiMaterialSuggestionBackfillService.backfill matched none` | ☐ |
| 8.4 | 备用组触发失败 | `triggerAiBackupCreation failed` | ☐ |
| 8.5 | 备用组创建/更新失败 | `createOrUpdateAiBackupGroup` 相关 ERROR | ☐ |
| 8.6 | body 替换失败 | `applyAiBackupBody failed` | ☐ |
| 8.7 | 替换补偿异常 | `applyAiBackupBodyCompensation failed` | ☐ |
| 8.8 | 创建补偿异常 | `createCompensation failed` | ☐ |
| 8.9 | 稳定性刷新异常 | `RefreshMaterialGroupStabilityCacheJobService refresh failed` | ☐ |
| 8.10 | Redis 解析异常 | `parse AI backup stability stats failed` / `parse stability stats cache failed` | ☐ |

---

## 9. 回滚方案

| # | 场景 | 操作 | 说明 | 状态 |
|---|---|---|---|---|
| 9.1 | 备用素材功能异常 | `ai_backup.enabled=false` | 禁止创建/更新/发送侧返回 | ☐ |
| 9.2 | 同步创建异常 | `ai_backup.sync_create_enabled=false` | 主素材模版保存不再触发备用组 | ☐ |
| 9.3 | 稳定性 Redis 链路异常 | `material.group.stability.redisSwitch=false` | 回到旧实时统计逻辑 | ☐ |
| 9.4 | Job 异常 | 停用对应 XXL-Job | 避免补偿继续执行 | ☐ |
| 9.5 | 代码异常 | 回滚 `feature/zlc/0826-ai-backup-material` 部署 | 保留新增表和字段，一般无需回滚 DDL | ☐ |
| 9.6 | 数据异常 | 按具体记录修正 `ai_material_suggestion.status` 或停用备用组合 | 不建议直接删除表 | ☐ |

---

## 10. 上线后观察

| # | 观察项 | 预期 | 实际 |
|---|---|---|---|
| 10.1 | 备用素材组创建数量 | 与已接受 body 数量/组合匹配 | |
| 10.2 | `ai_material_suggestion.status` 分布 | 无大量异常 `5` | |
| 10.3 | body 替换成功率 | 正常，失败可补偿 | |
| 10.4 | 创建补偿 Job | 无持续积压 | |
| 10.5 | 替换补偿 Job | 无持续积压 | |
| 10.6 | 稳定性刷新 Job | 正常完成 | |
| 10.7 | 发送侧备用组命中率 | 符合业务预期 | |
| 10.8 | 接口错误率 | 无新增明显错误 | |
| 10.9 | Redis 统计命中率 | `redisSwitch=true` 后命中率正常 | |
