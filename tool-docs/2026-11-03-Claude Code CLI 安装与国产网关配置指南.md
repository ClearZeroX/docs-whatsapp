# Claude Code CLI 安装与国产网关配置指南（macOS / opay-gateway）

> 编写日期：2026-11-03 ｜ 更新：2026-11-05（地区受限安装 fallback 与实测）、2026-11-06（新增桌面端 3P 配置与本地转发代理，见第二部分） ｜ 适用机器：当前这台 macOS（Apple Silicon）｜ 网关：`https://routers.opays.ai/api/v0/llm` ｜ 默认模型：`deepseek-flash`
>
> 本文把「在本机装 Claude Code CLI + 用公司网关跑当前模型」的完整流程固化下来，命令可直接照抄。
> 桌面端（Claude Desktop 3P + 本地转发代理）的完整流程见 **第二部分（§11 起）**。
> 本文不含真实密钥，所有凭据以环境变量 / 占位符 / `apiKeyHelper` 方式引用。

---

## 0. TL;DR（5 分钟版）

```bash
# 1) 安装 CLI（原生安装，自动更新）
curl -fsSL https://claude.ai/install.sh | bash
# ⚠️ 若本命令返回 HTML（"App unavailable in region"）或 bash 语法错误，
#    说明所在地区被 claude.ai 封禁：改用 §3.2 的 downloads.claude.ai 手动安装

# 2) 新开终端，验证
claude --version && claude doctor

# 3) 读取网关 key（复用 DSH 本机凭据，不落盘、不回显）
export OPAY_GATEWAY_API_KEY=$(python3 -c 'import re,os;s=open(os.path.expanduser("~/.dsh/.credentials.yaml")).read();print(re.search(r"^\s+OPAY_GATEWAY_API_KEY:\s*(\S+)\s*$",s,re.M).group(1))')

# 4) 写用户级配置（推荐用 apiKeyHelper，密钥不落到 settings.json）
mkdir -p ~/.claude
[ -f ~/.claude/settings.json ] && cp ~/.claude/settings.json ~/.claude/settings.json.bak
cat > ~/.claude/get-opay-key.sh <<'SH'
#!/bin/zsh
python3 -c '
import os, re
s = open(os.path.expanduser("~/.dsh/.credentials.yaml")).read()
m = re.search(r"^\s+OPAY_GATEWAY_API_KEY:\s*(\S+)\s*$", s, re.M)
print(m.group(1) if m else "")
'
SH
chmod 700 ~/.claude/get-opay-key.sh
cat > ~/.claude/settings.json <<'JSON'
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "apiKeyHelper": "~/.claude/get-opay-key.sh",
  "env": {
    "ANTHROPIC_BASE_URL": "https://routers.opays.ai/api/v0/llm",
    "ANTHROPIC_MODEL": "deepseek-flash",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-flash",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-flash",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-flash",
    "ANTHROPIC_CUSTOM_MODEL_OPTION": "deepseek-flash",
    "ANTHROPIC_CUSTOM_MODEL_OPTION_NAME": "DeepSeek Flash (opay)",
    "CLAUDE_CODE_MAX_CONTEXT_TOKENS": "1000000",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "900000",
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "64000"
  }
}
JSON

# 5) 进项目开跑
cd ~/your-project && claude
# 会话内 /status 确认 Anthropic base URL 与凭证来源，然后 /model 看模型
```

> 关键结论：**opay 网关原生支持 Anthropic Messages 协议，Claude Code 只需配 base URL + 凭证 + 模型名，不需要 LiteLLM / claude-code-router 之类的翻译层。**

---

## 1. 背景与环境结论

### 1.1 本机环境（2026-11-03 实测）

| 项目 | 结果 |
|---|---|
| 操作系统 | macOS **26.4.1**（Build 25E253），arm64 |
| Shell | `/bin/zsh` |
| Claude Code | 11-03 时**未安装**；**11-05 已装 2.1.318 native**（地区受限，走 §3.2 手动安装） |
| Node / npm | v26.5.0 / 11.17.0（原生安装不需要） |
| Homebrew | 已安装（`/opt/homebrew/bin/brew`） |
| git | `/usr/bin/git` 可用 |
| DSH 当前模型 | provider `opay-gateway` → model **`deepseek-flash`**（显示名 deepseek-flash-1017，上下文 1,000,000，最大输出 384,000，reasoningEffort=high） |
| 网关地址 | `https://routers.opays.ai/api/v0/llm` |
| 凭据引用 | `OPAY_GATEWAY_API_KEY`（存储于 `~/.dsh/.credentials.yaml` 的 `refs` 中） |

### 1.2 网关协议兼容性实测（同一天、用现有凭据探测）

| 探测项 | 结果 | 说明 |
|---|---|---|
| `POST /v1/messages` | ✅ 200 | 返回标准 Anthropic Messages 结构（`type:"message"`、`content[]`、`usage`） |
| `POST /messages` | ✅ 200 | 网关同时提供不带 `/v1` 的路径 |
| SSE 流式（`stream:true`） | ✅ 200，`text/event-stream` | 事件序列完整：`message_start → content_block_start → content_block_delta → message_delta → message_stop` |
| tool use | ✅ 通过 | 返回 `tool_use` block，`stop_reason:"tool_use"` |
| `thinking`（enabled / adaptive） | ✅ 均 200 | adaptive 不会报错 |
| `system` + `cache_control` + `metadata` | ✅ 200 | 字段被接受 |
| 认证方式 | ✅ `x-api-key` 与 `Authorization: Bearer` 均可用 | 对应 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` |
| `GET /v1/models` | ✅ 200，返回 1,119 条 | 含 `deepseek-flash`、`deepseek-v4.1-flash`、`deepseek-v4-pro`、`glm-5.3`、`claude-sonnet-5` 等 |
| `POST /v1/messages/count_tokens` | ⚠️ 200 但返回的是消息体 | 不是 `{"input_tokens":N}`，所以 `/context` 的占用数字是估算值，不影响使用 |

结论：

1. **不需要翻译层**：Claude Code 直接指向网关即可。
2. **默认走 `deepseek-flash`**，与 DSH 当前使用的一致。
3. 已知小瑕疵只有 `count_tokens`（`/context` 估算），可接受。

---

## 2. 前置检查

```bash
sw_vers                 # 需要 macOS 13.0+；本机 26.4.1 ✅
uname -m                # arm64
command -v claude || echo "claude 未安装"
command -v brew && brew --version
```

如果系统低于 macOS 13，官方明确会报 `dyld: Symbol not found` 一类错误，换安装方式也无法解决，只能升级系统。

---

## 3. 安装 Claude Code CLI

### 3.1 方式 A：原生安装（官方推荐）

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

- 装到 **`~/.local/bin/claude`**（symlink 指向 `~/.local/share/claude/versions/`）
- **自动后台更新**，无需 Node.js
- 脚本会**拒绝 sudo**（因为会装进 root 的 home）
- 安装包来自 `downloads.claude.ai`，会做 SHA256 校验

指定稳定通道 / 指定版本（可选）：

```bash
curl -fsSL https://claude.ai/install.sh | bash -s stable     # stable 通道，约落后一周
curl -fsSL https://claude.ai/install.sh | bash -s 2.1.317    # 指定版本
```

装完**新开一个终端窗口**再验证（老窗口的 PATH 不会刷新）。

> ⚠️ **地区限制（本机实测，2026-11-05）**：本机执行上述命令时，`claude.ai/install.sh` 返回的是 claude.com 的 **"App unavailable in region"** HTML 页面，bash 随之报语法错误 / `curl (56) Failure writing output`——Anthropic 支持地区不含中国大陆。安装脚本不可用，但**下载主机 `downloads.claude.ai` 仍可访问**，改用 §3.2 的方式即可。

### 3.2 方式 A-备选：地区受限时手动安装（本机实际采用）

**适用场景**：`curl -fsSL https://claude.ai/install.sh | bash` 被地区限制拦截，返回 HTML 或报 `syntax error` / `curl: (56)`。
**原理**：`claude.ai` 按 IP 地区封禁，但官方发布桶 `downloads.claude.ai` 不受影响，拿到的二进制与原生安装是同一份。

