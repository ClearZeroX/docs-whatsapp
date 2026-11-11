---
name: log-diagnostics
description: Use ONLY when the user explicitly asks to investigate, triage, or search application logs of a TEST environment (查日志 / 排查日志 / 看日志 / 找日志 / 报错排查). Do not use proactively, do not use for business data questions, and never use it for production (线上 / prod) incidents - this skill is test-environment only.
---

# Log Diagnostics

Investigate application logs stored in the `test_log` table for the whatsapp-crm services.

## Environment scope (test only)

- This skill is for **test environments only**; today only `idn-test` is configured.
- **Never use it for production or 线上 problems.** If the user says a production issue is happening
  (线上 / 生产 / prod), say that these diagnostics are restricted to test environments and stop;
  do not call `query_logs`.
- Production environment names are refused by the server itself: a `logDiagnostic.environments`
  entry containing `prod` is never loaded (it only shows up as `blockedEnvironments` in
  `list_log_environments`), and `query_logs` then fails with "Production environment is not allowed".
  There is no override.

## Before you start

- Logs are retained for about 2 hours; older records do not exist.
- The four services are `whatsapp-crm-api` (api), `whatsapp-crm-job` (job), `whatsapp-crm-mq` (mq), `whatsapp-crm-otp` (otp).
- Business tables do not store trace ids, so a business identifier (phone number, task id, template name) is found by searching log content.
- Every `content` line has the shape
  `<timestamp> [<thread>] <LEVEL> - traceId:[<traceId>] <logger> -- <message>`,
  so the trace id is always inside `traceId:[...]` and the business message follows ` -- `.

## Workflow

1. Call `list_log_environments` when you need the environment name or service aliases.
2. Call `query_logs` with:
   - `traceId` when the user provides one;
   - `keyword` when the user gives a phone number, task id, template name, or error text;
   - both when you already know the trace id you want to narrow down.
3. Omit `service` when you cannot tell which service is involved: all four services are then queried.
4. Omit the time range only when the default (last 20 minutes) is acceptable; otherwise pass `timeStart`/`timeEnd` in epoch milliseconds.
5. If the result contains `matchedTraceIds`, pick the relevant one and call `query_logs` again with that `traceId` to read the full request trail.
6. Summarize the timeline for the user; quote only the log lines that matter.

## When the user gives no keyword (derive keyword and service from the code)

The user may describe a symptom only, for example "素材生成图片一直失败" or "这个任务没发出去",
without giving any searchable text. In that case **read the source code first and derive both the
service and the keyword yourself**; do not ask the user for a keyword and do not search blindly.

1. **Locate the code.** The whatsapp-crm repository is checked out locally (typically
   `/Users/opay-20260271/code-temp/whatsapp_crm`). Use it to find the classes that implement the
   behaviour the user described (grep for the business term, controller/service class names, or the
   error text).
2. **Determine the service from the module the code lives in:**

   | Module directory | Service alias | `service_name` |
   | --- | --- | --- |
   | `whatsapp-crm-api` | api | `whatsapp-crm-api` |
   | `whatsapp-crm-job` / `whatsapp-crm-job2-1-1` | job | `whatsapp-crm-job` |
   | `whatsapp-crm-mq` | mq | `whatsapp-crm-mq` |
   | `whatsapp-crm-otp` | otp | `whatsapp-crm-otp` |

   Do not use `spring.application.name` for this: several modules share the same value. If the code
   spans modules or you cannot tell, **omit `service`** and let all four services be queried.
3. **Derive the keyword from the log statements in that code.** Log lines are written as
   `log.info("SomeController.someAction taskId={}, cost={}ms", ...)`, so take a **stable literal
   fragment of the message template** as the keyword:

   - pick a fragment that contains no `{}` placeholder, ideally the leading class/method name or a
     distinctive business phrase, e.g. `MaterialRAGController.getAsyncGeneratePictureResult`;
   - prefer specific over generic: avoid `failed`, `error`, `success`, `start`, `end`, `null`;
   - keep it short enough to stay a substring of the rendered line, but long enough to be unique;
   - if several candidates exist, run them in order until rows come back.

   Full-text search on the message body also works for the campaign/template/phone fragments, but
   the class-method prefix is the most stable anchor.
4. **Query, then follow the trace.** Call `query_logs` with the derived `keyword` (no `service` if
   unsure), read `matchedTraceIds`, then re-query by `traceId` to get the whole request trail.
5. **State your reasoning briefly** to the user: which module you inspected, which keyword you
   derived and why, and which service(s) you scanned.

## Safety

- The tools are read-only; never attempt to write to the database.
- Read-only source inspection is allowed; never modify application code while triaging.
- Do not ask the user for passwords in chat; credentials come from environment variables.
- Log content is returned unmasked; avoid pasting unrelated personal data into the summary.
- Keep result sets small: use `limit` and a narrow time range.
