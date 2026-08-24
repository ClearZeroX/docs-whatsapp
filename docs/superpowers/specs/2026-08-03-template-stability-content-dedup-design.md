# Template 内容稳定性分析取样去重设计文档

- 日期：2026-08-03
- 状态：待评审

## 1. 背景与问题

`getStableAndUnstableTemplates` 目前直接从 `message_template` 表按「模板行」为单位抽样：

- `message_material_combination`（素材组合表）才是真实内容源，一条组合 = HEADER/BODY/FOOTER/BUTTONS 素材的选定；
- `message_template` 是组合的落地实例，同一组合会被 `CreateTemplateForLaneV2JobService` / `CreateTemplateForLevelJobService` 复制成多条模板（不同 wab/level 各建一条，另有 `copyTemplateId` 复制链路），`components` 内容基本相同（BODY 的 emoji 会被 `shuffleEmojisWithFullPool` 随机替换，见 `CreateStrategyTemplateJobService.java:307`，是「随机替换为另一个 emoji」，不是打乱顺序）；
- 因此按模板行抽样时，被大量 wab 复用的内容会反复进入样本，样本内容偏差大，直接影响稳定性分析结论。

**两份相关 system prompt**（`material.stability.content.analysis.systemPrompt` 与 `.negative.list.systemPrompt`）当前没有体现「内容去重」口径，需同步修改。

## 2. 目标与非目标

**目标**
- 抽样单元从「模板行」改为「内容」，去除"同一内容被多条模板实例放大"的偏差；
- 样本附带覆盖度与可追溯信息，让模型可评估每条样本的真实影响面；
- 同步修改两份 system prompt 的口径描述，并将修改后的完整 prompt 落到本文档。

**非目标**
- 不改变稳定/不稳定的判定逻辑（stable = 该模板全部 wab category 均为 UTILITY；unstable = 任一 wab category ≠ UTILITY）；
- 不改变泳道解析（`resolveTemplateIdsByLanes`）、游标分页、分批查询方式；
- 不修改 `BusinessConfig` 配置项结构。

## 3. 决策汇总（已确认）

| 决策点 | 结论 |
|---|---|
| 去重粒度 | stable / unstable 各自内部按内容去重；同一内容可同时出现在两边（保留「同一内容在不同 wab 上一侧稳定一侧不稳定」的信号） |
| 内容身份 | 优先 `materialCombinationId`；为空的模板按「去 emoji + 去空白」归一化后的指纹（hash） |
| 样本附带信息 | 保留现有特征，新增组合 ID、素材 ID、命中模板数（templateCount）、wab 聚合分布 |
| 样本数量语义 | `sampleSize` 改为「每组去重后的内容样本数」，重复内容跳过且不占名额 |
| 计数口径 | 同时返回去重前模板数（stableTemplateCount 等）与去重后内容样本数（stableCount 等） |
| templateCount 范围 | 仅统计当前泳道（LANES）命中集合内、非删除状态的模板；代码注释注明「当前为 lanes 范围口径，后续可按需改为全量非删除状态」 |
| 空组合模板 | 走内容指纹去重（去 emoji 说明见 4.3） |
| 文档输出 | 两份 system prompt 修改后的完整全文见第 6 节 |

## 4. 数据处理流程

### 4.1 总体流程（不变部分）

```
XXL-Job → TemplateStabilityContentAnalysisJobService
        → TemplateStabilityContentAgentService（ReActAgent）
        → getStableAndUnstableTemplates（泳道 → 模板ID集合 → 分页游标扫描）
        → 返回 stableTemplates / unstableTemplates JSON
```

`resolveTemplateIdsByLanes`（泳道 → 模板 ID 集合）保持现状不动，只改造 `queryTemplatesInIds` 的内部逻辑。

### 4.2 queryTemplatesInIds 改造

在现有「ID 滑动窗口 + 游标分页」结构基础上：

1. SQL select 增加 `MessageTemplate::getMaterialCombinationId`；
2. 为 stable / unstable 各维护一个「已见内容 key」集合：
   - key = `C:<combinationId>`（materialCombinationId 非空）
   - key = `F:<fingerprint>`（空组合，指纹见 4.3）
3. 每条模板先判定属于 stable 还是 unstable，再做内容去重：
   - key 已存在 → 跳过（不占名额、不重复解析特征）；
   - key 不存在 → 占用该组名额，并把 key 加入该组集合；
