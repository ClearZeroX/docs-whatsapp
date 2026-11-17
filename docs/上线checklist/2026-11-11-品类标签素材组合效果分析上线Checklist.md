# 品类、标签、素材组合效果分析上线 Checklist

> 最近写入工具：Codex
> 日期：2026-11-11  
> 更新日期：2026-11-13  
> 参考分支：后端 `feature/zlc/20261111-material-effect-analysis`；前端 `feature/zlc/20261111-material-effect-analysis-ui`  
> 影响范围：新增素材效果分析数据表、统计同步 Job、管理端查询接口和效果分析页面。原有发送统计、QE 统计和素材管理业务不改表、不改原有统计逻辑；新增数据同步会读取现有统计表并写入三张分析表。本次补充指定素材包手动补打标签 Job、历史轮播素材过滤和标签按 code／名称复用，涉及 API、MQ 消费服务及目标 Job 执行器发布。

**填写说明：** 本清单只覆盖本次功能的上线操作和直接依赖。执行器名称、Cron 和生产配置值未经线上配置页面核实的，标记为“待确认”。详细测试用例以本清单中的执行步骤和接口校验为准。

## 1. 数据与中间件变更

### 1.1 数据库变更与数据影响

| 表名 | 关键字段 | 读取／写入 | 结构变更 | 业务用途及逻辑变化 |
|---|---|---|---|---|
| `message_template_statistic` | `id`、`dt`、`message_template_id`、`material_combination_id`、`material_group_id`、`sent_count`、`delivered_count`、`read_count`、`url_clicked_count`、`unique_url_clicked_count` | 读取 | 无 | 作为渠道统计来源；只处理 `material_combination_id` 非空且大于 0 的数据，写入渠道效果明细和渠道来源汇总 |
| `qe_task_lane_template_message_statistic` | `id`、`send_dt`、`task_id`、`lane_type`、`window_type`、`template_name` 及 12 项指标 | 读取 | 无 | 作为 QE 业务统计来源；通过 `template_name` 反查 `message_template`，再关联素材组合模板，写入 QE 明细和 QE 来源汇总 |
| `message_template` | `id`、`name`、`material_combination_id`、`material_group_id` | 读取 | 无 | 完成 QE 模板名称到素材组合模板的映射；反查不到组合模板的数据按规则跳过并记录日志 |
| `message_material_combination` | `id`、`material_group_id`、`material_category_code`、成员素材 ID | 读取 | 无 | 提供素材组合模板、素材包和品类快照；用于页面品类聚合和标签成员下钻；补打读取 `carousel_body_material_id`，包括非启用组合的引用，排除缺少 `CAROUSEL_BODY` 标记的历史轮播正文 |
| `material_category` | `code`、`name`、`status` | 读写 | 无 | 提供品类选项和名称；补打复用现有 AI 品类查找及创建逻辑 |
| `material_tag` | `code`、`name`、`status` | 读写 | 无 | 标签按 code 优先查找，未命中再按名称查找，任一命中复用原记录，两者均不存在才新增；两个条件命中不同记录时优先 code |
| `material_category_tag_relation` | `material_id`、`material_tag_code`、`source_type`、`binding_status`、`extract_log_id` | 读写 | 无 | 提供效果查询所需标签关系；补打更新已完成提取素材的 AI 关系，保留人工关系；按名称复用标签时，关系写入原标签的真实 code |
| `message_material_group` | `id`、`status` | 读取 | 无 | 补打校验指定素材包存在且未删除，未启用素材包也允许补打 |
| `message_material`（Mongo） | `_id`、`materialGroupId`、`type`、`subType`、`status`、`materialCategoryCode` | 读取 | 无 | 预览和按包消费共用筛选，排除已删除素材、轮播正文及不支持打标的组件 |
| `material_tag_rule` | `id`、`status`、`prompt_desc` | 读取 | 无 | 复用现有启用的 AI 打标规则 |
| `tag_extract_log` | `material_group_id`、`material_ids`、`extract_count`、`status`、`response_body` | 读写 | 无 | 记录实际提取结果；指定素材包补打不因已有成功记录跳过 |
| `material_category_pair` | `material_id`、品类关联字段 | 读写 | 无 | 复用提取完成后的品类关联刷新 |
| `ai_image_asset_tag` | 图片素材及继承标签关联 | 读写 | 无 | 已安装图片标签读模型时，沿用提取完成后的继承标签刷新；不新增结构 |
| `material_combination_sent_effect_detail` | `source_id`、`stat_date`、`material_combination_id`、渠道字段和 5 项渠道指标 | 写入 | 新增表 | 保存 `message_template_statistic` 的原生渠道统计粒度，按 `source_id` 幂等覆盖 |
| `material_combination_business_effect_detail` | `source_id`、`stat_date`、`task_id`、`lane_type`、`window_type`、`template_name`、组合字段和 12 项 QE 指标 | 写入 | 新增表 | 保存 QE 模板统计原生粒度，按 `source_id` 幂等覆盖 |
| `material_combination_effect_summary` | `stat_date`、`data_source`、组合、任务、泳道、窗口、渠道字段和完整指标 | 写入 | 新增表 | 为页面提供查询汇总；渠道和 QE 来源分开保存，不直接拼接两个来源的分子分母 |