**第 1 步：确认下载主机可用**

```bash
curl -sS https://downloads.claude.ai/claude-code-releases/latest
# 期望输出形如 2.1.318 的版本号

V=$(curl -fsS https://downloads.claude.ai/claude-code-releases/latest)
curl -sSI "https://downloads.claude.ai/claude-code-releases/$V/darwin-arm64/claude" | head -1
# 期望 HTTP/2 200；Intel 机器把 darwin-arm64 换成 darwin-x64
```

**第 2 步：按官方原生布局安装**

```bash
set -e
V=$(curl -fsS https://downloads.claude.ai/claude-code-releases/latest)
echo "version: $V"

mkdir -p ~/.local/share/claude/versions ~/.local/bin
tmp=$(mktemp /tmp/claude-dl.XXXXXX)
curl -fSL --max-time 300 -o "$tmp" \
  "https://downloads.claude.ai/claude-code-releases/$V/darwin-arm64/claude"

chmod +x "$tmp"
mv "$tmp" ~/.local/share/claude/versions/$V
ln -sfn ~/.local/share/claude/versions/$V ~/.local/bin/claude

claude --version      # 期望：$V (Claude Code)
```

**第 3 步：规范化安装（写入自动更新元数据、消除 doctor 警告）**

```bash
claude install latest
claude doctor
# 期望：Running: native；Config install method: native；Auto-updates: enabled
```

**本机实测记录（2026-11-05）**

| 步骤 | 结果 |
|---|---|
| `claude.ai/install.sh` | ❌ 返回 HTML "App unavailable in region" |
| `downloads.claude.ai/.../latest` | ✅ 200，版本 2.1.318 |
| 二进制下载 | ✅ 319,598,464 字节（darwin-arm64） |
| `claude --version` | ✅ `2.1.318 (Claude Code)` |
| `claude install latest` 后 `claude doctor` | ✅ native / auto-updates enabled / **No installation issues found** |
| `claude -p "Reply with exactly: OK"` | ✅ 返回 `OK`（经 opay 网关 `deepseek-flash`） |

> 说明：二进制来自官方发布桶、布局与原生安装一致（launcher symlink + versions 目录），`claude install` 与 `claude update` 都能接管，因此自动更新可用。Homebrew / npm 也是替代方案，但本机沙箱缓存受限、brew 缓存版本偏旧（2.1.226），故未采用。

### 3.3 方式 B：Homebrew（想统一用 brew 管理时）

```bash
brew install --cask claude-code           # stable 通道
# 或
brew install --cask claude-code@latest    # 最新通道
```

注意：

- 两个 cask **互斥**，只能装一个
- **brew 安装不会自动升级**，需要 `brew upgrade claude-code`（或对应的 `@latest`）
- 可设 `CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE=1` 让 Claude Code 代替你跑 brew 升级

### 3.4 方式 C：npm（不推荐，官方已弃用）

```bash
npm install -g @anthropic-ai/claude-code
```

- 官方仓库 README 已标注 **"Installation via npm is deprecated"**，建议迁移到原生安装（迁移命令：`claude install`）
- 不要用 `sudo npm install -g`
- 本机虽有 Node 26，但没有必要走这条路

### 3.5 验证安装

```bash
claude --version     # 输出形如：2.1.317 (Claude Code)
claude doctor        # 只读诊断：安装类型、settings 校验、自动更新状态、凭证/Keychain 等
```

### 3.6 PATH 修复（zsh，macOS 最常见问题）

如果提示 `command not found: claude`：

```bash
ls -la ~/.local/bin/claude
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
which -a claude      # 若有多份，保留 ~/.local/bin/claude，删掉多余的 npm/旧安装
```

### 3.7 升级与卸载

```bash
claude update                    # 立即更新（原生安装）
claude install stable|latest     # 切通道 / 重装

# 卸载（原生安装）
rm -f ~/.local/bin/claude
rm -rf ~/.local/share/claude

# 卸载（Homebrew）
brew uninstall --cask claude-code
```

> 卸载后注意：`~/.claude` 保存着设置、MCP、会话历史；若要彻底清理再删（谨慎）。

---

## 4. 获取网关凭据

### 4.1 本机复用 DSH 已配置的凭据（最快）

本机的网关 key 存放在 `~/.dsh/.credentials.yaml` 的 `refs.OPAY_GATEWAY_API_KEY`（DSH 正在使用它）。
在**当前终端**读取（只进环境变量，不回显、不落盘）：

```bash
export OPAY_GATEWAY_API_KEY=$(python3 -c 'import re,os;s=open(os.path.expanduser("~/.dsh/.credentials.yaml")).read();print(re.search(r"^\s+OPAY_GATEWAY_API_KEY:\s*(\S+)\s*$",s,re.M).group(1))')
test -n "$OPAY_GATEWAY_API_KEY" && echo "key loaded"
```

> ⚠️ 不要把这条命令的输出贴到聊天、工单或文档里；不要写进项目目录。

