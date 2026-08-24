# AI 素材模版内容生成建议 — 后端设计文档

## 1. 概述

### 1.1 背景

素材模版（Material Group）创建/编辑时，根据用户录入的部位（body，后续 head/footer）原文，实时生成 AI 建议的部位内容；用户可选择采纳/忽略/打分反馈，这些记录沉淀用于后续 AI 生成增强。最终目标：AI 生成的部位内容质量越高，越能逐步通过 utility 渠道发送更多 marketing 消息。

### 1.2 核心链路

两条闭环链路：

- **实时生成链路**：前端对某个部位发起生成请求，后端同步阻塞加载泳道规则并调用 LLM，直接返回建议内容与自评分。
- **记录留存与反馈链路**：建议记录表 + 规则表留存生成过程与反馈，反馈回流作为后续增强学习的语料。

效果评估（投放漏斗回溯）与增强学习闭环本期暂不实现，延后到建议数据积累到一定量后另开一期。

### 1.3 与初版方案的差异

| 项 | 初版方案 | 本期最终方案 |
|----|----------|-------------|
| 次数控制 | Redis INCR 分配 generationSeq + `/ai-suggestion/remain` 接口 | 去掉 Redis 计数与 remain 接口，改为前端本地统计，后端以唯一索引 + 计数兜底 |
| 反馈打分 | 单独打分接口 | 打分合并进 feedback 接口（feedbackType 可选，userScore 1~5 整数，支持重新打分） |
| 规则管理 | rule/page + rule/save 管理页面 | 规则管理页面暂不做，改为 XXL-Job 从 Apollo 导入/新增规则 |
| 效果评估/增强学习 | 离线评分 + 投放漏斗双闭环 + VikingDB 回流 | 本期暂不做，延后 |

---

## 2. 现状盘点（可复用能力）

| 能力 | 位置 | 复用方式 |
|------|------|---------|
| LLM Agent 框架 | `DisguiseSuggestionAgentService`（ReActAgent + ChatModelManager） | 复用，仿照新建 AI 素材建议 Agent |
| 素材上下文构造 | `MaterialCombinationContentBuilder` | 复用 |
| 泳道枚举 | `SourceLaneEnum`（9 个泳道） | 只读复用 |
| 建议记录扫描 Job 范式 | `DisguiseSuggestionScanService` + `TemplateDisguiseSuggestionScanJob` | 仿照实现规则导入 Job |
| PO/Mapper 范式 | `TemplateDisguiseSuggestion` + 空 XML mapper | 仿照实现新表 PO/Mapper |
| 效果评估 | `QualityEffectReviewServiceImpl`（read/click/loan 漏斗） | 暂不接入，延后 |

两点关键结论决定数据模型：

1. 泳道是素材组必填属性：`validateLaneConfig` 强制 `laneConfigList` 非空并落库到 `message_material_group_lane`，因此规则必须按泳道区分。
2. 部位 material 的 id（Mongo ObjectId）在 Mongo insert 时才生成：生成建议阶段素材尚未落库，因此建议记录不能用 `materialId` 作主标识，改用前端稳定临时 key（`clientMaterialKey`），保存后才回填关联。

---

## 3. 配置层架构

### 3.1 新增 `prompt.properties` Apollo namespace

所有 AI Agent 的 prompt 文本统一放 `prompt.properties` namespace，新建 `AgentPromptConfig` 配置类（位于 `whatsapp-crm-data/ai/config/`）：

- `@ApolloConfig("prompt.properties")` 注入指定 namespace 的 `Config` 对象
- `@ApolloConfigChangeListener(interestedKeyPrefixes = {"ai_suggestion."})` 监听变更，动态刷新内存
- 配置项：
  - `ai_suggestion.system_prompt` — 素材建议 Agent system prompt
  - `ai_suggestion.user_prompt_template` — 素材建议 Agent user prompt 模板（含占位符）
  - `ai_suggestion.history_samples` — 历史样例结论文本（JSON：`Map<sourceLane, Map<materialType, String>>`，由运营/开发根据历史记录总结后手填）
