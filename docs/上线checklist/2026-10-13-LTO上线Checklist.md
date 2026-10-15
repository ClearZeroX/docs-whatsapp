# LTO 上线 Checklist

> 日期：2026-10-13
> 功能：WhatsApp 限时优惠模板（Limited-Time Offer，LTO）
> 参考分支：`feature/zlc/0904-limited-time-offer-new`
> 说明：仅保留上线决策所需结论项。

---

## 1. 影响范围

### 1.1 发布内容

| # | 项 | 结论 |
|---|---|---|
| 1.1.1 | 发布模块 | `whatsapp-crm-common`、`whatsapp-crm-data`、`whatsapp-crm-openplatform`、`whatsapp-crm-api`、`whatsapp-crm-job`（同一版本一起发布） |
| 1.1.2 | 发布代码必须包含的 LTO 修复提交 | `3df7974ee`、`22c56e237`、`204470482`、`324b0f962`、`cd8260e46` |
| 1.1.3 | 发布基线约束 | 禁止把 `test3` / `origin/test3` 合入其他分支；禁止以 cherry-pick、复制等方式引入 `test3` 整体改动；merge 有冲突必须停下分析后再解决 |
| 1.1.4 | 发布范围确认 | 只包含 LTO 及必要适配，不包含无关大范围变更 |

### 1.2 功能影响

| # | 受影响功能 | 说明 |
|---|---|---|
| 1.2.1 | 素材模板（`message_material_group`） | 支持维护 LTO 素材；编辑时按当前 LTO 素材集合回填 LTO 组合；DELETED LTO 素材不参与 |
| 1.2.2 | 素材组合（`message_material_combination`） | 新增 LTO 组合类型（`material_template_type=LTO`），组合引用 LTO 素材；不同 LTO 素材的组合不再互相去重/覆盖 |
| 1.2.3 | 子模板生成（创建模板 job） | `components` 正确写入 `LIMITED_TIME_OFFER`；`message_material_template` 保存 `LIMITED_TIME_OFFER` 关系 |
| 1.2.4 | 三方模板创建 | 渠道能力校验前置：不支持的渠道跳过创建并记录日志，不再发起请求 |
| 1.2.5 | 自动 Utility | LTO 组合强制 `MARKETING`；含 `COPY_CODE` 的组合禁止生成 Utility |
| 1.2.6 | AI 备用素材组 | 备用组为 UTILITY，仅 NORMAL 组合；LTO / Carousel 不进入；混合按钮只剔除 `COPY_CODE`，保留 `URL`；纯 `COPY_CODE` 不复制 BUTTONS 素材 |
| 1.2.7 | 校验规则 | LTO 仅允许 MARKETING；最多一个 LTO；`text` ≤ 16；BODY 必填；FOOTER 禁止；HEADER 仅 IMAGE/VIDEO；ABSOLUTE 需 `expireAtMs`+`timezoneId` 且晚于当前时间；RELATIVE 需 `durationMillis > 0`；`hasExpiration=true` 按钮顺序必须 `COPY_CODE, URL` 且 `example` ≤ 15 |

### 1.3 渠道能力（决定哪些渠道会真正创建 LTO 模板）

| 渠道 | LTO | COPY_CODE |
|---|---|---|
| YCLOUD | 支持 | 支持 |
| NXCLOUD | 支持 | 支持 |
| GPI | 支持 | 支持 |
| EIGHTX8 | 不支持 | 支持 |
| ADA | 不支持 | 不支持 |

代码位置：

```text
能力定义：whatsapp-crm-common/.../enums/AgentEnum.java
          isLtoSupported() / isCopyCodeSupported()
统一判定：whatsapp-crm-data/.../util/TemplateProviderSupportUtil.java
          unsupportedReason(agent, components)
插件能力：whatsapp-openplatform/.../plugin/{ycloud,nxcloud,gpi}/*TemplatePlugin.java
          supportsTemplateComponent()
创建入口：whatsapp-openplatform/.../service/WriteProviderHandler.java
          supportsAllTemplateComponents() + unsupportedReason 校验
```

`EIGHTX8` / `ADA` 命中 LTO 时：不发三方请求，日志出现 `skip provider request due to unsupported provider capability`，模板状态记为失败。

### 1.4 不受影响（需回归）

NORMAL 组合、Carousel 模板、Utility 自动创建（非 LTO/非 COPY_CODE 组合）、AI 备用组的 NORMAL 链路、普通 MARKETING 模板创建与发送。

