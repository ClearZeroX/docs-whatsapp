# Business Diagnostic MCP

A standalone, read-only MySQL, Mongo and application-log diagnostic MCP server.

## Current transport

- Local `stdio`
- Newline-delimited JSON-RPC 2.0 over stdin/stdout

The transport layer is isolated under:

```text
src/main/java/com/opay/occ/mcp/businessdiagnostic/transport/stdio/
```

Future HTTP, SSE, or remote deployment transports can be added as sibling packages without changing the core tool implementations.

## Project layout

```text
business-diagnostic-mcp/
├── .codex-plugin/
│   └── plugin.json
├── .mcp.json
├── profiles.example.json
├── scripts/
│   └── run.sh
├── skills/
│   ├── business-data-diagnostics/
│   │   └── SKILL.md
│   └── log-diagnostics/
│       └── SKILL.md
└── src/
    ├── main/java/com/opay/occ/mcp/businessdiagnostic/
    │   ├── core/
    │   │   ├── Audit.java
    │   │   ├── Json.java
    │   │   ├── LogConfig.java
    │   │   ├── LogEnv.java
    │   │   ├── Masking.java
    │   │   ├── Profile.java
    │   │   └── ProfileStore.java
    │   ├── tools/
    │   │   ├── JdbcSupport.java
    │   │   ├── LogTools.java
    │   │   ├── MongoBuilder.java
    │   │   ├── MongoTools.java
    │   │   ├── MySqlTools.java
    │   │   ├── SqlBuilder.java
    │   │   ├── ToolRegistry.java
    │   │   ├── Tools.java
    │   │   └── TraceIdExtractor.java
    │   └── transport/
    │       └── stdio/
    │           └── McpServer.java
    └── test/java/com/opay/occ/mcp/businessdiagnostic/
        ├── core/
        └── tools/
```

## Build

```bash
mvn test
mvn package -DskipTests
```

The executable jar is generated at:

```text
target/business-diagnostic-mcp.jar
```

## Configure