**执行环境与时机：** 适用于实际发布环境。先发布包含 SQL 对应代码的后端版本，再执行建表 SQL；建表成功后手动执行一个指定日期的 Job，完成数据对账后再发布前端并开启日常调度。

**补打标签的结构变更：** 无。不新增任务表、标签表或 MQ 专用表；上线前核对上述已有业务表已具备当前代码所需字段。

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

| Topic／Tag | 中文用途 | 变更类型 | 生产服务／Producer Group | 消费服务／Consumer Group | 消息及消费逻辑变化 |
|---|---|---|---|---|---|
| 由 `rocketmq.consumer.materialTagExtract.topic` 指定；无 Tag；测试环境为 `whatsapp_crm_material_tag_extract`，生产现值待确认 | 素材 AI 打标 | 复用现有 Topic，增加手动 Job 生产入口 | API 原有生产入口；本次增加目标 Job 执行器；Producer Group 沿用服务配置，现值待确认 | `whatsapp-crm-mq`；Group 由 `rocketmq.consumer.materialTagExtract.consumerName` 指定，生产现值待确认 | 每个素材包一条消息，仅含 `materialGroupId`；预览不发送。按包消费重新读取当前素材并过滤历史轮播正文。新建／更新消息的 ID 收集排除 `carouselBodyList` |

补打消息示例（773 为测试素材包 ID，生产使用经确认的目标 ID）：

```json
{"materialGroupId":773}
```

**上线操作：** 复用现有 Topic、Group 和订阅，不新增消息字段。先发布 MQ 消费服务，再发布并手动执行 Job；核对执行器的生产者配置、消息发送权限及消费者开关。只有 broker 返回 `SEND_OK` 且消息 ID 非空才计为投递成功，结果中记录 `msgId`。缺少增量快照字段的消息沿用按包打标分支，不触发保存事件的图片增量入库流程。

**重复执行与历史消息：** 指定 ID 每次执行都会重新投递，Job 不做已成功跳过。重复执行会重新请求 AI 并更新 AI 标签，不代表结果与上次完全相同。已发送的旧保存事件消息不会被生产端过滤修复重写；本次 Job 发送新的按包消息。异常消费沿用现有 MQ 重试机制。

## 2. Apollo 配置

本次不新增配置 Key。以下为补打直接依赖的现有配置，生产现值和实际所属 namespace 未核实，均需上线前确认。

**Namespace：`application`（代码读取，实际归属待确认）**

| Key | 中文说明 | 变更类型 | 默认值 | 生产环境配置值 |
|---|---|---|---|---|
| `ai.tag.extract.config` | AI 打标总开关；正式补打要求开启，预览可在关闭时执行 | 直接依赖，未修改 | `false` | 待确认；正式执行需 `true` |

