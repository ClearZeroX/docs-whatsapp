# Template Content Stability Sampling Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `TemplateStabilityContentAgentTools#getStableAndUnstableTemplates` sample by de-duplicated content (material combination id, or normalized fingerprint for combination-less templates) with coverage fields, so the same content copied into many `message_template` rows no longer inflates the sample.

**Architecture:** Keep `resolveTemplateIdsByLanes` and the sliding-window cursor pagination in `queryTemplatesInIds` unchanged. Inside the cursor loop, classify each template as stable/unstable as before, but gate bucket admission with a content-level dedup key (`C:<combinationId>` or `F:<sha256>`), count templates vs content separately, and enrich accepted samples with batch-queried combination coverage (`templateCount`, aggregated `wabaCategoryMap`, `wabaCount`, `materialIds`).

**Tech Stack:** Java 8+, Solon AI (`@ToolMapping`), MyBatis-Plus `Wrappers`/`IService`, fastjson (`JSON`/`JSONObject`/`JSONArray`), hutool `DigestUtil.sha256Hex`, Guava `Lists.partition`, JUnit 5 + Mockito (existing test infra).

## Global Constraints

- Do NOT run `git commit` / `git add` at any step (user requirement: all changes must stay uncommitted). The final step of each task is a read-only `git diff --stat` self-check.
- All code comments must be in English.
- MySQL `IN` clauses must stay bounded: reuse `businessConfig.getBatchQueryMysqlSize()` and `WABA_BATCH_SIZE = 500` partitions everywhere; never inline a huge collection.
- Markdown deliverables are named with the date prefix `2026-08-03-`.
- The public tool signature `getStableAndUnstableTemplates(List<String> lanes, Integer recentDays)` must not change.
- Do not change stable/unstable classification: stable = every waba category is UTILITY; unstable = any waba category != UTILITY; templates with no waba rows are skipped.
- Do not change `resolveTemplateIdsByLanes`, existing `parseContentFeatureToJson` feature keys, or `getTemplateDetail`.
- Target module compiles via `mvn -q -pl whatsapp-crm-data -am compile -DskipTests`.

---

### Task 1: Content fingerprint utilities (dedup key builders)

**Files:**
- Modify: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/tools/TemplateStabilityContentAgentTools.java`
- Test: `whatsapp-crm-data/src/test/java/com/opay/occ/whatsapp/data/ai/tools/TemplateStabilityContentAgentToolsTest.java`

**Interfaces:**
- Produces (used by Task 2):
  - `static String normalizeForFingerprint(String componentsJson)` - text of BODY/HEADER/FOOTER/BUTTONS component texts, minus emoji and whitespace.
  - `static String buildContentFingerprint(MessageTemplate mt)` - sha256Hex of the normalized text; `""` when components are null/empty.
  - `private String buildContentDedupeKey(MessageTemplate mt)` - `"C:"+combinationId` when set, else `"F:"+fingerprint`.
- Consumes: fastjson `JSON`/`JSONObject`/`JSONArray`, hutool `cn.hutool.crypto.digest.DigestUtil`.

- [ ] **Step 1: Write the failing test**

Create `whatsapp-crm-data/src/test/java/com/opay/occ/whatsapp/data/ai/tools/TemplateStabilityContentAgentToolsTest.java`:

```java
package com.opay.occ.whatsapp.data.ai.tools;

