# MessageMaterialController#create 和 update 接口流程梳理

> 生成日期：2026-08-26  
> 范围：`com.opay.occ.whatsapp.api.controller.admin.MessageMaterialController#create`、`update` 以及同步链路中涉及的数据写入/更新。  
> 说明：未分析 `.trae` 目录。字段名以代码中的实体/Mongo Model/MyBatis 默认驼峰转下划线映射为准；部分建表 SQL 在仓库中未找到完整版本，文档中已标明“代码字段/推断字段”。

## 1. 入口与调用关系

### 1.1 Controller

代码位置：

- `whatsapp-crm-api/src/main/java/com/opay/occ/whatsapp/api/controller/admin/MessageMaterialController.java`

类级路径：

- `@RequestMapping(WebConstants.ADMIN_API_PREFIX + "/material")`
- `WebConstants.ADMIN_API_PREFIX = "/admin/api/"`

方法级路径：

| 接口 | Controller 方法 | 入参 | 返回 |
| --- | --- | --- | --- |
| `POST /material/create`（前缀来自 `ADMIN_API_PREFIX`） | `create(@Valid @RequestBody MessageMaterialGroupCreateReqDTO materialCreateReqDTO)` | `MessageMaterialGroupCreateReqDTO` | `Result<Long>`，返回素材组 ID |
| `POST /material/update`（前缀来自 `ADMIN_API_PREFIX`） | `update(@Valid @RequestBody MessageMaterialGroupCreateReqDTO materialCreateReqDTO)` | `MessageMaterialGroupCreateReqDTO` | `Result<Boolean>`，固定返回 `true` |

Controller 本身不做业务处理，只做：

1. 读取请求体并触发 `@Valid` 校验。
2. 通过 `AuthUtil.getCurrentUserName()` 取得当前操作人。
3. 调用 `MessageMaterialGroupService#create` 或 `MessageMaterialGroupService#update`。
4. 用 `Results.success(...)` 包装返回值。

### 1.2 核心 Service 调用链

代码位置：

- `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/impl/MessageMaterialGroupServiceImpl.java`
- `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/mongo/service/impl/MessageMaterialServiceImpl.java`
- `whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/service/impl/MessageMaterialGroupLaneServiceImpl.java`

核心调用链：

```text
MessageMaterialController#create
  -> MessageMaterialGroupServiceImpl#create
     -> validateMaterialGroupName
     -> validateMaterial
     -> validateCombinationMode
     -> validateLaneConfig
     -> message_material_group insert
     -> MessageMaterialServiceImpl#insertBatch -> Mongo collection message_material insert
     -> saveLaneConfig -> message_material_group_lane delete + batch insert
     -> generateManualMaterialCombinations / generateMaterialCombinations -> message_material_combination batch insert
     -> TagExtractServiceImpl#sendExtractTagMessage（按开关发 MQ）
     -> AiMaterialSuggestionBackfillService#backfill（按开关更新 ai_material_suggestion）
     -> triggerAiBackupCreation（按开关发 MQ）

MessageMaterialController#update
  -> MessageMaterialGroupServiceImpl#update
     -> validateMaterial
     -> validateCombinationMode
     -> validateLaneConfig
     -> message_material_group updateById
     -> checkAtLeastOneBodyMaterial
     -> processMaterialStatusChanges
        -> Mongo message_material status 更新
        -> message_material_combination 状态/素材状态联动更新
     -> MessageMaterialServiceImpl#updateBatch -> Mongo collection message_material 插入新增 header/body/footer
     -> updateManualMaterialCombinations / generateMaterialCombinationsByUpdate
        -> message_material_combination 更新/插入
     -> saveLaneConfig -> message_material_group_lane delete + batch insert
     -> TagExtractServiceImpl#sendExtractTagMessage（按开关发 MQ）
     -> AiMaterialSuggestionBackfillService#backfill（按开关更新 ai_material_suggestion）
     -> triggerAiBackupCreation（按开关发 MQ）
```

## 2. 请求 DTO 字段

### 2.1 `MessageMaterialGroupCreateReqDTO`

