# Meta 模板分类机制与 Utility 改判 Marketing 规则

> 更新时间：2026-10-30  
> 内容范围：Meta 对 WhatsApp 消息模板的通用分类规则、Utility 改判 Marketing 的机制、分类查询与事件通知。  
> 说明：每条规则均附 Meta 官方英文原文、中文解释和原文链接。

## 一、模板分类概述

### 规则 1：模板分为 Marketing、Utility、Authentication

**英文原文**

> Message templates can be categorized as:
>
> - **Marketing templates** – Enable businesses to achieve a wide range of goals, from generating awareness to driving sales and retargeting customers.
> - **Utility templates** – Enable businesses to follow up on user actions or requests, since these messages are typically triggered by user actions.
> - **Authentication templates** – Enable businesses to verify a user's identity, potentially at various steps of the customer journey.

**中文解释**

Meta 将 WhatsApp 消息模板分为营销模板、实用模板和身份验证模板三类。模板分类由模板内容及 Meta 的分类规则决定。

**原文链接**

[Template categorization - Template category guidelines](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)

---

## 二、Marketing 模板规则

### 规则 2：混合内容和内容不明确的模板属于 Marketing

**英文原文**

> Marketing templates are the most flexible. They enable businesses to achieve a wide range of goals, from generating awareness to driving sales and more.
>
> The following templates are also considered marketing:
>
> - Templates with mixed content (for example, both utility and marketing, such as an order update with a promo or a feedback survey with promotional content).
> - Templates where contents are unclear (for example, where contents are only `{{1}}` or `Congratulations!`).

**中文解释**

以下情况会被判定为 Marketing：

- 模板混合了 Utility 内容和营销内容；
- 模板内容不明确，无法识别具体业务目的；
- 例如订单更新中夹带促销，或正文只有变量、祝贺语等。

**原文链接**

