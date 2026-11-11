---
name: idn-production-diagnostics
description: Use ONLY when the user explicitly asks to query or diagnose the Indonesia production environment (for example, "印尼生产", "IDN prod", or "Indonesia production"). Never use for ambiguous production, Indonesia, test, or development requests.
---

# Indonesia Production Diagnostics

## When to use

Use this skill only when the user explicitly identifies both Indonesia and production and asks for log or database investigation. Before every tool call, pass `environmentConfirmation: "idn-prod"`.

## When not to use

Do not call these tools for `查生产日志`, `查印尼日志`, `查线上数据`, or any request that does not explicitly identify Indonesia production. Use the existing test diagnostics tools only for explicit test-environment requests.

## Tools

- `idn_prod_query_logs`: fixed `*whatsapp*` Discover data view; accepts exactly one keyword or traceId and a required time range. Logs are queried through the local Chrome page bridge; do not read or copy browser cookies.
- `idn_prod_query_mysql`, `idn_prod_count_mysql`, `idn_prod_explain_mysql`: fixed DBS MySQL instance, structured read-only requests only.
- `idn_prod_query_mongo`, `idn_prod_count_mongo`, `idn_prod_explain_mongo`: fixed DBS MongoDB instance, structured read-only requests only. The count tool uses bounded `find(..., {"_id":1}).limit(N)` because the DBS endpoint rejects `countDocuments`.
- `idn_prod_get_apollo_configs`: read only the bounded Apollo configuration evidence relevant to the current Indonesia production investigation; requires a reason and namespace/key context.
- `idn_prod_get_schema`: reserved for a database-specific allowlisted schema adapter.

## Apollo configuration lookup

Apollo is not accessed through the Apollo SDK or write-capable Apollo APIs. The tool reads only the confirmed `resource_lane_config` MySQL mirror fields (`config_key`, `config_value`, `status`, `update_time`) or bounded log evidence. The caller must provide a reason and a namespace, key keyword, or exact key list inferred from the investigation context. Unbounded namespace reads are rejected. Sensitive values are redacted before return.

## Schema discovery

For MySQL, tables are allowed by default unless explicitly blocked. The tool obtains live columns through `SHOW FULL COLUMNS` when `schema` is omitted. You may call `idn_prod_get_schema` first when the fields are not already known. Never guess a column name from a business label.

For MongoDB, DBS does not expose a validated generic schema query. Use the persisted code model, mapper, or an already approved collection field list. Treat `schemaVerified: false` as a warning and do not silently substitute guessed field names.

The tool deliberately contains no business-object-to-field mapping table. The agent must locate the table or collection from code and verify the actual schema before generating a query. A template name, template ID, task ID, or message ID are different inputs for the same process, not separate hard-coded mappings.

## MongoDB query rules

Generate the same shape as the DBS page accepts:

```javascript
db.message_record.find(
    {"template_name": {"$in": ["name-a", "name-b"]}, "send_time": {"$gte": ISODate("2026-10-22T00:00:00+08:00"), "$lt": ISODate("2026-10-28T00:00:00+08:00")}},
    {"task_id": 1, "msg_status": 1, "send_time": 1}
).sort({"send_time": -1}).limit(5)
```

Do not send raw Mongo commands, update/delete operations, aggregation pipelines, or unsafe operators. `$in` and `$nin` values are batched when large.

## Combined investigation

Use logs and databases independently unless the user asks to combine them. For a combined request, query logs first, extract template/task/sub-task/message identifiers, then query the relevant MySQL and MongoDB collections. Keep every result marked `environment: idn-prod`, `source`, and `readOnly: true`.