### 4.2 其他人：向网关管理员申领

如果换机器或换人，向 opay 网关管理员申请 key（key 名称约定 `OPAY_GATEWAY_API_KEY`），不要共用个人凭据。

### 4.3 三种保存方式怎么选

| 方式 | 安全性 | 生效范围 | 推荐度 |
|---|---|---|---|
| shell `export`（`~/.zshrc`） | 中（明文） | 只对从该终端启动的进程；Dock/IDE 看不到 | 临时试用 |
| `~/.claude/settings.json` 的 `env` | 中（明文，建议 `chmod 600`） | 所有 Claude Code 会话（含后台 agent） | 简单场景可用 |
| `apiKeyHelper` 脚本（从 DSH 凭据/保险库读取） | **高**（settings 里无密钥） | 所有会话 | **推荐** |

三选一，**不要同时设置**，否则会出现凭证冲突。

---

## 5. 配置网关（核心）

### 5.1 三个必设变量

| 变量 | 值 | 说明 |
|---|---|---|
| `ANTHROPIC_BASE_URL` | `https://routers.opays.ai/api/v0/llm` | Claude Code 会在后面拼 `/v1/messages`；已实测可用 |
| `ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY` | 你的网关 key | 二选一：token → `Authorization: Bearer`；api key → `x-api-key`。本网关**两种都接受** |
| `ANTHROPIC_MODEL` | `deepseek-flash` | 当前 DSH 使用的模型 |

> 推荐 `ANTHROPIC_AUTH_TOKEN`（Bearer）：立即生效，没有"是否使用该 API key"的一次性确认弹窗。

### 5.2 临时试用（只影响当前终端）

```bash
export ANTHROPIC_BASE_URL=https://routers.opays.ai/api/v0/llm
export ANTHROPIC_AUTH_TOKEN="$OPAY_GATEWAY_API_KEY"
export ANTHROPIC_MODEL=deepseek-flash

claude
```

### 5.3 持久化（推荐：settings.json + apiKeyHelper）

**第 1 步：写取 key 脚本**（只输出 key，不输出任何提示/日志）

```bash
mkdir -p ~/.claude
cat > ~/.claude/get-opay-key.sh <<'SH'
#!/bin/zsh
python3 -c '
import os, re
s = open(os.path.expanduser("~/.dsh/.credentials.yaml")).read()
m = re.search(r"^\s+OPAY_GATEWAY_API_KEY:\s*(\S+)\s*$", s, re.M)
print(m.group(1) if m else "")
'
SH
chmod 700 ~/.claude/get-opay-key.sh
~/.claude/get-opay-key.sh | wc -c    # 只应输出 key 的长度（约 73），不应有其它字符
```

**第 2 步：写 `~/.claude/settings.json`**（若已存在，先备份：`cp ~/.claude/settings.json ~/.claude/settings.json.bak`）

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "apiKeyHelper": "~/.claude/get-opay-key.sh",
  "env": {
    "ANTHROPIC_BASE_URL": "https://routers.opays.ai/api/v0/llm",
    "ANTHROPIC_MODEL": "deepseek-flash",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-flash",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-flash",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-flash",
    "ANTHROPIC_CUSTOM_MODEL_OPTION": "deepseek-flash",
    "ANTHROPIC_CUSTOM_MODEL_OPTION_NAME": "DeepSeek Flash (opay)",
    "CLAUDE_CODE_MAX_CONTEXT_TOKENS": "1000000",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "900000",
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "64000"
  }
}
```

```bash
chmod 600 ~/.claude/settings.json
```

**替代写法（不用 helper，直接放 key）**：把 `apiKeyHelper` 一行删掉，在 `env` 里加
`"ANTHROPIC_AUTH_TOKEN": "sk-你的网关key"`，并同样 `chmod 600`。安全性低于 helper 方案。

### 5.4 模型配置说明

- **默认模型**：`deepseek-flash`（与 DSH 当前一致；网关返回的 model 名即 `deepseek-flash`）。
- **三档别名映射**：把 `ANTHROPIC_DEFAULT_OPUS/SONNET/HAIKU_MODEL` 都指向 `deepseek-flash`，
  这样 `/model opus|sonnet|haiku` 也都能用；后续想分级（如 opus → `deepseek-v4-pro`、haiku → 轻量模型）只改这三个变量。
- **`/model` 选择器为什么看不到它**：网关模型名不含 `claude`/`anthropic`，Claude Code 的模型发现会过滤掉；
  所以用 `ANTHROPIC_CUSTOM_MODEL_OPTION` 手动加一条（见上），或直接 `/model deepseek-flash`。
- **上下文窗口**：Claude Code 不认识 `deepseek-flash`，默认按 200K 估算。网关侧该模型是 **1M 上下文**，
  所以设置 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000`；`CLAUDE_CODE_AUTO_COMPACT_WINDOW` 控制自动压缩阈值（100000–1000000）。
- **输出上限**：不认识的模型默认 32000、上限 128000；示例给 64000，可按需调整。
- **effort**：可加 `"CLAUDE_CODE_EFFORT_LEVEL": "high"`（可选值 low/medium/high/xhigh/max），与 DSH 的 high 对齐。

其他可直接切换的网关模型（实测存在，见附录）：`deepseek-v4.1-flash`、`deepseek-v4-pro`、`glm-5.3`、`qwen3.8-max`、`claude-sonnet-5`、`claude-opus-5` 等。

### 5.5 配置项速查

| 变量 | 建议值 | 作用 |
|---|---|---|
| `ANTHROPIC_BASE_URL` | `https://routers.opays.ai/api/v0/llm` | 网关根地址 |
| `ANTHROPIC_AUTH_TOKEN` | 网关 key（或改用 apiKeyHelper） | Bearer 认证 |
| `ANTHROPIC_API_KEY` | 同上，二选一 | x-api-key 认证 |
| `ANTHROPIC_MODEL` | `deepseek-flash` | 会话默认模型 |
| `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` | `deepseek-flash` | 三档别名映射 |
| `ANTHROPIC_CUSTOM_MODEL_OPTION` | `deepseek-flash` | 让 `/model` 选择器出现该模型 |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | `1000000` | 修正上下文窗口 |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `900000` | 自动压缩阈值 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | `64000` | 输出 token 上限（≤128000） |
| `CLAUDE_CODE_EFFORT_LEVEL` | `high`（可选） | 推理强度 |

---

## 6. 验证

### 6.1 网关层（先确认 key + 地址没问题）

