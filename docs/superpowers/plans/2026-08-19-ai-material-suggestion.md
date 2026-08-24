# AI 素材模版内容生成建议 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在素材模版创建/编辑时同步生成 AI 部位内容建议，支持采纳/忽略/打分反馈，记录留存用于后续增强。

**Architecture:** 新增两张 MySQL 表（规则表 + 建议记录表），仿照现有 `DisguiseSuggestionAgentService` 的 ReActAgent 模式构建 AI 生成层，新增 4 个 HTTP 接口 + 1 个 XXL-Job 规则导入。配置层新增 Apollo `prompt` namespace 管理所有 AI prompt 文本（动态刷新），开关类配置留在 `BusinessConfig`。回填钩子接入 create/update 主流程但默认关闭。

**Tech Stack:** Java 8, Spring Boot 2.2.6, MyBatis-Plus 3.5.2, Apollo, Solon AI (ReActAgent), JUnit 5 + Mockito, MongoDB

## Global Constraints

- Java 8，所有代码注释用英文
- 不提交 git（验证用 `mvn compile`，不 `git commit`）
- 表结构遵循团队规范：NOT NULL 标量列有默认值，text/decimal 可空，统一 create_time/update_time，create_time 建索引
- PO 字段命名用 `createTime`/`updateTime`（通过 `@TableField` 或 `@TableField(value="create_time")` 映射）
- MySQL IN 批量查询注意分批（数据量大时）
- 测试用裸 JUnit 5 + Mockito（无 Spring context），参考 `TemplateStabilityContentAgentToolsTest` 的 `TableInfoHelper.initTableInfo` 模式
- 包路径：data 模块 `com.opay.occ.whatsapp.data.*`，api 模块 `com.opay.occ.whatsapp.api.*`，common 模块 `com.opay.occ.whatsapp.common.*`
- 路径前缀 `WebConstants.ADMIN_API_PREFIX`（`/admin/api/`）
- 返回值用 `Result<T>`（`com.opay.occ.whatsapp.common.result.Result`）+ `Results.success(data)`

---

## File Structure

### 新建文件

| 文件 | 模块 | 职责 |
|------|------|------|
| `doc/sql/ai_material_suggestion_rule.sql` | root | 规则表 DDL |
| `doc/sql/ai_material_suggestion.sql` | root | 建议记录表 DDL |
| `common/.../enums/SuggestTypeEnum.java` | common | 建议类型枚举 GENERAL/COST_FIRST |
| `common/.../enums/AiSuggestionFeedbackTypeEnum.java` | common | 反馈类型枚举 RATE/ADOPT/REJECT/IGNORE |
| `data/.../entity/po/AiMaterialSuggestion.java` | data | 建议记录 PO |
| `data/.../entity/po/AiMaterialSuggestionRule.java` | data | 规则 PO |
| `data/.../mapper/AiMaterialSuggestionMapper.java` | data | 建议 Mapper |
| `data/.../mapper/AiMaterialSuggestionRuleMapper.java` | data | 规则 Mapper |
| `data/.../entity/dto/request/AiSuggestionGenerateReqDTO.java` | data | generate 请求 |
| `data/.../entity/dto/request/AiSuggestionListReqDTO.java` | data | list 请求 |
| `data/.../entity/dto/request/AiSuggestionFeedbackReqDTO.java` | data | feedback 请求 |
| `data/.../entity/dto/request/AiSuggestionRulePageReqDTO.java` | data | rule-page 请求 |
| `data/.../entity/dto/response/AiSuggestionGenerateRespDTO.java` | data | generate 响应 |
| `data/.../entity/dto/response/AiSuggestionListRespDTO.java` | data | list 响应 |
| `data/.../entity/dto/response/AiSuggestionRuleRespDTO.java` | data | rule-page 响应 |
| `data/.../ai/config/AgentPromptConfig.java` | data | prompt namespace 动态配置 |
| `data/.../ai/dto/AiMaterialSuggestionResult.java` | data | Agent 返回结构化结果 |
| `data/.../ai/service/AiMaterialSuggestionAgentService.java` | data | LLM Agent 生成层 |
| `data/.../ai/tools/AiMaterialSuggestionAgentTools.java` | data | Agent 工具（规则快照/历史样例） |
| `data/.../service/AiMaterialSuggestionService.java` | data | 编排层接口 |
| `data/.../service/impl/AiMaterialSuggestionServiceImpl.java` | data | 编排层实现 |
| `data/.../service/AiMaterialSuggestionRuleService.java` | data | 规则服务接口 |
| `data/.../service/impl/AiMaterialSuggestionRuleServiceImpl.java` | data | 规则服务实现 |
| `api/.../controller/admin/AiMaterialSuggestionController.java` | api | HTTP 接口 |
| `job/.../task/AiMaterialSuggestionRuleImportJob.java` | job | XXL-Job 规则导入 |
| `job2-1-1/.../task/AiMaterialSuggestionRuleImportJob.java` | job2-1-1 | XXL-Job 规则导入（副本） |
| `data/src/test/.../ai/config/AgentPromptConfigTest.java` | data-test | 配置测试 |
| `data/src/test/.../ai/service/AiMaterialSuggestionAgentServiceTest.java` | data-test | Agent 测试 |
| `data/src/test/.../service/impl/AiMaterialSuggestionServiceImplTest.java` | data-test | 编排层测试 |
| `data/src/test/.../service/impl/AiMaterialSuggestionRuleServiceImplTest.java` | data-test | 规则服务测试 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `common/.../config/BusinessConfig.java` | 新增 4 个 @Value 字段 |
| `data/.../entity/dto/request/MessageMaterialReqDTO.java` | 新增 `clientMaterialKey` 字段 |
| `data/.../service/impl/MessageMaterialGroupServiceImpl.java` | create/update 末尾加回填钩子 |
| `api/src/main/resources/application-*.yml`（8 个环境） | namespaces 追加 `llm.yml,prompt` |
| `job/src/main/resources/application-*.yml`（含 llm.yml 的） | namespaces 追加 `prompt` |
| `job2-1-1/src/main/resources/application-*.yml`（含 llm.yml 的） | namespaces 追加 `prompt` |

---

## Task 1: SQL DDL + PO + Mapper

**Files:**
- Create: `doc/sql/ai_material_suggestion_rule.sql`
- Create: `doc/sql/ai_material_suggestion.sql`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/po/AiMaterialSuggestionRule.java`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/po/AiMaterialSuggestion.java`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/mapper/AiMaterialSuggestionRuleMapper.java`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/mapper/AiMaterialSuggestionMapper.java`

**Interfaces:**
- Produces: `AiMaterialSuggestion` PO（字段与 spec 4.2 一致）、`AiMaterialSuggestionRule` PO（字段与 spec 4.1 一致）、两个空 `BaseMapper` 接口

