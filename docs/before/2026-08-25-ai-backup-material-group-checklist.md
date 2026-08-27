# AI 备用素材模版 — 上线 Checklist

## 一、DDL 执行

| # | 检查项 | 环境 | 状态 |
|---|--------|------|------|
| 1.1 | 执行 `doc/sql/ai_backup_material_group.sql`（ALTER TABLE + CREATE TABLE） | 测试 | ☐ |
| 1.2 | 验证 `message_material_group` 新增 3 字段存在 | 测试 | ☐ |
| 1.3 | 验证 `message_material_combination` 新增 2 字段 + 索引存在 | 测试 | ☐ |
| 1.4 | 验证 `ai_backup_material_update_log` 表创建成功 | 测试 | ☐ |
| 1.5 | 同上 DDL | 预发 | ☐ |
| 1.6 | 同上 DDL | 生产 | ☐ |

## 二、Apollo 配置 — `application` namespace

| # | 检查项 | 配置 key | 默认值 | 环境 | 状态 |
|---|--------|----------|--------|------|------|
| 2.1 | AI 备用总开关 | `ai_backup.enabled` | `false` | 测试 | ☐ |
| 2.2 | 异步创建开关 | `ai_backup.create_async` | `false` | 测试 | ☐ |
| 2.3 | 最低稳定性评级 | `ai_backup.min_stability_level` | `B` | 测试 | ☐ |
| 2.4 | 稳定性评级规则 | `ai_backup.stability_rules` | 见下方默认值 | 测试 | ☐ |
| 2.5 | MQ Topic | `rocketmq.topic.aiBackupMaterialGroupCreate` | `ai_backup_material_group_create` | 测试 | ☐ |
| 2.6 | MQ Consumer Group | `rocketmq.consumer.aiBackupMaterialGroupCreate.groupName` | `ai_backup_material_group_create_consumer` | 测试 | ☐ |
| 2.7 | 同上 6 个配置 | — | — | 预发 | ☐ |
| 2.8 | 同上 6 个配置 | — | — | 生产 | ☐ |

**`ai_backup.stability_rules` 默认值：**
```json
[
  {"level": "A", "condition": "utilityPercent >= 0.7", "reason": "Utility rate >= 70%, stable"},
  {"level": "B", "condition": "utilityPercent >= 0.5", "reason": "Utility rate >= 50%, relatively stable"},
  {"level": "C", "condition": "utilityPercent >= 0.3", "reason": "Utility rate >= 30%, acceptable"},
  {"level": "D", "condition": "true", "reason": "Utility rate < 30%, needs improvement"}
]
```

## 三、RocketMQ Console 操作

| # | 检查项 | 说明 | 环境 | 状态 |
|---|--------|------|------|------|
| 3.1 | 创建 Topic `ai_backup_material_group_create` | 在 RocketMQ Console 创建 | 测试 | ☐ |
| 3.2 | 创建 Consumer Group `ai_backup_material_group_create_consumer` | 在 RocketMQ Console 创建 | 测试 | ☐ |
| 3.3 | 同上 | — | 预发 | ☐ |
| 3.4 | 同上 | — | 生产 | ☐ |

## 四、XXL-Job 注册

| # | 检查项 | 执行器 | Cron 建议 | 环境 | 状态 |
|---|--------|--------|-----------|------|------|
| 4.1 | `CreateAiBackupMaterialGroupJob`（创建补偿） | whatsapp-crm-job | `0 */5 * * * ?` | 测试 | ☐ |
| 4.2 | `RefreshAiBackupStabilityCacheJob`（缓存刷新） | whatsapp-crm-job | `0 */10 * * * ?` | 测试 | ☐ |
| 4.3 | `CreateAiBackupMaterialGroupJob` | whatsapp-crm-job2-1-1 | `0 */5 * * * ?` | 测试 | ☐ |
| 4.4 | `RefreshAiBackupStabilityCacheJob` | whatsapp-crm-job2-1-1 | `0 */10 * * * ?` | 测试 | ☐ |
| 4.5 | 同上 4 个 Job | — | — | 预发 | ☐ |
| 4.6 | 同上 4 个 Job | — | — | 生产 | ☐ |

## 五、前端对接

| # | 检查项 | 说明 | 状态 |
|---|--------|------|------|
| 5.1 | 创建任务选择素材组改用 `/listAllForTaskSelection` 接口 | 该接口自动过滤 `source_type=1` 的 AI 备用组 | ☐ |
| 5.2 | 素材组管理页面继续使用 `/page`、`/listAll` | 不过滤，可查看 AI 备用组 | ☐ |