```bash
curl -sS -w '\nHTTP %{http_code}\n' -X POST "$ANTHROPIC_BASE_URL/v1/messages" \
  -H "x-api-key: $OPAY_GATEWAY_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"deepseek-flash","max_tokens":64,"messages":[{"role":"user","content":"Reply with exactly: OK"}]}'
```

期望：`HTTP 200`，返回 JSON 含 `"type":"message"`、`"content":[{"type":"text","text":"OK"}]`。

- 返回里 `id` 以 `resp_` 开头是正常的（网关内部 ID），格式仍是 Anthropic Messages。
- **`max_tokens` 太小（如 16）可能返回空文本**，验证时用 64 以上。
- 报"未知模型"也算通（说明认证已过，只是模型名不对）。

流式验证（可选）：

```bash
curl -sS -N -X POST "$ANTHROPIC_BASE_URL/v1/messages" \
  -H "x-api-key: $OPAY_GATEWAY_API_KEY" \
  -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"deepseek-flash","max_tokens":64,"stream":true,"messages":[{"role":"user","content":"count 1 to 3"}]}' \
  | head -c 300
```

期望 `content-type: text/event-stream`，并看到 `event: message_start`。

### 6.2 Claude Code 层

```bash
claude          # 首次启动
```

会话内：

- `/status` → **`Anthropic base URL`** 行应显示 `https://routers.opays.ai/api/v0/llm`；`Auth token` 或 `API key` 行应指向 `apiKeyHelper` / 你设置的变量
- `/model` → 应能看到 `DeepSeek Flash (opay)` 以及 opus/sonnet/haiku 三档
- 随便发一句"你好"，能正常回复即成功

排错入口：`claude doctor`（终端，只读诊断）。

---

## 7. 日常使用

### 7.1 启动与会话

```bash
cd /path/to/project
claude                          # 交互式
claude "fix the build error"    # 带初始提示
claude -c                       # 继续最近一次会话
claude -r "auth-refactor"       # 按名字/ID 恢复
claude -p "explain this code"   # 非交互，输出后退出
```

### 7.2 常用斜杠命令

| 命令 | 作用 |
|---|---|
| `/init` | 生成项目 `CLAUDE.md` |
| `/help` | 帮助（输入 `/` 看全量命令） |
| `/clear` / `/compact` | 清空 / 压缩上下文 |
| `/model` | 切模型；左右键调 effort；`s` 只切本次会话 |
| `/status` | 版本、模型、base URL、凭证来源 |
| `/context` | 上下文占用（本网关下为估算值） |
| `/permissions` | allow/ask/deny 规则 |
| `/config` | 设置界面（`/settings`） |
| `/doctor` | 配置体检并给修复建议 |
| `/rewind` | 回退会话/代码到之前某点 |
| `/resume` | 恢复历史会话 |
| `/diff` | 查看本次改动 |
| `/code-review` | 审查改动（别名 `/review`，可 `--fix`） |
| `/plan` | 进入 Plan 模式 |
| `/memory` | 编辑 `CLAUDE.md`、开关自动记忆 |
| `/mcp` | MCP 服务器与 OAuth |
| `/export` / `/login` / `/logout` / `/exit` | 导出 / 登录 / 登出 / 退出 |

### 7.3 快捷键

- `Shift+Tab` 循环权限模式；`Esc` 打断；`Esc Esc` 回退菜单；`Ctrl+C` 中断；`Ctrl+D` 退出
- `Ctrl+O` 看工具调用细节；`Ctrl+R` 历史搜索；`Ctrl+B` 转后台
- 输入 `@` 引用文件；`!` 直接执行 shell（如 `! npm test`）；`Ctrl+V` 粘贴图片（iTerm2 用 `Cmd+V`）
- macOS 上 `Option` 组合键需在终端里把 Option 设为 Meta

### 7.4 权限模式

| 模式 | 行为 | 场景 |
|---|---|---|
| Manual（`default`） | 读自动，其余每次问 | 陌生仓库、生产代码 |
| `acceptEdits` | 文件编辑自动批准，命令仍问 | 信任的重复重构 |
| `plan` | 只读、只出方案 | 大改前对齐 |
| `auto` | 全放行 + 后台安全审查 | 日常主力（v2.1.283+ 交互式默认） |
| `dontAsk` | 只跑预批准工具，其余拒绝 | 严格 CI |
| `bypassPermissions` | 全放行（灾难性删除仍拦） | **仅隔离容器** |

> ⚠️ `claude -p` 在 v2.1.302+ 未指定权限模式时以 Manual 启动，需要批准的工具调用会被直接拒绝。
> CI 里必须显式给 `--permission-mode auto|acceptEdits|dontAsk` 或 `--allowedTools`。

### 7.5 项目记忆与 `.claude/`

- `CLAUDE.md`（项目根或 `.claude/CLAUDE.md`）写项目约定，**目标 ≤200 行**；长内容拆到 `.claude/rules/*.md`
- `~/.claude/` 是用户级配置；`.claude/settings.local.json` 是项目本地私有配置（别提交）
- 与 DSH 不同，Claude Code 的配置以 `~/.claude/settings.json` 为准

### 7.6 省 token 的 6 条

1. 任务做完 `/clear`
2. 开局定好模型和 effort，**全程别切**（切模型会击穿 prompt cache，整段历史按全价重算）
3. 用 `@` 引用文件，别让 Claude 到处试探
4. 给啰嗦的命令加静默参数（写进 `CLAUDE.md`）
5. `/compact` 放在休息前（缓存还热时压缩，成本约 1/10）
6. 大输出任务丢给子代理（只回结论）

### 7.7 非交互 / CI

```bash
claude -p --output-format json --permission-mode acceptEdits \
  --max-turns 5 --allowedTools "Read" "Bash(git diff:*)" \
  "Review this diff and output JSON" > review.json
```

---