- [ ] **Step 1: Create rule table DDL**

Create `doc/sql/ai_material_suggestion_rule.sql` with the exact DDL from spec section 4.1.

- [ ] **Step 2: Create suggestion table DDL**

Create `doc/sql/ai_material_suggestion.sql` with the exact DDL from spec section 4.2.

- [ ] **Step 3: Create AiMaterialSuggestionRule PO**

```java
package com.opay.occ.whatsapp.data.entity.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.experimental.Accessors;

@TableName("ai_material_suggestion_rule")
@Data
@Accessors(chain = true)
public class AiMaterialSuggestionRule {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String ruleCode;
    private String ruleName;
    private String sourceLane;
    private String materialType;
    private String ruleSource;
    private String ruleType;
    private String ruleContent;
    private Integer priority;
    private Integer enabled;
    private String operator;
    private Long createTime;
    private Long updateTime;
}
```

- [ ] **Step 4: Create AiMaterialSuggestion PO**

```java
package com.opay.occ.whatsapp.data.entity.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.experimental.Accessors;

import java.math.BigDecimal;

@TableName("ai_material_suggestion")
@Data
@Accessors(chain = true)
public class AiMaterialSuggestion {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String clientMaterialKey;
    private String materialType;
    private String suggestType;
    private Integer generationSeq;
    private String sourceLane;
    private Long materialGroupId;
    private String materialId;
    private String originContent;
    private String suggestedContent;
    private String prompt;
    private String ruleSnapshot;
    private String llmRawOutput;
    private BigDecimal score;
    private String scoreReason;
    private Integer status;
    private Integer feedbackType;
    private String feedbackReason;
    private Integer userScore;

    private String regenFeedback;
    private String creator;
    private String updater;
    private Long createTime;
    private Long updateTime;
}
```

- [ ] **Step 5: Create Mappers**

```java
// AiMaterialSuggestionRuleMapper.java
package com.opay.occ.whatsapp.data.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.opay.occ.whatsapp.data.entity.po.AiMaterialSuggestionRule;
public interface AiMaterialSuggestionRuleMapper extends BaseMapper<AiMaterialSuggestionRule> {
}

// AiMaterialSuggestionMapper.java
package com.opay.occ.whatsapp.data.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.opay.occ.whatsapp.data.entity.po.AiMaterialSuggestion;
public interface AiMaterialSuggestionMapper extends BaseMapper<AiMaterialSuggestion> {
}
```

- [ ] **Step 6: Compile**

Run: `mvn compile -pl whatsapp-crm-data -am -q`
Expected: BUILD SUCCESS

---

## Task 2: Enums + DTOs

**Files:**
- Create: `whatsapp-crm-common/src/main/java/com/opay/occ/whatsapp/common/enums/SuggestTypeEnum.java`
- Create: `whatsapp-crm-common/src/main/java/com/opay/occ/whatsapp/common/enums/AiSuggestionFeedbackTypeEnum.java`
- Create: 7 DTO files in `whatsapp-crm-data/.../entity/dto/request/` and `.../response/`
- Create: `whatsapp-crm-data/.../ai/dto/AiMaterialSuggestionResult.java`

**Interfaces:**
- Produces: `SuggestTypeEnum`（GENERAL/COST_FIRST, `fromCode`）、`AiSuggestionFeedbackTypeEnum`（RATE(1)/ADOPT(2)/REJECT(3)/IGNORE(4), `fromName`/`getCode`）、全部请求/响应 DTO、`AiMaterialSuggestionResult`

- [ ] **Step 1: Create SuggestTypeEnum**

```java
package com.opay.occ.whatsapp.common.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum SuggestTypeEnum {
    GENERAL("GENERAL", "General suggestion"),
    COST_FIRST("COST_FIRST", "Cost first suggestion");

    private final String code;
    private final String desc;

    public static SuggestTypeEnum fromCode(String code) {
        if (code == null) return null;
        for (SuggestTypeEnum t : values()) {
            if (t.getCode().equals(code)) return t;
        }
        return null;
    }
}
```

- [ ] **Step 2: Create AiSuggestionFeedbackTypeEnum**

```java
package com.opay.occ.whatsapp.common.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum AiSuggestionFeedbackTypeEnum {
    RATE(1, "Rated"),
    ADOPT(2, "Adopted"),
    REJECT(3, "Rejected"),
    IGNORE(4, "Ignored");

    private final int code;
    private final String desc;

    public static AiSuggestionFeedbackTypeEnum fromName(String name) {
        if (name == null) return null;
        for (AiSuggestionFeedbackTypeEnum t : values()) {
            if (t.name().equals(name)) return t;
        }
        return null;
    }
}
```

- [ ] **Step 3: Create request DTOs**

`AiSuggestionGenerateReqDTO` — fields: `sourceLane`(String, @NotBlank), `materialGroupId`(Long), `clientMaterialKey`(String, @NotBlank), `suggestType`(String, @NotBlank), `materialType`(String, @NotBlank), `materialContent`(inner static class with `type`, `content`, `userFeedback`). Use `@Data`, `@Valid` on materialContent.

`AiSuggestionListReqDTO` — fields: `sourceLane`, `materialType`, `suggestType`, `clientMaterialKey` (all @NotBlank String).

`AiSuggestionFeedbackReqDTO` — fields: `suggestionId`(Long, @NotNull), `feedbackType`(String, optional), `userScore`(Integer, optional), `comment`(String, optional).

`AiSuggestionRulePageReqDTO` — fields: `sourceLane`(String, @NotBlank), `materialType`(String, @NotBlank), `pageNo`(Integer, default 1), `pageSize`(Integer, default 20).

- [ ] **Step 4: Create response DTOs**

`AiSuggestionGenerateRespDTO` — fields: `suggestionId`(Long), `generationSeq`(Integer), `suggestedContent`(String), `score`(BigDecimal), `scoreReason`(String). Use `@Data` + `@Accessors(chain=true)`.

`AiSuggestionListRespDTO` — field: `suggestions`(List of inner static class `SuggestionItem` with `suggestionId`, `generationSeq`, `suggestedContent`, `score`, `scoreReason`).

`AiSuggestionRuleRespDTO` — fields: `id`(Long), `ruleCode`(String), `ruleName`(String), `ruleSource`(String), `ruleType`(String), `priority`(Integer), `enabled`(Boolean).

- [ ] **Step 5: Create AiMaterialSuggestionResult (ai.dto)**

