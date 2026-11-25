"""HTTP/JSON API and static file server (standard library only).

Every route maps to one protocol method of one party. The route prefix names the
party that acts: /api/isp/..., /api/bca/<id>/..., /api/platform/<id>/...,
/api/user/... (the user's own client) and /api/portal/... (public).

No authentication: as in the prototype, the sidebar lets the viewer act as any
party. See README "Not implemented".
"""
import json
import mimetypes
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from .common import ProtocolError
from .crypto import jws
from .network import seed

FRONTEND = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")


class App:
    def __init__(self):
        self.lock = threading.Lock()
        self.net = seed()
        self.routes = []
        r = self.route
        r("GET", r"/api/state", self.get_state)
        r("POST", r"/api/reset", self.reset)
        r("GET", r"/api/portal/domains/(?P<domain>[^/]+)", self.portal)
        r("GET", r"/api/isp/jwks", lambda q, b: self.net.isp.jwks())
        r("POST", r"/api/tokens/verify", self.verify_token)
        # registration
        r("POST", r"/api/bca/(?P<bca>[^/]+)/consent", self.consent)
        r("POST", r"/api/isp/register", self.register)
        r("POST", r"/api/bca/(?P<bca>[^/]+)/requests/(?P<rid>[^/]+)/issue",
          lambda q, b, bca, rid: self.net.bca(bca).issue(rid))
        r("POST", r"/api/bca/(?P<bca>[^/]+)/requests/(?P<rid>[^/]+)/reject",
          lambda q, b, bca, rid: self.net.bca(bca).reject(rid))
        # identifiability
        r("POST", r"/api/isp/requests/identification",
          lambda q, b: self.net.isp.request_identification(b.get("requester"), b.get("target"), b.get("purpose")))
        r("POST", r"/api/isp/requests/(?P<rid>[^/]+)/notify", lambda q, b, rid: self.net.isp.notify_sender(rid))
        r("POST", r"/api/isp/requests/(?P<rid>[^/]+)/reject", lambda q, b, rid: self.net.isp.reject_request(rid))
        r("POST", r"/api/user/requests/(?P<rid>[^/]+)/decide",
          lambda q, b, rid: self.net.isp.sender_decides(rid, bool(b.get("approve"))))
        # verification (phishing)
        r("POST", r"/api/isp/requests/verification",
          lambda q, b: self.net.isp.report_suspicious(b.get("receiver"), b.get("target"), b.get("note")))
        r("POST", r"/api/isp/requests/(?P<rid>[^/]+)/process",
          lambda q, b, rid: self.net.isp.process_verification(rid))
        r("POST", r"/api/user/verifications/(?P<rid>[^/]+)/respond",
          lambda q, b, rid: self.net.isp.sender_responds(rid, b.get("code"), bool(b.get("sent_by_me"))))
        # changeability
        r("POST", r"/api/isp/requests/id-change",
          lambda q, b: self.net.isp.request_id_change(b.get("target"), b.get("old_id"), b.get("platforms") or []))
        r("POST", r"/api/isp/requests/(?P<rid>[^/]+)/issue-token",
          lambda q, b, rid: self.net.isp.issue_change_tokens(rid))
        # backup channels
        r("POST", r"/api/user/backup-channels",
          lambda q, b: self.net.isp.add_backup_channel(b.get("bmail_id"), b.get("kind", "messenger"), b.get("value")))
        r("POST", r"/api/user/backup-channels/revalidate",
          lambda q, b: self.net.isp.revalidate_channels(b.get("bmail_id")))
        # platforms
        r("POST", r"/api/platform/(?P<pid>[^/]+)/enroll",
          lambda q, b, pid: self.net.platform(pid).enroll(b.get("bmail_id"), b.get("display_name")))
        r("POST", r"/api/platform/(?P<pid>[^/]+)/reviews",
          lambda q, b, pid: self.net.platform(pid).post_review(b.get("login"), b.get("stars", 5), b.get("text", "")))
        r("POST", r"/api/platform/(?P<pid>[^/]+)/reviews/(?P<rv>[^/]+)/remove",
          lambda q, b, pid, rv: self.net.platform(pid).remove_review(rv))
        r("POST", r"/api/platform/(?P<pid>[^/]+)/outreach/(?P<action>invite|deactivate)",
          lambda q, b, pid, action: self.net.platform(pid).outreach_action(b.get("login"), action, self.net.outbox))
        # guided scenario (the prototype's transaction panel)
        r("POST", r"/api/scenario/(?P<step>t[1-4])", lambda q, b, step: {"log": self.net.run_step(step)})

    def route(self, method, pattern, fn):
        self.routes.append((method, re.compile("^" + pattern + "$"), fn))

    # ------------------------------------------------------------ handlers
    def get_state(self, q, b):
        return self.net.state(q.get("user", [None])[0])

    def reset(self, q, b):
        self.net = seed()
        return {"reset": True}

    def portal(self, q, b, domain):
        return self.net.isp.check_domain(unquote(domain))

    def consent(self, q, b, bca):
        return {"consent_token": self.net.bca(bca).grant_consent(b.get("subscriber_id"), (b.get("bmail_id") or "").lower())}

    def register(self, q, b):
        acct = self.net.isp.register(b.get("domain"), b.get("local"), b.get("mode"), b.get("bca_id"),
                                     b.get("consent_token"), b.get("backup_channels"),
                                     b.get("consent_certify"), b.get("consent_identifiable"))
        from .network import Wallet
        self.net.wallets[acct["bmail_id"]] = Wallet(acct["bmail_id"], b.get("display_name") or "(anonymous)",
                                                    [(None, x) for x in b.get("legacy_logins", [])])
        return acct

    def verify_token(self, q, b):
        token = (b.get("token") or "").strip()
        keys = {self.net.isp.key.kid: self.net.isp.key.public}
        keys.update({x.key.kid: x.key.public for x in self.net.bcas.values()})
        try:
            header, payload = jws.decode(token, keys)
            return {"valid": True, "header": header, "payload": payload}
        except jws.TokenError as exc:
            try:
                header, payload = jws.peek(token)
            except jws.TokenError:
                header, payload = None, None
            return {"valid": False, "error": str(exc), "header": header, "payload": payload}

    def dispatch(self, method, path, query, body):
        for m, rx, fn in self.routes:
            match = rx.match(path)
            if m == method and match:
                with self.lock:
                    return 200, fn(query, body, **match.groupdict())
        return 404, {"error": "no route %s %s" % (method, path)}


