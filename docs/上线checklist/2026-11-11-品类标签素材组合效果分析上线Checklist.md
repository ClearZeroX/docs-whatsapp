# 品类、标签、素材组合效果分析上线 Checklist

> 日期：2026-11-11  
> 参考分支：后端 `feature/zlc/20261111-material-effect-analysis`；前端 `feature/zlc/20261111-material-effect-analysis-ui`  
> 影响范围：新增素材效果分析数据表、统计同步 Job、管理端查询接口和效果分析页面。原有发送统计、QE 统计和素材管理业务不改表、不改原有统计逻辑；新增数据同步会读取现有统计表并写入三张分析表。

**填写说明：** 本清单只覆盖本次功能的上线操作和直接依赖。执行器名称、Cron 和生产配置值未经线上配置页面核实的，标记为“待确认”。详细测试用例以本清单中的执行步骤和接口校验为准。

## 1. 数据与中间件变更

### 1.1 数据库变更与数据影响

| 表名 | 关键字段 | 读取／写入 | 结构变更 | 业务用途及逻辑变化 |
|---|---|---|---|---|
| `message_template_statistic` | `id`、`dt`、`message_template_id`、`material_combination_id`、`material_group_id`、`sent_count`、`delivered_count`、`read_count`、`url_clicked_count`、`unique_url_clicked_count` | 读取 | 无 | 作为渠道统计来源；只处理 `material_combination_id` 非空且大于 0 的数据，写入渠道效果明细和渠道来源汇总 |
| `qe_task_lane_template_message_statistic` | `id`、`send_dt`、`task_id`、`lane_type`、`window_type`、`template_name` 及 12 项指标 | 读取 | 无 | 作为 QE 业务统计来源；通过 `template_name` 反查 `message_template`，再关联素材组合模板，写入 QE 明细和 QE 来源汇总 |
| `message_template` | `id`、`name`、`material_combination_id`、`material_group_id` | 读取 | 无 | 完成 QE 模板名称到素材组合模板的映射；反查不到组合模板的数据按规则跳过并记录日志 |
| `message_material_combination` | `id`、`material_group_id`、`material_category_code`、成员素材 ID | 读取 | 无 | 提供素材组合模板、素材包和品类快照；用于页面品类聚合和标签成员下钻 |
| `material_category` | `code`、`name`、`status` | 读取 | 无 | 提供品类选项和品类名称 |
| `material_tag` | `code`、`name`、`status` | 读取 | 无 | 提供标签选项和标签名称 |
| `material_category_tag_relation` | `material_id`、`material_tag_code`、`source_type`、`binding_status` | 读取 | 无 | 提供素材标签绑定、来源和正式/候选状态；标签查询按组合成员素材去重 |
| `material_combination_sent_effect_detail` | `source_id`、`stat_date`、`material_combination_id`、渠道字段和 5 项渠道指标 | 写入 | 新增表 | 保存 `message_template_statistic` 的原生渠道统计粒度，按 `source_id` 幂等覆盖 |
| `material_combination_business_effect_detail` | `source_id`、`stat_date`、`task_id`、`lane_type`、`window_type`、`template_name`、组合字段和 12 项 QE 指标 | 写入 | 新增表 | 保存 QE 模板统计原生粒度，按 `source_id` 幂等覆盖 |
| `material_combination_effect_summary` | `stat_date`、`data_source`、组合、任务、泳道、窗口、渠道字段和完整指标 | 写入 | 新增表 | 为页面提供查询汇总；渠道和 QE 来源分开保存，不直接拼接两个来源的分子分母 |

**执行环境与时机：** 适用于实际发布环境。先发布包含 SQL 对应代码的后端版本，再执行建表 SQL；建表成功后手动执行一个指定日期的 Job，完成数据对账后再发布前端并开启日常调度。