### 1.5 数据影响

| # | 项 | 结论 |
|---|---|---|
| 1.5.1 | 表结构变更 | 1 个新增字段，无存量数据迁移 |
| 1.5.2 | 存量组合 | 默认空值，行为不变 |
| 1.5.3 | 历史异常数据 | 曾因分支合并丢失 LTO 逻辑产生的“组合为 LTO 但子模板无 LTO 组件/关系”的历史模板，不直接改库，需评估重新生成 |

---

## 2. 数据库变更

### 2.1 DDL

脚本：`doc/sql/limited_time_offer.sql`

```sql
ALTER TABLE message_material_combination
    ADD COLUMN limited_time_offer_material_id varchar(64) NOT NULL DEFAULT '' COMMENT 'Limited-time offer material ID; empty means no limited-time offer component';
```

| # | 项 | 结论 |
|---|---|---|
| 2.1.1 | 变更表 | `message_material_combination`（素材组合） |
| 2.1.2 | 执行时机 | 应用发布**前**执行；测试 → 预发 → 生产 |
| 2.1.3 | 存量影响 | 默认 `''`，等同于无 LTO，行为不变 |
| 2.1.4 | 索引 | 无新增索引（现有查询走 `material_group_id`） |
| 2.1.5 | 回滚 | 不做 DDL 回滚；应用回滚后该字段保留，旧代码不读取，无副作用 |
| 2.1.6 | 执行前统计（如需回滚评估） | `SELECT COUNT(*) FROM message_material_combination WHERE limited_time_offer_material_id <> '';` |

### 2.2 验证

```sql
SHOW COLUMNS FROM message_material_combination LIKE 'limited_time_offer_material_id';
```

期望：`varchar(64)`、`Null=NO`、`Default=''`。

### 2.3 上线后数据校验（LTO 完整性）

```sql
SELECT COUNT(*) AS bad_cnt
FROM message_template t
JOIN message_material_combination c ON c.id = t.material_combination_id
WHERE c.material_template_type = 'LTO'
  AND t.create_time >= <上线时间戳>
  AND (t.components NOT LIKE '%LIMITED_TIME_OFFER%'
       OR NOT EXISTS (SELECT 1 FROM message_material_template mt
                      WHERE mt.message_template_id = t.id AND mt.type = 'LIMITED_TIME_OFFER'));
```

期望：`bad_cnt = 0`。

---

## 3. Apollo 配置（本需求相关）

| # | Key | 默认值 | 本需求相关性与要求 |
|---|---|---|---|
| 3.1 | `utility.auto.create.enabled` | `false` | 自动 Utility 总开关。**即使开启，LTO 组合也必须强制 MARKETING**（代码硬约束） |
| 3.2 | `utility.auto.create.all.material.group.enabled` | `false` | 全量素材模板参与自动 Utility。含 LTO 的素材模板需确认不会被生成 Utility |
| 3.3 | `utility.auto.create.material.group.ids` | `[]` | 白名单素材模板。若 LTO 素材模板在其中，验证该组只生成 MARKETING 子模板 |
| 3.4 | `utility.auto.create.max.attempts.per.combination` | `1` | 自动 Utility 重试次数。LTO/含 COPY_CODE 组合不消耗该额度 |

结论：

- **本需求无新增 LTO 专用 Apollo key。**
- 代码级硬约束不受开关影响：LTO 组合 → `MARKETING`；含 `COPY_CODE` 组合 → 不生成 Utility。

上线前必须确认（测试 / 预发 / 生产一致）：

- [ ] 3.1 ~ 3.4 现网取值已记录，与预期一致
- [ ] 开启自动 Utility 的环境下，用 LTO 素材模板验证生成结果是 `MARKETING` 且带 LTO 组件
- [ ] 含 `COPY_CODE` 的组合未生成 Utility 子模板

无需关注（本需求未改动，仅确认与现网一致）：`job.createTemplateForLevelJob.autoTempConfigs`、`job.createTemplateForLaneJobV2.*`。

---

## 4. 上线顺序