```java
package com.opay.occ.whatsapp.data.ai.dto;

import lombok.Data;
import lombok.experimental.Accessors;
import java.math.BigDecimal;

@Data
@Accessors(chain = true)
public class AiMaterialSuggestionResult {
    private String suggestedContent;
    private BigDecimal score;
    private String scoreReason;
    private String llmRawOutput;
}
```

- [ ] **Step 6: Compile**

Run: `mvn compile -pl whatsapp-crm-data,whatsapp-crm-common -am -q`
Expected: BUILD SUCCESS

---

## Task 3: AgentPromptConfig + BusinessConfig fields

**Files:**
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/config/AgentPromptConfig.java`
- Modify: `whatsapp-crm-common/src/main/java/com/opay/occ/whatsapp/common/config/BusinessConfig.java`
- Test: `whatsapp-crm-data/src/test/java/com/opay/occ/whatsapp/data/ai/config/AgentPromptConfigTest.java`

**Interfaces:**
- Consumes: Apollo `prompt` namespace, `application` namespace
- Produces: `AgentPromptConfig.getSystemPrompt()`, `getUserPromptTemplate()`, `getHistorySamples(String sourceLane, String materialType)`, `reloadAll()`; `BusinessConfig.getAiSuggestionEnabled()`, `getAiSuggestionBackfillEnabled()`, `getAiSuggestionLaneWhitelist()`, `getAiSuggestionRuleImportJson()`

- [ ] **Step 1: Create AgentPromptConfig**

```java
package com.opay.occ.whatsapp.data.ai.config;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.TypeReference;
import com.ctrip.framework.apollo.Config;
import com.ctrip.framework.apollo.model.ConfigChangeEvent;
import com.ctrip.framework.apollo.spring.annotation.ApolloConfig;
import com.ctrip.framework.apollo.spring.annotation.ApolloConfigChangeListener;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
public class AgentPromptConfig {

    private static final String KEY_SYSTEM_PROMPT = "ai_suggestion.system_prompt";
    private static final String KEY_USER_PROMPT_TEMPLATE = "ai_suggestion.user_prompt_template";
    private static final String KEY_HISTORY_SAMPLES = "ai_suggestion.history_samples";

    @ApolloConfig("prompt")
    private Config config;

    @Getter
    private volatile String systemPrompt = "";

    @Getter
    private volatile String userPromptTemplate = "";

    private volatile Map<String, Map<String, String>> historySamples = new HashMap<>();

    @PostConstruct
    public void init() {
        reloadAll();
    }

    @ApolloConfigChangeListener(interestedKeyPrefixes = {"ai_suggestion."})
    public void onChange(ConfigChangeEvent changeEvent) {
        log.info("AgentPromptConfig changed, reloading...");
        reloadAll();
    }

    private void reloadAll() {
        try {
            this.systemPrompt = config.getProperty(KEY_SYSTEM_PROMPT, "");
            this.userPromptTemplate = config.getProperty(KEY_USER_PROMPT_TEMPLATE, "");
            String json = config.getProperty(KEY_HISTORY_SAMPLES, "{}");
            this.historySamples = JSON.parseObject(json,
                    new TypeReference<Map<String, Map<String, String>>>() {});
            log.info("AgentPromptConfig reload success, systemPrompt length={}, historySamples lanes={}",
                    systemPrompt.length(), historySamples.size());
        } catch (Exception e) {
            log.error("AgentPromptConfig reload failed", e);
        }
    }

    /**
     * Get history sample conclusion text for a specific lane and material type.
     * @return conclusion text, or empty string if not configured
     */
    public String getHistorySamples(String sourceLane, String materialType) {
        Map<String, String> laneMap = historySamples.get(sourceLane);
        if (laneMap == null) {
            return "";
        }
        String text = laneMap.get(materialType);
        return StringUtils.isBlank(text) ? "" : text;
    }
}
```

- [ ] **Step 2: Add BusinessConfig fields**

In `BusinessConfig.java`, after the disguise suggestion fields (around line 2112), add:

```java
    // AI material suggestion feature switches (application namespace, Apollo auto-refresh)
    @Value("${ai_suggestion.enabled:false}")
    private Boolean aiSuggestionEnabled;

    @Value("${ai_suggestion.backfill_enabled:false}")
    private Boolean aiSuggestionBackfillEnabled;

    @Value("${ai_suggestion.lane_whitelist:}")
    private String aiSuggestionLaneWhitelist;

    @Value("${ai_suggestion.rule.import.json:[]}")
    private String aiSuggestionRuleImportJson;
```

- [ ] **Step 3: Write AgentPromptConfigTest**

Test that `getHistorySamples` returns correct text when configured, empty string when not. Use reflection to set `config` mock and call `reloadAll()` manually (bypass `@PostConstruct`).

```java
package com.opay.occ.whatsapp.data.ai.config;

import com.ctrip.framework.apollo.Config;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Field;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AgentPromptConfigTest {

    private AgentPromptConfig agentPromptConfig;
    private Config config;

    @BeforeEach
    void setUp() throws Exception {
        agentPromptConfig = new AgentPromptConfig();
        config = mock(Config.class);
        Field configField = AgentPromptConfig.class.getDeclaredField("config");
        configField.setAccessible(true);
        configField.set(agentPromptConfig, config);
    }

    @Test
    void getHistorySamples_returnsTextWhenConfigured() {
        when(config.getProperty("ai_suggestion.system_prompt", "")).thenReturn("sys");
        when(config.getProperty("ai_suggestion.user_prompt_template", "")).thenReturn("tpl");
        when(config.getProperty("ai_suggestion.history_samples", "{}"))
                .thenReturn("{\"MARKETING_DEFAULT\":{\"BODY\":\"sample text\"}}");
        agentPromptConfig.reloadAll();

        assertEquals("sample text", agentPromptConfig.getHistorySamples("MARKETING_DEFAULT", "BODY"));
    }

    @Test
    void getHistorySamples_returnsEmptyWhenNotConfigured() {
        when(config.getProperty("ai_suggestion.system_prompt", "")).thenReturn("");
        when(config.getProperty("ai_suggestion.user_prompt_template", "")).thenReturn("");
        when(config.getProperty("ai_suggestion.history_samples", "{}")).thenReturn("{}");
        agentPromptConfig.reloadAll();

        assertEquals("", agentPromptConfig.getHistorySamples("UNKNOWN_LANE", "BODY"));
    }
}
```

- [ ] **Step 4: Run test**

Run: `mvn test -pl whatsapp-crm-data -Dtest=AgentPromptConfigTest -q`
Expected: Tests pass

- [ ] **Step 5: Compile all**

Run: `mvn compile -pl whatsapp-crm-data,whatsapp-crm-common -am -q`
Expected: BUILD SUCCESS

---

## Task 4: AiMaterialSuggestionRuleService

**Files:**
- Create: `whatsapp-crm-data/.../service/AiMaterialSuggestionRuleService.java`
- Create: `whatsapp-crm-data/.../service/impl/AiMaterialSuggestionRuleServiceImpl.java`
- Test: `whatsapp-crm-data/src/test/.../service/impl/AiMaterialSuggestionRuleServiceImplTest.java`

**Interfaces:**
- Consumes: `AiMaterialSuggestionRuleMapper`（Task 1）
- Produces: `querySnapshot(String sourceLane, String materialType)` → `String`（JSON）, `page(String sourceLane, String materialType, int pageNo, int pageSize)` → `PageResponse<AiSuggestionRuleRespDTO>`, `importFromConfig(String json)` → `int`（导入条数）

- [ ] **Step 1: Create service interface**

```java
package com.opay.occ.whatsapp.data.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.opay.occ.whatsapp.common.page.PageResponse;
import com.opay.occ.whatsapp.data.entity.dto.response.AiSuggestionRuleRespDTO;
import com.opay.occ.whatsapp.data.entity.po.AiMaterialSuggestionRule;