代码位置：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/dto/request/MessageMaterialGroupCreateReqDTO.java`

| 字段 | 类型 | create 使用 | update 使用 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | `Long` | 不使用 | 必须有实际素材组 ID；用于 `selectById`、校验、更新、生成组合 | 代码中没有显式 null 检查，update 时为空会导致后续异常风险 |
| `templateType` | `String` | 写入 `message_material_group.template_type` | 更新 `message_material_group.template_type` | 模板类型 |
| `language` | `String` | 写入 `message_material_group.language` | 更新 `message_material_group.language` | 语言 |
| `name` | `String` | 校验重名，写入 `message_material_group.name` | 当前 update 不更新 name，也不做重名校验 | create 时必须唯一 |
| `status` | `String` | 不直接写入，create 固定写 `NOT_ENABLED` | 不更新素材组 status | 素材组状态不是由该字段控制 |
| `headerList` | `List<MessageMaterialReqDTO>` | 插入新 HEADER 素材；参与组合 | 新增 blank id 的 HEADER；已有 id 只参与状态/组合处理 | |
| `bodyList` | `List<MessageMaterialReqDTO>` | 插入新 BODY 素材；create 要求 bodyList 非空 | 新增 blank id 的 BODY；已有 id 只参与状态/组合处理 | BODY `subType` 固定保存为 `TEXT` |
| `footerList` | `List<MessageMaterialReqDTO>` | 插入新 FOOTER 素材；参与组合 | 新增 blank id 的 FOOTER；已有 id 只参与状态/组合处理 | |
| `buttons` | `MessageMaterialReqDTO` | 若不为空则插入 BUTTONS 素材；参与组合 | 参与状态处理和组合引用；`updateBatch` 不插入新 buttons | 代码注释说明 buttons 不支持修改，需替换时应另建一组，但当前 updateBatch 没有保存新 buttons 的逻辑 |
| `laneConfigList` | `List<MaterialLaneConfigDTO>` | 必填；保存车道配置 | 必填；不能移除历史已存在车道；保存时仍整体删除再重插 | |
| `combinationMode` | `String` | 空则默认 `RANDOM`；可为 `RANDOM`/`MANUAL` | 空则默认 `RANDOM`；不允许从历史 `MANUAL` 改为 `RANDOM` | `MANUAL` 时 `manualCombinations` 必填 |
| `manualCombinations` | `List<ManualCombinationDTO>` | `MANUAL` 模式下必填并插入组合 | `MANUAL` 模式下必填并更新/插入/停用组合 | |

### 2.2 `MessageMaterialReqDTO`

代码位置：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/dto/request/MessageMaterialReqDTO.java`

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `String` | Mongo `message_material._id` 字符串。空表示新增素材；非空表示已有素材 |
| `status` | `String`，默认 `ACTIVE` | update 中用于目标素材状态；枚举来自 `MaterialStatusEnum`：`ACTIVE`、`PAUSED`、`DELETED` |
| `type` | `String` | 主要给 AI 建议回填匹配 `ai_material_suggestion.material_type` 使用；实际保存素材类型由所在 list 决定 |
| `subType` | `String` | HEADER/FOOTER 保存到 Mongo `message_material.subType`；BODY/BUTTONS 保存为 `TEXT` |
| `element` | `OpayTemplateComponent` | 保存到 Mongo `message_material.element`，承载模板组件内容 |
| `confirmDisableCombination` | `Boolean`，默认 `false` | update 时素材目标状态为 `DELETED` 时使用；为 `true` 会把使用该素材的组合 `status` 也置为 `INACTIVE` |
| `tempKey` | `String` | MANUAL 模式中新素材被手工组合引用时的前端临时 key；素材插入后映射为真实 Mongo id |
| `clientMaterialKey` | `String` | AI 建议回填用；匹配 `ai_material_suggestion.client_material_key` |

### 2.3 `MaterialLaneConfigDTO`

代码位置：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/dto/request/MaterialLaneConfigDTO.java`

| 字段 | 类型 | 保存字段 |
| --- | --- | --- |
| `sourceLane` | `String` | `message_material_group_lane.source_lane` |
| `estimatedSendCount` | `Integer` | `message_material_group_lane.estimated_send_count` |

校验规则：

- `laneConfigList` 不能为空。
- `sourceLane` 不能为空，且必须能被 `SourceLaneEnum.fromCode` 识别。
- `estimatedSendCount` 必须大于 0。
- 同一次请求内 `sourceLane` 不能重复。
- update 时，数据库已有的 lane 不能在新请求中被移除。

### 2.4 `ManualCombinationDTO`

代码位置：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/dto/request/ManualCombinationDTO.java`

| 字段 | 类型 | 保存/更新字段 |
| --- | --- | --- |
| `id` | `Long` | 已有组合 ID，对应 `message_material_combination.id`；为空表示新增组合 |
| `headerMaterialRef` | `String` | 解析为 `message_material_combination.header_material_id` |
| `bodyMaterialRef` | `String` | 必填，解析为 `message_material_combination.body_material_id` |
| `footerMaterialRef` | `String` | 解析为 `message_material_combination.footer_material_id` |
| `buttonsMaterialRef` | `String` | 解析为 `message_material_combination.buttons_material_id` |
| `status` | `String` | update 时仅支持把已有 `ACTIVE` 组合置为 `INACTIVE`；不支持通过该字段从 `INACTIVE` 恢复为 `ACTIVE` |

`xxxMaterialRef` 可以是已有 Mongo 素材 id，也可以是同次请求新增素材的 `tempKey`。

## 3. 涉及表/集合与字段

### 3.1 MySQL：`message_material_group`

实体：`MessageMaterialGroup`  
代码位置：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/po/MessageMaterialGroup.java`

| 字段/列 | 类型来源 | create 写入 | update 写入 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | `Long` / `AUTO` | DB 自增生成 | 作为更新主键 | 返回给前端的素材组 ID |
| `name` | `String` | 请求 `name` | 不更新 | create 前按 name 查重 |
| `template_type` | `String` | 请求 `templateType` | 请求 `templateType` | MyBatis 驼峰转下划线 |
| `language` | `String` | 请求 `language` | 请求 `language` | |
| `status` | `String` | 固定 `NOT_ENABLED` | 不更新 | 枚举 `MaterialGroupStatusEnum`：`NOT_ENABLED`、`ENABLED`、`DISABLED` 等 |
| `creator` | `String` | 当前操作人 | 不更新 | |
| `updater` | `String` | 当前操作人 | 当前操作人 | |
| `ctime` | `Long` | `System.currentTimeMillis()` | 不更新 | |
| `utime` | `Long` | `System.currentTimeMillis()` | `System.currentTimeMillis()` | |
| `related_tasks` | `String` | 不写 | 不写 | 其他流程维护 |
| `combination_mode` | `String` | 请求 `combinationMode`，为空默认 `RANDOM` | 请求 `combinationMode`，为空默认 `RANDOM` | 枚举 `MaterialCombinationModeEnum`：`RANDOM`/`MANUAL` |
| `primary_group_id` | `Long` | 当前 create 不写 | 当前 update 不写 | AI backup 扩展字段 |
| `ai_source_lane` | `String` | 当前 create 不写 | 当前 update 不写 | AI backup 扩展字段 |
| `source_type` | `Integer` | 当前 create 不写 | 当前 update 不写 | AI backup 扩展字段；AI 自动生成备份组时为 `1` |
| `ai_suggest_type` | `String` | 当前 create 不写 | 当前 update 不写 | AI backup 扩展字段 |

### 3.2 MongoDB：`message_material`

模型：`MessageMaterial`  
代码位置：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/mongo/model/MessageMaterial.java`

