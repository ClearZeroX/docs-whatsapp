import json
import queue
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import requests


BRIDGE_HOST = "127.0.0.1"
BRIDGE_PORT = 18765
BRIDGE_TOKEN = "idn-prod-log-bridge-v1"
KIBANA_BASE_URL = "https://log.rupiahcepatweb.com"
KIBANA_PATH = "/internal/search/es"
KIBANA_DATA_VIEW = "*whatsapp*"


def _request_url(base_url, path):
    parsed = urlparse(base_url)
    if parsed.scheme != "https" or parsed.netloc != "log.rupiahcepatweb.com" or path != KIBANA_PATH:
        raise ValueError("Browser bridge endpoint is not allowed")
    return base_url.rstrip("/") + path


def validate_bridge_request(base_url, path, payload):
    _request_url(base_url, path)
    if not isinstance(payload, dict) or not isinstance(payload.get("params"), list) or len(payload["params"]) != 1:
        raise ValueError("Browser bridge accepts one Kibana search request")
    request = payload["params"][0]
    if not isinstance(request, dict) or request.get("index") != KIBANA_DATA_VIEW:
        raise ValueError("Browser bridge data view is fixed to *whatsapp*")
    if any(key not in {"index", "query", "size", "sort", "runtime_mappings", "params"} for key in request):
        raise ValueError("Browser bridge request contains unsupported fields")
    if request.get("size", 0) > 500:
        raise ValueError("Browser bridge result size is too large")


class BrowserBridge:
    def __init__(self, host=BRIDGE_HOST, port=BRIDGE_PORT, token=BRIDGE_TOKEN):
        self.host = host
        self.port = port
        self.token = token
        self._requests = queue.Queue()
        self._pending = {}
        self._lock = threading.Lock()
        self._server = None
        self._thread = None

    @property
    def base_url(self):
        if self._server is None:
            return "http://%s:%s" % (self.host, self.port)
        return "http://%s:%s" % (self.host, self._server.server_address[1])

    def start(self):
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format_string, *args):
                return

            def _authorized(self):
                return self.headers.get("X-IDN-Bridge-Token") == bridge.token

            def _send_json(self, status, body):
                encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, X-IDN-Bridge-Token")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def _read_json(self):
                length = int(self.headers.get("Content-Length", "0"))
                return json.loads(self.rfile.read(length).decode("utf-8"))

            def do_OPTIONS(self):
                self.send_response(204)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, X-IDN-Bridge-Token")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.end_headers()

            def do_GET(self):
                if not self._authorized():
                    self._send_json(403, {"error": "bridge authorization failed"})
                    return
                if self.path.split("?", 1)[0] != "/next":
                    self._send_json(404, {"error": "not found"})
                    return
                try:
                    request_id = bridge._requests.get(timeout=1)
                except queue.Empty:
                    self.send_response(204)
                    self.end_headers()
                    return
                with bridge._lock:
                    item = bridge._pending.get(request_id)
                if item is None:
                    self._send_json(404, {"error": "request expired"})
                    return
                self._send_json(200, {"id": request_id, "url": item["url"], "payload": item["payload"], "headers": item["headers"]})

            def do_POST(self):
                if not self._authorized():
                    self._send_json(403, {"error": "bridge authorization failed"})
                    return
                route = self.path.split("?", 1)[0]
                try:
                    body = self._read_json()
                    if route == "/request":
                        result = bridge._submit(body)
                        self._send_json(200, result)
                    elif route == "/complete":
                        bridge.complete(body["id"], body.get("status"), body.get("body"), body.get("error"))
                        self._send_json(200, {"ok": True})
                    else:
                        self._send_json(404, {"error": "not found"})
                except Exception as exc:
                    self._send_json(400, {"error": str(exc)})

        self._server = ThreadingHTTPServer((self.host, self.port), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    def stop(self):
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None

    def next_request(self, timeout=None):
        request_id = self._requests.get(timeout=timeout)
        with self._lock:
            item = self._pending[request_id]
        return {"id": request_id, **item}

    def _submit(self, body):
        url = body.get("url", "")
        parsed = urlparse(url)
        base_url = parsed.scheme + "://" + parsed.netloc
        path = parsed.path
        payload = body.get("payload")
        validate_bridge_request(base_url, path, payload)
        headers = {key: value for key, value in (body.get("headers") or {}).items() if key.lower() not in {"cookie", "authorization", "proxy-authorization"}}
        request_id = uuid.uuid4().hex
        event = threading.Event()
        item = {"url": url, "payload": payload, "headers": headers, "event": event, "result": None}
        with self._lock:
            self._pending[request_id] = item
        self._requests.put(request_id)
        if not event.wait(120):
            with self._lock:
                self._pending.pop(request_id, None)
            raise TimeoutError("Browser bridge did not receive a browser response")
        with self._lock:
            result = self._pending.pop(request_id, {}).get("result")
        if result is None:
            raise RuntimeError("Browser bridge returned no response")
        if result.get("error"):
            raise RuntimeError(result["error"])
        if result.get("status") != 200:
            detail = result.get("body")
            if isinstance(detail, dict):
                detail = detail.get("message") or detail.get("error") or detail.get("statusCode") or detail
            if detail:
                raise RuntimeError("Kibana read-only request failed with HTTP status %s: %s" % (result.get("status"), detail))
            raise RuntimeError("Kibana read-only request failed with HTTP status %s" % result.get("status"))
        return result.get("body")

    def complete(self, request_id, status, body=None, error=None):
        with self._lock:
            item = self._pending.get(request_id)
            if item is None:
                raise ValueError("Unknown browser bridge request")
            item["result"] = {"status": status, "body": body, "error": error}
            item["event"].set()


class BrowserBridgeClient:
    def __init__(self, base_url, token=BRIDGE_TOKEN, timeout=120):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def post_json(self, base_url, path, payload, headers=None, json_body=False):
        validate_bridge_request(base_url, path, payload)
        forwarded_headers = {key: value for key, value in (headers or {}).items() if key.lower() not in {"cookie", "authorization", "proxy-authorization"}}
        request = {"url": _request_url(base_url, path), "payload": payload, "headers": forwarded_headers}
        response = requests.post(
            self.base_url + "/request",
            headers={"Content-Type": "application/json", "X-IDN-Bridge-Token": self.token},
            json=request,
            timeout=self.timeout,
        )
        try:
            body = response.json()
        except ValueError:
            body = {}
        if response.status_code != 200:
            detail = body.get("error") if isinstance(body, dict) else None
            suffix = ": " + str(detail) if detail else ""
            raise RuntimeError("Browser bridge request failed with HTTP status %s%s" % (response.status_code, suffix))
        if "error" in body:
            raise RuntimeError(body["error"])
        return body
