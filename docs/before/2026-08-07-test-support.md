# 8x8 account mapping 缺失导致 URL 占位符未替换，请求发往无效地址

- **traceId**：da5e1243-1f67-4e87-b520-2fd27a4cd6ce
- **日期**：2026-08-07
- **状态**：✅ 代码已修复，⏳ 待运维补充 Apollo 配置

## 根因

Apollo `agent.eightx8.account.mapping` 未配置 channelId `2070942356` 的映射，`EightX8AccountMappingService.getAccountId()` 返回 null。`WriteProviderHandler` 在 pathParams 为空时走了 fallback 分支，直接返回带 `%s` 占位符的原始 URL 发给 8x8。影响 `createTemplate`、`sendMessage`、`uploadMedia` 三处。

## 解决方案

**代码**：`WriteProviderHandler.java` 新增 `resolveApiUrl` 方法，URL 含未替换 `%s` 时记录 ERROR 并返回 null，三处均快速失败不再发无效请求。

**运维**：在 Apollo `openplatform.provider` 补充配置：
```json
agent.eightx8.account.mapping={"2070942356":{"accountId":"<实际accountId>","subAccountId":"<实际subAccountId>"}}
```

---

# 8x8 发送消息失败：模板未创建导致无法匹配 template+businessPhone

- **traceId**：0A630C51000131CEFDE021B2388D0035
- **日期**：2026-08-07
- **状态**：⏳ 配置/数据问题，非代码缺陷

## 根因

模板 4096 在 wabaId `2070942356881301`（8x8 渠道）从未成功创建（同上一个问题），`agentTemplateId` 为空。`HistoryConfigStrategy` 过滤掉无 agentTemplateId 的记录 → 返回空 → 抛 `1020506` → fallback 也空 → 抛 `1020510`。

## 解决方案

非代码问题。补充 Apollo 配置（同上）+ 重置模板状态为 WAITCREATE 重新创建：
```sql
UPDATE message_template_waba SET status = 'WAITCREATE', utime = UNIX_TIMESTAMP() * 1000
WHERE message_template_id = '4096' AND waba_id = '2070942356881301' AND status = 'CREATEFAIL';
```

---

# UpdateMsgTemplateJobService 状态拉取失败：Guava Cache null + 8x8 模板名匹配不到

- **traceId**：86504a56-bceb-414f-8b53-d622fde1e670
- **日期**：2026-08-07
- **状态**：⏳ 代码隐患待修复 + 配置/数据问题

## 根因

1. **Guava Cache null 隐患**：`BusinessPhoneServiceImpl:286` 的 CacheLoader 查不到记录时返回 null，违反 Guava 约定，抛 `InvalidCacheLoadException` 中断 job
2. **模板名匹配不到**：模板创建失败的连带反应，8x8 远端不存在对应模板

## 解决方案

1. CacheLoader 返回 null 时改为返回空对象或 Optional（待单独评估）
2. 补充 Apollo 配置 + 重置 CREATEFAIL 模板（同上）

---

# PHONE_NUMBER 按钮字段名不符合 8x8 API 规范（下划线→驼峰）

- **traceId**：e3267107-8467-4f1f-9584-cbbb1ba85fb1
- **日期**：2026-08-07
- **状态**：✅ 已解决

## 根因

8x8 API button 字段用驼峰命名，代码用下划线。`phone_number` 应为 `phoneNumber`，8x8 找不到字段认为电话号码为空，返回 `code:3002`。经排查 9 个 button 级别多词字段均有此问题。

## 解决方案

`EightX8TemplatePlugin.java` 修改 9 个常量值为驼峰：

| 原值 | 修复后 | 按钮类型 |
|---|---|---|
| `phone_number` | `phoneNumber` | PHONE_NUMBER |
| `flow_id` | `flowId` | FLOW |
| `flow_action` | `flowAction` | FLOW |
| `navigate_screen` | `navigateScreen` | FLOW |
| `otp_type` | `otpType` | OTP |
| `autofill_text` | `autofillText` | OTP |
| `supported_apps` | `supportedApps` | OTP |
| `package_name` | `packageName` | OTP |
| `signature_hash` | `signatureHash` | OTP |

