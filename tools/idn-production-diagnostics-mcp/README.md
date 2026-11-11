# Indonesia Production Diagnostics MCP

独立于测试环境 `business-diagnostic-mcp` 的印尼生产诊断工具。所有工具均为只读，并且服务端要求 `environmentConfirmation=idn-prod`。

## Tools

```text
idn_prod_query_logs
idn_prod_get_apollo_configs
idn_prod_get_schema
idn_prod_query_mysql
idn_prod_count_mysql
idn_prod_explain_mysql
idn_prod_query_mongo
idn_prod_count_mongo
idn_prod_explain_mongo
```

生产工具仅在用户明确说“印尼生产 / IDN 生产 / Indonesia production / idn-prod”时使用。MySQL 固定实例为 `10.95.6.3-ob_collection`，MongoDB 固定实例为 `10.95.6.240-whatsapp-crm`，数据库均为 `whatsapp_crm`。

## Read-only boundaries

- MySQL 只生成结构化 `SELECT`、`COUNT`、`EXPLAIN`。
- MongoDB 只生成 `find` 和 `explain`；`idn_prod_count_mongo` 使用带 `_id` 投影和 limit 的 `find` 查询，并返回 bounded 计数，因为 DBS 不支持 `countDocuments`。
- 不接受原始 SQL、Mongo JavaScript、聚合、DDL、DML、事务控制或导出语句。
- 每条最终 DBS 语句在 HTTP 发送前再次执行独立只读校验。
- MySQL 表使用黑名单，默认允许；黑名单当前为空。字段通过实时 `SHOW FULL COLUMNS` 校验。
- MongoDB 集合和字段仍使用现有白名单。
- MySQL 的 `idn_prod_get_schema` 通过 DBS 后台执行 `SHOW FULL COLUMNS`，不打开页面；MongoDB 当前没有可用的通用 schema 查询接口，需结合代码模型或已确认字段。
- 查询上限为每次 50 行；大批量 `IN`、`$in`、`$nin` 分批。
- 结果默认遮蔽手机号、邮箱、openid 等字段。
- 查询结果包含 `environment`、`source`、`readOnly`。

## Apollo configuration lookup

`idn_prod_get_apollo_configs` reads only the bounded configuration evidence needed by the current Indonesia production investigation. It uses the confirmed `resource_lane_config` mirror fields (`config_key`, `config_value`, `status`, `update_time`) or bounded production log evidence. The request must include a reason and a namespace, key keyword, or exact key list. Unbounded reads are rejected. Sensitive configuration values are redacted. It never calls Apollo SDK endpoints or Apollo write APIs.

Configured Apollo page: `https://config-id-loan-hw-prod.rupiahcepatweb.com/config.html?#/appid=whatsapp-crm`. This URL is metadata only; it is not used for writes.

## Log browser bridge

日志查询不再读取、复制或持久化 Chrome Cookie。MCP 启动本机回环桥接服务，Chrome 扩展自动复用或创建一个非激活的 `log.rupiahcepatweb.com` 标签页，在该页面上下文使用 `fetch(..., {credentials: "include"})` 发起固定 Kibana 只读请求，再把结果回传给 MCP。

Chrome 扩展目录：`browser_extension/`。

首次使用需要在 Chrome 中加载一次未打包扩展：

1. 打开 `chrome://extensions`。
2. 打开右上角“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 选择本插件目录下的 `browser_extension` 目录。
5. 在 Chrome 中保持 `log.rupiahcepatweb.com` 登录状态。

扩展没有 `cookies` 权限，不读取 Cookie；只拥有固定日志域名、回环桥接和脚本执行所需权限。MCP 端只接受固定的 Kibana `/_internal/search/es` 请求、固定 `*whatsapp*` 数据视图和受限查询结构。桥接令牌只通过请求头传递，不写入 URL、日志或查询结果。

用户在 Codex 中查询时不需要手动打开 Discover 页面，也不需要把日志页面切到前台。扩展会在查询需要时自动打开或复用后台标签页。若扩展未安装、桥接未运行或 Kibana 登录态失效，工具会返回明确错误，不退回 Cookie 读取方式。

## Local verification

```bash
python3 -m unittest discover -s tests -v
python3 -m compileall -q .
node --check browser_extension/service_worker.js
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python3 server.py
```
