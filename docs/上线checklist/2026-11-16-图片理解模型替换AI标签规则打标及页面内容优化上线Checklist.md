# 图片理解模型替换、AI标签规则打标及页面内容优化上线 Checklist

> 首次写入工具：Codex
> 最近写入工具：Codex
> 日期：2026-11-16
> 表结构变更同步：2026-11-18
> 参考分支：后端 `feature/zlc/20261116-material-image-tag-rule-page`；前端 `feature/zlc/20261116-material-image-tag-rule-page-ui`
> 影响范围：图片素材理解、普通 AI 标签、规则 AI 打标、素材品类/标签管理、素材组合展示、任务按权重分流页面。
> 当前状态：待上线。前端构建和定向测试已通过；后端 `standard=openai-responses` 配置兼容改动已完成，并已通过依赖模块编译验证。完整 Maven 定向单测仍被当前分支已有公共依赖缺失阻塞，尚未满足正式上线条件。

## 1. 数据与中间件变更

### 1.1 数据库变更与数据影响

本次不新增表；`material_category_tag_relation` 新增 `material_group_id`、`material_type` 两个字段及 `idx_material_group_type`、`idx_material_type`、`idx_source_material_page` 三个索引，并更新 `source_type` 注释。发布前必须先执行下方 DDL。

| 表名 | 关键字段 | 读取／写入 | 结构变更 | 业务用途及逻辑变化 |
|---|---|---|---|---|
| `material_category_tag_relation` | `material_group_id`、`material_id`、`material_type`、`material_category_code`、`material_tag_code`、`source_type`、`extract_log_id` | 读写 | 新增两个字段、`idx_material_group_type`、`idx_material_type` 和 `idx_source_material_page`；更新 `source_type` 注释 | AI、RULE、运营新关系写入素材所属包 ID及素材类型；AI/RULE 分别删除重建各自关系；历史记录不回补 |
| `material_tag_rule` | `scope`、`material_category_code`、`prompt_desc`、`status` | 读写 | 无 | `scope=CATEGORY` 进入普通 AI 标签阶段；`scope=RULE` 只进入规则 AI 判定；`scope=RULE` 时 `material_category_code` 必须为空；规则标签 code/name 保存在 `prompt_desc` JSON 的 `tags` 数组 |
| `material_tag` | `code`、`name`、`source_type`、`status` | 读写 | 无 | `source_type` 继续表示标签定义创建来源；新增标签创建时校验 name 以中文开头、只允许中文/英文/数字/英文冒号、长度不超过 64 |
| `material_category` | `code`、`name`、`source_type`、`status` | 读写 | 无 | 新增品类时校验 name；分页查询增加 code、sourceType、status 条件 |
| `tag_extract_log` | `material_group_id`、`material_ids`、`rule_ids`、`request_prompt`、`response_body`、`status` | 写入，排查时读取 | 无 | 普通 AI 和规则 AI 阶段分别记录请求、规则 ID、模型响应、处理数量、耗时和错误信息 |
| `message_material` | `materialCategoryCode`、素材内容 | 读取 | 无 | 规则标签关系的品类来源；图片素材来源图片 URL 和运营保存的品类 |

**执行环境与时机：** 先在测试环境执行并验收，再在目标生产环境发布后端前执行。API、MQ 以及其他读取该关系实体的服务升级前，必须确认新字段已存在，避免 MyBatis 查询或写入报 `Unknown column`。本次仅准备脚本，未执行数据库变更。

**SQL 脚本：** `/Users/opay-20260271/code-temp/whatsapp_crm/doc/sql/2026-11-18-material-category-tag-relation-context.sql`，完整内容如下：

```sql
-- Add material package and material type context for newly written tag relations.
ALTER TABLE `material_category_tag_relation`
  ADD COLUMN `material_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Material package ID' AFTER `id`,
  ADD COLUMN `material_type` varchar(32) NOT NULL DEFAULT '' COMMENT 'Taggable material type' AFTER `material_id`,
  MODIFY COLUMN  `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT '0=AI, 1=admin, 2=operator, 3=rule',
  ADD KEY `idx_material_group_type` (`material_group_id`, `material_type`),
  ADD KEY `idx_material_type` (`material_type`),
  ADD KEY `idx_source_material_page` (`source_type`, `material_group_id`, `material_type`, `material_id`)
```