| 字段 | 类型来源 | create 写入 | update 写入/更新 | 说明 |
| --- | --- | --- | --- | --- |
| `_id` / `id` | `ObjectId` | Mongo 生成 | 用于查询/状态更新 | DTO 中表现为字符串 `MessageMaterialReqDTO.id` |
| `materialGroupId` | `Long` | 新建素材组 ID | 当前素材组 ID | |
| `type` | `String` | 按 list 固定：`HEADER`/`BODY`/`FOOTER`/`BUTTONS` | 新增 HEADER/BODY/FOOTER 时写入；已有素材不改 type | 枚举来自 `OpayTemplateComponent.TemplateCommentTypeEnum` |
| `subType` | `String` | HEADER/FOOTER 使用请求 `subType`；BODY/BUTTONS 固定 `TEXT` | 新增 HEADER/FOOTER 使用请求 `subType`；新增 BODY 固定 `TEXT`；已有素材不改 subType | |
| `element` | `OpayTemplateComponent` | 请求中的 `element` | 新增素材时写入；已有素材不改 element | 保存模板组件内容 |
| `status` | `String` | 固定 `ACTIVE` | `processMaterialStatusChanges` 中按 DTO `status` 更新 | 枚举：`ACTIVE`、`PAUSED`、`DELETED` |
| `ctime` | `Long` | `System.currentTimeMillis()` | 新增素材时写；已有素材不改 | |
| `utime` | `Long` | `System.currentTimeMillis()` | 新增素材时写；状态变更时更新 | |
| `creator` | `String` | 当前操作人 | 新增素材时写；已有素材不改 | |
| `updater` | `String` | 当前操作人 | 新增素材时写；状态变更时更新 | |

`element` 的主要结构来自 `OpayTemplateComponent`：

| `element` 内字段 | 说明 |
| --- | --- |
| `type` | 组件类型：`HEADER`、`BODY`、`FOOTER`、`BUTTONS`、`CAROUSEL` |
| `format` | HEADER 格式：`TEXT`、`DOCUMENT`、`IMAGE`、`VIDEO` |
| `text` | 文本内容 |
| `example.header_handle` / `custom_header_handle_url` | HEADER 示例资源 |
| `example.header_text` / `header_text_variables` | HEADER 示例文本/变量名；create 时校验不能包含中文 |
| `example.body_text` / `body_text_variables` | BODY 示例文本/变量名；create 时校验不能包含中文 |
| `buttons` | 按钮列表，按钮类型包括 `QUICK_REPLY`、`URL`、`PHONE_NUMBER`、`COPY_CODE`、`FLOW`、`OTP` |
| `add_security_recommendation` / `code_expiration_minutes` | OTP/认证类模板相关字段 |
| `cards` | 轮播卡片组件 |

### 3.3 MySQL：`message_material_group_lane`

实体：`MessageMaterialGroupLane`  
代码位置：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/po/MessageMaterialGroupLane.java`  
Mapper XML：`whatsapp-crm-data/src/main/resources/mapper/MessageMaterialGroupLaneMapper.xml`

| 字段/列 | create 写入 | update 写入 | 说明 |
| --- | --- | --- | --- |
| `id` | DB 自增 | DB 自增 | `saveLaneList` 每次先按 `material_group_id` 删除旧行，再批量插入新行 |
| `material_group_id` | 新建素材组 ID | 当前素材组 ID | |
| `source_lane` | 请求 `laneConfigList[].sourceLane` | 请求 `laneConfigList[].sourceLane` | |
| `estimated_send_count` | 请求 `laneConfigList[].estimatedSendCount` | 请求 `laneConfigList[].estimatedSendCount` | |
| `creator` | 当前操作人 | 当前操作人 | 由于 update 是删除后重插，creator 会变成当前操作人 |
| `updater` | 当前操作人 | 当前操作人 | |
| `ctime` | `System.currentTimeMillis()` | `System.currentTimeMillis()` | 删除重插后会刷新 |
| `utime` | `System.currentTimeMillis()` | `System.currentTimeMillis()` | |

update 特别点：虽然保存时是“删除旧 lane + 插入新 lane”，但在删除前会校验：数据库中已有的每个 `source_lane` 必须继续出现在本次请求中，所以接口不允许通过 update 移除已有 lane。

### 3.4 MySQL：`message_material_combination`

实体：`MessageMaterialCombination`  
代码位置：`whatsapp-crm-data/src/main/java/com/opay/occ/whatsapp/data/entity/po/MessageMaterialCombination.java`  
建表参考：`doc/sql/message_material_combination.sql`，AI backup 扩展参考 `doc/sql/ai_backup_material_group.sql`。

| 字段/列 | create 写入 | update 写入/更新 | 说明 |
| --- | --- | --- | --- |
| `id` | DB 自增 | 作为已有组合更新主键 | |
| `material_group_id` | 新建素材组 ID | 当前素材组 ID | |
| `material_group_name` | 素材组 `name` | 新增组合时写素材组 `name`；已有组合更新时不改该字段 | 该字段在实体中存在；仓库中的 `doc/sql/message_material_combination.sql` 未包含，可能是后续线上 DDL 已补充 |
| `header_material_id` | 组合引用的 HEADER Mongo id，允许为空 | 随组合生成/手工编辑更新 | |
| `body_material_id` | 组合引用的 BODY Mongo id，create 正常要求有 BODY | 随组合生成/手工编辑更新 | MANUAL 模式下每个组合要求 `bodyMaterialRef` 必填 |
| `footer_material_id` | 组合引用的 FOOTER Mongo id，允许为空 | 随组合生成/手工编辑更新 | |
| `buttons_material_id` | 组合引用的 BUTTONS Mongo id，允许为空 | 随组合生成/手工编辑更新 | |
| `status` | 固定 `ACTIVE` | 可被置为 `INACTIVE`；新增/复用组合可置为 `ACTIVE` | 枚举 `MaterialCombinationStatusEnum`：`ACTIVE`、`INACTIVE` |
| `material_status` | create 固定 `NORMAL` | 素材被暂停/删除时置 `MATERIAL_PAUSED`；所有引用素材恢复 ACTIVE 时置 `NORMAL`；RANDOM 新增组合会按素材状态计算 | 枚举 `MaterialCombinationMaterialStatusEnum`：`NORMAL`、`MATERIAL_PAUSED` |
| `creator` | 当前操作人 | 新增组合时写当前操作人；已有组合不改 | |
| `updater` | 当前操作人 | 当前操作人 | |
| `ctime` | `System.currentTimeMillis()` | 新增组合时写；已有组合不改 | |
| `utime` | `System.currentTimeMillis()` | 更新/新增时写 | |
| `primary_combination_id` | 当前 create/update 主流程不写 | 当前 create/update 主流程不写 | AI backup 扩展字段 |
| `source_type` | 当前 create/update 主流程不写 | 当前 create/update 主流程不写 | AI backup 扩展字段；AI 备份组合为 `1` |

### 3.5 MySQL：`ai_material_suggestion`（可选回填）

触发位置：`AiMaterialSuggestionBackfillService#backfill`  
开关：`businessConfig.getAiSuggestionBackfillEnabled() == true`

