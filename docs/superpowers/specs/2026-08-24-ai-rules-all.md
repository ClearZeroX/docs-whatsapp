# AI 素材建议 — 全部规则汇总

> 日期：2026-08-24
> 整合三套规则，可直接导入 Apollo `ai_suggestion.rule.import.json`
>
> 本文档包含原三篇文档的全部详细内容，可替代以下单篇：
> - `2026-08-21-ojk-rules-analysis.md`
> - `2026-08-21-ai-disguise-rules.md`
> - `2026-08-24-ai-generate-rules.md`

---

# OJK 监管规则分析与可配置规则

> 日期：2026-08-21
> 来源：[OJK Checking List Video Advertisement](https://docs.google.com/spreadsheets/d/1BvaDJh1DV7KygPdkRe9YaGZkh5M1GSD8XpIUPzlaIL0/edit?gid=728045375)
> 印尼环境适用，所有规则 `ruleSource=BUSINESS`

---

## 一、规则字段说明

| 字段 | 值 | 说明 |
|------|-----|------|
| `ruleSource` | `BUSINESS` | 规则来源：业务规则 |
| `ruleType` | 见 `RuleTypeEnum` | `RED_LINE` / `CONSTRAINT` / `SUGGESTION` / `REFERENCE` |
| `ruleContent` | 多语言 JSON | key 为语言标识（`zh_CN`/`en_US`/`id`），值对应语言描述 |

### ruleContent 格式

```json
{
  "zh_CN": "规则中文描述",
  "en_US": "English description",
  "id": "Deskripsi bahasa Indonesia",
  "en_GB": "English description for Nigeria"
}
```

> 前端传 `language` 参数（`zh_CN`/`en_US`/`id`/`en_GB`），后端从 `ruleContent` 提取对应语言描述注入 prompt，找不到时 fallback `en_US`。

---

## 二、红线规则（ruleType=RED_LINE）

适用于所有泳道（`sourceLane=ALL`）和所有 `materialType`，AI 生成内容绝对不能违反。

| ruleCode | 禁用表述 | ruleContent |
|----------|---------|-------------|
| `OJK_REDLINE_001` | 可信赖 / Trusted / Terpercaya | `{"zh_CN":"禁止使用'可信赖'等保证性词汇形容自身","en_US":"Do not use assurance words like 'Trusted' to describe yourself","id":"Jangan gunakan kata jaminan seperti 'Terpercaya' untuk menggambarkan diri sendiri"}` |
| `OJK_REDLINE_002` | 利率仅X% / Interest rate of only X% / Bunga hanya X% | `{"zh_CN":"禁止用'仅'修饰利率暗示极低。正确表述用'mulai dari'","en_US":"Do not use 'only' to modify interest rates. Use 'starting from'","id":"Jangan gunakan 'hanya' untuk memodifikasi suku bunga. Gunakan 'mulai dari'"}` |
| `OJK_REDLINE_003` | OJK认证/OJK许可/经OJK批准 | `{"zh_CN":"禁止使用'OJK认证/OJK许可/经OJK批准'等表述。OJK是监管方非认证方，正确表述为'受OJK许可并监管'","en_US":"Do not use 'certified by OJK/licensed by OJK/permitted by OJK'. Use 'licensed and supervised by OJK'","id":"Jangan gunakan 'disertifikasi oleh OJK/berlisensi OJK/diijinkan oleh OJK'. Gunakan 'berizin dan diawasi oleh OJK'"}` |
| `OJK_REDLINE_004` | 唯一 / The only one / Satu-satunya | `{"zh_CN":"禁止使用'唯一'等最高级绝对化表述","en_US":"Do not use absolute superlative terms like 'the only one'","id":"Jangan gunakan istilah superlatif absolut seperti 'satu-satunya'"}` |
| `OJK_REDLINE_005` | 安全 / Safe / Aman | `{"zh_CN":"禁止承诺'安全'，金融产品有风险","en_US":"Do not promise 'safe'. Financial products carry risk","id":"Jangan menjanjikan 'aman'. Produk keuangan memiliki risiko"}` |
| `OJK_REDLINE_006` | 仅需X分钟到账 / fast disbursement without conditions | `{"zh_CN":"禁止不附带条件的快速到账承诺，须写'资料齐全后X天内处理'","en_US":"Do not promise instant disbursement without conditions","id":"Jangan menjanjikan pencairan instan tanpa syarat"}` |
| `OJK_REDLINE_007` | 跳过SLIK/征信 / Promising no credit check | `{"zh_CN":"禁止承诺跳过征信审核(SLIK/BI Checking)即可放款","en_US":"Do not promise disbursement without credit check","id":"Jangan menjanjikan pencairan tanpa pengecekan kredit (SLIK/BI Checking)"}` |
| `OJK_REDLINE_008` | 有保障 / Guaranteed / Terjamin | `{"zh_CN":"禁止承诺'有保障'","en_US":"Do not promise 'guaranteed'","id":"Jangan menjanjikan 'terjamin'"}` |
| `OJK_REDLINE_009` | 值得信赖 / Reliable / Dapat diandalkan | `{"zh_CN":"禁止使用'值得信赖'形容自身","en_US":"Do not use 'reliable' to describe yourself","id":"Jangan gunakan 'dapat diandalkan' untuk menggambarkan diri sendiri"}` |
| `OJK_REDLINE_010` | 无需担保人 / No guarantor needed / Tidak butuh penjamin | `{"zh_CN":"贷款产品必须如实说明担保要求，禁止简单宣称'无需担保人'","en_US":"Loan products must state guarantee requirements. Do not claim 'no guarantor needed'","id":"Produk pinjaman harus menyatakan persyaratan jaminan"}` |
| `OJK_REDLINE_011` | 客户数据安全 / Customer data is secure / Data nasabah aman | `{"zh_CN":"禁止简单承诺客户数据安全","en_US":"Do not simply claim customer data is secure","id":"Jangan mengklaim data nasabah aman tanpa penjelasan"}` |
| `OJK_REDLINE_012` | 可分X月还款 / Can be paid in X installments / Bisa dicicil X bulan | `{"zh_CN":"禁止不加修饰，正确表述须用'sampai/hingga'（最长/最高）修饰","en_US":"Do not use absolute values for installments. Use 'up to' modifier","id":"Jangan gunakan nilai absolut untuk cicilan. Gunakan 'sampai/hingga'"}` |
| `OJK_REDLINE_013` | OJK监管声明中嵌入Logo | `{"zh_CN":"禁止在监管声明文字中嵌入OJK Logo","en_US":"Do not embed OJK logo in the regulatory statement text","id":"Jangan menyematkan logo OJK dalam teks pernyataan regulasi"}` |
| `OJK_REDLINE_014` | 提及竞品品牌 | `{"zh_CN":"禁止在文案中提及任何竞争对手或其他品牌名称","en_US":"Do not mention any competitor or brand names","id":"Jangan menyebutkan nama pesaing atau merek lain"}` |
| `OJK_REDLINE_015` | 数量有限售完即止 | `{"zh_CN":"禁止制造稀缺感，如'数量有限售完即止'","en_US":"Do not create scarcity, e.g. 'while supplies last'","id":"Jangan menciptakan kesan kelangkaan"}` |

---

## 三、约束规则（ruleType=CONSTRAINT）

| ruleCode | 约束内容 | ruleContent |
|----------|---------|-------------|
| `OJK_CONS_001` | OJK监管声明完整性 | `{"zh_CN":"必须使用完整短语'已获得许可并受金融服务管理局(OJK)监管'，不可单独出现'OJK'","en_US":"Must use the complete phrase 'licensed and supervised by the Financial Services Authority (OJK)'","id":"Harus menggunakan frasa lengkap 'berizin dan diawasi oleh Otoritas Jasa Keuangan (OJK)'"}` |
| `OJK_CONS_002` | OJK声明格式一致 | `{"zh_CN":"监管声明中所有文字同字体、同字号、同颜色，OJK不可加粗","en_US":"All text in regulatory statement must use same font type, size, and color. 'OJK' must not be bolded","id":"Semua teks dalam pernyataan regulasi harus menggunakan jenis font, ukuran, dan warna yang sama"}` |
| `OJK_CONS_003` | 利率/额度/期限必须用范围修饰 | `{"zh_CN":"利率用'mulai dari'，额度上限用'hingga'，分期期限用'sampai/hingga'，不可用绝对数值","en_US":"Interest rates use 'starting from', loan limits use 'up to', tenors use 'up to'. No absolute values","id":"Suku bunga gunakan 'mulai dari', batas pinjaman gunakan 'hingga', tenor gunakan 'sampai/hingga'"}` |
| `OJK_CONS_004` | 快速到账须附带条件 | `{"zh_CN":"承诺快速到账必须附带条件说明，如'资料齐全后X天内处理'","en_US":"Fast disbursement must include conditions, e.g. 'processed within X days after complete documentation'","id":"Pencairan cepat harus menyertakan ketentuan, misalnya 'diproses dalam X hari setelah dokumen lengkap'"}` |
| `OJK_CONS_005` | 禁止误导夸大 | `{"zh_CN":"不得使用'最/第一/最好/唯一'等最高级绝对化表述，不得夸大宣传或引导无理借贷","en_US":"Do not use absolute superlatives. Do not exaggerate or encourage irrational borrowing","id":"Jangan gunakan superlatif absolut. Jangan melebih-lebihkan atau mendorong peminjaman tidak rasional"}` |
| `OJK_CONS_006` | 完整费用说明 | `{"zh_CN":"贷款文案必须说明费用构成：利息+服务费+风险缓解费","en_US":"Loan copy must state fee components: interest + service fee + risk mitigation fee","id":"Teks pinjaman harus menjelaskan komponen biaya: bunga + biaya layanan + biaya mitigasi risiko"}` |
| `OJK_CONS_007` | 信息真实准确完整 | `{"zh_CN":"所有信息必须准确、诚实、清晰，不得误导。必须展示产品风险","en_US":"All info must be accurate, honest, and clear. Must disclose product risks","id":"Semua informasi harus akurat, jujur, dan jelas. Harus mengungkapkan risiko"}` |
| `OJK_CONS_008` | 最高级表述需附证据 | `{"zh_CN":"如使用'最'等最高级表述必须附带可验证证据来源","en_US":"Superlative claims require verifiable evidence","id":"Klaim superlatif memerlukan bukti yang dapat diverifikasi"}` |
| `OJK_CONS_009` | OJK声明不可省略 | `{"zh_CN":"所有素材必须包含正确的OJK监管声明","en_US":"All materials must include the correct OJK regulatory statement","id":"Semua materi harus menyertakan pernyataan regulasi OJK yang benar"}` |

---

## 四、正向建议（ruleType=SUGGESTION）—— 合规话术范例

| ruleCode | 说明 | 印尼语范例 | 中文参考 |
|----------|------|-----------|---------|
| `OJK_SUGG_001` | 低利率表述 | Bunga rendah mulai dari 0.01% | 低利率，最低从0.01%起 |
| `OJK_SUGG_002` | OJK监管声明 | Berizin dan diawasi oleh OJK | 已获许可并受OJK监管 |
| `OJK_SUGG_003` | 额度表述 | Limit pinjaman hingga 200 juta | 贷款额度最高2亿印尼盾 |
| `OJK_SUGG_004` | 分期表述 | Bisa dicicil sampai 12 bulan | 最长可分期12个月 |
| `OJK_SUGG_005` | 加急到账表述 | Bisa cair dalam 1 hari setelah persyaratan lengkap | 资料齐全后1天内到账 |
| `OJK_SUGG_006` | 流程表述 | Proses mudah dan tidak ribet | 流程简单便捷 |
| `OJK_SUGG_007` | 快速到账表述 | Pinjaman cepat cair | 贷款快速到账（附带条件） |
| `OJK_SUGG_008` | 担保表述 | Tanpa butuh jaminan | 无需抵押担保 |

---


## 五、参考信息（ruleType=REFERENCE）—— 合规话术集合

| ruleCode | 说明 | ruleContent |
|----------|------|-------------|
| `OJK_REF_001` | OJK合规话术正向范例集合 | 见下方 [六、导入JSON] 中 `OJK_REF_001` |

---

## 六、导入 JSON（Apollo `ai_suggestion.rule.import.json`）

---

# AI 内容伪装规则（基于历史稳定性分析）

> 日期：2026-08-21
> 数据来源：印尼 CUSTOMER_NEW 泳道 5032 条模板历史稳定性分析
> 所有规则 `ruleSource=AI_SUMMARY`，`materialType=BODY`
>
> **核心理念**：将营销文案伪装成系统通知发送，保留营销目的（额度、利率、时效等核心利益点），但用通知口吻包装。

---

## 一、背景结论

稳定模板（12.4%，覆盖 1386 条模板）均采用"系统通知"中立叙事风格，不包含催促行动表述。不稳定模板（87.6%）被降级的主要原因是：

- 直接使用营销祈使句（`Dapatkan`、`Sekarang`、`Cepat` 等）
- 包含情绪煽动类表情符号（😍🎉🤑 等）
- 按钮使用行动号召类营销话术（`Dapatkan Sekarang` 等）

---

## 二、风险词 vs 安全词

| 类型 | 词汇 | 说明 |
|------|------|------|
| 🔴 需伪装 | `Dapatkan`、`Sekarang`、`Cepat`、`Promo`、`Kesempatan` | 营销行动词，直接使用易触发降级 |
| 🟢 安全词 | `Sistem`、`Otomatis`、`Status`、`Log`、`Konfigurasi` | 系统事务性词汇，增加官方通知感知 |

---

## 三、规则明细

### SUGGESTION — 伪装策略指南

| ruleCode | 规则 | ruleContent |
|----------|------|-------------|
| `AI_SUGG_000` | 整体伪装策略 | 将营销文案伪装成系统通知。策略：1) 用"系统检测到/已为您准备"替代"快来领取"；2) 用"状态通知/额度提醒"替代"促销活动"；3) 保留核心利益点（额度、利率、时效）但用陈述句表述；4) 按钮文案改为"查看状态/了解详情"但仍导向转化页面 |
| `AI_SUGG_001` | 推荐安全词汇 | 推荐使用 `Sistem`/`Otomatis`/`Status`/`Log`/`Konfigurasi` 等系统事务性词汇，增加官方通知感知 |
| `AI_SUGG_002` | 添加中立免责声明 | 推荐添加 `Semua fasilitas tunduk pada syarat ketentuan kredit, kecepatan pencairan tidak dijamin mutlak` 免责声明 |
| `AI_SUGG_003` | 陈述句式 | 全部使用陈述句描述客观状态，将行动号召隐含在信息告知中 |