| 步骤 | 操作 | 完成判据 |
|---|---|---|
| 1 | 测试环境：执行 DDL → 发布全部模块 → 验证 LTO 全链路 | LTO 子模板组件与关系完整，三方创建成功 |
| 2 | 预发环境：执行 DDL → 发布 → 回归 NORMAL/Utility/AI 备用/Carousel + LTO 专项 | 回归通过，无 LTO 被误生成 Utility |
| 3 | 生产环境：执行 DDL（应用发布前完成） | `limited_time_offer_material_id` 字段存在 |
| 4 | 生产发布：`common` / `data` / `openplatform` / `api` 同一版本同时发布 | 服务健康，接口正常 |
| 5 | 生产发布：`whatsapp-crm-job`（xxljob） | 创建模板 job 正常执行 |
| 6 | 生产试点：单个 LTO 素材模板跑通生成链路 | 子模板 `components` 含 LTO，关系表含 LTO |
| 7 | 生产全量放开 + 按 §2.3 校验数据 | `bad_cnt = 0` |
| 8 | 历史坏数据（如 5961 / 5962）评估处理 | 已确认重新生成或业务修复方案 |

注意：**DDL 必须先于应用发布**；job 建议在第 6 步试点通过后再放开全量创建。

---

## 5. 监控告警

| # | 类型 | 内容 | 判据 / 阈值 |
|---|---|---|---|
| 5.1 | 指标 | `whatsapp_crm_template_create_status_count`（type / templateId 维度） | LTO 类型创建量正常上涨；失败不计入 |
| 5.2 | 日志 | `skip provider request due to unsupported provider capability` | 仅 EIGHTX8/ADA 命中 LTO 时出现，量级符合预期 |
| 5.3 | 日志 | `create waba template with unsupported provider capability` | 同上，用于定位被跳过的渠道模板 |
| 5.4 | 日志 | `canCreateMaterialCombination is empty` / `doCreate putNew2Pool fail` | 出现即需排查 LTO 组合是否生成异常 |
| 5.5 | 飞书告警 | `CREATEMSGTEMPLATEJOB_COUNT_ALERT`（当日创建模板数每 100 条触发） | 创建量是否异常放大/停滞 |
| 5.6 | 飞书告警 | Redis `whatsapp:task:CreateTemplateForLaneV2Job:pauseAlert:%s` | 触发即表示 job 被暂停，需人工确认 |
| 5.7 | 数据监控（建议配置） | §2.3 的 `bad_cnt` | 上线后 24h 内 `bad_cnt = 0`，> 0 立即告警 |
| 5.8 | 数据监控（建议配置） | LTO 子模板三方创建失败率 | 失败率无明显抬升 |

观察窗口建议：上线后至少观察 24 小时（覆盖一次完整 job 调度周期）。

---

## 6. 回滚方案

### 6.1 触发条件

出现以下任一情况即回滚：

- LTO 子模板大面积缺少 `LIMITED_TIME_OFFER` 组件或关系
- 普通模板 / Utility / AI 备用组出现回归问题
- 创建模板 job 异常中断或创建量异常

### 6.2 回滚步骤

| 步骤 | 操作 |
|---|---|
| 1 | 暂停 `whatsapp-crm-job` 的创建模板定时任务（先停 job，避免回滚过程中继续产生脏数据） |
| 2 | 回滚 `whatsapp-crm-job` → 回滚 `api` / `openplatform` / `data` / `common`（同一版本回退） |
| 3 | **不回滚 DDL**：`limited_time_offer_material_id` 字段保留 |
| 4 | 验证旧版本核心链路：普通模板创建、发送、Utility 自动创建、AI 备用组 |
| 5 | 恢复 job 调度（旧版本逻辑） |

### 6.3 回滚影响

| # | 项 | 结论 |
|---|---|---|
| 6.3.1 | DDL | 字段保留无副作用，旧代码不读取该字段 |
| 6.3.2 | 已生成数据 | LTO 组合/子模板保留在库中，旧版本不再生成新的 LTO 组合；LTO 素材退化为不参与生成 |
| 6.3.3 | 已创建的三方模板 | 回滚不会删除，需人工或业务侧评估处置 |
| 6.3.4 | 配置 | 本需求无新增 key，无需回滚 Apollo 配置；确认 `utility.auto.create.*` 未被本次上线改动 |
| 6.3.5 | 回滚后再次上线 | 需重新执行 §4 顺序，并重点核对 §2.3 数据校验 |

---

## 结论确认

| 项目 | 负责人 | 状态 |
|---|---|---|
| 影响范围与发布内容确认 | | ☐ |
| 数据库变更（DDL）执行确认 | | ☐ |
| Apollo 配置确认 | | ☐ |
| 上线顺序确认 | | ☐ |
| 监控告警确认 | | ☐ |
| 回滚方案确认 | | ☐ |
