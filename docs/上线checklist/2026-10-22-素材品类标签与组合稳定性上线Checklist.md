# 素材品类、标签与组合稳定性上线 Checklist

> 日期：2026-11-06
> 参考分支：`feature/zlc/20261020-material-category`

## 1. 数据库变更

### 1.1 测试环境旧方案结构复原

仅测试环境执行。执行前确认本脚本对应的是此前已执行的旧方案 DDL。

脚本文件：

[2026-11-06-素材品类标签与组合稳定性旧方案结构复原.sql](./2026-11-06-素材品类标签与组合稳定性旧方案结构复原.sql)

```sql
-- Revert the old material category and tag rollout structure.
ALTER TABLE `category`
  DROP INDEX `uk_category_code`;

ALTER TABLE `category`
  DROP COLUMN `code`,
  DROP COLUMN `category_type`,
  DROP COLUMN `source_type`;

ALTER TABLE `tag`
  DROP COLUMN `source_type`;

ALTER TABLE `tag_relation`
  DROP INDEX `idx_entity_source`,
  DROP INDEX `idx_extract_log_id`,
  DROP COLUMN `source_type`,
  DROP COLUMN `binding_status`,
  DROP COLUMN `extract_log_id`;

ALTER TABLE `message_material_combination`
  DROP INDEX `idx_material_category_code`,
  DROP COLUMN `material_category_code`;

DROP TABLE IF EXISTS `material_category_tag_diff_stat`;
```

### 1.2 最新方案建表及字段

执行环境：测试、预发、生产。执行时机：应用发布前。