## 8. 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| `401` / invalid token | 凭证变量类型或 key 不对 | 用 §6.1 的 curl 直接验证；换 `ANTHROPIC_AUTH_TOKEN` ⇄ `ANTHROPIC_API_KEY`（本网关都支持） |
| `404` / model not found | 模型名不对 | `curl $ANTHROPIC_BASE_URL/v1/models` 查可用名；确认用 `deepseek-flash` |
| 回复为空 | `max_tokens` 太小（思考占用） | 提高到 64 以上（正式配置默认已足够） |
| `400 Extra inputs are not permitted` / 提到 `context_management` | 网关拒绝实验性字段 | `"CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1"` |
| `400` 提到 `thinking` / `adaptive` | 上游不接受 | 实测本网关接受；若上游变更，临时加 `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` |
| `/context` 显示 approximate | 网关 `count_tokens` 未按标准实现（实测返回消息体） | 属预期；用 `/context` 看个大概即可 |
| 提示 `Model isn't recognized · context assumed to be 200k` | 模型名不在内置表 | 已配 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000` 修正 |
| `Stream idle timeout` | 网络/代理缓冲 SSE | 换网络、关代理缓冲；重试 |
| 启动仍要求登录 | 凭证没到达会话 | settings `env` 里没配好、或项目级 settings 在首次信任前不生效；把凭证放用户级或 shell |
| 启动警告 `Auth conflict` | 同时有 token 和 API key | 只留一种；或 `/logout` 清掉旧登录 |
| `403` 且网关日志无请求 | 公司 WAF / 反代拦请求体 | 联系网关管理员对 `/v1/messages` 关闭 body 检测 |
| `command not found: claude` | PATH 未包含 `~/.local/bin` | 见 §3.6 |
| GUI/IDE 里不生效 | GUI 不继承 shell export | 用 settings.json 的 `env`（VS Code 用 `claudeCode.environmentVariables`） |

---

## 9. 安全与合规

- **key 不进仓库**：不要写进项目 `.claude/settings.json`、`.mcp.json`、`CLAUDE.md`、代码或工单。
- `~/.claude/settings.json` 若含明文 key，务必 `chmod 600`；更推荐 `apiKeyHelper`（本文默认方案）。
- 建议在 `.gitignore` 里排除 `.claude/settings.local.json`。
- 接网关意味着提示词、代码片段、文件内容会发往网关及其上游模型；按公司数据安全/出境政策执行。
- 定期轮换 key；离职/换机时在网关侧吊销。
- 本机 DSH 凭据（`~/.dsh/.credentials.yaml`）属个人凭据，**不要复制给他人**；他人请向网关管理员申请自己的 key。

---

## 10. 附录

### 10.1 网关可用模型（摘录，2026-11-03 探测）

> `/v1/models` 共返回 1,119 条，多数为 embedding / 图像 / 音频 / OCR 等非对话模型，配置时不要误选。常用对话模型：

| 类别 | 模型名 |
|---|---|
| 当前默认 | **`deepseek-flash`** |
| DeepSeek | `deepseek-v4.1-flash`、`deepseek-v4-pro`、`deepseek-v4-flash`、`deepseek-v3.2` |
| 智谱 | `glm-5.3`、`glm-5.3-flash`、`glm-4.7` |
| 通义 | `qwen3.8-max`、`qwen3.8-flash`、`qwen3-coder-plus` |
| Kimi | `kimi-k3`、`kimi-k2.7-code` |
| Claude（网关内） | `claude-sonnet-5`、`claude-opus-5`、`claude-haiku-4.5`、`claude-fable-5.1` |

切换方式：`/model <模型名>`，或改 `ANTHROPIC_MODEL` / 三档别名变量。

### 10.2 本机探测记录（2026-11-03）

- `POST /v1/messages` → 200（`x-api-key` 与 `Authorization: Bearer` 均 200）
- `POST /messages` → 200
- 流式 → 200，`text/event-stream`，7 个 `content_block_delta` + `message_start` / `message_stop` 等完整序列
- `tool_use` → 支持
- `thinking` enabled / adaptive → 200
- `system` + `cache_control` + `metadata` → 200
- `deepseek-flash` 基本对话 → 200，`model: deepseek-flash`，`usage: {input_tokens:35, output_tokens:2}`
- `deepseek-v4.1-flash` → 200，实际映射到 `on-premise/deepseek-v4.1-flash-1017`
- `GET /v1/models` → 200，1,119 条
- `POST /v1/messages/count_tokens` → 200 但返回消息体（非 token 数）

### 10.3 参考资料

- 安装/系统要求：[docs/setup](https://code.claude.com/docs/en/setup)
- 快速上手：[docs/quickstart](https://code.claude.com/docs/en/quickstart)
- 接网关：[docs/llm-gateway-connect](https://code.claude.com/docs/en/llm-gateway-connect)
- 网关协议兼容：[docs/llm-gateway-protocol](https://code.claude.com/docs/en/llm-gateway-protocol)
- 设置与优先级：[docs/settings](https://code.claude.com/docs/en/settings)
- 环境变量：[docs/env-vars](https://code.claude.com/docs/en/env-vars)
- 模型配置：[docs/model-config](https://code.claude.com/docs/en/model-config)
- 排错：[docs/troubleshoot-install](https://code.claude.com/docs/en/troubleshoot-install)、[docs/errors](https://code.claude.com/docs/en/errors)
- 版本基线：Claude Code 2.1.317（2026-11-03，[changelog](https://code.claude.com/docs/en/changelog)）

---

*本文档由环境实测 + 官方文档生成。网关行为、模型名与 Claude Code 默认值可能随时间变化，调整配置前先跑一遍 §6.1 的 curl 验证。*

---

# 第二部分：Claude 桌面端配置（含本地转发代理）

> 本部分对应 2026-11-06 的实测环境（Claude Desktop **4.16336.0**）。
> 桌面端与 CLI 共用同一个网关 `https://routers.opays.ai/api/v0/llm` 和同一个 key（`OPAY_GATEWAY_API_KEY`），但**接入方式不同**：
>
> - **CLI**：直连网关，§1–§10 已完成，无需本部分。
> - **桌面端**：必须经过**本地转发代理**（§14），因为桌面端有模型名校验、网关又禁止 Claude 名，两边直接冲突。
>
> 重点阅读：§13（桌面端 3P 配置）、§14（本地代理）、§15（扩展）、§16（移除回滚）。

## 11. 总览：为什么桌面端多一层代理

### 11.1 两条链路

```text
CLI：      claude ──HTTPS──> routers.opays.ai/api/v0/llm/v1/messages
桌面端：   Claude Desktop ──HTTP 127.0.0.1:8787──> opay-claude-proxy ──HTTPS──> 同一网关
```

### 11.2 为什么桌面端不能像 CLI 那样直连

| 约束 | 表现 |
|---|---|
| 桌面端 3P 对 Model list 做名字校验 | 模型名必须是 Claude/Anthropic 风格，否则报 `Doesn't look like an Anthropic model: expected a gateway model route referencing an Anthropic model`，底部 `Invalid: Model list`，Apply 置灰 |
| 网关禁止 Claude 模型 | 实测 `claude-sonnet-5`、`claude-opus-5`、`anthropic-claude-*` 等一律 `403 Opay Gateway models are not allowed through this gateway` |
| 网关只放行非 Claude 名 | `deepseek-flash`、`deepseek-v4-pro`、`gpt-6.1-sol`、`glm-5.3` 等 200 |

