# 0828_优化op
- 完成状态: 已完成


# 0828_优化规则导入
- [ ] 代码逻辑：importFromConfig 导入规则时，已有规则匹配不能仅按 ruleCode 判断，需改为按 ruleCode + suggestType 联合判断
  - 从 JSON 中读取 suggestType（obj.getString("suggestType")）
  - 查询已有记录改为 lambdaQuery().eq(ruleCode).eq(suggestType).one()
- [ ] 移除唯一索引：ai_material_suggestion_rule 表的 uk_rule_code 唯一索引需移除（ruleCode 不再全局唯一），可改为 (rule_code, suggest_type) 联合唯一索引

# 0902_备用素材 компьют组合 materialStatus 未联动主用停止生成状态

- [ ] 背景：主用素材模版停止生成一个 body 后，主用对应 `message_material_combination.material_status` 变为 `MATERIAL_PAUSED`，但备用对应组合仍为 `NORMAL`
- [ ] 原因 1：`AiBackupMaterialGroupServiceImpl#fillBackupCombination` 固定写入 `materialStatus = NORMAL`，未跟随主用组合 `materialStatus`
- [ ] 原因 2：主用元素 `PAUSED` 后，当前只同步了备用素材 `message_material.status = PAUSED`，没有联动备用组合 `materialStatus`
- [ ] 修复：备用组合的 `materialStatus` 必须跟随主用组合最终状态
- [ ] 修复元素启停联动：主用元素 `PAUSED` / `ACTIVE` / `DELETED` 后，同步对应备用素材状态，并同步引用该素材的备用组合 `materialStatus`
- [ ] 主用组合 `status` 与备用组合保持一致；主用组合恢复 `NORMAL` 后，备用组合也恢复 `NORMAL`
- [ ] 发送侧过滤：备用组合必须 `status=ACTIVE`、`materialStatus=NORMAL`，引用素材不是 `DELETED`，body 元素内容不覆盖 AI 内容