[Template categorization - Marketing template guidelines](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#marketing-template-guidelines)

---

### 规则 3：相似内容可能因精确内容不同而被分类为不同类型

**英文原文**

> Note: Examples are illustrative only. Templates that contain similar content, or the example text above, might be categorized differently based on the exact content.

**中文解释**

Meta 不承诺相似内容一定得到相同分类。模板是否属于 Marketing 或 Utility，需要根据精确内容判断。

**原文链接**

[Template categorization - Marketing template guidelines](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#marketing-template-guidelines)

---

## 三、Utility 模板规则

### 规则 4：Utility 必须是非营销的，并且与用户行为直接相关

**英文原文**

> Utility templates are typically triggered by a user action or request. For a template to be categorized as utility, it needs to meet both criteria below:
>
> - _Must_ be **non-promotional**, not containing any promotional or persuasive intent.
> - _Must_ ALSO be either **specific to or requested by the user** (clearly related to their order, account, services, or transactions) OR **essential or critical** to the user (for example, to ensure user safety).

**中文解释**

模板要被判定为 Utility，必须同时满足：

1. 不包含推广、说服或引导意图；
2. 并且必须与用户的具体订单、账户、服务、交易直接相关，或者属于对用户必要或关键的信息。

**原文链接**

[Template categorization - Utility template guidelines](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#utility-template-guidelines)

---

### 规则 5：订单和账户通知不得包含推广、推荐、追加销售、交叉销售、优惠或续费意图

**英文原文**

> **Order Management**  
> Confirm, update, or cancel an order or transaction with a customer, using specific order or transaction details in the body of your message.
>
> _These messages should not promote, recommend, upsell, or cross-sell products; include offers; or attempt to secure renewals._

> **Account Alerts or Updates**  
> Send important or time-sensitive updates or alerts or other information specific to purchased or subscribed products/services.
>
> _These messages should not promote, recommend, upsell, or cross-sell products; include offers; or attempt to secure renewals._

**中文解释**

订单管理或账户提醒模板不得包含：

- 产品或服务推广；
- 推荐、追加销售、交叉销售；
- 优惠信息；
- 续费引导或续费说服。

**原文链接**

[Template categorization - Utility template guidelines](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#utility-template-guidelines)

---

### 规则 6：反馈调查必须与具体订单、交易或互动相关

**英文原文**

> **Feedback Surveys**  
> Collect feedback on previous orders, transactions, or engagements with customers.
>
> _Specificity of the order or interaction to which these relate is necessary. A general/generic survey or request for feedback will not be approved as utility._

**中文解释**

反馈调查必须是针对用户此前的具体订单、交易或互动。泛化调查或泛化反馈请求不会被批准为 Utility。

**原文链接**

[Template categorization - Utility template guidelines](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#utility-template-guidelines)

---

### 规则 7：跨渠道继续对话必须由用户先请求转移到 WhatsApp

**英文原文**

> **Continue a Conversation on WhatsApp**  
> Send a message to begin an interaction on WhatsApp that began in another channel.
>
> _These messages should not be initiated without a user having requested the conversation to be moved to WhatsApp._

**中文解释**

如果模板用于在其他渠道对话后继续在 WhatsApp 沟通，必须是用户已经请求将对话转移到 WhatsApp。不能在用户未请求的情况下主动发起。

**原文链接**

[Template categorization - Utility template guidelines](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#utility-template-guidelines)

---

## 四、模板创建与分类判定

### 规则 8：模板名称不是唯一标识

**英文原文**

> Every template must have a name, but names are not unique. This flexibility allows you to create multiple templates with the same name, but in different languages.
>
> Template names are limited to a maximum of 512 characters, consisting of lowercase alphanumeric characters and underscores.

**中文解释**

Meta 明确允许同名模板存在。模板名称用于创建、查询、删除和区分语言版本，不是 Utility 或 Marketing 的分类分组标识。

**原文链接**

[Message templates - Names](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview#names)

---

### 规则 9：提交 Utility 后，Meta 可以按 Marketing 批准

**英文原文**

> Effective April 9, 2025, If you selected `UTILITY` as the template's category and WhatsApp determined it should be `MARKETING`, the template is approved as `MARKETING`. In WhatsApp Manager, you will see the screen below. When using the API, the behavior will be as outlined above. You can request a review up to 60 days from the date the category was updated.

**中文解释**

创建模板时提交 `UTILITY`，不代表最终分类一定是 Utility。Meta 会根据模板内容判断；如果认为应为 Marketing，模板可以以 `MARKETING` 分类批准。

**原文链接**

[Template categorization - Approved status](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#approved-status)

---

### 规则 10：allow_category_change 对应的改判行为已成为默认行为

**英文原文**

> Effective April 9, 2025 – The `allow_category_change` property during template creation. Previously, if set to `true` in a template creation request, this allowed us to update a template's category to `marketing`, if `marketing` to be its category was determined to be its category per its content and the guidelines. This is now the default behavior.

**中文解释**

`allow_category_change` 是模板创建请求中的字段，用于表示是否允许 Meta 根据模板内容调整分类。Meta 说明，Utility 按内容改判为 Marketing 的行为目前已经成为默认行为。

**原文链接**

[Template categorization - Approved status](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#approved-status)

---

### 规则 11：分类错误可能被拒绝，并返回 INCORRECT_CATEGORY

**英文原文**

> `REJECTED` status indicates that WhatsApp disagreed with the category you designated in your template creation request.
>
> Rejections are communicated via email and WhatsApp Manager alert. Upon review completion, a `message_template_status_update` webhook will be triggered and the `event` property set to `REJECTED`, with the `reason` property set to `INCORRECT_CATEGORY`.

**中文解释**

如果 Meta 不同意模板创建请求中的分类，模板可能被拒绝。状态回调会通过 `message_template_status_update` 通知，拒绝原因可能是 `INCORRECT_CATEGORY`。

**原文链接**

[Template categorization - Rejected status](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#rejected-status)

[message_template_status_update webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update)

---

## 五、模板批准后的自动分类更新

### 规则 12：Meta 会周期性扫描已批准模板并更新分类

**英文原文**

> July 1, 2024 — To ensure templates on the platform are correctly categorized per the template category guidelines, WhatsApp introduced a recurring process to identify and update approved templates that should be of a different category, per the template category guidelines.

**中文解释**

模板分类不只会在首次创建审核时确定。Meta 还会周期性检查已批准模板，并更新不符合分类规则的模板分类。

**原文链接**

[Template categorization - Automatic category updates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#automatic-category-updates)

---

### 规则 13：自动重分类同时关注模板创建内容和后续发送内容

**英文原文**

> Automatic category updates can apply to any approved template that does not meet the template category guidelines — either because the template was not initially approved per those guidelines, or because the messages the template sends do not meet them. This includes templates whose category was previously confirmed by a review.

**中文解释**

自动分类更新可能适用于以下模板：

- 创建时内容不符合分类规则；
- 后续实际发送的消息不符合分类规则；
- 之前经过 review 确认分类的模板。

**原文链接**

[Template categorization - Automatic category updates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#automatic-category-updates)

---

### 规则 14：Utility 更新为 Marketing 后，模板状态可以保持 APPROVED

**英文原文**

> Template category — The template category is changed to `MARKETING`  
> Template status — There is no change to template status; it remains `APPROVED` and can continue to be used to send messages.

**中文解释**

Utility 模板被更新为 Marketing 后，模板状态仍可能保持 `APPROVED`，并继续用于发送消息。

**原文链接**

[Template categorization - For templates approved as utility, but should actually be marketing](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)

---

### 规则 15：Meta 通过 template_category_update 通知分类变更

**英文原文**

> A `template_category_update` webhook will be triggered for each template whose category will be updated, with a `correct_category` property in the payload set to what the template's category should be. The `new_category` property also exists in the payload indicating the template's current category.

> A `template_category_update` webhook will be triggered for each template whose category has been updated. The `new_category` property will indicate the template's new category and the `previous_category` property will indicate the template's category before automatic update.

**中文解释**

分类相关字段：

- `correct_category`：Meta 认为正确的分类；
- `new_category`：当前或更新后的分类；
- `previous_category`：更新前的分类。

**原文链接**

[Template categorization - How you are notified](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)

[template_category_update webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/template_category_update)

---

### 规则 16：可以查询 category 和 correct_category 判断分类状态

**英文原文**

> Request the `category` and `correct_category` fields, which will return the IDs of all of the Messaging account's templates, and each template's `category` and `correct_category` values. You can then compare these values:
>
> - If the values match (for example, they are both `MARKETING`), the template's category has already been updated with the `correct_category` value.
> - If they mismatch and the `correct_category` is not an empty string or null (for example, category is `UTILITY` but `correct_category` is `MARKETING`), the template's category will be updated on the first day of the next month with the `correct_category` value.
> - If the `correct_category` value is an empty string or null, the template has not been impacted.

**中文解释**

查询方式：

```text
GET /<WHATSAPP_BUSINESS_ID>/message_templates?fields=category,correct_category
```

判断方式：

- `category` 与 `correct_category` 相同：分类已更新为正确分类；
- `category=UTILITY`、`correct_category=MARKETING`：Meta 已认定应改为 Marketing，计划在下一个月的第一天执行；
- `correct_category` 为空字符串或 null：模板未受影响。

**原文链接**

[Template categorization - Learn which templates will be updated or have been updated](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)

---

## 六、Utility 分类滥用的账号级限制

### 规则 17：Utility restriction 会将账号下所有已批准 Utility 模板改为 Marketing

**英文原文**

> **Utility restriction** — All approved utility templates on the Messaging account are recategorized to `MARKETING`. New utility template creation and category reviews are disabled. After the restriction period ends, these capabilities are restored.

**中文解释**

当 Messaging account 被判定存在 Utility 分类滥用并进入 Utility restriction 时，该账号下所有已批准的 Utility 模板都会被重新分类为 Marketing，同时停止新建 Utility 模板和分类 review。

**原文链接**

[Template categorization - Restrictions on businesses misusing the template categorization system](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#restrictions-on-businesses-misusing-the-template-categorization-system)

---

### 规则 18：Business portfolio 级别限制会覆盖所有关联 Messaging account

**英文原文**

> **Business portfolio level restriction** — If misuse persists across multiple Messaging accounts under the same Meta Business Suite, all approved utility templates across all Messaging accounts are recategorized to `MARKETING`. New utility template creation and category reviews are disabled across all Messaging accounts. After the restriction period ends, these capabilities are restored.

**中文解释**

如果分类滥用持续发生在同一 Meta Business Suite 下的多个 Messaging account，Meta 会将所有关联账号下已批准的 Utility 模板重新分类为 Marketing，并在所有账号范围内停止新建 Utility 模板和分类 review。

**原文链接**

[Template categorization - Restrictions on businesses misusing the template categorization system](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#restrictions-on-businesses-misusing-the-template-categorization-system)

---

## 七、官方资料汇总

- [Template categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)
- [Marketing template guidelines](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#marketing-template-guidelines)
- [Utility template guidelines](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#utility-template-guidelines)
- [Approved status](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#approved-status)
- [Rejected status](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#rejected-status)
- [Automatic category updates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#automatic-category-updates)
- [Restrictions on businesses misusing the template categorization system](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#restrictions-on-businesses-misusing-the-template-categorization-system)
- [Message templates - Names](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview#names)
- [template_category_update webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/template_category_update)
- [message_template_status_update webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update)