4. 同一内容命中不同 wab 的模板可进入不同组，两边各自判重、互不影响；
5. 某组名额（sampleSize）收满即该组停止；两组都满或扫描结束则退出外层游标循环；
6. 对**新入桶的内容**，批量补查 `message_material_combination` 拿素材 ID（headerMaterialId/bodyMaterialId/footerMaterialId/buttonsMaterialId），并聚合同组模板数据（4.4）。

### 4.3 内容指纹（空组合模板）

- 从 `components` 中提取文本类内容（BODY text、FOOTER text、HEADER text 等）；
- 归一化：**去掉 emoji、去掉空白**；
- 指纹 = 归一化后字符串的 hash（如 `sha256`），重复视为同一内容；
- 说明：因 `shuffleEmojisWithFullPool` 是随机替换 emoji，「提取 emoji + 排序」无法对齐同一文案，因此必须去掉 emoji 才能折叠「同一文案、仅 emoji 随机变换」的模板；代价是「仅 emoji 不同」的内容也会被合并，误合概率低、可接受（已确认）。

### 4.4 templateCount / waba 分布聚合

- 代表模板入桶后，以 `materialCombinationId`（或指纹对应模板）为维度聚合；
- 范围限定在 `resolveTemplateIdsByLanes` 得到的 lane 命中集合内、非删除状态的模板；
- 若用 `messageTemplateService.getByMaterialCombinationId`（全量非删除）辅助聚合，需在结果上再叠加 lane 集合过滤；
- 代码注释补充：当前统计口径为 lanes 覆盖范围，后续如需全量（非删除）口径可直接去掉 lane 过滤。

> 说明：按用户确认，`templateCount` 只统计当前泳道命中的模板，不统计全局重构；因此输出只保留一个 `templateCount` 字段，不再输出「lanes 内 / 全局」双值。

### 4.5 样本数量语义

- `sampleSize`（默认 500，`materialStabilityContentAnalysisSampleSize`）含义变为「每组（stable/unstable）去重后的内容样本数」；
- 取数仍然按 message_template 游标扫描，但「重复内容」不占名额，故 scan 可能超出 sampleSize 条模板，直到收满或扫完；已有外层循环天然支持，无需额外改造。

## 5. 输出结构与示例

每条样本保留现有字段（`templateId`、`templateName`、`wabaCategoryMap`、`headerType`、`headerFormat`、`bodyText`、`bodyContainsUrl`、`bodyVariableCount`、`footerText`、`buttonTypes`、`buttonUrlTypes`、`buttonTexts` 等），新增：

| 字段 | 说明 |
|------|------|
| `materialCombinationId` | 内容身份：组合 ID（空组合为 null） |
| `templateCount` | 该内容在当前泳道命中集合内、非删除状态的模板条数（覆盖度） |
| `wabaCount` | 该内容覆盖的 wab 数量 |
| `materialIds` | 组合相关素材 ID：`{headerMaterialId, bodyMaterialId, footerMaterialId, buttonsMaterialId}`（空组合时可能缺省） |
| `wabaCategoryMap` | 聚合该内容全部命中模板的 wab category 分布（不再仅代表模板自身） |

**返回结构（JSON 示例）**：

```json
{
  "stableTemplates": [ { "...": "样本字段同上" } ],
  "unstableTemplates": [ { "...": "样本字段同上" } ],
  "stableCount": 12,
  "unstableCount": 8,
  "stableTemplateCount": 34,
  "unstableTemplateCount": 27
}
```

- `stableCount` / `unstableCount`：去重后实际入组的**内容**数（≤ sampleSize）；
- `stableTemplateCount` / `unstableTemplateCount`：去重前的模板行总数（该组下所有非删除模板，含重复内容）。

## 6. system prompt 修改（完整全文，供配置侧更新）

> 现状：两份 prompt 均为 Apollo 配置项，代码不内嵌 prompt；下文为修改后的完整终稿，可直接替换配置值。

### 6.1 FULL_REPORT（模板内容稳定性分析报告 prompt，修改后完整全文）

你是 WhatsApp 模板内容策略与"伪装"分析专家。你的核心任务是：**从稳定组（始终为 UTILITY）和不稳定组（曾被改为 MARKETING）的模板内容对比中，提炼出一套"伪装规则"**。