- 字段顺序：`id -> material_group_id -> material_id -> material_type`。
- `material_group_id` 默认值为 `0`；`material_type` 默认值为空字符串，新增支持值为 `HEADER_TEXT`、`HEADER_IMAGE`、`BODY`。
- 索引：`idx_material_group_type(material_group_id, material_type)`、`idx_material_type(material_type)`、`idx_source_material_page(source_type, material_group_id, material_type, material_id)`。
- `source_type` 仍表示素材打标关系来源，更新注释不会改写原有来源数值。
- DDL 非幂等：执行前核对字段和索引；已执行新增字段语句时不可直接重复执行整份脚本。若部分执行成功，核对实际结构后只执行剩余语句。

**初始化／迁移：** 历史关系不回补，不运行批量 UPDATE 或全量重新打标。新增字段后历史记录保留 `material_group_id=0`、`material_type=''`；后续新写入及显式重新打标生成的关系带上新字段。素材管理页按 Mongo 素材的 `type/subType` 筛选，展示素材类型和素材包 ID不依赖历史关系回填。上线前需要人工核查：

- 现有 `material_tag_rule.scope` 为空或旧值的记录是否按 `CATEGORY` 处理；
- 新增 `RULE` 规则的 `material_category_code` 是否为空；
- `RULE` 规则的 `prompt_desc` 是否为合法 JSON，且包含非空 `tags` 数组；
- `tags[].tagCode` 是否对应启用的 `material_tag`；
- 历史关系中的 `source_type=0/1/2` 不得被改写。

### 1.2 Redis

| Key／前缀 | 中文用途 | 变更类型 | 数据结构及关键内容 | 过期时间 | 读写逻辑及本次变化 |
|---|---|---|---|---|---|
| `material combination stability` 相关现有缓存 | 组合稳定性等级 | 本需求相关但不涉及结构改动 | 现有组合稳定性统计缓存，包含 `stabilityLevel` 等字段 | 以现有实现配置为准，待确认 | 任务按权重分流页面继续通过现有组合稳定性批量接口读取；本次不新增缓存 Key、不改变 TTL |
| 其他素材标签缓存 | 素材品类/标签查询结果 | 本需求相关但不涉及改动 | 现有缓存结构 | 以现有实现为准 | 页面展示复用现有接口和查询结果；本次无额外预热或清理操作 |

**上线操作：** 无。若发布后组合稳定性展示为空，先检查现有稳定性缓存刷新链路和批量接口，不直接清理生产缓存。

### 1.3 RocketMQ

| Topic／Tag | 中文用途 | 变更类型 | 生产服务／Producer Group | 消费服务／Consumer Group | 消息及消费逻辑变化 |
|---|---|---|---|---|---|
| `businessConfig.getRocketMqConfig().getMaterialTagExtractConsumerTopic()` 返回的现有素材标签提取 Topic | 素材包保存后触发素材标签提取 | 本需求相关但不涉及 Topic 结构改动 | 现有素材标签生产逻辑 | 现有素材标签消费逻辑 | 消息字段仍使用 `materialGroupId`；消费者加载素材后执行普通 AI 标签和规则 AI 判定；不新增 Topic、不修改消息结构 |

**上线操作：** 无需创建 Topic 或 Consumer Group。发布应用前确认现有素材标签 Topic、Producer/Consumer 配置和开关可用。规则阶段失败只记录规则阶段错误，不应阻断普通 AI 标签结果。

## 2. Apollo 配置

**Namespace：** `llm.yml`、`prompt.properties`。具体测试/生产 Apollo AppId、Cluster 和生产现值待确认。

