# AI 备用素材模版 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 AI 自动生成备用素材模版，包括创建、稳定性评级、缓存、接口查询等完整链路

**Architecture:** 在现有素材组体系上扩展，新增独立稳定性评级规则体系，通过 RocketMQ 异步创建 + XXL-Job 补偿，Redis 缓存稳定性评级

**Tech Stack:** Java 8+, Spring Boot, MyBatis-Plus, RocketMQ, Apollo, Redis, XXL-Job, SpEL

## Global Constraints

- 所有改动不提交 git
- 所有代码注释用英文
- 不修改 `.trae` 下内容
- 创建表结构时参考已有规范：not null 必须有默认值，必须有 create_time、update_time 字段，create_time 字段加索引
- MySQL 中 in 批量查询时注意数据量可能过大，分批 in
- 修改代码后确保编译通过
- 代码不需要让用户确认

---

## 文件结构总览

### 新增文件

| 文件 | 模块 | 职责 |
|------|------|------|
| `AiBackupStabilityConfig.java` | whatsapp-crm-data/config | Apollo 稳定性规则配置 |
| `AiBackupStabilityService.java` | whatsapp-crm-data/service | 稳定性评级计算 |
| `AiBackupMaterialUpdateLog.java` | whatsapp-crm-data/entity/po | 操作历史 PO |
| `AiBackupMaterialUpdateLogMapper.java` | whatsapp-crm-data/mapper | 操作历史 Mapper |
| `AiBackupMaterialGroupService.java` | whatsapp-crm-data/service | AI 备用组核心 Service 接口 |
| `AiBackupMaterialGroupServiceImpl.java` | whatsapp-crm-data/service/impl | AI 备用组核心 Service 实现 |
| `CreateAiBackupMaterialGroupJobService.java` | whatsapp-crm-data/xxljob | 创建补偿 XXL-Job Service |
| `RefreshAiBackupStabilityCacheJobService.java` | whatsapp-crm-data/xxljob | 缓存刷新 XXL-Job Service |
| `AiBackupMaterialGroupController.java` | whatsapp-crm-api/controller/admin | 查询接口 |
| `AiBackupMaterialGroupCreateConsumer.java` | whatsapp-crm-mq/rocket/consumer | MQ 消费者 |
| `CreateAiBackupMaterialGroupJob.java` | whatsapp-crm-job/job/task | XXL-Job 入口 (job) |
| `RefreshAiBackupStabilityCacheJob.java` | whatsapp-crm-job/job/task | XXL-Job 入口 (job) |
| `CreateAiBackupMaterialGroupJob.java` | whatsapp-crm-job2-1-1/job/task | XXL-Job 入口 (job2) |
| `RefreshAiBackupStabilityCacheJob.java` | whatsapp-crm-job2-1-1/job/task | XXL-Job 入口 (job2) |

### 修改文件

| 文件 | 模块 | 变更 |
|------|------|------|
| `MessageMaterialGroup.java` | whatsapp-crm-data/entity/po | 新增 3 个字段 |
| `MessageMaterialCombination.java` | whatsapp-crm-data/entity/po | 新增 2 个字段 |
| `BusinessConfig.java` | whatsapp-crm-common/config | 新增 3 个配置项 |
| `MessageMaterialGroupServiceImpl.java` | whatsapp-crm-data/service/impl | Hook 埋点 |
| `MessageMaterialGroupController.java` | whatsapp-crm-api/controller/admin | 列表过滤 source_type=1 |

---

### Task 1: DDL — 表结构变更

**Files:**
- Create: `doc/sql/ai_backup_material_group.sql`

**Interfaces:**
- Produces: `message_material_group` 新增 3 个字段，`message_material_combination` 新增 2 个字段 + 索引，`ai_backup_material_update_log` 表

- [ ] **Step 1: 创建 DDL 文件**

```sql
-- AI backup material group DDL
-- Add columns to message_material_group
ALTER TABLE `message_material_group`
  ADD COLUMN `primary_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Associated primary material group ID, 0 for non-AI-backup',
  ADD COLUMN `ai_source_lane` varchar(50) DEFAULT '' COMMENT 'Source lane code, e.g. MARKETING_DEFAULT',
  ADD COLUMN `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Source type: 0=manual, 1=AI auto-generated';

-- Add columns to message_material_combination
ALTER TABLE `message_material_combination`
  ADD COLUMN `primary_combination_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Associated primary combination ID, 0 for non-AI-backup',
  ADD COLUMN `source_type` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Source type: 0=manual, 1=AI auto-generated',
  ADD INDEX `idx_primary_combination_id` (`primary_combination_id`);