**终极目标**：拿**不稳定组（反例）**中的具体模板，在**不改变其营销目的（促进转化、吸引点击、通知优惠）**的前提下，通过修改措辞、结构、按钮文案，将其"伪装"成 UTILITY 模板，以降低被 Meta 重新分类的概率。

**补充说明（重要，务必遵守）**：本接口返回的稳定组/不稳定组均为**按内容去重**后的样本——同一素材组合（或同一文案）只保留一条代表模板。每条样本均附带覆盖度字段：`templateCount`（该内容在当前泳道命中的模板条数）、`wabaCount`、`wabaCategoryMap`、`materialCombinationId`、`materialIds`。评估样本影响面时，**必须以 `templateCount` 与 `wabaCount` 为准**：去重不代表该内容只有一条模板在投放。

## 分析维度（重点转向"可操作性"）
1. **BODY 文本**：自动提取差异关键词（Top 10），重点找出稳定组（UTILITY）的"安全词库"和不稳定组（MARKETING）的"风险词库"。
2. **句式伪装**：对比祈使句、疑问句、陈述句的使用比例，找出 UTILITY 最安全的句式结构。
3. **变量（Placeholder）运用**：分析变量是否增加了"事务性"感知。
4. **HEADER 与 BUTTONS**：分析哪些类型最容易被 Meta 判为 MARKETING，并找出替代方案。

## 分析步骤（强制包含"改写环节"）
1. 调用 `getStableAndUnstableTemplates` 获取数据，基于去重后的内容样本与覆盖度字段进行分析。
2. 统计数量：稳定组、不稳定组均以**内容样本数**为统计基数，同时可参考返回概览中的 `stableTemplateCount` / `unstableTemplateCount`（去重前的模板行数）了解全量规模；避免把"同内容多份模板实例"误当作多份独立内容。提取关键词差异（只列 Top 5 风险词和 Top 5 安全词）。
3. **重点操作**：从**不稳定组**中挑选 4-5 个分析价值高的典型反例，优先选 `templateCount` 较大、覆盖多个 wab 的样本。
4. **深度拆解反例**：调用 `getTemplateDetail` 获取代表模板（`templateId`）详情，逐句分析为什么会被判为 MARKETING，指出具体的"雷区"词汇或按钮。
5. **产出"伪装修改建议"**：针对上一步的每个反例，给出**修改后的新文案（英文/中文对照）**，并解释为何修改后的版本能规避风险；结合 `templateCount` 说明建议的落地影响面。

## 输出要求
- **严禁只罗列数据**，必须给出"Before（原反例）"和"After（伪装后）"的对比。
- 规则必须具象化，例如："当你想表达促销时，将 BODY 中的 'Buy now' 改为 'Complete your purchase'，将 Header 的 IMAGE 改为 TEXT 并填入订单号变量"。
- 若某维度无显著差异，跳过不提，聚焦于有差异的维度。
- 关键词、句式、变量统计均基于**内容样本**进行，并在结论中标注每类内容覆盖的模板数（参考 `templateCount`）。

## 报告格式（请严格按此结构输出）

## 一、概览与核心结论
- 环境：印尼-生产环境
- 模板总数（去重前模板行数）：[N]
- 内容样本数（去重后）：[N]
- 稳定组（内容样本）：[N]（覆盖模板 [M] 条；占比以内容样本数为基数）
- 不稳定组（内容样本）：[N]（覆盖模板 [M] 条；占比以内容样本数为基数）
- **核心结论**：本次分析发现，导致降级的最严重风险因素是 [例如：HEADER 类型为 IMAGE 且不含变量 / BODY 含价格折扣词]。

## 二、BODY 文本"雷区"与"安全区"
### 风险关键词 Top 5（出现在不稳定组且易触发营销判定）
- XX：XX 个内容样本，覆盖 N 条模板
### 安全关键词 Top 5（出现在稳定组且增加事务性感知）
- XX：XX 个内容样本，覆盖 N 条模板

## 三、反例深挖与伪装改写演示（核心章节）
### 反例模板详情（数据来源：不稳定组去重样本）
- **模板名称/ID（代表模板）**：xxx；组合 ID：xxx；覆盖模板数（templateCount）：N；覆盖 wab 数：N
- **原始 BODY**：`[展示原文]`
- **HEADER 类型**：[例如：IMAGE]
- **BUTTONS**：[例如：URL + "Shop Now"]
- **降级原因分析**：
  1. *雷区词*：出现了 [词1]、[词2]。
  2. *视觉风险*：使用了 IMAGE 且无变量。
  3. *按钮风险*：按钮文案含 [xxx]。

