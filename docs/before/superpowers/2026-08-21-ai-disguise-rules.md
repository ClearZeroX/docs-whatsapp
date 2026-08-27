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

```json
[
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
  }
]
```
