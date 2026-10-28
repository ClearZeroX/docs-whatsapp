# 素材品类、标签与组合稳定性上线 Checklist

> 日期：2026-10-22
> 功能：素材品类（普通素材）、标签来源与 AI 候选、组合品类校验、后端组合预览、组合维度稳定性评级
> 参考分支：`feature/zlc/20261020-material-category`（本地未提交）
> 说明：本 checklist 只覆盖**当前已实现的后端能力**；前端页面（内容管理、组合预览 UI、素材分类管理页等）不在本次发布范围，需后续独立发布。

---

## 1. 影响范围

### 1.1 发布内容

| # | 项 | 结论 |
|---|---|---|
| 1.1.1 | 发布模块 | `whatsapp-crm-data`、`whatsapp-crm-api`、`whatsapp-crm-job`、`whatsapp-crm-job2-1-1`（同一版本一起发布） |
| 1.1.2 | 未包含模块 | 前端、`whatsapp-crm-mq`、`whatsapp-openplatform`、`whatsapp-crm-common` 本次无必要改动，`mq` 消费端只是复用 data 的 TagExtractService |
| 1.1.3 | 基线约束 | 禁止把 `test3` / `origin/test3` 合入其他分支；合并出现冲突先停下分析再解决；发布前必须完成本仓库全量编译与聚焦测试 |
| 1.1.4 | 本地验证证据 | 12 个聚焦测试类合并运行退出码 0；`data/api/job/job2-1-1` 串行编译通过；`git diff --check` 通过 |

### 1.2 已实现能力（本轮后端）

| # | 能力 | 说明 |
|---|---|---|
| 1.2.1 | 分类模型 | `category` 新增 `code`、`category_type`（TAG_ONLY/BUSINESS_MATERIAL）、`source_type`（0=AI/1=ADMIN/2=OPERATOR） |
| 1.2.2 | 素材品类 | 普通 HEADER/BODY/FOOTER/BUTTONS 新建时写 Mongo 顶层 `materialCategoryCode`；**已落库素材编辑不修改**；LTO/轮播素材不写品类 |
| 1.2.3 | AI 分类 code | AI 输出 `categoryName/categoryCode`；命中已有分类复用数据库 code；新分类语义化 code 后端校验后落库；存量分类上线前回填兼容 code |
| 1.2.4 | 标签关系 | `tag.source_type`、`tag_relation.source_type/binding_status(0候选/1正式)/extract_log_id`；同素材同标签多来源多条保留，不建唯一约束；AI 重提只替换 AI 来源关系 |
| 1.2.5 | 组合品类收口 | 普通 NORMAL 组合保存前统一收口：真实品类去重 ≤1，写入组合 `material_category_code` 快照；随机池预校验提前到 Mongo 写前；AI 备份组合继承主组合品类 |
| 1.2.6 | 组合预览接口 | `POST /admin/api/material/combination/preview`：随机/人工（`manualCombinations`）候选、虚拟键、已存在在前新增在后、`typeSummary` 三类型摘要、memberFilter |
| 1.2.7 | LTO 生成规则 | 无合格 IMAGE/VIDEO HEADER 时不生成 LTO 组合；正式生成与预览口径一致；LTO 组件合法性沿用既有校验 |
| 1.2.8 | 组合稳定性评级 | 按组合维度复用 UTILITY 占比：非 ACTIVE 组合只计历史口径；Redis 缓存 `material_combination_stability:{id}`；`POST /material/combination/stability/batch`；刷新 Job 游标分页 |
| 1.2.9 | 运营标签提交 | `MessageMaterialReqDTO.tagIds`；新建普通素材校验所选 tag 存在/启用/MATERIAL/与素材品类同分类，写营运来源关系 `source_type=2,binding_status=1,extract_log_id=0`，同一素材同一 tag 去重；编辑既有素材不新增营运关系 |
| 1.2.10 | 品类必选强校验 | 新建 HEADER/BODY/FOOTER/BUTTONS 必填 `materialCategoryCode` 且命中启用 BUSINESS_MATERIAL 分类；既有素材、LTO、轮播 BODY 不要求、不改 |
| 1.2.11 | 前端交互后端契约 | 新增 `GET /admin/api/material/category/list`（品类下拉）、`GET /material/ai/category/myWritePermission`（写权限查询）、`/material/combination/page` 支持 `materialId` 过滤 |

### 1.3 未实现 / 本轮不交付（必须在发布前向业务确认）

| # | 项 | 结论 |
|---|---|---|
| 1.3.1 | 前端页面发布 | 前端已由另一会话实现；上线时前后端需同场联调发布，后端契约已按 1.2.11 补齐 |
| 1.3.2 | 停用组合稳定性口径 | 已按“非 ACTIVE 只计历史”实现（1.2.8），业务无异议即可 |
| 1.3.3 | AI 提取一致性窗口 | “先成功日志、后替换关系”若关系写入失败，日志仍为成功：为 MySQL/Mongo 非同一事务风险，接受或后续补偿 |
| 1.3.4 | 组合稳定性 service 循环引用 | `MessageMaterialCombinationServiceImpl` ↔ `MaterialCombinationStabilityStatsService`：Spring Boot 2.2.6 允许；升级 2.6+ 需改 `@Lazy` 或接口拆分 |