def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        server_version = "bMailID/1.0"

        def log_message(self, fmt, *args):  # quieter console
            if "/api/state" not in (args[0] if args else ""):
                super().log_message(fmt, *args)

        def _send(self, status, body, ctype="application/json; charset=utf-8"):
            data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False, default=list).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _api(self, method):
            url = urlparse(self.path)
            body = {}
            if method == "POST":
                n = int(self.headers.get("Content-Length") or 0)
                if n:
                    try:
                        body = json.loads(self.rfile.read(n).decode("utf-8"))
                    except ValueError:
                        return self._send(400, {"error": "body is not JSON"})
            try:
                status, out = app.dispatch(method, url.path, parse_qs(url.query), body)
            except ProtocolError as exc:
                status, out = exc.status, {"error": str(exc)}
            except jws.TokenError as exc:
                status, out = 400, {"error": "token: %s" % exc}
            self._send(status, out)

        def do_POST(self):
            self._api("POST")

        def do_GET(self):
            url = urlparse(self.path)
            if url.path.startswith("/api/"):
                return self._api("GET")
            rel = "index.html" if url.path in ("/", "") else unquote(url.path.lstrip("/"))
            full = os.path.normpath(os.path.join(FRONTEND, rel))
            if not full.startswith(FRONTEND) or not os.path.isfile(full):
                return self._send(404, {"error": "not found"})
            with open(full, "rb") as fh:
                self._send(200, fh.read(), mimetypes.guess_type(full)[0] or "application/octet-stream")

    return Handler


def serve(host="127.0.0.1", port=8765):
    app = App()
    httpd = ThreadingHTTPServer((host, port), make_handler(app))
    print("bMail ID prototype running at http://%s:%d/  (Ctrl+C to stop)" % (host, port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