### CONSTRAINT — 软约束

| ruleCode | 规则 | ruleContent |
|----------|------|-------------|
| `AI_CONS_001` | 风险词伪装 | 将 `Dapatkan`/`Sekarang`/`Cepat`/`Promo`/`Kesempatan` 伪装为 `tersedia`/`status`/`konfigurasi` 等中性词 |
| `AI_CONS_002` | 表情符号限制 | 优先使用 📢✅⚠️ 中性通知表情，避免 😍🎉🤑 等情绪类表情 |
| `AI_CONS_003` | 按钮文案伪装 | 按钮避免直接行动号召（`Dapatkan Sekarang`/`Klaim`），伪装为 `Lihat Status Akun`/`Periksa Detail Saldo`/`Buka Aplikasi` |

---

## 四、导入 JSON（Apollo `ai_suggestion.rule.import.json`）

---

# AI 生成行为规则（GENERATE）

> 日期：2026-08-24
> 所有规则 `ruleSource=GENERATE`，控制 AI 生成行为本身的格式约束
> `suggestType=GENERAL` 适用于所有建议类型

---

## 规则明细

### CONSTRAINT — 必须满足

| ruleCode | 规则 | ruleContent |
|----------|------|-------------|
| `GEN_CONS_001` | 变量必须保留 | `{"zh_CN":"原文中的{{1}}、{{2}}等模板变量必须全部保留，数量和顺序不能改变，不能增删或替换为具体值","en_US":"All template variables like {{1}}, {{2}} in the original text must be preserved. Count and order must not change. Do not add, remove, or replace with concrete values","id":"Semua variabel template seperti {{1}}, {{2}} dalam teks asli harus dipertahankan. Jumlah dan urutan tidak boleh berubah. Jangan menambah, menghapus, atau mengganti dengan nilai konkret"}` |
| `GEN_CONS_002` | 数字数据保真 | `{"zh_CN":"原文中的数字（额度、利率、百分比、金额、期限等）必须与原内容完全一致，不能修改任何数值","en_US":"All numbers in the original text (loan limits, interest rates, percentages, amounts, tenors) must remain identical. Do not modify any numeric values","id":"Semua angka dalam teks asli (limit pinjaman, suku bunga, persentase, jumlah, tenor) harus tetap identik. Jangan mengubah nilai numerik apa pun"}` |
| `GEN_CONS_003` | 链接/URL 保留 | `{"zh_CN":"原文中包含的链接或 URL 必须完整保留，不能丢失、截断或变更","en_US":"All links or URLs in the original text must be preserved completely. Do not lose, truncate, or alter them","id":"Semua tautan atau URL dalam teks asli harus dipertahankan sepenuhnya. Jangan menghilangkan, memotong, atau mengubahnya"}` |
| `GEN_CONS_004` | 字符长度硬性限制 | `{"zh_CN":"生成内容的字符长度必须严格控制在原文的 ±10% 范围内，不得超过，超出视为不合格","en_US":"Generated content character length MUST stay within ±10% of the original text. Exceeding this limit is considered unqualified","id":"Panjang karakter konten yang dihasilkan HARUS dalam rentang ±10% dari teks asli. Melebihi batas ini dianggap tidak memenuhi syarat"}` |

