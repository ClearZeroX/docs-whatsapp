# 核心表 ER 图

```mermaid
erDiagram
    message_material_group ||--o{ message_material_combination : "一个素材组包含零到多个素材组合"
    message_material_group ||--o{ message_material_group_lane : "一个素材组有零到多个分发通道"
    message_material_group ||--o{ message_template : "一个素材组关联零到多个消息模板"
    message_template ||--o{ message_template_waba : "一个消息模板在多个WABA上注册实例"
    message_template ||--o{ task_base : "一个消息模板被零到多个任务引用"
    message_material_combination ||--o{ message_template : "一个素材组合被零到多个消息模板使用"
    task_base ||--o{ task_sub : "一个主任务拆分为零到多个子任务"
    waba_base ||--o{ business_phone : "一个WABA账户下挂零到多个业务号码"
    waba_base ||--o{ message_template_waba : "一个WABA账户注册零到多个模板实例"
    business_phone ||--o{ message_template_waba : "一个业务号码被零到多个模板实例使用"

    message_material_group {
        bigint id PK "主键"
        varchar name "素材组名称"
        varchar template_type "模板类型: MARKETING/OTP/NOTIFY"
        varchar language "语言"
        varchar status "状态: ACTIVE/INACTIVE"
        varchar combination_mode "组合模式: RANDOM/MANUAL"
        varchar related_tasks "关联任务列表(JSON)"
        varchar creator "创建人"
        varchar updater "更新人"
        bigint ctime "创建时间"
        bigint utime "更新时间"
    }

    message_material_combination {
        bigint id PK "主键"
        bigint material_group_id FK "所属素材组ID"
        varchar header_material_id "HEADER素材ID"
        varchar body_material_id "BODY素材ID"
        varchar footer_material_id "FOOTER素材ID"
        varchar buttons_material_id "BUTTONS素材ID"
        varchar status "组合状态: ACTIVE/INACTIVE"
        varchar material_status "素材状态: NORMAL/MATERIAL_PAUSED"
        varchar creator "创建人"
        varchar updater "更新人"
        bigint ctime "创建时间"
        bigint utime "更新时间"
    }

    message_material_group_lane {
        bigint id PK "主键"
        bigint material_group_id FK "所属素材组ID"
        varchar source_lane "分发通道标识"
        int estimated_send_count "预估发送量"
        varchar creator "创建人"
        varchar updater "更新人"
        bigint ctime "创建时间"
        bigint utime "更新时间"
    }

    message_template {
        bigint id PK "主键"
        varchar name "模板名称"
        varchar status "模板状态"
        varchar template_type "分类: MARKETING/AUTHENTICATION/UTILITY"
        varchar language "语言"
        text components "组件内容(JSON)"
        bigint material_group_id FK "所属素材组ID"
        bigint material_combination_id FK "使用的素材组合ID"
        int ever_utility "是否曾是UTILITY: 0/1"
        varchar shadow_status "shadow模板状态"
        varchar creator "创建人"
        varchar updater "更新人"
        bigint ctime "创建时间"
        bigint utime "更新时间"
    }

    message_template_waba {
        bigint id PK "主键"
        varchar message_template_id FK "关联消息模板ID"
        varchar agent_template_id "三方消息模板ID"
        varchar business_phone "业务号码"
        varchar agent "三方渠道: NXCLOUD/ADA"
        varchar agent_name "三方渠道账户名"
        varchar waba_id "WhatsApp Business Account ID"
        varchar quality "模板质量评级"
        varchar status "模板状态"
        varchar category "分类"
        int ever_utility "是否曾是UTILITY"
        varchar creator "创建人"
        varchar updater "更新人"
        bigint ctime "创建时间"
        bigint utime "更新时间"
    }

    task_base {
        bigint id PK "主键"
        varchar name "任务名称"
        varchar business_type "业务类型: OTP/MARKETING/NOTIFY"
        int schedule_status "启停状态: 0停止/1启动"
        varchar data_source "数据源: QIAN_FAN/WEB_IMPORT/OTP"
        varchar data_source_meta "数据源元信息"
        varchar start_date "开始日期"
        varchar end_date "结束日期"
        varchar push_start_time "推送时间"
        varchar shield_rule "屏蔽规则(周/日期)"
        bigint message_template_id FK "引用的消息模板ID"
        varchar template_waba_weight "模板WABA权重"
        varchar lane_code "通道配置"
        varchar creator "创建人"
        varchar updater "更新人"
        bigint ctime "创建时间"
        bigint utime "更新时间"
    }

    task_sub {
        bigint id PK "主键"
        bigint task_id FK "所属主任务ID"
        varchar task_date "任务执行日期"
        int status "启停状态: 0停止/1启动"
        varchar task_info_json "统计信息JSON"
        varchar creator "创建人"
        varchar updater "更新人"
        bigint ctime "创建时间"
        bigint utime "更新时间"
    }

    waba_base {
        bigint id PK "主键"
        varchar agent "三方渠道: NXCLOUD/ADA/YCLOUD"
        varchar agent_name "三方渠道账户名"
        varchar waba_id "WhatsApp Business Account ID"
        varchar status "账户状态"
        varchar meta_status "邮箱状态"
        varchar meta_status_expire "邮箱状态过期时间"
        varchar ds_support_status "DS服务状态"
        varchar ds_risk_status "DS风险状态"
        int ds_risk_cnt "DS风险次数"
        varchar creator "创建人"
        varchar updater "更新人"
        bigint ctime "创建时间"
        bigint utime "更新时间"
    }

    business_phone {
        bigint id PK "主键"
        varchar agent "三方渠道: NXCLOUD/ADA/YCLOUD"
        varchar agent_name "三方渠道账户名"
        varchar app_key "应用AppKey"
        varchar waba_id FK "所属WABA ID"
        varchar business_phone "发送方WhatsApp号码/业务号码"
        tinyint enable_status "启用状态: 0禁用/1启用"
        varchar quality "账户质量评级"
        varchar status "账户状态"
        varchar messaging_limit "消息限制"
        varchar throughput "吞吐级别"
        int otp_weight "OTP权重"
        int marketing_weight "营销权重"
        int marketing_mmlite_weight "营销MMLite权重"
        int notify_weight "通知权重"
        varchar support_task_types "支持的业务类型: OTP/MARKETING/NOTIFY"
        varchar support_chat_type "支持的会话类型"
        varchar creator "创建人"
        varchar updater "更新人"
        bigint ctime "创建时间"
        bigint utime "更新时间"
    }
```

