# Template 内容稳定性分析 Agent 设计文档

## 1. 背景与目标

WhatsApp 素材模版（`message_template`）创建时被标记为 UTILITY 通知类型，但经过 Meta 官方审核/运行中检测后，部分模板的类别会被调整为 MARKETING 或其他类型。这种调整主要由**消息内容特征**触发（如 BODY 文案含营销词、使用特定链接类型等）。

**目标**：构建一个 Agent，通过对比稳定模板（category 始终为 UTILITY）和不稳定模板（category 被改为非 UTILITY）的 `components` 内容特征，自动分析内容与稳定性之间的关系，产出可配置的规则建议，帮助运营配置更稳定的消息内容。

## 2. 核心判断标准

| 分类 | 判断条件 |
|------|----------|
| 稳定（正例） | `message_template_waba.category = UTILITY` |
| 不稳定（反例） | `message_template_waba.category ≠ UTILITY`（MARKETING/AUTHENTICATION 等） |

**数据范围**：
- `message_template.ever_utility = 1`（创建时指定为 UTILITY 类别的模板）
- `message_template.id` 可通过泳道（Lane）过滤缩小数据范围

## 3. 系统架构

沿用项目已有的 Solon AI ReActAgent 模式：

```
┌─────────────────────┐
│   XXL-Job 调度      │  TemplateStabilityContentAnalysisJob
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│   JobService         │  TemplateStabilityContentAnalysisJobService
│   (入口 + 发报告)    │
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│   AgentService       │  TemplateStabilityContentAgentService
│   (ReActAgent)       │  Solon ReActAgent 推理循环
└─────────┬───────────┘
          │ 调用 @ToolMapping 方法
┌─────────▼───────────┐
│   AgentTools         │  TemplateStabilityContentAgentTools
│   (数据查询工具)      │  提供数据查询能力
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│   飞书卡片通知       │  FeishuReportNotifyService（复用）
└─────────────────────┘
```

### 模块位置

| 组件 | 存放位置 |
|------|----------|
| Job Handler | `whatsapp-crm-job/.../task/TemplateStabilityContentAnalysisJob.java` |
| Job Service | `whatsapp-crm-data/.../xxljob/TemplateStabilityContentAnalysisJobService.java` |
| Agent Service | `whatsapp-crm-data/.../ai/service/TemplateStabilityContentAgentService.java` |
| Agent Tools | `whatsapp-crm-data/.../ai/tools/TemplateStabilityContentAgentTools.java` |
| DTO | `whatsapp-crm-data/.../ai/dto/` |

## 4. 数据流

### 4.1 内容数据来源

内容数据直接从 `message_template.components` 字段获取。这是一个 JSON 数组字符串，序列化自 `OpayTemplateComponent`，包含最终发送到 Meta 的完整内容。

**components 示例结构**：
```json
[
  {"type":"HEADER","format":"IMAGE","example":{"custom_header_handle_url":"..."}},
  {"type":"BODY","text":"Hai {{1}}! Welcome to our service","example":{...}},
  {"type":"FOOTER","text":"Powered by XXX"},
  {"type":"BUTTONS","buttons":[
    {"type":"URL","text":"Get Started","url":"https://..."},
    {"type":"QUICK_REPLY","text":"OK"}
  ]}
]
```

⚠️ 不需要关联 MongoDB 的 `message_material` collection 查询原始素材内容。`components` 已包含分析所需的全部内容（HEADER 类型、BODY 文本、FOOTER 文本、按钮配置等）。

### 4.2 数据查询与性能约束

#### 泳道（Lane）过滤

支持按泳道列表过滤数据范围。泳道是指 `SourceLaneEnum` 定义的业务通道类型
（`AUTHENTICATION`、`UTILITY`、`CUSTOMER_NEW`、`CUSTOMER_OLD`、`MARKETING_DEFAULT` 等）。

**过滤链路**（从泳道到模板）：

```
泳道 (laneCode) → task_base.id → task_sender_channel_config
  ↓
getConfigTemplateIdSet(taskId) 提取模板 ID
（覆盖 WEIGHTED_ROUND_ROBIN / PRIORITY_ROUND_ROBIN / PRIORITY_LOOP_WEIGHTED_ROUND_ROBIN 策略）
  ↓
回退：解析 configModel.materialGroupId → getMaterialTemplateIdListWithCache()
（覆盖 AUTOMATIC_MATERIAL 策略）
  ↓
message_template 分页查询增加 id IN (laneTemplateIds)
```