当前 create/update 在素材保存后收集 header/body/footer（不包含 buttons），对每条带 `clientMaterialKey` 且已有 `id` 的素材执行更新：

| 匹配条件 | 更新字段 |
| --- | --- |
| `client_material_key = MessageMaterialReqDTO.clientMaterialKey` | `material_id = MessageMaterialReqDTO.id` |
| `material_type = MessageMaterialReqDTO.type` | `material_group_id = 当前素材组 ID` |
|  | `update_time = System.currentTimeMillis()` |

注意：该回填捕获异常后只记录日志，不影响主流程。

### 3.6 MQ：AI 标签提取与 AI 备份素材组创建

这两部分不是当前接口事务内的直接 DB 落库，但 create/update 会按开关触发：

| 触发点 | 开关/条件 | 行为 | 当前接口内是否直接改表 |
| --- | --- | --- | --- |
| `TagExtractServiceImpl#sendExtractTagMessage` | `businessConfig.getAiTagExtractConfig() == true` | 向 `businessConfig.rocketMqConfig.materialTagExtractConsumerTopic` 发送 `MaterialTagExtractMqMessage(materialGroupId)` | 否，消费端异步处理 |
| `triggerAiBackupCreation` | `aiBackupEnabled == true` 且 `aiBackupCreateAsync == true` | 向 `${AI_BACKUP_MATERIAL_GROUP_CREATE_TOPIC}` 发送包含 `materialGroupId`、`operator`、`timestamp` 的消息 | 否，消费端异步处理 |

AI 备份消费链路如果执行成功，会进一步使用 `AiBackupMaterialGroupServiceImpl#createAiBackupGroup`：

- 查询主素材组 `message_material_group`。
- 查询 `ai_material_suggestion` 中 `material_group_id = 主素材组ID` 且 `feedback_type = ADOPT` 的建议，按 `source_lane` 分组。
- 每个 lane 若无备份组则创建一条新的 `message_material_group`：
  - `name = 主素材组 name + "-AI-" + laneCode`
  - `template_type`、`language`、`combination_mode` 复制主素材组
  - `status = ACTIVE`
  - `primary_group_id = 主素材组 ID`
  - `ai_source_lane = laneCode`
  - `source_type = 1`
  - `creator/updater/ctime/utime` 写入
- 复制原组合中的 header/footer/buttons 素材到 Mongo `message_material`，并用 AI 建议内容新建 BODY 素材。
- 新增 `message_material_combination`：`material_group_id = 备份组 ID`、引用新素材 ID、`primary_combination_id = 原组合 ID`、`source_type = 1`、`status = ACTIVE`、`material_status = NORMAL`、审计字段写入。
- 写入 `ai_backup_material_update_log` 记录。

## 4. create 接口详细流程

### 4.1 事务

`MessageMaterialGroupServiceImpl#create` 标注 `@Transactional`。

### 4.2 校验阶段

1. `validateMaterialGroupName(name, false, null)`
   - 查询 `message_material_group`：`name = 请求 name limit 1`。
   - 存在则抛出 `ServiceException("name already exist")`。

2. `validateMaterial(materialCreateReqDTO, false)`
   - create 会调用 `validateExampleNoChinese`。
   - 遍历 `headerList`、`bodyList`、`footerList`、`buttons` 的 `element.example`：
     - `header_text`
     - `header_text_variables`
     - `body_text`
     - `body_text_variables`
   - 上述字段中任意非空字符串包含中文字符都会抛异常。
   - HEADER：仅统计 `id` 非空的请求项，`subType = NONE` 数量不能大于 1。
   - FOOTER：仅统计 `id` 非空的请求项，`subType = NONE` 数量不能大于 1。
   - create 时 `bodyList` 不能为空，否则抛出 `material template body can not be empty`。

