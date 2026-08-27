# UTILITY 伪装建议系统设计文档

## 1. 概述

### 1.1 背景
WhatsApp 模版提交为 UTILITY 类型后，Meta 会持续监测模版的实际使用行为和内容。如果 Meta 判定内容实际为 MARKETING 性质，会自动将 category 修改为 MARKETING，导致模版失去 UTILITY 的发送配额和频率优势。

### 1.2 目标
当模版被 Meta 从 UTILITY 改回 MARKETING 时，通过 LLM 分析模版内容，生成伪装为 UTILITY 风格的修改建议，在素材模版管理页面上直观展示给运营人员参考。

### 1.3 核心链路
```
定时任务扫描 message_template 增量 → 发现 templateType=MARKETING 且 everUtility=1
  → 调用 LLM Agent 分析 → 生成建议存入 DB
  → 运营在素材模版管理页面看到建议对比 → 手动参考修改
```

### 1.4 阶段说明
阶段一只做建议的生成和展示，不做一键应用/拒绝/忽略等交互。`feedbacks`、`status`、`remark` 字段预留供后续迭代。

---

## 2. 触发层

### 2.1 触发方式
XXL-Job 定时任务扫描 `message_template` 表增量变化。

### 2.2 扫描逻辑
```sql
SELECT * FROM message_template
WHERE utime > #{lastScanTime}
  AND template_type = 'MARKETING'
  AND ever_utility = 1
```

- `lastScanTime`：上次扫描时间，记录在 Redis 或内存中
- 条件含义：模版当前是 MARKETING，但曾经是过 UTILITY（被 Meta 自动改回）

### 2.3 去重逻辑
对于每个匹配的 `message_template_id`，查询 `message_template_disguise_suggestion` 表：
- 查询该 `message_template_id` 已存在记录的最大 `version` 值
- 如果最大 `version` ≥ `BusinessConfig.disguiseSuggestionMinVersion`（即已有版本 >= 配置的最低版本） → 跳过，不再处理
- 否则 → 触发 LLM 分析

`version` 生成规则：保存时取当前时间，格式为 `yyyyMMddHHmm`（到分钟），例如 `202607291230`。

> 设计意图：运营可通过调整 `disguiseSuggestionMinVersion` 配置，控制是否重新分析已有的建议记录。例如将配置设为 `202607300000`，则所有 version < 该值的旧建议在展示和扫描时都会被忽略。

**失败重试**：LLM 调用失败不重试，下次 job 执行时若该模版仍未生成建议，会再次触发。

**并发控制**：不需并发，串行处理。

### 2.4 新增类
- `TemplateDisguiseSuggestionScanJob` — XXL-Job 入口（JobHandler）
- `DisguiseSuggestionScanService` — 扫描 + 触发分析编排

---

## 3. AI 分析层

### 3.1 复用基础设施
- `ChatModelManager` — 管理 LLM 模型（已存在）
- `ReActAgent` — Solon AI Agent 框架（已存在）
- `@ToolMapping` — Agent 工具注解（已存在）

### 3.2 新增类

#### DisguiseSuggestionAgentTools
LLM 可调用的工具（`@ToolMapping` 注解）：

| 工具名 | 功能 | 返回内容 |
|--------|------|---------|
| `getTemplateDetail(templateId)` | 获取模版完整信息 | `message_template` 基本信息 + `components` JSON + `materialGroupId` + `materialCombinationId` |
| `getMaterialCombinationDetail(combinationId)` | 获取组合各元素的素材内容 | 查 `message_material_combination` → 拿到 `headerMaterialId/bodyMaterialId/footerMaterialId/buttonsMaterialId` → 从 Mongo 查出每个素材的 `element` 完整 JSON |

#### DisguiseSuggestionAgentService
分析编排服务，流程：
1. 查出 `MessageTemplate`
2. 查出 `MessageMaterialCombination`
3. 从 Mongo 查出各位置素材的 element
4. 拼装 `origin_content` JSON
5. 调用 `ReActAgent`，入参为 origin_content
6. Agent 输出结构化的 `suggested_content`
7. 保存 `prompt`（调用时实际使用的完整 prompt）、`llm_raw_output`（LLM 完整响应）、`suggested_content` 到建议表

---