**行为约定**：
- 传入空列表时直接返回空数据
- 未命中任何模板时返回空数据

#### 核心原则

- **必须分页查询**，避免一次性加载全表影响数据库性能
- **批次大小统一使用 `BusinessConfig.batchQueryMysqlSize`**（默认 500），可在 Apollo 动态调整
- 参照 `SyncEverUtilityShadowStatusJobService` 的游标分页模式 + `MessageTemplateWabaServiceImpl.batchQueryByTemplateIds` 的 IN 分批模式

#### 分页查询策略

采用**游标分页**（基于 ID 排序），每次查询一批数据并记录最后一个 ID 用于下一页：

**Step 0（可选）：按泳道限制模板范围**

```
IF lanes 不为空:
  1) 查 task_base:
     SELECT id FROM task_base WHERE lane_code IN (lanes)
  2) 对每个 taskId 查 task_sender_channel_config:
     a) taskSenderChannelConfigService.getConfigTemplateIdSet(taskId)
        -- 覆盖 WEIGHTED_ROUND_ROBIN / PRIORITY_ROUND_ROBIN 等策略
     b) 若为空且 strategy == AUTOMATIC_MATERIAL:
        解析 configModel.materialGroupId →
        messageTemplateService.getMaterialTemplateIdListWithCache(materialGroupId).keys
  3) 合并所有 templateIds → laneTemplateIds
```

**Step 1：分页查询 `message_template`**

```
每批大小：BusinessConfig.batchQueryMysqlSize
排序列：message_template.id DESC（优先获取最新数据）

循环：
  SELECT id, name, components, material_group_id
  FROM message_template
  WHERE ever_utility = 1
    AND material_group_id > 0
    AND status != 'PENDING_DELETION'
    [AND id IN (laneTemplateIds)]    -- 仅当传了 lanes 时启用
    AND id < {cursorId}                -- 游标，首轮为 MAX_VALUE
  ORDER BY id DESC
  LIMIT {batchQueryMysqlSize}
```

每次查询结果不足 `batchQueryMysqlSize` 条时结束循环。

**Step 2：批量查询 `message_template_waba`**

收集所有 Step 1 返回的 template ID 列表，调用 `messageTemplateWabaService.batchQueryByTemplateIds()` 批量查询。该方法内部已按 `BusinessConfig.batchQueryMysqlSize` 对 IN 子句做分批处理，排除 `PENDING_DELETION` 状态的 waba。

**Step 3：内存分组**

按规则将数据分组：
- **稳定组（正例）**：所有关联 waba 的 category 均为 UTILITY
- **不稳定组（反例）**：存在任一 waba 的 category ≠ UTILITY

#### 数据流程图

```
┌───────────────────────────────────────────┐
│  循环：游标分页查 message_template       │
│  (ever_utility=1, material_group_id>0)    │
│  每批 businessConfig.batchQueryMysqlSize  │
└──────────────┬────────────────────────────┘
               │ 收集所有 template ID
               ▼
┌───────────────────────────────────────────┐
│  messageTemplateWabaService               │
│  .batchQueryByTemplateIds(allTemplateIds) │
│  (内部按 batchQueryMysqlSize 分 IN 批次)   │
└──────────────┬────────────────────────────┘
               │ 按 category 分组
               ▼
┌───────────────────────────────────────────┐
│  内存合并分组                              │
│  → 稳定组（全 waba 为 UTILITY）           │
│  → 不稳定组（存在非 UTILITY waba）        │
└──────────────┬────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────┐
│  交给 ReActAgent 进行内容分析             │
└───────────────────────────────────────────┘
```

### 4.3 Tool 方法设计

`TemplateStabilityContentAgentTools` 提供以下工具方法：

```
1. getStableAndUnstableTemplates()
   使用游标分页查询所有符合条件的模板（分页大小 configurable），
   通过 batchQueryByTemplateIds 批量加载 waba 数据，
   在内存中按 category 分组为稳定/不稳定两组。
   返回：PageResult { stableTemplates: [...], unstableTemplates: [...], totalCount }

2. getTemplateDetail(Long templateId)
   查询单个模板及其 waba 的完整信息。
   用于 Agent 深入分析特定示例。
```

### 4.4 Agent 推理流程

