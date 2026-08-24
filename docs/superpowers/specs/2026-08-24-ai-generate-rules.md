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

## 导入 JSON（Apollo `ai_suggestion.rule.import.json`）

```json
[
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
