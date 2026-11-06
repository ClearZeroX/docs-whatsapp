import importlib.util
import pathlib
from pathlib import Path
import subprocess
import sys
import unittest
import io
import json
import tempfile
import urllib.error


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "server.py"
spec = importlib.util.spec_from_file_location("trae_feishu_bridge_server", MODULE_PATH)
bridge = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = bridge
spec.loader.exec_module(bridge)


class BridgeTests(unittest.TestCase):
    def test_startup_does_not_read_trae_jwt(self):
        calls = []

        def fail_if_called(*args, **kwargs):
            calls.append((args, kwargs))
            raise AssertionError("TRAE JWT must not be read during tool registration")

        original = bridge.fetch_trae_access_token
        bridge.fetch_trae_access_token = fail_if_called
        try:
            tools = bridge.build_tool_definitions()
        finally:
            bridge.fetch_trae_access_token = original

        self.assertEqual(
            {tool["name"] for tool in tools},
            {"bridge_health", "lark_whoami", "lark_run"},
        )
        self.assertEqual(calls, [])

    def test_lark_call_fetches_token_at_call_time(self):
        calls = []

        def fake_fetch():
            calls.append("token")
            return "live-token", "cli_test_app"

        def fake_run(command, env, timeout, capture_output, text, check):
            calls.append((command, env["LARKSUITE_CLI_USER_ACCESS_TOKEN"], timeout))
            return subprocess.CompletedProcess(command, 0, '{"ok":true}', "")

        original_fetch = bridge.fetch_trae_access_token
        original_resolve = bridge.resolve_lark_cli
        original_run = bridge.subprocess.run
        bridge.fetch_trae_access_token = fake_fetch
        bridge.resolve_lark_cli = lambda: "/usr/local/bin/lark-cli"
        bridge.subprocess.run = fake_run
        try:
            is_error, text = bridge.run_lark(["docs", "+fetch", "--doc", "doc-token"])
        finally:
            bridge.fetch_trae_access_token = original_fetch
            bridge.resolve_lark_cli = original_resolve
            bridge.subprocess.run = original_run

        self.assertFalse(is_error)
        self.assertEqual(text, '{"ok":true}')
        self.assertEqual(
            calls,
            [
                "token",
                (["/usr/local/bin/lark-cli", "docs", "+fetch", "--doc", "doc-token"], "live-token", 120),
            ],
        )

    def test_trae_token_exchange_uses_current_jwt_without_leaking_it(self):
        jwt = "jwt-secret-value"
        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps({
                    "Result": [{"Type": "feishu", "AccessToken": "live-token"}]
                }).encode("utf-8")

        def fake_open(request, timeout):
            captured["url"] = request.full_url
            captured["headers"] = dict(request.header_items())
            captured["body"] = request.data
            captured["timeout"] = timeout
            return FakeResponse()

        with tempfile.TemporaryDirectory() as directory:
            token_path = Path(directory) / "trae-jwt-token"
            token_path.write_text(jwt, encoding="utf-8")
            original_open = bridge.urllib.request.urlopen
            original_path = bridge.trae_jwt_path
            bridge.urllib.request.urlopen = fake_open
            bridge.trae_jwt_path = lambda: str(token_path)
            try:
                token, app_id = bridge.fetch_trae_access_token()
            finally:
                bridge.urllib.request.urlopen = original_open
                bridge.trae_jwt_path = original_path

        self.assertEqual(token, "live-token")
        self.assertTrue(app_id.startswith("cli_"))
        self.assertEqual(captured["url"], "https://api.trae.cn/trae/api/v3/GetThirdPartyToken")
        self.assertEqual(captured["headers"]["X-cloudide-token"], jwt)
        self.assertEqual(json.loads(captured["body"].decode("utf-8")), {"Types": ["feishu", "lark"]})
        self.assertEqual(captured["timeout"], 20)

    def test_trae_token_exchange_error_does_not_include_jwt(self):
        jwt = "jwt-secret-value"

        def fake_open(*args, **kwargs):
            raise urllib.error.HTTPError(
                url="https://api.trae.cn/trae/api/v3/GetThirdPartyToken",
                code=401,
                msg="unauthorized",
                hdrs=None,
                fp=io.BytesIO(),
            )

        with tempfile.TemporaryDirectory() as directory:
            token_path = Path(directory) / "trae-jwt-token"
            token_path.write_text(jwt, encoding="utf-8")
            original_open = bridge.urllib.request.urlopen
            original_path = bridge.trae_jwt_path
            bridge.urllib.request.urlopen = fake_open
            bridge.trae_jwt_path = lambda: str(token_path)
            try:
                with self.assertRaises(RuntimeError) as context:
                    bridge.fetch_trae_access_token()
            finally:
                bridge.urllib.request.urlopen = original_open
                bridge.trae_jwt_path = original_path

        self.assertNotIn(jwt, str(context.exception))
        self.assertIn("TRAE", str(context.exception))

    def test_local_auth_commands_are_rejected(self):
        for args in (["auth", "login"], ["config", "init"], ["profile", "use", "other"]):
            with self.subTest(args=args):
                with self.assertRaisesRegex(ValueError, "not allowed"):
                    bridge.validate_lark_args(args)


if __name__ == "__main__":
    unittest.main()