两条约束正好矛盾 → 用本地代理**对外伪装成 Claude 模型名、对内改写成真实模型**。

### 11.3 当前生效状态（2026-11-06 核对）

| 项 | 值 |
|---|---|
| Claude Desktop | 4.16336.0（`/Applications/Claude.app`，notarized） |
| 桌面端连接 | Gateway 模式，base URL `http://127.0.0.1:8787` |
| 本地代理 | launchd 常驻，`127.0.0.1:8787`，pid 运行中 |
| 映射 | 3 个档位（见 §14.3），均声明 1M 上下文 |
| CLI | 2.1.318，直连网关，**不受桌面端/代理影响** |

---

## 12. 桌面端安装（macOS）

### 12.1 官方下载入口被地区限制

- `https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect` → **403 `region_unavailable`**（与 CLI 的 install.sh 同一限制）
- 但官方分发主机 `downloads.claude.ai` 可访问，用 RELEASES.json 找最新包：

```bash
# 1) 查最新版本与下载地址
curl -fsS https://downloads.claude.ai/releases/darwin/universal/RELEASES.json
# 输出含 currentRelease 和 releases[0].updateTo.url，形如：
# https://downloads.claude.ai/releases/darwin/universal/4.16336.0/Claude-<hash>.zip

# 2) 下载并解压（本机实测包大小 388,855,481 字节）
curl -fL -o /tmp/Claude.zip "https://downloads.claude.ai/releases/darwin/universal/4.16336.0/Claude-<hash>.zip"
ditto -x -k /tmp/Claude.zip /tmp/claude-app

# 3) 安装到 /Applications
ditto /tmp/claude-app/Claude.app /Applications/Claude.app
xattr -dr com.apple.quarantine /Applications/Claude.app 2>/dev/null || true

# 4) 校验（本机实测均通过）
codesign --verify --deep --strict /Applications/Claude.app   # codesign OK
spctl -a -vvv -t exec /Applications/Claude.app               # accepted / Notarized Developer ID: Anthropic PBC
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/Claude.app/Contents/Info.plist
```

### 12.2 升级与卸载

- **升级**：应用自带 Sparkle 自动更新（走 `downloads.claude.ai`，不受 claude.ai 地区限制影响）；也可重新下载 zip 覆盖。
- **卸载**：退出应用 → 删除 `/Applications/Claude.app`；如需清干净，再删 `~/Library/Application Support/Claude`、`~/Library/Caches/com.anthropic.claudefordesktop`、`~/Library/Preferences/com.anthropic.claudefordesktop.plist`、`~/Library/Logs/Claude`。

---

## 13. 桌面端接入网关（3P 配置，重点）

### 13.1 前置：本地代理必须先跑起来

```bash
curl -sS http://127.0.0.1:8787/health     # 期望 {"ok":true}
```

代理没起来 → 先看 §14.5 的服务管理命令与 §17 排错。

### 13.2 打开 3P 配置窗口

1. 菜单栏 **Help → Troubleshooting → Enable Developer Mode**（应用重启，菜单栏出现 **Developer**）
2. 菜单栏 **Developer → Configure Third-Party Inference…**

> Developer 菜单消失是官方行为：3P 配置生效后重启会隐藏该菜单，需要在 Help → Troubleshooting 里再次开启。

### 13.3 Connection 区填写

| 字段 | 值 |
|---|---|
| Inference provider | **Gateway** |
| Credential kind | **Static API key** |
| **Gateway base URL** | **`http://127.0.0.1:8787`** |
| **Gateway API key** | `local-proxy`（任意字符串，代理会忽略并注入真 key） |
| Gateway auth scheme | `bearer`（默认；代理不校验，可保持默认） |
| 其他（1M、Auto mode 检查等） | 保持默认即可 |

### 13.4 Models 区（关键：别填真实模型名）

**不要**把 `deepseek-flash` 填进 Model list——名字不合法，会立刻变成 `Invalid: Model list`。

两种正确做法任选：

**做法 A（推荐，少配置）**：Model list 留空，**Model discovery 开关保持 ON**，点右上角 **Test model discovery**，应列出 3 行（显示名里带真实模型），直接 Apply。

**做法 B（显式固定）**：手动加 3 条（Model ID 必须是 Claude 风格）：

| Model ID | Display name（建议） | Claude model behind this ID |
|---|---|---|
| `claude-sonnet-5` | `DeepSeek Flash (deepseek-flash)` | `claude-sonnet-5` |
| `claude-opus-5` | `GPT 6.1 Sol (gpt-6.1-sol)` | `claude-opus-5` |
| `claude-fable-5-1` | `DeepSeek V4 Pro 0813 (deepseek-v4-pro-0813)` | `claude-fable-5-1` |

> 第一条是默认模型（当前 = `deepseek-flash`）。

### 13.5 应用与状态解释

1. 点 **Apply Changes** → **Save & Restart**
2. 顶部出现横幅 **"You're using Gateway"**：正常状态提示，表示推理已切到你的网关（不是报错）。`Open` 重新打开配置窗口，`×` 可关闭。
3. 底部状态栏：`Sonnet 5` = 当前别名 `claude-sonnet-5`（实际 `deepseek-flash`）；`High` = effort；`Auto` = 权限模式；左侧 `opay-20260271 Gateway` = 当前连接身份。

### 13.6 验证

```bash
# 代理日志：每次请求都会打印 别名 -> 真实模型
tail -f ~/Library/Logs/opay-claude-proxy.log

# 映射表
curl -s http://127.0.0.1:8787/__map | python3 -m json.tool
```

然后在 Code 标签页选环境（This computer）+ 项目文件夹，发一句话测试。

> **已知显示怪癖**：桌面端认识 `claude-sonnet-5` 这类内置模型 ID，会把选择器显示折叠成内置名（如 `Sonnet 5`），我们配置的 `display_name` 不一定显示。要以 **日志 / `/__map`** 为准确认真实模型。

---

## 14. 本地转发代理详解（opay-claude-proxy）

### 14.1 设计要点

- 仅监听 `127.0.0.1:8787`，不对外网开放
- 收到 `POST /v1/messages` → 读 JSON body → `model` 别名查映射表改成真实模型 → 转发到 `https://routers.opays.ai/api/v0/llm/v1/messages`
- **忽略客户端凭证**，每次请求从 `~/.dsh/.credentials.yaml` 读取 `OPAY_GATEWAY_API_KEY` 注入 `x-api-key`（密钥不落入代理配置）
- **流式透传**：SSE 逐块转发，不缓冲；`tools` / `system` / `thinking` 等 body 字段原样透传
- 剥离客户端 `anthropic-beta` 等实验性头，避免网关 400
- `GET /v1/models` 由映射表动态生成，`display_name` 形如 `真实名称 (真实模型ID)`
- `POST /v1/messages/count_tokens` 返回 404，桌面端自动退回字符估算

