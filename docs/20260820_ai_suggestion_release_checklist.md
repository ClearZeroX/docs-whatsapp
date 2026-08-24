# AI 素材模版内容生成建议 — 上线清单

## 一、数据库 DDL

在目标环境 MySQL 执行以下两张建表语句（仅新增表，无存量表变更）：

| 序号 | 文件 | 表名 | 说明 |
|------|------|------|------|
| 1 | `doc/sql/ai_material_suggestion_rule.sql` | `ai_material_suggestion_rule` | 泳道规则表，按 source_lane + material_type + suggest_type 区分 |
| 2 | `doc/sql/ai_material_suggestion.sql` | `ai_material_suggestion` | 建议记录表，唯一索引含 source_lane |

**注意事项：**
- 两张表均为新增独立表，不影响存量主表
- 无数据迁移、无存量表结构变更
- 回滚时可保留表结构仅关闭开关，或 DROP TABLE

---

## 二、Apollo 配置

### 2.1 新建 namespace：`prompt.properties`

在各环境 Apollo 控制台手动创建 namespace：
- 名称：`prompt.properties`
- 类型：Properties
- 首次为空，上线后填充以下配置项：

| key | 说明 | 示例值参考 |
|-----|------|-----------|
| `ai_suggestion.system_prompt` | Agent system prompt | 见 `docs/20260819_ai_suggestion_mock_config.md` 第 2 节 |
| `ai_suggestion.user_prompt_template` | Agent user prompt 模板（含占位符） | 同上 |

### 2.2 application namespace 新增配置项

在现有 `application` namespace 中新增以下 4 个配置项：

| key | 说明 | 上线初始值 |
|-----|------|-----------|
| `ai_suggestion.enabled` | 总开关 | `false`（灰度时改 `true`） |
| `ai_suggestion.backfill_enabled` | 回填钩子开关 | `false`（灰度期关闭） |
| `ai_suggestion.lane_whitelist` | 泳道白名单（逗号分隔） | `MARKETING_DEFAULT`（先只开放一个泳道） |
| `ai_suggestion.rule.import.json` | 规则导入 JSON | 见 `docs/20260819_ai_suggestion_mock_config.md` 第 1 节 |
| `ai_suggestion.max_generation` | 每泳道建议次数上限 | `3` |
| `ai_suggestion.llm_timeout_ms` | LLM 同步调用超时（毫秒） | `30000` |

### 2.3 namespace 注册（yml 已改好，无需额外操作）

以下模块的 `application-*.yml` 已在 `bootstrap.namespaces` 中追加 namespace：

| 模块 | 新增 namespace | 文件数 |
|------|---------------|--------|
| whatsapp-crm-api | `llm.yml`, `prompt.properties` | 11 个 yml |
| whatsapp-crm-job | `prompt.properties` | 10 个 yml |
| whatsapp-crm-job2-1-1 | `prompt.properties` | 7 个 yml |

---

## 三、XXL-Job 任务注册

在各环境 XXL-Job 控制台创建以下任务：

| 任务名 | JobHandler | Cron 建议 | 说明 |
|--------|-----------|-----------|------|
| AI素材规则导入 | `AiMaterialSuggestionRuleImportJob` | `0 0 2 * * ?`（每天凌晨2点） | 从 Apollo `ai_suggestion.rule.import.json` 读取并 upsert 规则，按 rule_code 幂等 |

**注意：**
- `whatsapp-crm-job` 和 `whatsapp-crm-job2-1-1` 两个模块各部署一份，根据环境选择对应 handler
- 首次需手动执行一次，将初始规则导入数据库

---

## 四、灰度步骤

按以下顺序逐步开放：

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1 | DDL 建表 | 两张表创建成功 |
| 2 | Apollo 新建 `prompt.properties` namespace，填充 prompt 配置 | 配置可读取，AgentPromptConfig 日志显示 reload success |
| 3 | Apollo `application` 配置 4 个开关项（enabled=false） | 配置可读取 |
| 4 | 部署代码（api + job 模块） | 服务启动正常，无报错 |
| 5 | XXL-Job 注册任务并手动执行一次 | 规则导入成功，查表有数据 |
| 6 | Apollo 改 `ai_suggestion.enabled=true` | 接口可调用 |
| 7 | 用 `MARKETING_DEFAULT` 泳道测试 generate 接口 | 返回建议内容、落库正常 |
| 8 | 测试 list / feedback 接口 | 查询和反馈正常 |
| 9 | Apollo 改 `ai_suggestion.backfill_enabled=true` | create/update 后回填 materialId 正常 |
| 10 | 逐步在 `lane_whitelist` 添加其他泳道 | 各泳道规则隔离正确 |