3. `validateCombinationMode(materialCreateReqDTO, false, null)`
   - `combinationMode` 为空：通过，后续默认 `RANDOM`。
   - 非空但不是 `RANDOM`/`MANUAL`：抛异常。
   - `combinationMode = MANUAL` 且 `manualCombinations` 为空：抛异常。

4. `validateLaneConfig(laneConfigList, false, null)`
   - `laneConfigList` 不能为空。
   - 每项 `sourceLane` 不能为空，且必须在 `SourceLaneEnum` 中存在。
   - 每项 `estimatedSendCount > 0`。
   - 同一请求内 `sourceLane` 不能重复。

### 4.3 保存素材组：`message_material_group`

创建 `MessageMaterialGroup` 并执行 `baseMapper.insert(materialGroup)`。

字段写入：

| 字段/列 | 写入值 |
| --- | --- |
| `name` | 请求 `name` |
| `status` | `MaterialGroupStatusEnum.NOT_ENABLED.name()`，即 `NOT_ENABLED` |
| `language` | 请求 `language` |
| `template_type` | 请求 `templateType` |
| `combination_mode` | 请求 `combinationMode`；为空则 `RANDOM` |
| `creator` | 当前登录用户名 |
| `updater` | 当前登录用户名 |
| `ctime` | 当前毫秒时间戳 |
| `utime` | 当前毫秒时间戳 |

### 4.4 保存素材明细：Mongo `message_material`

调用 `MessageMaterialServiceImpl#insertBatch`。

#### HEADER

`saveHeaderList(headerList, materialGroupId, operator)`：

- 仅插入 `id` 为空的项。
- 每条插入后把 Mongo `_id` 回填到对应 DTO 的 `id`。

字段写入：

| Mongo 字段 | 写入值 |
| --- | --- |
| `materialGroupId` | 新建素材组 ID |
| `type` | `HEADER` |
| `subType` | 请求项 `subType` |
| `element` | 请求项 `element` |
| `status` | `ACTIVE` |
| `creator` | 当前登录用户名 |
| `updater` | 当前登录用户名 |
| `ctime` | 当前毫秒时间戳 |
| `utime` | 当前毫秒时间戳 |

#### BODY

`saveBodyList(bodyList, materialGroupId, operator)`：

| Mongo 字段 | 写入值 |
| --- | --- |
| `materialGroupId` | 新建素材组 ID |
| `type` | `BODY` |
| `subType` | 固定 `TEXT` |
| `element` | 请求项 `element` |
| `status` | `ACTIVE` |
| `creator` / `updater` | 当前登录用户名 |
| `ctime` / `utime` | 当前毫秒时间戳 |

#### FOOTER

`saveFooterList(footerList, materialGroupId, operator)`：

| Mongo 字段 | 写入值 |
| --- | --- |
| `materialGroupId` | 新建素材组 ID |
| `type` | `FOOTER` |
| `subType` | 请求项 `subType` |
| `element` | 请求项 `element` |
| `status` | `ACTIVE` |
| `creator` / `updater` | 当前登录用户名 |
| `ctime` / `utime` | 当前毫秒时间戳 |

#### BUTTONS

`saveButtonList(buttons, materialGroupId, operator)`：

| Mongo 字段 | 写入值 |
| --- | --- |
| `materialGroupId` | 新建素材组 ID |
| `type` | `BUTTONS` |
| `subType` | 固定 `TEXT` |
| `element` | 请求 `buttons.element` |
| `status` | `ACTIVE` |
| `creator` / `updater` | 当前登录用户名 |
| `ctime` / `utime` | 当前毫秒时间戳 |

### 4.5 保存 lane 配置：`message_material_group_lane`

调用 `saveLaneConfig`，内部再调用 `MessageMaterialGroupLaneServiceImpl#saveLaneList`。

`saveLaneList` 行为：

1. 先执行：`DELETE FROM message_material_group_lane WHERE material_group_id = ?`。
2. 再对请求中的 lane 批量插入。

字段写入：

| 字段/列 | 写入值 |
| --- | --- |
| `material_group_id` | 新建素材组 ID |
| `source_lane` | `laneConfigList[].sourceLane` |
| `estimated_send_count` | `laneConfigList[].estimatedSendCount` |
| `creator` | 当前登录用户名 |
| `updater` | 当前登录用户名 |
| `ctime` | 当前毫秒时间戳 |
| `utime` | 当前毫秒时间戳 |

### 4.6 生成组合：`message_material_combination`

#### 4.6.1 `RANDOM` 模式

触发条件：`combinationMode` 为空或为 `RANDOM`。

流程：

1. 从 `headerList`、`bodyList`、`footerList` 中取非空 `id`。
2. 从 `buttons.id` 取按钮素材 ID。
3. 如果 header/body/footer 某类为空，组合生成时用 `null` 占位。
4. 三层循环生成 `header × body × footer` 的笛卡尔积，buttons 作为同一个固定维度。
5. 批量插入 `message_material_combination`。

字段写入：

| 字段/列 | 写入值 |
| --- | --- |
| `material_group_id` | 新建素材组 ID |
| `material_group_name` | 素材组 `name` |
| `header_material_id` | HEADER Mongo id；无则 `null` |
| `body_material_id` | BODY Mongo id；无则 `null`，但 create 已要求 bodyList 非空 |
| `footer_material_id` | FOOTER Mongo id；无则 `null` |
| `buttons_material_id` | BUTTONS Mongo id；无则 `null` |
| `status` | `ACTIVE` |
| `material_status` | `NORMAL` |
| `creator` | 当前登录用户名 |
| `updater` | 当前登录用户名 |
| `ctime` | 当前毫秒时间戳 |
| `utime` | 当前毫秒时间戳 |

#### 4.6.2 `MANUAL` 模式

触发条件：`combinationMode = MANUAL`。