| Key | 中文说明 | 变更类型 | 默认值 | 生产环境配置值 |
|---|---|---|---|---|
| `llm.models[name=image-understanding].model` | 图片内容提取模型 | 新增/修改 | `on-premise/deepseek-v4.1-flash` | 目标值：`on-premise/deepseek-v4.1-flash`，上线前确认模型在生产网关可用 |
| `llm.models[name=image-understanding].api-url` | 图片内容提取模型网关地址 | 新增/修改 | 无代码默认值 | 待确认；按截图中的 `llm.models` 结构配置；该模型使用 `/responses` 接口时，`standard` 必须配置为 `openai-responses` |
| `llm.models[name=image-understanding].api-key` | 图片内容提取模型鉴权 | 新增/修改 | 无代码默认值 | 待配置；使用 Apollo 私有配置，不写入代码、日志或 Checklist |
| `llm.models[name=image-understanding].standard` | 图片内容提取模型接口协议；必须与 `api-url` 的接口类型一致 | 新增 | 无代码默认值（未配置时由 Solon 根据 URL 判断） | 使用 `https://routers.opays.ai/api/v0/llm/responses` 时配置 `openai-responses`；使用 `chat/completions` 接口时留空 |
| `llm.models[name=text-understanding].model` | 文本内容理解模型；普通 AI 标签、规则 AI 和 AI 素材建议共用 | 新增/修改 | `on-premise/deepseek-v4.1-flash` | 目标值：`on-premise/deepseek-v4.1-flash`，上线前确认模型在生产网关可用 |
| `llm.models[name=text-understanding].api-url` | 文本内容理解模型网关地址 | 新增/修改 | 无代码默认值 | 待确认；按截图中的 `llm.models` 结构配置；该模型使用 `/responses` 接口时，`standard` 必须配置为 `openai-responses` |
| `llm.models[name=text-understanding].api-key` | 文本内容理解模型鉴权 | 新增/修改 | 无代码默认值 | 待配置；使用 Apollo 私有配置，不写入代码、日志或 Checklist |
| `llm.models[name=text-understanding].standard` | 文本内容理解模型接口协议；必须与 `api-url` 的接口类型一致 | 新增 | 无代码默认值（未配置时由 Solon 根据 URL 判断） | 使用 `https://routers.opays.ai/api/v0/llm/responses` 时配置 `openai-responses`；使用 `chat/completions` 接口时留空 |
| `material.ai.image.understanding.prompt` | 图片结构化理解 Prompt | 新增 | 空字符串 | 待配置；必须使用经过 6 张参考图片验证的完整 Prompt |
| `material.ai.tag.system.prompt` | 普通 AI 标签业务 Prompt | 修改 | 空字符串 | 原有 1～17 条规则加图片理解 JSON 兼容规则；发布前备份生产原值 |
| `material.ai.tag.rule.system.prompt` | 规则 AI 判定 Prompt | 新增 | 空字符串 | 待配置；规则 AI 复用 `text-understanding` 模型连接信息，仅 Prompt 独立 |
| `llm.models[*].enabled` | 是否启用能力模型 | 本需求相关但不涉及结构改动 | `true` | `image-understanding` 和 `text-understanding` 发布前均需启用 |
| `llm.models[*].description` | 能力模型说明 | 本需求相关但不涉及结构改动 | 无 | 建议填写能力说明，不写具体业务页面名称 |

### 2.1 `llm.models` 模型连接配置

模型、URL 和 Key 统一维护在 `llm.yml` 的 `llm.models` 列表中。示例结构如下，`api-key` 只在 Apollo 私有配置中填写真实值：

```yaml
llm:
  models:
    - name: image-understanding
      api-url: https://routers.opays.ai/api/v0/llm
      api-key: <Apollo 私有配置，不写入文档或代码>
      model: on-premise/deepseek-v4.1-flash
      standard: openai-responses
      enabled: true
      description: Image content understanding

    - name: text-understanding
      api-url: https://routers.opays.ai/api/v0/llm
      api-key: <Apollo 私有配置，不写入文档或代码>
      model: on-premise/deepseek-v4.1-flash
      standard: openai-responses
      enabled: true
      description: Text content understanding
```

运行期适配：Apollo 中的 `api-url` 保持网关基址 `https://routers.opays.ai/api/v0/llm`；`ChatModelManager` 在 `standard=openai-responses` 时自动转换为 Solon 可识别的最终地址 `https://routers.opays.ai/api/v0/llm/v1/responses`。该完整链路已在本地 `Test#main` 中连接真实测试网关验证，返回内容可被 Solon 正常解析。

配置约束：

- `image-understanding` 只负责图片内容提取；
- `text-understanding` 负责普通 AI 标签和规则 AI 判定；
- `text-understanding` 的两个 Prompt 分别是普通文本理解和规则判定；
- `name`、`model`、`api-url`、`api-key` 不包含“素材”“标签”等具体业务名称；
- `api-key` 不写入代码、日志、Checklist 或提交内容；
- `text-understanding`、`image-understanding` 的业务调用统一通过 Solon `ChatModel`，不再由 Ark SDK 直接构造 Responses 请求；
- 两个能力模型使用同一套协议字段：`standard: openai-responses` 时由 Solon 选择 Responses 方言；
- `llm.yml` 变更后 `ChatModelManager` 会直接读取 Apollo YAML 原始内容并重新绑定 `llm.models`，再重建模型缓存，无需重启服务；仅调用旧的 `@ConfigurationProperties` 对象会继续读到旧值，这一点已修正；
- 发布后通过 `llm.yml changed, reloading chat models` 和随后的 `llm-model [...] init success` 确认新 model/apiUrl/standard 已生效；
- 网关自定义路径必须在测试/生产分别做真实请求验证，不能仅复制其他环境 URL；
- 已验证测试网关对 `/api/v0/llm/responses` 和 `/api/v0/llm/v1/responses` 均返回 HTTP 200；正式代码使用适配后的 `/v1/responses`，确保命中 Solon 的 Responses 方言规则；
- `api-key` 只配置在 Apollo；`Test#main` 的真实调用通过环境变量 `TEST_LLM_API_KEY` 提供密钥，不在源码中持久化。