-- Create ai_backup_material_update_log table
CREATE TABLE IF NOT EXISTS `ai_backup_material_update_log` (
  `id` bigint(20) unsigned AUTO_INCREMENT COMMENT 'Primary key',
  `primary_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Primary material group ID',
  `backup_group_id` bigint(20) NOT NULL DEFAULT '0' COMMENT 'AI backup material group ID',
  `ai_source_lane` varchar(50) DEFAULT '' COMMENT 'Source lane code',
  `operate_type` varchar(50) NOT NULL DEFAULT '' COMMENT 'Operation type: CREATE/UPDATE/ENABLE/DISABLE/DELETE',
  `trigger_source` varchar(50) NOT NULL DEFAULT '' COMMENT 'Trigger source: HOOK/MQ/JOB/MANUAL',
  `before_content` text COMMENT 'Content before change, JSON format',
  `after_content` text COMMENT 'Content after change, JSON format',
  `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'Reserved for future use',
  `remark` varchar(1024) DEFAULT '' COMMENT 'Reserved for future use',
  `operator` varchar(128) DEFAULT '' COMMENT 'Operator',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'Update time',
  PRIMARY KEY (`id`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_primary_group_id` (`primary_group_id`),
  KEY `idx_backup_group_id` (`backup_group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI backup material group update history log';
```

- [ ] **Step 2: 在测试环境执行 DDL**

```bash
# 由 DBA 或运维执行，确保 SQL 语法正确
mysql -h <host> -u <user> -p <database> < doc/sql/ai_backup_material_group.sql
```

---

### Task 2: 更新 PO 类 — MessageMaterialGroup 新增字段

**Files:**
- Modify: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/po/MessageMaterialGroup.java`

**Interfaces:**
- Produces: `MessageMaterialGroup` 新增 `primaryGroupId`, `aiSourceLane`, `sourceType` 字段

- [ ] **Step 1: 在 MessageMaterialGroup.java 新增字段**

在现有字段后（`combinationMode` 字段之后）添加：

```java
    /**
     * Associated primary material group ID, 0 for non-AI-backup
     */
    private Long primaryGroupId;

    /**
     * Source lane code, e.g. MARKETING_DEFAULT
     */
    private String aiSourceLane;

    /**
     * Source type: 0=manual, 1=AI auto-generated
     */
    private Integer sourceType;
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-data -am -q 2>&1 | tail -5
```

---

### Task 3: 更新 PO 类 — MessageMaterialCombination 新增字段

**Files:**
- Modify: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/po/MessageMaterialCombination.java`

**Interfaces:**
- Produces: `MessageMaterialCombination` 新增 `primaryCombinationId`, `sourceType` 字段

- [ ] **Step 1: 在 MessageMaterialCombination.java 新增字段**

在现有字段后添加：

```java
    /**
     * Associated primary combination ID, 0 for non-AI-backup
     */
    private Long primaryCombinationId;

    /**
     * Source type: 0=manual, 1=AI auto-generated
     */
    private Integer sourceType;
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-data -am -q 2>&1 | tail -5
```

---

### Task 4: 更新 BusinessConfig 新增配置项

**Files:**
- Modify: `whatsapp-crm-common/src/main/java/com/opay/occ/whatsapp/common/config/BusinessConfig.java`

**Interfaces:**
- Produces: `BusinessConfig` 新增 `aiBackupEnabled`, `aiBackupCreateAsync`, `aiBackupMinStabilityLevel` 字段

- [ ] **Step 1: 在 BusinessConfig.java 新增字段**

```java
    @Value("${ai_backup.enabled:false}")
    private Boolean aiBackupEnabled;

    @Value("${ai_backup.create_async:false}")
    private Boolean aiBackupCreateAsync;

    @Value("${ai_backup.min_stability_level:B}")
    private String aiBackupMinStabilityLevel;
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-common -am -q 2>&1 | tail -5
```

---

### Task 5: 创建 AiBackupStabilityConfig — 独立稳定性评级规则配置

**Files:**
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/config/AiBackupStabilityConfig.java`

**Interfaces:**
- Consumes: Apollo Config `ai_backup.stability_rules`
- Produces: `AiBackupStabilityConfig.getRules()` → `List<AiBackupStabilityConfig.StabilityRule>`, `AiBackupStabilityConfig.StabilityRule` (level, condition, reason)

- [ ] **Step 1: 创建 AiBackupStabilityConfig.java**

```java
package com.opay.occ.whatsapp.data.config;

import com.alibaba.fastjson.JSON;
import com.ctrip.framework.apollo.Config;
import com.ctrip.framework.apollo.ConfigService;
import com.ctrip.framework.apollo.model.ConfigChangeEvent;
import com.ctrip.framework.apollo.spring.annotation.ApolloConfigChangeListener;
import lombok.Data;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * AI backup material group stability rating rules config.
 * Independent from MaterialGroupStabilityConfig — no totalTemplateCount threshold.
 */
@Slf4j
@Component
public class AiBackupStabilityConfig {

    private static final String CONFIG_KEY = "ai_backup.stability_rules";

    @Getter
    private List<StabilityRule> rules = new ArrayList<>();

    private final Config apolloConfig;

    public AiBackupStabilityConfig() {
        this.apolloConfig = ConfigService.getConfig("application");
        loadRules();
    }

    @ApolloConfigChangeListener(interestedKeyPrefixes = {"ai_backup.stability_rules"})
    private void onConfigChange(ConfigChangeEvent changeEvent) {
        if (changeEvent.isChanged(CONFIG_KEY)) {
            log.info("AiBackupStabilityConfig changed, reloading...");
            loadRules();
        }
    }

    private void loadRules() {
        String rulesJson = apolloConfig.getProperty(CONFIG_KEY, "");
        if (StringUtils.isBlank(rulesJson)) {
            log.warn("AiBackupStabilityConfig rules is empty, using default D rule");
            this.rules = createDefaultRules();
            return;
        }
        try {
            List<StabilityRule> parsed = JSON.parseArray(rulesJson, StabilityRule.class);
            if (CollectionUtils.isEmpty(parsed)) {
                this.rules = createDefaultRules();
            } else {
                this.rules = parsed;
            }
            log.info("AiBackupStabilityConfig loaded {} rules", this.rules.size());
        } catch (Exception e) {
            log.error("AiBackupStabilityConfig parse error, using defaults", e);
            this.rules = createDefaultRules();
        }
    }

    private List<StabilityRule> createDefaultRules() {
        StabilityRule defaultRule = new StabilityRule();
        defaultRule.setLevel("D");
        defaultRule.setCondition("true");
        defaultRule.setReason("No rules configured, default D");
        return Collections.singletonList(defaultRule);
    }

    @Data
    public static class StabilityRule {
        /** Stability level: A/B/C/D */
        private String level;
        /** SpEL condition expression */
        private String condition;
        /** Reason template, supports ${utilityPercent} etc. */
        private String reason;
    }
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-data -am -q 2>&1 | tail -5
```

---

### Task 6: 创建 AiBackupStabilityService — 稳定性评级计算服务

**Files:**
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/AiBackupStabilityService.java`

**Interfaces:**
- Consumes: `AiBackupStabilityConfig.getRules()`, `GradeExpressionContext.getExpression()`
- Produces: `AiBackupStabilityService.evaluate(utilityPercent, utilityCount, totalSentCount, avgScore, avgAiScore)` → `AiBackupStabilityService.StabilityResult(level, reason)`

- [ ] **Step 1: 先确认 GradeExpressionContext 位置**

```bash
find /Users/opay-20260271/code-temp/whatsapp_crm -name "GradeExpressionContext.java" -not -path "*/target/*" -not -path "*/.trae/*"
```

- [ ] **Step 2: 创建 AiBackupStabilityService.java**

```java
package com.opay.occ.whatsapp.data.service;

import com.opay.occ.whatsapp.data.config.AiBackupStabilityConfig;
import com.opay.occ.whatsapp.data.source.grade.GradeExpressionContext;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import org.springframework.expression.Expression;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.text.DecimalFormat;

/**
 * Stability evaluation service for AI backup material groups.
 * Independent from MaterialGroupStabilityService — does NOT use totalTemplateCount threshold.
 */
@Slf4j
@Service
public class AiBackupStabilityService {

    private static final DecimalFormat PCT_FORMAT = new DecimalFormat("0.0%");

    @Resource
    private AiBackupStabilityConfig stabilityConfig;

    /**
     * Evaluate stability level for AI backup material group.
     * Match rules in Apollo config order, return the first rule with condition=true.
     *
     * @param utilityPercent utility rate (0.0~1.0)
     * @param utilityCount   number of utility-passed sends
     * @param totalSentCount total number of sends
     * @param avgScore       average userScore from adopted AI suggestions (1~5)
     * @param avgAiScore     average AI self-score from adopted suggestions (0~5)
     */
    public StabilityResult evaluate(double utilityPercent, long utilityCount,
                                    long totalSentCount, double avgScore, double avgAiScore) {
        StandardEvaluationContext ctx = new StandardEvaluationContext();
        ctx.setVariable("utilityPercent", utilityPercent);
        ctx.setVariable("utilityCount", utilityCount);
        ctx.setVariable("totalSentCount", totalSentCount);
        ctx.setVariable("avgScore", avgScore);
        ctx.setVariable("avgAiScore", avgAiScore);

        String utilityPctStr = PCT_FORMAT.format(utilityPercent);

        if (CollectionUtils.isEmpty(stabilityConfig.getRules())) {
            return new StabilityResult("D", "No rules configured");
        }

        for (AiBackupStabilityConfig.StabilityRule rule : stabilityConfig.getRules()) {
            try {
                Expression expression = GradeExpressionContext.getExpression(
                        "ai_backup_stability_" + rule.getLevel(),
                        rule.getCondition());
                Boolean match = expression.getValue(ctx, Boolean.class);
                if (Boolean.TRUE.equals(match)) {
                    String reason = rule.getReason()
                            .replace("${utilityPercent}", utilityPctStr)
                            .replace("${utilityCount}", String.valueOf(utilityCount))
                            .replace("${totalSentCount}", String.valueOf(totalSentCount))
                            .replace("${avgScore}", String.valueOf(avgScore))
                            .replace("${avgAiScore}", String.valueOf(avgAiScore));
                    return new StabilityResult(rule.getLevel(), reason);
                }
            } catch (Exception e) {
                log.error("AiBackupStabilityService evaluate error for rule: {}, condition: {}",
                        rule.getLevel(), rule.getCondition(), e);
            }
        }

        return new StabilityResult("D", "No rule matched, default D");
    }

    @Data
    @AllArgsConstructor
    public static class StabilityResult {
        private String level;
        private String reason;
    }
}
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-data -am -q 2>&1 | tail -5
```

---

### Task 7: 创建 AiBackupMaterialUpdateLog PO 和 Mapper

**Files:**
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/po/AiBackupMaterialUpdateLog.java`
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/mapper/AiBackupMaterialUpdateLogMapper.java`

**Interfaces:**
- Produces: `AiBackupMaterialUpdateLog` PO, `AiBackupMaterialUpdateLogMapper` extends `BaseMapper<AiBackupMaterialUpdateLog>`

- [ ] **Step 1: 创建 AiBackupMaterialUpdateLog.java**

```java
package com.opay.occ.whatsapp.data.entity.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.experimental.Accessors;

/**
 * AI backup material group update history log
 *
 * @TableName ai_backup_material_update_log
 */
@TableName(value = "ai_backup_material_update_log")
@Data
@Accessors(chain = true)
public class AiBackupMaterialUpdateLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** Primary material group ID */
    private Long primaryGroupId;

    /** AI backup material group ID */
    private Long backupGroupId;

    /** Source lane code */
    private String aiSourceLane;

    /** Operation type: CREATE/UPDATE/ENABLE/DISABLE/DELETE */
    private String operateType;

    /** Trigger source: HOOK/MQ/JOB/MANUAL */
    private String triggerSource;

    /** Content before change, JSON format */
    private String beforeContent;

    /** Content after change, JSON format */
    private String afterContent;

    /** Reserved for future use */
    private Integer status;

    /** Reserved for future use */
    private String remark;

    /** Operator */
    private String operator;

    /** Creation time */
    private Long createTime;

    /** Update time */
    private Long updateTime;
}
```

- [ ] **Step 2: 创建 AiBackupMaterialUpdateLogMapper.java**

```java
package com.opay.occ.whatsapp.data.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.opay.occ.whatsapp.data.entity.po.AiBackupMaterialUpdateLog;

/**
 * AI backup material group update history log Mapper
 */
public interface AiBackupMaterialUpdateLogMapper extends BaseMapper<AiBackupMaterialUpdateLog> {
}
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-data -am -q 2>&1 | tail -5
```

---

### Task 8: 创建 AiBackupMaterialGroupService 接口

**Files:**
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/AiBackupMaterialGroupService.java`

**Interfaces:**
- Produces: `AiBackupMaterialGroupService.createAiBackupGroup(materialGroupId, operator)`, `AiBackupMaterialGroupService.getAiBackupMaterialGroup(primaryGroupId, laneCode)`, `AiBackupMaterialGroupService.createCompensation()`

- [ ] **Step 1: 创建 AiBackupMaterialGroupService.java**

```java
package com.opay.occ.whatsapp.data.service;

import com.opay.occ.whatsapp.data.entity.dto.response.AiBackupMaterialGroupVO;

/**
 * AI backup material group service.
 */
public interface AiBackupMaterialGroupService {

    /**
     * Create AI backup material groups for a primary material group.
     * Called by MQ consumer and XXL-Job compensation.
     *
     * @param primaryGroupId primary material group ID
     * @param operator       operator username
     */
    void createAiBackupGroup(Long primaryGroupId, String operator);

    /**
     * Get available AI backup material group for sending.
     * Returns null if no backup group exists or stability below threshold.
     *
     * @param primaryGroupId primary material group ID
     * @param laneCode       source lane code
     * @return AI backup group info, or null if unavailable
     */
    AiBackupMaterialGroupVO getAiBackupMaterialGroup(Long primaryGroupId, String laneCode);

    /**
     * Compensation: scan adopted suggestions without backup groups and create them.
     */
    void createCompensation();
}
```

- [ ] **Step 2: 创建 AiBackupMaterialGroupVO.java**

```java
package com.opay.occ.whatsapp.data.entity.dto.response;

import lombok.Data;
import lombok.experimental.Accessors;

import java.util.List;

/**
 * AI backup material group response VO.
 */
@Data
@Accessors(chain = true)
public class AiBackupMaterialGroupVO {

    private Long backupGroupId;

    private String backupGroupName;

    private String stabilityLevel;

    private List<CombinationVO> combinations;

    @Data
    @Accessors(chain = true)
    public static class CombinationVO {
        private Long combinationId;
        private Long primaryCombinationId;
        private String headerMaterialId;
        private String bodyMaterialId;
        private String footerMaterialId;
        private String buttonsMaterialId;
    }
}
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-data -am -q 2>&1 | tail -5
```

---

### Task 9: 创建 AiBackupMaterialGroupServiceImpl 核心实现

**Files:**
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/impl/AiBackupMaterialGroupServiceImpl.java`

**Interfaces:**
- Consumes: `MessageMaterialGroupService`, `MessageMaterialCombinationService`, `MessageMaterialService`, `AiMaterialSuggestionMapper`, `AiBackupMaterialUpdateLogMapper`, `AiBackupStabilityService`, `BusinessConfig`, `StringRedisTemplate`
- Produces: `AiBackupMaterialGroupService` 完整实现

- [ ] **Step 1: 创建 AiBackupMaterialGroupServiceImpl.java**

```java
package com.opay.occ.whatsapp.data.service.impl;

import cn.hutool.json.JSONUtil;
import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opay.occ.whatsapp.common.config.BusinessConfig;
import com.opay.occ.whatsapp.common.enums.AiSuggestionFeedbackTypeEnum;
import com.opay.occ.whatsapp.common.enums.MaterialGroupStatusEnum;
import com.opay.occ.whatsapp.data.entity.dto.response.AiBackupMaterialGroupVO;
import com.opay.occ.whatsapp.data.entity.po.*;
import com.opay.occ.whatsapp.data.mapper.AiBackupMaterialUpdateLogMapper;
import com.opay.occ.whatsapp.data.mapper.AiMaterialSuggestionMapper;
import com.opay.occ.whatsapp.data.mapper.MessageMaterialGroupMapper;
import com.opay.occ.whatsapp.data.mongo.model.MessageMaterial;
import com.opay.occ.whatsapp.data.mongo.service.MessageMaterialService;
import com.opay.occ.whatsapp.data.service.*;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AI backup material group service implementation.
 */
@Slf4j
@Service
public class AiBackupMaterialGroupServiceImpl implements AiBackupMaterialGroupService {

    @Resource
    private BusinessConfig businessConfig;

    @Resource
    private MessageMaterialGroupMapper messageMaterialGroupMapper;

    @Resource
    private MessageMaterialGroupService messageMaterialGroupService;

    @Resource
    private MessageMaterialCombinationService messageMaterialCombinationService;

    @Resource
    private MessageMaterialService messageMaterialService;

    @Resource
    private AiMaterialSuggestionMapper aiMaterialSuggestionMapper;

    @Resource
    private AiBackupMaterialUpdateLogMapper aiBackupMaterialUpdateLogMapper;

    @Resource
    private AiBackupStabilityService aiBackupStabilityService;

    @Resource
    private StringRedisTemplate stringRedisTemplate;

    private static final String STABILITY_CACHE_PREFIX = "material_group_stability:";

    private static final String OPERATE_TYPE_CREATE = "CREATE";
    private static final String OPERATE_TYPE_UPDATE = "UPDATE";
    private static final String TRIGGER_SOURCE_MQ = "MQ";
    private static final String TRIGGER_SOURCE_JOB = "JOB";
    private static final String TRIGGER_SOURCE_HOOK = "HOOK";

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void createAiBackupGroup(Long primaryGroupId, String operator) {
        log.info("createAiBackupGroup start, primaryGroupId={}, operator={}", primaryGroupId, operator);

        // 1. Query primary material group
        MessageMaterialGroup primaryGroup = messageMaterialGroupMapper.selectById(primaryGroupId);
        if (primaryGroup == null) {
            log.warn("createAiBackupGroup primary group not found, id={}", primaryGroupId);
            return;
        }

        // 2. Query adopted AI suggestions, grouped by sourceLane
        List<AiMaterialSuggestion> adoptedSuggestions = aiMaterialSuggestionMapper.selectList(
                new LambdaQueryWrapper<AiMaterialSuggestion>()
                        .eq(AiMaterialSuggestion::getMaterialGroupId, primaryGroupId)
                        .eq(AiMaterialSuggestion::getFeedbackType, AiSuggestionFeedbackTypeEnum.ADOPT.getCode())
                        .eq(AiMaterialSuggestion::getStatus, AiSuggestionFeedbackTypeEnum.ADOPT.getCode())
        );

        if (CollectionUtils.isEmpty(adoptedSuggestions)) {
            log.info("createAiBackupGroup no adopted suggestions for groupId={}", primaryGroupId);
            return;
        }

        Map<String, List<AiMaterialSuggestion>> laneMap = adoptedSuggestions.stream()
                .filter(s -> StringUtils.isNotBlank(s.getSourceLane()))
                .collect(Collectors.groupingBy(AiMaterialSuggestion::getSourceLane));

        // 3. Process each lane
        for (Map.Entry<String, List<AiMaterialSuggestion>> entry : laneMap.entrySet()) {
            String laneCode = entry.getKey();
            List<AiMaterialSuggestion> laneSuggestions = entry.getValue();
            try {
                processLane(primaryGroup, laneCode, laneSuggestions, operator, TRIGGER_SOURCE_MQ);
            } catch (Exception e) {
                log.error("createAiBackupGroup process lane failed, primaryGroupId={}, laneCode={}",
                        primaryGroupId, laneCode, e);
            }
        }

        log.info("createAiBackupGroup done, primaryGroupId={}", primaryGroupId);
    }

    private void processLane(MessageMaterialGroup primaryGroup, String laneCode,
                             List<AiMaterialSuggestion> suggestions, String operator, String triggerSource) {
        // Check if AI backup group already exists for this lane
        List<MessageMaterialGroup> existingBackups = messageMaterialGroupMapper.selectList(
                new LambdaQueryWrapper<MessageMaterialGroup>()
                        .eq(MessageMaterialGroup::getPrimaryGroupId, primaryGroup.getId())
                        .eq(MessageMaterialGroup::getAiSourceLane, laneCode)
                        .eq(MessageMaterialGroup::getSourceType, 1)
        );

        if (CollectionUtils.isNotEmpty(existingBackups)) {
            // Update existing backup group
            updateExistingBackupGroup(primaryGroup, existingBackups.get(0), laneCode, suggestions, operator, triggerSource);
            return;
        }

        // Create new backup group
        createNewBackupGroup(primaryGroup, laneCode, suggestions, operator, triggerSource);
    }

    private void createNewBackupGroup(MessageMaterialGroup primaryGroup, String laneCode,
                                      List<AiMaterialSuggestion> suggestions, String operator, String triggerSource) {
        // 1. Create AI backup material group record
        MessageMaterialGroup backupGroup = new MessageMaterialGroup();
        backupGroup.setName(primaryGroup.getName() + "-AI-" + laneCode);
        backupGroup.setTemplateType(primaryGroup.getTemplateType());
        backupGroup.setLanguage(primaryGroup.getLanguage());
        backupGroup.setStatus(MaterialGroupStatusEnum.ACTIVE.name());
        backupGroup.setCombinationMode(primaryGroup.getCombinationMode());
        backupGroup.setPrimaryGroupId(primaryGroup.getId());
        backupGroup.setAiSourceLane(laneCode);
        backupGroup.setSourceType(1);
        backupGroup.setCreator(operator);
        backupGroup.setUpdater(operator);
        backupGroup.setCtime(System.currentTimeMillis());
        backupGroup.setUtime(System.currentTimeMillis());
        messageMaterialGroupMapper.insert(backupGroup);

        // 2. For each adopted body suggestion, create a combination
        List<Long> createdCombinationIds = new ArrayList<>();
        for (AiMaterialSuggestion suggestion : suggestions) {
            try {
                Long combinationId = createCombinationForSuggestion(
                        primaryGroup.getId(), backupGroup.getId(), suggestion);
                if (combinationId != null) {
                    createdCombinationIds.add(combinationId);
                }
            } catch (Exception e) {
                log.error("createCombinationForSuggestion failed, suggestionId={}", suggestion.getId(), e);
            }
        }

        // 3. Record operation log
        saveUpdateLog(primaryGroup.getId(), backupGroup.getId(), laneCode,
                OPERATE_TYPE_CREATE, triggerSource, null,
                JSON.toJSONString(Collections.singletonMap("combinationIds", createdCombinationIds)),
                operator);
    }

    private void updateExistingBackupGroup(MessageMaterialGroup primaryGroup, MessageMaterialGroup backupGroup,
                                           String laneCode, List<AiMaterialSuggestion> suggestions,
                                           String operator, String triggerSource) {
        String beforeContent = JSON.toJSONString(Collections.singletonMap("backupGroupId", backupGroup.getId()));

        List<Long> createdCombinationIds = new ArrayList<>();
        for (AiMaterialSuggestion suggestion : suggestions) {
            try {
                Long combinationId = createCombinationForSuggestion(
                        primaryGroup.getId(), backupGroup.getId(), suggestion);
                if (combinationId != null) {
                    createdCombinationIds.add(combinationId);
                }
            } catch (Exception e) {
                log.error("updateExistingBackupGroup createCombination failed, suggestionId={}", suggestion.getId(), e);
            }
        }

        backupGroup.setUtime(System.currentTimeMillis());
        backupGroup.setUpdater(operator);
        messageMaterialGroupMapper.updateById(backupGroup);

        saveUpdateLog(primaryGroup.getId(), backupGroup.getId(), laneCode,
                OPERATE_TYPE_UPDATE, triggerSource, beforeContent,
                JSON.toJSONString(Collections.singletonMap("newCombinationIds", createdCombinationIds)),
                operator);
    }

    private Long createCombinationForSuggestion(Long primaryGroupId, Long backupGroupId,
                                                 AiMaterialSuggestion suggestion) {
        // Find the original combination that contains this body
        // Query message_material_combination by material_group_id and the body material
        String bodyMaterialId = suggestion.getMaterialId();
        if (StringUtils.isBlank(bodyMaterialId)) {
            log.warn("createCombinationForSuggestion body materialId is blank, suggestionId={}", suggestion.getId());
            return null;
        }

        // Find original combination by body material
        List<MessageMaterialCombination> originalCombos = messageMaterialCombinationService.lambdaQuery()
                .eq(MessageMaterialCombination::getMaterialGroupId, primaryGroupId)
                .and(w -> w.eq(MessageMaterialCombination::getBodyMaterialId, bodyMaterialId))
                .last("limit 1")
                .list();

        if (CollectionUtils.isEmpty(originalCombos)) {
            log.warn("createCombinationForSuggestion original combo not found, bodyMaterialId={}", bodyMaterialId);
            return null;
        }

        MessageMaterialCombination originalCombo = originalCombos.get(0);

        // Copy header/footer/buttons material content, create new materials
        String newHeaderId = copyMaterialIfNotNull(originalCombo.getHeaderMaterialId(), backupGroupId);
        String newFooterId = copyMaterialIfNotNull(originalCombo.getFooterMaterialId(), backupGroupId);
        String newButtonsId = copyMaterialIfNotNull(originalCombo.getButtonsMaterialId(), backupGroupId);

        // Create new body material with AI suggested content
        String newBodyId = createBodyMaterial(suggestion.getSuggestedContent(), backupGroupId);

        // Create new message_material_combination
        MessageMaterialCombination newCombo = new MessageMaterialCombination();
        newCombo.setMaterialGroupId(backupGroupId);
        newCombo.setHeaderMaterialId(newHeaderId);
        newCombo.setBodyMaterialId(newBodyId);
        newCombo.setFooterMaterialId(newFooterId);
        newCombo.setButtonsMaterialId(newButtonsId);
        newCombo.setPrimaryCombinationId(originalCombo.getId());
        newCombo.setSourceType(1);
        newCombo.setStatus("ACTIVE");
        newCombo.setMaterialStatus("NORMAL");
        newCombo.setCreator("AI_BACKUP");
        newCombo.setUpdater("AI_BACKUP");
        newCombo.setCtime(System.currentTimeMillis());
        newCombo.setUtime(System.currentTimeMillis());
        messageMaterialCombinationService.save(newCombo);

        return newCombo.getId();
    }

    private String copyMaterialIfNotNull(String materialId, Long backupGroupId) {
        if (StringUtils.isBlank(materialId)) {
            return null;
        }
        try {
            MessageMaterial original = messageMaterialService.queryById(materialId);
            if (original == null) {
                return null;
            }
            // Copy content, create new material
            MessageMaterial copy = new MessageMaterial();
            copy.setMaterialGroupId(backupGroupId);
            copy.setType(original.getType());
            copy.setContent(original.getContent());
            copy.setMediaType(original.getMediaType());
            copy.setMediaUrl(original.getMediaUrl());
            copy.setCreator("AI_BACKUP");
            copy.setUpdater("AI_BACKUP");
            copy.setCtime(System.currentTimeMillis());
            copy.setUtime(System.currentTimeMillis());
            messageMaterialService.save(copy);
            return copy.getId() != null ? copy.getId().toString() : null;
        } catch (Exception e) {
            log.error("copyMaterialIfNotNull failed, materialId={}", materialId, e);
            return null;
        }
    }

    private String createBodyMaterial(String content, Long backupGroupId) {
        try {
            MessageMaterial body = new MessageMaterial();
            body.setMaterialGroupId(backupGroupId);
            body.setType("BODY");
            body.setContent(content);
            body.setCreator("AI_BACKUP");
            body.setUpdater("AI_BACKUP");
            body.setCtime(System.currentTimeMillis());
            body.setUtime(System.currentTimeMillis());
            messageMaterialService.save(body);
            return body.getId() != null ? body.getId().toString() : null;
        } catch (Exception e) {
            log.error("createBodyMaterial failed, backupGroupId={}", backupGroupId, e);
            return null;
        }
    }

    private void saveUpdateLog(Long primaryGroupId, Long backupGroupId, String laneCode,
                               String operateType, String triggerSource,
                               String beforeContent, String afterContent, String operator) {
        try {
            AiBackupMaterialUpdateLog logRecord = new AiBackupMaterialUpdateLog();
            logRecord.setPrimaryGroupId(primaryGroupId);
            logRecord.setBackupGroupId(backupGroupId);
            logRecord.setAiSourceLane(laneCode);
            logRecord.setOperateType(operateType);
            logRecord.setTriggerSource(triggerSource);
            logRecord.setBeforeContent(beforeContent);
            logRecord.setAfterContent(afterContent);
            logRecord.setOperator(operator);
            logRecord.setCreateTime(System.currentTimeMillis());
            logRecord.setUpdateTime(System.currentTimeMillis());
            aiBackupMaterialUpdateLogMapper.insert(logRecord);
        } catch (Exception e) {
            log.error("saveUpdateLog failed, backupGroupId={}", backupGroupId, e);
        }
    }

    @Override
    public AiBackupMaterialGroupVO getAiBackupMaterialGroup(Long primaryGroupId, String laneCode) {
        // 1. Query AI backup group by primary_group_id + ai_source_lane
        List<MessageMaterialGroup> backupGroups = messageMaterialGroupMapper.selectList(
                new LambdaQueryWrapper<MessageMaterialGroup>()
                        .eq(MessageMaterialGroup::getPrimaryGroupId, primaryGroupId)
                        .eq(MessageMaterialGroup::getAiSourceLane, laneCode)
                        .eq(MessageMaterialGroup::getSourceType, 1)
                        .last("limit 1")
        );

        if (CollectionUtils.isEmpty(backupGroups)) {
            return null;
        }

        MessageMaterialGroup backupGroup = backupGroups.get(0);

        // 2. Get stability rating from cache
        String stabilityLevel = stringRedisTemplate.opsForValue()
                .get(STABILITY_CACHE_PREFIX + backupGroup.getId());
        if (stabilityLevel == null) {
            stabilityLevel = "D"; // default for new groups
        }

        // 3. Compare with configured threshold
        String minLevel = businessConfig.getAiBackupMinStabilityLevel();
        if (compareLevel(stabilityLevel, minLevel) < 0) {
            log.info("AI backup group stability too low, id={}, level={}, min={}",
                    backupGroup.getId(), stabilityLevel, minLevel);
            return null;
        }

        // 4. Query combinations
        List<MessageMaterialCombination> combinations = messageMaterialCombinationService.lambdaQuery()
                .eq(MessageMaterialCombination::getMaterialGroupId, backupGroup.getId())
                .eq(MessageMaterialCombination::getSourceType, 1)
                .list();

        List<AiBackupMaterialGroupVO.CombinationVO> comboVOs = combinations.stream().map(c -> {
            AiBackupMaterialGroupVO.CombinationVO vo = new AiBackupMaterialGroupVO.CombinationVO();
            vo.setCombinationId(c.getId());
            vo.setPrimaryCombinationId(c.getPrimaryCombinationId());
            vo.setHeaderMaterialId(c.getHeaderMaterialId());
            vo.setBodyMaterialId(c.getBodyMaterialId());
            vo.setFooterMaterialId(c.getFooterMaterialId());
            vo.setButtonsMaterialId(c.getButtonsMaterialId());
            return vo;
        }).collect(Collectors.toList());

        // 5. Build response
        AiBackupMaterialGroupVO vo = new AiBackupMaterialGroupVO();
        vo.setBackupGroupId(backupGroup.getId());
        vo.setBackupGroupName(backupGroup.getName());
        vo.setStabilityLevel(stabilityLevel);
        vo.setCombinations(comboVOs);

        return vo;
    }

    @Override
    public void createCompensation() {
        log.info("createCompensation start");

        // Find all adopted suggestions whose material group has no AI backup
        List<AiMaterialSuggestion> adoptedSuggestions = aiMaterialSuggestionMapper.selectList(
                new LambdaQueryWrapper<AiMaterialSuggestion>()
                        .eq(AiMaterialSuggestion::getFeedbackType, AiSuggestionFeedbackTypeEnum.ADOPT.getCode())
                        .eq(AiMaterialSuggestion::getStatus, AiSuggestionFeedbackTypeEnum.ADOPT.getCode())
        );

        if (CollectionUtils.isEmpty(adoptedSuggestions)) {
            log.info("createCompensation no adopted suggestions found");
            return;
        }

        // Group by (materialGroupId, sourceLane)
        Map<String, List<AiMaterialSuggestion>> grouped = adoptedSuggestions.stream()
                .filter(s -> s.getMaterialGroupId() != null && StringUtils.isNotBlank(s.getSourceLane()))
                .collect(Collectors.groupingBy(
                        s -> s.getMaterialGroupId() + "_" + s.getSourceLane(),
                        LinkedHashMap::new,
                        Collectors.toList()
                ));

        for (Map.Entry<String, List<AiMaterialSuggestion>> entry : grouped.entrySet()) {
            try {
                AiMaterialSuggestion first = entry.getValue().get(0);
                Long primaryGroupId = first.getMaterialGroupId();
                String laneCode = first.getSourceLane();

                // Check if AI backup already exists
                List<MessageMaterialGroup> existing = messageMaterialGroupMapper.selectList(
                        new LambdaQueryWrapper<MessageMaterialGroup>()
                                .eq(MessageMaterialGroup::getPrimaryGroupId, primaryGroupId)
                                .eq(MessageMaterialGroup::getAiSourceLane, laneCode)
                                .eq(MessageMaterialGroup::getSourceType, 1)
                                .last("limit 1")
                );

                if (CollectionUtils.isNotEmpty(existing)) {
                    continue;
                }

                // Create backup group
                MessageMaterialGroup primaryGroup = messageMaterialGroupMapper.selectById(primaryGroupId);
                if (primaryGroup == null) {
                    continue;
                }
                createNewBackupGroup(primaryGroup, laneCode, entry.getValue(), "SYSTEM", TRIGGER_SOURCE_JOB);
            } catch (Exception e) {
                log.error("createCompensation failed for key={}", entry.getKey(), e);
            }
        }

        log.info("createCompensation done, processed {} groups", grouped.size());
    }

    /**
     * Compare stability levels: A > B > C > D.
     * @return positive if level1 > level2, 0 if equal, negative if level1 < level2
     */
    private int compareLevel(String level1, String level2) {
        if (level1 == null && level2 == null) return 0;
        if (level1 == null) return -1;
        if (level2 == null) return 1;
        return level2.compareTo(level1); // D < C < B < A in lexicographic order
    }
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-data -am -q 2>&1 | tail -5
```

**注意：** 编译时如果 `MessageMaterial` 的字段名与代码中不同，需要根据实际 Mongo 实体调整字段名。先编译确认。

---

### Task 10: Hook 埋点 — MessageMaterialGroupServiceImpl 中集成

**Files:**
- Modify: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/impl/MessageMaterialGroupServiceImpl.java`

**Interfaces:**
- Consumes: `AiBackupMaterialGroupService`, `BusinessConfig`, `RocketMQTemplate`
- Produces: 在 create/update 方法中发送 MQ 消息

- [ ] **Step 1: 查看 MessageMaterialGroupServiceImpl 的 create 方法签名**

```bash
grep -n "public.*create\|public.*update" /Users/opay-20260271/code-temp/whatsapp_crm/whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/impl/MessageMaterialGroupServiceImpl.java | head -10
```

- [ ] **Step 2: 注入依赖**

在类中添加 `@Resource` 声明：

```java
    @Resource
    private AiBackupMaterialGroupService aiBackupMaterialGroupService;

    @Resource
    private BusinessConfig businessConfig;

    @Autowired(required = false)
    private RocketMQTemplate rocketMQTemplate;
```

- [ ] **Step 3: 在 create/update 方法末尾添加 Hook**

在 `create` 和 `update` 方法的 return 之前，添加：

```java
        // Hook: trigger AI backup material group creation
        triggerAiBackupCreation(materialGroupId, operator);
```

- [ ] **Step 4: 添加 triggerAiBackupCreation 私有方法**

```java
    private void triggerAiBackupCreation(Long materialGroupId, String operator) {
        if (!Boolean.TRUE.equals(businessConfig.getAiBackupEnabled())
                || !Boolean.TRUE.equals(businessConfig.getAiBackupCreateAsync())) {
            return;
        }
        try {
            Map<String, Object> message = new HashMap<>();
            message.put("materialGroupId", materialGroupId);
            message.put("operator", operator);
            message.put("timestamp", System.currentTimeMillis());

            if (rocketMQTemplate != null) {
                rocketMQTemplate.syncSend("ai_backup_material_group_create",
                        org.springframework.messaging.support.MessageBuilder
                                .withPayload(JSON.toJSONString(message)).build(),
                        3000);
                log.info("triggerAiBackupCreation MQ sent, materialGroupId={}", materialGroupId);
            } else {
                log.warn("triggerAiBackupCreation rocketMQTemplate is null, skip");
            }
        } catch (Exception e) {
            log.error("triggerAiBackupCreation failed, materialGroupId={}", materialGroupId, e);
        }
    }
```

- [ ] **Step 5: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-data -am -q 2>&1 | tail -5
```

---

### Task 11: 创建 RocketMQ Consumer

**Files:**
- Create: `whatsapp-crm-mq/src/main/java/com/opay/occ/whatsapp/mq/rocket/consumer/AiBackupMaterialGroupCreateConsumer.java`

**Interfaces:**
- Consumes: RocketMQ topic `ai_backup_material_group_create`
- Produces: 消费消息，调用 `AiBackupMaterialGroupService.createAiBackupGroup()`

- [ ] **Step 1: 创建 AiBackupMaterialGroupCreateConsumer.java**

```java
package com.opay.occ.whatsapp.mq.rocket.consumer;

import cn.hutool.json.JSONUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.opay.occ.whatsapp.data.rocketmq.BaseRocketMQListener;
import com.opay.occ.whatsapp.data.service.AiBackupMaterialGroupService;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.common.message.MessageExt;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Consumer for AI backup material group creation messages.
 */
@Slf4j
@Component
@RocketMQMessageListener(
        topic = "ai_backup_material_group_create",
        consumerGroup = "ai_backup_material_group_create_consumer",
        consumeThreadMax = 4,
        consumeThreadNumber = 2
)
public class AiBackupMaterialGroupCreateConsumer extends BaseRocketMQListener<String> {

    @Autowired
    private AiBackupMaterialGroupService aiBackupMaterialGroupService;

    @Override
    protected Class<String> messageClass() {
        return String.class;
    }

    @Override
    protected void doConsumeMessage(MessageExt messageExt, String message) {
        log.info("AiBackupMaterialGroupCreateConsumer receive message: {}", message);
        try {
            JSONObject json = JSON.parseObject(message);
            Long materialGroupId = json.getLong("materialGroupId");
            String operator = json.getString("operator");

            if (materialGroupId == null) {
                log.error("AiBackupMaterialGroupCreateConsumer materialGroupId is null");
                return;
            }

            aiBackupMaterialGroupService.createAiBackupGroup(materialGroupId,
                    operator != null ? operator : "SYSTEM");
        } catch (Exception e) {
            log.error("AiBackupMaterialGroupCreateConsumer error, message: {}", message, e);
            throw new RuntimeException("AiBackupMaterialGroupCreateConsumer error", e);
        }
    }
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-mq -am -q 2>&1 | tail -5
```

---

### Task 12: 创建 XXL-Job Service — 缓存刷新

**Files:**
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/xxljob/RefreshAiBackupStabilityCacheJobService.java`

**Interfaces:**
- Consumes: `MessageMaterialGroupMapper`, `AiBackupStabilityService`, `StringRedisTemplate`, `MessageMaterialTemplateMapper`
- Produces: `refreshCache()` 方法，刷新所有 AI 备用组的稳定性评级缓存

- [ ] **Step 1: 创建 RefreshAiBackupStabilityCacheJobService.java**

```java
package com.opay.occ.whatsapp.data.xxljob;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opay.occ.whatsapp.data.entity.po.MessageMaterialGroup;
import com.opay.occ.whatsapp.data.entity.po.MessageMaterialTemplate;
import com.opay.occ.whatsapp.data.entity.po.MessageTemplateWaba;
import com.opay.occ.whatsapp.data.mapper.MessageMaterialGroupMapper;
import com.opay.occ.whatsapp.data.mapper.MessageMaterialTemplateMapper;
import com.opay.occ.whatsapp.data.service.AiBackupStabilityService;
import com.opay.occ.whatsapp.data.service.MessageTemplateWabaService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * XXL-Job service: refresh AI backup material group stability rating cache.
 */
@Slf4j
@Component
public class RefreshAiBackupStabilityCacheJobService {

    @Resource
    private MessageMaterialGroupMapper messageMaterialGroupMapper;

    @Resource
    private MessageMaterialTemplateMapper messageMaterialTemplateMapper;

    @Resource
    private MessageTemplateWabaService messageTemplateWabaService;

    @Resource
    private AiBackupStabilityService aiBackupStabilityService;

    @Resource
    private StringRedisTemplate stringRedisTemplate;

    private static final String STABILITY_CACHE_PREFIX = "material_group_stability:";

    public void refreshCache() {
        log.info("RefreshAiBackupStabilityCacheJobService start");

        List<MessageMaterialGroup> backupGroups = messageMaterialGroupMapper.selectList(
                new LambdaQueryWrapper<MessageMaterialGroup>()
                        .eq(MessageMaterialGroup::getSourceType, 1)
        );

        if (backupGroups.isEmpty()) {
            log.info("RefreshAiBackupStabilityCacheJobService no backup groups found");
            return;
        }

        int successCount = 0;
        int failCount = 0;

        for (MessageMaterialGroup group : backupGroups) {
            try {
                // Compute utility stats
                List<MessageMaterialTemplate> matTemplates = messageMaterialTemplateMapper.selectList(
                        new LambdaQueryWrapper<MessageMaterialTemplate>()
                                .eq(MessageMaterialTemplate::getMaterialGroupId, group.getId())
                );

                if (matTemplates.isEmpty()) {
                    // No templates yet, set default D
                    stringRedisTemplate.opsForValue().set(
                            STABILITY_CACHE_PREFIX + group.getId(), "D", 30, TimeUnit.MINUTES);
                    successCount++;
                    continue;
                }

                List<Long> templateIds = matTemplates.stream()
                        .map(MessageMaterialTemplate::getMessageTemplateId)
                        .distinct()
                        .collect(Collectors.toList());

                long totalSentCount = 0L;
                long utilityCount = 0L;

                // Batch query message_template_waba for utility stats
                // Use batch in to avoid large IN queries
                int batchSize = 200;
                for (int i = 0; i < templateIds.size(); i += batchSize) {
                    int end = Math.min(i + batchSize, templateIds.size());
                    List<Long> batch = templateIds.subList(i, end);

                    List<MessageTemplateWaba> wabaList = messageTemplateWabaService.lambdaQuery()
                            .in(MessageTemplateWaba::getMessageTemplateId, batch)
                            .list();

                    for (MessageTemplateWaba waba : wabaList) {
                        totalSentCount++;
                        if ("UTILITY".equalsIgnoreCase(waba.getStatus())) {
                            utilityCount++;
                        }
                    }
                }

                double utilityPercent = totalSentCount > 0
                        ? (double) utilityCount / totalSentCount : 0.0;

                // avgScore and avgAiScore are not easily computable without AI suggestion data
                // Use 0 as default for now
                double avgScore = 0.0;
                double avgAiScore = 0.0;

                AiBackupStabilityService.StabilityResult sr = aiBackupStabilityService.evaluate(
                        utilityPercent, utilityCount, totalSentCount, avgScore, avgAiScore);

                stringRedisTemplate.opsForValue().set(
                        STABILITY_CACHE_PREFIX + group.getId(),
                        sr.getLevel(),
                        30, TimeUnit.MINUTES);

                successCount++;
                log.debug("Refresh stability cache: groupId={}, level={}, utilityPercent={}",
                        group.getId(), sr.getLevel(), utilityPercent);
            } catch (Exception e) {
                failCount++;
                log.error("Refresh stability cache failed for groupId={}", group.getId(), e);
            }
        }

        log.info("RefreshAiBackupStabilityCacheJobService done, success={}, fail={}",
                successCount, failCount);
    }
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-data -am -q 2>&1 | tail -5
```

---

### Task 13: 创建 XXL-Job Service — 创建补偿

**Files:**
- Create: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/xxljob/CreateAiBackupMaterialGroupJobService.java`

**Interfaces:**
- Consumes: `AiBackupMaterialGroupService`
- Produces: `executeCompensation()` 方法

- [ ] **Step 1: 创建 CreateAiBackupMaterialGroupJobService.java**

```java
package com.opay.occ.whatsapp.data.xxljob;

import com.opay.occ.whatsapp.data.service.AiBackupMaterialGroupService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * XXL-Job service: compensation for AI backup material group creation.
 */
@Slf4j
@Component
public class CreateAiBackupMaterialGroupJobService {

    @Resource
    private AiBackupMaterialGroupService aiBackupMaterialGroupService;

    public void executeCompensation() {
        log.info("CreateAiBackupMaterialGroupJobService start");
        try {
            aiBackupMaterialGroupService.createCompensation();
            log.info("CreateAiBackupMaterialGroupJobService done");
        } catch (Exception e) {
            log.error("CreateAiBackupMaterialGroupJobService failed", e);
        }
    }
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-data -am -q 2>&1 | tail -5
```

---

### Task 14: 创建 XXL-Job 入口 — whatsapp-crm-job 模块

**Files:**
- Create: `whatsapp-crm-job/src/main/java/com/opay/occ/whatsapp/job/job/task/CreateAiBackupMaterialGroupJob.java`
- Create: `whatsapp-crm-job/src/main/java/com/opay/occ/whatsapp/job/job/task/RefreshAiBackupStabilityCacheJob.java`

**Interfaces:**
- Consumes: `CreateAiBackupMaterialGroupJobService`, `RefreshAiBackupStabilityCacheJobService`
- Produces: XXL-Job handler 入口

- [ ] **Step 1: 创建 CreateAiBackupMaterialGroupJob.java**

```java
package com.opay.occ.whatsapp.job.job.task;

import com.opay.occ.whatsapp.common.MDCUtil;
import com.opay.occ.whatsapp.data.xxljob.CreateAiBackupMaterialGroupJobService;
import com.xxl.job.core.biz.model.ReturnT;
import com.xxl.job.core.handler.annotation.XxlJob;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * XXL-Job: compensation for AI backup material group creation.
 */
@Slf4j
@Component
public class CreateAiBackupMaterialGroupJob {

    @Resource
    private CreateAiBackupMaterialGroupJobService createAiBackupMaterialGroupJobService;

    @XxlJob("CreateAiBackupMaterialGroupJob")
    public ReturnT<String> execute() {
        MDCUtil.start();
        log.info("CreateAiBackupMaterialGroupJob started");

        try {
            createAiBackupMaterialGroupJobService.executeCompensation();
            log.info("CreateAiBackupMaterialGroupJob completed successfully");
            return ReturnT.SUCCESS;
        } catch (Exception e) {
            log.error("CreateAiBackupMaterialGroupJob failed", e);
            return new ReturnT<>(ReturnT.FAIL_CODE, "Job failed: " + e.getMessage());
        } finally {
            MDCUtil.clear();
        }
    }
}
```

- [ ] **Step 2: 创建 RefreshAiBackupStabilityCacheJob.java**

```java
package com.opay.occ.whatsapp.job.job.task;

import com.opay.occ.whatsapp.common.MDCUtil;
import com.opay.occ.whatsapp.data.xxljob.RefreshAiBackupStabilityCacheJobService;
import com.xxl.job.core.biz.model.ReturnT;
import com.xxl.job.core.handler.annotation.XxlJob;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * XXL-Job: refresh AI backup material group stability rating cache.
 */
@Slf4j
@Component
public class RefreshAiBackupStabilityCacheJob {

    @Resource
    private RefreshAiBackupStabilityCacheJobService refreshAiBackupStabilityCacheJobService;

    @XxlJob("RefreshAiBackupStabilityCacheJob")
    public ReturnT<String> execute() {
        MDCUtil.start();
        log.info("RefreshAiBackupStabilityCacheJob started");

        try {
            refreshAiBackupStabilityCacheJobService.refreshCache();
            log.info("RefreshAiBackupStabilityCacheJob completed successfully");
            return ReturnT.SUCCESS;
        } catch (Exception e) {
            log.error("RefreshAiBackupStabilityCacheJob failed", e);
            return new ReturnT<>(ReturnT.FAIL_CODE, "Job failed: " + e.getMessage());
        } finally {
            MDCUtil.clear();
        }
    }
}
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-job -am -q 2>&1 | tail -5
```

---

### Task 15: 创建 XXL-Job 入口 — whatsapp-crm-job2-1-1 模块

**Files:**
- Create: `whatsapp-crm-job2-1-1/src/main/java/com/opay/occ/whatsapp/job/job/task/CreateAiBackupMaterialGroupJob.java`
- Create: `whatsapp-crm-job2-1-1/src/main/java/com/opay/occ/whatsapp/job/job/task/RefreshAiBackupStabilityCacheJob.java`

**Interfaces:**
- Consumes: `CreateAiBackupMaterialGroupJobService`, `RefreshAiBackupStabilityCacheJobService`
- Produces: XXL-Job handler 入口（job2 模块）

- [ ] **Step 1: 创建 CreateAiBackupMaterialGroupJob.java**（内容同 Task 14 Step 1）

- [ ] **Step 2: 创建 RefreshAiBackupStabilityCacheJob.java**（内容同 Task 14 Step 2）

- [ ] **Step 3: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-job2-1-1 -am -q 2>&1 | tail -5
```

---

### Task 16: 创建 API Controller — 查询接口

**Files:**
- Create: `whatsapp-crm-api/src/main/java/com/opay/occ/whatsapp/api/controller/admin/AiBackupMaterialGroupController.java`

**Interfaces:**
- Consumes: `AiBackupMaterialGroupService`
- Produces: `GET /api/admin/material/aiBackupGroup`

- [ ] **Step 1: 创建 AiBackupMaterialGroupController.java**

```java
package com.opay.occ.whatsapp.api.controller.admin;

import com.opay.occ.whatsapp.common.config.BusinessConfig;
import com.opay.occ.whatsapp.data.entity.dto.response.AiBackupMaterialGroupVO;
import com.opay.occ.whatsapp.data.service.AiBackupMaterialGroupService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;

/**
 * AI backup material group controller.
 */
@Slf4j
@RestController
@RequestMapping("/api/admin/material")
public class AiBackupMaterialGroupController {

    @Resource
    private AiBackupMaterialGroupService aiBackupMaterialGroupService;

    @Resource
    private BusinessConfig businessConfig;

    /**
     * Get available AI backup material group for sending.
     *
     * @param primaryGroupId primary material group ID
     * @param laneCode       source lane code
     * @return AI backup group info, or null if unavailable
     */
    @GetMapping("/aiBackupGroup")
    public Result<AiBackupMaterialGroupVO> getAiBackupGroup(
            @RequestParam Long primaryGroupId,
            @RequestParam String laneCode) {

        if (!Boolean.TRUE.equals(businessConfig.getAiBackupEnabled())) {
            return Result.success(null);
        }

        try {
            AiBackupMaterialGroupVO vo = aiBackupMaterialGroupService
                    .getAiBackupMaterialGroup(primaryGroupId, laneCode);
            return Result.success(vo);
        } catch (Exception e) {
            log.error("getAiBackupGroup error, primaryGroupId={}, laneCode={}",
                    primaryGroupId, laneCode, e);
            return Result.success(null);
        }
    }
}
```

**注意：** `Result` 类名需要确认项目中实际使用的响应包装类名，可能是 `Result`、`R` 等。

- [ ] **Step 2: 确认 Result 类名**

```bash
grep -rn "class Result\|class R " /Users/opay-20260271/code-temp/whatsapp_crm/whatsapp-crm-api/src/main/java/ --include="*.java" | grep -v target | head -5
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-api -am -q 2>&1 | tail -5
```

---

### Task 17: 素材组列表接口过滤 AI 备用组

**Files:**
- Modify: `whatsapp-crm-api/src/main/java/com/opay/occ/whatsapp/api/controller/admin/MessageMaterialGroupController.java`

**Interfaces:**
- 在列表查询方法中过滤 `source_type=1` 的记录

- [ ] **Step 1: 查看 MessageMaterialGroupController 的列表查询方法**

```bash
grep -n "pageInfo\|listAll\|list\|page" /Users/opay-20260271/code-temp/whatsapp_crm/whatsapp-crm-api/src/main/java/com/opay/occ/whatsapp/api/controller/admin/MessageMaterialGroupController.java | head -10
```

- [ ] **Step 2: 在 Service 层过滤**

在 `MessageMaterialGroupServiceImpl` 的 `pageInfo` 和 `listAll` 方法中添加过滤条件：

```java
// In pageInfo and listAll methods, add:
wrapper.ne(MessageMaterialGroup::getSourceType, 1);
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -pl whatsapp-crm-api -am -q 2>&1 | tail -5
```

---

### Task 18: 整体编译验证

**Files:**
- 所有模块

- [ ] **Step 1: 全量编译**

```bash
cd /Users/opay-20260271/code-temp/whatsapp_crm
mvn compile -q 2>&1 | tail -30
```

- [ ] **Step 2: 修复编译错误**

根据编译错误逐一修复，确保所有模块编译通过。