- `getHistorySamples(sourceLane, materialType)`：供 Agent Tools 调用，返回对应维度的结论文本；无配置时返回空串
- 运营在 Apollo `prompt.properties` namespace 改配置后即时生效，无需重启服务

> `prompt.properties` namespace 需在各环境 Apollo 控制台手动创建（Properties 类型），首次为空，上线后运营填充。这是运维操作，不在代码里。

### 3.2 开关类配置留在 `BusinessConfig`（`application` namespace）

Apollo 对 `@Value` 标量配置原生支持热更新，无需额外 listener。

```java
// BusinessConfig 新增字段
@Value("${ai_suggestion.enabled:false}")
private Boolean aiSuggestionEnabled;              // 总开关，默认关闭

@Value("${ai_suggestion.backfill_enabled:false}")
private Boolean aiSuggestionBackfillEnabled;      // 回填钩子开关，默认关闭

@Value("${ai_suggestion.lane_whitelist:}")         // 泳道白名单，逗号分隔
private String aiSuggestionLaneWhitelist;

@Value("${ai_suggestion.rule.import.json:[]}")     // 规则导入 JSON
private String aiSuggestionRuleImportJson;
```

### 3.3 模块 namespace 补充

| 模块 | 现有 | 新增 |
|------|------|------|
| whatsapp-crm-api | （无 llm.yml） | `llm.yml`, `prompt.properties` |
| whatsapp-crm-job | `llm.yml` | `prompt.properties` |
| whatsapp-crm-job2-1-1 | `llm.yml` | `prompt.properties` |

API 模块 yml 的 `bootstrap.namespaces` 追加 `llm.yml,prompt.properties`，使 `ChatModelManager` 和 `AgentPromptConfig` 能在 API 模块初始化。Job 模块追加 `prompt.properties`（`llm.yml` 已有）。

---

## 4. 数据模型

遵循团队表结构规范：NOT NULL 标量列均有默认值；`text` / `decimal` 等无法设默认值的列置为可空；统一带 `create_time` / `update_time`，且 `create_time` 建索引。Java PO 字段统一使用 `createTime` / `updateTime`（通过 `@TableField` 映射 `create_time` / `update_time`），与现有 `TemplateDisguiseSuggestion` 的 `ctime` / `utime` 不同，新表自成体系。

### 4.1 规则表 `ai_material_suggestion_rule`

存储泳道级规则集，按  区分通用/成本优先规则。`rule_source` 对应泳道内排序层级：`LANE`（泳道级规则）、`BUSINESS`（业务/营销级规则）、`AI_SUMMARY`（历史 AI 分析总结建议），另加 `RED_LINE`（审核红线）、`BENEFIT`（利益点，如金额上限）。`rule_content` 先 JSON 化，为后续可视化编排预留。

```sql
CREATE TABLE `ai_material_suggestion_rule` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'primary key',
  `rule_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'unique rule code',
  `rule_name` varchar(128) NOT NULL DEFAULT '' COMMENT 'rule name',
  `source_lane` varchar(32) NOT NULL DEFAULT '' COMMENT 'source lane code',
  `material_type` varchar(32) NOT NULL DEFAULT 'BODY' COMMENT 'material type: BODY/HEADER/FOOTER',
  `suggest_type` varchar(32) NOT NULL DEFAULT '' COMMENT 'suggest type: GENERAL/COST_FIRST',
  `rule_source` varchar(32) NOT NULL DEFAULT '' COMMENT 'rule source: BUSINESS/AI_SUMMARY',
  `rule_type` varchar(32) NOT NULL DEFAULT '' COMMENT 'rule type: CONSTRAINT/SUGGESTION/REFERENCE/RED_LINE',
  `rule_content` text COMMENT 'rule content in JSON for future visual editing',
  `priority` int(11) NOT NULL DEFAULT '0' COMMENT 'sort priority, higher first',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'enabled flag, 1 enabled 0 disabled',
  `operator` varchar(64) NOT NULL DEFAULT '' COMMENT 'operator',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_code` (`rule_code`),
  KEY `idx_lane_material_suggest` (`source_lane`, `material_type`, `suggest_type`, `rule_source`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI material suggestion rule per lane';
```

### 4.2 建议记录表 `ai_material_suggestion`