public interface AiMaterialSuggestionRuleService extends IService<AiMaterialSuggestionRule> {

    /**
     * Load enabled rules for a lane+materialType, sorted by priority desc, assembled as JSON string.
     */
    String querySnapshot(String sourceLane, String materialType);

    /**
     * Paginated read-only rule query for troubleshooting.
     */
    PageResponse<AiSuggestionRuleRespDTO> page(String sourceLane, String materialType, int pageNo, int pageSize);

    /**
     * Upsert rules from Apollo JSON config, idempotent by rule_code.
     * @return number of rules processed
     */
    int importFromConfig(String json);
}
```

- [ ] **Step 2: Create service impl**

Key logic:
- `querySnapshot`: `lambdaQuery().eq(sourceLane).eq(materialType).eq(enabled,1).orderByDesc(priority).list()` → assemble each rule's `ruleCode`/`ruleName`/`ruleSource`/`ruleType`/`ruleContent`/`priority` into a JSONArray, return `toJSONString()`. Return `"[]"` if empty.
- `page`: `lambdaQuery().eq(sourceLane).eq(materialType).orderByDesc(priority).page(new Page<>(pageNo,pageSize))` → map to `AiSuggestionRuleRespDTO` list, build `PageResponse`.
- `importFromConfig`: parse JSON array of rule objects, for each: query by `rule_code`, if exists update fields, else insert. Set `createTime`/`updateTime` = `System.currentTimeMillis()`. Return count.

```java
package com.opay.occ.whatsapp.data.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.opay.occ.whatsapp.common.page.PageResponse;
import com.opay.occ.whatsapp.data.entity.dto.response.AiSuggestionRuleRespDTO;
import com.opay.occ.whatsapp.data.entity.po.AiMaterialSuggestionRule;
import com.opay.occ.whatsapp.data.mapper.AiMaterialSuggestionRuleMapper;
import com.opay.occ.whatsapp.data.service.AiMaterialSuggestionRuleService;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AiMaterialSuggestionRuleServiceImpl
        extends ServiceImpl<AiMaterialSuggestionRuleMapper, AiMaterialSuggestionRule>
        implements AiMaterialSuggestionRuleService {

    @Override
    public String querySnapshot(String sourceLane, String materialType) {
        List<AiMaterialSuggestionRule> rules = lambdaQuery()
                .eq(AiMaterialSuggestionRule::getSourceLane, sourceLane)
                .eq(AiMaterialSuggestionRule::getMaterialType, materialType)
                .eq(AiMaterialSuggestionRule::getEnabled, 1)
                .orderByDesc(AiMaterialSuggestionRule::getPriority)
                .list();
        if (CollectionUtils.isEmpty(rules)) {
            return "[]";
        }
        JSONArray array = new JSONArray();
        for (AiMaterialSuggestionRule rule : rules) {
            JSONObject obj = new JSONObject();
            obj.put("ruleCode", rule.getRuleCode());
            obj.put("ruleName", rule.getRuleName());
            obj.put("ruleSource", rule.getRuleSource());
            obj.put("ruleType", rule.getRuleType());
            obj.put("ruleContent", rule.getRuleContent());
            obj.put("priority", rule.getPriority());
            array.add(obj);
        }
        return array.toJSONString();
    }

    @Override
    public PageResponse<AiSuggestionRuleRespDTO> page(String sourceLane, String materialType, int pageNo, int pageSize) {
        Page<AiMaterialSuggestionRule> page = new Page<>(pageNo, pageSize);
        IPage<AiMaterialSuggestionRule> result = lambdaQuery()
                .eq(AiMaterialSuggestionRule::getSourceLane, sourceLane)
                .eq(AiMaterialSuggestionRule::getMaterialType, materialType)
                .orderByDesc(AiMaterialSuggestionRule::getPriority)
                .page(page);
        List<AiSuggestionRuleRespDTO> records = result.getRecords().stream()
                .map(this::toRespDTO)
                .collect(Collectors.toList());
        return new PageResponse<>(pageNo, pageSize, result.getTotal(), records);
    }

    @Override
    public int importFromConfig(String json) {
        if (StringUtils.isBlank(json)) {
            return 0;
        }
        JSONArray array = JSON.parseArray(json);
        if (array.isEmpty()) {
            return 0;
        }
        int count = 0;
        long now = System.currentTimeMillis();
        for (int i = 0; i < array.size(); i++) {
            JSONObject obj = array.getJSONObject(i);
            String ruleCode = obj.getString("ruleCode");
            if (StringUtils.isBlank(ruleCode)) {
                continue;
            }
            AiMaterialSuggestionRule existing = lambdaQuery()
                    .eq(AiMaterialSuggestionRule::getRuleCode, ruleCode)
                    .one();
            if (existing != null) {
                existing.setRuleName(obj.getString("ruleName"));
                existing.setSourceLane(obj.getString("sourceLane"));
                existing.setMaterialType(obj.getString("materialType"));
                existing.setRuleSource(obj.getString("ruleSource"));
                existing.setRuleType(obj.getString("ruleType"));
                existing.setRuleContent(obj.getString("ruleContent"));
                existing.setPriority(obj.getInteger("priority"));
                existing.setEnabled(obj.getIntValue("enabled"));
                existing.setOperator(obj.getString("operator"));
                existing.setUpdateTime(now);
                updateById(existing);
            } else {
                AiMaterialSuggestionRule rule = new AiMaterialSuggestionRule()
                        .setRuleCode(ruleCode)
                        .setRuleName(obj.getString("ruleName"))
                        .setSourceLane(obj.getString("sourceLane"))
                        .setMaterialType(obj.getString("materialType"))
                        .setRuleSource(obj.getString("ruleSource"))
                        .setRuleType(obj.getString("ruleType"))
                        .setRuleContent(obj.getString("ruleContent"))
                        .setPriority(obj.getInteger("priority"))
                        .setEnabled(obj.getIntValue("enabled"))
                        .setOperator(obj.getString("operator"))
                        .setCreateTime(now)
                        .setUpdateTime(now);
                save(rule);
            }
            count++;
        }
        log.info("AiMaterialSuggestionRuleService.importFromConfig processed {} rules", count);
        return count;
    }

    private AiSuggestionRuleRespDTO toRespDTO(AiMaterialSuggestionRule rule) {
        AiSuggestionRuleRespDTO dto = new AiSuggestionRuleRespDTO();
        dto.setId(rule.getId());
        dto.setRuleCode(rule.getRuleCode());
        dto.setRuleName(rule.getRuleName());
        dto.setRuleSource(rule.getRuleSource());
        dto.setRuleType(rule.getRuleType());
        dto.setPriority(rule.getPriority());
        dto.setEnabled(rule.getEnabled() != null && rule.getEnabled() == 1);
        return dto;
    }
}
```

- [ ] **Step 3: Write test for querySnapshot + importFromConfig**

Test `querySnapshot` returns `"[]"` when no rules, returns JSON when rules exist. Mock `baseMapper` via `TableInfoHelper.initTableInfo`. Test `importFromConfig` idempotency (insert then update by rule_code).

- [ ] **Step 4: Run test + compile**

Run: `mvn test -pl whatsapp-crm-data -Dtest=AiMaterialSuggestionRuleServiceImplTest -q`
Run: `mvn compile -pl whatsapp-crm-data -am -q`
Expected: Tests pass, BUILD SUCCESS

---

## Task 5: AiMaterialSuggestionAgentService + Tools

**Files:**
- Create: `whatsapp-crm-data/.../ai/service/AiMaterialSuggestionAgentService.java`
- Create: `whatsapp-crm-data/.../ai/tools/AiMaterialSuggestionAgentTools.java`
- Test: `whatsapp-crm-data/src/test/.../ai/service/AiMaterialSuggestionAgentServiceTest.java`

**Interfaces:**
- Consumes: `ChatModelManager`, `AiMaterialSuggestionRuleService.querySnapshot`（Task 4）, `AgentPromptConfig.getHistorySamples`（Task 3）
- Produces: `AiMaterialSuggestionAgentService.generate(String systemPrompt, String userPrompt)` → `AiMaterialSuggestionResult`; `AiMaterialSuggestionAgentTools.getRuleSnapshot(sourceLane, materialType)` + `getHistorySamples(sourceLane, materialType)`

- [ ] **Step 1: Create AiMaterialSuggestionAgentTools**

Two `@ToolMapping` methods. `getRuleSnapshot` delegates to `ruleService.querySnapshot`. `getHistorySamples` delegates to `agentPromptConfig.getHistorySamples`.

```java
package com.opay.occ.whatsapp.data.ai.tools;

