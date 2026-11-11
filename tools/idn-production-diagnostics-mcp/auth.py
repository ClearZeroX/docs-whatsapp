class ChromeSessionFactory:
    def __init__(self, cookie_loader=None):
        self.cookie_loader = cookie_loader or self._load_cookies

    @staticmethod
    def _load_cookies(domain):
        try:
            import browser_cookie3
        except ImportError as exc:
            raise RuntimeError("browser_cookie3 is required to use the Chrome session") from exc
        return list(browser_cookie3.chrome(domain_name=domain))

    def build(self, domain):
        import requests

        cookies = self.cookie_loader(domain)
        sessionids = [cookie for cookie in cookies if cookie.name == "sessionid" and cookie.path == "/"]
        if not sessionids:
            sessionids = [cookie for cookie in cookies if cookie.name == "sessionid"]
        if not sessionids:
            raise RuntimeError("No logged-in Chrome session found for the requested domain")
        sessionid = next((cookie for cookie in sessionids if cookie.expires), sessionids[0])
        csrf = next((cookie for cookie in cookies if cookie.name == "csrftoken"), None)
        session = requests.Session()
        session.headers.update({"User-Agent": "Mozilla/5.0 Chrome/140"})
        session.cookies.set("sessionid", sessionid.value, domain=domain, path="/")
        if csrf is not None:
            session.cookies.set("csrftoken", csrf.value, domain=domain, path="/")
        return session

