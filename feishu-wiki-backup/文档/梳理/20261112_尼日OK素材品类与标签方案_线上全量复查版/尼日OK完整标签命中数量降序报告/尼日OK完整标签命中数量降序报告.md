# 尼日OK完整标签命中数量降序报告

统计覆盖全部94条BODY所有状态：92条业务正文、2条人工复核。正文语义规则召回不是tag_relation绑定数，不代表效果。每条正文多标签可重叠；人工复核2条对所有业务标签均标记“待人工判定”，不是0命中；以下数字是已确认命中下界。

| 排名 | tagCode | 中文 / English | 已确认BODY命中 | groups | 待人工判定 |
|---|---|---|---|---|---|
| 1 | voucher:percentage-interest-discount | 百分比利息折扣券 / Percentage Interest Discount Voucher | 20 | 5 | 2 |
| 2 | auto-debit:settings-enablement | 设置自动扣款 / Enable Auto Debit in Settings | 17 | 9 | 2 |
| 3 | reactivation:registered-non-borrower | 注册未借款召回 / Registered Non-borrower Reactivation | 10 | 4 | 2 |
| 4 | overdue:interest-accrual | 逾期利息累积 / Overdue Interest Accrual | 9 | 5 | 2 |
| 5 | pricing:interest-fee-terms | 额度关联利费条款 / Credit-linked Interest and Fee Terms | 9 | 6 | 2 |
| 6 | collection:repayment-arrangement | 催收还款协商 / Collection Repayment Arrangement | 6 | 4 | 2 |
| 7 | application:bvn-completed | 已完成BVN待申请 / BVN Completed Awaiting Application | 4 | 2 | 2 |
| 8 | first-loan:no-extra-cost | 首贷无额外费用 / First Loan Without Extra Cost | 4 | 2 | 2 |
| 9 | first-loan:zero-interest | 首贷零利息 / Zero-interest First Loan | 4 | 2 | 2 |
| 10 | repayment:due-tomorrow | 贷款明日到期 / Loan Due Tomorrow | 4 | 2 | 2 |
| 11 | credit:temporary-limit-expiry | 临时额度到期 / Temporary Credit Limit Expiry | 3 | 2 | 2 |
| 12 | repayment:due-today | 贷款今日到期 / Loan Due Today | 3 | 1 | 2 |
| 13 | auto-debit:three-day-interest-coupon | 开通赠三日免息券 / Three-day Interest Coupon for Auto-debit Activation | 2 | 1 | 2 |
| 14 | renewal:account-reactivated | 结清后账户恢复 / Account Reactivated After Repayment | 2 | 2 | 2 |
| 15 | renewal:faster-approval | 复贷快速审批 / Faster Renewal Approval | 2 | 2 | 2 |
| 16 | voucher:interest-preferential-credit | 利息优惠券到账 / Interest-preferential Voucher Credited | 2 | 2 | 2 |
| 17 | account:no-action-required | 账户无需操作通知 / Account No-action-required Notice | 1 | 1 | 2 |
| 18 | account:periodic-review-completed | 周期审核完成 / Periodic Account Review Completed | 1 | 1 | 2 |

# 1. 高频误判审查

已逐条审核全部标签命中ID。今日/明日到期仅在本笔到期提醒语境命中；自动扣款中的due date不计入。优惠券只在优惠券主旨语境计数；开通自动扣款赠券不混入折扣券。不存在core/action通用匹配或其他待复核全量命中。

# 2. 前5 TAG IMPORT JSON

```json
{
  "action": "IMPORT",
  "target": "TAG",
  "items": {
    "tags": [
      {
        "code": "voucher:percentage-interest-discount",
        "name": "百分比利息折扣券 / Percentage Interest Discount Voucher",
        "aiDemoLevel": "good",
        "sourceType": 1,
        "sort": 90
      },
      {
        "code": "auto-debit:settings-enablement",
        "name": "设置自动扣款 / Enable Auto Debit in Settings",
        "aiDemoLevel": "good",
        "sourceType": 1,
        "sort": 150
      },
      {
        "code": "reactivation:registered-non-borrower",
        "name": "注册未借款召回 / Registered Non-borrower Reactivation",
        "aiDemoLevel": "good",
        "sourceType": 1,
        "sort": 40
      },
      {
        "code": "overdue:interest-accrual",
        "name": "逾期利息累积 / Overdue Interest Accrual",
        "aiDemoLevel": "good",
        "sourceType": 1,
        "sort": 130
      },
      {
        "code": "pricing:interest-fee-terms",
        "name": "额度关联利费条款 / Credit-linked Interest and Fee Terms",
        "aiDemoLevel": "good",
        "sourceType": 1,
        "sort": 80
      }
    ]
  }
}
```