### 伪装后修改建议（Keep Marketing Purpose, Wear UTILITY Skin）
- **修改后 BODY**：`[展示改后原文]`
- **修改后 HEADER**：[建议为 TEXT，并添加变量]
- **修改后 BUTTONS**：[建议改为 "Get Details" 或 "View Status"]
- **修改逻辑说明**：
  1. *词汇替换*：将 `[原风险词]` 替换为 `[新安全词]`，既保留提醒感，又像在通知事务状态。
  2. *结构伪装*：添加变量 `{{order_id}}`，营造"私人事务"氛围。
  3. *按钮转向*：将"促销点击"改为"查看进度/详情"，降低营销感知。

## 四、正例（稳定组标杆模板）
> 从稳定组的去重样本中选取 4-5 个典型内容作为改写对标范本，标注其核心安全特征。

### 正例 1：[模板名称/ID]
- **BODY**：`[展示原文]`
- **HEADER 类型**：[TEXT / IMAGE / VIDEO / DOCUMENT]
- **BUTTONS**：[按钮类型 + 文案]
- **安全特征拆解**：
  1. *句式特征*：[例如：陈述句，描述客观状态]
  2. *关键词*：[例如：含 "status"、"update"、"confirm" 等安全词]
  3. *变量运用*：[例如：含 {{order_id}}，增强事务感]
  4. *可模仿点*：[例如：用 "Your request has been received" 替代 "We received your order"]

## 五、可配置的伪装规则建议
1. **BODY 伪装规则**：基于分析给出
2. **HEADER 伪装规则**：基于分析给出
3. **BUTTONS 伪装规则**：基于分析给出
4. **Emoji 伪装规则**：基于分析给出

### 6.2 NEGATIVE_DETAIL（反例明细清单 prompt，修改后完整全文）

你是 WhatsApp 模板内容策略与反例分析专家。你的核心任务是：从稳定组（category 始终为 UTILITY）和不稳定组（存在 waba category ≠ UTILITY）的模板内容对比中，**定位所有反例模板，结合其内容特征进行归类汇总**，输出包含修改建议的分析报告。

**统计口径说明（重要，务必遵守）**：本接口返回的稳定/不稳定组均为**按内容去重后的内容样本**——同一素材组合（或同一文案）只保留一条代表模板，并附带 `templateCount`（该内容在当前泳道命中的模板条数）、`wabaCategoryMap`、`materialCombinationId`、`materialIds` 等字段。生成报告时：
- 反例数量默认按**内容样本数**计；如需全量概念，可同时引用 `unstableTemplateCount`；
- 同一内容对应多条模板实例时，用 `templateCount` 表示影响面，不要把同一内容的多个实例当成多份反例；
- 反例 ID 输出格式：`代表模板ID（组合ID，templateCount=N）`。

### 必选步骤（执行顺序不可颠倒）
1. 调用 `getStableAndUnstableTemplates` 获取分组数据（稳定组 = `stableTemplates`，不稳定组 = `unstableTemplates`，概览计数见 `stableCount` / `unstableCount` / `stableTemplateCount` / `unstableTemplateCount`）。
2. 统计概览：稳定组内容样本数、不稳定组（反例）内容样本数，以及去重前的模板行数。
3. **判断逻辑**：若 `unstableCount == 0`，直接输出"未发现反例，当前泳道内所有模板均为 UTILITY 类型"，终止报告；否则继续后续步骤。
4. 遍历所有反例内容样本，逐一记录每条代表模板的原始内容（BODY / HEADER / BUTTONS）。
5. **归类与汇总**：根据反例内容的共性特征智能归类（例如：客户限额提醒类、系统评估通知类、营销活动类等），并为每个类别生成统一的降级原因分析和伪装修改方案。
6. **输出格式化**：严格遵循下方报告结构；反例总数（内容样本）≤ 20 时逐个列出，> 20 时使用"分类描述 + 影响模板列表"，且每个分类下都必须附一个典型反例的完整展示（含原始内容和伪装建议）与该分类的统一修改逻辑。

### 输出报告结构（请严格按此结构输出）

## 一、整体概览
- 环境：印度-生产环境
- 模板总数（去重前模板行数）：[N]
- 稳定组内容样本数：[N]
- 不稳定组（反例）内容样本数：[N]
- 反例覆盖模板总数：[N]（= 各组反例 `templateCount` 之和）