### 2.1.0 网关访问控制上线前检查

测试环境 MQ Pod 请求 `https://routers.opays.ai/api/v0/llm/v1/responses` 时，DNS、TCP 443 和 TLS 均正常，但被 Akamai 返回 `HTTP/2 403 Access Denied`：

```text
<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY>
You don't have permission to access
"http://routers.opays.ai/api/v0/llm/v1/responses" on this server.
Reference #18.d84bd617.1794908339.d10e1dff
</BODY></HTML>
```

因此上线前必须完成：

- [ ] 获取测试和生产 API/MQ/Job 服务的实际公网出口 IP。
- [ ] 由模型网关/CDN 管理方确认 `routers.opays.ai` 的 Akamai WAF 是否限制来源 IP、地域、User-Agent、Header 或请求频率。
- [ ] 将需要访问模型的服务器出口 IP/网段加入白名单，或提供允许服务器访问的内网/代理地址。
- [ ] 在测试服务器执行 `curl -v` 验证返回 HTTP 200 且 `Content-Type: application/json`，不能只验证 DNS 和 TLS。
- [ ] 验证失败时保留 Akamai 响应中的 `Reference #`，供网关团队定位具体拒绝规则。
- [ ] 不得通过伪造 User-Agent、绕过 WAF 或复制浏览器凭证规避访问控制。

`ping https://...` 不是有效验证方式；域名连通性应使用 `getent hosts`，HTTPS 请求应使用 `curl` 并检查状态码和响应类型。

### 2.1.1 `text-understanding` 与 `image-understanding` 调用点影响清单

`text-understanding` 是共享能力模型，当前业务使用点如下。发布前需要按用途逐一确认开关、Prompt、模型协议和异常表现。

| 调用链 | 业务用途 | 触发入口 | 当前调用方式 | 失败后的影响与检查点 |
|---|---|---|---|---|
| `MaterialAITagServiceImpl.requestAiModel` | 普通 AI 素材标签提取，以及规则 AI 判定复用同一模型连接 | 素材包保存/后端打标 MQ 消费 | Solon `ChatModel` | 打标失败会中断当前打标事务；检查 `Tag extract failed`、模型响应和 `tag_extract_log` |
| `AiMaterialSuggestionAgentService.generate` | 单条 AI 素材内容建议生成，按规则改写素材文案并返回 `suggestedContent/score/scoreReason` | whatsapp-crm-api 的 AI 素材建议生成接口 | Solon `ChatModel` + `ReActAgent` | 返回 HTML/非 JSON 时会产生空建议或错误建议；检查 `Unexpected character: <`、`score=null` 和 `llm_raw_output` |
| `AiMaterialSuggestionAgentService.generateBatch` | 批量 AI 素材内容建议生成，按批次返回多条建议 | whatsapp-crm-api 的 AI 素材批量建议接口 | Solon `ChatModel` + `ReActAgent` | 批次解析失败会返回空列表并写入失败记录；检查 `Failed to parse LLM batch output` 和批次失败原因 |
| `DisguiseSuggestionAgentService.analyze` | Meta 将历史 UTILITY 模板改判为 MARKETING 后，扫描模板并生成 UTILITY 伪装建议 | `DisguiseSuggestionScanService` 定时任务 | Solon `ChatModel` + `ReActAgent`，最大 10 轮并启用工具调用 | 单模板分析失败会重试后跳过或记录失败；检查 `DisguiseSuggestionScanService`、`DisguiseSuggestionAgentService.analyze LLM call failed` |
| `TemplateStabilityContentAnalysisJobService.executeAnalysis` | 生成 Utility 模板稳定性分析报告和负向清单详情，并推送飞书 | XXL-Job `TemplateStabilityContentAnalysisJobService` | Solon `ChatModel` + `ReActAgent` | 报告为空或任务失败；检查 `TemplateStabilityContentAnalysisJobService.executeAnalysis failed` 和飞书推送内容 |

补充说明：