`client_material_key` 是业务主键，由前端生成（UUID），一个部位输入框一个稳定 key。生成阶段素材未落库，`material_group_id` / `material_id` 允许为空，采纳保存后再回写。唯一索引 `(client_material_key, material_type, suggest_type, source_lane, generation_seq)` 保证每部位每种建议类型每个泳道最多 3 条。

```sql
CREATE TABLE `ai_material_suggestion` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'primary key',
  `client_material_key` varchar(128) NOT NULL DEFAULT '' COMMENT 'frontend stable temp key of one material part',
  `material_type` varchar(32) NOT NULL DEFAULT 'BODY' COMMENT 'material type: BODY/HEADER/FOOTER',
  `suggest_type` varchar(32) NOT NULL DEFAULT '' COMMENT 'suggest type: GENERAL/COST_FIRST',
  `generation_seq` tinyint(4) NOT NULL DEFAULT '1' COMMENT 'generation round, 1-3',
  `source_lane` varchar(32) NOT NULL DEFAULT '' COMMENT 'source lane code',
  `material_group_id` bigint(20) DEFAULT NULL COMMENT 'material group id, empty before saved',
  `material_id` varchar(64) DEFAULT NULL COMMENT 'real material id, empty before saved',
  `origin_content` text COMMENT 'user input material part content',
  `last_suggested_content` text COMMENT 'last AI generated content, empty on first generation',
  `suggested_content` text COMMENT 'AI suggested material part content',
  `prompt` text COMMENT 'full prompt sent to LLM',
  `rule_snapshot` text COMMENT 'used rules JSON snapshot for attribution',
  `llm_raw_output` text COMMENT 'LLM raw output',
  `score` decimal(3,2) DEFAULT NULL COMMENT 'LLM self score 0-5',
  `score_reason` varchar(1024) DEFAULT '' COMMENT 'LLM self score reason',
  `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'record status: 0 pending 1 rated 2 adopted 3 rejected 4 ignored',
  `feedback_type` tinyint(4) DEFAULT NULL COMMENT 'feedback type: 1 rated 2 adopted 3 rejected 4 ignored',
  `feedback_reason` varchar(1024) DEFAULT '' COMMENT 'feedback reason',
  `user_score` int(11) DEFAULT NULL COMMENT 'user score 1-5',
  `regen_feedback` varchar(1024) NOT NULL DEFAULT '' COMMENT 'user feedback used for this regeneration, empty on first generation',
  `creator` varchar(64) DEFAULT NULL COMMENT 'creator',
  `updater` varchar(64) DEFAULT NULL COMMENT 'updater',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_client_material_seq` (`client_material_key`, `material_type`, `suggest_type`, `source_lane`, `generation_seq`),
  KEY `idx_material_id` (`material_id`),
  KEY `idx_source_lane` (`source_lane`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI material suggestion record';
```

### 4.3 PO / Mapper 范式

仿照 `TemplateDisguiseSuggestion` + `TemplateDisguiseSuggestionMapper`：

- `AiMaterialSuggestion` PO：`@TableName("ai_material_suggestion")` + `@Data` + `@Accessors(chain=true)`，`@TableId(type=IdType.AUTO)`
- `AiMaterialSuggestionRule` PO：同上
- `AiMaterialSuggestionMapper` / `AiMaterialSuggestionRuleMapper`：继承 `BaseMapper`，空 XML，用 MyBatis-Plus `LambdaQueryWrapper` 查询

---

## 5. 接口设计

### 5.1 接口总览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/admin/api/ai-suggestion/generate` | 同步生成建议并返回完整结果（本期核心） |
| POST | `/admin/api/ai-suggestion/list` | 查询该部位已生成的全部建议（≤3 条） |
| POST | `/admin/api/ai-suggestion/feedback` | 打分/采纳/拒绝/忽略（打分合并进本接口，支持重新打分） |
| POST | `/admin/api/ai-suggestion/rule/page` | 按泳道+建议类型分页查询规则（只读，用于排查） |
| Job | `AiMaterialSuggestionRuleImportJob` | 从 Apollo 配置导入/新增规则（替代规则管理页面） |