---

## 五、回滚方案

| 级别 | 操作 | 影响 |
|------|------|------|
| 开关回滚 | Apollo 改 `ai_suggestion.enabled=false` | 接口返回禁用、前端隐藏按钮，无需发版 |
| 回填回滚 | Apollo 改 `ai_suggestion.backfill_enabled=false` | create/update 不再回填，回到存量行为 |
| 代码回滚 | revert 新增的 controller/service/mapper/po | 独立文件，不影响存量功能 |
| 数据回滚 | `TRUNCATE TABLE` 或 `DROP TABLE` 两张新表 | 不影响存量主表数据 |

---

## 六、代码变更清单

### 新增文件

| 模块 | 文件 |
|------|------|
| root | `doc/sql/ai_material_suggestion_rule.sql` |
| root | `doc/sql/ai_material_suggestion.sql` |
| common | `enums/SuggestTypeEnum.java` |
| common | `enums/AiSuggestionFeedbackTypeEnum.java` |
| data | `entity/po/AiMaterialSuggestion.java` |
| data | `entity/po/AiMaterialSuggestionRule.java` |
| data | `mapper/AiMaterialSuggestionMapper.java` |
| data | `mapper/AiMaterialSuggestionRuleMapper.java` |
| data | `entity/dto/request/AiSuggestionGenerateReqDTO.java` |
| data | `entity/dto/request/AiSuggestionListReqDTO.java` |
| data | `entity/dto/request/AiSuggestionFeedbackReqDTO.java` |
| data | `entity/dto/request/AiSuggestionRulePageReqDTO.java` |
| data | `entity/dto/response/AiSuggestionGenerateRespDTO.java` |
| data | `entity/dto/response/AiSuggestionListRespDTO.java` |
| data | `entity/dto/response/AiSuggestionRuleRespDTO.java` |
| data | `ai/dto/AiMaterialSuggestionResult.java` |
| data | `ai/config/AgentPromptConfig.java` |
| data | `ai/service/AiMaterialSuggestionAgentService.java` |
| data | `ai/tools/AiMaterialSuggestionAgentTools.java` |
| data | `service/AiMaterialSuggestionService.java` |
| data | `service/impl/AiMaterialSuggestionServiceImpl.java` |
| data | `service/AiMaterialSuggestionRuleService.java` |
| data | `service/impl/AiMaterialSuggestionRuleServiceImpl.java` |
| data | `service/impl/AiMaterialSuggestionBackfillService.java` |
| data | `src/test/.../ai/config/AgentPromptConfigTest.java` |
| data | `src/test/.../ai/service/AiMaterialSuggestionAgentServiceTest.java` |
| data | `src/test/.../service/impl/AiMaterialSuggestionServiceImplTest.java` |
| data | `src/test/.../service/impl/AiMaterialSuggestionRuleServiceImplTest.java` |
| api | `controller/admin/AiMaterialSuggestionController.java` |
| job | `task/AiMaterialSuggestionRuleImportJob.java` |
| job2-1-1 | `task/AiMaterialSuggestionRuleImportJob.java` |

### 修改文件

| 模块 | 文件 | 改动 |
|------|------|------|
| common | `config/BusinessConfig.java` | 新增 4 个 @Value 开关字段 |
| data | `entity/dto/request/MessageMaterialReqDTO.java` | 新增 `clientMaterialKey` 字段 |
| data | `service/impl/MessageMaterialGroupServiceImpl.java` | create/update 末尾接入回填钩子 |
| api | `application-*.yml`（11 个） | namespaces 追加 `llm.yml,prompt.properties` |
| job | `application-*.yml`（10 个） | namespaces 追加 `prompt.properties` |
| job2-1-1 | `application-*.yml`（7 个） | namespaces 追加 `prompt.properties` |

---

## 七、接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/admin/api/ai-suggestion/generate` | 同步生成建议（支持多泳道） |
| POST | `/admin/api/ai-suggestion/list` | 查询部位全部建议（跨泳道） |
| POST | `/admin/api/ai-suggestion/feedback` | 打分/采纳/拒绝/忽略（支持重新打分与修改反馈） |
| POST | `/admin/api/ai-suggestion/rule/page` | 按泳道+建议类型分页查规则（只读） |

---

## 八、参考文档

| 文档 | 路径 |
|------|------|
| 设计文档 | `docs/superpowers/specs/2026-08-19-ai-material-suggestion-design.md` |
| 实现计划 | `docs/superpowers/plans/2026-08-19-ai-material-suggestion.md` |
| Mock 配置示例 | `docs/20260819_ai_suggestion_mock_config.md` |
