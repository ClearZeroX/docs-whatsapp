# Template 内容稳定性分析 Agent 实现计划

> **对于 agentic worker：** REQUIRED SUB-SKILL：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐个任务实现。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 构建一个 Solon ReActAgent，通过对比稳定/不稳定模板的 components 内容特征，自动分析内容与稳定性之间的关系，产出可配置规则建议报告。

**架构：** XXL-Job 触发 → JobService → ReActAgent → Tool 查询数据 → LLM 分析内容特征 → 飞书卡片通知。Agent 在 `whatsapp-crm-data` 模块，Job Handler 在 `whatsapp-crm-job` 模块。数据查询采用游标分页 + 分批 IN 避免性能问题。

**技术栈：** Java 8+, Spring Boot, MyBatis-Plus, Solon AI ReActAgent, XXL-Job, Apollo, Feishu Webhook

---

## 全局约束

- 数据查询必须分页，批次大小使用 `BusinessConfig.batchQueryMysqlSize`（默认 500）
- waba 批量查询复用 `messageTemplateWabaService.batchQueryByTemplateIds()`
- 不提交 git，不改动已有代码结构
- 所有新增文件遵循项目现有包命名规范

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `whatsapp-crm-data/.../xxljob/TemplateStabilityContentAnalysisJobService.java` | Job 入口 Service，从 BusinessConfig 读开关，驱动 Agent 分析并发报告 |
| `whatsapp-crm-data/.../ai/service/TemplateStabilityContentAgentService.java` | ReActAgent 封装，接收 Tool 数据后让 LLM 分析内容特征 |
| `whatsapp-crm-data/.../ai/tools/TemplateStabilityContentAgentTools.java` | Tool 方法：查询分组数据、查询模板详情 |
| `whatsapp-crm-data/.../ai/dto/TemplateStabilityContentDTO.java` | 稳定/不稳定模板的传输 DTO |
| `whatsapp-crm-data/.../ai/dto/TemplateContentFeatureDTO.java` | 单个模板的解析后内容特征 DTO |
| `whatsapp-crm-job/src/main/java/.../task/TemplateStabilityContentAnalysisJob.java` | XXL-Job Handler |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `whatsapp-crm-common/.../config/BusinessConfig.java` | 新增开关配置 + Prompt 配置 |

---

### Task 1: 新增配置项

**文件：**
- 修改：`whatsapp-crm-common/src/main/java/com/opay/occ/whatsapp/common/config/BusinessConfig.java`

**接口：**
- 产出：`BusinessConfig.getMaterialStabilityContentAnalysisEnabled()` (boolean, 默认 false)
- 产出：`BusinessConfig.getMaterialStabilityContentAnalysisSystemPrompt()` (String)
- 产出：`BusinessConfig.getMaterialStabilityContentAnalysisUserPrompt()` (String)

- [ ] **在 BusinessConfig 中添加三个配置项**

```java
// 在 BusinessConfig.java 中新增字段:

// Template 内容稳定性分析 Agent 开关
private Boolean materialStabilityContentAnalysisEnabled = false;

// Agent 分析 Prompt
private String materialStabilityContentAnalysisSystemPrompt =
    "你是 WhatsApp 模板内容稳定性分析专家。你的任务是分析模板内容特征与类别稳定性之间的关系。";

private String materialStabilityContentAnalysisUserPrompt =
    "请分析下方数据，对比稳定组（所有 waba category=UTILITY）和不稳定组（存在 waba category≠UTILITY）" +
    "的 content 特征差异，提炼规则建议。需要包含正例和反例。";

// 对应的 getter 方法
public boolean getMaterialStabilityContentAnalysisEnabled() {
    return materialStabilityContentAnalysisEnabled;
}

public String getMaterialStabilityContentAnalysisSystemPrompt() {
    return materialStabilityContentAnalysisSystemPrompt;
}

public String getMaterialStabilityContentAnalysisUserPrompt() {
    return materialStabilityContentAnalysisUserPrompt;
}
```