路径前缀用 `WebConstants.ADMIN_API_PREFIX`，与现有 `MessageMaterialController` 一致。接口 `/ai-suggestion/remain` 取消：生成只在素材模版创建时进行，前端本地维护该部位已生成次数、页面请求一次减 1 即可。

### 5.2 POST `/ai-suggestion/generate` — 同步生成建议

「重新生成」即前端用同一 `clientMaterialKey` + `suggestType` 再次调用，后端按已有记录数分配下一个 `generationSeq`。

**请求参数 `AiSuggestionGenerateReqDTO`：**

```json
{
  "sourceLanes": ["MARKETING_DEFAULT", "UTILITY"],
  "materialGroupId": 1001,
  "clientMaterialKey": "body-uuid-abc123",
  "suggestType": "COST_FIRST",
  "materialType": "BODY",
  "materialContent": {
    "type": "TEXT",
    "content": "资金周转困难？找我，最高可借 2000 万",
    "lastSuggestedContent": "资金周转有压力？最高可借 2000 万，最快当天放款。",
    "userFeedback": "不能超过 1500 万"
  }
}
```

参数含义：

- `sourceLanes` — 泳道代码列表，取自 `SourceLaneEnum` 的 9 个泳道。支持传多个泳道，后端按每个泳道分别加载独立规则集并生成建议，泳道之间规则完全隔离。灰度期仅白名单内的泳道会生成，非白名单泳道跳过。
- `materialGroupId` — 素材组 ID，可选。用于泳道一致性校验与历史样例检索。生成阶段素材尚未落库，真正部位标识靠 `clientMaterialKey`。新建素材组时可能为空，编辑已有素材组时传值。
- `clientMaterialKey` — 前端生成的稳定临时标识（UUID），一个部位输入框对应一个 key。生成阶段的业务主键，充当幂等与计数标识。同一 `(clientMaterialKey, materialType, suggestType, sourceLane)` 每个泳道最多生成 3 条，前端按泳道本地统计次数。
- `suggestType` — 建议类型：`GENERAL`（通用）/ `COST_FIRST`（成本优先）。本质是不同规则拼装成不同 prompt，对应前端「通用」「成本优先」按钮。灰度期先只开放 `GENERAL`。
- `materialType` — 部位类型：`BODY` / `HEADER` / `FOOTER`。本期主要做 `BODY`，`HEADER`/`FOOTER` 预留。
- `materialContent.type` — 内容类型，如 `TEXT`。
- `materialContent.content` — 用户录入的部位原文，即需要被 AI 优化的原始内容。第一次请求时只有这个字段。
- `materialContent.lastSuggestedContent` — 上次 AI 生成的内容。第一次请求不带；用户感觉上次生成不好、给了反馈后，「重新生成」时带上，与原始内容和用户反馈一起传给智能体分析，让 AI 知道上次生成了什么、用户为什么不满意。
- `materialContent.userFeedback` — 用户对上一次生成结果的反馈意见。第一次请求不带；用户感觉上次生成不好、给了反馈后，「重新生成」时带上，与原始内容和上次AI生成内容一起传给智能体分析。

**响应 `AiSuggestionGenerateRespDTO`：**

按泳道返回列表，每个泳道一条建议：

```json
{
  "suggestions": [
    {
      "sourceLane": "MARKETING_DEFAULT",
      "suggestionId": 901,
      "generationSeq": 1,
      "suggestedContent": "资金周转有压力？最高可借 2000 万，最快当天放款。",
      "score": 0.92,
      "scoreReason": "命中 R1 合规话术、R5 转化钩子"
    },
    {
      "sourceLane": "UTILITY",
      "suggestionId": 902,
      "generationSeq": 1,
      "suggestedContent": "您的账户可借额度最高 2000 万，详情请咨询。",
      "score": 0.85,
      "scoreReason": "符合 UTILITY 风格，信息明确"
    }
  ]
}
```

**处理流程：**

对 `sourceLanes` 中的每个泳道分别执行以下步骤，汇总结果返回：