1. Copy `profiles.example.json` to `profiles.json`.
2. Edit the profile names, hosts, databases, optional blacklists, and environment variable names.
3. Put the credentials into `~/.business-diagnostic/env.sh` (see
   [Credentials on macOS](#credentials-on-macos)); `scripts/run.sh` loads that file
   automatically, so no secrets have to be exported globally.

Example:

```bash
export BUSINESS_DIAGNOSTIC_TEST_MYSQL_PASSWORD='...'
export BUSINESS_DIAGNOSTIC_TEST_MONGO_URI='mongodb://...'
```

The optional `logDiagnostic` section of `profiles.json` configures log triage:

- `defaultEnvironment` and `environments.<name>` hold the MySQL connection and Apollo coordinates.
- `environments.<name>.logTimeZone` (optional, default `Asia/Shanghai`) declares the time zone of the
  `log_time` column, so query windows and returned timestamps line up with stored values.
- MySQL passwords and Apollo access keys are read from the environment variables named by `passwordEnv` and `accessKeyEnv`.
- Only `idn-test` is configured today; multi-environment support is a TODO because apollo-client keeps process-wide credentials.
- String values that start with `MOCK_` are placeholders and must be replaced with real read-only credentials.

These variables are read at server start-up, so `scripts/run.sh` sources
`~/.business-diagnostic/env.sh` before launching the JVM. Any variable referenced by
`passwordEnv`, `uriEnv` or `accessKeyEnv` in `profiles.json` can be defined there:

```bash
# ~/.business-diagnostic/env.sh
export LOG_DIAGNOSTIC_IDN_TEST_MYSQL_PASSWORD='...'
export LOG_DIAGNOSTIC_IDN_TEST_APOLLO_ACCESS_KEY='...'
```

The server also supports:

```bash
export BUSINESS_DIAGNOSTIC_CONFIG='/absolute/path/to/profiles.json'
```

### Credentials on macOS

The Codex desktop app is a GUI application. On macOS a GUI app inherits the environment from
`launchd`, **not** from `~/.zshrc` or `~/.bash_profile`, so `export`ing a password in a terminal
profile has no effect on the MCP server. Codex also only forwards the variable names listed in
`env_vars` inside `.mcp.json`.

To keep this simple and safe, secrets live in one untracked file and `scripts/run.sh` sources it
right before starting the server:

```text
~/.business-diagnostic/env.sh        # real secrets, never committed
~/.business-diagnostic/env.sh.example # template that is safe to share
```

Steps:

```bash
mkdir -p ~/.business-diagnostic
cp ~/.business-diagnostic/env.sh.example ~/.business-diagnostic/env.sh
# edit env.sh, fill in the real values
chmod 600 ~/.business-diagnostic/env.sh
```

Restart the Codex app afterwards so the MCP server is launched again and picks up the new values.
Set `BUSINESS_DIAGNOSTIC_ENV_FILE` to point at a different file if the default path is not wanted.

## Run manually

```bash
scripts/run.sh
```

The process reads JSON-RPC requests from stdin and writes responses to stdout.

## Tools

Business data:

- `list_profiles`
- `get_schema`
- `query_mysql`
- `count_mysql`
- `explain_mysql`
- `query_mongo` (requires the `test-mongo` profile and its URI env var)
- `count_mongo`
- `explain_mongo`

Log diagnostics (`test_log`, retained for about 2 hours):

- `list_log_environments` — environments, default environment, service aliases
- `query_logs` — search by `traceId` or `keyword`; defaults to the last 20 minutes and all four services
- `get_apollo_configs` — read only the bounded configuration evidence relevant to the current test investigation from `resource_lane_config` or logs; direct Apollo SDK access is disabled

`.mcp.json` exposes the log tools plus the MySQL and Mongo business tools through `enabled_tools`.

### Table and collection blacklist

Profiles are deny-by-exception. The following example blocks one MySQL table and one Mongo
collection while leaving every other object queryable:

```json
{
  "test-mysql": {
    "type": "mysql",
    "blockedTables": ["sensitive_table"]
  },
  "test-mongo": {
    "type": "mongo",
    "blockedCollections": ["sensitive_collection"]
  }
}
```

`list_profiles` returns the effective `blockedTables` and `blockedCollections` for each profile.
If both fields are absent or empty, all tables and collections are allowed.
## Skills

Both skills are meant to be used only when the user explicitly asks for that kind of work,
which keeps their instructions out of the context until they are needed:

- `log-diagnostics` — for log triage only, and only for test environments.
- `business-data-diagnostics` — for business data and schema work only, and only for test environments.

Apollo values are read only through the confirmed database mirror or bounded log evidence; the Apollo SDK and Apollo write APIs are not used.

Production is out of scope for this server. Two layers enforce it:

- the skills tell the model to refuse production or 线上 questions and to stop;
- the server never loads a `logDiagnostic.environments` entry whose name contains `prod`
  (it is reported through `blockedEnvironments`), and `requireEnvironment` refuses production
  names at runtime, so production data cannot be reached even by hand.

## Safety

- The database account should still be read-only when possible.
- The server does not accept raw SQL.
- Only generated `SELECT`, `COUNT`, and `EXPLAIN` statements are executed.
- MySQL connections are explicitly set to read-only sessions.
- Passwords and Mongo URIs are read from environment variables, never from the profile file;
  `scripts/run.sh` loads them from the untracked `~/.business-diagnostic/env.sh`.
- Tables and collections are readable by default. Configure `blockedTables` or
  `blockedCollections` in a profile to deny specific objects; an empty or absent blacklist
  allows all objects in that database.
- Sensitive fields are masked before results are returned for business profiles; log content is returned unmasked.
- MySQL `IN` predicates are split into batches of 500 values.
- Mongo `$in` and `$nin` arrays are limited to 500 values.