### SUGGESTION — 正向建议

| ruleCode | 规则 | ruleContent |
|----------|------|-------------|
| `GEN_SUGG_001` | emoji 数量一致 | `{"zh_CN":"生成内容的 emoji 数量应与原文保持一致，允许按伪装规则替换具体 emoji 但不要增减数量","en_US":"The number of emojis in generated content should match the original. Specific emojis may be replaced per disguise rules, but do not change the count","id":"Jumlah emoji dalam konten yang dihasilkan harus sesuai dengan aslinya. Emoji tertentu dapat diganti sesuai aturan penyamaran, tetapi jangan mengubah jumlahnya"}` |
| `GEN_SUGG_002` | 段落结构保持一致 | `{"zh_CN":"生成内容的段落结构和换行位置应与原文保持一致，原文有 N 个换行的位置生成后也应有对应的换行","en_US":"Paragraph structure and line breaks in generated content should mirror the original. Each line break in the original should have a corresponding one in the output","id":"Struktur paragraf dan posisi baris baru dalam konten yang dihasilkan harus mencerminkan aslinya. Setiap baris baru dalam aslinya harus memiliki yang sesuai dalam keluaran"}` |

---

## 变量规则（COST_FIRST 专用）

| ruleCode | 规则 | ruleContent |
|----------|------|-------------|
| `GEN_COST_001` | 词汇变量比约束 | `{"zh_CN":"正文词汇总数必须大于变量总数的3倍以上，确保每条消息有足够的实质内容而非仅有变量填充","en_US":"Total word count must be at least 3 times the number of variables, ensuring sufficient substantive content beyond variable placeholders","id":"Jumlah total kata harus minimal 3 kali lipat jumlah variabel, memastikan konten substantif yang cukup di luar placeholder variabel"}` |