```sql
CREATE TABLE `material_category` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Stable English material category code',
  `name` varchar(128) NOT NULL DEFAULT '' COMMENT 'Chinese material category name',
  `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT '0=AI, 1=admin, 2=operator',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT 'Display order',
  `status` tinyint(4) NOT NULL DEFAULT '1' COMMENT '0=disabled, 1=enabled',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_status_sort` (`status`, `sort`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Material category definition';

CREATE TABLE `material_tag` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Stable English material tag code',
  `name` varchar(128) NOT NULL DEFAULT '' COMMENT 'Chinese material tag name',
  `ai_demo_level` varchar(16) NOT NULL DEFAULT '' COMMENT 'AI example level',
  `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT '0=AI, 1=admin, 2=operator',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT 'Display order',
  `status` tinyint(4) NOT NULL DEFAULT '1' COMMENT '0=disabled, 1=enabled',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  UNIQUE KEY `uk_name` (`name`),
  KEY `idx_status_sort` (`status`, `sort`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Global material tag definition';

CREATE TABLE `material_category_tag_relation` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `material_id` varchar(64) NOT NULL DEFAULT '' COMMENT 'Mongo message_material ID',
  `material_category_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Category code carried by this relation',
  `material_tag_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Material tag code',
  `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT '0=AI, 1=admin, 2=operator',
  `binding_status` tinyint(4) NOT NULL DEFAULT '1' COMMENT '0=candidate, 1=formal',
  `accuracy_score` tinyint(4) NOT NULL DEFAULT '5' COMMENT 'AI tag accuracy score, 1-5; default 5',
  `extract_log_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'AI extract log ID; 0 for non-AI relations',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  KEY `idx_material_category` (`material_id`, `material_category_code`),
  KEY `idx_material_tag` (`material_id`, `material_tag_code`),
  KEY `idx_category_tag` (`material_category_code`, `material_tag_code`),
  KEY `idx_tag_code` (`material_tag_code`),
  KEY `idx_source_status` (`source_type`, `binding_status`),
  KEY `idx_extract_log_id` (`extract_log_id`),
  KEY `idx_accuracy_score` (`accuracy_score`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Material category tag relation';

CREATE TABLE `material_tag_rule` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `name` varchar(128) NOT NULL DEFAULT '' COMMENT 'Rule name',
  `material_category_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Material category code',
  `prompt_desc` varchar(2048) NOT NULL DEFAULT '' COMMENT 'Rule prompt description',
  `scope` varchar(64) NOT NULL DEFAULT '' COMMENT 'Applicable scope',
  `is_required` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Whether the rule is required',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT 'Display order',
  `status` tinyint(4) NOT NULL DEFAULT '1' COMMENT '0=disabled, 1=enabled',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  KEY `idx_material_category` (`material_category_code`),
  KEY `idx_status_sort` (`status`, `sort`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Material tag extraction rule';

CREATE TABLE `material_category_tag_diff_stat` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `stat_date` varchar(10) NOT NULL DEFAULT '' COMMENT 'Analysis date yyyy-MM-dd',
  `material_category_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Actual category code on the material',
  `relation_category_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Category code carried by an AI tag relation',
  `material_tag_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Material tag code; empty for category-only statistics',
  `diff_type` varchar(32) NOT NULL DEFAULT '' COMMENT 'SAME_CATEGORY, CROSS_CATEGORY, SAME_TAG, LEGACY_UNCATEGORIZED',
  `material_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Affected material count',
  `relation_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Raw relation count',
  `sample_material_ids` text COMMENT 'Bounded JSON array of sample Mongo IDs',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_stat_category_tag_diff` (`stat_date`, `material_category_code`, `relation_category_code`, `material_tag_code`, `diff_type`),
  KEY `idx_material_category` (`material_category_code`),
  KEY `idx_relation_category` (`relation_category_code`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Material category tag difference statistics';

ALTER TABLE `message_material_combination`
  ADD COLUMN `material_category_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Material category code snapshot' AFTER `material_template_type`,
  ADD KEY `idx_material_category_code` (`material_category_code`);
```

Mongo `message_material` 增加顶层字段 `material_category_code`，无需执行 Mongo DDL。

## 2. Apollo 配置

| # | Key | 默认值 | 建议值 | 本需求相关性与要求 |
|---|---|---|---|---|
| 2.1 | `material.category.write-whitelist` | 空 | 配置实际允许维护素材品类的 SSO 登录名，多个用户使用英文逗号分隔 | 素材品类管理写权限。读取不受白名单限制；本次需要配置 |
| 2.2 | `material.ai.tag.system.prompt` | 空 | 发布最新 Prompt 内容 | AI 素材品类和标签提取 Prompt。本次需要更新，包含运营品类优先、已有品类选择、新品类创建、全局标签、`exampleTags: []` 及最新 code 规则 |
| 2.3 | `material.group.stability.switch` | `false` | 沿用现网值；如本次需要启用组合稳定性能力则设为 `true` | 组合稳定性总开关。新版本读取组合稳定性时受该开关影响，本次需确认现网值 |
| 2.4 | `material.group.stabilityRules` | 空；代码使用默认 D 级规则 | 沿用现网 S/A/B/C/D 规则 JSON；如现网未配置，补充正式规则 | 组合稳定性评级规则。本次组合维度稳定性依赖该配置，建议不要使用代码默认 D 级规则 |
| 2.5 | `material.group.stability.redisSwitch` | `false` | 首次发布建议保持 `false`；确认 Redis 刷新 Job 正常后，再按发布安排设置为 `true` | Redis 稳定性缓存读取开关。只有启用 Redis 读取链路时才设置为 `true` |
| 2.6 | `material.group.stability.redisRefreshDays` | `14` | `14` | Redis 稳定性缓存刷新范围，按最近 14 天更新的素材组合处理；无特殊要求时沿用默认值 |
| 2.7 | `material.group.stability.redisCacheMinutes` | `35` | `35` | Redis 稳定性缓存 TTL，单位为分钟；无特殊要求时沿用默认值 |
|  | material.tag.config.job.parameter |  |  | 配置导入 |

```json
你是专业营销文案标签与素材品类分析师，请根据提供的素材内容完成素材品类判断和业务特征标签提取。

请严格按照以下规则处理：

1、对每个素材独立分析其实际内容，判断素材所属的素材品类，并提取能够体现业务含义和素材差异的标签。

2、素材品类选择顺序：
   a. 优先判断素材中的 materialCategoryCode，也就是运营绑定的素材品类是否符合当前素材内容；如果符合，继续使用该品类。
   b. 如果运营绑定的素材品类不符合，从 materialCategoryList 中选择最匹配的已有素材品类。
   c. 只有 materialCategoryList 中没有任何合适品类时，才允许新建素材品类。
   d. 当 materialCategoryCode 为 UNCATEGORIZED 时，不使用该值作为最终品类，直接从 materialCategoryList 中选择；只有没有合适已有品类时才新建品类。
   e. 已有素材品类能够匹配时，必须优先复用已有品类，不能随意新建品类。

3、新建素材品类时，materialCategoryCode 必须满足以下规则：
   - 以小写英文字母开头；
   - 只包含小写英文字母、数字和横线；
   - 长度不超过 64 个字符；
   - 不包含下划线、冒号、大写字母、空格、中文或其他特殊字符；
   - 不能使用 UNCATEGORIZED；
   - 必须使用能够表达业务含义的英文名称，例如 limit-offer、repay-1-day。

4、标签不依赖外部标签候选列表。标签必须直接根据素材内容生成，不要因为没有已有标签列表而返回空标签，也不要等待已有标签进行复用。

5、标签必须体现素材明确的业务含义或素材之间的差异，不要提取没有明确业务含义的普通词语、语气词、表情或普通语法词。

6、即使只有一个素材，也要根据该素材内容独立提取标签，不要求必须与其他素材进行比较。

7、对于内容可读且包含明确业务特征的素材，每个素材返回 1 到 5 个有业务含义的标签。标签数量根据实际内容决定，不要为了凑数量生成无意义标签。

8、对于素材内容为空、无法读取或图片识别结果为空的素材：
   - 不要编造素材品类；
   - 不要编造标签；
   - tags 可以返回空数组。

9、标签不归属于某个品类，标签应根据素材内容独立生成。materialCategoryCode 仅表示素材所属的素材品类。

10、每个标签必须包含以下字段：
   - tagCode：表达标签业务含义的英文 code；
   - tagName：简洁准确的中文名称；
   - confidence：0 到 1 之间的置信度。

11、tagCode 必须满足以下规则：
   - 以小写英文字母开头；
   - 只允许小写英文字母、数字、横线和冒号；
   - 长度不超过 64 个字符；
   - 不允许下划线、大写字母、空格、中文或其他特殊字符；
   - 必须符合正则：^[a-z][a-z0-9:-]{0,63}$；
   - 示例：disguise-system:notice、realistic-credit-limit、ojk-licensed-platform。

12、tagName 必须是简洁明确的中文展示名称，不要返回英文解释、长句或额外说明。

13、tag Rule 中的规则是业务判断参考。只有素材内容符合规则的适用条件时，才执行对应规则；不符合时跳过该规则，不要将规则强行应用到所有素材。

14、category item 中的 exampleTags 字段仅作为预留字段，必须保持为空数组。

15、每个输入素材都应在 materials 中返回对应结果，material_id 必须使用输入素材的 materialId。

16、必须严格返回纯 JSON：
   - 不要返回 Markdown；
   - 不要返回 ```json 代码块；
   - 不要返回解释文字；
   - 不要返回注释；
   - 返回内容必须能够直接被 JSON 解析。

17、返回格式必须为：

{
  "materials": [
    {
      "material_id": "Material ID",
      "materialCategoryCode": "repay-1-day",
      "materialCategoryName": "1天内还款",
      "tags": [
        {
          "tagCode": "disguise-system:notice",
          "tagName": "系统通知伪装",
          "confidence": 0.95
        }
      ]
    }
  ]
}
```

## 3. XXL-Job

### 3.1 `whatsapp-crm-job`

| Job Handler | 上线操作 |
|---|---|
| `RefreshMaterialCombinationStabilityCacheJob` | 注册或更新任务，配置执行器、Cron、负责人和失败告警 |

### 3.2 `whatsapp-crm-job2-1-1`

| Job Handler | 上线操作 |
|---|---|
| `RefreshMaterialCombinationStabilityCacheJob` | 注册或更新任务，配置执行器、Cron、负责人和失败告警 |

本次不注册 `MaterialCategoryTagDiffJob`，因为当前没有对应实现。

## 4. 服务发布顺序

1. 执行第 1 节数据库 SQL。
2. 发布 `whatsapp-crm-data`。
3. 发布 `whatsapp-crm-api`、`whatsapp-crm-mq`。
4. 发布 `whatsapp-crm-job`、`whatsapp-crm-job2-1-1`。
5. 发布前端。
6. 更新第 2 节 Apollo 配置。
7. 注册或更新第 3 节 XXL-Job，并启用稳定性刷新任务。

## 5. 回滚方案

1. 停止 `RefreshMaterialCombinationStabilityCacheJob`。
2. 回滚 `whatsapp-crm-job`、`whatsapp-crm-job2-1-1`。
3. 回滚 `whatsapp-crm-api`、`whatsapp-crm-mq`、`whatsapp-crm-data` 和前端版本。
4. 回滚本次修改的 Apollo 配置。
5. 保留本次新增表、字段和已写入数据，不执行数据库结构删除。
