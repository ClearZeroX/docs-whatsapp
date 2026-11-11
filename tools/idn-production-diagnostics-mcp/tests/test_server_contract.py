import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ServerContractTest(unittest.TestCase):
    def test_tool_call_rejects_missing_idn_production_confirmation(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "server.py")],
            input=json.dumps({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "idn_prod_query_mysql", "arguments": {"table": "message_template"}},
            }) + "\n",
            text=True,
            capture_output=True,
            cwd=ROOT,
            check=True,
        )
        response = json.loads(result.stdout.strip())
        self.assertIn("error", response)
        self.assertIn("environmentConfirmation=idn-prod", response["error"]["message"])

    def test_tools_list_exposes_only_idn_production_tools(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "server.py")],
            input=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}) + "\n",
            text=True,
            capture_output=True,
            cwd=ROOT,
            check=True,
        )
        response = json.loads(result.stdout.strip())
        names = {tool["name"] for tool in response["result"]["tools"]}

        self.assertEqual(names, {
        "idn_prod_query_logs",
        "idn_prod_get_apollo_configs",
        "idn_prod_get_schema",
        "idn_prod_query_mysql",
        "idn_prod_count_mysql",
        "idn_prod_explain_mysql",
        "idn_prod_query_mongo",
        "idn_prod_count_mongo",
        "idn_prod_explain_mongo",
        })
        self.assertFalse(names.intersection({"query_logs", "query_mysql", "query_mongo"}))


    def test_initialize_identifies_indonesia_production_read_only_server(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "server.py")],
            input=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}) + "\n",
            text=True,
            capture_output=True,
            cwd=ROOT,
            check=True,
        )
        response = json.loads(result.stdout.strip())

        self.assertEqual(response["result"]["serverInfo"]["name"], "idn-production-diagnostics")
        self.assertEqual(response["result"]["instructions"], "idn-prod read-only diagnostics only")


if __name__ == "__main__":
    unittest.main()

class LogBridgeContractTest(unittest.TestCase):
    def test_log_tool_uses_browser_bridge_client_instead_of_chrome_cookie_factory(self):
        import server

        class FakeBridgeClient:
            def __init__(self):
                self.called = False

            def post_json(self, *args, **kwargs):
                self.called = True
                return {"rows": [{"message": "traceId:[abc] from browser"}]}

        fake_client = FakeBridgeClient()
        original = server._log_bridge_client
        server._log_bridge_client = lambda: fake_client
        try:
            result = server.call_tool(
                "idn_prod_query_logs",
                {
                    "environmentConfirmation": "idn-prod",
                    "traceId": "abc",
                    "timeStart": "now-1h",
                    "timeEnd": "now",
                },
            )
        finally:
            server._log_bridge_client = original
        self.assertTrue(fake_client.called)
        self.assertEqual(result["matchedTraceIds"], ["abc"])

class BridgeLifecycleContractTest(unittest.TestCase):
    def test_log_bridge_is_started_lazily_and_reused(self):
        import server

        original = server._log_bridge
        server._log_bridge = None
        try:
            first = server._log_bridge_client()
            second = server._log_bridge_client()
            self.assertEqual(first.base_url, second.base_url)
            self.assertIsNotNone(server._log_bridge)
        finally:
            if server._log_bridge is not None:
                server._log_bridge.stop()
            server._log_bridge = original


class ApolloContractTest(unittest.TestCase):
    def test_production_apollo_requires_bounded_context_and_reason(self):
        import server

        original = server.query_mysql
        server.query_mysql = lambda *args, **kwargs: {
            "rows": [{"config_key": "task.send.strategy", "config_value": "enabled", "status": 1}]
        }
        try:
            result = server.call_tool(
                "idn_prod_get_apollo_configs",
                {
                    "environmentConfirmation": "idn-prod",
                    "namespace": "application",
                    "keyKeyword": "task.send.strategy",
                    "source": "database",
                    "reason": "检查发送策略是否受配置影响",
                    "limit": 10,
                },
            )
        finally:
            server.query_mysql = original
        self.assertTrue(result["readOnly"])
        self.assertEqual(result["environment"], "idn-prod")
        self.assertEqual(result["database"]["rows"][0]["config_key"], "task.send.strategy")

    def test_production_apollo_rejects_unbounded_context(self):
        import server

        with self.assertRaises(ValueError):
            server.call_tool(
                "idn_prod_get_apollo_configs",
                {
                    "environmentConfirmation": "idn-prod",
                    "reason": "无范围读取",
                },
            )