## 关联关系详细说明

| 序号 | 源表 | 目标表 | 关系 | 描述 |
|------|------|--------|------|------|
| 1 | `message_material_group` | `message_material_combination` | 1 : N | **一个素材组包含零到多个素材组合**，每个组合是 HEADER/BODY/FOOTER/BUTTONS 的一种排列方式；多个组合供随机或手动挑选 |
| 2 | `message_material_group` | `message_material_group_lane` | 1 : N | **一个素材组有零到多个分发通道**，指定该素材组可下发给哪些数据源通道（lane），每条记录含预估发送量 |
| 3 | `message_material_group` | `message_template` | 1 : N | **一个素材组关联零到多个消息模板**，同一组素材可衍生出不同语言/版本/类型的消息模板 |
| 4 | `message_material_combination` | `message_template` | 1 : N | **一个素材组合被零到多个消息模板使用**，通过 `message_template.material_combination_id` 引用 |
| 5 | `message_template` | `message_template_waba` | 1 : N | **一个消息模板在多个 WABA 上注册实例**，一个模板需要在不同的 WhatsApp Business Account 上创建实例才能发送 |
| 6 | `message_template` | `task_base` | 1 : N | **一个消息模板被零到多个发送任务引用**，通过 `task_base.message_template_id` 关联 |
| 7 | `task_base` | `task_sub` | 1 : N | **一个主任务拆分为零到多个子任务**，按日期或批次拆分，每个子任务独立执行和统计 |
| 8 | `waba_base` | `business_phone` | 1 : N | **一个WABA账户包含零到多个业务号码**，同一 WABA 下挂多个发送号码，各自配置任务类型权重与启停状态 |
| 9 | `waba_base` | `message_template_waba` | 1 : N | **一个WABA账户注册零到多个消息模板实例**，模板在具体 WABA 上的注册与状态记录 |
| 10 | `business_phone` | `message_template_waba` | 1 : N | **一个业务号码被零到多个模板实例使用**，通过 `message_template_waba.business_phone`（业务号码）关联 |

## 数据流转概览

```
素材组 (message_material_group)
    ├── 1:N ──→ 素材组合 (message_material_combination)
    │                ↑ 定义各组件(HEADER/BODY/FOOTER/BUTTONS)的排列
    ├── 1:N ──→ 分发通道 (message_material_group_lane)
    │                ↑ 配置素材组允许下发的目标通道
    └── 1:N ──→ 消息模板 (message_template) ← 1:N ── (message_material_combination)
                     ↑ 组装成WABA识别的模板结构
                     └── 1:N ──→ WABA实例 (message_template_waba)
                                     ↑ 在三方平台(ADA/NXCLOUD)注册后的实例
                                     ↑ 1:N ──→ 由WABA账户 (waba_base) 承载
                                     ↑ 由业务号码 (business_phone) 提供发送号码
                                     └── 1:N ──→ 发送任务 (task_base)
                                                      ↑ 引用模板执行发送
                                                      └── 1:N ──→ 子任务 (task_sub)
                                                                   ↑ 按日期/批次拆分执行
```

```
WABA账户 (waba_base)
    ├── 1:N ──→ 业务号码 (business_phone)
    │                ↑ 账户下挂的发送号码，按任务类型配置权重
    │                └── 1:N ──→ WABA模板实例 (message_template_waba)
    │                               ↑ 模板在具体号码/WABA上的注册与状态
    └── 1:N ──→ WABA模板实例 (message_template_waba)
                     ↑ 同一 WABA 上注册多个模板实例
```

## 外键依赖汇总

| 外键字段 | 引用表 | 说明 |
|----------|--------|------|
| `message_material_combination.material_group_id` | `message_material_group.id` | 组合所属的素材组 |
| `message_material_group_lane.material_group_id` | `message_material_group.id` | 通道所属的素材组 |
| `message_template.material_group_id` | `message_material_group.id` | 模板关联的素材组 |
| `message_template.material_combination_id` | `message_material_combination.id` | 模板使用的具体素材组合 |
| `message_template_waba.message_template_id` | `message_template.id` | WABA实例所属的消息模板 |
| `task_base.message_template_id` | `message_template.id` | 任务引用的消息模板 |
| `task_sub.task_id` | `task_base.id` | 子任务所属的主任务 |
| `business_phone.waba_id` | `waba_base.waba_id` | 业务号码所属的WABA账户(按waba_id匹配) |
| `message_template_waba.waba_id` | `waba_base.waba_id` | 模板实例注册的WABA账户 |
| `message_template_waba.business_phone` | `business_phone.business_phone` | 模板实例使用的具体业务号码 |
