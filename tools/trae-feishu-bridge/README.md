# TRAE Feishu Bridge

这个工具让 Codex 在需要读写飞书时复用本机 TRAE 的企业授权。

授权链路如下：

1. Codex 启动 MCP 进程并发现工具；此时不会访问 TRAE，也不会读取会话 JWT。
2. Codex 实际调用 `lark_whoami` 或 `lark_run` 时，工具读取 TRAE 当前会话文件 `~/.trae-cn/trae-jwt-token`。
3. 工具使用该 JWT 调用 TRAE 官方 `GetThirdPartyToken` 接口，换取当前 Feishu/Lark 第三方访问令牌。
4. 工具把实时令牌注入当前 `lark-cli` 子进程的环境变量。
5. `lark-cli` 执行本次飞书读写操作后退出，令牌和 JWT 都不写入文件。
6. 下一次调用重新读取 JWT 并重新换取令牌，因此 TRAE 的授权刷新会自动生效。

`bridge_health` 只检查 JWT 文件和 `lark-cli` 是否可用，不会调用 TRAE 授权接口，也不会申请飞书令牌。

## Codex 配置

当前机器的 Codex 配置已注册以下 MCP server：

```toml
[mcp_servers.trae_feishu_bridge]
type = "stdio"
command = "/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/tools/trae-feishu-bridge/run.sh"
startup_timeout_sec = 30
```

重启或重新加载 Codex 配置后即可发现工具。

## 使用方式

需要读写飞书文档时，直接在 Codex 请求中明确说明飞书文档 URL 或 token，以及读取、创建或修改目标。Codex 会在该请求需要时调用桥接工具。

示例命令参数：

```text
["docs", "+fetch", "--doc", "https://feishu.cn/docx/xxx", "--doc-format", "markdown", "--as", "user"]
["docs", "+update", "--doc", "https://feishu.cn/docx/xxx", "--mode", "str_replace", "--pattern", "old", "--content", "new", "--as", "user"]
```

工具禁止通过 `lark-cli` 修改本地授权配置，例如 `auth login`、`config init` 和 `profile use`。令牌、JWT、broker 原始响应和 TRAE 会话信息不会写入日志或返回给 Codex。

## 环境变量

- `TRAE_JWT_PATH`：覆盖 TRAE 会话 JWT 文件路径，默认为 `/Users/opay-20260271/.trae-cn/trae-jwt-token`。
- `TRAE_THIRD_PARTY_TOKEN_URL`：覆盖 TRAE 第三方授权接口，默认使用 TRAE CN 官方接口。
- `LARK_CLI`：覆盖 `lark-cli` 可执行文件路径。
- `LARKSUITE_CLI_BRAND`：覆盖品牌，默认为 `feishu`。