**SQL 脚本：** [2026-11-11-material-effect-analysis.sql](/Users/opay-20260271/code-temp/whatsapp_crm/doc/sql/2026-11-11-material-effect-analysis.sql)

**完整 SQL：**

```sql
-- Material effect analysis tables.
-- Source rows are preserved at their native dimensions; summary rows keep the source type separate.
CREATE TABLE `material_combination_sent_effect_detail` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `source_id` bigint(20) unsigned NOT NULL DEFAULT '0' COMMENT 'Source message_template_statistic ID',
  `stat_date` varchar(10) NOT NULL DEFAULT '' COMMENT 'Statistics date yyyy-MM-dd',
  `business_phone` varchar(64) NOT NULL DEFAULT '' COMMENT 'Business phone',
  `agent` varchar(32) NOT NULL DEFAULT '' COMMENT 'Channel agent',
  `agent_name` varchar(128) NOT NULL DEFAULT '' COMMENT 'Channel agent name',
  `agent_template_id` varchar(128) NOT NULL DEFAULT '' COMMENT 'Channel template ID',
  `message_template_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Message template ID',
  `material_combination_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Material combination template ID',
  `material_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Material package ID',
  `sent_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Sent count',
  `delivered_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Delivered count',
  `read_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Read count',
  `url_clicked_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'URL clicked count',
  `unique_url_clicked_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Unique URL clicked count',
  `source_update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Source update time in milliseconds',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_source_id` (`source_id`),
  KEY `idx_combination_date` (`material_combination_id`, `stat_date`),
  KEY `idx_stat_date` (`stat_date`),
  KEY `idx_create_time` (`create_time`)
) COMMENT='Material combination channel effect detail';

CREATE TABLE `material_combination_business_effect_detail` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `source_id` bigint(20) unsigned NOT NULL DEFAULT '0' COMMENT 'Source QE row ID',
  `stat_date` varchar(10) NOT NULL DEFAULT '' COMMENT 'Statistics date yyyy-MM-dd',
  `task_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Task ID',
  `lane_type` varchar(64) NOT NULL DEFAULT '' COMMENT 'Source lane type',
  `window_type` varchar(8) NOT NULL DEFAULT '' COMMENT 'Attribution window T1/T3/T7',
  `template_name` varchar(255) NOT NULL DEFAULT '' COMMENT 'Source template name',
  `message_template_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Resolved message template ID',
  `material_combination_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Resolved material combination ID',
  `material_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Resolved material package ID',
  `request_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Request count',
  `sent_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Sent count',
  `delivered_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Delivered count',
  `read_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Read count',
  `click_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Click count',
  `flow_submit_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Flow submit count',
  `reply_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Reply count',
  `unsubscribe_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Unsubscribe count',
  `complaint_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Complaint count',
  `register_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Registration event count',
  `apply_credit_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Apply credit event count',
  `loan_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Loan event count',
  `source_update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Source update time in milliseconds',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_source_id` (`source_id`),
  KEY `idx_combination_date` (`material_combination_id`, `stat_date`),
  KEY `idx_task_lane_window` (`task_id`, `lane_type`, `window_type`, `stat_date`),
  KEY `idx_template_date` (`template_name`, `stat_date`),
  KEY `idx_create_time` (`create_time`)
) COMMENT='Material combination business effect detail';