## 4. 数据存储层

### 4.1 新建表

#### message_template_disguise_suggestion

```sql
CREATE TABLE `message_template_disguise_suggestion`
(
  `id`                         bigint(20)   NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `version`                    bigint(20)   NOT NULL DEFAULT '0' COMMENT 'AI analysis version, format: yyyyMMddHHmm (e.g. 202607291230)',
  `message_template_id`        bigint(20)   NOT NULL COMMENT 'Associated message_template ID',
  `material_group_id`          bigint(20)   NOT NULL COMMENT 'Associated material group ID',
  `material_combination_id`    bigint(20)   NOT NULL DEFAULT '0' COMMENT 'Associated material combination ID',
  `origin_content`             text         NOT NULL COMMENT 'Current template combination complete element collection JSON: {header:{material_id,element}, body:{...}, footer:{...}, buttons:{...}}',
  `suggested_content`          text         NOT NULL COMMENT 'LLM suggested JSON with same structure as origin, each element appends suggestion field',
  `prompt`                     text         NOT NULL COMMENT 'Full prompt used when calling LLM (including system prompt + user prompt + tool output)',
  `llm_raw_output`             text         NOT NULL COMMENT 'LLM raw complete response (including chain of thought), preserving full analysis process',
  `feedbacks`                  text         NOT NULL COMMENT 'Per-element feedback JSON array, each item contains element_key/feedback_type/reason: [{"element_key":"body","feedback_type":1,"reason":"..."}]',
  `status`                     tinyint(4)   NOT NULL DEFAULT '0' COMMENT 'Reserved for future use',
  `remark`                     varchar(1024)         DEFAULT '' COMMENT 'Reserved for future use',
  `ctime`                      bigint(20)   NOT NULL COMMENT 'Creation time',
  `utime`                      bigint(20)   NOT NULL COMMENT 'Update time',
  PRIMARY KEY (`id`),
  KEY `idx_message_template_id` (`message_template_id`),
  KEY `idx_material_combination_id` (`material_combination_id`),
  KEY `idx_message_template_version` (`message_template_id`, `version`),
  KEY `idx_material_group_version` (`material_group_id`, `version`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4 COMMENT = 'UTILITY disguise suggestion table';
```

### 4.2 新增 PO
- `TemplateDisguiseSuggestion.java` — MyBatis-Plus Entity
  - `batchNo` (String) → `version` (Long)，字段注释改为 `AI analysis version, format: yyyyMMddHHmm`

### 4.3 新增 Mapper
- `TemplateDisguiseSuggestionMapper.java`

---

## 5. API 层（阶段一）

### 5.1 修改现有 API

#### `POST /admin/material/groupDetail`（MessageMaterialController）
现有返回 `MessageMaterialGroupRespDTO`，新增字段：

```java
private List<DisguiseSuggestionVO> disguiseSuggestions;
```

查询逻辑：通过 `materialGroupId` 查 `message_template_disguise_suggestion` 表，同时增加 `version >= BusinessConfig.disguiseSuggestionMinVersion` 过滤条件，只返回版本号大于等于配置最小版本的建议记录。

#### DisguiseSuggestionVO
```java
public class DisguiseSuggestionVO {
    private Long id;
    private Long version;
    private String originContent;
    private String suggestedContent;
    private String prompt;
    private String llmRawOutput;
    private Integer status;
    private String feedbacks;
    private String remark;
    private Long ctime;
}
```

### 5.2 阶段一不实现的 API
- 不实现「应用建议」「拒绝建议」「忽略建议」等状态变更接口
- 不实现「手动触发分析」接口

运营人员直接在页面上查看建议内容，手动复制修改。

---

## 6. 前端展示

在现有素材模版管理页面的 `groupDetail` 展示基础上，对每个元素卡片增加「伪装建议」展示区域。

### 6.1 展示逻辑
- `groupDetail` API 返回的 `disguiseSuggestions` 非空时，显示建议区域
- 前端解析 `suggested_content`，按 key（header/body/footer/buttons）拆分
- 每个 key 的 `material_id` 对应当前页面上的元素卡片
- 在对应卡片上展示：
  - ⚠️ 当前内容（灰色背景）
  - 💡 建议内容（绿色背景）
  - 每个元素的 `suggestion` 字段作为修改说明