1. 灰度校验：`ai_suggestion.enabled` 总开关；泳道白名单过滤，仅白名单内泳道参与生成
2. 校验该 `sourceLane` 合法（`SourceLaneEnum.fromCode`）、`suggestType` 合法、该泳道+部位存在启用规则；不合法的泳道跳过
3. 次数管控：按 `(clientMaterialKey, materialType, suggestType, sourceLane)` 统计已生成条数 → `generationSeq = count + 1`，超过 3 跳过该泳道
4. 加载规则快照：`AiMaterialSuggestionRuleService.querySnapshot(sourceLane, materialType, suggestType)` 按 `priority` 降序组装 JSON
5. 同步调用 Agent：组装 prompt 四段，`AiMaterialSuggestionAgentService.generate()` 返回结构化结果
6. 落库：写入 `ai_material_suggestion`（含 `rule_snapshot` / `llm_raw_output` / `score` / `prompt`），此时 `material_id` 为空
7. 并发兜底：唯一索引 `uk_client_material_seq`（含 `source_lane`），插入冲突时跳过该泳道

### 5.3 POST `/ai-suggestion/list` — 查询该部位全部建议

不再按单个泳道过滤，按 `clientMaterialKey + materialType + suggestType` 查询全部泳道的建议，返回时带 `sourceLane` 字段。

```json
{
  "materialType": "BODY",
  "suggestType": "COST_FIRST",
  "clientMaterialKey": "body-uuid-abc123"
}
```

```json
{
  "suggestions": [
    { "sourceLane": "MARKETING_DEFAULT", "suggestionId": 901, "generationSeq": 1, "suggestedContent": "…", "score": 0.92, "scoreReason": "…" },
    { "sourceLane": "MARKETING_DEFAULT", "suggestionId": 902, "generationSeq": 2, "suggestedContent": "…", "score": 0.88, "scoreReason": "…" },
    { "sourceLane": "UTILITY", "suggestionId": 903, "generationSeq": 1, "suggestedContent": "…", "score": 0.85, "scoreReason": "…" }
  ]
}
```

### 5.4 POST `/ai-suggestion/feedback` — 打分/采纳/拒绝/忽略（合并）

打分不单独接口，与 `feedbackType` 一起写回。

```json
{
  "suggestionId": 901,
  "feedbackType": "ADOPT",
  "userScore": 4,
  "comment": "语义更贴合泳道风格，已采纳"
}
```

```json
{ "success": true }
```

`feedbackType` 可选，∈ `RATE` / `ADOPT` / `REJECT` / `IGNORE`，映射到 `feedback_type`（1/2/3/4）并流转 `status`（1 rated / 2 adopted / 3 rejected / 4 ignored）。纯打分时可不传 `feedbackType`，仅传 `userScore`（1~5 整数）。重复反馈允许覆盖更新：可重新打分或修改反馈内容。

### 5.5 POST `/ai-suggestion/rule/page` — 按泳道分页查询规则（只读）

```json
{
  "sourceLane": "MARKETING_DEFAULT",
  "materialType": "BODY",
  "suggestType": "COST_FIRST",
  "pageNo": 1,
  "pageSize": 20
}
```

```json
{
  "total": 12,
  "rules": [
    { "id": 1001, "ruleCode": "MKT_R01", "ruleName": "合规红线", "suggestType": "COST_FIRST", "ruleSource": "BUSINESS", "ruleType": "CONSTRAINT", "priority": 90, "enabled": true }
  ]
}
```

### 5.6 XXL-Job `AiMaterialSuggestionRuleImportJob` — 规则导入/新增

仿 `TemplateDisguiseSuggestionScanJob` 范式，在 `whatsapp-crm-job` 和 `whatsapp-crm-job2-1-1` 两个模块各放一份（用于不同环境）。

- 从 `BusinessConfig.aiSuggestionRuleImportJson` 读取规则 JSON 数组
- 按 `rule_code` 幂等 upsert（存在则更新，不存在则插入），`enabled` / `priority` / `rule_content` 等字段覆盖
- 重复执行不产生脏数据
- Cron 由 XXL-Job 控制台配置

---

## 6. 核心流程

整个过程分两个阶段闭环：

