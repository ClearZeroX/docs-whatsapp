# RULE IMPORT JSON

```json
{
  "action": "IMPORT",
  "target": "RULE",
  "items": {
    "rules": [
      {
        "materialCategoryCode": "repaid-loan-renewal",
        "name": "结清后复贷品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于结清后复贷品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 repaid-loan-renewal（结清后复贷）；不符合时跳过。",
        "isRequired": 0,
        "sort": 10
      },
      {
        "materialCategoryCode": "loan-application-reactivation",
        "name": "申请推进与未借款召回品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于申请推进与未借款召回品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 loan-application-reactivation（申请推进与未借款召回）；不符合时跳过。",
        "isRequired": 0,
        "sort": 20
      },
      {
        "materialCategoryCode": "first-loan-interest-free",
        "name": "首贷免息提款品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于首贷免息提款品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 first-loan-interest-free（首贷免息提款）；不符合时跳过。",
        "isRequired": 0,
        "sort": 30
      },
      {
        "materialCategoryCode": "credit-limit-offer",
        "name": "额度提升与借款定价品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于额度提升与借款定价品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 credit-limit-offer（额度提升与借款定价）；不符合时跳过。",
        "isRequired": 0,
        "sort": 40
      },
      {
        "materialCategoryCode": "loan-interest-voucher",
        "name": "贷款利息优惠券品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于贷款利息优惠券品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 loan-interest-voucher（贷款利息优惠券）；不符合时跳过。",
        "isRequired": 0,
        "sort": 50
      },
      {
        "materialCategoryCode": "loan-due-reminder",
        "name": "还款到期提醒品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于还款到期提醒品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 loan-due-reminder（还款到期提醒）；不符合时跳过。",
        "isRequired": 0,
        "sort": 60
      },
      {
        "materialCategoryCode": "overdue-repayment-arrangement",
        "name": "逾期催收与还款协商品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于逾期催收与还款协商品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 overdue-repayment-arrangement（逾期催收与还款协商）；不符合时跳过。",
        "isRequired": 0,
        "sort": 70
      },
      {
        "materialCategoryCode": "auto-debit-enablement",
        "name": "自动扣款开通品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于自动扣款开通品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 auto-debit-enablement（自动扣款开通）；不符合时跳过。",
        "isRequired": 0,
        "sort": 80
      },
      {
        "materialCategoryCode": "account-periodic-review",
        "name": "账户周期审核通知品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于账户周期审核通知品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 account-periodic-review（账户周期审核通知）；不符合时跳过。",
        "isRequired": 0,
        "sort": 90
      }
    ]
  }
}
```