### 14.2 文件清单

| 文件 | 作用 |
|---|---|
| `~/bin/opay-claude-proxy.mjs` | 代理主程序（Node，无第三方依赖，约 200 行） |
| `~/.opay-claude-proxy/map.json` | **模型映射表**（唯一需要日常编辑的文件） |
| `~/Library/LaunchAgents/com.opay.claude-proxy.plist` | launchd 登录自启 + 崩溃自动拉起 |
| `~/Library/Logs/opay-claude-proxy.log` | 运行日志（请求映射记录） |

### 14.3 映射表 `map.json`（当前生效）

```json
{
  "defaultAlias": "claude-sonnet-5",
  "aliases": {
    "claude-sonnet-5": {
      "model": "deepseek-flash",
      "label": "DeepSeek Flash",
      "context": 1000000
    },
    "claude-opus-5": {
      "model": "gpt-6.1-sol",
      "label": "GPT 6.1 Sol",
      "context": 1000000
    },
    "claude-fable-5-1": {
      "model": "deepseek-v4-pro-0813",
      "label": "DeepSeek V4 Pro 0813",
      "context": 1000000
    }
  }
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| alias（key） | 桌面端看到的模型 ID，**必须 Claude 风格**（`claude-<family>-<version>`，family ∈ sonnet/opus/haiku/fable，否则仍会 `Invalid: Model list`） |
| `model` | 网关实际接受的模型名（如 `deepseek-flash`、`gpt-6.1-sol`、`deepseek-v4-pro-0813`） |
| `label` | 桌面端显示名，代理会拼成 `label (model)` |
| `context` | 声明给桌面端的上下文窗口；≥1000000 时会带 `supports_1m` |
| `defaultAlias` | 未识别的别名/默认档；必须指向一个存在的 alias |

### 14.4 代理接口

| 方法与路径 | 行为 |
|---|---|
| `GET /health` | `{"ok":true}` |
| `GET /v1/models` | 按映射表返回模型列表（桌面端“发现”用） |
| `POST /v1/messages`（及 `/messages`） | 改写 `model` 后转发网关，流式/非流式透传 |
| `POST /v1/messages/count_tokens` | 返回 404（触发桌面端估算） |
| `GET /__map` | 返回完整映射表（排错/核对用） |
| `HEAD /api/hello` | 200（网关探测） |
| `OPTIONS *` | CORS 预检 204 |

### 14.5 launchd 服务管理

```bash
# 状态
launchctl print gui/$(id -u)/com.opay.claude-proxy | grep -E "state|pid"

# 停止（保留配置）
launchctl bootout gui/$(id -u)/com.opay.claude-proxy

# 启动（配置在 ~/Library/LaunchAgents/）
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.opay.claude-proxy.plist

# 重启（改脚本后）
launchctl kickstart -k gui/$(id -u)/com.opay.claude-proxy

# 日志
tail -f ~/Library/Logs/opay-claude-proxy.log
```

plist 关键项：`RunAtLoad=true`（登录自启）、`KeepAlive=true`（崩溃自动拉起）、`ProgramArguments=/opt/homebrew/bin/node ~/bin/opay-claude-proxy.mjs`。

> 改 **map.json** 不需要重启服务（每次请求实时读取）；改 **.mjs 脚本** 需要 `kickstart -k` 重启。
> 桌面端选择器是启动时拉取的，**改映射后要重启 Claude App** 才能看到新列表。

### 14.6 安全边界

- 代理只绑 `127.0.0.1`，局域网/外网不可达
- 密钥只存在于 `~/.dsh/.credentials.yaml`，代理运行时读取；`map.json`、plist、脚本里都没有 key
- 代理**不校验**调用方身份（本机任意进程可调用）——单用户开发机可接受；多用户机器建议加 token 校验或改端口后自用
- 日志只记录模型别名与真实模型名，不记录 key 与对话正文

---

## 15. 扩展指南（加/换模型）

### 15.1 新增一个模型（以 GLM-5.3 为例）

```bash
# 1) 先确认网关放行该真实模型（返回 200 即可）
KEY=$(python3 -c 'import re,os;s=open(os.path.expanduser("~/.dsh/.credentials.yaml")).read();print(re.search(r"^\s+OPAY_GATEWAY_API_KEY:\s*(\S+)\s*$",s,re.M).group(1))')
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://routers.opays.ai/api/v0/llm/v1/messages \
  -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"glm-5.3","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}'
```

```json
// 2) 编辑 ~/.opay-claude-proxy/map.json，加一条（key 必须是 Claude 风格别名）
"claude-haiku-4-5": {
  "model": "glm-5.3",
  "label": "GLM-5.3",
  "context": 200000
}
```

3. 保存即对后续请求生效；**重启 Claude App** 刷新选择器（或点 Test model discovery）。

### 15.2 更换 / 删除已有映射

- 换模型：改对应 alias 的 `model` 字段即可（别名保持不变，桌面端无需重新配置）
- 删除：删掉该 alias；注意 `defaultAlias` 不能指向已删除的 alias
- 改上下文：改 `context`；1M 会向桌面端声明 `supports_1m`

### 15.3 换默认档

改 `defaultAlias`（当前 `claude-sonnet-5` → `deepseek-flash`）。例如改成 `claude-opus-5` 则默认走 `gpt-6.1-sol`。

### 15.4 换端口

脚本顶部 `LISTEN_PORT` 改端口 → `kickstart -k` 重启 → 桌面端 Gateway base URL 同步改。

### 15.5 如果桌面端拒绝 http（本次未遇到）

桌面端实测接受 `http://127.0.0.1:8787`。若未来版本要求 https，备选：
1. 生成本地自签证书（`openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1"`）
2. 把脚本 `http.createServer` 换成 `https.createServer({key,cert})`
3. 将证书加入钥匙串信任（`security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db cert.pem`，可能弹一次授权）
4. 桌面端 base URL 改为 `https://127.0.0.1:8787`

### 15.6 可用真实模型参考（2026-11-06 实测 200）

