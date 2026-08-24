# UTILITY 伪装建议系统 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当模版被 Meta 从 UTILITY 改回 MARKETING 时，通过 LLM 分析生成伪装为 UTILITY 的修改建议，在素材模版管理页面展示给运营参考。

**Architecture:** 定时任务扫描 `message_template` 表增量（utime + templateType=MARKETING + everUtility=1）→ 触发 LLM Agent 分析模版内容 → 生成建议存入 `message_template_disguise_suggestion` 表 → groupDetail API 追加建议数据 → 前端对应元素卡片展示对比。

**Tech Stack:** Spring Boot, MyBatis-Plus, Solon AI (ReActAgent + @ToolMapping), MongoDB (MessageMaterial), XXL-Job

## Global Constraints

- 阶段一不做应用/拒绝/忽略等交互，仅展示
- `status` 字段预留：0-pending, 1-applied, 2-rejected, 3-ignored
- `feedbacks` JSON数组记录按位置的反馈（采纳/拒绝理由），`remark` 建议记录级备注描述，阶段一不实现
- 定时扫描串行处理，失败不重试
- 所有代码注释用英文
- 修改代码后要确保能编译通过
- 修改代码前必须先经过用户同意

---

### Task 1: 新建 DB 表 + PO + Mapper

**Files:**
- Create: `whatsapp-crm-data/src/main/resources/mapper/TemplateDisguiseSuggestionMapper.xml`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/po/TemplateDisguiseSuggestion.java`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/mapper/TemplateDisguiseSuggestionMapper.java`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/TemplateDisguiseSuggestionService.java`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/impl/TemplateDisguiseSuggestionServiceImpl.java`

**Interfaces:**
- Produces: `TemplateDisguiseSuggestion` (PO), `TemplateDisguiseSuggestionMapper` (BaseMapper), `TemplateDisguiseSuggestionService` (IService)

- [ ] **Step 1: Create Mapper XML**

File: `whatsapp-crm-data/src/main/resources/mapper/TemplateDisguiseSuggestionMapper.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.opay.occ.whatsapp.data.mapper.TemplateDisguiseSuggestionMapper">

</mapper>
```

- [ ] **Step 2: Create PO**

File: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/po/TemplateDisguiseSuggestion.java`

```java
package com.opay.occ.whatsapp.data.entity.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.experimental.Accessors;

@TableName(value = "message_template_disguise_suggestion")
@Data
@Accessors(chain = true)
public class TemplateDisguiseSuggestion {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String batchNo;
    private Long messageTemplateId;
    private Long materialGroupId;
    private Long materialCombinationId;
    private String originContent;
    private String suggestedContent;
    private String prompt;
    private String llmRawOutput;
    private String feedbacks;
    private Integer status;
    private String remark;
    private Long ctime;
    private Long utime;
}
```

- [ ] **Step 3: Create Mapper interface**

File: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/mapper/TemplateDisguiseSuggestionMapper.java`

```java
package com.opay.occ.whatsapp.data.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.opay.occ.whatsapp.data.entity.po.TemplateDisguiseSuggestion;

public interface TemplateDisguiseSuggestionMapper extends BaseMapper<TemplateDisguiseSuggestion> {
}
```

- [ ] **Step 4: Create Service interface**

File: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/TemplateDisguiseSuggestionService.java`

```java
package com.opay.occ.whatsapp.data.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.opay.occ.whatsapp.data.entity.po.TemplateDisguiseSuggestion;

public interface TemplateDisguiseSuggestionService extends IService<TemplateDisguiseSuggestion> {
}
```

- [ ] **Step 5: Create Service impl**

File: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/impl/TemplateDisguiseSuggestionServiceImpl.java`

```java
package com.opay.occ.whatsapp.data.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.opay.occ.whatsapp.data.entity.po.TemplateDisguiseSuggestion;
import com.opay.occ.whatsapp.data.mapper.TemplateDisguiseSuggestionMapper;
import com.opay.occ.whatsapp.data.service.TemplateDisguiseSuggestionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class TemplateDisguiseSuggestionServiceImpl
        extends ServiceImpl<TemplateDisguiseSuggestionMapper, TemplateDisguiseSuggestion>
        implements TemplateDisguiseSuggestionService {
}
```

---

### Task 2: AI Agent Tools + Service