**Namespace：`rocketmq.yml`（实际归属待确认）**

| Key | 中文说明 | 变更类型 | 默认值 | 生产环境配置值 |
|---|---|---|---|---|
| `rocketmq.consumer.materialTagExtract.enabled` | 是否启用打标签消费者 | 直接依赖，未修改 | 未配置不启用 | 待确认；消费需 `true` |
| `rocketmq.consumer.materialTagExtract.topic` | 打标 Topic，生产与消费必须一致 | 直接依赖，未修改 | 生产端为空字符串，消费端无占位符默认值 | 待确认 |
| `rocketmq.consumer.materialTagExtract.consumerName` | 打标 Consumer Group | 直接依赖，未修改 | 无代码默认值 | 待确认 |

**上线操作：** 核对 MQ 服务与目标 Job 执行器的现有 RocketMQ 连接及生产者配置；复用现有模型访问和打标规则配置，不另加补打专用开关。

## 3. XXL-Job

| 执行器 | Job Handler                 | 中文说明 | 本次操作 | Cron | 参数 | 初始状态及启用时机 |
|---|-----------------------------|---|---|---|---|---|
| 待确认 | `MaterialEffectAnalysisJob` | 同步渠道统计和 QE 业务统计到素材效果分析明细及汇总表 | 新增 | 待确认 | 空值：处理前一天；`yyyy-MM-dd`：处理指定日期 | 建议先停用，完成建表、发布和手动回补验证后再启用 |
| 待确认；按实际部署选择 `whatsapp-crm-job` 或 `whatsapp-crm-job2-1-1`，两边代码均提供入口 | `materialTagBackfillJob` | 指定素材包重新触发 AI 打标 | 新增 | 手动，不启用定时调度 | 必填 JSON：`groupIdList`；`dryRun` 默认 `true` | 发布消费者和目标执行器、核对配置后先预览，再明确传 `false` 执行 |

**首次执行／历史回补：**

1. 建表并发布后端后，先手动执行 `2026-11-03`。
2. 检查渠道明细、QE 明细和汇总表写入数量。
3. 校验模板反查失败、无组合 ID、品类快照和指标汇总。
4. 对已确认存在数据的历史日期逐天执行，不把日期范围直接作为一个 Job 参数传入。
5. 对同一天重复执行，确认三张表的行数和指标总量不重复增长。
6. T3/T7 存在回补时，重新执行对应日期，确认只更新对应源行和窗口。

**指定素材包补打标签：**

预览参数（示例 ID 来自测试环境，生产必须替换）：

```json
{"groupIdList":[773,772],"dryRun":true}
```

正式投递参数：

```json
{"groupIdList":[773,772],"dryRun":false}
```

1. 先选择少量已确认素材包。ID 列表必填，仅接受正整数，一次最多输入 100 个，去重保留顺序；空参数、空列表或非法参数报失败，不扫描全量。
2. 执行预览，查看逐包 `materialCount`；普通文字／图片头部及普通正文参与，已删除素材、轮播正文、轮播卡片、页脚、按钮及限时优惠组件排除。暂停素材可参与，未启用素材包可参与。
3. 预览符合范围后，以 `dryRun:false` 执行。只有轮播等不支持素材的包返回 `SKIPPED`；不存在或已删除的包返回 `FAILED`；单包失败不阻断其他 ID。
4. Job 日志记录 `PREVIEW`／`SUBMITTED`／`SKIPPED`／`FAILED`、素材数量、消息 ID 和失败原因；汇总给出 `failedIds`。存在逐包失败时调度结果为失败，重试只填写确认需要重试的 ID。
5. `SUBMITTED` 及 Job 成功只代表投递完成。用素材包 ID、`msgId` 跟踪 MQ 消费，再核对 `tag_extract_log`、AI 标签关系、标签实际 code 和正式／候选状态。
6. 补打更新已完成提取素材的旧 AI 关系，人工标签保留。正常空标签结果可能清除原 AI 关系；大批量补打前保存目标素材标签关系快照，成功日志和实际标签数量分别验收。
7. code 不同、名称相同的标签必须复用已有标签，并验证关联保存的是已有 code；code 与名称分别命中不同记录时 code 优先。新建／更新含轮播的素材包时，核对消息的待打标签 ID 不含轮播正文。