- `TaskFailureAnalysisJobService` 不硬编码 `text-understanding`，而是调用 `ChatModelManager.getDefaultModelName()` 使用启用的第一个模型；它是模型配置变更的关联风险点，不应误认为固定 `text-understanding` 调用点。
- `MaterialAITagServiceImpl.getImageInfo` 使用 `image-understanding`，通过 Solon 多模态 `ChatModel` 发送图片 URL，用于图片素材内容理解；失败时返回空字符串，不能生成虚构图片标签。
- 所有上述调用统一依赖 `ChatModelManager` 的模型缓存；`llm.yml` 变化后必须确认缓存重建日志，不能只确认 Apollo UI 已保存。

### 2.2 `material.ai.image.understanding.prompt`

**生产配置状态：待确认。** 以下为本次上线目标值，发布前需在生产 Apollo 的 `prompt.properties` namespace 写入，并通过配置读取或服务日志确认生效。

```text
你是营销素材图片理解模型。请对输入图片进行结构化分析，只描述图片中能够直接观察或读取到的信息，不要根据图片推断人物真实身份、国籍、种族、健康状况、宗教或其他不可直接观察的身份属性。

请重点识别以下内容：
1. 图片整体主题、营销目的和视觉风格。
2. 图片中的可见文字，保留原文；能够识别时同时标注语言、金额、币种、利率、期限、日期、时间、品牌、按钮、CTA 和合规文案。
3. 人物数量、成人、儿童等年龄阶段、性别外观呈现、可见肤色外观、真人或卡通/插画/3D 人物类型、服饰、姿态、动作和位置。
4. 商品、手机、App 截图、二维码、金币、日历、扩音器、应用商店按钮等可见物体。
5. 品牌、场景、主色、构图、文字布局和营销利益点。

无法观察或无法确认的信息返回空字符串、空数组或 unknown，不要编造。图片没有可读文字时 visible_text 返回空数组。必须返回纯 JSON，不要返回 Markdown、代码块、解释文字或额外字段。

返回格式：
{
  "image_summary": "图片整体内容摘要",
  "visual_style": "realistic 或 illustration 或 3d-cartoon 或 flat-cartoon 或 other",
  "visible_text": [
    {
      "text": "图片中的原文",
      "language": "语言或 unknown",
      "text_type": "brand 或 headline 或 body 或 amount 或 rate 或 term 或 button 或 cta 或 compliance 或 other"
    }
  ],
  "people": [
    {
      "age_stage": "adult 或 child 或 unknown",
      "gender_presentation": "male 或 female 或 ambiguous 或 unknown",
      "visible_skin_tone": "图片中可见的外观描述或 unknown",
      "appearance_type": "real_person 或 illustration 或 3d-cartoon 或 flat-cartoon 或 unknown",
      "clothing": "服饰描述",
      "pose": "姿态和动作",
      "position": "人物在画面中的位置"
    }
  ],
  "objects": ["可见物体"],
  "brands": ["可见品牌"],
  "marketing_elements": ["可见营销利益点、CTA、按钮或合规信息"],
  "scene": "场景描述",
  "colors": ["主要颜色"],
  "layout": "构图和文字布局",
  "visual_keywords": ["可用于后续标签判断的视觉关键词"]
}
```

### 2.3 `material.ai.tag.system.prompt`

该 Key 分为“生产当前值”和“本次上线目标值”两部分管理：

- 生产当前值：待从生产 Apollo 读取并备份，不能直接使用测试环境值替代；
- 本次上线目标值：以下完整 Prompt，包含当前 1～17 条业务规则和第 18～22 条图片理解兼容规则。

**生产当前值：待确认。**

**本次上线目标值：**

```text
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

【图片理解结果兼容规则】
18、当输入素材的 type=IMAGE 时，content 中的 image_content_info 是上游图片理解模型输出的结构化 JSON，不是无意义的普通字符串。你需要读取其中的 image_summary、visual_style、visible_text、people、objects、brands、marketing_elements、scene、colors、layout 和 visual_keywords 字段。

19、图片中的 visible_text 是图片可见文字的识别结果。应结合文字原文、语言、金额、币种、利率、期限、日期、按钮、CTA、品牌和合规文案提取有明确业务含义的标签。

20、图片中的 people 只用于描述图片中可见的人物外观和画面差异，包括人物数量、成人或儿童等年龄阶段、性别外观呈现、可见肤色外观、真人/插画/3D 卡通/平面卡通类型、服饰、姿态、动作和位置。不要把无法从图片直接确认的信息当作事实，不要编造人物身份属性。

21、图片中的 objects、brands、marketing_elements、scene、colors、layout 和 visual_keywords 可以参与素材品类和业务标签判断。只有字段内容明确支持时才生成对应标签；字段为空、unknown 或图片理解结果为空时，不要猜测或补充信息。

22、对于图片素材，优先使用 image_content_info 中已经识别出的内容完成标签判断，不要要求标签模型重新读取原始图片。图片理解结果为空或不可读时，遵守第 8 条规则，不要编造素材品类和标签。
```