- [ ] 验证：确认编译通过 `mvn compile -q -pl whatsapp-crm-common`

---

### Task 2: 创建内容特征 DTO

**文件：**
- 创建：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/dto/TemplateStabilityContentDTO.java`
- 创建：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/dto/TemplateContentFeatureDTO.java`

**接口：**
- 产出：`TemplateStabilityContentDTO` — 全部查询结果，含稳定组/不稳定组列表
- 产出：`TemplateContentFeatureDTO` — 单个模板解析后的内容特征

- [ ] **创建 TemplateStabilityContentDTO**

```java
package com.opay.occ.whatsapp.data.ai.dto;

import lombok.Data;
import lombok.experimental.Accessors;
import java.util.List;

/**
 * 模板稳定性内容分析的全量数据
 */
@Data
@Accessors(chain = true)
public class TemplateStabilityContentDTO {
    /** 稳定模板列表（所有 waba category=UTILITY） */
    private List<TemplateContentFeatureDTO> stableTemplates;
    /** 不稳定模板列表（存在 waba category≠UTILITY） */
    private List<TemplateContentFeatureDTO> unstableTemplates;
    /** 稳定模板总数 */
    private int stableCount;
    /** 不稳定模板总数 */
    private int unstableCount;
}
```

- [ ] **创建 TemplateContentFeatureDTO**

```java
package com.opay.occ.whatsapp.data.ai.dto;

import lombok.Data;
import lombok.experimental.Accessors;
import java.util.List;
import java.util.Map;

/**
 * 单个模板解析后的内容特征
 */
@Data
@Accessors(chain = true)
public class TemplateContentFeatureDTO {
    private Long templateId;
    private String templateName;

    /** waba category 分布：{ wabaId: category } */
    private Map<String, String> wabaCategoryMap;

    // ======== components 各部分的特征 ========

    /** HEADER 类型：IMAGE/TEXT/VIDEO/DOCUMENT/NONE */
    private String headerType;
    /** HEADER 的 format */
    private String headerFormat;

    /** BODY 原始文本 */
    private String bodyText;
    /** BODY 中是否包含 URL */
    private boolean bodyContainsUrl;
    /** BODY 中变量占位符个数 */
    private int bodyVariableCount;

    /** FOOTER 文本 */
    private String footerText;

    /** 按钮类型列表（URL/PHONE_NUMBER/QUICK_REPLY） */
    private List<String> buttonTypes;
    /** URL 按钮的链接类型列表 */
    private List<String> buttonUrlTypes;
    /** 按钮文案列表 */
    private List<String> buttonTexts;
}
```

- [ ] 验证：确认编译通过 `mvn compile -q -pl whatsapp-crm-data`

---

### Task 3: 创建 Agent Tools（数据查询 + 内容解析）

**文件：**
- 创建：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/tools/TemplateStabilityContentAgentTools.java`

**接口：**
- 消耗：`BusinessConfig.batchQueryMysqlSize`
- 消耗：`MessageTemplateService`、`MessageTemplateWabaService`
- 产出：`getStableAndUnstableTemplates()` → `String` (JSON)
- 产出：`getTemplateDetail(Long templateId)` → `String` (JSON)

- [ ] **创建 TemplateStabilityContentAgentTools**

```java
package com.opay.occ.whatsapp.data.ai.tools;

import cn.hutool.core.collection.CollUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.opay.occ.whatsapp.common.config.BusinessConfig;
import com.opay.occ.whatsapp.common.enums.MessageTemplateTypeEnum;
import com.opay.occ.whatsapp.common.enums.TemplateStatusEnum;
import com.opay.occ.whatsapp.data.ai.dto.TemplateContentFeatureDTO;
import com.opay.occ.whatsapp.data.ai.dto.TemplateStabilityContentDTO;
import com.opay.occ.whatsapp.data.entity.po.MessageTemplate;
import com.opay.occ.whatsapp.data.entity.po.MessageTemplateWaba;
import com.opay.occ.whatsapp.data.service.MessageTemplateService;
import com.opay.occ.whatsapp.data.service.MessageTemplateWabaService;
import lombok.extern.slf4j.Slf4j;
import org.noear.solon.ai.annotation.ToolMapping;
import org.noear.solon.annotation.Param;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Component
public class TemplateStabilityContentAgentTools {