**本地验证记录（2026-11-13）：** 当前补打链路及相关模块编译通过，46 个针对性测试通过；此项不是目标环境已发布或验收完成的证明。

## 4. 服务发布顺序与关键观测

| 步骤 | 具体操作 | 完成判据 |
|---|---|---|
| 1 | 发布后端分支 `feature/zlc/20261111-material-effect-analysis` | 后端包含 `MaterialEffectAnalysisController`、`MaterialEffectAnalysisSyncService` 和 `MaterialEffectAnalysisJob`，服务启动成功 |
| 2 | 在目标数据库执行三张表建表 SQL | 三张表创建成功，`SHOW CREATE TABLE` 校验通过 |
| 3 | 保持 `MaterialEffectAnalysisJob` 停用，手动传参 `2026-11-03` 执行 | Job 返回成功，日志显示处理日期、渠道行数和 QE 行数 |
| 4 | 校验三张分析表和源表对账 | 明细行、指标总量和组合映射符合预期；无组合 ID 和反查失败按规则处理 |
| 5 | 重复执行 `2026-11-03` | 行数和指标总量不重复增长，`source_id` 唯一约束无异常 |
| 6 | 发布前端分支 `feature/zlc/20261111-material-effect-analysis-ui` | 页面菜单、路由和效果分析页面加载成功 |
| 7 | 联调 `/summary`、`/combination/page`、`/trend`、`/options`、`/status` | 三个视图、筛选、指标、窗口和空数据状态正确 |
| 8 | 按日期逐天回补历史数据 | 历史日期可查询，T1/T3/T7 分开，重复回补幂等 |
| 9 | 配置并启用日常 Job | 调度时间、执行器和参数确认后，Job 能稳定处理预期日期 |
| 10 | 发布包含标签 code／名称复用及历史轮播过滤的 `whatsapp-crm-mq`；API 发布包含保存事件轮播 ID 过滤的版本 | 消费者启动、订阅正常；新建／更新的混合素材包消息不包含轮播正文 ID |
| 11 | 发布实际使用的 Job 执行器，注册 `materialTagBackfillJob`，保持手动执行 | Handler 可选，生产者配置与消费者 Topic 一致，不同时在两个执行器重复提交同一批 ID |
| 12 | 用经确认的素材包 ID 执行预览，再正式投递 | 预览不发消息；逐包结果及消息 ID 清晰，失败 ID 可定位 |
| 13 | 验证 MQ 消费与标签落库，再分批补历史 | 投递与消费分别成功；AI 标签按真实 code 关联，人工关系保留，历史轮播被排除 |
| 14 | 开启上线观察 | 分析 Job、补打消费者、API、数据库和页面无异常；补打 Job 保持手动，分析 Job 按原计划调度 |

**上线关键观测日志：**