### 6.2 交互
- 阶段一只做展示，不提供状态变更按钮
- 运营可手动复制建议内容到素材编辑页

---

## 7. 数据格式

### 7.1 origin_content 结构

```json
{
  "header": {
    "material_id": "507f1f77bcf86cd799439011",
    "element": {"type":"HEADER","format":"TEXT","text":"🔥 Flash Sale! 50% OFF!"}
  },
  "body": {
    "material_id": "507f1f77bcf86cd799439012",
    "element": {"type":"BODY","text":"Don't miss out! Shop now and get huge discounts! {{1}}"}
  },
  "footer": {
    "material_id": "507f1f77bcf86cd799439013",
    "element": {"type":"FOOTER","text":"Reply STOP to unsubscribe"}
  },
  "buttons": {
    "material_id": "507f1f77bcf86cd799439014",
    "element": {"type":"BUTTONS","buttons":[
      {"type":"QUICK_REPLY","text":"Shop Now"},
      {"type":"URL","text":"Claim Offer","url":"https://xxx.com/offer"}
    ]}
  }
}
```

### 7.2 suggested_content 结构（element 存放伪装后的完整示例，suggestion 存放英文修改原因说明）

```json
{
  "header": {
    "material_id": "507f1f77bcf86cd799439011",
    "element": {"type":"HEADER","format":"TEXT","text":"Notifikasi Status Akun {{user_id}}"},
    "suggestion": "Remove emoji and promotional tone, replace with system notification style header binding user variable"
  },
  "body": {
    "material_id": "507f1f77bcf86cd799439012",
    "element": {"type":"BODY","text":"📢 Pembaruan Sistem: Kuota pra-evaluasi untuk nomor {{user_id}} telah dihitung.\nEstimasi batas maksimal kuota: Rp 200.000.000\nInformasi ini merupakan hasil kalkulasi otomatis sistem. Tidak ada tindakan yang diperlukan saat ini. Anda dapat memeriksa status kapan saja melalui aplikasi."},
    "suggestion": "Replace marketing urgency language with system calculation result notification, append safety disclaimer, keep variable {{1}} unchanged"
  },
  "footer": {
    "material_id": "507f1f77bcf86cd799439013",
    "element": {"type":"FOOTER","text":"Ini adalah pesan otomatis dari sistem. Hubungi dukungan jika ada pertanyaan."},
    "suggestion": "Add service message disclaimer to indicate this is a transactional notification"
  },
  "buttons": {
    "material_id": "507f1f77bcf86cd799439014",
    "element": {"type":"BUTTONS","buttons":[
      {"type":"URL","text":"Periksa Status Saldo","url":"https://xxx.com/status"},
      {"type":"PHONE_NUMBER","text":"Hubungi Dukungan","phone_number":"+2348001234567"}
    ]},
    "suggestion": "Replace QUICK_REPLY and marketing URL buttons with status-check and support contact to meet UTILITY template requirements"
  }
}
```

### 7.3 feedbacks 数据格式（operational feedback per element）

```json
[
  {
    "element_key": "body",
    "material_id": "507f1f77bcf86cd799439012",
    "feedback_type": 1,
    "reason": "文案已改为服务通知风格，符合UTILITY要求，采纳"
  },
  {
    "element_key": "footer",
    "material_id": "507f1f77bcf86cd799439013",
    "feedback_type": 2,
    "reason": "页脚需要保留退订引导文案，当前建议删除了退订信息"
  },
  {
    "element_key": "buttons",
    "material_id": "507f1f77bcf86cd799439014",
    "feedback_type": 3,
    "reason": "按钮修改暂不处理，等产品确认后再调整"
  }
]
```

- `element_key`: header / body / footer / buttons
- `feedback_type`: 1-applied（采纳） 2-rejected（拒绝） 3-ignored（忽略）
- `reason`: 操作人的具体反馈理由（正向或负向）
- status 字段由前端/后端根据 feedbacks 聚合计算

### 7.4 prompt 示例

#### System Prompt

