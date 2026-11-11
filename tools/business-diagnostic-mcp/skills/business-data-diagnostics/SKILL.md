---
name: business-data-diagnostics
description: Use ONLY when the user explicitly asks to inspect or diagnose business data of a TEST environment, compare business tables, or explain a MySQL/Mongo schema. Do not use for log investigation, do not use it for production (线上 / prod) problems, and never call its tools proactively or speculatively.
---

# Business Data Diagnostics

Use this skill when the user asks to inspect business data, diagnose a record, compare tables, or explain a MySQL/Mongo schema through the local MCP server.

## When to use

Call these tools only after the user explicitly asks for business data work, for example:

- inspect or diagnose a business record;
- look at a specific table, column, or row;
- compare two tables;
- explain a MySQL or Mongo schema.

## When NOT to use

- Do not call `list_profiles`, `get_schema`, `query_mysql`, `count_mysql`, `explain_mysql`,
  `query_mongo`, `count_mongo`, or `explain_mongo` unless the user asked for the work above.
- Do not call them "just to check" or to preload context.
- Do not call them for log investigation; use the `log-diagnostics` skill instead.
- Do not use them for production or 线上 problems: every configured profile points at a test
  environment. If the user is asking about a production issue, say so and stop.
- These calls are expensive, so keep them rare and targeted.

## Workflow

1. Call `list_profiles` first to see the available data sources.
2. For MySQL questions, call `get_schema` before querying if the table shape is unknown.
3. Prefer `count_mysql` or `count_mongo` before large queries.
4. Use `query_mysql` or `query_mongo` with a bounded `limit` and a stable `orderBy`.
5. Use `cursor` for MySQL keyset pagination when you need the next page.
6. Use `explain_mysql` or `explain_mongo` when a query is slow or unexpectedly returns many rows.
7. Summarize findings for the user; show raw rows only when explicitly requested.

## Safety

- The tools are read-only; never attempt to mutate data.
- Do not ask the user for database passwords in chat.
- Credentials come from the profile's environment variables.
- Tables and collections are readable by default; respect each profile's `blockedTables` and `blockedCollections` blacklist.
- Keep result sets small and use pagination.
- Masked fields must not be unmasked or reconstructed.

## MySQL examples

List profiles:

```json
{}
```

Get a schema:

```json
{
  "profile": "test-mysql",
  "table": "message_template"
}
```

Query with pagination:

```json
{
  "profile": "test-mysql",
  "table": "task",
  "columns": ["id", "status", "create_time"],
  "where": [
    { "field": "status", "op": "eq", "value": "FAILED" }
  ],
  "orderBy": [
    { "field": "id", "direction": "desc" }
  ],
  "limit": 100,
  "offset": 0
}
```

Continue with the returned `nextCursor`.

## Mongo examples

Query documents:

```json
{
  "profile": "test-mongo",
  "collection": "task_metrics",
  "filter": { "status": "FAILED" },
  "sort": { "createTime": -1 },
  "limit": 100,
  "skip": 0
}
```

Count documents:

```json
{
  "profile": "test-mongo",
  "collection": "task_metrics",
  "filter": { "status": "FAILED" }
}
```
