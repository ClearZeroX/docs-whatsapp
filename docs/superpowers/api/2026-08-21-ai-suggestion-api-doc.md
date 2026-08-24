# AI 素材内容生成建议 — 前端接口文档 & 交互说明

> 生成日期：2026-08-21  
> 对应设计文档：`docs/superpowers/specs/2026-08-19-ai-material-suggestion-design.md`  
> 状态：✅ 基于最新代码生成，后续若代码与本文档产生差异请以本文档为准并与后端确认

---

## 目录

1. [功能概述](#1-功能概述)
2. [核心交互流程](#2-核心交互流程)
3. [接口列表](#3-接口列表)
   - [3.1 生成 AI 建议](#31-生成-ai-建议)
   - [3.2 查询建议列表](#32-查询建议列表)
   - [3.3 提交反馈](#33-提交反馈)
   - [3.4 查询规则列表](#34-查询规则列表)
4. [关键枚举与常量](#4-关键枚举与常量)
5. [前端交互规则](#5-前端交互规则)
6. [错误码与异常处理](#6-错误码与异常处理)
7. [灰度开关对前端的影响](#7-灰度开关对前端的影响)
8. [附录：DDL 建表语句](#8-附录ddl-建表语句)

---

## 1. 功能概述

在素材模版（Material Group）创建/编辑页面，用户输入部位内容（BODY/HEADER/FOOTER）后，可点击生成按钮，系统调用 LLM 根据泳道规则实时生成 AI 建议的部位内容。用户可采纳、拒绝、忽略或评分反馈。

### 核心概念

| 概念 | 说明 |
|------|------|
| **clientMaterialKey** | 前端生成的稳定临时 key，在素材保存前唯一标识一个部位。素材保存后后端会回填真实 `materialId` |
| **sourceLane** | 泳道编码，如 `MARKETING_DEFAULT`、`COLLECTION_CHAT` 等（共 9 个泳道） |
| **materialType** | 部位类型：`BODY` / `HEADER` / `FOOTER` |
| **suggestType** | 建议类型：`GENERAL`（通用建议）/ `COST_FIRST`（成本优先） |
| **generationSeq** | 生成轮次，同一 `(clientMaterialKey + materialType + suggestType + sourceLane)` 下，每个泳道最多生成 3 条 |

---

## 2. 核心交互流程

### 2.1 首次生成

```
用户录入部位内容
      │
      ▼
前端生成 clientMaterialKey（UUID 或递增 key）
      │
      ▼
点击"AI 生成建议"按钮
      │
      ▼
调用 POST /admin/ai-suggestion/generate
  传参：sourceLanes[]、clientMaterialKey、materialType、suggestType、language（可选）、materialContent
      │
      ▼
后端同步阻塞调用 LLM（超时 30s，可配置）
      │
      ▼
返回 suggestions[] 列表，每个泳道各一条
      │
      ▼
前端展示建议内容 + 自评分 + 评分理由
```

### 2.2 重新生成（带反馈）

```
用户对上次建议不满意，输入反馈文字
      │
      ▼
前端同时携带：
  - content：原始内容
  - lastSuggestedContent：上次 AI 生成的内容
  - userFeedback：用户反馈文字
      │
      ▼
调用 POST /admin/ai-suggestion/generate（materialContent 中同时传入上述三个字段）
      │
      ▼
LLM 根据原始内容 + 上次生成内容 + 用户反馈，优化生成
      │
      ▼
返回新的建议（generationSeq 递增）
```

### 2.3 反馈打分

```
用户对某条建议打分（1~5）并可选选择采纳/拒绝/忽略
      │
      ▼
调用 POST /admin/ai-suggestion/feedback
  传参：suggestionId、userScore、feedbackType（可选）、comment（可选）
      │
      ▼
支持重复提交（覆盖上次反馈）
```

### 2.4 查询已有建议（编辑/查看已保存素材）

素材保存后，后端自动回填 `materialId` 到建议记录表。前端进入编辑/查看详情页时，用真实的 `materialId`（Mongo ObjectId）查询该部位的历史建议。

```
编辑/查看详情页加载时
      │
      ▼
调用 POST /admin/ai-suggestion/list
  传参：materialId、materialType、suggestType、sourceLanes（可选）
      │
      ▼
返回该部位指定泳道的所有建议，含用户反馈状态
```

> **注意**：新建素材时（保存前），建议数据都在前端内存中，不需要调 `/list` 接口。`clientMaterialKey` 参数为后续预留，用于"通用建议"/"成本优先建议"切换时按不同类型独立查询。

### 2.5 素材保存后 clientMaterialKey → materialId 回填

```
前端保存素材时，在 MessageMaterialReqDTO 中传入 clientMaterialKey
      │
      ▼
后端保存成功后，如果回填开关打开，自动将 ai_material_suggestion 表中
与该 clientMaterialKey 匹配的记录回填 materialId 和 materialGroupId
      │
      ▼
前端无需感知此过程，后续按 materialId 查询也能关联到建议记录
```

---

## 3. 接口列表

所有接口路径前缀：`/admin/ai-suggestion`

### 3.1 生成 AI 建议

**`POST /admin/ai-suggestion/generate`**

#### 请求参数

```json
{
  "sourceLanes": ["MARKETING_DEFAULT"],
  "clientMaterialKey": "uuid-xxx-body-1",
  "materialType": "BODY",
  "suggestType": "COST_FIRST",
  "language": "zh_CN",
  "materialGroupId": 12345,
  "materialContent": {
    "materialType": "BODY",
    "content": "您有一笔贷款额度待领取，最高可借1500万印尼盾，日利率低至0.05%",
    "lastSuggestedContent": "",
    "userFeedback": ""
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sourceLanes` | String[] | ✅ | 泳道编码列表。一次可请求多个泳道，后端每个泳道独立生成 |
| `clientMaterialKey` | String | ✅ | 前端稳定临时 key，建议格式 `{materialGroupId}_{type}_{序号}` 或 UUID |
| `materialType` | String | ✅ | 部位类型：`BODY` / `HEADER` / `FOOTER` |
| `suggestType` | String | ✅ | 建议类型：`GENERAL` / `COST_FIRST` |
| `language` | String | ❌ | 语言参数，用于规则内容多语言匹配。可选值：`zh_CN` / `en_US` / `id` / `en_GB`，默认 `en_US` |
| `materialGroupId` | Long | ❌ | 素材组 ID（已有素材时传入，新建时可能为空） |
| `materialContent.materialType` | String | ✅ | 与 `materialType` 一致 |
| `materialContent.content` | String | ✅ | 用户原始输入的部位内容文本 |
| `materialContent.lastSuggestedContent` | String | ❌ | 上次 AI 生成内容，首次生成不传，重新生成时传入 |
| `materialContent.userFeedback` | String | ❌ | 用户对上次建议的反馈，首次生成不传，重新生成时传入 |

#### 响应参数

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "suggestions": [
      {
        "sourceLane": "MARKETING_DEFAULT",
        "suggestionId": 1001,
        "generationSeq": 1,
        "suggestedContent": "🎉 恭喜！您已获得最高1500万印尼盾的贷款额度，日利率仅0.05%，当天到账！",
        "score": 4.50,
        "scoreReason": "命中Lane规则：添加了吸引眼球的emoji和行动号召语，符合审核规范"
      }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `suggestions` | Array | 建议列表，每个泳道一条（仅返回白名单内且规则不为空的泳道） |
| `suggestions[].sourceLane` | String | 泳道编码 |
| `suggestions[].suggestionId` | Long | 建议记录 ID，后续反馈时使用 |
| `suggestions[].generationSeq` | Integer | 生成轮次（1/2/3） |
| `suggestions[].suggestedContent` | String | AI 生成的建议内容 |
| `suggestions[].score` | BigDecimal | LLM 自评分，0.00~5.00 |
| `suggestions[].scoreReason` | String | 自评分理由 |

#### 特殊情况

| 场景 | 返回结果 |
|------|---------|
| 功能未开启（`ai_suggestion.enabled=false`） | 接口报错，返回"AI suggestion feature is not enabled" |
| 泳道不在白名单 | 该泳道被跳过，不出现在 `suggestions` 中（不报错） |
| 泳道无效（不是 SourceLaneEnum 中的值） | 该泳道被跳过（不报错） |
| 该 `(clientMaterialKey, materialType, suggestType, sourceLane)` 已生成满 3 条 | 该泳道被跳过，不出现在 `suggestions` 中 |
| 该泳道无启用的规则 | 该泳道被跳过，不出现在 `suggestions` 中 |
| suggestType 无效 | 接口报错，返回"Invalid suggestType" |
| LLM 超时（默认 30s） | 该泳道返回 null，不出现在 `suggestions` 中 |

---

### 3.2 查询建议列表

**`POST /admin/ai-suggestion/list`**

#### 请求参数

```json
{
  "materialId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "materialType": "BODY",
  "suggestType": "COST_FIRST",
  "sourceLanes": ["MARKETING_DEFAULT"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `materialType` | String | ✅ | `BODY` / `HEADER` / `FOOTER` |
| `suggestType` | String | ✅ | `GENERAL` / `COST_FIRST` |
| `materialId` | String | ✅ | 真实 materialId（Mongo ObjectId），当前主要查询方式 |
| `clientMaterialKey` | String | ❌ | 前端临时 key，后续预留（"通用建议"/"成本优先建议"切换时独立查询）。与 `materialId` 二选一 |
| `sourceLanes` | String[] | ❌ | 泳道过滤，不传返回全部泳道 |

#### 响应参数

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "suggestions": [
      {
        "sourceLane": "MARKETING_DEFAULT",
        "suggestionId": 1001,
        "generationSeq": 1,
        "suggestedContent": "🎉 恭喜！您已获得最高1500万印尼盾的贷款额度...",
        "score": 4.50,
        "scoreReason": "命中Lane规则...",
        "userScore": 4,
        "feedbackType": 2,
        "feedbackReason": "内容不错，采纳",
        "status": 2
      },
      {
        "sourceLane": "MARKETING_DEFAULT",
        "suggestionId": 1002,
        "generationSeq": 2,
        "suggestedContent": "...",
        "score": 3.80,
        "scoreReason": "...",
        "userScore": null,
        "feedbackType": null,
        "feedbackReason": "",
        "status": 0
      }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `suggestions[].userScore` | Integer | 用户打分，1~5；未打分时为 null |
| `suggestions[].feedbackType` | Integer | 反馈类型：1=已评分, 2=已采纳, 3=已拒绝, 4=已忽略；未反馈时为 null |
| `suggestions[].feedbackReason` | String | 用户反馈备注 |
| `suggestions[].status` | Integer | 记录状态，与 feedbackType 对应（纯评分不更新 status，只写 userScore） |

#### 排序规则

- 先按 `sourceLane` 升序
- 再按 `generationSeq` 升序

---

### 3.3 提交反馈

**`POST /admin/ai-suggestion/feedback`**

#### 请求参数

```json
{
  "suggestionId": 1001,
  "feedbackType": "ADOPT",
  "userScore": 4,
  "comment": "整体满意，但利率表述可以更突出"
}
```

| 字段 | 类型 | 必填 | 说明                                                     |
|------|------|------|--------------------------------------------------------|
| `suggestionId` | Long | ✅ | 建议记录 ID                                                |
| `userScore` | Integer | ❌ | 用户打分，1~5 整数                                            |
| `feedbackType` | String | ❌ | 反馈类型枚举名：`ADOPT` / `REJECT` / `IGNORE` / `RATE`。打分传RATE |
| `comment` | String | ❌ | 备注/反馈理由                                                |

#### 响应参数

```json
{
  "code": 0,
  "message": "success",
  "data": true
}
```

#### 行为说明

- 支持**重复提交**：再次调用会覆盖之前的 `userScore`、`feedbackType`、`comment`
- 纯打分场景：只传 `userScore`，不传 `feedbackType`，此时 `status` 保持不变
- 传了 `feedbackType` 时：`status` 会被更新为对应值

---

### 3.4 查询规则列表

**`POST /admin/ai-suggestion/rule/page`**

> ⚠️ 此接口为只读查询，用于运维排查或查看某泳道下有哪些规则。前端一般不需要调用此接口。

#### 请求参数

```json
{
  "sourceLane": "MARKETING_DEFAULT",
  "materialType": "BODY",
  "suggestType": "COST_FIRST",
  "pageNo": 1,
  "pageSize": 20
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sourceLane` | String | ✅ | 泳道编码 |
| `materialType` | String | ✅ | 部位类型 |
| `suggestType` | String | ✅ | 建议类型 |
| `pageNo` | Integer | ❌ | 页码，默认 1 |
| `pageSize` | Integer | ❌ | 每页条数，默认 20 |

#### 响应参数

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "pageNo": 1,
    "pageSize": 20,
    "total": 5,
    "records": [
      {
        "id": 1,
        "ruleCode": "MKT_BODY_REDLINE_001",
        "ruleName": "禁止负面词汇",
        "suggestType": "COST_FIRST",
        "ruleSource": "BUSINESS",
        "ruleType": "CONSTRAINT",
        "priority": 100,
        "enabled": true
      }
    ]
  }
}
```

---

## 4. 关键枚举与常量

### 4.1 materialType（部位类型）

| 值 | 说明 |
|----|------|
| `BODY` | 正文 |
| `HEADER` | 头部 |
| `FOOTER` | 底部 |

### 4.2 suggestType（建议类型）

| 值 | 说明 | 灰度状态 |
|----|------|---------|
| `GENERAL` | 通用建议 | ⏳ 待规则完善后开放 |
| `COST_FIRST` | 成本优先 | ✅ 先开放 |

### 4.3 sourceLane（泳道编码）

| 值 | 说明 |
|----|------|
| `AUTHENTICATION` | OTP 认证 |
| `UTILITY` | 效用类 |
| `CUSTOMER_NEW` | 新客 |
| `CUSTOMER_OLD` | 老客 |
| `MARKETING_DEFAULT` | 营销-流程画布（灰度优先开放） |
| `MARKETING_CHAT` | 营销-聊天 |
| `COLLECTION_CHAT` | 催收-聊天 |
| `MARKETING_FLOW` | 营销-流 |
| `COLLECTION_MESSAGE` | 催收-群发 |

### 4.4 feedbackType（反馈类型）

| 枚举名 | code | 含义 |
|--------|------|------|
| `RATE` | 1 | 已评分 |
| `ADOPT` | 2 | 已采纳 |
| `REJECT` | 3 | 已拒绝 |
| `IGNORE` | 4 | 已忽略 |

### 4.5 次数限制

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 每泳道最大生成次数 | 3 | 同一 `(clientMaterialKey, materialType, suggestType, sourceLane)` 组合最多生成 3 条 |

---

## 5. 前端交互规则

### 5.1 clientMaterialKey 生成规则

- 在素材新建页面，每个部位组件应生成一个唯一的 `clientMaterialKey`
- 建议格式：`{uuid}` 或 `{materialGroupId}_{type}_{index}`（如 `new_body_0`、`new_header_1`）
- **页面生命周期内保持不变**：同一个部位在多次"生成→重新生成"过程中，`clientMaterialKey` 不变
- 素材保存时，将此 key 放入 `MessageMaterialReqDTO.clientMaterialKey` 字段

### 5.1.1 语言参数

- `language` 参数控制 AI 生成建议时使用的规则语言和输出语言
- 印尼环境：传 `zh_CN`（中文）/ `en_US`（英文）/ `id`（印尼语）
- 尼日环境：传 `zh_CN`（中文）/ `en_GB`（尼日英文）
- 不传默认 `en_US`

### 5.2 生成按钮状态管理

```
┌─────────────────────────────────────────────────────────────┐
│  生成按钮可用条件：                                           │
│  1. aiSuggestionEnabled = true（接口返回才可知，首次可默认展示） │
│  2. 用户已录入部位内容（content 非空）                          │
│  3. 当前泳道在该部位的 generationSeq < 3                       │
│                                                             │
│  生成按钮禁用条件:                                            │
│  1. 正在生成中（loading 状态，防止重复点击）                     │
│  2. 该泳道+部位已生成满3条                                     │
│  3. 接口返回功能未开启（后续隐藏按钮）                           │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 前端本地计数

由于接口去掉了 Redis 计数和 `/remain` 接口，前端需要：

- **查询已有记录确定当前计数**：编辑/查看页初始化时调用 `/list` 接口，按泳道统计已有 `generationSeq` 最大值；新建时前端本地维护计数
- **生成成功后更新本地计数**：生成接口返回后，拿到新的 `suggestionId` 和 `generationSeq`
- **多泳道场景**：每个泳道的计数独立，前端需按 `sourceLane` 分组展示和控制

### 5.4 建议列表展示顺序

- 按泳道分组展示（如"营销-流程画布"、"催收-聊天"等）
- 每组内按 `generationSeq` 升序展示（第 1 次生成在前，第 3 次在后）
- 已反馈的建议展示反馈状态标记（采纳/拒绝/忽略 + 用户评分）

### 5.5 建议操作快捷键（建议 UX）

| 操作        | 触发方式 |
|-----------|---------|
| 采纳(本次不实现) | 点击"采纳"按钮 → 调用 feedback（feedbackType=ADOPT, userScore=可弹窗打分）→ 将 suggestedContent 填入输入框 |
| 拒绝(本次不实现)      | 点击"拒绝"按钮 → 调用 feedback（feedbackType=REJECT）→ 保持原内容不变 |
| 忽略(本次不实现)      | 点击"忽略"按钮 → 调用 feedback（feedbackType=IGNORE） |
| 评分        | 星级评分组件 → 调用 feedback（userScore=1~5）（feedbackType=RATE） |
| 重新生成      | 点击"重新生成"→ 弹出反馈输入框 → 调用 generate（携带 userFeedback） |
| 复制内容      | 点击复制图标 → 复制 suggestedContent 到剪贴板 |

### 5.6 页面刷新 / 返回后数据恢复

- 已保存素材：编辑/查看页初始化时调用 `/list` 接口（传 `materialId`）拉取历史建议
- 新建素材（保存前）：建议数据在前端内存中，无需调接口；若页面刷新则建议数据丢失，需重新生成
- 后续可扩展：通过 `clientMaterialKey` 在保存前持久化建议到后端，支持刷新恢复

---

## 6. 错误码与异常处理

| 场景 | HTTP 状态码 | 响应 message | 前端处理 |
|------|-----------|-------------|---------|
| 功能未开启 | 200 | "AI suggestion feature is not enabled" | 隐藏生成按钮，或展示"功能未开放"提示 |
| suggestType 无效 | 200 | "Invalid suggestType: xxx" | 检查前端传参，toast 提示 |
| 建议记录不存在 | 200 | "Suggestion not found" | 刷新列表 |
| feedbackType 无效 | 200 | "Invalid feedback type: xxx" | 检查前端传参 |
| LLM 超时 | 200 | 该泳道不出现在 suggestions 中 | 前端展示"生成超时，请重试"，不算入生成次数 |
| 参数校验失败 | 400 | 具体字段校验信息 | 展示友好错误提示 |
| 服务器内部错误 | 500 | 通用错误信息 | 展示"服务异常，请稍后重试" |

---

## 7. 灰度开关对前端的影响

所有灰度开关由后端控制，前端无需感知具体配置。但前端需根据接口返回做好兜底：

| 开关 | 关闭时行为 | 前端处理 |
|------|----------|---------|
| `ai_suggestion.enabled` | generate 接口直接报错 | 隐藏"AI 生成建议"按钮或灰显 + 提示"功能暂未开放" |
| `ai_suggestion.lane_whitelist` | 非白名单泳道被跳过 | 如果用户选了不在白名单的泳道，该泳道不出现在结果中（前端可选择不展示对应泳道） |
| `ai_suggestion.backfill_enabled` | 保存后不回填 materialId | 前端无感知，不影响功能 |

**建议：前端首次加载页面时，可尝试调用一次 generate 或 list 接口来判断功能是否开启（接口返回特定错误码时隐藏生成入口）。**

---

## 8. 附录：DDL 建表语句

### 8.1 ai_material_suggestion（建议记录表）

```sql
CREATE TABLE `ai_material_suggestion` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'primary key',
  `client_material_key` varchar(128) NOT NULL DEFAULT '' COMMENT 'frontend stable temp key of one material part',
  `material_type` varchar(32) NOT NULL DEFAULT 'BODY' COMMENT 'material type: BODY/HEADER/FOOTER',
  `suggest_type` varchar(32) NOT NULL DEFAULT '' COMMENT 'suggest type: GENERAL/COST_FIRST',
  `generation_seq` tinyint(4) NOT NULL DEFAULT '1' COMMENT 'generation round, 1-3',
  `source_lane` varchar(32) NOT NULL DEFAULT '' COMMENT 'source lane code',
  `material_group_id` bigint(20) DEFAULT NULL COMMENT 'material group id, empty before saved',
  `material_id` varchar(64) DEFAULT NULL COMMENT 'real material id, empty before saved',
  `origin_content` text COMMENT 'user input material part content',
  `last_suggested_content` text COMMENT 'last AI generated content, empty on first generation',
  `suggested_content` text COMMENT 'AI suggested material part content',
  `prompt` text COMMENT 'full prompt sent to LLM',
  `rule_snapshot` text COMMENT 'used rules JSON snapshot for attribution',
  `llm_raw_output` text COMMENT 'LLM raw output',
  `score` decimal(3,2) DEFAULT NULL COMMENT 'LLM self score 0-5',
  `score_reason` varchar(1024) DEFAULT '' COMMENT 'LLM self score reason',
  `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'record status: 0 pending 1 rated 2 adopted 3 rejected 4 ignored',
  `feedback_type` tinyint(4) DEFAULT NULL COMMENT 'feedback type: 1 rated 2 adopted 3 rejected 4 ignored',
  `feedback_reason` varchar(1024) DEFAULT '' COMMENT 'feedback reason',
  `user_score` int(11) DEFAULT NULL COMMENT 'user score 1-5',
  `regen_feedback` varchar(1024) NOT NULL DEFAULT '' COMMENT 'user feedback used for this regeneration, empty on first generation',
  `creator` varchar(64) DEFAULT NULL COMMENT 'creator',
  `updater` varchar(64) DEFAULT NULL COMMENT 'updater',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_client_material_seq` (`client_material_key`, `material_type`, `suggest_type`, `source_lane`, `generation_seq`),
  KEY `idx_material_id` (`material_id`),
  KEY `idx_source_lane` (`source_lane`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI material suggestion record';
```

### 8.2 ai_material_suggestion_rule（规则表）

```sql
CREATE TABLE `ai_material_suggestion_rule` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT 'primary key',
  `rule_code` varchar(64) NOT NULL DEFAULT '' COMMENT 'unique rule code',
  `rule_name` varchar(128) NOT NULL DEFAULT '' COMMENT 'rule name',
  `source_lane` varchar(32) NOT NULL DEFAULT '' COMMENT 'source lane code',
  `material_type` varchar(32) NOT NULL DEFAULT 'BODY' COMMENT 'material type: BODY/HEADER/FOOTER',
  `suggest_type` varchar(32) NOT NULL DEFAULT '' COMMENT 'suggest type: GENERAL/COST_FIRST',
  `rule_source` varchar(32) NOT NULL DEFAULT '' COMMENT 'rule source: BUSINESS/AI_SUMMARY',
  `rule_type` varchar(32) NOT NULL DEFAULT '' COMMENT 'rule type: CONSTRAINT/SUGGESTION/REFERENCE/RED_LINE',
  `rule_content` text COMMENT 'rule content in JSON for future visual editing',
  `priority` int(11) NOT NULL DEFAULT '0' COMMENT 'sort priority, higher first',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'enabled flag, 1 enabled 0 disabled',
  `operator` varchar(64) NOT NULL DEFAULT '' COMMENT 'operator',
  `create_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'creation time',
  `update_time` bigint(20) NOT NULL DEFAULT '0' COMMENT 'update time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_code` (`rule_code`),
  KEY `idx_lane_material_suggest` (`source_lane`, `material_type`, `suggest_type`, `rule_source`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI material suggestion rule per lane';
```

---

## 对比设计文档的差异（已确认 & 已同步）

以下是与设计文档对比发现的差异点，已确认或已同步：

| 序号 | 差异项 | 说明 | 状态 |
|------|--------|------|------|
| 1 | `AISuggestionRulePageReqDTO` 字段 | 代码存在，三个字段都加了 `@NotBlank` | 已确认 |
| 2 | `AiSuggestionFeedbackReqDTO` 的 `comment` 字段 | 前端传参时字段名用 `comment` | 已确认 |
| 3 | `feedbackType` 传值方式 | 前端传枚举名（如 `"ADOPT"`） | ✅ 一致 |
| 4 | `MaterialContent.type` 字段名 | 已改为 `materialType` | ✅ 已同步（代码 + 文档） |
| 5 | `/generate` 返回 `suggestions` 可能为空数组 | 前端需处理 `suggestions: []` | 已确认 |
| 6 | `/list` 接口入参 | 增加 `materialId`（编辑场景）和 `sourceLanes`（泳道过滤），`clientMaterialKey` 改为非必填 | ✅ 已同步（代码 + 文档） |