```
你是一个 WhatsApp UTILITY 模版内容分析专家。你的任务是分析当前模版内容，生成伪装为 UTILITY 风格的修改建议。

核心理念：Keep MARKETING Purpose, Wear UTILITY Skin。保留业务意图（如推广产品/通知额度），但将话术包装为系统自动通知/账户事务公告，消除营销感知。

背景：
- Meta 会将实际为 MARKETING 风格的模版自动改回 MARKETING category，导致失去 UTILITY 发送配额和频率优势
- 需要将模版内容调整为 UTILITY 风格（服务通知、事务性消息）以通过 Meta 审核

=== 规则定义 ===

一、BODY 伪装规则（最重要，直接影响判定）
1. 禁止使用的营销雷区词（必须替换）：
   - 直接营销词汇：PROMO、Diskon、Penawaran、hadiah、bonus
   - 行动号召词：Dapatkan、Ambil、Sikat、Beli、Shop、segera、jangan lewatkan
   - 诱导/催促词：kesempatan、kupon、naik limit、hanya berlaku、hangus、wujudkan impianmu
   - 利益描述：bebas bunga、tanpa bayar、gratis、cair cepat、dana siap
2. 安全替换词（优先使用）：
   - Notifikasi Sistem / Pembaruan Sistem / Pengumuman Kebijakan
   - log harian / laporan berkala / status akun / pembaruan otomatis
   - penyesuaian kuota otomatis / kalkulasi sistem / hasil penilaian
3. 所有营销利益点必须包装为「系统已自动完成的操作结果」，而非「向用户推销的产品」
   例如：不说"Dapatkan limit Rp200 Juta"，改为"Limit Rp200 Juta telah dialokasikan ke akun Anda oleh sistem"
4. 末尾必须追加至少一句安全事务声明：
   "Informasi ini adalah log sistem otomatis, tidak ada tindakan yang diperlukan."
5. 全文使用陈述句，描述系统操作结果，不向用户发起请求或使用疑问句

二、HEADER 伪装规则
1. 类型选择：优先改为 TEXT 类型并绑定变量（如 {{user_id}} / {{order_id}} / {{report_no}}）
2. 如必须保留 IMAGE：禁止使用纯广告海报/促销活动视觉；建议添加系统状态栏、账户通知类视觉元素
3. 内容示例：Notifikasi Akun {{user_id}} / Laporan Sistem No.{{report_no}} / Pengumuman Kebijakan
4. 每条建议必须新增至少一个动态变量（用户ID/订单号/报告编号/时间戳），增强事务感知

三、BUTTONS 伪装规则
1. 禁用文案：Dapatkan、Beli、Ambil、Shop、Penarikan Dana、Sikat langsung!、Klaim、Tukarkan
2. 禁用特征：感叹号、emoji、限时催促语气
3. 允许文案（事务查看类）：
   - Periksa Status / Lihat Detail / Cek Akun
   - Periksa Status Saldo / Lihat Detail Akun / Cek Hasil Verifikasi
   - Lihat Syarat & Ketentuan / Lihat Laporan Lengkap / Cek Status Akun

四、Emoji 伪装规则
1. 仅允许系统通知类表情：📢 ✅ ⏰ 📊 📋 ⚡
2. 禁止营销促销类表情：🔥 🎉 🎁 🤑 🏆 🎊 🥳 🤩 💰
3. 单条模板 emoji 总数不超过 3 个

五、输出格式要求
- 仅返回 JSON，不要额外解释
- 建议的 element 中保留原有变量（{{1}}、{{2}} 等），可新增事务变量（如 {{user_id}}、{{order_id}}、{{report_no}}）

输出 JSON 结构要求：

{
  "header": {
    "material_id": "...",
    "element": { /* 伪装后的完整示例内容，如修改后的HEADER/BODY/BUTTONS完整JSON */ },
    "suggestion": "Modification reason in English for this element"
  },
  "body": {
    "material_id": "...",
    "element": { /* 同上：伪装后的完整示例内容 */ },
    "suggestion": "Modification reason in English for this element"
  },
  "footer": {
    "material_id": "...",
    "element": { /* 同上：伪装后的完整示例内容 */ },
    "suggestion": "Modification reason in English for this element"
  },
  "buttons": {
    "material_id": "...",
    "element": { /* 同上：伪装后的完整示例内容 */ },
    "suggestion": "Modification reason in English for this element"
  }
}
说明：
- element: 存放伪装改写后的完整示例内容（包含所有修改后的字段和值），直接作为运营复制参考
- suggestion: 存放英文修改原因说明，解释为什么做这些修改
- element 中需保留 origin_content 中已有的变量（{{1}}、{{2}}等），并根据需要新增事务变量（如 {{user_id}}、{{order_id}}、{{report_no}}）
```