**第一阶段（建议生成，素材未落库）：** 前端先生成稳定的临时标识 `clientMaterialKey`，本地统计该部位已生成次数，达到 3 次即禁用生成按钮（不需后端计数）。未超限则同步调用 `/ai-suggestion/generate`。后端校验泳道与建议类型，对每个泳道按 `(clientMaterialKey, materialType, suggestType, sourceLane)` 已有记录数计算 `generationSeq`（每个泳道超过 3 跳过，唯一索引兜底），加载该泳道+部位的独立规则集并组装 prompt（四段：System 角色、泳道规则 JSON、用户原部位内容、历史优质样例），同步阻塞调用 Agent 返回建议，并把建议（含规则快照、LLM 原始输出、自评分）落库，此时 `materialId` 为空，由 `clientMaterialKey` 充当幂等/计数主键。

**第二阶段（采纳反馈 + 保存关联，生成 materialId）：** 用户采纳时前端把建议回填到部位输入框，并调用 `/ai-suggestion/feedback` 将 `feedbackType` 与 `userScore` 合并写回。用户点击「新建/保存」后创建素材模版记录，此时 Mongo insert 才生成真实的 `materialId` / `materialGroupId`；后端按 `clientMaterialKey` 回填关联建议记录，为后续按 `materialId` 回溯投放漏斗（延后）做准备。

---

## 7. 核心服务层

### 7.1 编排层 `AiMaterialSuggestionService`

核心职责，串联整个 generate 流程：

- 灰度校验（总开关 + 泳道白名单）
- 校验 `sourceLane` / `suggestType` 合法性、规则存在性
- 次数管控：按 `sourceLanes` 遍历，每个泳道 `count(clientMaterialKey, materialType, suggestType, sourceLane)` → `generationSeq`，超 3 跳过该泳道
- 加载规则快照 → 组装 prompt 四段 → 调用 Agent
- 每个泳道落库（含 `rule_snapshot` / `llm_raw_output` / `prompt` / `score` / `scoreReason` / `regen_feedback`），并发兜底靠唯一索引（含 `source_lane`）
- `feedback`：查记录 → 写回 `feedback_type` / `user_score` / `feedback_reason` / 流转 `status`，允许重复更新（重新打分或修改反馈）
- `list`：按四元组查询建议列表，返回含 `userScore` / `feedbackType` / `feedbackReason` / `status` 以支持前端回显评分与反馈状态

### 7.2 规则加载层 `AiMaterialSuggestionRuleService`

- `querySnapshot(sourceLane, materialType, suggestType)`：仅加载该泳道+部位+建议类型下全部 `enabled=1` 规则，按 `priority` 降序组装成 JSON 快照字符串，泳道/部位/建议类型之间完全隔离
- `page(sourceLane, materialType, suggestType, pageNo, pageSize)`：只读分页查询
- `importFromConfig(String json)`：从 Apollo JSON 按 `rule_code` 幂等 upsert

### 7.3 AI 生成层 `AiMaterialSuggestionAgentService` + `AiMaterialSuggestionAgentTools`

仿 `DisguiseSuggestionAgentService`，用 `ReActAgent` + `ChatModelManager.getDefaultChatModel()`：

- `generate(systemPrompt, userPrompt)` → `AiMaterialSuggestionResult`（含 `suggestedContent` / `score` / `scoreReason` / `llmRawOutput`）
- 复用 `extractSuggestedJson` 的 JSON 解析逻辑（markdown 代码块剥离、`thinking` 标签剥离、纯 JSON 兜底）
- `AiMaterialSuggestionAgentTools` 提供 `@ToolMapping`：
  - `getRuleSnapshot(sourceLane, materialType, suggestType)` — 返回规则快照 JSON
  - `getHistorySamples(sourceLane, materialType)` — 从 `AgentPromptConfig` 读取历史样例结论文本，无配置返回空串

### 7.4 prompt 四段组装

| 段 | 内容 | 来源 |
|----|------|------|
| System 角色 | Agent 身份与输出格式约束 | `AgentPromptConfig.aiMaterialSuggestionSystemPrompt` |
| 泳道规则 | 该泳道+部位+建议类型规则 JSON 快照 | `RuleService.querySnapshot` |
| 用户原内容 | 部位原文 + `lastSuggestedContent`（如有） + `userFeedback`（如有） | 请求 `materialContent` |
| 历史样例 | 历史 AI 分析总结结论 | `AgentPromptConfig.getHistorySamples` |

