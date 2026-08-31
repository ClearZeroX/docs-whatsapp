# 0828_优化op
- 完成状态: 已完成


# 0828_优化规则导入
- [ ] 代码逻辑：importFromConfig 导入规则时，已有规则匹配不能仅按 ruleCode 判断，需改为按 ruleCode + suggestType 联合判断
  - 从 JSON 中读取 suggestType（obj.getString("suggestType")）
  - 查询已有记录改为 lambdaQuery().eq(ruleCode).eq(suggestType).one()
- [ ] 移除唯一索引：ai_material_suggestion_rule 表的 uk_rule_code 唯一索引需移除（ruleCode 不再全局唯一），可改为 (rule_code, suggest_type) 联合唯一索引