import com.opay.occ.whatsapp.data.entity.po.MessageTemplate;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TemplateStabilityContentAgentToolsTest {

    private void setField(Object target, String fieldName, Object value) throws Exception {
        java.lang.reflect.Field f = target.getClass().getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(target, value);
    }

    @Test
    void normalizeForFingerprint_stripsEmojiAndWhitespace() {
        String components = "[{\"type\":\"HEADER\",\"format\":\"TEXT\",\"text\":\"Reminder {{1}}\"},"
                + "{\"type\":\"BODY\",\"text\":\"Hi, pay ₹500 🙂 before {{2}} !\"},"
                + "{\"type\":\"BUTTONS\",\"buttons\":[{\"type\":\"URL\",\"text\":\"See It\"}]}]";
        assertEquals("Reminder{{1}}Hi,pay₹500before{{2}}!SeeIt",
                TemplateStabilityContentAgentTools.normalizeForFingerprint(components));
    }

    @Test
    void normalizeForFingerprint_emptyInputReturnsEmpty() {
        assertEquals("", TemplateStabilityContentAgentTools.normalizeForFingerprint(null));
        assertEquals("", TemplateStabilityContentAgentTools.normalizeForFingerprint(""));
    }

    @Test
    void buildContentFingerprint_sameTextDifferentEmojiAreEqual() {
        MessageTemplate a = new MessageTemplate().setComponents(
                "[{\"type\":\"BODY\",\"text\":\"New offer 😀 {{1}}\"}]");
        MessageTemplate b = new MessageTemplate().setComponents(
                "[{\"type\":\"BODY\",\"text\":\"New offer 🎉 {{1}}\"}]");
        assertEquals(TemplateStabilityContentAgentTools.buildContentFingerprint(a),
                TemplateStabilityContentAgentTools.buildContentFingerprint(b));
        assertNotEquals("", TemplateStabilityContentAgentTools.buildContentFingerprint(a));
        assertTrue(TemplateStabilityContentAgentTools.buildContentFingerprint(a).length() == 64);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -q -pl whatsapp-crm-data -am test -Dtest=TemplateStabilityContentAgentToolsTest -DfailIfNoTests=false`
Expected: FAIL (methods do not exist / compilation error).

- [ ] **Step 3: Implement minimal code**

In `TemplateStabilityContentAgentTools.java` add (no other behavior changes in this task):

```java
private static final String COMBINATION_KEY_PREFIX = "C:";
private static final String FINGERPRINT_KEY_PREFIX = "F:";
private static final int WABA_BATCH_SIZE = 500;

/**
 * Content-level dedup key: material combination id when present,
 * fallback fingerprint of normalized component text.
 */
private String buildContentDedupeKey(MessageTemplate mt) {
    if (mt.getMaterialCombinationId() != null) {
        return COMBINATION_KEY_PREFIX + mt.getMaterialCombinationId();
    }
    return FINGERPRINT_KEY_PREFIX + buildContentFingerprint(mt);
}

/**
 * SHA-256 fingerprint of the normalized component text; collapses copies
 * that differ only by emoji/whitespace.
 */
static String buildContentFingerprint(MessageTemplate mt) {
    if (mt == null || mt.getComponents() == null) {
        return "";
    }
    return DigestUtil.sha256Hex(normalizeForFingerprint(mt.getComponents()));
}

/**
 * Extract text of BODY/HEADER/FOOTER/BUTTONS components, minus emoji and
 * whitespace, for fingerprint comparison.
 */
static String normalizeForFingerprint(String componentsJson) {
    if (componentsJson == null || componentsJson.isEmpty()) {
        return "";
    }
    StringBuilder sb = new StringBuilder();
    try {
        JSONArray arr = JSON.parseArray(componentsJson);
        for (int i = 0; i < arr.size(); i++) {
            JSONObject comp = arr.getJSONObject(i);
            String type = comp.getString("type");
            if ("BODY".equals(type) || "HEADER".equals(type) || "FOOTER".equals(type)) {
                appendNormalizedText(sb, comp.getString("text"));
            } else if ("BUTTONS".equals(type)) {
                JSONArray buttons = comp.getJSONArray("buttons");
                if (buttons != null) {
                    for (int j = 0; j < buttons.size(); j++) {
                        appendNormalizedText(sb, buttons.getJSONObject(j).getString("text"));
                    }
                }
            }
        }
    } catch (Exception e) {
        log.warn("normalizeForFingerprint parse error", e);
        return String.valueOf(componentsJson.hashCode());
    }
    return sb.toString();
}

private static void appendNormalizedText(StringBuilder sb, String text) {
    if (text == null) {
        return;
    }
    text.codePoints()
            .filter(cp -> !isEmojiCodePoint(cp) && !Character.isWhitespace(cp))
            .forEach(sb::appendCodePoint);
}

/**
 * Emoji code-point ranges used by the emoji shuffle util plus ZWJ and
 * variation selectors, so shuffled copies collapse to one finger.
 */
private static boolean isEmojiCodePoint(int cp) {
    return (cp >= 0x1F000 && cp <= 0x1FAFF)
            || (cp >= 0x2600 && cp <= 0x27BF)
            || cp == 0xFE0F
            || cp == 0x200D
            || (cp >= 0x1F1E6 && cp <= 0x1F1FF)
            || (cp >= 0x2B00 && cp <= 0x2BFF);
}
```

Add imports: `cn.hutool.crypto.digest.DigestUtil`.

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2.
Expected: PASS (`BUILD SUCCESS`, all 3 tests green).

- [ ] **Step 5: Self-check (no commit allowed)**

Run: `git diff --stat`
Expected: only the two files above are listed; no commit performed.

---

### Task 2: Dedup sampling + coverage enrichment in queryTemplatesInIds

**Files:**
- Modify: `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/ai/tools/TemplateStabilityContentAgentTools.java`
- Test: `whatsapp-crm-data/src/test/java/com/opay/occ/whatsapp/data/ai/tools/TemplateStabilityContentAgentToolsTest.java` (extend existing)

**Interfaces:**
- Consumes: Task 1 helpers (`buildContentDedupeKey`, `buildContentFingerprint`), existing `resolveTemplateIdsByLanes` and `parseContentFeatureToJson`.
- Produces: `queryTemplatesInIds` JSON contains `stableTemplates`, `unstableTemplates`, `stableCount`, `unstableCount`, `stableTemplateCount`, `unstableTemplateCount`; each sample gains `materialCombinationId`, `templateCount`, `wabaCount`, aggregated `wabaCategoryMap`, `materialIds`.
- New dependency: `@Resource private MessageMaterialCombinationService messageMaterialCombinationService;` (interface exists at `com.opay.occ.whatsapp.data.service.MessageMaterialCombinationService`).

- [ ] **Step 1: Write failing integration-style test**

Extend the existing `TemplateStabilityContentAgentToolsTest` class created in Task 1 (same file, same class, reuse the `setField` reflection helper). Add these imports to the import block:

```java
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.opay.occ.whatsapp.common.config.BusinessConfig;
import com.opay.occ.whatsapp.data.entity.po.MessageMaterialCombination;
import com.opay.occ.whatsapp.data.entity.po.MessageTemplateWaba;
import com.opay.occ.whatsapp.data.service.MessageMaterialCombinationService;
import com.opay.occ.whatsapp.data.service.MessageTemplateService;
import com.opay.occ.whatsapp.data.service.MessageTemplateWabaService;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
```

Add these fields and a `@BeforeEach` setup (appended inside the existing test class):

```java
    private TemplateStabilityContentAgentTools tools;
    private MessageTemplateService messageTemplateService;
    private MessageTemplateWabaService messageTemplateWabaService;
    private MessageMaterialCombinationService messageMaterialCombinationService;
    private BusinessConfig businessConfig;

    @org.junit.jupiter.api.BeforeEach
    void wireMocks() throws Exception {
        tools = new TemplateStabilityContentAgentTools();
        messageTemplateService = mock(MessageTemplateService.class);
        messageTemplateWabaService = mock(MessageTemplateWabaService.class);
        messageMaterialCombinationService = mock(MessageMaterialCombinationService.class);
        businessConfig = mock(BusinessConfig.class);
        setField(tools, "messageTemplateService", messageTemplateService);
        setField(tools, "messageTemplateWabaService", messageTemplateWabaService);
        setField(tools, "messageMaterialCombinationService", messageMaterialCombinationService);
        setField(tools, "businessConfig", businessConfig);
    }
```

Append the reflective test plus its helpers:

```java
    @Test
    void queryTemplatesInIds_dedupsCombinationAndFingerprint() throws Exception {
        // One window with 5 template rows:
        // t1 comb 10 stable, t2 comb 10 copy stable (deduped by comb key),
        // t3 no-comb MARKETING, t4 no-comb MARKETING same text/emoji variant (deduped),
        // t5 comb 20 stable.
        String stableBody = "[{\"type\":\"BODY\",\"text\":\"Your order {{1}} is confirmed\"}]";
        String unstableA = "[{\"type\":\"BODY\",\"text\":\"Hurry! Offer 😀 {{1}}!\"}]";
        String unstableB = "[{\"type\":\"BODY\",\"text\":\"Hurry! Offer 🤩 {{1}}!\"}]";

        when(businessConfig.getBatchQueryMysqlSize()).thenReturn(100);
        when(businessConfig.getMaterialStabilityContentAnalysisSampleSize()).thenReturn(10);
        when(businessConfig.getEnableTemplateEverUtilityFilter()).thenReturn(false);
        when(messageTemplateService.list(org.mockito.ArgumentMatchers.any())).thenReturn(
                Arrays.asList(template(1L, 10L, stableBody),
                        template(2L, 10L, stableBody),
                        template(3L, null, unstableA),
                        template(4L, null, unstableB),
                        template(5L, 20L, stableBody)),
                Arrays.asList(template(1L, 10L, stableBody),
                        template(2L, 10L, stableBody),
                        template(5L, 20L, stableBody)));
        when(messageTemplateWabaService.batchQueryByTemplateIds(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenReturn(
                Arrays.asList(waba("1", "UTILITY"), waba("2", "UTILITY"),
                        waba("3", "MARKETING"), waba("4", "MARKETING"), waba("5", "UTILITY")),
                Arrays.asList(waba("1", "UTILITY"), waba("2", "UTILITY"), waba("5", "UTILITY")));
        when(messageMaterialCombinationService.listByIds(org.mockito.ArgumentMatchers.any())).thenReturn(
                Arrays.asList(new MessageMaterialCombination().setId(10L).setHeaderMaterialId("h1")
                                .setBodyMaterialId("b1"),
                        new MessageMaterialCombination().setId(20L).setHeaderMaterialId("h2")));

        JSONObject result = JSON.parseObject(run(
                new HashSet<>(Arrays.asList(1L, 2L, 3L, 4L, 5L))));

        JSONArray stable = result.getJSONArray("stableTemplates");
        JSONArray unstable = result.getJSONArray("unstableTemplates");
        assertEquals(2, stable.size());
        assertEquals(1, unstable.size());
        assertEquals(2, result.getIntValue("stableCount"));
        assertEquals(1, result.getIntValue("unstableCount"));
        assertEquals(3, result.getIntValue("stableTemplateCount"));
        assertEquals(2, result.getIntValue("unstableTemplateCount"));
        JSONObject t1Feature = stable.getJSONObject(0);
        assertEquals(10L, t1Feature.getLongValue("materialCombinationId"));
        assertEquals(2, t1Feature.getIntValue("templateCount"));
        assertEquals(2, t1Feature.getIntValue("wabaCount"));
        assertEquals(2, t1Feature.getJSONObject("materialIds").size());
    }

    private MessageTemplate template(long id, Long combId, String components) {
        return new MessageTemplate().setName("n" + id).setId(id)
                .setMaterialCombinationId(combId).setComponents(components);
    }

    private MessageTemplateWaba waba(String templateId, String category) {
        return new MessageTemplateWaba().setMessageTemplateId(templateId)
                .setWabaId("w-" + templateId).setCategory(category);
    }

    private String run(Set<Long> ids) throws Exception {
        Method m = TemplateStabilityContentAgentTools.class.getDeclaredMethod(
                "queryTemplatesInIds", Set.class);
        m.setAccessible(true);
        return (String) m.invoke(tools, ids);
    }
```

Notes:
- `MessageTemplate` runs `@Data @Accessors(chain = true)`; the `setName(...).setId(...)` chain works.
- `Wrappers.eq(businessConfig.getEnableTemplateEverUtilityFilter(), ...)` with `false` skips the condition (MyBatis-Plus).
- Mockito's second `thenReturn` is the enrichment query made by `enrichCoverageInfo`.

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -q -pl whatsapp-crm-data -am test -Dtest=TemplateStabilityContentAgentToolsTest -DfailIfNoTests=false`
Expected: FAIL (dedup/coverage not implemented yet).

- [ ] **Step 3: Implement core changes**

3.1 Add a resource + imports:

```java
@Resource
private MessageMaterialCombinationService messageMaterialCombinationService;
```

Imports to add: `com.opay.occ.whatsapp.data.service.MessageMaterialCombinationService`, `com.opay.occ.whatsapp.data.entity.po.MessageMaterialCombination`, `com.google.common.collect.Lists`.

3.2 Rewrite `queryTemplatesInIds` (keep signature and sliding window):

```java
private String queryTemplatesInIds(Set<Long> laneTemplateIds) {
    log.info("queryTemplatesInIds  started, templateIds count: {}", laneTemplateIds.size());

    int batchSize = businessConfig.getBatchQueryMysqlSize();
    int idBatchSize = batchSize;
    int sampleSize = businessConfig.getMaterialStabilityContentAnalysisSampleSize();
    JSONArray stableTemplates = new JSONArray();
    JSONArray unstableTemplates = new JSONArray();

    long stableTemplateCount = 0;
    long unstableTemplateCount = 0;
    boolean stableFull = false;
    boolean unstableFull = false;

    // Content-level dedup: combination id for combination-backed templates,
    // fingerprint for combination-less templates.
    Set<String> seenStableKeys = new HashSet<>();
    Set<String> seenUnstableKeys = new HashSet<>();

    List<Long> sortedIds = laneTemplateIds.stream().sorted().collect(Collectors.toList());
    int windowStart = 0;
    long cursorId = Long.MAX_VALUE;

    while (!(stableFull && unstableFull) && windowStart < sortedIds.size()) {
        int windowEnd = Math.min(windowStart + idBatchSize, sortedIds.size());
        Set<Long> idWindowSet = new HashSet<>(sortedIds.subList(windowStart, windowEnd));

        List<MessageTemplate> batch = messageTemplateService.list(
                Wrappers.<MessageTemplate>lambdaQuery()
                        .select(MessageTemplate::getId, MessageTemplate::getName,
                                MessageTemplate::getComponents, MessageTemplate::getMaterialGroupId,
                                MessageTemplate::getMaterialCombinationId)
                        .eq(businessConfig.getEnableTemplateEverUtilityFilter(),
                                MessageTemplate::getEverUtility, 1)
                        .ne(MessageTemplate::getStatus, TemplateStatusEnum.PENDING_DELETION.getStatus())
                        .in(MessageTemplate::getId, idWindowSet)
                        .lt(MessageTemplate::getId, cursorId)
                        .orderByDesc(MessageTemplate::getId)
                        .last("limit " + batchSize));
        if (CollUtil.isEmpty(batch)) {
            windowStart = windowEnd;
            cursorId = Long.MAX_VALUE;
            continue;
        }

        Set<String> batchTemplateIds = batch.stream()
                .map(mt -> String.valueOf(mt.getId()))
                .collect(Collectors.toSet());

        List<MessageTemplateWaba> wabaList = messageTemplateWabaService.batchQueryByTemplateIds(
                batchTemplateIds,
                Collections.singletonList(TemplateStatusEnum.PENDING_DELETION.getStatus()));

        Map<String, List<MessageTemplateWaba>> wabaByTemplateId = wabaList.stream()
                .filter(w -> w.getMessageTemplateId() != null)
                .collect(Collectors.groupingBy(MessageTemplateWaba::getMessageTemplateId));

        // Accepted samples of this window for enrichment.
        Map<String, JSONObject> acceptedFeatures = new LinkedHashMap<>();
        Map<String, Long> combIdByTemplateId = new HashMap<>();

        for (MessageTemplate mt : batch) {
            if (stableFull && unstableFull) break;

            List<MessageTemplateWaba> wabas = wabaByTemplateId.getOrDefault(
                    String.valueOf(mt.getId()), Collections.emptyList());
            if (wabas.isEmpty()) continue;

            boolean hasNonUtility = wabas.stream()
                    .anyMatch(w -> !MessageTemplateTypeEnum.UTILITY.getCode().equals(w.getCategory()));

            if (hasNonUtility) {
                unstableTemplateCount++;
                if (unstableFull) continue;
                if (!seenUnstableKeys.add(buildContentDedupeKey(mt))) continue;
                if (unstableTemplates.size() >= sampleSize) {
                    unstableFull = true;
                    continue;
                }
                JSONObject feature = parseContentFeatureToJson(mt, wabas);
                unstableTemplates.add(feature);
                acceptedFeatures.put(String.valueOf(mt.getId()), feature);
                if (mt.getMaterialCombinationId() != null) {
                    combinationIdByTemplateId.put(String.valueOf(mt.getId()),
                            mt.getMaterialCombinationId());
                }
            } else {
                stableTemplateCount++;
                if (stableFull) continue;
                if (!seenStableKeys.add(buildContentDedupeKey(mt))) continue;
                if (stableTemplates.size() >= sampleSize) {
                    stableFull = true;
                    continue;
                }
                JSONObject feature = parseContentFeatureToJson(mt, wabas);
                stableTemplates.add(feature);
                acceptedFeatures.put(String.valueOf(mt.getId()), feature);
                if (mt.getMaterialCombinationId() != null) {
                    combinationIdByTemplateId.put(String.valueOf(mt.getId()),
                            mt.getMaterialCombinationId());
                }
            }
        }

        enrichCoverageInfo(acceptedFeatures, combinationIdByTemplateId, laneTemplateIds);

        cursorId = batch.get(batch.size() - 1).getId();
    }

    JSONObject result = new JSONObject();
    result.put("stableTemplates", stableTemplates);
    result.put("unstableTemplates", unstableTemplates);
    result.put("stableCount", stableTemplates.size());
    result.put("unstableCount", unstableTemplates.size());
    result.put("stableTemplateCount", stableTemplateCount);
    result.put("unstableTemplateCount", unstableTemplateCount);
    return result.toJSONString();
}
```

3.3 Add `enrichCoverageInfo` (all `IN` clauses stay <= `WABA_BATCH_SIZE`):

```java
private void enrichCoverageInfo(Map<String, JSONObject> featuresByTemplateId,
                                Map<String, Long> combinationIdByTemplateId,
                                Collection<Long> laneTemplateIds) {
    if (featuresByTemplateId.isEmpty()) {
        return;
    }
    // Combination-less templates: single representative row, no aggregation query.
    for (Map.Entry<String, JSONObject> entry : featuresByTemplateId.entrySet()) {
        if (!combinationIdByTemplateId.containsKey(entry.getKey())) {
            entry.getValue().put("materialCombinationId", null);
            entry.getValue().put("templateCount", 1);
            entry.getValue().put("materialIds", null);
        }
    }
    if (combinationIdByTemplateId.isEmpty()) {
        return;
    }

    Set<Long> combinationIds = new HashSet<>(combinationIdByTemplateId.values());
    Map<Long, MessageMaterialCombination> combinationMap = new HashMap<>();
    for (List<Long> partition : Lists.partition(new ArrayList<>(combinationIds), WABA_BATCH_SIZE)) {
        List<MessageMaterialCombination> combos = messageMaterialCombinationService.listByIds(partition);
        if (CollUtil.isNotEmpty(combos)) {
            combos.forEach(c -> combinationMap.put(c.getId(), c));
        }
    }

    Map<Long, List<MessageTemplate>> templatesByCombination = new HashMap<>();
    for (List<Long> partition : Lists.partition(new ArrayList<>(combinationIds), WABA_BATCH_SIZE)) {
        List<MessageTemplate> metas = messageTemplateService.list(
                Wrappers.<MessageTemplate>lambdaQuery()
                        .select(MessageTemplate::getId, MessageTemplate::getMaterialCombinationId,
                                MessageTemplate::getStatus)
                        .in(MessageTemplate::getMaterialCombinationId, partition)
                        .ne(MessageTemplate::getStatus,
                                TemplateStatusEnum.PENDING_DELETION.getStatus()));
        if (CollUtil.isEmpty(metas)) {
            continue;
        }
        for (MessageTemplate meta : metas) {
            // Count only templates inside the current lane set (confirmed scope).
            if (!laneTemplateIds.contains(meta.getId())) {
                continue;
            }
            templatesByCombination
                    .computeIfAbsent(meta.getMaterialCombinationId(), k -> new ArrayList<>())
                    .add(meta);
        }
    }

    List<String> allTemplateIds = templatesByCombination.values().stream()
            .flatMap(Collection::stream)
            .map(mt -> String.valueOf(mt.getId()))
            .distinct()
            .collect(Collectors.toList());
    Map<String, List<MessageTemplateWaba>> wabaByTemplateId = new HashMap<>();
    for (List<String> partition : Lists.partition(allTemplateIds, WABA_BATCH_SIZE)) {
        List<MessageTemplateWaba> wabas = messageTemplateWabaService.batchQueryByTemplateIds(
                partition, Collections.singletonList(TemplateStatusEnum.PENDING_DELETION.getStatus()));
        if (CollUtil.isNotEmpty(wabas)) {
            wabas.forEach(w -> {
                if (w.getMessageTemplateId() != null) {
                    wabaByTemplateId
                            .computeIfAbsent(w.getMessageTemplateId(), k -> new ArrayList<>())
                            .add(w);
                }
            });
        }
    }

    for (Map.Entry<String, JSONObject> entry : featuresByTemplateId.entrySet()) {
        Long combinationId = combinationIdByTemplateId.get(entry.getKey());
        if (combinationId == null) {
            continue;
        }
        JSONObject feature = entry.getValue();
        List<MessageTemplate> metas = templatesByCombination.getOrDefault(
                combinationId, Collections.emptyList());

        JSONObject aggregatedCategoryMap = new JSONObject();
        for (MessageTemplate meta : metas) {
            for (MessageTemplateWaba w : wabaByTemplateId.getOrDefault(
                    String.valueOf(meta.getId()), Collections.emptyList())) {
                if (w.getWabaId() != null) {
                    aggregatedCategoryMap.put(String.valueOf(w.getWabaId()),
                            w.getCategory() != null ? w.getCategory() : "");
                }
            }
        }

        feature.put("materialCombinationId", combinationId);
        feature.put("templateCount", metas.size());
        feature.put("wabaCount", aggregatedCategoryMap.size());
        feature.put("wabaCategoryMap", aggregatedCategoryMap);

        MessageMaterialCombination combination = combinationMap.get(combinationId);
        if (combination != null) {
            JSONObject materialIds = new JSONObject();
            materialIds.put("headerMaterialId", combination.getHeaderMaterialId());
            materialIds.put("bodyMaterialId", combination.getBodyMaterialId());
            materialIds.put("footerMaterialId", combination.getFooterMaterialId());
            materialIds.put("buttonsMaterialId", combination.getButtonsMaterialId());
            feature.put("materialIds", materialIds);
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `mvn -q -pl whatsapp-crm-data -am test -Dtest=TemplateStabilityContentAgentToolsTest -DfailIfNoTests=false`
Expected: PASS (Task 1 + Task 2 tests).

Then run the whole module suite to check regressions:
Run: `mvn -q -pl whatsapp-crm-data test`
Expected: unrelated tests may fail on missing infrastructure; if so, record it and rely on the dedicated class above.

- [ ] **Step 5: Self-check (no commit allowed)**

Run: `git diff --stat`
Expected: only `TemplateStabilityContentAgentTools.java` and the test file changed; no commit executed.

---

### Task 3: Full build + deliver prompts file

**Files:**
- Create: `docs/superpowers/2026-08-03-template-stability-content-prompts.md`

**Interfaces:**
- Consumes: the two final prompt texts in the design doc `docs/superpowers/specs/2026-08-03-template-stability-content-dedup-design.md` sections 6.1 and 6.2.

- [ ] **Step 1: Create the date-prefixed deliverable**

Create `docs/superpowers/2026-08-03-template-stability-content-prompts.md`:

```markdown
# 2026-08-03 template stability content prompts (deliverable)

Update the Apollo config keys below with these final texts:

- `material.stability.content.analysis.systemPrompt`: see `docs/superpowers/specs/2026-08-03-template-stability-content-dedup-design.md` section 6.1.
- `material.stability.content.analysis.negative.list.systemPrompt`: see same design doc section 6.2.

Both reuse the de-duplicated sampling semantics (`templateCount`, aggregated
`wabaCategoryMap`, `materialCombinationId`, `materialIds`) described there.
```

- [ ] **Step 2: Build the whole module**

Run: `mvn -q -pl whatsapp-crm-data -am compile -DskipTests`
Expected: `BUILD SUCCESS`, no compilation errors.

- [ ] **Step 3: Run the dedicated unit tests**

Run: `mvn -q -pl whatsapp-crm-data -am test -Dtest=TemplateStabilityContentAgentToolsTest -DfailIfNoTests=false`
Expected: PASS.

- [ ] **Step 4: Self-check (no commit allowed)**

Run: `git diff --stat`
Expected: `TemplateStabilityContentAgentTools.java`, the test file, and the prompts md listed; no commit executed.

---

## Execution Handoff

Open file: `docs/superpowers/plans/2026-08-03-template-stability-content-dedup.md`

Two execution options:
1. Subagent-Driven (recommended) - one fresh subagent per task, review between tasks.
2. Inline Execution - run tasks in this session with checkpoints.

Implementation starts only after the user explicitly approves switching to code writing.