import com.opay.occ.whatsapp.data.ai.config.AgentPromptConfig;
import com.opay.occ.whatsapp.data.service.AiMaterialSuggestionRuleService;
import lombok.extern.slf4j.Slf4j;
import org.noear.solon.ai.annotation.ToolMapping;
import org.noear.solon.ai.annotation.Param;
import org.springframework.stereotype.Component;
import javax.annotation.Resource;

@Slf4j
@Component
public class AiMaterialSuggestionAgentTools {

    @Resource
    private AiMaterialSuggestionRuleService aiMaterialSuggestionRuleService;

    @Resource
    private AgentPromptConfig agentPromptConfig;

    @ToolMapping(description = "Get enabled rule snapshot JSON for a specific source lane and material type")
    public String getRuleSnapshot(
            @Param(description = "Source lane code, e.g. MARKETING_DEFAULT") String sourceLane,
            @Param(description = "Material type: BODY/HEADER/FOOTER") String materialType) {
        log.info("AiMaterialSuggestionAgentTools.getRuleSnapshot called, lane={}, type={}", sourceLane, materialType);
        return aiMaterialSuggestionRuleService.querySnapshot(sourceLane, materialType);
    }

    @ToolMapping(description = "Get history sample conclusion text for a specific source lane and material type")
    public String getHistorySamples(
            @Param(description = "Source lane code, e.g. MARKETING_DEFAULT") String sourceLane,
            @Param(description = "Material type: BODY/HEADER/FOOTER") String materialType) {
        log.info("AiMaterialSuggestionAgentTools.getHistorySamples called, lane={}, type={}", sourceLane, materialType);
        return agentPromptConfig.getHistorySamples(sourceLane, materialType);
    }
}
```

- [ ] **Step 2: Create AiMaterialSuggestionAgentService**

Clone the structure of `DisguiseSuggestionAgentService`: build `ReActAgent` with system prompt + tools, call `agent.prompt(userPrompt).call()`, parse raw output. Parse the LLM JSON output into `AiMaterialSuggestionResult` (extract `suggestedContent`, `score`, `scoreReason` from the JSON, set `llmRawOutput` = raw). Reuse the same `extractSuggestedJson` logic (markdown code block stripping, `<think>`/thinking tag stripping, brace-matching JSON extraction).

```java
package com.opay.occ.whatsapp.data.ai.service;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.opay.occ.whatsapp.data.ai.config.ChatModelManager;
import com.opay.occ.whatsapp.data.ai.dto.AiMaterialSuggestionResult;
import com.opay.occ.whatsapp.data.ai.tools.AiMaterialSuggestionAgentTools;
import lombok.extern.slf4j.Slf4j;
import org.noear.solon.ai.agent.react.ReActAgent;
import org.noear.solon.ai.agent.react.ReActResponse;
import org.noear.solon.ai.chat.ChatModel;
import org.noear.solon.ai.chat.tool.MethodToolProvider;
import org.springframework.stereotype.Service;
import javax.annotation.Resource;
import java.math.BigDecimal;

@Slf4j
@Service
public class AiMaterialSuggestionAgentService {

    @Resource
    private ChatModelManager chatModelManager;

    @Resource
    private AiMaterialSuggestionAgentTools aiMaterialSuggestionAgentTools;