`GENERAL` / `COST_FIRST` 映射为不同规则集拼装，本质是不同规则 → 不同 prompt。

### 7.5 回填钩子

在 `MessageMaterialGroupServiceImpl.create` / `update` 方法末尾，当 `ai_suggestion.backfill_enabled=true` 时，按素材组的 `clientMaterialKey` 回写建议记录的 `material_id` / `material_group_id`。钩子用 try-catch 降级，回填失败不影响主保存事务。灰度期默认关闭，仅验证生成与反馈链路。

### 7.6 新增文件清单

| 层 | 文件 | 模块 |
|----|------|------|
| sql | `ai_material_suggestion_rule.sql` / `ai_material_suggestion.sql` | `doc/sql` |
| po | `AiMaterialSuggestion` / `AiMaterialSuggestionRule` | whatsapp-crm-data |
| mapper | `AiMaterialSuggestionMapper` / `AiMaterialSuggestionRuleMapper` | whatsapp-crm-data |
| service | `AiMaterialSuggestionService(Impl)` / `AiMaterialSuggestionRuleService(Impl)` | whatsapp-crm-data |
| ai.config | `AgentPromptConfig` | whatsapp-crm-data |
| ai.service | `AiMaterialSuggestionAgentService` | whatsapp-crm-data |
| ai.tools | `AiMaterialSuggestionAgentTools` | whatsapp-crm-data |
| ai.dto | `AiMaterialSuggestionResult` | whatsapp-crm-data |
| dto | 请求/响应 DTO（generate/list/feedback/rule-page） | whatsapp-crm-data |
| controller | `AiMaterialSuggestionController` | whatsapp-crm-api |
| job | `AiMaterialSuggestionRuleImportJob` | whatsapp-crm-job + whatsapp-crm-job2-1-1 |

---

## 8. Prompt 示例

### 8.1 System Prompt（配置 key: `ai_suggestion.system_prompt`）

```
你是一位 WhatsApp 营销内容优化专家，擅长在合规前提下提升消息转化率。

你的任务是：根据用户提供的素材部位原文、泳道规则和历史经验，生成优化后的部位内容建议。

规则：
1. 严格遵守泳道规则中的红线约束（合规、金额上限等），不得违反
2. 保持原文核心信息不变，优化表达方式、语气和转化钩子
3. 输出语言必须与用户原始内容（originalContent）的语言保持完全一致。支持的语言：Bahasa Indonesia、Nigeria（尼日利亚英语/皮津语）、English、中文。不得自行切换语言，例如用户输入中文则必须输出中文建议
4. 输出必须为纯 JSON，不要包含 markdown 代码块标记或 thinking 标签
5. 如果用户提供了反馈意见（userFeedback），必须在本次建议中体现该反馈
6. 如果提供了上次AI生成内容（lastSuggestedContent）和用户反馈（userFeedback），需对比原始内容与上次生成内容，分析用户不满的原因并据此改进

输出格式（纯 JSON）：
{
  "suggestedContent": "优化后的部位内容",
  "score": 0.00-5.00,
  "scoreReason": "评分理由，说明命中了哪些规则"
}
```

### 8.2 User Prompt 模板（配置 key: `ai_suggestion.user_prompt_template`）

```
请为以下素材部位生成优化建议：

【泳道规则】
{ruleSnapshot}

【用户原内容】
类型：{materialType}
内容：{originalContent}

【上次AI生成内容】
{lastSuggestedContent}

【用户反馈】
{userFeedback}

【历史经验总结】
{historySamples}

请根据以上信息，生成优化后的部位内容，并给出自评分与评分理由。
```

说明：
- `{ruleSnapshot}` 由 `RuleService.querySnapshot` 填充，为该泳道+部位的规则 JSON
- `{materialType}` 为 BODY/HEADER/FOOTER
- `{originalContent}` 为用户录入的部位原文
- `{lastSuggestedContent}` 第一次请求为空，重新生成时填入上次 AI 生成内容
- `{userFeedback}` 第一次请求为空，重新生成时填入用户反馈
- `{historySamples}` 由 `AgentPromptConfig.getHistorySamples` 填充，无配置时为空