#### User Prompt

```
当前模版内容如下（可结合工具获取更多详情）：

模版名称: {templateName}
语言: {language}
模版ID: {templateId}

当前内容:
{originContent}

请分析并按照 system prompt 中定义的 JSON 结构输出伪装建议结果。
```

#### LLM 返回与字段映射

| LLM 输出内容 | 存入字段 | 说明 |
|-------------|---------|------|
| 结构化 JSON（suggested_content 格式） | `suggested_content` | 从 LLM 原始响应中提取的纯净 JSON |
| LLM 完整原始响应（含思维链） | `llm_raw_output` | 保留完整的分析过程 |
| systemPrompt + userPrompt | `prompt` | 调用时使用的完整 prompt |

提取逻辑在 `DisguiseSuggestionAgentService.extractSuggestedJson()` 中实现：
1. 移除 `\<think\>` 标签块
2. 移除 markdown 代码块标记
3. 扫描第一个 `{` 或 `[`，按括号匹配提取完整 JSON

---

## 8. 涉及修改的文件清单

### 新建文件
| 文件路径 | 说明 |
|---------|------|
| `whatsapp-crm-data/.../entity/po/TemplateDisguiseSuggestion.java` | PO |
| `whatsapp-crm-data/.../mapper/TemplateDisguiseSuggestionMapper.java` | Mapper |
| `whatsapp-crm-data/.../service/TemplateDisguiseSuggestionService.java` | Service 接口 |
| `whatsapp-crm-data/.../service/impl/TemplateDisguiseSuggestionServiceImpl.java` | Service 实现 |
| `whatsapp-crm-data/.../ai/tools/DisguiseSuggestionAgentTools.java` | LLM 工具 |
| `whatsapp-crm-data/.../ai/service/DisguiseSuggestionAgentService.java` | LLM 分析编排 |
| `whatsapp-crm-data/.../xxljob/TemplateDisguiseSuggestionScanJobService.java` | 定时扫描 Service |
| `whatsapp-crm-data/.../xxljob/TemplateDisguiseSuggestionScanJob.java` | XXL-Job 入口 |
| `whatsapp-crm-data/.../entity/dto/response/DisguiseSuggestionVO.java` | VO |

### 修改文件
| 文件路径 | 修改内容 |
|---------|---------|
| `BusinessConfig.java` | 新增 `disguiseSuggestionMinVersion` 配置字段（Apollo 可配，默认 0） |
| `TemplateDisguiseSuggestion.java` (PO) | `batchNo` (String) → `version` (Long) |
| `DisguiseSuggestionVO.java` (VO) | `batchNo` (String) → `version` (Long) |
| `DisguiseSuggestionScanService.java` | 去重逻辑改为判断已有最大 version 是否 >= minVersion；保存时设置 version 为 `yyyyMMddHHmm` |
| `MessageMaterialGroupRespDTO.java` | 追加 `disguiseSuggestions` 字段 |
| `MessageMaterialGroupServiceImpl.java` | `groupDetail` 方法中查询建议增加 `version >= minVersion` 条件 |
| `MessageMaterialController.java` | 无修改（阶段一只追加 groupDetail 返回字段） |

### SQL 变更（DDL）
```sql
-- 1. 修改字段: batch_no varchar → version bigint
ALTER TABLE message_template_disguise_suggestion
  CHANGE COLUMN `batch_no` `version` bigint(20) NOT NULL DEFAULT '0' COMMENT 'AI analysis version, format: yyyyMMddHHmm (e.g. 202607291230)';

-- 2. 删除旧索引
ALTER TABLE message_template_disguise_suggestion
  DROP INDEX `idx_batch_no`,
  DROP INDEX `idx_material_group_id`;

-- 3. 新增联合索引
ALTER TABLE message_template_disguise_suggestion
  ADD INDEX `idx_material_group_version` (`material_group_id`, `version`);
```