    public AiMaterialSuggestionResult generate(String systemPrompt, String userPrompt) {
        log.info("AiMaterialSuggestionAgentService.generate started");
        ChatModel chatModel = chatModelManager.getDefaultChatModel();
        ReActAgent agent = ReActAgent.of(chatModel)
                .name("ai_material_suggestion_agent")
                .role(systemPrompt)
                .defaultToolAdd(new MethodToolProvider(aiMaterialSuggestionAgentTools))
                .modelOptions(o -> o.temperature(0.0))
                .maxTurns(10)
                .autoRethink(true)
                .build();
        try {
            ReActResponse response = agent.prompt(userPrompt).call();
            String rawContent = response.getContent();
            log.info("AiMaterialSuggestionAgentService.generate LLM response received");
            return parseResult(rawContent);
        } catch (Throwable e) {
            log.error("AiMaterialSuggestionAgentService.generate LLM call failed", e);
            return null;
        }
    }

    AiMaterialSuggestionResult parseResult(String rawOutput) {
        if (rawOutput == null) {
            return null;
        }
        String json = extractSuggestedJson(rawOutput);
        AiMaterialSuggestionResult result = new AiMaterialSuggestionResult();
        result.setLlmRawOutput(rawOutput);
        try {
            JSONObject obj = JSON.parseObject(json);
            result.setSuggestedContent(obj.getString("suggestedContent"));
            String scoreStr = obj.getString("score");
            if (scoreStr != null) {
                result.setScore(new BigDecimal(scoreStr));
            }
            result.setScoreReason(obj.getString("scoreReason"));
        } catch (Exception e) {
            log.warn("Failed to parse LLM output as JSON, raw: {}", rawOutput, e);
            result.setSuggestedContent(rawOutput);
        }
        return result;
    }

    // Copy extractSuggestedJson from DisguiseSuggestionAgentService verbatim
    private String extractSuggestedJson(String rawOutput) {
        // ... identical to DisguiseSuggestionAgentService.extractSuggestedJson
    }
}
```

- [ ] **Step 3: Write test for parseResult**

Test `parseResult` with: plain JSON input, markdown-wrapped JSON (` ```json ... ``` `), thinking-tag-wrapped input, malformed input (fallback to raw). These are pure unit tests, no Spring context needed.

- [ ] **Step 4: Run test + compile**

Run: `mvn test -pl whatsapp-crm-data -Dtest=AiMaterialSuggestionAgentServiceTest -q`
Run: `mvn compile -pl whatsapp-crm-data -am -q`
Expected: Tests pass, BUILD SUCCESS

---

## Task 6: AiMaterialSuggestionService (Orchestration)

**Files:**
- Create: `whatsapp-crm-data/.../service/AiMaterialSuggestionService.java`
- Create: `whatsapp-crm-data/.../service/impl/AiMaterialSuggestionServiceImpl.java`
- Test: `whatsapp-crm-data/src/test/.../service/impl/AiMaterialSuggestionServiceImplTest.java`

**Interfaces:**
- Consumes: `BusinessConfig`（Task 3）, `AiMaterialSuggestionRuleService`（Task 4）, `AiMaterialSuggestionAgentService`（Task 5）, `AgentPromptConfig`（Task 3）, `AiMaterialSuggestionMapper`（Task 1）
- Produces: `generate(AiSuggestionGenerateReqDTO, String operator)` → `AiSuggestionGenerateRespDTO`, `list(AiSuggestionListReqDTO)` → `AiSuggestionListRespDTO`, `feedback(AiSuggestionFeedbackReqDTO)` → `boolean`

- [ ] **Step 1: Create service interface**

```java
package com.opay.occ.whatsapp.data.service;

import com.opay.occ.whatsapp.data.entity.dto.request.AiSuggestionFeedbackReqDTO;
import com.opay.occ.whatsapp.data.entity.dto.request.AiSuggestionGenerateReqDTO;
import com.opay.occ.whatsapp.data.entity.dto.request.AiSuggestionListReqDTO;
import com.opay.occ.whatsapp.data.entity.dto.response.AiSuggestionGenerateRespDTO;
import com.opay.occ.whatsapp.data.entity.dto.response.AiSuggestionListRespDTO;

public interface AiMaterialSuggestionService {
    AiSuggestionGenerateRespDTO generate(AiSuggestionGenerateReqDTO reqDTO, String operator);
    AiSuggestionListRespDTO list(AiSuggestionListReqDTO reqDTO);
    boolean feedback(AiSuggestionFeedbackReqDTO reqDTO);
}
```

- [ ] **Step 2: Create service impl — generate method**

Key logic:
1. Check `businessConfig.getAiSuggestionEnabled()` — if false throw `ServiceException("AI suggestion feature is not enabled")`
2. Check lane whitelist — if whitelist non-empty and `sourceLane` not in it, throw `ServiceException("Source lane not in whitelist")`
3. Validate `sourceLane` via `SourceLaneEnum.fromCode`, `suggestType` via `SuggestTypeEnum.fromCode`
4. Count existing: `lambdaQuery().eq(clientMaterialKey).eq(materialType).eq(suggestType).count()` → if >= 3 throw `ServiceException("Generation limit reached (max 3)")`; `generationSeq = count + 1`
5. Check rules exist: `ruleService.querySnapshot(sourceLane, materialType)` — if `"[]"` throw `ServiceException("No enabled rules for this lane and material type")`
6. Build prompt: system from `agentPromptConfig.getSystemPrompt()`, user from template with placeholders `{ruleSnapshot}`, `{materialType}`, `{originalContent}`, `{userFeedback}`, `{historySamples}` replaced
7. Call `agentService.generate(systemPrompt, userPrompt)` — if null throw `ServiceException("AI generation failed, please retry")`
8. Build `AiMaterialSuggestion` PO: set all fields, `status=0`, `createTime/updateTime=now`, `creator=operator`. Try `save()`, catch `DuplicateKeyException` → throw `ServiceException("Generation limit reached, please retry")`
9. Build response DTO from result + `id` + `generationSeq`

- [ ] **Step 3: Create service impl — list method**

`lambdaQuery().eq(clientMaterialKey).eq(materialType).eq(suggestType).orderByAsc(generationSeq).list()` → map to `AiSuggestionListRespDTO.SuggestionItem` list.

- [ ] **Step 4: Create service impl — feedback method**

1. Query by `suggestionId`, if null throw `ServiceException("Suggestion not found")`
2. `feedbackType` is optional: if present, parse via `AiSuggestionFeedbackTypeEnum.fromName`, if null throw `ServiceException("Invalid feedback type")`; if absent, pure rating without type
3. Allow repeated updates: overwrite `feedbackType` code (if present), `feedbackReason` = comment, `userScore`, `status` = feedbackType code (if present), `updateTime=now`, `updateById`
5. Return true

- [ ] **Step 5: Write tests**

Test generate: mock all dependencies, verify flow (disabled → exception; over limit → exception; success → correct response). Test feedback allows repeated update (re-rating). Test feedback rating without feedbackType. Test list returns ordered results.

- [ ] **Step 6: Run test + compile**

Run: `mvn test -pl whatsapp-crm-data -Dtest=AiMaterialSuggestionServiceImplTest -q`
Run: `mvn compile -pl whatsapp-crm-data -am -q`
Expected: Tests pass, BUILD SUCCESS

---

## Task 7: Controller

**Files:**
- Create: `whatsapp-crm-api/.../controller/admin/AiMaterialSuggestionController.java`

**Interfaces:**
- Consumes: `AiMaterialSuggestionService`（Task 6）, `AiMaterialSuggestionRuleService`（Task 4）, `AuthUtil.getCurrentUserName()`

- [ ] **Step 1: Create controller**

```java
package com.opay.occ.whatsapp.api.controller.admin;