流程：

1. `buildTempKeyToIdMap`：把所有素材中同时存在 `tempKey` 和 `id` 的项映射为 `tempKey -> Mongo id`。
2. `validateManualCombinations`：
   - 每个组合必须有 `bodyMaterialRef`。
   - 每个非空 ref 必须出现在素材列表的 `id` 或 `tempKey` 中。
3. `resolveMaterialRef`：如果 ref 是 `tempKey`，转换为真实 Mongo id；否则直接使用 ref。
4. 批量插入 `message_material_combination`。

字段写入同 RANDOM 模式，区别是 `header/body/footer/buttons_material_id` 来自每条 `ManualCombinationDTO` 的 ref 解析结果。

### 4.7 后置动作

1. `tagExtractService.sendExtractTagMessage(materialGroupId)`
   - `businessConfig.getAiTagExtractConfig()` 为 true 时发送 MQ。
   - 当前接口不直接写标签表。

2. `aiMaterialSuggestionBackfillService.backfill(materialGroupId, allMaterials)`
   - 只收集 header/body/footer，不包含 buttons。
   - 按开关更新 `ai_material_suggestion.material_id`、`material_group_id`、`update_time`。
   - 异常吞掉并记录日志。

3. `triggerAiBackupCreation(materialGroupId, operator)`
   - `aiBackupEnabled` 和 `aiBackupCreateAsync` 同时为 true 时发送 MQ。
   - 当前事务内不直接创建备份组。

4. 返回 `materialGroup.getId()`。

## 5. update 接口详细流程

### 5.1 事务

`MessageMaterialGroupServiceImpl#update` 标注 `@Transactional(rollbackFor = Exception.class)`。

### 5.2 校验阶段

1. `validateMaterial(materialCreateReqDTO, true)`
   - update 不执行 `validateExampleNoChinese`，因此不会校验 example 中是否包含中文。
   - HEADER：仅统计 `id` 非空请求项中 `subType = NONE` 的数量，不能大于 1。
   - FOOTER：仅统计 `id` 非空请求项中 `subType = NONE` 的数量，不能大于 1。
   - 如果 HEADER/FOOTER 输入中存在一个 `NONE`，还会查询 Mongo 中当前素材组对应类型、`subType=NONE`、状态在 `ACTIVE/PAUSED` 的素材；查询结果为空则抛异常。

2. `validateCombinationMode(materialCreateReqDTO, true, materialCreateReqDTO.getId())`
   - 空值仍默认 `RANDOM`。
   - 非 `RANDOM`/`MANUAL` 抛异常。
   - 查询历史 `message_material_group`；如果历史为 `MANUAL`，本次传 `RANDOM`，抛出 `cannot switch from MANUAL to RANDOM combination mode`。
   - `MANUAL` 模式要求 `manualCombinations` 非空。

3. `validateLaneConfig(laneConfigList, true, materialGroupId)`
   - 同 create 的 lane 基础校验。
   - 额外查询 `message_material_group_lane` 中当前素材组已有 lane；已有的每个 `source_lane` 必须继续出现在请求中，否则抛出 `can not remove existing lane: xxx`。

### 5.3 更新素材组：`message_material_group`

先 `baseMapper.selectById(materialCreateReqDTO.getId())` 查询原素材组，再修改并 `updateById`。

字段更新：

| 字段/列 | 更新值 |
| --- | --- |
| `updater` | 当前登录用户名 |
| `utime` | 当前毫秒时间戳 |
| `language` | 请求 `language` |
| `template_type` | 请求 `templateType` |
| `combination_mode` | 请求 `combinationMode`；为空默认 `RANDOM` |

明确不更新的字段：

| 字段/列 | 说明 |
| --- | --- |
| `name` | update 不修改名称，也不做名称重复校验 |
| `status` | update 不修改素材组启用/停用状态 |
| `creator` / `ctime` | 保持原值 |
| `related_tasks` | 保持原值 |
| `primary_group_id` / `ai_source_lane` / `source_type` / `ai_suggest_type` | 保持原值 |

### 5.4 校验至少一个 BODY 可用

`checkAtLeastOneBodyMaterial`：

1. 如果 `bodyList` 中存在任意 `id` 为空的新 BODY，直接通过。
2. 否则，只看请求中已有 BODY（`id` 非空）的 `status`，要求至少一个为 `ACTIVE`。
3. 否则抛出 `material template body can not be empty`。

### 5.5 处理素材状态变化：Mongo `message_material` 与组合联动

调用 `processMaterialStatusChanges(materialCreateReqDTO, operator)`。

#### 5.5.1 收集素材与批量查询

- 收集 `headerList`、`bodyList`、`footerList`、`buttons` 中 `id` 非空的素材。
- 构建 `materialId -> targetStatus`。
- 调用 `messageMaterialService.queryByIds` 查询 Mongo：该方法按 1000 个 id 分批执行 `_id in (...)`，避免单次 in 过大。

#### 5.5.2 状态转换校验

对查到的当前素材执行：

| 当前状态 | 目标状态 | 结果 |
| --- | --- | --- |
| 与目标状态相同 | 相同 | 通过 |
| `DELETED` | 任意不同状态 | 抛出 `Material is already disabled and cannot be changed` |
| 其他 | 不同状态 | 通过，后续更新 |

#### 5.5.3 组合状态联动

对每个已有素材，如果当前状态与目标状态不同：