**Files:**
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/dto/DisguiseAnalysisResult.java`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/tools/DisguiseSuggestionAgentTools.java`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/service/DisguiseSuggestionAgentService.java`

**Interfaces:**
- Consumes: `TemplateDisguiseSuggestionService` (from Task 1), `MessageTemplateService`, `MessageMaterialCombinationService`, `MessageMaterialService` (mongo), `ChatModelManager` (existing)
- Produces: `DisguiseSuggestionAgentService.analyze(messageTemplateId)` → creates `TemplateDisguiseSuggestion` record

- [ ] **Step 1: Create Agent Tools**

File: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/tools/DisguiseSuggestionAgentTools.java`

```java
package com.opay.occ.whatsapp.data.ai.tools;

import cn.hutool.core.util.StrUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.opay.occ.whatsapp.data.entity.po.MessageMaterialCombination;
import com.opay.occ.whatsapp.data.entity.po.MessageTemplate;
import com.opay.occ.whatsapp.data.mongo.model.MessageMaterial;
import com.opay.occ.whatsapp.data.service.MessageMaterialCombinationService;
import com.opay.occ.whatsapp.data.service.MessageMaterialService;
import com.opay.occ.whatsapp.data.service.MessageTemplateService;
import lombok.extern.slf4j.Slf4j;
import org.noear.solon.ai.annotation.ToolMapping;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

@Slf4j
@Component
public class DisguiseSuggestionAgentTools {

    @Resource
    private MessageTemplateService messageTemplateService;
    @Resource
    private MessageMaterialCombinationService messageMaterialCombinationService;
    @Resource
    private MessageMaterialService messageMaterialService;

    @ToolMapping(description = "Get template basic info and its materialGroupId / materialCombinationId")
    public String getTemplateDetail(Long templateId) {
        MessageTemplate mt = messageTemplateService.getById(templateId);
        if (mt == null) {
            return "Template not found: " + templateId;
        }
        JSONObject detail = new JSONObject();
        detail.put("id", mt.getId());
        detail.put("name", mt.getName());
        detail.put("templateType", mt.getTemplateType());
        detail.put("everUtility", mt.getEverUtility());
        detail.put("materialGroupId", mt.getMaterialGroupId());
        detail.put("materialCombinationId", mt.getMaterialCombinationId());
        detail.put("components", mt.getComponents());
        return detail.toJSONString();
    }

    @ToolMapping(description = "Get material combination detail: for each slot (header/body/footer/buttons), return material_id and element content from Mongo")
    public String getMaterialCombinationDetail(Long combinationId) {
        if (combinationId == null) {
            return "combinationId is null";
        }
        MessageMaterialCombination combo = messageMaterialCombinationService.getById(combinationId);
        if (combo == null) {
            return "Combination not found: " + combinationId;
        }
        JSONObject result = new JSONObject();
        result.put("combinationId", combo.getId());
        result.put("materialGroupId", combo.getMaterialGroupId());
        appendMaterial(result, "header", combo.getHeaderMaterialId());
        appendMaterial(result, "body", combo.getBodyMaterialId());
        appendMaterial(result, "footer", combo.getFooterMaterialId());
        appendMaterial(result, "buttons", combo.getButtonsMaterialId());
        return result.toJSONString();
    }

    private void appendMaterial(JSONObject result, String slot, String materialId) {
        JSONObject slotObj = new JSONObject();
        slotObj.put("material_id", materialId);
        if (StrUtil.isNotBlank(materialId)) {
            try {
                MessageMaterial material = messageMaterialService.findById(materialId);
                if (material != null && material.getElement() != null) {
                    slotObj.put("element", JSON.toJSON(material.getElement()));
                }
            } catch (Exception e) {
                log.warn("Failed to load material {} for slot {}", materialId, slot, e);
                slotObj.put("element", null);
            }
        }
        result.put(slot, slotObj);
    }
}
```

- [ ] **Step 2: Create Agent Service**

File: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/service/DisguiseSuggestionAgentService.java`

```java
package com.opay.occ.whatsapp.data.ai.service;