发布前检查：

- [ ] 生产当前值已备份。
- [ ] 目标值完整复制到 `material.ai.tag.system.prompt`，没有截断、转义错误或 Markdown 代码围栏。
- [ ] 普通 AI 标签模型接收到的图片素材内容包含 `content.image_content_info`。
- [ ] 图片理解结果为空或字符串 `null` 时，Prompt 仍要求模型不编造品类和标签。

### 2.4 `material.ai.tag.rule.system.prompt`

**生产配置状态：待确认。** 以下为本次上线目标值，发布前需在生产 Apollo 的 `prompt.properties` namespace 写入，并通过规则 AI 请求验证。

```text
你是素材规则判定模型。请根据输入素材内容和 ruleList，逐个判断每条规则是否命中。

处理要求：
1. 规则只来自输入的 ruleList，不能创建新的 ruleId、tagCode 或 tagName。
2. 只有素材内容明确满足规则时才判定 matched=true；证据不足、内容为空、图片理解结果为空或无法确认时判定 matched=false。
3. type=IMAGE 的素材只能根据 content.image_content_info 中的结构化结果判断，不要要求模型重新读取原始图片。
4. materialCategoryCode 只是素材创建时保存的品类上下文，规则阶段不重新判断、不修改、不返回新的素材品类。
5. 每个输入素材都必须在 materials 中返回结果；没有命中的规则返回空的 ruleMatches 数组。
6. matched=true 时必须给出简短 evidence，evidence 只能引用输入素材中可见或已识别的内容，不要编造。
7. 返回纯 JSON，不要返回 Markdown、代码块、解释文字或额外字段。

返回格式：
{
  "materials": [
    {
      "materialId": "Material ID",
      "ruleMatches": [
        {
          "ruleId": "Rule ID",
          "matched": true,
          "confidence": 0.95,
          "evidence": "命中的素材内容或图片识别内容"
        }
      ]
    }
  ]
}
```

规则配置通过 `material_tag_rule` 表动态传入；Prompt 本身不维护具体规则列表。规则 AI 与普通 AI 标签复用 `llm.models[name=text-understanding]` 的模型连接信息，仅 Prompt 独立。

### 2.5 Apollo Prompt 发布前检查

- [ ] 生产 Apollo 的 `material.ai.image.understanding.prompt` 已配置完整目标值。
- [ ] 生产 Apollo 的 `material.ai.tag.system.prompt` 当前值已备份，完整目标值已发布。
- [ ] 生产 Apollo 的 `material.ai.tag.rule.system.prompt` 已配置完整目标值。
- [ ] 图片理解 Prompt、普通 AI 标签 Prompt、规则 AI Prompt 没有配置到错误 namespace。
- [ ] 普通 AI 和规则 AI 使用同一个标签模型配置。
- [ ] 图片理解模型使用独立模型配置。
- [ ] `image-understanding` 和 `text-understanding` 均通过 Solon `ChatModel` 调用，未走 Ark SDK 直连。
- [ ] `image-understanding` 和 `text-understanding` 的 `api-url` 为 `/responses` 接口时，`standard` 均配置为 `openai-responses`。
- [ ] 修改 `llm.yml` 后无需重启即可完成模型缓存重建，且启动/刷新日志显示实际 dialect、api-url、standard、model。
- [ ] API 和 MQ 服务的 `application-*-{env}.yml` Apollo namespace 均包含 `llm.yml`、`prompt.properties`。
- [ ] 配置刷新后通过 Apollo 读取结果、服务启动日志或一次测试请求确认生效。


## 3. XXL-Job

无新增 Job Handler。现有 `materialTagBackfillJob` 保持参数和发送流程，两个 Job 模块继续复用原有服务。

| 执行器 | Job Handler | 中文说明 | 本次操作 | Cron | 参数 | 初始状态及启用时机 |
|---|---|---|---|---|---|---|
| 现有 `whatsapp-crm-job` / `whatsapp-crm-job2-1-1` 对应执行器，目标环境名称待确认 | `materialTagBackfillJob` | 指定素材包重新打标 | 保持入口和参数；消费侧新关系写入包 ID及类型 | 手动 | 预览：`{"groupIdList":[798],"dryRun":true}`；执行：`{"groupIdList":[798],"dryRun":false}` | 不因本次结构变更新增调度；DDL 和消费服务发布完成后，按需手动触发，798 替换为目标素材包 ID |