    @Resource
    private MessageTemplateService messageTemplateService;

    @Resource
    private MessageTemplateWabaService messageTemplateWabaService;

    @Resource
    private BusinessConfig businessConfig;

    private static final Pattern URL_PATTERN = Pattern.compile("https?://[\\w./?=&%-]+");
    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{\\{\\d+}}");

    /**
     * 获取稳定和不稳定模板的分组数据。
     * 使用游标分页避免一次性加载全表，分页大小通过 BusinessConfig.batchQueryMysqlSize 配置。
     */
    @ToolMapping(description = "Get stable (all waba category=UTILITY) and unstable (any waba category!=UTILITY) templates, " +
            "with parsed content features. Uses pagination internally. Returns grouped data with template feature analysis.")
    public String getStableAndUnstableTemplates() {
        log.info("getStableAndUnstableTemplates started");

        int batchSize = businessConfig.getBatchQueryMysqlSize();
        List<MessageTemplate> allTemplates = new ArrayList<>();
        long lastId = 0L;

        // 游标分页查询 message_template
        while (true) {
            List<MessageTemplate> batch = messageTemplateService.list(
                    Wrappers.<MessageTemplate>lambdaQuery()
                            .select(MessageTemplate::getId, MessageTemplate::getName,
                                    MessageTemplate::getComponents, MessageTemplate::getMaterialGroupId)
                            .eq(MessageTemplate::getEverUtility, 1)
                            .gt(MessageTemplate::getMaterialGroupId, 0)
                            .ne(MessageTemplate::getStatus, TemplateStatusEnum.PENDING_DELETION.getStatus())
                            .gt(MessageTemplate::getId, lastId)
                            .orderByAsc(MessageTemplate::getId)
                            .last("limit " + batchSize));

            if (CollUtil.isEmpty(batch)) {
                break;
            }
            allTemplates.addAll(batch);
            lastId = batch.get(batch.size() - 1).getId();
            if (batch.size() < batchSize) {
                break;
            }
        }

        if (CollUtil.isEmpty(allTemplates)) {
            return JSON.toJSONString(new TemplateStabilityContentDTO()
                    .setStableTemplates(Collections.emptyList())
                    .setUnstableTemplates(Collections.emptyList())
                    .setStableCount(0).setUnstableCount(0));
        }

        // 收集所有 template ID 批量查询 waba
        Set<String> allTemplateIds = allTemplates.stream()
                .map(mt -> String.valueOf(mt.getId()))
                .collect(Collectors.toSet());
        List<MessageTemplateWaba> wabaList = messageTemplateWabaService.batchQueryByTemplateIds(
                allTemplateIds,
                Collections.singletonList(TemplateStatusEnum.PENDING_DELETION.getStatus()));

        // 按 templateId 分组 waba
        Map<String, List<MessageTemplateWaba>> wabaByTemplateId = wabaList.stream()
                .filter(w -> w.getMessageTemplateId() != null)
                .collect(Collectors.groupingBy(MessageTemplateWaba::getMessageTemplateId));

        // 分组：稳定/不稳定，并解析内容特征
        List<TemplateContentFeatureDTO> stableList = new ArrayList<>();
        List<TemplateContentFeatureDTO> unstableList = new ArrayList<>();

        for (MessageTemplate mt : allTemplates) {
            List<MessageTemplateWaba> wabas = wabaByTemplateId.getOrDefault(
                    String.valueOf(mt.getId()), Collections.emptyList());
            if (wabas.isEmpty()) {
                continue;
            }

            // 判断是否有非 UTILITY 的 waba
            boolean hasNonUtility = wabas.stream()
                    .anyMatch(w -> !MessageTemplateTypeEnum.UTILITY.getCode().equals(w.getCategory()));

            TemplateContentFeatureDTO feature = parseContentFeature(mt, wabas);

            if (hasNonUtility) {
                unstableList.add(feature);
            } else {
                stableList.add(feature);
            }
        }

        TemplateStabilityContentDTO result = new TemplateStabilityContentDTO()
                .setStableTemplates(stableList)
                .setUnstableTemplates(unstableList)
                .setStableCount(stableList.size())
                .setUnstableCount(unstableList.size());

        log.info("getStableAndUnstableTemplates completed, stable={}, unstable={}",
                stableList.size(), unstableList.size());
        return JSON.toJSONString(result);
    }