| 目标状态 | 组合处理 | Mongo 素材处理 |
| --- | --- | --- |
| `DELETED` 且 `confirmDisableCombination = true` | 查询所有引用该素材的组合；设置 `status = INACTIVE`、`material_status = MATERIAL_PAUSED`、`updater`、`utime` | 更新 `message_material.status = DELETED`、`updater`、`utime` |
| `DELETED` 且 `confirmDisableCombination != true` | 查询所有引用该素材的组合；只设置 `material_status = MATERIAL_PAUSED`、`updater`、`utime` | 更新 `message_material.status = DELETED`、`updater`、`utime` |
| `PAUSED` | 查询所有引用该素材的组合；只设置 `material_status = MATERIAL_PAUSED`、`updater`、`utime` | 更新 `message_material.status = PAUSED`、`updater`、`utime` |
| `ACTIVE` | 不先降级组合 | 更新 `message_material.status = ACTIVE`、`updater`、`utime` |

`findCombinationsUsingMaterial` 根据素材类型选择查询字段：

| 素材 `type` | 查询 `message_material_combination` 字段 |
| --- | --- |
| `HEADER` | `header_material_id = materialId` |
| `BODY` | `body_material_id = materialId` |
| `FOOTER` | `footer_material_id = materialId` |
| `BUTTONS` | `buttons_material_id = materialId` |

注意：该查询没有额外限制 `material_group_id`，因此理论上会影响所有引用同一素材 id 的组合。

#### 5.5.4 恢复组合素材状态

状态处理结束后调用 `changeCombinationMaterialToNormal(materialGroupId, operator)`：

1. 查询当前素材组 `material_status = MATERIAL_PAUSED` 的组合。
2. 收集这些组合中所有非空 `header/body/footer/buttons_material_id`。
3. 调用 `messageMaterialService.queryByIds` 分批查询 Mongo 素材状态。
4. 如果某个组合引用的所有素材都为 `ACTIVE`，则更新该组合：
   - `material_status = NORMAL`
   - `updater = 当前登录用户名`
   - `utime = 当前毫秒时间戳`

注意：这里不会把组合 `status` 从 `INACTIVE` 改回 `ACTIVE`。

### 5.6 新增素材：Mongo `message_material`

调用 `MessageMaterialServiceImpl#updateBatch`。

该方法实际只插入新增素材，不修改已有素材内容：

| 列表 | 行为 | 返回到 `MaterialIdAggregation` |
| --- | --- | --- |
| `headerList` | 插入 `id` 为空的 HEADER | `headIds` |
| `bodyList` | 插入 `id` 为空的 BODY | `bodyIds` |
| `footerList` | 插入 `id` 为空的 FOOTER | `footerIds` |
| `buttons` | 不处理 | 无 |

新增素材字段写入规则与 create 相同。

重要限制：已有素材的 `element`、`subType`、`type` 不会在 update 接口中更新；update 对已有素材主要只更新 `status/updater/utime`。

### 5.7 更新或生成组合：`message_material_combination`

#### 5.7.1 `MANUAL` 模式：`updateManualMaterialCombinations`

流程：

1. 构造 `tempKey -> Mongo id` 映射。
2. 校验每条手工组合：
   - `bodyMaterialRef` 必填。
   - 所有非空 ref 必须存在于素材列表的 `id` 或 `tempKey` 中。
3. 将请求中的组合拆分：
   - `id` 非空：前端传回的已有组合，放入 `frontendIdMap`。
   - `id` 为空：新组合，放入 `newCombos`。
4. 查询数据库中该素材组所有已有组合。
5. 遍历已有组合：
   - 如果请求中带了该组合 ID：
     - 若请求 `status = INACTIVE` 且数据库当前 `status = ACTIVE`，则置为 `INACTIVE`。
     - 更新 `header_material_id/body_material_id/footer_material_id/buttons_material_id`。
     - 更新 `updater/utime`。
   - 如果请求没带该组合 ID，但它的素材 key 与某个新组合一致：跳过停用，后续复用。
   - 如果请求没带该组合 ID，且也不会被复用：置为 `INACTIVE`，更新 `updater/utime`。
6. 遍历新组合：
   - 如果数据库里已有相同素材 key 的组合：复用该组合，设置 `status = ACTIVE`、`material_status = NORMAL`、更新素材引用、`updater/utime`。
   - 否则新增组合。

已有组合更新字段：

| 字段/列 | 更新规则 |
| --- | --- |
| `status` | 可能从 `ACTIVE` 改为 `INACTIVE`；复用新组合时可设回 `ACTIVE` |
| `material_status` | 复用新组合时设 `NORMAL`；一般已有组合编辑时不重新计算 |
| `header_material_id` | 按 `headerMaterialRef` 解析结果更新 |
| `body_material_id` | 按 `bodyMaterialRef` 解析结果更新 |
| `footer_material_id` | 按 `footerMaterialRef` 解析结果更新 |
| `buttons_material_id` | 按 `buttonsMaterialRef` 解析结果更新 |
| `updater` | 当前登录用户名 |
| `utime` | 当前毫秒时间戳 |

新增组合写入字段：

| 字段/列 | 写入值 |
| --- | --- |
| `material_group_id` | 当前素材组 ID |
| `material_group_name` | 当前素材组名称 |
| `header_material_id` / `body_material_id` / `footer_material_id` / `buttons_material_id` | ref 解析后的 Mongo id |
| `status` | `ACTIVE` |
| `material_status` | `NORMAL` |
| `creator` / `updater` | 当前登录用户名 |
| `ctime` / `utime` | 当前毫秒时间戳 |

#### 5.7.2 `RANDOM` 模式：`generateMaterialCombinationsByUpdate`

流程：

1. 如果本次没有新增 HEADER/BODY/FOOTER，则直接返回，不生成新组合。
2. 构建现有请求素材状态 map：
   - `headerId -> status`
   - `bodyId -> status`
   - `footerId -> status`
   - `buttons` 作为单个 `Pair<id, status>`