**首次执行／历史回补：** 历史数据不回补，无必须执行的首次任务。若后续显式重新打标，仍按原链路 `Job -> MQ -> TagExtractService` 执行；AI、规则阶段沿用素材包上下文生成新关系，运营旧关系不回补、不删除。Job 的 `SUBMITTED` 仅表示消息发送成功，需继续检查消费及关系落库。规则阶段仍受启用规则配置影响。

## 4. 服务发布顺序与关键观测

当前后端完整 Maven 编译和定向单测尚未通过，发布前必须先解决公共依赖编译阻塞。当前已观察到的基线编译错误包括缺失的 `TaskTagEnum`、`AiMaterialSuggestionConstants`、`LimitedTimeOffer`、`ExpirationPolicy`、`LaneConfigDbGrayKeyEnum`、`DirectSendSceneEnum` 及相关常量；这些问题需要先确认是否为工作区基线、依赖构建顺序或分支缺失。

| 步骤 | 具体操作 | 完成判据 |
|---|---|---|
| 1 | 检查后端和前端工作区，确认只包含本次需求改动；确认不包含 `.trae/` 改动 | 两个开发分支 diff 经评审，工作区文件范围符合需求 |
| 2 | 解决后端公共依赖编译阻塞，运行 `mvn -pl whatsapp-crm-data -Dtest=MaterialCategoryV2ServiceTest,MaterialTagServiceTask1Test test -DfailIfNoTests=false` | Maven 能进入测试执行阶段，新增和相关测试通过 |
| 3 | 在目标环境执行第 1.1 节关系表 DDL，核对字段顺序、默认值、三个新增索引及来源注释；不回补历史数据 | `material_group_id` 位于 `id` 后，`material_type` 位于 `material_id` 后；确认 `idx_material_group_type`、`idx_material_type`、`idx_source_material_page` 均存在后才能发布后端 |
| 4 | 在测试 Apollo 配置图片理解模型、图片理解 Prompt、规则 Prompt 和普通 AI Prompt，并为 `/responses` 模型配置 `standard: openai-responses` | 服务加载成功，配置读取值与发布值一致；模型请求命中正确接口且可解析响应 |
| 5 | 发布后端服务 | 服务启动成功，素材标签消费者、AI 素材建议接口和健康检查正常；日志不再出现 HTML 响应导致的 JSON 解析失败 |
| 6 | 发布前端服务 | 页面资源发布成功，素材组合、素材包、品类、标签和规则页面可访问 |
| 7 | 使用文本素材和图片素材触发素材标签流程 | 普通 AI 标签和规则 AI 阶段均有对应日志及 `tag_extract_log` 记录 |
| 8 | 核验新关系上下文和页面展示；如需验证 Job，指定测试素材包手动重打标 | 新 AI/RULE/运营关系的包 ID与素材归属一致，类型映射正确；旧运营关系保留；页面素材包 ID列位于第一列，包 ID和类型筛选生效；历史默认值允许存在 |
| 9 | 观察一轮业务流量和错误指标 | 图片理解空结果、JSON 解析失败、规则 AI 失败、AI 素材建议生成失败和关系写入失败均在阈值内 |

**上线关键观测日志：**

| 观测时机 | 服务／Job | 日志关键字 | 正常表现 | 异常信号及处理 |
|---|---|---|---|---|
| 素材标签消费开始后 | 后端素材标签服务 | `Tag extract completed for materialGroupId` | 普通 AI 标签阶段完成并记录数量/耗时 | 无完成日志或持续失败，暂停继续放量并检查模型、Prompt、输入内容 |
| 图片理解调用失败时 | 后端图片理解服务 | `Image understanding failed` | 无异常或仅少量可解释失败 | 持续出现、返回空结果或 `null`，停止图片素材放量并回滚图片理解配置 |
| 规则阶段失败时 | 后端素材标签服务 | `Rule tag extract failed independently` | 规则失败不影响普通 AI 标签 | 持续失败，保留已有 RULE 关系，暂停规则配置或回滚规则 Prompt |
| 关系批量保存后 | 后端素材标签服务 | `Material category tag batch persistence failed` | 关系保存成功 | 关系写入失败，暂停发布并核查数据库、字段和事务 |
| 消息发送后 | 现有素材标签 MQ 生产服务 | `MaterialTagExtractMqServiceImpl send message success` | 消息发送成功并有 `msgId` | 发送失败，检查 Topic、Producer 配置和 RocketMQ 状态 |
| AI 素材建议生成后 | whatsapp-crm-api | `AiMaterialSuggestionAgentService.generate LLM response received` | 响应为可解析 JSON，建议内容和评分正常落库 | 出现 `Unexpected character: <`、`暂时无法使用模型服务` 或 `score=null`，检查模型 `api-url` 与 `standard` 是否匹配 |
| 修改 `llm.yml` 后 | whatsapp-crm-api / whatsapp-crm-mq | `llm.yml changed, reloading chat models`、`llm-model [...] init success` | 模型缓存重建成功，dialect/apiUrl/standard/model 与目标配置一致 | 无重建日志、YAML 解析失败或仍显示旧 model，检查 Apollo YAML 内容、监听日志和 `llm.models` 结构 |