import com.opay.occ.whatsapp.api.config.web.WebConstants;
import com.opay.occ.whatsapp.api.config.web.util.AuthUtil;
import com.opay.occ.whatsapp.common.Results;
import com.opay.occ.whatsapp.common.page.PageResponse;
import com.opay.occ.whatsapp.common.result.Result;
import com.opay.occ.whatsapp.data.entity.dto.request.AiSuggestionFeedbackReqDTO;
import com.opay.occ.whatsapp.data.entity.dto.request.AiSuggestionGenerateReqDTO;
import com.opay.occ.whatsapp.data.entity.dto.request.AiSuggestionListReqDTO;
import com.opay.occ.whatsapp.data.entity.dto.request.AiSuggestionRulePageReqDTO;
import com.opay.occ.whatsapp.data.entity.dto.response.AiSuggestionGenerateRespDTO;
import com.opay.occ.whatsapp.data.entity.dto.response.AiSuggestionListRespDTO;
import com.opay.occ.whatsapp.data.entity.dto.response.AiSuggestionRuleRespDTO;
import com.opay.occ.whatsapp.data.service.AiMaterialSuggestionRuleService;
import com.opay.occ.whatsapp.data.service.AiMaterialSuggestionService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import javax.annotation.Resource;
import javax.validation.Valid;

@RestController
@RequestMapping(WebConstants.ADMIN_API_PREFIX + "ai-suggestion")
@Validated
public class AiMaterialSuggestionController {

    @Resource
    private AiMaterialSuggestionService aiMaterialSuggestionService;

    @Resource
    private AiMaterialSuggestionRuleService aiMaterialSuggestionRuleService;

    @PostMapping("/generate")
    public Result<AiSuggestionGenerateRespDTO> generate(@Valid @RequestBody AiSuggestionGenerateReqDTO reqDTO) {
        return Results.success(aiMaterialSuggestionService.generate(reqDTO, AuthUtil.getCurrentUserName()));
    }

    @PostMapping("/list")
    public Result<AiSuggestionListRespDTO> list(@Valid @RequestBody AiSuggestionListReqDTO reqDTO) {
        return Results.success(aiMaterialSuggestionService.list(reqDTO));
    }

    @PostMapping("/feedback")
    public Result<Boolean> feedback(@Valid @RequestBody AiSuggestionFeedbackReqDTO reqDTO) {
        return Results.success(aiMaterialSuggestionService.feedback(reqDTO));
    }

    @PostMapping("/rule/page")
    public Result<PageResponse<AiSuggestionRuleRespDTO>> rulePage(@Valid @RequestBody AiSuggestionRulePageReqDTO reqDTO) {
        return Results.success(aiMaterialSuggestionRuleService.page(
                reqDTO.getSourceLane(), reqDTO.getMaterialType(), reqDTO.getPageNo(), reqDTO.getPageSize()));
    }
}
```

- [ ] **Step 2: Compile**

Run: `mvn compile -pl whatsapp-crm-api -am -q`
Expected: BUILD SUCCESS

---

## Task 8: Backfill Hook

**Files:**
- Modify: `whatsapp-crm-data/.../entity/dto/request/MessageMaterialReqDTO.java` — add `clientMaterialKey` field
- Modify: `whatsapp-crm-data/.../service/impl/MessageMaterialGroupServiceImpl.java` — add backfill call in `create` and `update`
- Create: `whatsapp-crm-data/.../service/impl/AiMaterialSuggestionBackfillService.java` — isolated backfill logic

**Interfaces:**
- Consumes: `BusinessConfig.getAiSuggestionBackfillEnabled()`, `AiMaterialSuggestionMapper`, `MessageMaterialReqDTO.getClientMaterialKey()`
- Produces: `AiMaterialSuggestionBackfillService.backfill(Long materialGroupId, List<MessageMaterialReqDTO> allMaterials)` — updates `ai_material_suggestion` records by `clientMaterialKey`

- [ ] **Step 1: Add clientMaterialKey to MessageMaterialReqDTO**

Add field:
```java
    /**
     * Frontend stable temp key for AI suggestion association.
     * Used to backfill material_id after save when AI suggestion backfill is enabled.
     */
    private String clientMaterialKey;
```

- [ ] **Step 2: Create AiMaterialSuggestionBackfillService**

```java
package com.opay.occ.whatsapp.data.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.opay.occ.whatsapp.common.config.BusinessConfig;
import com.opay.occ.whatsapp.data.entity.dto.request.MessageMaterialReqDTO;
import com.opay.occ.whatsapp.data.entity.po.AiMaterialSuggestion;
import com.opay.occ.whatsapp.data.mapper.AiMaterialSuggestionMapper;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import javax.annotation.Resource;
import java.util.List;

@Slf4j
@Service
public class AiMaterialSuggestionBackfillService {

    @Resource
    private BusinessConfig businessConfig;

    @Resource
    private AiMaterialSuggestionMapper aiMaterialSuggestionMapper;

