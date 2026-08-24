# 素材组当前可用统计：无任务时回退到素材组合逻辑

## 概述

修改 `MessageMaterialGroupServiceImpl#batchFillMaterialTemplateStabilityStat`，使得**没有相关任务的素材组**仍然能产出有意义的"当前可用"（current-usable）统计，回退到**活跃素材组合**过滤逻辑，与 commit `cf5e429bade` 和 `ab9f7ece` 中的模式一致。

## 背景

`batchFillMaterialTemplateStabilityStat` 方法为每个素材组计算两组模板统计：

- **当前可用（current-usable）** — 当前真正可以发送的模板
- **历史全部（history-all）** — 该组所有创建过的模板

目前 Step 3 从素材组的 `relatedTasks` 中获取当前模板 ID。如果某个组**没有相关任务**（或任务没产生模板 ID），该组直接拿到**空 stats 对象**，current 和 history 都是 0。这对于 current-usable 来说是不正确的——即使没有任务，一个组可能有活跃的素材组合，且组合关联了可用的模板。

另外，当前 Step 4 对 usable 数据的处理与 cf5e429bade 之前版本有差异：
- 有任务的 group 走简化版过滤（`queryByTemplateIdRunningWithCache`，只认 APPROVED 状态 + agentTemplateId 非空）
- 无任务的 group 应该走原始版本的过滤逻辑（`batchQueryByTemplateIds` 排除 PENDING_DELETION → `validStatusList` 过滤 → `sourcePoolService.filterMessageTemplateWaba` 过滤）

由于两条路径的过滤粒度不同，需要让无任务的分支走独立的 waba 查询和过滤。

## 设计

### 改动范围

修改 `batchFillMaterialTemplateStabilityStat` 的 **Step 3** 和 **Step 4**。Step 2、5、6 不变。

### 方法抽取

#### `getCurrentTemplateIdsByCombination`

基于素材组合获取当前可用模板 ID，抽取为独立方法：

```
private List<String> getCurrentTemplateIdsByCombination(
        Long groupId,
        List<MessageTemplate> groupTemplates)
```

- **入参**: groupId（用于查询组合）、groupTemplates（该组所有模板）
- **出参**: 过滤后的模板 ID 列表
- **流程**: 查询该组 ACTIVE 组合 → 构建组合 ID 集合 → 只保留 `materialCombinationId != null && activeCombIds.contains(materialCombinationId)` 的模板

#### `getUsableWabaByTemplateIdForCombination`

无任务 group 的 usable waba 查询和过滤逻辑，抽取为独立方法：

```
private Map<String, List<MessageTemplateWaba>> getUsableWabaByTemplateIdForCombination(
        Set<String> templateIds)
```

- **流程**:
  1. 调用 `messageTemplateWabaService.batchQueryByTemplateIds(templateIds, [PENDING_DELETION])` 批量查询，内部已分批次 IN 查询
  2. 用 `businessConfig.getMaterialGroupValidStatusList()` 过滤状态
  3. 调用 `sourcePoolService.filterMessageTemplateWaba(filteredList, true)` 过滤
  4. 按 messageTemplateId group 后返回

### Step 3 改动

循环内按两条路径获取 currentTplIds，并记录走路径B的 group：

- **路径A（有任务）**：从 `relatedTasks` 经 `devService::taskAutoSourceTemplateIds` 获取
- **路径B（无任务 / 任务无结果）**：通过 `getCurrentTemplateIdsByCombination` 获取，记录到 `combinationGroupIds`
- 两条路径都为空时回退到 `applyEmptyStatsAndCache`

### Step 4 改动

拆成两条查询路径后合并结果：

- **有任务的 group**（`groupToTemplateIds.keySet() - combinationGroupIds`）：沿用现有 `queryByTemplateIdRunningWithCache` 查询
- **无任务的 group**（`combinationGroupIds`）：调用 `getUsableWabaByTemplateIdForCombination` 查询并过滤
- 两部分结果合并到 `usableWabaByTemplateId`
- 合并后结果为空时回退到空 stats

### 方法位置

两个新方法均放在 `applyStatsAndCache` 方法之后、`parseHistoryStatusEnums` 方法之前。

### 依赖

- `messageMaterialCombinationService` 已在类中 `@Autowired`
- `sourcePoolService` 已在类中 `@Autowired`
- `businessConfig.getMaterialGroupValidStatusList()` 可用
- `messageTemplateWabaService.batchQueryByTemplateIds` 可用
- `groupAllTemplates` 在 Step 2 已加载

### 风险与验证

- 有任务的 group 不受影响，路径A + 现有过滤逻辑不变
- 无任务的 group 走原始版本的 waba 过滤逻辑，与 cf5e429bade 前一致
- 历史全部统计不变
- 编译验证 `mvn compile -pl whatsapp-crm-data -am` 通过