## 六、代码上线

| # | 检查项 | 环境 | 状态 |
|---|--------|------|------|
| 6.1 | 代码合并到目标分支 | — | ☐ |
| 6.2 | 确保 `ai_backup.enabled=false`（首次上线关闭） | 测试 | ☐ |
| 6.3 | 部署到测试环境 | 测试 | ☐ |
| 6.4 | 验证编译通过、服务启动正常 | 测试 | ☐ |
| 6.5 | 部署到预发环境 | 预发 | ☐ |
| 6.6 | 部署到生产环境 | 生产 | ☐ |

## 七、灰度验证

| # | 检查项 | 操作 | 状态 |
|---|--------|------|------|
| 7.1 | 在测试环境打开 `ai_backup.enabled=true` | Apollo 修改 | ☐ |
| 7.2 | 打开 `ai_backup.create_async=true` | Apollo 修改 | ☐ |
| 7.3 | 创建一个主素材组，采纳 body AI 建议 | 运营操作 | ☐ |
| 7.4 | 验证 MQ 消息发送成功（日志：`triggerAiBackupCreation MQ sent`） | 运维 | ☐ |
| 7.5 | 验证 MQ Consumer 消费成功（日志：`AiBackupMaterialGroupCreateConsumer receive`） | 运维 | ☐ |
| 7.6 | 验证 AI 备用素材组创建成功（DB：`SELECT * FROM message_material_group WHERE source_type=1`） | 运维 | ☐ |
| 7.7 | 验证组合创建成功（DB：`SELECT * FROM message_material_combination WHERE source_type=1`） | 运维 | ☐ |
| 7.8 | 验证操作日志写入（DB：`SELECT * FROM ai_backup_material_update_log`） | 运维 | ☐ |
| 7.9 | 素材组管理页面 `/page` 能看到 AI 备用组 | 运营 | ☐ |
| 7.10 | 创建任务选择素材组 `/listAllForTaskSelection` 不显示 AI 备用组 | 运营 | ☐ |
| 7.11 | 调用 `GET /api/admin/material/aiBackupGroup?primaryGroupId=X&laneCode=Y` 验证返回 | 运维 | ☐ |
| 7.12 | 验证稳定性缓存 Key 存在（Redis：`GET material_group_stability:{id}`） | 运维 | ☐ |
| 7.13 | 主素材组新增 body 并采纳 → 验证 AI 备用组同步更新 | 运维 | ☐ |

## 八、监控告警

| # | 检查项 | 说明 | 状态 |
|---|--------|------|------|
| 8.1 | MQ 消费异常 | 监控 `AiBackupMaterialGroupCreateConsumer` 错误日志 | ☐ |
| 8.2 | XXL-Job 执行异常 | 监控 `CreateAiBackupMaterialGroupJob` / `RefreshAiBackupStabilityCacheJob` 失败 | ☐ |
| 8.3 | Hook 异常 | 监控 `triggerAiBackupCreation failed` 错误日志 | ☐ |
| 8.4 | 稳定性缓存异常 | 监控 `Refresh stability cache failed` 错误日志 | ☐ |
| 8.5 | MQ 消息积压 | RocketMQ Console 监控 `ai_backup_material_group_create` Topic | ☐ |

## 九、回滚预案

| # | 操作 | 说明 |
|----|------|------|
| 9.1 | Apollo 关闭 `ai_backup.enabled=false` | 立即生效，Hook/Consumer/接口均不可用 |
| 9.2 | Apollo 关闭 `ai_backup.create_async=false` | 只关创建，保留查询可用 |
| 9.3 | 如有需要，代码 revert | 所有新增代码为独立文件，不影响存量 |
| 9.4 | 如有需要，清理测试数据 | `DELETE FROM message_material_group WHERE source_type=1` |

## 十、上线后观察（至少 1 天）

| # | 观察项 | 预期 | 实际 |
|---|--------|------|------|
| 10.1 | MQ 消息积压 | 无 | |
| 10.2 | XXL-Job 执行成功率 | 100% | |
| 10.3 | AI 备用组创建数量 | 与采纳建议数量一致 | |
| 10.4 | `getAiBackupGroup` 接口调用量 | 按发送量 | |
| 10.5 | 服务 CPU/内存 | 无明显波动 | |
| 10.6 | 错误日志数量 | 0 | |