    /**
     * Backfill material_id and material_group_id into ai_material_suggestion records
     * by matching clientMaterialKey. Degrades silently on failure to protect main flow.
     */
    public void backfill(Long materialGroupId, List<MessageMaterialReqDTO> materials) {
        if (!Boolean.TRUE.equals(businessConfig.getAiSuggestionBackfillEnabled())) {
            return;
        }
        if (materialGroupId == null || CollectionUtils.isEmpty(materials)) {
            return;
        }
        try {
            for (MessageMaterialReqDTO material : materials) {
                String clientMaterialKey = material.getClientMaterialKey();
                if (StringUtils.isBlank(clientMaterialKey) || StringUtils.isBlank(material.getId())) {
                    continue;
                }
                String materialType = material.getType();
                LambdaUpdateWrapper<AiMaterialSuggestion> wrapper = new LambdaUpdateWrapper<>();
                wrapper.eq(AiMaterialSuggestion::getClientMaterialKey, clientMaterialKey)
                        .eq(AiMaterialSuggestion::getMaterialType, materialType)
                        .set(AiMaterialSuggestion::getMaterialId, material.getId())
                        .set(AiMaterialSuggestion::getMaterialGroupId, materialGroupId)
                        .set(AiMaterialSuggestion::getUpdateTime, System.currentTimeMillis());
                aiMaterialSuggestionMapper.update(null, wrapper);
            }
            log.info("AiMaterialSuggestionBackfillService.backfill completed, materialGroupId={}", materialGroupId);
        } catch (Exception e) {
            log.error("AiMaterialSuggestionBackfillService.backfill failed, materialGroupId={}", materialGroupId, e);
        }
    }
}
```

- [ ] **Step 3: Wire backfill into create method**

In `MessageMaterialGroupServiceImpl.create()`, after `generateMaterialCombinations` / `generateManualMaterialCombinations` and before `return materialGroup.getId();`, add:

```java
        // AI suggestion backfill hook (guarded by switch, degrades silently)
        List<MessageMaterialReqDTO> allMaterials = new ArrayList<>();
        if (CollectionUtils.isNotEmpty(materialCreateReqDTO.getHeaderList())) {
            allMaterials.addAll(materialCreateReqDTO.getHeaderList());
        }
        if (CollectionUtils.isNotEmpty(materialCreateReqDTO.getBodyList())) {
            allMaterials.addAll(materialCreateReqDTO.getBodyList());
        }
        if (CollectionUtils.isNotEmpty(materialCreateReqDTO.getFooterList())) {
            allMaterials.addAll(materialCreateReqDTO.getFooterList());
        }
        aiMaterialSuggestionBackfillService.backfill(materialGroup.getId(), allMaterials);
```

Inject `AiMaterialSuggestionBackfillService` via `@Resource` at class level.

- [ ] **Step 4: Wire backfill into update method**

In `MessageMaterialGroupServiceImpl.update()`, after material update batch completes (after `messageMaterialService.updateBatch(...)`), add the same backfill call with the new/updated materials (those with non-blank id after update).

- [ ] **Step 5: Compile**

Run: `mvn compile -pl whatsapp-crm-data -am -q`
Expected: BUILD SUCCESS

---

## Task 9: Rule Import Job

**Files:**
- Create: `whatsapp-crm-job/.../task/AiMaterialSuggestionRuleImportJob.java`
- Create: `whatsapp-crm-job2-1-1/.../task/AiMaterialSuggestionRuleImportJob.java`

**Interfaces:**
- Consumes: `BusinessConfig.getAiSuggestionRuleImportJson()`, `AiMaterialSuggestionRuleService.importFromConfig(String)`

- [ ] **Step 1: Create job in whatsapp-crm-job**

```java
package com.opay.occ.whatsapp.job.job.task;

import com.opay.occ.whatsapp.common.MDCUtil;
import com.opay.occ.whatsapp.common.config.BusinessConfig;
import com.opay.occ.whatsapp.data.service.AiMaterialSuggestionRuleService;
import com.xxl.job.core.biz.model.ReturnT;
import com.xxl.job.core.handler.annotation.XxlJob;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import javax.annotation.Resource;

@Slf4j
@Component
public class AiMaterialSuggestionRuleImportJob {

    @Resource
    private BusinessConfig businessConfig;

    @Resource
    private AiMaterialSuggestionRuleService aiMaterialSuggestionRuleService;

    @XxlJob("AiMaterialSuggestionRuleImportJob")
    public ReturnT<String> execute() {
        MDCUtil.start();
        log.info("AiMaterialSuggestionRuleImportJob started");
        try {
            String json = businessConfig.getAiSuggestionRuleImportJson();
            int count = aiMaterialSuggestionRuleService.importFromConfig(json);
            log.info("AiMaterialSuggestionRuleImportJob completed, processed {} rules", count);
            return ReturnT.SUCCESS;
        } catch (Exception e) {
            log.error("AiMaterialSuggestionRuleImportJob failed", e);
            return new ReturnT<>(ReturnT.FAIL_CODE, "Job failed: " + e.getMessage());
        } finally {
            MDCUtil.clear();
        }
    }
}
```

- [ ] **Step 2: Create identical job in whatsapp-crm-job2-1-1**

Same code, same package (`com.opay.occ.whatsapp.job.job.task`).

- [ ] **Step 3: Compile both modules**

Run: `mvn compile -pl whatsapp-crm-job,whatsapp-crm-job2-1-1 -am -q`
Expected: BUILD SUCCESS

---

## Task 10: Apollo Namespace Config

**Files:**
- Modify: all `application-*.yml` in `whatsapp-crm-api/src/main/resources/` (8 files) — append `llm.yml,prompt` to `bootstrap.namespaces`
- Modify: all `application-*.yml` in `whatsapp-crm-job/src/main/resources/` that already have `llm.yml` (6 files) — append `prompt`
- Modify: all `application-*.yml` in `whatsapp-crm-job2-1-1/src/main/resources/` that already have `llm.yml` (files with llm.yml) — append `prompt`

- [ ] **Step 1: Update api module yml files**

For each `whatsapp-crm-api/src/main/resources/application-*.yml`, find the `namespaces:` line and append `,llm.yml,prompt` before the line break. Example:

Before: `namespaces: application,datasource.yml,rocketmq.yml,obs.yml,agent.yml,...,blacklist.properties`
After: `namespaces: application,datasource.yml,rocketmq.yml,obs.yml,agent.yml,...,blacklist.properties,llm.yml,prompt`

- [ ] **Step 2: Update job module yml files**

For each `whatsapp-crm-job/src/main/resources/application-*.yml` that has `llm.yml` in the namespaces list, append `,prompt` after `llm.yml`.

- [ ] **Step 3: Update job2-1-1 module yml files**

Same as Step 2 for `whatsapp-crm-job2-1-1/src/main/resources/application-*.yml`.

- [ ] **Step 4: Full project compile**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

---

## Task 11: Final Verification

- [ ] **Step 1: Full project compile**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 2: Run all new tests**

Run: `mvn test -pl whatsapp-crm-data -Dtest="Ai*" -q`
Expected: All tests pass

- [ ] **Step 3: Verify no existing tests broken**

Run: `mvn test -pl whatsapp-crm-data -q`
Expected: No new failures

- [ ] **Step 4: Spec coverage check**

Verify against spec:
- [ ] Two SQL tables created (spec 4.1, 4.2)
- [ ] 4 HTTP endpoints (spec 5.1-5.5)
- [ ] Rule import Job in both job modules (spec 5.6)
- [ ] AgentPromptConfig with dynamic refresh (spec 3.1)
- [ ] BusinessConfig switches (spec 3.2)
- [ ] Namespace config in api/job/job2-1-1 (spec 3.3)
- [ ] Backfill hook in create/update (spec 7.5)
