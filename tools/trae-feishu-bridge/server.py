#!/usr/bin/env python3
"""Lazy Feishu MCP bridge backed by the local TRAE session authorization."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


NAME = "trae-feishu-bridge"
VERSION = "0.2.0"
DEFAULT_TRAE_JWT_PATH = "/Users/opay-20260271/.trae-cn/trae-jwt-token"
DEFAULT_TRAE_TOKEN_URL = "https://api.trae.cn/trae/api/v3/GetThirdPartyToken"
DEFAULT_LARK_CLI = "/opt/homebrew/bin/lark-cli"
DEFAULT_BRAND = "feishu"
DEFAULT_TIMEOUT = 120
MAX_TIMEOUT = 600
FALLBACK_APP_IDS = {
    "feishu": "cli_a965abcba6fadbd3",
    "lark": "cli_a96598a589b89dba",
}
BLOCKED_LOCAL_COMMANDS = {
    ("auth", "login"),
    ("auth", "logout"),
    ("config", "init"),
    ("config", "remove"),
    ("profile", "add"),
    ("profile", "remove"),
    ("profile", "use"),
}


def _env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value if value else default


def trae_jwt_path() -> str:
    return _env("TRAE_JWT_PATH", DEFAULT_TRAE_JWT_PATH)


def trae_token_url() -> str:
    return _env("TRAE_THIRD_PARTY_TOKEN_URL", DEFAULT_TRAE_TOKEN_URL)


def resolve_lark_cli() -> str:
    configured = os.environ.get("LARK_CLI")
    if configured:
        return configured
    if os.path.isfile(DEFAULT_LARK_CLI) and os.access(DEFAULT_LARK_CLI, os.X_OK):
        return DEFAULT_LARK_CLI
    discovered = shutil.which("lark-cli")
    if discovered:
        return discovered
    trae_cli = "/Users/opay-20260271/.trae-cn/plugins/trae-remote-official/lark/1.0.7/bin/lark-cli"
    if os.path.isfile(trae_cli) and os.access(trae_cli, os.X_OK):
        return trae_cli
    raise RuntimeError("lark-cli executable was not found")


def _is_app_id(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("cli_") and len(value) >= 18


def _walk(node: Any) -> Iterable[Tuple[str, Any]]:
    if isinstance(node, dict):
        for key, value in node.items():
            yield key, value
            yield from _walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value)


def _extract_token_and_app_id(data: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    raw = data.get("raw") or ""
    parsed_raw: Any = {}
    if isinstance(raw, str) and raw:
        try:
            parsed_raw = json.loads(raw)
        except (TypeError, ValueError):
            parsed_raw = {}

    candidates: List[Any] = []
    result = data.get("result") or data.get("Result")
    if isinstance(result, list):
        candidates.append(result)
    if isinstance(parsed_raw, dict) and isinstance(parsed_raw.get("Result"), list):
        candidates.append(parsed_raw["Result"])

    token: Optional[str] = None
    app_id: Optional[str] = None
    for candidate in candidates:
        for item in candidate:
            if not isinstance(item, dict):
                continue
            provider = str(item.get("Type", "")).lower()
            if provider not in ("feishu", "lark"):
                continue
            token = item.get("AccessToken") or item.get("accessToken") or token
            app_id = (
                item.get("AppID")
                or item.get("AppId")
                or item.get("ClientID")
                or item.get("ClientId")
                or app_id
            )

    if not token:
        for key, value in _walk(parsed_raw):
            normalized = str(key).lower().replace("_", "")
            if normalized == "accesstoken" and isinstance(value, str) and value:
                token = value
                break

    if not app_id:
        for key, value in _walk(parsed_raw):
            if str(key).lower().replace("_", "") in ("appid", "clientid") and _is_app_id(value):
                app_id = value
                break

    if not token:
        raise RuntimeError("authorization response returned no Feishu access token")
    if not app_id:
        brand = _env("LARKSUITE_CLI_BRAND", DEFAULT_BRAND).lower()
        app_id = FALLBACK_APP_IDS.get(brand, FALLBACK_APP_IDS[DEFAULT_BRAND])
    return token, app_id


def fetch_trae_access_token() -> Tuple[str, str]:
    path = trae_jwt_path()
    try:
        with open(path, "r", encoding="utf-8") as handle:
            jwt = handle.read().strip()
    except (OSError, UnicodeError) as exc:
        raise RuntimeError("TRAE session JWT is unavailable") from exc
    if not jwt:
        raise RuntimeError("TRAE session JWT is empty")

    request = urllib.request.Request(
        trae_token_url(),
        data=json.dumps({"Types": ["feishu", "lark"]}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "x-cloudide-token": jwt},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"TRAE authorization exchange failed with HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError("TRAE authorization service is unavailable") from exc

    try:
        data = json.loads(payload)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("TRAE authorization service returned invalid JSON") from exc
    if not isinstance(data, dict):
        raise RuntimeError("TRAE authorization service returned an invalid response")
    try:
        return _extract_token_and_app_id(data)
    except RuntimeError as exc:
        raise RuntimeError("TRAE authorization response has no Feishu access token") from exc


def bridge_health() -> str:
    jwt_path = trae_jwt_path()
    result = {
        "ok": os.path.isfile(jwt_path) and os.access(jwt_path, os.R_OK),
        "jwt_path_available": os.path.isfile(jwt_path) and os.access(jwt_path, os.R_OK),
        "lark_cli": resolve_lark_cli(),
    }
    if not result["ok"]:
        result["error"] = "TRAE session JWT is unavailable"
    return json.dumps(result, ensure_ascii=False)



def validate_lark_args(args: Sequence[str]) -> None:
    if not args or any(not isinstance(value, str) for value in args):
        raise ValueError("lark_run requires a non-empty array of strings")
    command = tuple(args[:2])
    if command in BLOCKED_LOCAL_COMMANDS:
        raise ValueError("local lark-cli authorization commands are not allowed")
    if args[0] in {"auth", "config", "profile"}:
        raise ValueError("local lark-cli authorization commands are not allowed")


def _redact(text: str, secret: str) -> str:
    return text.replace(secret, "<REDACTED>") if secret else text


def run_lark(args: Sequence[str], timeout: int = DEFAULT_TIMEOUT) -> Tuple[bool, str]:
    validate_lark_args(args)
    if timeout < 1 or timeout > MAX_TIMEOUT:
        raise ValueError(f"timeout must be between 1 and {MAX_TIMEOUT} seconds")

    token, app_id = fetch_trae_access_token()
    env = os.environ.copy()
    env["LARKSUITE_CLI_BRAND"] = _env("LARKSUITE_CLI_BRAND", DEFAULT_BRAND)
    env["LARKSUITE_CLI_USER_ACCESS_TOKEN"] = token
    env["LARKSUITE_CLI_APP_ID"] = app_id
    command = [resolve_lark_cli(), *args]

    try:
        process = subprocess.run(
            command,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return True, f"lark-cli timed out after {timeout}s"
    except OSError as exc:
        return True, f"failed to start lark-cli: {exc}"

    stdout = _redact(process.stdout or "", token)
    stderr = _redact(process.stderr or "", token)
    output = stdout
    if stderr.strip():
        output = f"{stdout}\n[stderr]\n{stderr}" if stdout else f"[stderr]\n{stderr}"
    return process.returncode != 0, output


def build_tool_definitions() -> List[Dict[str, Any]]:
    return [
        {
            "name": "bridge_health",
            "description": "Check whether the local TRAE session JWT and lark-cli are available. This does not request a Feishu access token.",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "lark_whoami",
            "description": "Report the current Feishu identity through a token exchanged from TRAE's live session JWT. The token is fetched only when this tool is called.",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "lark_run",
            "description": "Run a lark-cli command against Feishu/Lark using a token exchanged from TRAE's live session JWT. The token is fetched only when this tool is called.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "args": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Arguments passed to lark-cli, for example [\"docs\", \"+fetch\", \"--doc\", \"https://feishu.cn/docx/...\"].",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": f"Command timeout in seconds, from 1 to {MAX_TIMEOUT}.",
                    },
                },
                "required": ["args"],
            },
        },
    ]


def handle_tool_call(name: str, arguments: Optional[Dict[str, Any]]) -> Tuple[bool, str]:
    arguments = arguments or {}
    if name == "bridge_health":
        return False, bridge_health()
    if name == "lark_whoami":
        return run_lark(["whoami"], timeout=30)
    if name == "lark_run":
        args = arguments.get("args")
        timeout = arguments.get("timeout", DEFAULT_TIMEOUT)
        if not isinstance(timeout, int) or isinstance(timeout, bool):
            raise ValueError("timeout must be an integer")
        return run_lark(args, timeout=timeout)
    raise ValueError(f"unknown tool: {name}")


def send(message: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except (TypeError, ValueError):
            continue

        method = message.get("method")
        request_id = message.get("id")
        if method == "initialize":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": NAME, "version": VERSION},
                    },
                }
            )
        elif method == "notifications/initialized":
            continue
        elif method == "ping":
            send({"jsonrpc": "2.0", "id": request_id, "result": {}})
        elif method == "tools/list":
            send({"jsonrpc": "2.0", "id": request_id, "result": {"tools": build_tool_definitions()}})
        elif method == "tools/call":
            params = message.get("params") or {}
            try:
                is_error, text = handle_tool_call(params.get("name"), params.get("arguments"))
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "content": [{"type": "text", "text": text}],
                            "isError": is_error,
                        },
                    }
                )
            except Exception as exc:  # noqa: BLE001
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "content": [{"type": "text", "text": f"{type(exc).__name__}: {exc}"}],
                            "isError": True,
                        },
                    }
                )
        else:
            send(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32601, "message": f"method not found: {method}"},
                }
            )


if __name__ == "__main__":
    main()
