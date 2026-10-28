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

# 0920_AI备用素材模板去掉复制优惠码按钮
- [ ] 背景：复制优惠码按钮（COPY_CODE）只能用于营销模板（MARKETING），是 LTO 限时优惠模板的配套按钮
- [ ] 待办：AI 备用素材模板中要去掉复制优惠码按钮（模板生成时不允许带 COPY_CODE 按钮）

# 0924_test3素材模板生成子模板缺少LTO排查结论
- [ ] 现象：素材模板 `zlc_0924_001`（ID 628）生成子模板后，`components` 中没有 `LIMITED_TIME_OFFER`
- [ ] 数据结论：素材组合正常，组合 2194/2195 均为 `LTO`，且 `limited_time_offer_material_id` 分别为 `6ab485c63c4b3127f26e56b8` / `6ab485c63c4b3127f26e56b9`
- [ ] Mongo 结论：LTO 素材存在且状态 `ACTIVE`，`element.type=LIMITED_TIME_OFFER`，`element.limited_time_offer` 结构完整
- [ ] 子模板证据：模板 5961/5962 引用组合 2194，`material_template_type=LTO`，但 `components` 无 `LIMITED_TIME_OFFER`
- [ ] 关系表证据：模板 5961/5962 的 `message_material_template` 只有 `HEADER`、`BODY`、`BUTTONS`，没有 `LIMITED_TIME_OFFER`
- [ ] 代码结论：当前 `test3` 分支 `CreateTemplateForLevelJobService` 缺少 LTO 组装逻辑，不读取 `limitedTimeOfferMaterialId`，不查询 LTO 素材，不把 LTO element 加入 `components`，也不保存 LTO 素材关系
- [ ] 回归点：`test3` 分支 merge 提交 `c00f895d6939169e7c1ea630919bb5f54c2da72c` 解决 `CreateTemplateForLevelJobService.java` 冲突时采用了缺少 LTO 逻辑的版本
- [ ] 对比：`feature/zlc/0904-limited-time-offer` 分支包含完整 LTO 读取、组装、关系保存逻辑
- [ ] 待办：将 LTO 逻辑重新合入 `test3`，同时保留 `test3` 上 experiment tier / utility template 相关改动


# 1012_模板详情页语言显示未回显

# 1013_有轮播图时普通body为空, 但是有head, 可以创建素材模板(是否需要再加校验)
- [ ] 只有head的模板能否创建成功

# 1014_message_template_waba记录模板创建失败原因
- [ ] 背景：线上 job 调第三方（ycloud 等）创建模板失败时，`message_template_waba.status` 被置为 `CREATEFAIL`，但表里没有任何字段记录失败原因（`ext` 已被轮播卡头图 mediaId 占用），只能翻日志按 traceId 找 `[ConfigEngine] POST response` / `[YCloudTemplate] createTemplate error` 才能看到原因
- [ ] 目标：希望库里 / 后台能直接看到失败原因，不用再翻线上日志
- [ ] 方案候选：`message_template_waba` 新增 `fail_reason` 字段（或复用 `ext`），二选一待定
- [ ] 落点：`CreateMsgTemplateJobService#updateMessageTemplateId` 判定 CREATEFAIL 时，把 provider 返回的 error body（ycloud 为 `error.code` / `error.message`）写入该字段
- [ ] 涉及改动：`MessageTemplateWaba` 实体、`message_template_waba` 表结构、`updateTemplateId` 相关写入、后台/接口展示
- [ ] 约束：新增字段需符合建表规范（not null 带默认值、必须有 create_time/update_time、create_time 加索引），表结构变更需评审
- [ ] 待确认：最终方案（新增字段 vs 复用 ext）、改动范围，确认后再动代码