    /**
     * 解析单个模板的内容特征
     */
    private TemplateContentFeatureDTO parseContentFeature(MessageTemplate mt, List<MessageTemplateWaba> wabas) {
        TemplateContentFeatureDTO feature = new TemplateContentFeatureDTO();
        feature.setTemplateId(mt.getId());
        feature.setTemplateName(mt.getName());
        feature.setWabaCategoryMap(wabas.stream()
                .collect(Collectors.toMap(
                        MessageTemplateWaba::getWabaId,
                        w -> w.getCategory() != null ? w.getCategory() : "",
                        (v1, v2) -> v1)));

        // 解析 components
        if (mt.getComponents() != null) {
            try {
                JSONArray components = JSON.parseArray(mt.getComponents());
                for (int i = 0; i < components.size(); i++) {
                    JSONObject comp = components.getJSONObject(i);
                    String type = comp.getString("type");
                    if ("HEADER".equals(type)) {
                        feature.setHeaderType(type);
                        feature.setHeaderFormat(comp.getString("format"));
                    } else if ("BODY".equals(type)) {
                        String text = comp.getString("text");
                        feature.setBodyText(text);
                        if (text != null) {
                            feature.setBodyContainsUrl(URL_PATTERN.matcher(text).find());
                            feature.setBodyVariableCount(countMatches(text, VARIABLE_PATTERN));
                        }
                    } else if ("FOOTER".equals(type)) {
                        feature.setFooterText(comp.getString("text"));
                    } else if ("BUTTONS".equals(type)) {
                        JSONArray buttons = comp.getJSONArray("buttons");
                        if (buttons != null) {
                            List<String> btnTypes = new ArrayList<>();
                            List<String> btnUrlTypes = new ArrayList<>();
                            List<String> btnTexts = new ArrayList<>();
                            for (int j = 0; j < buttons.size(); j++) {
                                JSONObject btn = buttons.getJSONObject(j);
                                String btnType = btn.getString("type");
                                btnTypes.add(btnType);
                                btnTexts.add(btn.getString("text"));
                                if ("URL".equals(btnType) && btn.containsKey("url")) {
                                    String url = btn.getString("url");
                                    btnUrlTypes.add(classifyUrl(url));
                                }
                            }
                            feature.setButtonTypes(btnTypes);
                            feature.setButtonUrlTypes(btnUrlTypes);
                            feature.setButtonTexts(btnTexts);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("parseContentFeature error for templateId={}", mt.getId(), e);
            }
        }
        return feature;
    }

    private String classifyUrl(String url) {
        if (url == null) return "unknown";
        if (url.contains("onelink.me") || url.contains("dynamic")) {
            return "DynamicLink";
        } else if (url.length() < 30) {
            return "short_url";
        }
        return "static_url";
    }

    private int countMatches(String text, Pattern pattern) {
        Matcher m = pattern.matcher(text);
        int count = 0;
        while (m.find()) count++;
        return count;
    }

    /**
     * 获取单个模板的详细信息
     */
    @ToolMapping(description = "Get detailed info for a single template by templateId, including full components JSON and all waba info")
    public String getTemplateDetail(
            @Param(description = "template id") Long templateId) {
        MessageTemplate mt = messageTemplateService.getById(templateId);
        if (mt == null) {
            return "Template not found: " + templateId;
        }

        List<MessageTemplateWaba> wabas = messageTemplateWabaService.queryByMessageTemplateIdWithCache(
                String.valueOf(templateId));

        JSONObject detail = new JSONObject();
        detail.put("id", mt.getId());
        detail.put("name", mt.getName());
        detail.put("templateType", mt.getTemplateType());
        detail.put("everUtility", mt.getEverUtility());
        detail.put("materialGroupId", mt.getMaterialGroupId());
        detail.put("components", mt.getComponents());

        JSONArray wabaArr = new JSONArray();
        if (wabas != null) {
            for (MessageTemplateWaba w : wabas) {
                JSONObject wo = new JSONObject();
                wo.put("wabaId", w.getWabaId());
                wo.put("category", w.getCategory());
                wo.put("status", w.getStatus());
                wo.put("agent", w.getAgent());
                wabaArr.add(wo);
            }
        }
        detail.put("wabas", wabaArr);

        return detail.toJSONString();
    }
}
```

- [ ] 验证：确认编译通过 `mvn compile -q -pl whatsapp-crm-data`

---

### Task 4: 创建 Agent Service

**文件：**
- 创建：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/service/TemplateStabilityContentAgentService.java`

**接口：**
- 消耗：`BusinessConfig` (开关 + Prompt)
- 消耗：`ChatModelManager`
- 消耗：`TemplateStabilityContentAgentTools`
- 产出：`analyzeAndGenerateReport(String chatModelName)` → `String` (Markdown 报告内容)

- [ ] **创建 TemplateStabilityContentAgentService**

```java
package com.opay.occ.whatsapp.data.ai.service;

import com.opay.occ.whatsapp.common.config.BusinessConfig;
import com.opay.occ.whatsapp.data.ai.config.ChatModelManager;
import com.opay.occ.whatsapp.data.ai.tools.TemplateStabilityContentAgentTools;
import lombok.extern.slf4j.Slf4j;
import org.noear.solon.ai.agent.react.ReActAgent;
import org.noear.solon.ai.agent.react.ReActResponse;
import org.noear.solon.ai.chat.ChatModel;
import org.noear.solon.ai.chat.tool.MethodToolProvider;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;

@Slf4j
@Service
public class TemplateStabilityContentAgentService {

    @Resource
    private BusinessConfig businessConfig;

    @Resource
    private ChatModelManager chatModelManager;

    @Resource
    private TemplateStabilityContentAgentTools templateStabilityContentAgentTools;

    /**
     * 使用 ReActAgent 分析模板内容稳定性，返回 Markdown 报告
     */
    public String analyzeAndGenerateReport(String chatModelName) {
        log.info("Starting template content stability analysis with ReActAgent...");

        ChatModel chatModel = chatModelManager.getChatModel(chatModelName);
        ReActAgent analysisAgent = ReActAgent.of(chatModel)
                .name("template_content_stability_analyst")
                .role(businessConfig.getMaterialStabilityContentAnalysisSystemPrompt())
                .defaultToolAdd(new MethodToolProvider(templateStabilityContentAgentTools))
                .modelOptions(o -> o.temperature(0.0))
                .maxTurns(10)
                .autoRethink(true)
                .build();

        try {
            ReActResponse response = analysisAgent
                    .prompt(businessConfig.getMaterialStabilityContentAnalysisUserPrompt())
                    .call();
            String content = response.getContent();
            log.info("Template content stability analysis completed");
            return content;
        } catch (Throwable e) {
            log.error("Template content stability analysis failed", e);
            return "";
        }
    }
}
```

- [ ] 验证：确认编译通过 `mvn compile -q -pl whatsapp-crm-data`

---

### Task 5: 创建 Job Service

**文件：**
- 创建：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/xxljob/TemplateStabilityContentAnalysisJobService.java`

**接口：**
- 消耗：`BusinessConfig` (开关)
- 消耗：`TemplateStabilityContentAgentService`
- 消耗：`FeishuReportNotifyService`

- [ ] **创建 TemplateStabilityContentAnalysisJobService**

```java
package com.opay.occ.whatsapp.data.xxljob;

import com.opay.occ.whatsapp.common.config.BusinessConfig;
import com.opay.occ.whatsapp.data.ai.service.FeishuReportNotifyService;
import com.opay.occ.whatsapp.data.ai.service.TemplateStabilityContentAgentService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;

/**
 * Job service for template content stability analysis.
 * Triggered by XXL-Job, runs ReActAgent to analyze content-stability relationship
 * and sends report to Feishu webhook.
 */
@Slf4j
@Service
public class TemplateStabilityContentAnalysisJobService {

    @Resource
    private BusinessConfig businessConfig;

    @Resource
    private TemplateStabilityContentAgentService templateStabilityContentAgentService;

    @Resource
    private FeishuReportNotifyService feishuReportNotifyService;

    public void executeAnalysis() {
        if (!businessConfig.getMaterialStabilityContentAnalysisEnabled()) {
            log.info("Template content stability analysis is disabled, skip");
            return;
        }

        log.info("TemplateStabilityContentAnalysisJobService.executeAnalysis started");
        try {
            for (String modelName : businessConfig.getChatModelList()) {
                String report = templateStabilityContentAgentService.analyzeAndGenerateReport(modelName);
                feishuReportNotifyService.sendMarkdownReport(report);
            }
        } catch (Exception e) {
            log.error("TemplateStabilityContentAnalysisJobService.executeAnalysis failed", e);
        }
        log.info("TemplateStabilityContentAnalysisJobService.executeAnalysis completed");
    }
}
```

- [ ] 验证：确认编译通过 `mvn compile -q -pl whatsapp-crm-data`

---

### Task 6: 创建 XXL-Job Handler

**文件：**
- 创建：`whatsapp-crm-job/src/main/java/com/opay/occ/whatsapp/job/job/task/TemplateStabilityContentAnalysisJob.java`

**接口：**
- 消耗：`TemplateStabilityContentAnalysisJobService`

- [ ] **创建 TemplateStabilityContentAnalysisJob**

```java
package com.opay.occ.whatsapp.job.job.task;

import com.opay.occ.whatsapp.common.MDCUtil;
import com.opay.occ.whatsapp.data.xxljob.TemplateStabilityContentAnalysisJobService;
import com.xxl.job.core.biz.model.ReturnT;
import com.xxl.job.core.handler.annotation.XxlJob;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * Template content stability analysis job
 * 1. Queries all ever_utility=1 AND material_group_id>0 templates
 * 2. Groups by waba category (stable: UTILITY, unstable: non-UTILITY)
 * 3. Uses ReActAgent to analyze content-stability correlation
 * 4. Sends report to Feishu webhook
 *
 * Suggested cron: 0 0 3 * * ? (daily at 3AM)
 */
@Slf4j
@Component
public class TemplateStabilityContentAnalysisJob {

    @Resource
    private TemplateStabilityContentAnalysisJobService templateStabilityContentAnalysisJobService;

    @XxlJob("templateStabilityContentAnalysisJob")
    public ReturnT<String> execute() {
        MDCUtil.start();
        log.info("TemplateStabilityContentAnalysisJob started");

        try {
            templateStabilityContentAnalysisJobService.executeAnalysis();
            log.info("TemplateStabilityContentAnalysisJob completed successfully");
            return ReturnT.SUCCESS;
        } catch (Exception e) {
            log.error("TemplateStabilityContentAnalysisJob failed", e);
            return new ReturnT<>(ReturnT.FAIL_CODE, "Job failed: " + e.getMessage());
        } finally {
            MDCUtil.clear();
        }
    }
}
```

- [ ] 验证：确认编译通过 `mvn compile -q -pl whatsapp-crm-job`

---

## 验证方式

1. **编译验证**：在每个 Task 的最后一个 step 执行 `mvn compile -q` 确认无编译错误
2. **完整编译**：项目根目录执行 `mvn compile -q` 确认所有模块无问题
3. **XXL-Job 调度验证**：确认 Job Handler 名称 `templateStabilityContentAnalysisJob` 在调度中心可搜索到