CREATE TABLE `material_combination_effect_summary` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `stat_date` varchar(10) NOT NULL DEFAULT '' COMMENT 'Statistics date yyyy-MM-dd',
  `data_source` varchar(16) NOT NULL DEFAULT '' COMMENT 'CHANNEL or QE',
  `material_combination_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Material combination template ID',
  `material_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Material package ID',
  `task_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Task ID when available',
  `lane_type` varchar(64) NOT NULL DEFAULT '' COMMENT 'Lane type when available',
  `window_type` varchar(8) NOT NULL DEFAULT '' COMMENT 'T1/T3/T7 when available',
  `business_phone` varchar(64) NOT NULL DEFAULT '' COMMENT 'Business phone when available',
  `agent` varchar(32) NOT NULL DEFAULT '' COMMENT 'Channel agent when available',
  `material_category_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Material category snapshot',
  `request_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Request count',
  `sent_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Sent count',
  `delivered_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Delivered count',
  `read_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Read count',
  `click_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Click count',
  `flow_submit_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Flow submit count',
  `reply_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Reply count',
  `unsubscribe_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Unsubscribe count',
  `complaint_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Complaint count',
  `register_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Registration event count',
  `apply_credit_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Apply credit event count',
  `loan_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Loan event count',
  `data_cutoff_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Data cutoff time in milliseconds',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_summary_grain` (`stat_date`, `data_source`, `material_combination_id`, `task_id`, `lane_type`, `window_type`, `business_phone`, `agent`),
  KEY `idx_category_date` (`material_category_code`, `stat_date`),
  KEY `idx_combination_date` (`material_combination_id`, `stat_date`),
  KEY `idx_task_lane_window` (`task_id`, `lane_type`, `window_type`, `stat_date`),
  KEY `idx_create_time` (`create_time`)
) COMMENT='Material combination effect query summary';
```

**初始化／迁移：**

- [ ] 在目标环境执行三张表建表 SQL。
- [ ] 建表前确认三张表不存在，或完成同名表结构对比。
- [ ] 建表后执行 `SHOW CREATE TABLE` 校验字段、默认值、唯一索引和 `idx_create_time`。
- [ ] 不执行旧表 `material_combination_send_statistic` 的修改、迁移或删除。
- [ ] 首次回补按日期执行，源行按 `source_id` 幂等覆盖；重复执行同一日期不会重复累加。

### 1.2 Redis

无。本次未新增或修改 Redis Key，也没有直接读取 Redis 数据。

**上线操作：** 无。

### 1.3 RocketMQ

无。本次数据同步使用 XXL-Job 触发，不新增 RocketMQ Topic、Tag、Producer Group 或 Consumer Group。

**上线操作：** 无。

## 2. Apollo 配置

**Namespace：** 待确认。当前代码未读取本功能专用 Apollo Key。

| Key | 中文说明 | 变更类型 | 默认值 | 生产环境配置值 |
|---|---|---|---|---|
| 无 | 本次未新增 Apollo 配置 | 无 | 无 | 无 |

## 3. XXL-Job

| 执行器 | Job Handler | 中文说明 | 本次操作 | Cron | 参数 | 初始状态及启用时机 |
|---|---|---|---|---|---|---|
| 待确认 | `materialEffectAnalysisJob` | 同步渠道统计和 QE 业务统计到素材效果分析明细及汇总表 | 新增 | 待确认 | 空值：处理前一天；`yyyy-MM-dd`：处理指定日期 | 建议先停用，完成建表、发布和手动回补验证后再启用 |

**首次执行／历史回补：**

1. 建表并发布后端后，先手动执行 `2026-11-03`。
2. 检查渠道明细、QE 明细和汇总表写入数量。
3. 校验模板反查失败、无组合 ID、品类快照和指标汇总。
4. 对已确认存在数据的历史日期逐天执行，不把日期范围直接作为一个 Job 参数传入。
5. 对同一天重复执行，确认三张表的行数和指标总量不重复增长。
6. T3/T7 存在回补时，重新执行对应日期，确认只更新对应源行和窗口。

## 4. 服务发布顺序与关键观测

| 步骤 | 具体操作 | 完成判据 |
|---|---|---|
| 1 | 发布后端分支 `feature/zlc/20261111-material-effect-analysis` | 后端包含 `MaterialEffectAnalysisController`、`MaterialEffectAnalysisSyncService` 和 `materialEffectAnalysisJob`，服务启动成功 |
| 2 | 在目标数据库执行三张表建表 SQL | 三张表创建成功，`SHOW CREATE TABLE` 校验通过 |
| 3 | 保持 `materialEffectAnalysisJob` 停用，手动传参 `2026-11-03` 执行 | Job 返回成功，日志显示处理日期、渠道行数和 QE 行数 |
| 4 | 校验三张分析表和源表对账 | 明细行、指标总量和组合映射符合预期；无组合 ID 和反查失败按规则处理 |
| 5 | 重复执行 `2026-11-03` | 行数和指标总量不重复增长，`source_id` 唯一约束无异常 |
| 6 | 发布前端分支 `feature/zlc/20261111-material-effect-analysis-ui` | 页面菜单、路由和效果分析页面加载成功 |
| 7 | 联调 `/summary`、`/combination/page`、`/trend`、`/options`、`/status` | 三个视图、筛选、指标、窗口和空数据状态正确 |
| 8 | 按日期逐天回补历史数据 | 历史日期可查询，T1/T3/T7 分开，重复回补幂等 |
| 9 | 配置并启用日常 Job | 调度时间、执行器和参数确认后，Job 能稳定处理预期日期 |
| 10 | 开启上线观察 | Job、API、数据库和页面无异常，汇总表持续更新 |

**上线关键观测日志：**

| 观测时机 | 服务／Job | 日志关键字 | 正常表现 | 异常信号及处理 |
|---|---|---|---|---|
| 手动或日常 Job 执行后 | `materialEffectAnalysisJob` | `Material effect analysis sync completed` | 包含 `statDate`、`channelCount`、`qeCount`，且数量与源表符合预期 | 数量为 0、Job 失败或耗时异常时暂停调度，检查源表日期和数据库连接 |
| QE 模板反查时 | `MaterialEffectAnalysisSyncService` | `Skip QE effect row because combination cannot be resolved` | 失败记录数量为 0 或与已知渠道直建模板范围一致 | 失败量异常增加时暂停 Job，抽查 `template_name`、`message_template.name` 和组合 ID |
| 页面接口调用后 | `MaterialEffectAnalysisController` | HTTP 5xx、接口异常日志 | summary、trend、options、status 返回正常 | 5xx 或超时持续出现时隐藏页面入口或回退前端版本 |
| 汇总数据对账后 | 数据库校验 | `source_id`、日期、组合 ID、窗口 | 明细和汇总可对账，无重复累加 | 对账失败时暂停 Job，不开启日常调度，保留失败日期和样本 |

## 5. 回滚方案

**触发条件：** 出现统计数据重复累加、源表映射错误、接口持续 5xx、页面加载失败、数据库慢查询或 Job 影响原有业务资源时执行回滚。

1. 暂停 `materialEffectAnalysisJob`，停止新的分析数据写入。
2. 回退后端 `feature/zlc/20261111-material-effect-analysis` 对应发布版本；回退前端 `feature/zlc/20261111-material-effect-analysis-ui` 对应发布版本，或临时隐藏 `dashboard` 下的素材效果分析入口。
3. 保留三张分析表和已生成数据，不删除原有 `message_template_statistic`、`qe_task_lane_template_message_statistic`、`message_template`、素材包、素材组合模板和素材数据。
4. 本次无 Redis 数据、RocketMQ 消息和 Apollo 配置变更，无需清理或恢复这些中间件内容。
5. 如果只发生分析数据错误，先暂停 Job，保留失败日期和源记录，修复后重新执行指定日期；不要直接删除整张分析表。
6. 恢复原有业务前，确认原有发送统计和 QE 统计接口正常，确认分析功能未影响原有写入任务。
7. 修复后先在测试环境执行建表、指定日期回补、重复执行和接口联调，再恢复生产 Job。

**回滚后的数据处理：** 分析表数据可以保留用于排查；若确认某日期数据错误，按源 `source_id` 和日期清理或覆盖对应分析数据，操作前需备份并记录影响范围。