---

## 2. 数据库变更

### 2.1 DDL

脚本：`doc/sql/2026-10-21-material-category-tag.sql`（仓库内为拟议脚本，**执行前必须与现网 DDL 核对列名/索引/字符集**）

```sql
ALTER TABLE `category`
  ADD COLUMN `code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Stable lower snake-case category code' AFTER `name`,
  ADD COLUMN `category_type` varchar(32) NOT NULL DEFAULT 'TAG_ONLY' COMMENT 'Category type: TAG_ONLY/BUSINESS_MATERIAL' AFTER `code`,
  ADD COLUMN `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Source: 0=AI, 1=ADMIN, 2=OPERATOR' AFTER `category_type`;

-- Unique index on category.code. Run ONLY after legacy rows have been backfilled
-- with non-empty unique codes (columns default to '').
ALTER TABLE `category` ADD UNIQUE KEY `uk_category_code` (`code`);

ALTER TABLE `tag`
  ADD COLUMN `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Source: 0=AI, 1=ADMIN, 2=OPERATOR' AFTER `type`;

ALTER TABLE `tag_relation`
  ADD COLUMN `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Source: 0=AI, 1=ADMIN, 2=OPERATOR' AFTER `tag_id`,
  ADD COLUMN `binding_status` tinyint(4) NOT NULL DEFAULT '1' COMMENT 'Binding: 0=candidate, 1=formal' AFTER `source_type`,
  ADD COLUMN `extract_log_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Successful AI extraction log ID' AFTER `binding_status`,
  ADD KEY `idx_entity_source` (`entity_type`, `entity_id`, `source_type`),
  ADD KEY `idx_extract_log_id` (`extract_log_id`);