3. 把本次新增的 HEADER/BODY/FOOTER id 加入对应 map，状态按 `ACTIVE`。
4. 调用 `generateCombinationsForGroup` 生成所有候选笛卡尔组合。
5. 查询当前素材组已有组合，按 `header|body|footer|buttons` key 去重，只插入数据库不存在的新组合。

新增组合字段：

| 字段/列 | 写入值 |
| --- | --- |
| `material_group_id` | 当前素材组 ID |
| `material_group_name` | 当前素材组名称 |
| `header_material_id` / `body_material_id` / `footer_material_id` / `buttons_material_id` | 候选组合中的 Mongo id；空维度为 `null` |
| `status` | `ACTIVE` |
| `material_status` | 如果组合中任意素材状态是 `PAUSED` 或 `DELETED`，则 `MATERIAL_PAUSED`；否则 `NORMAL` |
| `creator` / `updater` | 当前登录用户名 |
| `ctime` / `utime` | 当前毫秒时间戳 |

### 5.8 保存 lane 配置

update 最后同样调用 `saveLaneConfig`：

1. 删除 `message_material_group_lane` 中当前素材组旧配置。
2. 批量插入本次请求的 `laneConfigList`。

字段写入同 create。由于是删除重插，`id/creator/ctime` 都会变成新值。

### 5.9 后置动作

与 create 相同：

1. 按开关发送 AI 标签提取 MQ。
2. 按开关回填 `ai_material_suggestion`。
3. 按开关发送 AI 备份素材组创建 MQ。
4. Controller 返回 `Result<Boolean>`，值为 `true`。

## 6. create 与 update 的关键差异

| 维度 | create | update |
| --- | --- | --- |
| 素材组名称 | 校验重名并写入 `name` | 不更新 `name`，不校验重名 |
| 素材组状态 | 固定写 `NOT_ENABLED` | 不修改素材组状态 |
| example 中文校验 | 会校验 | 不校验 |
| BODY 要求 | `bodyList` 不能为空 | 如果没有新增 BODY，则要求至少一个已有 BODY 的请求状态为 `ACTIVE` |
| lane | 必填，保存前删除同组旧数据再插入 | 必填，且不能移除已有 lane；保存仍删除重插 |
| 新增素材 | HEADER/BODY/FOOTER/BUTTONS 都会保存 | 只保存新增 HEADER/BODY/FOOTER；BUTTONS 不保存 |
| 已有素材内容 | 不涉及 | 不更新已有素材 `element/subType/type`，只处理状态 |
| 素材状态联动组合 | 不涉及，新增素材固定 `ACTIVE` | 会更新 Mongo 素材状态，并联动 `message_material_combination.status/material_status` |
| RANDOM 组合 | 全量按素材笛卡尔积插入 | 仅当有新增 HEADER/BODY/FOOTER 时生成缺失组合，不删除旧组合 |
| MANUAL 组合 | 按请求插入 | 可更新引用、停用未提交组合、复用或新增组合 |
| AI 建议回填 | header/body/footer 回填 | header/body/footer 回填 |

## 7. 主要异常/边界场景

| 场景 | 结果 |
| --- | --- |
| create 时素材组 `name` 已存在 | 抛 `name already exist` |
| `laneConfigList` 为空 | 抛 `lane config list can not be empty` |
| `sourceLane` 为空或不是 `SourceLaneEnum` | 抛异常 |
| `estimatedSendCount <= 0` | 抛 `estimated send count must be positive` |
| 同一请求内 lane 重复 | 抛 `duplicate source lane` |
| update 移除已有 lane | 抛 `can not remove existing lane` |
| `combinationMode` 非法 | 抛 `invalid combination mode` |
| `combinationMode = MANUAL` 但 `manualCombinations` 为空 | 抛 `manualCombinations cannot be empty when combinationMode is MANUAL` |
| 历史组合模式是 `MANUAL`，update 改成 `RANDOM` | 抛 `cannot switch from MANUAL to RANDOM combination mode` |
| create 时 `bodyList` 为空 | 抛 `material template body can not be empty` |
| update 时没有新增 BODY，且没有任何已有 BODY 的请求状态是 `ACTIVE` | 抛 `material template body can not be empty` |
| update 将已 `DELETED` 素材改成其他状态 | 抛 `Material is already disabled and cannot be changed` |
| 手工组合 `bodyMaterialRef` 为空 | 抛 `bodyMaterialRef is required in each manual combination` |
| 手工组合引用的 ref 不在素材列表 `id/tempKey` 中 | 抛 `material ref not found in material list` |

## 8. 代码层面需要特别注意的点

1. update 不会更新素材组 `name`。
2. update 不会更新已有 Mongo 素材的 `element/subType/type`，只会插入新素材和修改已有素材状态。
3. update 的 `MessageMaterialServiceImpl#updateBatch` 不处理 `buttons`，因此请求里传一个新的 blank-id buttons 不会被保存。
4. update 保存 lane 时是删除重插；虽然不允许移除已有 lane，但 `id/creator/ctime` 会刷新。
5. 素材状态改成 `PAUSED` 或 `DELETED` 会联动组合 `material_status = MATERIAL_PAUSED`；只有 `DELETED + confirmDisableCombination=true` 才会额外把组合 `status` 设为 `INACTIVE`。
6. `changeCombinationMaterialToNormal` 只恢复 `material_status = NORMAL`，不恢复组合 `status`。
7. 查询 Mongo 素材 `queryByIds` 已按 1000 分批，避免一次性 in 过大。
8. RANDOM 模式 update 只新增缺失组合，不删除历史组合，也不会重新全量计算已有组合状态。
9. AI 标签提取和 AI 备份创建是 MQ 异步动作；当前接口成功不代表异步消费一定成功。