同时新增 `validateButton` 方法，按类型校验必填字段，缺失时抛异常快速失败：

| 按钮类型 | text | 其他必填 |
|---|---|---|
| PHONE_NUMBER | ✅ | phoneNumber |
| URL | ✅ | url |
| FLOW | ❌ | flowId |
| OTP | ❌ | otpType |
| QUICK_REPLY | ❌ | — |
| COPY_CODE | ❌ | — |

> text 仅 PHONE_NUMBER/URL 必填（对齐 WhatsApp API 权威定义），COPY_CODE/OTP 自动生成，QUICK_REPLY/FLOW 可选。

---

# validateButton 校验过严：COPY_CODE 按钮无 text 被误拦截

- **traceId**：2e677eaa-5533-4965-8426-21a1967b6711
- **日期**：2026-08-07
- **状态**：✅ 已解决

## 根因

上一轮 `validateButton` 对所有类型统一要求 text 必填，但 COPY_CODE/OTP 的 text 是 WhatsApp 预设值，用户不填也合理，被误拦截。

## 解决方案

text 必填校验改为仅 PHONE_NUMBER 和 URL，其余豁免（已在上一问题表格中体现）。

---

# COPY_CODE 按钮误带 example 字段导致 8x8 500 + 缺少 text

- **traceId**：48631d5f-cc12-4fec-aeda-d6600c24a2bb
- **日期**：2026-08-07
- **状态**：✅ 代码已修复

## 根因

两个问题叠加：

1. **误带 example**：`normalizeButtons` 的 `else if` 分支对任何有 example 值的非动态 URL 按钮都塞了 `example`。COPY_CODE 的 coupon code 被误当 example 发给 8x8
2. **缺少 text**：8x8 要求所有按钮（除 VOICE_CALL）text 必填，但 COPY_CODE 用户不填，请求体无 text

## 解决方案

1. 删除 `example` 的 `else if` 分支，`example` 仅动态 URL 按钮输出
2. 新增 `resolveButtonText` 方法，COPY_CODE 缺 text 时补默认值 `"Copy Code"`

---

# COPY_CODE 按钮模板创建持续 8x8 500（疑 8x8 服务端问题）

- **traceId**：028b3aaf-6f12-43e0-9292-6af7c1c60016
- **日期**：2026-08-07
- **状态**：⏳ 疑 8x8 服务端 bug，非代码缺陷

## 根因

三轮修复后请求体已完全合规（`{"text":"Copy Code","type":"COPY_CODE"}`），8x8 仍返回 `code:2000, Internal error`（HTTP 500）。QUICK_REPLY、URL、PHONE_NUMBER 按钮均能成功创建，仅 COPY_CODE 始终 500。500 是服务端崩溃而非参数校验（那会是 400），疑 8x8 对 COPY_CODE 类型存在服务端 bug。

## 解决方案

非代码问题。建议：
1. 联系 8x8 支持，提供 `errorId: 4487bc9f-25e2-41ef-ad1b-77118179fe21`
2. cURL 直接验证
3. 如 8x8 不支持，用 URL/QUICK_REPLY 按钮替代

---

# 模板 0807_zlc_8x8_12_button 被 Meta 审核拒绝

- **traceId**：521a9e27-c1cc-4ab1-b182-29d1ab9d5368
- **日期**：2026-08-07
- **状态**：⏳ 非代码问题，内容审核拒绝

## 根因

模板创建成功（PENDING），Meta 审核返回 REJECTED。测试文案为无意义内容（"head712"、"body712"），URL 指向 `baidu.com`，Meta 因内容质量不达标拒绝。8x8 list templates 接口不返回 reason 字段，无法获取具体拒绝理由。

## 解决方案

使用符合 Meta 审核规范的模板文案和真实业务 URL 重新创建。