ALTER TABLE `message_material_combination`
  ADD COLUMN `material_category_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'Material category code snapshot' AFTER `material_template_type`,
  ADD KEY `idx_material_category_code` (`material_category_code`);

-- Re-runnable daily aggregation for operator/AI category and label difference review.
CREATE TABLE `material_category_tag_diff_stat` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `stat_date` varchar(10) NOT NULL DEFAULT '' COMMENT 'Analysis date yyyy-MM-dd',
  `material_category_code` varchar(64) NOT NULL DEFAULT 'UNCATEGORIZED' COMMENT 'Material category code',
  `ai_category_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'AI category code',
  `diff_type` varchar(32) NOT NULL DEFAULT '' COMMENT 'SAME_TAG, SAME_CATEGORY, CROSS_CATEGORY, AI_NEW_CATEGORY, LEGACY_UNCATEGORIZED',
  `material_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Affected material count in this dimension',
  `relation_count` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Raw tag relation count in this dimension',
  `sample_material_ids` text COMMENT 'Bounded JSON array of sample Mongo IDs',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_stat_category_diff` (`stat_date`,`material_category_code`,`ai_category_code`,`diff_type`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Daily material category vs AI tag difference statistics';
```

### 2.2 执行顺序与数据准备

先执行顺序：`加列/加普通索引` → `回填 category.code`（全表 code 非空且无重复）→ `加 uk_category_code 唯一索引` → `建 material_category_tag_diff_stat 表` → 应用发布。

| # | 项 | 操作 |
|---|---|---|
| 2.2.1 | 历史分类 code 回填 | 建唯一索引前逐行生成 `AI_LEGACY_{id}`，须**先检查全表 code 非空且无重复**，再 `ALTER TABLE category ADD UNIQUE KEY uk_category_code (code)` |
| 2.2.2 | 历史来源核对 | 新增列默认按 `0=AI` 处理；上线前需在真实库抽查是否确有“人工/其他来源”分类/标签/关系，若有需修正后再开启按来源删除的 AI 重提逻辑 |
| 2.2.3 | 关系默认值 | `binding_status` 默认 `1`（正式），历史关系视为正式；AI 新写的跨品类候选显式写 `0` |
| 2.2.4 | 执行时机 | 应用发布**前**；测试 → 预发 → 生产 |
| 2.2.5 | DDL 回滚 | 不做 DDL 回滚；字段保留，旧代码不读取 |

> 说明：`material_category_tag_diff_stat` 为差异分析用的新表；由 `Job` 每日可重算写入，当前发布仅先建表，差异分析 Job 及其写入逻辑如与本次后端版本一并发布，则需同步验证该表可重复写入（重跑同一日期同一维度按唯一键覆盖）。

### 2.3 上线后数据校验

```sql
-- 分类 code 非空且唯一（回填后、唯一索引建立后应为 0）
SELECT COUNT(*) FROM category WHERE code = '' OR code IS NULL;
SELECT COUNT(*) FROM (SELECT code FROM category GROUP BY code HAVING COUNT(*)>1) t;

-- 普通组合快照不应残留空串（历史行默认 ''，见 2.4）
SELECT COUNT(*) FROM message_material_combination
WHERE material_template_type='NORMAL' AND material_category_code='';
```

### 2.4 存量数据影响

- 历史普通素材 Mongo 无 `material_category_code`：读作 `UNCATEGORIZED`，不回填；
- 历史组合 `material_category_code` 默认 `''`（SQL 默认值），读取/展示统一转 `UNCATEGORIZED`，不重算；
- 历史 `tag/tag_relation/category` 来源默认 0=AI（依据 2.2.2 核对结论）。

---

## 3. Apollo 配置

| # | Key | 默认值 | 要求 |
|---|---|---|---|
| 3.1 | `material.category.write-whitelist` | 无（缺省全拒） | **上线前必须配置**：逗号分隔 SSO 登录名（`SsoUserVO#getName()`，不带 `@域名`）；空/未配置时分类写接口返回 `code=500, message=Category write permission denied`。修改后调 `GET /admin/api/material/ai/category/myWritePermission` 验证，未热生效需重启 api |
| 3.2 | `material.group.stabilityRules` | 现有 | 组合稳定性复用组级稳定性规则与 Redis TTL/刷新天数；确认现网取值，组合缓存落在同一 Redis |
| 3.3 | `material.ai.tag.system.prompt` 及提取开关 | 现有 | AI 输出格式已改为要求 `categoryCode`，需确认 Prompt 与开关现网状态；若开关关闭，不影响保存链路 |
| 3.4 | `admin.whitelist` | 现有 | 不因本功能改动 |

上线前检查：3.1 名单已配置；3.2/3.3 现网取值已记录。

---

## 4. 上线顺序

| 步骤 | 操作 | 完成判据 |
|---|---|---|
| 1 | 核对现网 DDL 与历史数据来源（2.2.1/2.2.2） | 无人工来源遗漏，code 回填方案确认 |
| 2 | 测试环境：执行 DDL + 回填 code + 唯一索引 → 发布 `data/api/job/job2-1-1` | 分类读写、素材保存、AI 打标、预览、稳定性 batch 正常 |
| 3 | 预发环境：同上 + 回归普通/人工/轮播/LTO 创建与编辑、AI 备用组 | 无跨品类组合生成；无“无头 LTO”组合新增 |
| 4 | 生产环境：先执行 DDL 与回填（应用发布前） | `material_category_code` 等字段存在，唯一索引建立成功 |
| 5 | 生产发布 `data/api/job/job2-1-1`（同版本） | 服务健康；`/material/combination/preview`、`/stability/batch` 可访问 |
| 6 | 生产试点：新建含品类的普通素材模板 → 编辑 → 预览 → 保存 | 组合快照品类正确；预览与保存结果一致 |
| 7 | 生产全量 + 按 §2.3 校验 | code 重复 0；普通组合快照留默认状况符合预期 |

---

## 5. 监控告警

| # | 类型 | 内容 | 判据/阈值 |
|---|---|---|---|
| 5.1 | 日志 | `material combination mixes multiple categories` | 出现即表示有跨品类组合请求被拒绝，量级应接近 0 |
| 5.2 | 日志 | `Skip tag info with invalid category code` | AI 返回非法 code 被跳过，仅告警排查，不影响其余结果 |
| 5.3 | 缓存 | `material_combination_stability:*` 命中/未命中 | 刷新 Job 分批正常，无单 key 大 value |
| 5.4 | Job | `RefreshMaterialCombinationStabilityCacheJob` 失败重抛 | 任务失败能被 XXL-Job 标记 FAIL |
| 5.5 | 权限 | 分类写接口 403 日志 | 白名单外用户写入被拒；名单外高频 403 需人工审视 |

观察窗口：上线后至少观察 24 小时，覆盖一次稳定性刷新周期与一次 AI 提取周期。

---

## 6. 回滚方案

| 步骤 | 操作 |
|---|---|
| 1 | 暂停 `whatsapp-crm-job` / `whatsapp-crm-job2-1-1` 中组合稳定性刷新任务（避免回滚中继续写缓存） |
| 2 | 回滚 `data/api/job/job2-1-1` 到上版本 |
| 3 | **不回滚 DDL**：新增列与索引保留 |
| 4 | 回滚后确认：旧分类管理写接口可用（旧代码不读白名单）；AI 提取旧口径兼容（新列默认值不影响） |
| 5 | 恢复 job 调度 |

回滚影响：已写入的品类快照/标签关系/缓存保留，旧版本不读取新列，无副作用；`/preview`、`/stability/batch` 随应用回滚消失。

---

## 7. 结论确认

| # | 项 | 状态 |
|---|---|---|
| 7.1 | 发布范围（data/api/job/job2-1-1）确认 | ☐ |
| 7.2 | 现网 DDL 核对 + code 回填 + 唯一索引方案确认 | ☐ |
| 7.3 | `material.category.write-whitelist` 名单配置确认 | ☐ |
| 7.4 | 前后端联调及归类管理写白名单确认 | ☐ |
| 7.5 | 上线顺序与回滚演练 | ☐ |
| 7.6 | 监控与 24h 观察窗口负责人 | ☐ |