`deepseek-flash`、`deepseek-v4-pro`、`deepseek-v4-pro-0813`、`deepseek-v4.1-flash`、`deepseek-v4-flash`、`glm-5.3`、`glm-5.3-flash`、`zai-glm-5.2`、`qwen3.8-max`、`qwen3.8-flash`、`qwen3.6-flash`、`kimi-k3`、`kimi-k3-fast`、`minimax-m2.7`、`gemini-3.1-pro`、`step-3.7-flash`、`gpt-6.1-sol`、`gpt-6.1-terra`、`gpt-6-sol`。
不可用示例：`gpt-5.4`（502 上游失败）、一切 `claude-*`（403 网关策略）。

---

## 16. 移除与回滚

### 16.1 只停用（保留脚本与配置，随时恢复）

```bash
launchctl bootout gui/$(id -u)/com.opay.claude-proxy
# 桌面端会连不上 127.0.0.1:8787；如需继续用，见 16.3 改回官方
```

### 16.2 完全移除代理

```bash
# 先备份映射（可选）
cp ~/.opay-claude-proxy/map.json ~/Desktop/opay-map-backup.json

launchctl bootout gui/$(id -u)/com.opay.claude-proxy 2>/dev/null || true
rm -f  ~/Library/LaunchAgents/com.opay.claude-proxy.plist
rm -f  ~/bin/opay-claude-proxy.mjs
rm -rf ~/.opay-claude-proxy
rm -f  ~/Library/Logs/opay-claude-proxy.log
```

### 16.3 还原桌面端

1. 打开 **Developer → Configure Third-Party Inference…**（菜单不见了就先 Help → Troubleshooting → Enable Developer Mode）
2. 把 Inference provider 改回默认/Anthropic，或清空 Gateway base URL 与 API key
3. **Apply Changes → Save & Restart**
4. 若曾安装过 MDM 配置描述文件，到 **系统设置 → 通用 → 设备管理** 中移除

> 注意：本机所在地区访问 claude.ai 受限，**改回官方登录后桌面端基本不可用**。若仍需用桌面端，请保留代理与 Gateway 配置。

### 16.4 影响范围与备份建议

- **CLI 完全不受影响**：CLI 走自己的 `~/.claude/settings.json`，不经过代理
- 移除前建议备份：`~/.opay-claude-proxy/map.json`、`~/Library/LaunchAgents/com.opay.claude-proxy.plist`、`~/.claude/settings.json`
- 删除 `~/.dsh/.credentials.yaml` 会影响 DSH/CLI/代理三方 → 不要动

---

## 17. 桌面端排错

| 现象 | 原因 | 处理 |
|---|---|---|
| `Invalid: Model list`，红字 `Doesn't look like an Anthropic model` | Model list 里填了真实模型名（如 `deepseek-flash`） | 删掉该条目；用 §13.4 的 Claude 风格别名 |
| Apply 一直置灰 | 有字段校验失败（通常是 Model list / Connection） | 点红色 `Invalid: ...` 查看具体字段 |
| `You're using Gateway` 横幅 | 正常状态提示 | 无需处理，可关闭 |
| Connection 报 base URL 不合法 | 桌面端可能要求 https（本机未遇到） | 见 §15.5 https 备选 |
| 401 / invalid token | key 缺失或失效 | `curl http://127.0.0.1:8787/health`；检查 `~/.dsh/.credentials.yaml` 的 `OPAY_GATEWAY_API_KEY` |
| `403 Opay Gateway models are not allowed` | 请求里出现 Claude 真实模型名（映射未命中/写错别名） | 检查 `map.json` 的 alias 与 `model`；`/__map` 核对 |
| 502 / 上游不可达 | 网关或网络问题 | 用 §15.1 的 curl 直连网关验证；看代理日志 |
| 模型选择器没有新模型 | 桌面端启动时缓存 | 重启 Claude App；或点 Test model discovery |
| 选择器显示 `Sonnet 5` 而非真实名 | 桌面端认识该内置 ID，折叠显示 | 以 `/__map`、日志为准（已知限制） |
| 1M 上下文长会话报 `prompt too long` | 声明的 1M 大于后端实际窗口 | 把 `map.json` 里对应 `context` 调回 `200000`，重启 App |
| Auto mode 行为异常 | Auto 分类器默认调用 `claude-sonnet-5`（映射到 `deepseek-flash`） | 可关闭 Auto mode，或在配置里关闭 server-side checks |
| Developer 菜单消失 | 3P 配置生效后的官方行为 | Help → Troubleshooting → Enable Developer Mode 再开 |
| 端口 8787 被占用 | 其它进程 | `lsof -nP -iTCP:8787`；改脚本 `LISTEN_PORT` 与桌面端 URL |
| launchd 服务没起来 | 脚本语法/权限/Node 路径 | `launchctl print gui/$(id -u)/com.opay.claude-proxy`、`tail ~/Library/Logs/opay-claude-proxy.log` |

---

## 18. 附录 B：桌面端速查

### 18.1 当前映射（2026-11-06）

| 桌面端别名 | 实际模型 | 上下文 | 用途 |
|---|---|---|---|
| `claude-sonnet-5`（默认） | `deepseek-flash` | 1M | 日常编码 |
| `claude-opus-5` | `gpt-6.1-sol` | 1M | 复杂推理 |
| `claude-fable-5-1` | `deepseek-v4-pro-0813` | 1M | 强模型交叉验证 |

### 18.2 常用命令

```bash
curl -sS http://127.0.0.1:8787/health                      # 代理健康
curl -s  http://127.0.0.1:8787/v1/models | python3 -m json.tool   # 桌面端看到的模型
curl -s  http://127.0.0.1:8787/__map | python3 -m json.tool       # 真实映射
tail -f  ~/Library/Logs/opay-claude-proxy.log             # 实时映射日志
launchctl print gui/$(id -u)/com.opay.claude-proxy        # 服务状态
launchctl kickstart -k gui/$(id -u)/com.opay.claude-proxy # 重启代理
```

### 18.3 关键路径

| 路径 | 说明 |
|---|---|
| `/Applications/Claude.app` | 桌面端应用 |
| `~/bin/opay-claude-proxy.mjs` | 代理脚本 |
| `~/.opay-claude-proxy/map.json` | 模型映射表 |
| `~/Library/LaunchAgents/com.opay.claude-proxy.plist` | 自启配置 |
| `~/Library/Logs/opay-claude-proxy.log` | 代理日志 |
| `~/.claude/settings.json` | CLI 配置（与桌面端无关） |

### 18.4 版本基线

- Claude Desktop **4.16336.0**（2026-11-03 构建）
- Claude Code CLI **2.1.318**
- 代理：Node v26.5.0，无第三方依赖
- 文档更新：2026-11-06