---

# 导入 JSON（Apollo `ai_suggestion.rule.import.json`）

---

## 全部规则导入 JSON（Apollo `ai_suggestion.rule.import.json`）

共 27 条规则（14 OJK + 6 伪装 + 7 生成）。

```json
[
  {
    "ruleCode": "OJK_REDLINE_001",
    "ruleName": "禁止使用'可信赖'等保证性词汇",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "RED_LINE",
    "ruleContent": {
      "zh_CN": "禁止使用'可信赖'等保证性词汇形容自身",
      "en_US": "Do not use assurance words like 'Trusted' to describe yourself",
      "id": "Jangan gunakan kata jaminan seperti 'Terpercaya'"
    },
    "priority": 1000,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_REDLINE_002",
    "ruleName": "禁止用'仅'修饰利率",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "RED_LINE",
    "ruleContent": {
      "zh_CN": "禁止用'仅'修饰利率。正确表述用'mulai dari'",
      "en_US": "Do not use 'only' to modify interest rates. Use 'starting from'",
      "id": "Jangan gunakan 'hanya' untuk memodifikasi suku bunga. Gunakan 'mulai dari'"
    },
    "priority": 1000,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_REDLINE_003",
    "ruleName": "禁止'OJK认证/OJK许可'等错误表述",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "RED_LINE",
    "ruleContent": {
      "zh_CN": "禁止使用'OJK认证/OJK许可/经OJK批准'。正确表述为'受OJK许可并监管'",
      "en_US": "Do not use 'certified by OJK'. Use 'licensed and supervised by OJK'",
      "id": "Jangan gunakan 'disertifikasi oleh OJK'. Gunakan 'berizin dan diawasi oleh OJK'"
    },
    "priority": 1000,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_REDLINE_004",
    "ruleName": "禁止使用'唯一'等最高级绝对化表述",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "RED_LINE",
    "ruleContent": {
      "zh_CN": "禁止使用'唯一'等最高级绝对化表述",
      "en_US": "Do not use absolute superlative terms like 'the only one'",
      "id": "Jangan gunakan istilah superlatif absolut seperti 'satu-satunya'"
    },
    "priority": 1000,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_REDLINE_005",
    "ruleName": "禁止使用'安全/有保障'等承诺性词汇",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "RED_LINE",
    "ruleContent": {
      "zh_CN": "禁止承诺'安全/有保障'，金融产品有风险",
      "en_US": "Do not promise 'safe/guaranteed'. Financial products carry risk",
      "id": "Jangan menjanjikan 'aman/terjamin'"
    },
    "priority": 999,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_REDLINE_016",
    "ruleName": "OJK声明禁止新增",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "RED_LINE",
    "ruleContent": {
      "zh_CN": "这是绝对红线：1) 如果原文中不包含任何OJK/监管/免责相关声明，生成内容中绝对不能新增；2) 如果原文中已包含，则必须遵守OJK_CONS_001和OJK_CONS_002的格式要求",
      "en_US": "RED LINE: 1) If the original text does NOT contain any OJK/regulatory/disclaimer statement, NEVER add one; 2) If the original text already contains one, MUST follow OJK_CONS_001 and OJK_CONS_002 format requirements",
      "id": "GARIS MERAH: 1) Jika teks asli TIDAK mengandung pernyataan OJK/regulasi/disclaimer, JANGAN PERNAH menambahkannya; 2) Jika teks asli sudah mengandungnya, HARUS mengikuti persyaratan format OJK_CONS_001 dan OJK_CONS_002"
    },
    "priority": 1000,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_CONS_001",
    "ruleName": "OJK监管声明必须完整",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "必须使用完整短语'已获得许可并受金融服务管理局(OJK)监管'，不可单独出现'OJK'",
      "en_US": "Must use complete phrase 'licensed and supervised by the Financial Services Authority (OJK)'",
      "id": "Harus menggunakan frasa lengkap 'berizin dan diawasi oleh Otoritas Jasa Keuangan (OJK)'"
    },
    "priority": 900,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_CONS_002",
    "ruleName": "OJK声明文字格式一致性",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "监管声明中所有文字同字体同字号同颜色，OJK不可加粗",
      "en_US": "All text must use same font type, size, and color. 'OJK' must not be bolded",
      "id": "Semua teks harus menggunakan jenis font, ukuran, dan warna yang sama"
    },
    "priority": 899,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_CONS_003",
    "ruleName": "利率/额度/期限必须用范围修饰词",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "利率用'mulai dari'，额度上限用'hingga'，分期期限用'sampai/hingga'，不可用绝对数值",
      "en_US": "Interest rates use 'starting from', loan limits use 'up to', tenors use 'up to'. No absolute values",
      "id": "Suku bunga gunakan 'mulai dari', batas pinjaman gunakan 'hingga', tenor gunakan 'sampai/hingga'"
    },
    "priority": 890,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_CONS_004",
    "ruleName": "快速到账必须附带条件",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "承诺快速/即时到账时必须附带条件说明，如'资料齐全后X天内处理'",
      "en_US": "Fast disbursement must include conditions",
      "id": "Pencairan cepat harus menyertakan ketentuan"
    },
    "priority": 880,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_CONS_005",
    "ruleName": "禁止误导与夸大宣传",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "不得使用'最/第一/最好/唯一'等最高级绝对化表述，不得夸大宣传或引导无理借贷",
      "en_US": "Do not use absolute superlatives. Do not exaggerate or encourage irrational borrowing",
      "id": "Jangan gunakan superlatif absolut. Jangan melebih-lebihkan"
    },
    "priority": 870,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_CONS_006",
    "ruleName": "必须包含完整费用说明",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "贷款文案必须清晰说明费用构成：利息+服务费+风险缓解费",
      "en_US": "Loan copy must state fee components: interest + service fee + risk mitigation fee",
      "id": "Teks pinjaman harus menjelaskan komponen biaya: bunga + biaya layanan + biaya mitigasi risiko"
    },
    "priority": 860,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_CONS_007",
    "ruleName": "信息必须真实准确完整",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "所有信息必须准确、诚实、清晰，不得误导。必须展示产品风险和缺点",
      "en_US": "All information must be accurate, honest, and clear. Must disclose product risks",
      "id": "Semua informasi harus akurat, jujur, dan jelas. Harus mengungkapkan risiko produk"
    },
    "priority": 850,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "OJK_REF_001",
    "ruleName": "OJK合规话术正向范例集合",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "BUSINESS",
    "ruleType": "REFERENCE",
    "ruleContent": {
      "zh_CN": "合规话术范例：低利率从0.01%起、已获许可并受OJK监管、贷款额度最高可达X、最长可分期X个月、流程简单便捷、无需抵押担保、资料齐全后X天内到账",
      "en_US": "Compliant copy examples: Low interest rates from 0.01%, Licensed and supervised by OJK, Loan limit up to X, Payable in installments up to X months, Easy and hassle-free process, No collateral required, Processed within X days after complete documentation",
      "id": "Contoh teks patuh: Bunga rendah mulai dari 0.01%, Berizin dan diawasi oleh OJK, Limit pinjaman hingga X, Bisa dicicil sampai X bulan, Proses mudah dan tidak ribet, Tanpa butuh jaminan, Cair dalam X hari setelah persyaratan lengkap"
    },
    "priority": 500,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "AI_SUGG_000",
    "ruleName": "营销伪装整体策略指南",
    "sourceLane": "CUSTOMER_NEW",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "AI_SUMMARY",
    "ruleType": "SUGGESTION",
    "ruleContent": {
      "zh_CN": "将营销文案伪装成系统通知。策略：1)用'系统检测到/已为您准备'替代'快来领取'；2)用'状态通知/额度提醒'替代'促销活动'；3)保留核心利益点（额度、利率、时效）但用陈述句表述；4)按钮文案改为'查看状态/了解详情'但仍导向转化页面",
      "en_US": "Disguise marketing copy as system notification. Strategy: 1) Use 'System detected/Prepared for you' instead of 'Come get it'; 2) Use 'Status notification/Limit reminder' instead of 'Promotion'; 3) Keep core benefits (limit, rate, speed) in declarative form; 4) Button text changed to 'View status/Details' but still link to conversion page",
      "id": "Samarkan teks pemasaran sebagai notifikasi sistem. Strategi: 1) Gunakan 'Sistem mendeteksi/Telah disiapkan' alih-alih 'Ayo dapatkan'; 2) Gunakan 'Notifikasi status/Pengingat limit' alih-alih 'Promo'; 3) Pertahankan manfaat inti (limit, suku bunga, kecepatan) dalam bentuk deklaratif; 4) Teks tombol diubah menjadi 'Lihat status/Detail' namun tetap mengarah ke halaman konversi"
    },
    "priority": 900,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "AI_SUGG_001",
    "ruleName": "推荐使用系统事务性安全词汇",
    "sourceLane": "CUSTOMER_NEW",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "AI_SUMMARY",
    "ruleType": "SUGGESTION",
    "ruleContent": {
      "zh_CN": "推荐使用'Sistem/Otomatis/Status/Log/Konfigurasi'等系统事务性词汇，增加官方通知感知",
      "en_US": "Use system transactional words like 'System/Automatic/Status/Log/Configuration'",
      "id": "Gunakan kata transaksional sistem seperti 'Sistem/Otomatis/Status/Log/Konfigurasi'"
    },
    "priority": 850,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "AI_SUGG_002",
    "ruleName": "添加中立免责声明",
    "sourceLane": "CUSTOMER_NEW",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "AI_SUMMARY",
    "ruleType": "SUGGESTION",
    "ruleContent": {
      "zh_CN": "推荐添加中立免责声明，如'Semua fasilitas tunduk pada syarat ketentuan kredit, kecepatan pencairan tidak dijamin mutlak'",
      "en_US": "Add neutral disclaimer: 'All facilities subject to credit terms, disbursement speed not absolutely guaranteed'",
      "id": "Tambahkan disclaimer netral: 'Semua fasilitas tunduk pada syarat ketentuan kredit, kecepatan pencairan tidak dijamin mutlak'"
    },
    "priority": 849,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "AI_SUGG_003",
    "ruleName": "使用陈述句隐含行动号召",
    "sourceLane": "CUSTOMER_NEW",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "AI_SUMMARY",
    "ruleType": "SUGGESTION",
    "ruleContent": {
      "zh_CN": "全部使用陈述句描述客观状态，将行动号召隐含在信息告知中，禁止直接使用祈使句催促用户行动",
      "en_US": "Use declarative sentences describing objective state. Imply call-to-action within informational text. No imperative sentences urging immediate action",
      "id": "Gunakan kalimat deklaratif yang menggambarkan keadaan objektif. Sampaikan ajakan bertindak secara tersirat dalam teks informasi. Jangan gunakan kalimat imperatif"
    },
    "priority": 848,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "AI_CONS_001",
    "ruleName": "风险词伪装为中性词",
    "sourceLane": "CUSTOMER_NEW",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "AI_SUMMARY",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "将'Dapatkan/Sekarang/Cepat/Promo/Kesempatan'等营销行动词伪装为'tersedia/status/konfigurasi'等系统中性词",
      "en_US": "Disguise marketing action words like 'Get/Now/Fast/Promo/Opportunity' as neutral system words like 'available/status/configuration'",
      "id": "Samarkan kata pemasaran seperti 'Dapatkan/Sekarang/Cepat/Promo/Kesempatan' menjadi kata sistem netral seperti 'tersedia/status/konfigurasi'"
    },
    "priority": 800,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "AI_CONS_002",
    "ruleName": "表情符号优先使用中性通知类",
    "sourceLane": "CUSTOMER_NEW",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "AI_SUMMARY",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "优先使用📢✅⚠️等中性通知表情，避免使用😍🎉🤑等情绪类表情符号",
      "en_US": "Prefer neutral notification emojis like 📢✅⚠️. Avoid emotional emojis like 😍🎉🤑",
      "id": "Utamakan emoji notifikasi netral seperti 📢✅⚠️. Hindari emoji emosional seperti 😍🎉🤑"
    },
    "priority": 799,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "GEN_CONS_001",
    "ruleName": "模板变量必须保留",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "GENERAL",
    "ruleType": "RED_LINE",
    "ruleContent": {
      "zh_CN": "原文中的{{1}}、{{2}}等模板变量必须全部保留，数量和顺序不能改变，不能增删或替换为具体值",
      "en_US": "All template variables like {{1}}, {{2}} in the original text must be preserved. Count and order must not change",
      "id": "Semua variabel template seperti {{1}}, {{2}} dalam teks asli harus dipertahankan. Jumlah dan urutan tidak boleh berubah"
    },
    "priority": 950,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "GEN_CONS_002",
    "ruleName": "数字数据保真",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "GENERAL",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "原文中的数字（额度、利率、百分比、金额、期限等）必须与原内容完全一致，不能修改任何数值",
      "en_US": "All numbers in the original text (loan limits, interest rates, percentages, amounts, tenors) must remain identical",
      "id": "Semua angka dalam teks asli (limit pinjaman, suku bunga, persentase, jumlah, tenor) harus tetap identik"
    },
    "priority": 949,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "GEN_CONS_003",
    "ruleName": "链接URL保留",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "GENERAL",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "原文中包含的链接或 URL 必须完整保留，不能丢失、截断或变更",
      "en_US": "All links or URLs must be preserved completely",
      "id": "Semua tautan atau URL harus dipertahankan sepenuhnya"
    },
    "priority": 948,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "GEN_CONS_004",
    "ruleName": "字符长度严格控制在原文±10%",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "GENERAL",
    "ruleType": "RED_LINE",
    "ruleContent": {
      "zh_CN": "生成内容的字符长度应控制在原文的 ±10% 范围内，不得超过，超出视为不合格",
      "en_US": "Generated content character length should stay within ±10% of the original text",
      "id": "Panjang karakter konten yang dihasilkan harus dalam rentang ±10% dari teks asli"
    },
    "priority": 1000,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "GEN_SUGG_001",
    "ruleName": "emoji数量保持一致",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "GENERAL",
    "ruleType": "SUGGESTION",
    "ruleContent": {
      "zh_CN": "生成内容的 emoji 数量应与原文保持一致，允许按伪装规则替换具体 emoji 但不要增减数量",
      "en_US": "The number of emojis should match the original. Specific emojis may be replaced per disguise rules",
      "id": "Jumlah emoji harus sesuai dengan aslinya. Emoji tertentu dapat diganti sesuai aturan penyamaran"
    },
    "priority": 850,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "GEN_SUGG_002",
    "ruleName": "段落结构保持一致",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "GENERAL",
    "ruleType": "SUGGESTION",
    "ruleContent": {
      "zh_CN": "生成内容的段落结构和换行位置应与原文保持一致",
      "en_US": "Paragraph structure and line breaks should mirror the original",
      "id": "Struktur paragraf dan posisi baris baru harus mencerminkan aslinya"
    },
    "priority": 849,
    "enabled": 1,
    "operator": "admin"
  },
  {
    "ruleCode": "GEN_COST_001",
    "ruleName": "词汇变量比约束(COST_FIRST)",
    "sourceLane": "ALL",
    "materialType": "BODY",
    "suggestType": "COST_FIRST",
    "ruleSource": "GENERAL",
    "ruleType": "CONSTRAINT",
    "ruleContent": {
      "zh_CN": "正文词汇总数必须大于变量总数的3倍以上，确保每条消息有足够的实质内容而非仅有变量填充",
      "en_US": "Total word count must be at least 3 times the number of variables, ensuring sufficient substantive content",
      "id": "Jumlah total kata harus minimal 3 kali lipat jumlah variabel, memastikan konten substantif yang cukup"
    },
    "priority": 940,
    "enabled": 1,
    "operator": "admin"
  }
]
```
