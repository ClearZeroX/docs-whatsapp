from urllib.parse import urlparse


ALLOWED_ENDPOINTS = {
    "https://dbs.rupiahcepatweb.com": {"/query/"},
    "https://log.rupiahcepatweb.com": {"/internal/search/es"},
}


class ReadOnlyHttpClient:
    def __init__(self, session, transport=None):
        self.session = session
        self.transport = transport or session.post

    def post_json(self, base_url, path, payload, headers=None, json_body=False):
        parsed = urlparse(base_url)
        normalized = parsed.scheme + "://" + parsed.netloc
        if parsed.scheme != "https" or path not in ALLOWED_ENDPOINTS.get(normalized, set()):
            raise ValueError("HTTP endpoint is not allowed")
        request_kwargs = {"headers": headers or {}, "timeout": 60}
        request_kwargs["json" if json_body else "data"] = payload
        response = self.transport(base_url.rstrip("/") + path, **request_kwargs)
        if response.status_code != 200:
            raise RuntimeError("Read-only request failed with HTTP status %s" % response.status_code)
        try:
            body = response.json()
        except ValueError as exc:
            raise RuntimeError("Read-only endpoint returned non-JSON response") from exc
        return body