### 4.1 上线验收数据核对

至少抽查以下数据：

```sql
-- 查询本次素材的三类关系来源；material_id 替换为实际素材 ID。
SELECT material_group_id, material_id, material_type, material_category_code, material_tag_code,
       source_type, binding_status, extract_log_id
FROM material_category_tag_relation
WHERE material_id = '<素材ID>'
ORDER BY source_type, id;

-- 查询规则阶段日志；material_group_id 替换为实际素材包 ID。
SELECT id, material_group_id, material_ids, rule_ids,
       status, extract_count, cost_ms, error_msg, ctime
FROM tag_extract_log
WHERE material_group_id = <素材包ID>
ORDER BY id DESC;
```

预期：

- 新写入关系的 `material_group_id` 与对应素材所属包一致，`material_type` 为对应的 `HEADER_TEXT`、`HEADER_IMAGE` 或 `BODY`；
- 历史关系保留 `0/空字符串` 不视为发布失败；仅针对发布后新写入或显式重打标新生成的关系验收；
- 指定素材包 Job 的 AI/规则关系分别刷新并写入上述字段，不改写既有运营关系；

- 普通 AI 关系为 `source_type=0`；
- 规则关系为 `source_type=3`；
- 运营关系不被自动阶段删除；
- 规则关系的 `material_category_code` 等于素材创建时保存的品类；
- 规则阶段日志包含实际使用的规则 ID和模型响应；
- 图片理解为空时不生成虚构图片标签。

## 5. 回滚方案

**触发条件：** 图片理解持续返回空值或非法 JSON；普通 AI 标签结果明显异常；规则 AI 大量误命中或请求失败；标签关系误删/写入失败；前端页面出现阻断性错误；后端公共依赖编译问题未解决。

按以下顺序执行：

1. 停止继续放量，必要时关闭现有素材标签自动触发开关，避免新增错误关系。
2. 回滚后端和前端服务版本；普通 AI、规则 AI 和图片理解能力按独立组件回滚。
3. 恢复 `material.ai.tag.system.prompt` 原值；图片理解模型切回原 Stable Diffusion 接入；规则 Prompt 恢复为空或上一版本；同时回滚 `llm.models[*].standard`，避免旧版本代码读取到不兼容配置。
4. 规则 AI 只删除/重建 `source_type=3` 关系；普通 AI 只删除/重建 `source_type=0` 关系；不得删除 `source_type=2` 运营关系。
5. 回退应用时保留新增字段、索引和已生成关系数据，不执行 DROP COLUMN、DROP INDEX 或历史数据回补。旧版本实体不使用新字段，旧写入由数据库默认值承接；回退前核对实际目标旧版本。无新增 Redis Key、RocketMQ Topic 或消息格式迁移。
6. 已生成的错误规则关系需要根据 `extract_log_id` 和 `source_type=3` 定位后单独清理；清理 SQL 必须经过评审和备份确认后执行。
7. 恢复原有流程后，使用一组文本素材和图片素材验证普通 AI 标签、运营标签和页面展示均正常，再恢复消息消费和业务入口。

**上线前阻断项：**

- 后端 Maven 编译无法通过；
- 后端新增单测无法执行；
- 生产 Apollo 当前值未核实；
- 图片理解模型账号、网关和 Prompt 未完成真实调用验证；
- `/responses` 模型的 `standard: openai-responses` 未完成测试环境与生产环境配置核对；
- whatsapp-crm-api 和 whatsapp-crm-mq 的 Apollo namespace 未确认包含 `llm.yml`、`prompt.properties`；
- `scope=RULE` 规则数据未完成 JSON 和标签定义校验；
- 数据库关系来源和历史数据影响未完成核对；
- 测试环境端到端联调未通过。
