# TODO: 去掉 AiSuggestionFeedbackTypeEnum.RATE 枚举的影响分析

## 背景

当前 `AiSuggestionFeedbackTypeEnum` 有 4 个枚举值：

| 枚举 | code | 说明 |
|------|------|------|
| `RATE` | 1 | 纯打分，未选择采纳/不采纳 |
| `ADOPT` | 2 | 运营采纳 |
| `REJECT` | 3 | 运营不采纳 |
| `IGNORE` | 4 | 运营忽略 |

**核心问题：** 运营先采纳(ADOPT)、后打分，RATE 状态会覆盖 ADOPT 状态，导致采纳记录丢失。

**解决方案：** 去掉 RATE 枚举。打分和表态彻底分离——打分只更新 `userScore` 字段，不动 `feedbackType`/`status`；`feedbackType` 只用于 ADOPT/REJECT/IGNORE 三种明确表态。

## 影响范围

### 1. `AiSuggestionFeedbackTypeEnum` 枚举定义

- 文件：`whatsapp-crm-common/.../enums/AiSuggestionFeedbackTypeEnum.java`
- 操作：删除 `RATE(1, "Rated")` 行
- 影响：`fromName("RATE")` 将返回 null

### 2. `AiMaterialSuggestionServiceImpl.feedback()` 方法

- 文件：`whatsapp-crm-data/.../service/impl/AiMaterialSuggestionServiceImpl.java`
- 行：222-243（feedback 方法中处理 feedbackType 的逻辑）
- 当前逻辑：

```java
// 222-229: 有 feedbackType 时设置
if (StringUtils.isNotBlank(reqDTO.getFeedbackType())) {
    AiSuggestionFeedbackTypeEnum feedbackType = AiSuggestionFeedbackTypeEnum.fromName(reqDTO.getFeedbackType());
    if (feedbackType == null) {
        throw new ServiceException("Invalid feedback type: " + reqDTO.getFeedbackType());
    }
    record.setFeedbackType(feedbackType.getCode());
    record.setStatus(feedbackType.getCode());
}

// 238-243: 纯打分兜底 → 设为 RATE
if (StringUtils.isBlank(reqDTO.getFeedbackType())
        && (record.getFeedbackType() == null || record.getFeedbackType() == 0
            || record.getFeedbackType() == AiSuggestionFeedbackTypeEnum.RATE.getCode())) {
    record.setFeedbackType(AiSuggestionFeedbackTypeEnum.RATE.getCode());
    record.setStatus(AiSuggestionFeedbackTypeEnum.RATE.getCode());
}
```

- **改动：** 删除 238-243 行的 RATE 兜底逻辑。纯打分时只更新 `userScore`，不修改 `feedbackType` 和 `status`。

```java
// 改动后：删除 RATE 兜底逻辑，纯打分只更新 userScore
// 222-229 行不变（有 feedbackType 时正常设置）
// 删除 238-243 行
```

- **效果：** 先采纳再打分 → ADOPT 状态不被覆盖；先打分再采纳 → 正常设置 ADOPT

### 3. `AiBackupMaterialGroupServiceImpl.createAiBackupGroup()` 方法

- 文件：`whatsapp-crm-data/.../service/impl/AiBackupMaterialGroupServiceImpl.java`
- 行：85-86
- 当前逻辑：

```java
.eq(AiMaterialSuggestion::getFeedbackType, AiSuggestionFeedbackTypeEnum.ADOPT.getCode())
.eq(AiMaterialSuggestion::getStatus, AiSuggestionFeedbackTypeEnum.ADOPT.getCode())
```

- 影响：**无影响**。只用 ADOPT 过滤，不依赖 RATE。

### 4. 前端影响

- 打分和采纳/不采纳需要分开操作
- 只打分不动表态状态，采纳/不采纳单独操作
- 前端需确保运营明确选择采纳/不采纳后才能用于 AI 备用素材组

### 5. 数据库影响

- `ai_material_suggestion` 表中 `feedbackType=1`（RATE）的历史数据
- 处理方式：保留历史数据不动，code=1 仅作为历史标记

## 改动清单

| 文件 | 改动 |
|------|------|
| `AiSuggestionFeedbackTypeEnum.java` | 删除 `RATE(1, "Rated")` |
| `AiMaterialSuggestionServiceImpl.java` | 删除 feedback() 方法中第 238-243 行 RATE 兜底逻辑 |

## 结论

| 项目 | 结论 |
|------|------|
| 能否去掉 RATE | ✅ 可以，简单删除 2 处代码 |
| 对 AI 备用素材组影响 | 无 |
| 改动量 | 小（2 个文件，删除代码） |
| 风险 | 低，纯打分场景不再影响表态状态 |