Agent 获取数据后自动进行分析：

1. **分组统计** — 将模板分为稳定/不稳定两组，统计数量、占比
2. **内容特征对比分析** — 对比两组模板的 components 各部分
3. **规则提炼** — 找出稳定组和不稳定组的显著差异，提炼为可配置规则
4. **报告生成** — 产出结构化报告，包含正例和反例

### 4.5 分析维度

**BODY 文本特征**：
- 是否含价格相关词（"free", "offer", "discount", "promo" 等）
- 是否含链接/URL
- 表情符号密度和类型
- 变量占位符（`{{1}}`）数量和位置
- 是否包含比较级、夸张用语

**HEADER 类型特征**：
- 不同类型（IMAGE/TEXT/VIDEO/DOCUMENT）的稳定比例
- IMAGE 类型的图片是否可能含营销元素

**BUTTONS 特征**：
- 按钮类型分布（URL / PHONE_NUMBER / QUICK_REPLY）
- URL 按钮的链接类型（静态 / DynamicLink / 短链）
- 按钮文案是否含营销用语

**FOOTER 文本特征**：
- 文本长度和内容是否含营销倾向

## 5. 报告格式

报告通过飞书卡片发送，结构如下：

```
# Template 内容稳定性分析报告

## 一、概览
- 分析模板总数：XXX
- 稳定模板（UTILITY）：XXX（占比 XX%）
- 不稳定模板（非 UTILITY）：XXX（占比 XX%）

## 二、BODY 文本特征对比
### 稳定组关键词 Top 10
- XX: XX 次
- ...

### 不稳定组关键词 Top 10
- XX: XX 次
- ...

### 关键差异
- 不稳定组出现"promo"/"offer"/"discount"等营销词的频率是稳定组的 X 倍
- 不稳定组使用 XX 类 emoji 的比例显著高于稳定组

## 三、HEADER 类型对比
| HEADER 类型 | 稳定组占比 | 不稳定组占比 |
|------------|-----------|------------|
| TEXT       | XX%       | XX%        |
| IMAGE      | XX%       | XX%        |
| VIDEO      | XX%       | XX%        |
| DOCUMENT   | XX%       | XX%        |

## 四、BUTTONS 对比
| 按钮类型 | 稳定组占比 | 不稳定组占比 |
|---------|-----------|------------|
| URL     | XX%       | XX%        |
| QUICK_REPLY | XX%   | XX%        |
| PHONE_NUMBER | XX%  | XX%        |

## 五、正例（稳定模板示例）
> 模板名称：XXX
> BODY 内容：...
> HEADER 类型：TEXT
> 按钮配置：...
> → 所有 waba category 均为 UTILITY

## 六、反例（不稳定模板示例）
> 模板名称：XXX
> BODY 内容：...
> HEADER 类型：IMAGE
> 按钮配置：...
> → 存在 waba category 被改为 MARKETING

## 七、规则建议
根据分析结果，提炼以下规则供运营配置：

1. **BODY 文案规则**：避免出现 [营销关键词列表]，建议使用 [安全关键词列表]
2. **HEADER 规则**：优先使用 TEXT 类型，避免在 IMAGE 中包含促销元素
3. **BUTTONS 规则**：[具体建议]
4. **Emoji 使用规则**：[具体建议]
```

## 6. 配置项

### 泳道映射配置（Apollo）

泳道与 WABA agentName 的映射通过 Apollo 配置 `laneWabaMap` 管理，
`LaneWabaConfig.getLaneWabas()` 负责解析。

通过 Apollo/BusinessConfig 增加开关和参数：

```
# Agent 分析开关
material.stability.content.analysis.enabled=true

# Agent 分析 Prompt（可动态调整）
material.stability.content.analysis.systemPrompt=...
material.stability.content.analysis.userPrompt=...
```

## 7. 调度触发

XXL-Job 定时任务配置：

```
JobHandler: templateStabilityContentAnalysisJob
执行频率：每日 1 次（如 03:00 AM）
参数：无
```

## 8. 后续扩展

- **素材组粒度分析**：在全局分析基础上，支持按 `material_group_id` 深入分析单个组的稳定性与内容关系
- **规则反馈闭环**：运营配置规则后，Agent 可在后续分析中验证规则效果
- **历史趋势**：记录每次分析结果的快照，追踪稳定性变化趋势