### 8.3 历史样例配置示例（配置 key: `ai_suggestion.history_samples`）

```json
{
  "MARKETING_DEFAULT": {
    "BODY": "经验结论：1. 避免使用'困难''急需'等负面词汇；2. 强调'最快当天放款'提升转化；3. 金额表述不超过 1500 万更易通过审核；4. 结尾加行动号召语。",
    "HEADER": "经验结论：标题简短有力，不超过 20 字，突出核心利益点。"
  },
  "COLLECTION_CHAT": {
    "BODY": "经验结论：催收话术需礼貌但明确，避免威胁性表达，给出具体还款方案。"
  }
}
```

---

## 9. 灰度方案

1. **总开关** `ai_suggestion.enabled`（默认关闭）：controller/service 入口判断，关闭时返回「功能未开放」，前端隐藏生成按钮
2. **泳道白名单** `ai_suggestion.lane_whitelist`：仅白名单泳道开放，先以 `MARKETING_DEFAULT` 试跑，逐步放开其他泳道
3. **建议类型灰度**：先只开放 `GENERAL`，`COST_FIRST` 待规则打磨后再放开
4. **回填钩子** `ai_suggestion.backfill_enabled`（默认关闭）：灰度期关闭，仅验证生成与反馈链路
5. 天然低风险：新表 + 新接口完全独立，不侵入 create/update 主流程；回填钩子受开关控制

---

## 10. 回滚方案

1. **开关回滚**：关闭 `ai_suggestion.enabled` 立即生效，接口返回禁用、前端隐藏按钮，无需发版
2. **代码回滚**：新增 controller/service/mapper/po 均独立文件，可整体 revert；回填钩子受开关控制，关闭即回到存量行为
3. **数据回滚**：`ai_material_suggestion` / `ai_material_suggestion_rule` 为新增独立表，不影响存量主表；可保留表结构仅关闭开关，或清理灰度数据
4. **无 DDL 风险**：仅新增两张表，无存量表结构变更、无数据迁移

---

## 11. 测试重点

### 11.1 本次新增内容

1. **规则加载与隔离**：不同泳道/部位/建议类型返回独立规则集，按 `priority` 排序、`enabled` 过滤正确；`rule_snapshot` 与加载结果一致并落库
2. **generate 同步返回**：prompt 四段组装正确（含 `lastSuggestedContent` + `userFeedback` 拼接）；LLM 结构化输出解析正确（markdown 代码块剥离、`thinking` 标签剥离、纯 JSON 兜底）
3. **次数控制**：同一 `(clientMaterialKey, materialType, suggestType, sourceLane)` 每个泳道最多生成 3 条；多泳道并发时唯一索引（含 `source_lane`）兜底不超限；`generationSeq` 按泳道独立递增正确
4. **建议记录落库**：`clientMaterialKey` / `generationSeq` / `ruleSnapshot` / `llmRawOutput` / `score` / `scoreReason` 字段完整
5. **feedback 打分反馈**：`feedbackType` 可选，与 `userScore` 一起写回，`status` 流转正确；允许重复更新（重新打分/修改反馈）；纯评分（不传 `feedbackType`）正常
6. **保存后回填**：create/update 后按 `clientMaterialKey` 回填 `materialId` 正确；回填失败不影响主保存流程（降级处理）
7. **规则导入 Job**：按 `rule_code` 幂等 upsert，重复执行不产生脏数据
8. **Apollo 动态刷新**：`prompt.properties` namespace 配置更新后，不重启即生效

### 11.2 可能影响的现有流程

1. **LLM 资源竞争**：复用 `ChatModelManager`，与 `DisguiseSuggestionScanService` 共享模型与配额；同步阻塞接口需设置 LLM 超时，避免拖垮线程池
2. **create/update 主流程回归**：若启用回填钩子，需回归材料创建/更新全链路（含 RANDOM/MANUAL 组合生成），确认新增钩子不抛异常中断事务
3. **泳道数据只读**：读取 `SourceLaneEnum` 与 `message_material_group_lane` 不影响现有数据
4. **无存量表结构变更**：新表 DDL 上线不影响存量表与现有 Job
