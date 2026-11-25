"""Smoke test of the HTTP layer on a throw-away port."""
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.api import App, make_handler  # noqa: E402


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(App()))
        cls.base = "http://127.0.0.1:%d" % cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def call(self, method, path, body=None):
        req = urllib.request.Request(self.base + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_index_served(self):
        with urllib.request.urlopen(self.base + "/") as r:
            self.assertIn(b"bMail ID Infrastructure", r.read())

    def test_state_and_portal(self):
        st, s = self.call("GET", "/api/state")
        self.assertEqual((st, s["current_user"]), (200, "j.park@bgmail.com"))
        self.assertEqual(self.call("GET", "/api/portal/domains/b-gmail.com")[1]["result"], "fake")

    def test_registration_over_http(self):
        _, c = self.call("POST", "/api/bca/kt/consent", {"subscriber_id": "KT-1002", "bmail_id": "http.user@bgmail.com"})
        st, acct = self.call("POST", "/api/isp/register", {
            "domain": "bgmail.com", "local": "http.user", "mode": "real", "bca_id": "kt",
            "consent_token": c["consent_token"], "backup_channels": [{"kind": "email", "value": "h@example.org"}],
            "consent_certify": True, "consent_identifiable": True})
        self.assertEqual((st, acct["status"]), (200, "pending-certification"))
        st, _ = self.call("POST", "/api/bca/kt/requests/%s/issue" % acct["bca_request"], {})
        self.assertEqual(st, 200)

    def test_errors_are_json(self):
        st, body = self.call("POST", "/api/bca/kt/consent", {"subscriber_id": "nobody", "bmail_id": "x@bgmail.com"})
        self.assertEqual(st, 404)
        self.assertIn("error", body)


if __name__ == "__main__":
    unittest.main()
