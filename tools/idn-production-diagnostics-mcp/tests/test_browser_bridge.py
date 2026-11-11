import json
import threading
import unittest
from urllib.parse import urlparse

from browser_bridge import BrowserBridge, BrowserBridgeClient, validate_bridge_request


class BridgeTest(unittest.TestCase):
    def test_bridge_only_accepts_fixed_kibana_read_only_endpoint(self):
        validate_bridge_request(
            "https://log.rupiahcepatweb.com",
            "/internal/search/es",
            {"params": [{"index": "*whatsapp*"}]},
        )

        with self.assertRaises(ValueError):
            validate_bridge_request("https://example.com", "/internal/search/es", {})
        with self.assertRaises(ValueError):
            validate_bridge_request("https://log.rupiahcepatweb.com", "/api/saved_objects", {})

    def test_bridge_client_submits_request_and_returns_browser_response(self):
        bridge = BrowserBridge(host="127.0.0.1", port=0)
        bridge.start()
        try:
            client = BrowserBridgeClient(bridge.base_url, timeout=2)
            result_holder = {}

            def call_client():
                try:
                    result_holder["result"] = client.post_json(
                        "https://log.rupiahcepatweb.com",
                        "/internal/search/es",
                        {"params": [{"index": "*whatsapp*"}]},
                        {"Content-Type": "application/json"},
                        json_body=True,
                    )
                except Exception as exc:
                    result_holder["error"] = exc

            worker = threading.Thread(target=call_client)
            worker.start()
            request = bridge.next_request(timeout=1)
            self.assertEqual(request["url"], "https://log.rupiahcepatweb.com/internal/search/es")
            self.assertEqual(request["payload"]["params"][0]["index"], "*whatsapp*")
            bridge.complete(request["id"], 200, {"rows": [{"message": "ok"}]})
            worker.join(timeout=1)
            self.assertNotIn("error", result_holder)
            self.assertEqual(result_holder["result"], {"rows": [{"message": "ok"}]})
        finally:
            bridge.stop()

    def test_bridge_request_does_not_forward_auth_headers(self):
        bridge = BrowserBridge(host="127.0.0.1", port=0)
        bridge.start()
        try:
            client = BrowserBridgeClient(bridge.base_url, timeout=2)
            result_holder = {}

            def call_client():
                try:
                    result_holder["result"] = client.post_json(
                        "https://log.rupiahcepatweb.com",
                        "/internal/search/es",
                        {"params": [{"index": "*whatsapp*"}]},
                        {"Cookie": "sessionid=secret", "Authorization": "Bearer secret"},
                        json_body=True,
                    )
                except Exception as exc:
                    result_holder["error"] = exc

            worker = threading.Thread(target=call_client)
            worker.start()
            request = bridge.next_request(timeout=1)
            self.assertNotIn("Cookie", request["headers"])
            self.assertNotIn("Authorization", request["headers"])
            self.assertNotIn("token=", request.get("url", ""))
            bridge.complete(request["id"], 200, {})
            worker.join(timeout=1)
            self.assertNotIn("error", result_holder)
        finally:
            bridge.stop()


if __name__ == "__main__":
    unittest.main()

class ExtensionContractTest(unittest.TestCase):
    def test_extension_uses_page_context_and_does_not_request_cookie_access(self):
        from pathlib import Path

        root = Path(__file__).resolve().parents[1]
        manifest = json.loads((root / "browser_extension" / "manifest.json").read_text())
        service_worker = (root / "browser_extension" / "service_worker.js").read_text()
        self.assertEqual(manifest["manifest_version"], 3)
        self.assertIn("scripting", manifest["permissions"])
        self.assertNotIn("cookies", manifest["permissions"])
        self.assertIn("chrome.scripting.executeScript", service_worker)
        self.assertIn("setInterval", service_worker)
        self.assertIn("POLL_MS", service_worker)
        self.assertIn('world: "MAIN"', service_worker)
        self.assertIn('credentials: "include"', service_worker)
        self.assertIn("https://log.rupiahcepatweb.com/*", manifest["host_permissions"])
        self.assertNotIn("chrome.cookies", service_worker)

class BridgeErrorTest(unittest.TestCase):
    def test_client_includes_bridge_error_body_in_failure(self):
        import browser_bridge

        class Response:
            status_code = 400

            def json(self):
                return {"error": "browser script failed"}

        original = browser_bridge.requests.post
        browser_bridge.requests.post = lambda *args, **kwargs: Response()
        try:
            client = BrowserBridgeClient("http://127.0.0.1:18765")
            with self.assertRaisesRegex(RuntimeError, "browser script failed"):
                client.post_json(
                    "https://log.rupiahcepatweb.com",
                    "/internal/search/es",
                    {"params": [{"index": "*whatsapp*"}]},
                    {},
                    json_body=True,
                )
        finally:
            browser_bridge.requests.post = original

class KibanaResponseErrorTest(unittest.TestCase):
    def test_client_includes_kibana_error_body_when_browser_request_is_rejected(self):
        bridge = BrowserBridge(host="127.0.0.1", port=0)
        bridge.start()
        try:
            client = BrowserBridgeClient(bridge.base_url, timeout=2)
            result_holder = {}

            def call_client():
                try:
                    result_holder["result"] = client.post_json(
                        "https://log.rupiahcepatweb.com",
                        "/internal/search/es",
                        {"params": [{"index": "*whatsapp*"}]},
                        {},
                        json_body=True,
                    )
                except Exception as exc:
                    result_holder["error"] = exc

            worker = threading.Thread(target=call_client)
            worker.start()
            request = bridge.next_request(timeout=1)
            bridge.complete(request["id"], 400, {"message": "invalid search body"})
            worker.join(timeout=1)
            self.assertIn("invalid search body", str(result_holder["error"]))
        finally:
            bridge.stop()