import cn.hutool.core.util.IdUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.opay.occ.whatsapp.common.config.BusinessConfig;
import com.opay.occ.whatsapp.data.ai.config.ChatModelManager;
import com.opay.occ.whatsapp.data.entity.po.MessageMaterialCombination;
import com.opay.occ.whatsapp.data.entity.po.MessageTemplate;
import com.opay.occ.whatsapp.data.entity.po.TemplateDisguiseSuggestion;
import com.opay.occ.whatsapp.data.mongo.model.MessageMaterial;
import com.opay.occ.whatsapp.data.service.MessageMaterialCombinationService;
import com.opay.occ.whatsapp.data.service.MessageMaterialService;
import com.opay.occ.whatsapp.data.service.MessageTemplateService;
import com.opay.occ.whatsapp.data.service.TemplateDisguiseSuggestionService;
import lombok.extern.slf4j.Slf4j;
import org.noear.solon.ai.agent.react.ReActAgent;
import org.noear.solon.ai.agent.react.ReActResponse;
import org.noear.solon.ai.chat.ChatModel;
import org.noear.solon.ai.chat.tool.MethodToolProvider;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;

@Slf4j
@Service
public class DisguiseSuggestionAgentService {

    @Resource
    private ChatModelManager chatModelManager;
    @Resource
    private BusinessConfig businessConfig;
    @Resource
    private DisguiseSuggestionAgentTools disguiseSuggestionAgentTools;
    @Resource
    private MessageTemplateService messageTemplateService;
    @Resource
    private MessageMaterialCombinationService messageMaterialCombinationService;
    @Resource
    private MessageMaterialService messageMaterialService;
    @Resource
    private TemplateDisguiseSuggestionService templateDisguiseSuggestionService;

    public void analyze(Long messageTemplateId) {
        log.info("DisguiseSuggestionAgentService.analyze start, templateId: {}", messageTemplateId);
        try {
            MessageTemplate mt = messageTemplateService.getById(messageTemplateId);
            if (mt == null) {
                log.warn("analyze: template not found: {}", messageTemplateId);
                return;
            }

            // Build origin_content JSON
            JSONObject originContent = new JSONObject();
            originContent.put("messageTemplateId", mt.getId());
            originContent.put("templateName", mt.getName());

            Long combinationId = mt.getMaterialCombinationId();
            if (combinationId != null) {
                MessageMaterialCombination combo = messageMaterialCombinationService.getById(combinationId);
                if (combo != null) {
                    appendSlot(originContent, "header", combo.getHeaderMaterialId());
                    appendSlot(originContent, "body", combo.getBodyMaterialId());
                    appendSlot(originContent, "footer", combo.getFooterMaterialId());
                    appendSlot(originContent, "buttons", combo.getButtonsMaterialId());
                }
            }

            String originContentStr = originContent.toJSONString();

            // Call LLM Agent
            ChatModel chatModel = chatModelManager.getDefaultChatModel();
            String systemPrompt = "You are a WhatsApp template content analyst. " +
                    "Your task is to analyze the given template content and generate suggestions " +
                    "to make MARKETING content look like UTILITY content, reducing the chance of " +
                    "Meta re-classifying it back to MARKETING.\n\n" +
                    "Rules:\n" +
                    "1. Keep all variable placeholders {{N}} unchanged\n" +
                    "2. Replace promotional language with service/transactional tone\n" +
                    "3. Suggest QUICK_REPLY buttons be changed to URL or PHONE_NUMBER types\n" +
                    "4. Output JSON in EXACTLY the same structure as input, with each slot having:\n" +
                    "   - material_id: same as input\n" +
                    "   - element: the modified OpayTemplateComponent JSON\n" +
                    "   - suggestion: a short sentence explaining the change\n" +
                    "5. Output ONLY the JSON, no markdown, no explanation";

            ReActAgent agent = ReActAgent.of(chatModel)
                    .name("disguise_suggestion_analyst")
                    .role(systemPrompt)
                    .defaultToolAdd(new MethodToolProvider(disguiseSuggestionAgentTools))
                    .modelOptions(o -> o.temperature(0.3))
                    .maxTurns(10)
                    .build();

            String userPrompt = "Analyze this template content and suggest UTILITY-style modifications:\n"
                    + originContentStr + "\n\n"
                    + "Use getTemplateDetail and getMaterialCombinationDetail tools to get full details if needed. "
                    + "Output ONLY the suggested_content JSON.";

            ReActResponse response = agent.prompt(userPrompt).call();
            String agentOutput = response.getContent();

            // Save to DB
            TemplateDisguiseSuggestion suggestion = new TemplateDisguiseSuggestion();
            suggestion.setMessageTemplateId(messageTemplateId);
            suggestion.setMaterialGroupId(mt.getMaterialGroupId());
            suggestion.setMaterialCombinationId(combinationId);
            suggestion.setOriginContent(originContentStr);
            suggestion.setSuggestedContent(extractJsonFromAgentOutput(agentOutput));
            suggestion.setPrompt(systemPrompt + "\n\n---\n\n" + userPrompt);
            suggestion.setLlmRawOutput(agentOutput);
            suggestion.setBatchNo(IdUtil.fastSimpleUUID());
            suggestion.setStatus(0);
            suggestion.setCtime(System.currentTimeMillis());
            suggestion.setUtime(System.currentTimeMillis());
            templateDisguiseSuggestionService.save(suggestion);

            log.info("DisguiseSuggestionAgentService.analyze done, templateId: {}, suggestionId: {}",
                    messageTemplateId, suggestion.getId());
        } catch (Exception e) {
            log.error("DisguiseSuggestionAgentService.analyze error, templateId: {}", messageTemplateId, e);
        }
    }