| 观测时机 | 服务／Job | 日志关键字 | 正常表现 | 异常信号及处理 |
|---|---|---|---|---|
| 手动或日常 Job 执行后 | `MaterialEffectAnalysisJob` | `Material effect analysis sync completed` | 包含 `statDate`、`channelCount`、`qeCount`，且数量与源表符合预期 | 数量为 0、Job 失败或耗时异常时暂停调度，检查源表日期和数据库连接 |
| QE 模板反查时 | `MaterialEffectAnalysisSyncService` | `Skip QE effect row because combination cannot be resolved` | 失败记录数量为 0 或与已知渠道直建模板范围一致 | 失败量异常增加时暂停 Job，抽查 `template_name`、`message_template.name` 和组合 ID |
| 页面接口调用后 | `MaterialEffectAnalysisController` | HTTP 5xx、接口异常日志 | summary、trend、options、status 返回正常 | 5xx 或超时持续出现时隐藏页面入口或回退前端版本 |
| 汇总数据对账后 | 数据库校验 | `source_id`、日期、组合 ID、窗口 | 明细和汇总可对账，无重复累加 | 对账失败时暂停 Job，不开启日常调度，保留失败日期和样本 |
| 补打入口及预览后 | `materialTagBackfillJob` | `MaterialTagBackfillJob entry`、`Material tag backfill started`、`Material tag backfill group outcome` | 记录目标 ID、dryRun、素材数量和逐包状态；预览 submitted 为 0 | 参数失败或筛选范围异常时停止正式执行并修正目标 ID |
| 补打投递后 | 目标 Job 执行器 | `Material tag backfill message submitted`、`Material tag backfill MQ submission failed`、`MaterialTagBackfillJob finished` | 每个 SUBMITTED 有 msgId，汇总 submitted/skipped/failed 和 failedIds 与逐包结果一致 | MQ 不确认、连接异常或部分失败时按失败 ID 排查，避免整批盲目重复提交 |
| 消费后 | `whatsapp-crm-mq` | `MaterialTagExtractConsumer receive message`、`Tag extract completed`、`MaterialTagExtractConsumer extract success`、`MaterialTagExtractConsumer extract error` | 按 msgId 串联消费，按素材 ID 核对提取日志和 AI 关系；候选标签在候选区域验收 | 有投递无消费时查订阅／开关；消费错误查对应 trace；记录成功但 0 标签时核对模型响应，不能只以消费成功代替效果验收 |
| 标签保存及派生数据刷新后 | `whatsapp-crm-mq` | `Material category tag persistence failed`、`Refresh material category pairs failed after tag extraction`、`Inherited image tag refresh failed` | 同名标签复用、关系 code 正确，品类关联及已安装的图片标签读模型刷新正常 | 唯一键冲突或刷新失败时停止新增补打，保存素材 ID、消息 ID 和错误样本 |

## 5. 回滚方案

**触发条件：** 出现统计数据重复累加、源表映射错误、接口持续 5xx、页面加载失败、数据库慢查询或 Job 影响原有业务资源时执行回滚。

1. 暂停 `MaterialEffectAnalysisJob`，停止新的分析数据写入；停止手动执行 `materialTagBackfillJob`，阻止新增补打消息。
2. 回退后端 `feature/zlc/20261111-material-effect-analysis` 对应发布版本；回退前端 `feature/zlc/20261111-material-effect-analysis-ui` 对应发布版本，或临时隐藏 `dashboard` 下的素材效果分析入口。
3. 保留三张分析表和已生成数据，不删除原有 `message_template_statistic`、`qe_task_lane_template_message_statistic`、`message_template`、素材包、素材组合模板和素材数据。
4. 补打已发送的消息不会因停 Job 自动取消。回退消费者前核对在途及重试消息；必要时协调暂停相关消费并记录 msgId，注意该消费者也承接新建／更新打标。保留现有 Topic／Group，不清队列、不重置消费位点。无需清理 Redis；若上线中调整了既有开关或连接配置，按发布记录恢复，避免影响其他打标业务。
5. 如果只发生分析数据错误，先暂停 Job，保留失败日期和源记录，修复后重新执行指定日期；不要直接删除整张分析表。
6. 恢复原有业务前，确认原有发送统计和 QE 统计接口正常，确认分析功能未影响原有写入任务。
7. 修复后先在测试环境执行建表、指定日期回补、重复执行和接口联调，再恢复生产 Job。

**回滚后的数据处理：** 分析表数据可以保留用于排查；若确认某日期数据错误，按源 `source_id` 和日期清理或覆盖对应分析数据，操作前需备份并记录影响范围。标签补打已覆盖的 AI 关系不会随代码回滚自动恢复；依据执行前快照和 `extract_log_id` 按素材范围恢复或修复后重新补打，保留人工关系及排查日志，不批量删除标签字典。
