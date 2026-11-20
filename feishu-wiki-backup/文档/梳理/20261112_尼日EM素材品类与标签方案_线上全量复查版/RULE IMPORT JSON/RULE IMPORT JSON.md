# RULE IMPORT JSON

尼日EM线上全量正文复核后的导入包。

```json
{
  "action": "IMPORT",
  "target": "RULE",
  "items": {
    "rules": [
      {
        "materialCategoryCode": "loan-due-today",
        "name": "今日到期还款提醒品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于今日到期还款提醒品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 loan-due-today（今日到期还款提醒）；不符合时跳过。",
        "isRequired": 0,
        "sort": 10
      },
      {
        "materialCategoryCode": "available-funds-invitation",
        "name": "可用额度支用邀请品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于可用额度支用邀请品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 available-funds-invitation（可用额度支用邀请）；不符合时跳过。",
        "isRequired": 0,
        "sort": 20
      },
      {
        "materialCategoryCode": "three-day-interest-free-offer",
        "name": "三日免息优惠品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于三日免息优惠品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 three-day-interest-free-offer（三日免息优惠）；不符合时跳过。",
        "isRequired": 0,
        "sort": 30
      },
      {
        "materialCategoryCode": "credit-limit-cash-offer",
        "name": "额度提升与现金支用优惠品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于额度提升与现金支用优惠品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 credit-limit-cash-offer（额度提升与现金支用优惠）；不符合时跳过。",
        "isRequired": 0,
        "sort": 40
      },
      {
        "materialCategoryCode": "overdue-repayment-collection",
        "name": "逾期还款催收品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于逾期还款催收品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 overdue-repayment-collection（逾期还款催收）；不符合时跳过。",
        "isRequired": 0,
        "sort": 50
      },
      {
        "materialCategoryCode": "bvn-completion-benefit",
        "name": "BVN补全与额度权益品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于BVN补全与额度权益品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 bvn-completion-benefit（BVN补全与额度权益）；不符合时跳过。",
        "isRequired": 0,
        "sort": 60
      },
      {
        "materialCategoryCode": "multiple-loan-eligibility",
        "name": "多笔借款资格与使用品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于多笔借款资格与使用品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 multiple-loan-eligibility（多笔借款资格与使用）；不符合时跳过。",
        "isRequired": 0,
        "sort": 70
      },
      {
        "materialCategoryCode": "multiple-loan-expiry",
        "name": "多笔借款资格到期品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于多笔借款资格到期品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 multiple-loan-expiry（多笔借款资格到期）；不符合时跳过。",
        "isRequired": 0,
        "sort": 80
      },
      {
        "materialCategoryCode": "loan-discount-voucher",
        "name": "贷款利息折扣券品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于贷款利息折扣券品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 loan-discount-voucher（贷款利息折扣券）；不符合时跳过。",
        "isRequired": 0,
        "sort": 90
      },
      {
        "materialCategoryCode": "fifteen-day-interest-free-offer",
        "name": "十五日免息优惠品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于十五日免息优惠品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 fifteen-day-interest-free-offer（十五日免息优惠）；不符合时跳过。",
        "isRequired": 0,
        "sort": 100
      },
      {
        "materialCategoryCode": "loan-due-tomorrow",
        "name": "明日到期还款提醒品类打标规则",
        "promptDesc": "【适用】以素材内容判断是否属于明日到期还款提醒品类打标，materialCategoryCode 仅作参考，不作为执行条件。符合时使用本规则，产出标签归入 loan-due-tomorrow（明日到期还款提醒）；不符合时跳过。",
        "isRequired": 0,
        "sort": 110
      }
    ]
  }
}
```