    private void appendSlot(JSONObject root, String slot, String materialId) {
        JSONObject slotObj = new JSONObject();
        slotObj.put("material_id", materialId);
        if (materialId != null) {
            try {
                MessageMaterial material = messageMaterialService.findById(materialId);
                if (material != null && material.getElement() != null) {
                    slotObj.put("element", JSON.toJSON(material.getElement()));
                }
            } catch (Exception e) {
                log.warn("Failed to load material {} for slot {}", materialId, slot, e);
            }
        }
        root.put(slot, slotObj);
    }

    private String extractJsonFromAgentOutput(String output) {
        if (output == null) return null;
        // Try to extract JSON block if wrapped in markdown
        int start = output.indexOf('{');
        int end = output.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return output.substring(start, end + 1);
        }
        return output;
    }
}
```

---

### Task 3: 定时扫描 Job

**Files:**
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/xxljob/DisguiseSuggestionScanService.java`
- Create: `whatsapp-crm-job/src/main/java/com/opay/occ/whatsapp/job/job/task/TemplateDisguiseSuggestionScanJob.java`

**Interfaces:**
- Consumes: `MessageTemplateService`, `TemplateDisguiseSuggestionService`, `DisguiseSuggestionAgentService`
- Produces: XXL-Job that scans and triggers analysis

- [ ] **Step 1: Create Scan Service**

File: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/xxljob/DisguiseSuggestionScanService.java`

```java
package com.opay.occ.whatsapp.data.xxljob;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.opay.occ.whatsapp.common.enums.MessageTemplateTypeEnum;
import com.opay.occ.whatsapp.common.enums.YNEnum;
import com.opay.occ.whatsapp.data.ai.service.DisguiseSuggestionAgentService;
import com.opay.occ.whatsapp.data.entity.po.MessageTemplate;
import com.opay.occ.whatsapp.data.entity.po.TemplateDisguiseSuggestion;
import com.opay.occ.whatsapp.data.service.MessageTemplateService;
import com.opay.occ.whatsapp.data.service.TemplateDisguiseSuggestionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.List;

@Slf4j
@Service
public class DisguiseSuggestionScanService {

    @Resource
    private MessageTemplateService messageTemplateService;
    @Resource
    private TemplateDisguiseSuggestionService templateDisguiseSuggestionService;
    @Resource
    private DisguiseSuggestionAgentService disguiseSuggestionAgentService;

    // In-memory last scan time; use Redis for production if needed
    private long lastScanTime = 0;

    public void scan() {
        long scanStart = System.currentTimeMillis();
        log.info("DisguiseSuggestionScanService.scan start, lastScanTime: {}", lastScanTime);
        try {
            // Scan message_template for recently modified MARKETING templates that were once UTILITY
            List<MessageTemplate> candidates = messageTemplateService.list(
                    Wrappers.<MessageTemplate>lambdaQuery()
                            .gt(MessageTemplate::getUtime, lastScanTime)
                            .eq(MessageTemplate::getTemplateType, MessageTemplateTypeEnum.MARKETING.getCode())
                            .eq(MessageTemplate::getEverUtility, YNEnum.YES.getCode())
                            .orderByAsc(MessageTemplate::getUtime));

            log.info("DisguiseSuggestionScanService.scan found {} candidates", candidates.size());

            for (MessageTemplate mt : candidates) {
                // Dedup: skip if suggestion already exists for this template
                long count = templateDisguiseSuggestionService.count(
                        Wrappers.<TemplateDisguiseSuggestion>lambdaQuery()
                                .eq(TemplateDisguiseSuggestion::getMessageTemplateId, mt.getId()));
                if (count > 0) {
                    log.info("DisguiseSuggestionScanService.scan skip, suggestion already exists for templateId: {}", mt.getId());
                    continue;
                }
                log.info("DisguiseSuggestionScanService.scan trigger analysis for templateId: {}", mt.getId());
                disguiseSuggestionAgentService.analyze(mt.getId());
            }
        } catch (Exception e) {
            log.error("DisguiseSuggestionScanService.scan error", e);
        } finally {
            lastScanTime = scanStart;
        }
        log.info("DisguiseSuggestionScanService.scan done");
    }
}
```

- [ ] **Step 2: Create XXL-Job handler**

File: `whatsapp-crm-job/src/main/java/com/opay/occ/whatsapp/job/job/task/TemplateDisguiseSuggestionScanJob.java`

```java
package com.opay.occ.whatsapp.job.job.task;

