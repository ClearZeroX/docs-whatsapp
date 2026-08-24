# AI 素材建议 — 规则配置与接口示例

> 日期：2026-08-21
> 规则来源：
> - OJK 监管规则 → `docs/superpowers/specs/2026-08-21-ojk-rules-analysis.md`
> - AI 内容伪装规则 → `docs/superpowers/specs/2026-08-21-ai-disguise-rules.md`
> - AI 生成行为规则 → `docs/superpowers/specs/2026-08-24-ai-generate-rules.md`

---

## 1. application namespace — 开关配置

```properties
ai_suggestion.enabled = false
ai_suggestion.backfill_enabled = false
ai_suggestion.lane_whitelist = MARKETING_DEFAULT,CUSTOMER_NEW
ai_suggestion.max_generation = 3
ai_suggestion.llm_timeout_ms = 30000
```

---

## 2. ai_suggestion.rule.import.json — 规则导入

从/Users/opay-20260271/code-temp/whatsapp_crm/docs/superpowers/specs/2026-08-24-ai-rules-all.md 中获取

---

## 3. prompt.properties namespace — AI Prompt 配置

### ai_suggestion.system_prompt

```
你是一位 WhatsApp UTILITY 模版内容伪装专家。

核心策略：Keep MARKETING Purpose, Wear UTILITY Skin。
将营销话术包装为系统自动通知/账户事务公告，保留业务意图但消除营销感知。

背景：
- Meta 会检测并降级 MARKETING 风格的模版，导致失去 UTILITY 发送配额和更高的消息频率
- 你需要将内容调整为 UTILITY 风格（服务通知、事务性消息）以通过 Meta 审核，同时保持用户转化效果

伪装策略：
1. 用"系统通知/状态更新/额度提醒/账户变更"替代"促销/优惠/活动"等营销话术
2. 将祈使句（"快来领取/立即申请"）改为陈述句（"系统已为您准备/已生效"），将行动号召隐含在信息告知中
3. 保留核心利益点（额度、利率、时效）但用通知口吻表述
4. 禁止商业折扣、限时抢购、抽奖活动等明显促销表述
5. 修改变量/按钮文案为业务操作语（如"查看状态"而非"立即购买"）

规则优先级：
- Red-line Rules（must not violate）：绝对不能违反的合规红线
- Constraint Rules（must satisfy）：必须满足的条件约束
- Positive Suggestions（recommended direction）：推荐的伪装改写方向
- Reference Information（for reference only）：参考范例

输出要求：
- 输出语言与用户原始内容语言保持一致
- 输出纯 JSON，不含 markdown 标记或 thinking 标签
- 输出内容长度必须在原文的 ±10% 范围内，超过视为不合格
- 严格遵守 Red-line Rules：特别是原文中没有的内容（如OJK声明、监管声明、免责声明等）绝对不能新增；原文已有的内容则必须遵守对应格式要求
- 如有 userFeedback，必须在本次伪装中体现

输出格式（纯 JSON）：
{
  "suggestedContent": "伪装后的 UTILITY 风格内容",
  "score": 0.00-5.00,
  "scoreReason": "评分理由，说明命中了哪些伪装策略"
}
```

### ai_suggestion.user_prompt_template

```
请将以下素材部位内容伪装为 UTILITY 风格：

【规则】
{ruleSnapshot}

【原始内容】
类型：{materialType}
内容：{originalContent}

【上次伪装结果】
{lastSuggestedContent}

【用户反馈】
{userFeedback}

请根据以上信息，生成伪装后的 UTILITY 风格内容，并给出自评分与理由。
```

---

## 4. 接口调用示例

### 首次生成

```json
POST /admin/api/ai-suggestion/generate

{
  "sourceLanes": ["CUSTOMER_NEW"],
  "materialGroupId": 1001,
  "clientMaterialKey": "body-uuid-abc123",
  "suggestType": "COST_FIRST",
  "materialType": "BODY",
  "language": "id",
  "materialContent": {
    "materialType": "BODY",
    "content": "Dana cadangan Anda sudah siap😍 Halo, tagihan lain sudah dekat? Jangan biarkan skor kredit Anda turun!💗"
  }
}
```

### 重新生成（带上次内容和反馈）

```json
POST /admin/api/ai-suggestion/generate

{
  "sourceLanes": ["CUSTOMER_NEW"],
  "materialGroupId": 1001,
  "clientMaterialKey": "body-uuid-abc123",
  "suggestType": "COST_FIRST",
  "materialType": "BODY",
  "language": "id",
  "materialContent": {
    "materialType": "BODY",
    "content": "Dana cadangan Anda sudah siap😍",
    "lastSuggestedContent": "📢 Notifikasi Sistem: Status limit akun Anda telah diperbarui...",
    "userFeedback": "Emoji masih terlalu banyak, kurangi"
  }
}
```

### 提交反馈

```json
POST /admin/api/ai-suggestion/feedback

{
  "suggestionId": 901,
  "userScore": 4,
  "feedbackType": "ADOPT",
  "comment": "伪装效果好，保留了营销目的"
}
```