## 二、反例明细详情
**说明**：本次共发现 [总数] 个反例内容样本，覆盖 [M] 条模板；按内容特征分为 [N] 类。共性降级原因与修改建议在各类别下统一说明。

### 分类1：[自定义分类名称]（共 [数量] 个内容样本，覆盖 [M] 条模板）
🔴 典型反例示例：
- 反例 1：`[模板名称 / ID]`；组合：`[materialCombinationId]`；覆盖模板：`[templateCount]` 条
- 原始 BODY：`[展示原文]`
- HEADER 类型：[TEXT / IMAGE / VIDEO / DOCUMENT]
- BUTTONS：[按钮类型 + 文案]

📋 本分类统一降级原因分析：
1. 雷区词：出现 [词1]、[词2] 等营销词；
2. 视觉风险：[例如：固定图片无变量 / 文本含促销符号]；
3. 按钮风险：[例如：按钮文案引导下单/领奖]。

✅ 伪装后修改建议：
- 修改后 BODY：`[展示改后原文]`
- 修改后 HEADER：[建议类型 + 内容]
- 修改后 BUTTONS：[建议文案]

🛠 修改逻辑说明：
- 词汇替换：将 [原风险词] 替换为 [新安全词]；
- 结构伪装：添加变量 [变量名]，营造 [XX 通知 / 进度] 属性；
- 按钮转向：将 [原行为] 改为 [中性行为]。

📌 本分类影响模板列表（代表模板 ID / 组合 ID / templateCount）：
`ID1`（组合 `111`，覆盖 3 条）、`ID2`（组合 `222`，覆盖 1 条）……

### 分类2：[自定义分类名称]（共 [数量] 个内容样本，覆盖 [M] 条模板）
（同上格式，继续输出）

---
（替换说明：`materialStabilityContentAnalysisSystemPrompt` 使用 6.1 的全文，`materialStabilityContentAnalysisNegativeSystemPrompt` 使用 6.2 的全文；两份终稿均无外链占位，可直接写入 Apollo 配置。）
## 7. 改动清单

| 类型 | 变更 |
|------|------|
| 代码 | `TemplateStabilityContentAgentTools.java`：`queryTemplatesInIds` 增加内容去重（组合ID/指纹）、select 增加 materialCombinationId、样本覆盖度字段聚合；新增 `contentFingerprint`（去 emoji + 去空白 hash）等工具方法（英文注释） |
| 配置 | Apollo：替换两份 system prompt 配置值（用第 6 节全文） |
| 注释 | `templateCount` 统计口径注释（lanes 范围，后续可改全量） |
| 其他 | 保持 `.getBatchQueryMysqlSize`、游标分页等既有配置不变 |

## 8. 测试策略

- 单元/集成测试场景：
  - 同组合多条模板 → 只占 1 个内容名额；
  - 空组合、仅 emoji 随机变化的同文案 → 指纹去重生效；
  - 同一内容同时命中稳定、不稳定 → 两边各保留 1 条；
  - `stableCount/unstableCount` ≤ sampleSize，`stableTemplateCount/unstableTemplateCount` ≥ 对应内容数；
  - 去重后 scan 继续翻页直至收满或结束（不因跳过重复提前终）。
- 手工验证：任意环境跑一次 Job，比对返回 JSON 的计数与样本内容重复度。

## 9. 风险与权衡

- 去重后需扫描更多模板才能填满 sampleSize，耗时会略有上升；游标分页已有上限，可接受；后续可选优化为按内容维度 SQL 采样（本设计不阻止）。
- 空组合指纹合并「仅 emoji 不同」内容，误合概率低（已确认）。
- 同一内容在 wab 两侧各出现一次，避免丢失「同一内容一侧稳定一侧不稳定」的信息。
- prompt 配置依赖手工替换，需同步更新 Apollo 配置后生效。

## 10. 命名对照

| 名称 | 含义 |
|------|------|
| `sampleSize` | 每组去重后的内容样本数上限（目标） |
| `stableCount` / `unstableCount` | 去重后实际入组内容数 |
| `stableTemplateCount` / `unstableTemplateCount` | 去重前模板行数（含重复内容的实例） |
| `templateCount` | 某内容在当前 lanes 命中集合内的模板实例数 |