import com.opay.occ.whatsapp.data.xxljob.DisguiseSuggestionScanService;
import com.xxl.job.core.biz.model.ReturnT;
import com.xxl.job.core.handler.annotation.XxlJob;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

@Slf4j
@Component
public class TemplateDisguiseSuggestionScanJob {

    @Resource
    private DisguiseSuggestionScanService disguiseSuggestionScanService;

    @XxlJob("disguiseSuggestionScanJob")
    public ReturnT<String> execute() {
        disguiseSuggestionScanService.scan();
        return ReturnT.SUCCESS;
    }
}
```

---

### Task 4: API 改造 — groupDetail 追加建议数据

**Files:**
- Modify: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/dto/response/MessageMaterialGroupRespDTO.java`
- Modify: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/impl/MessageMaterialGroupServiceImpl.java`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/dto/response/DisguiseSuggestionVO.java`

**Interfaces:**
- Consumes: `TemplateDisguiseSuggestionService`
- Produces: `DisguiseSuggestionVO` returned in `MessageMaterialGroupRespDTO.disguiseSuggestions`

- [ ] **Step 1: Create DisguiseSuggestionVO**

File: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/dto/response/DisguiseSuggestionVO.java`

```java
package com.opay.occ.whatsapp.data.entity.dto.response;

import lombok.Data;
import lombok.experimental.Accessors;

import java.io.Serializable;

@Data
@Accessors(chain = true)
public class DisguiseSuggestionVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String originContent;
    private String suggestedContent;
    private String prompt;
    private String llmRawOutput;
    private String batchNo;
    private Integer status;
    private String feedbacks;
    private String remark;
    private Long ctime;
}
```

- [ ] **Step 2: Add field to MessageMaterialGroupRespDTO**

Add to the end of `MessageMaterialGroupRespDTO.java`:

```java
    /**
     * UTILITY disguise suggestions for this material group
     */
    private List<DisguiseSuggestionVO> disguiseSuggestions;
```

- [ ] **Step 3: Modify MessageMaterialGroupServiceImpl.groupDetail**

After the existing logic that builds `materialGroupRespDTO`, add:

```java
// Append disguise suggestions
List<TemplateDisguiseSuggestion> suggestions = templateDisguiseSuggestionService.list(
        Wrappers.<TemplateDisguiseSuggestion>lambdaQuery()
                .eq(TemplateDisguiseSuggestion::getMaterialGroupId, baseIdReqDTO.getId())
                .orderByDesc(TemplateDisguiseSuggestion::getCtime));
if (CollectionUtils.isNotEmpty(suggestions)) {
    List<DisguiseSuggestionVO> suggestionVOs = suggestions.stream().map(s -> {
        DisguiseSuggestionVO vo = new DisguiseSuggestionVO();
        vo.setId(s.getId());
        vo.setOriginContent(s.getOriginContent());
        vo.setSuggestedContent(s.getSuggestedContent());
        vo.setPrompt(s.getPrompt());
        vo.setLlmRawOutput(s.getLlmRawOutput());
        vo.setBatchNo(s.getBatchNo());
        vo.setStatus(s.getStatus());
        vo.setRejectReason(s.getRejectReason());
        vo.setCtime(s.getCtime());
        return vo;
    }).collect(Collectors.toList());
    materialGroupRespDTO.setDisguiseSuggestions(suggestionVOs);
}
```

Also add the necessary imports at the top of the file:
```java
import com.opay.occ.whatsapp.data.entity.dto.response.DisguiseSuggestionVO;
import com.opay.occ.whatsapp.data.entity.po.TemplateDisguiseSuggestion;
import com.opay.occ.whatsapp.data.service.TemplateDisguiseSuggestionService;
```
