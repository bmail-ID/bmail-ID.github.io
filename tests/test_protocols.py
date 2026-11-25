"""End-to-end tests of the four bMail protocols plus registration and onboarding."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.common import ProtocolError  # noqa: E402
from backend.crypto import jws  # noqa: E402
from backend.network import seed  # noqa: E402


class SeedTest(unittest.TestCase):
    def test_seed_matches_prototype_headline_figures(self):
        s = seed().state()
        self.assertEqual(s["isp"]["registered_users"], 24831)
        users = {d["domain"]: d["users"] for d in s["isp"]["domains"]}
        self.assertEqual(users, {"bgmail.com": 18402, "bnaver.com": 5210, "bcoremail.com": 1219})
        self.assertEqual(s["bcas"]["kt"]["certified"], 14221)

    def test_zero_copy_isp_holds_no_personal_data(self):
        n = seed()
        dump = json.dumps(n.isp.view(), default=list)
        for name in ("Jiyeon Park", "Hyunjun Lee", "Sunmi Choi", "KT-1001", "+82-10-1111"):
            self.assertNotIn(name, dump)
        # and the certificate the ISP holds carries none either
        _, cert = jws.peek(n.isp.accounts["j.park@bgmail.com"]["certificate"])
        self.assertNotIn("name", cert)


class RegistrationTest(unittest.TestCase):
    def setUp(self):
        self.n = seed()

    def test_register_then_certify(self):
        tok = self.n.bca("kt").grant_consent("KT-1002", "new.user@bgmail.com")
        acct = self.n.isp.register("bgmail.com", "new.user", "real", "kt", tok,
                                   [{"kind": "email", "value": "x@example.org"}], True, True)
        self.assertEqual(acct["status"], "pending-certification")
        self.n.bca("kt").issue(acct["bca_request"])
        self.assertEqual(self.n.isp.accounts["new.user@bgmail.com"]["status"], "active")

    def test_rules(self):
        tok = self.n.bca("kt").grant_consent("KT-1002", "a.b@bgmail.com")
        ch = [{"kind": "email", "value": "x@example.org"}]
        with self.assertRaises(ProtocolError):   # no backup channel
            self.n.isp.register("bgmail.com", "a.b", "real", "kt", tok, [], True, True)
        with self.assertRaises(ProtocolError):   # missing consent
            self.n.isp.register("bgmail.com", "a.b", "real", "kt", tok, ch, True, False)
        with self.assertRaises(ProtocolError):   # fake domain
            self.n.isp.register("bgmail.net", "a.b", "real", "kt", tok, ch, True, True)
        with self.assertRaises(ProtocolError):   # bCA not partner of domain
            self.n.isp.register("bgmail.com", "a.b", "real", "kb", tok, ch, True, True)
        with self.assertRaises(ProtocolError):   # SKT pending until onboarding
            self.n.isp.register("bgmail.com", "a.b", "real", "skt", tok, ch, True, True)
        with self.assertRaises(ProtocolError):  # consent for another address
            self.n.isp.register("bgmail.com", "other", "real", "kt", tok, ch, True, True)

    def test_anonymous_pseudonym_generated(self):
        tok_addr = "%s@bgmail.com" % self.n.isp._fresh_pseudonym("bgmail.com")
        tok = self.n.bca("kt").grant_consent("KT-1002", tok_addr)
        acct = self.n.isp.register("bgmail.com", "", "anon", "kt", tok,
                                   [{"kind": "email", "value": "x@example.org"}], True, True)
        self.assertEqual(acct["bmail_id"], tok_addr)


class PortalTest(unittest.TestCase):
    def test_three_outcomes(self):
        isp = seed().isp
        self.assertEqual(isp.check_domain("bgmail.com")["result"], "certified")
        self.assertEqual(isp.check_domain("someone@BGMAIL.com")["result"], "certified")
        self.assertEqual(isp.check_domain("bgmail.net")["result"], "fake")
        self.assertEqual(isp.check_domain("gmail.com")["result"], "unregistered")
        self.assertEqual(isp.intercepts[0]["domain"], "bgmail.net")


class IdentificationTest(unittest.TestCase):
    def test_approve_gives_receiver_verifiable_certificate(self):
        n = seed()
        r = n.isp.request_identification("Shop X", "h.lee@bgmail.com", "seller check")
        n.isp.notify_sender(r["id"])
        n.isp.sender_decides(r["id"], True)
        _, cert = jws.decode(r["certificate"], n.isp.trusted_bca_keys(), "bmail-identification")
        self.assertEqual((cert["sub"], cert["aud"], cert["identifiable"]), ("h.lee@bgmail.com", "Shop X", True))

    def test_decline(self):
        n = seed()
        r = n.isp.request_identification("Shop X", "h.lee@bgmail.com", "x")
        n.isp.notify_sender(r["id"])
        n.isp.sender_decides(r["id"], False)
        self.assertEqual(r["status"], "declined")
        self.assertNotIn("certificate", r)


class VerificationTest(unittest.TestCase):
    def test_phishing_uses_backup_channel_only(self):
        n = seed()
        r = next(x for x in n.isp.requests if x["kind"] == "verification")
        n.isp.process_verification(r["id"])
        msg = n.outbox.messages[0]
        self.assertEqual(msg["channel"], "messenger")
        self.assertNotEqual(msg["to"], "h.lee@bgmail.com")
        with self.assertRaises(ProtocolError):
            n.isp.sender_responds(r["id"], "000000" if r["code"] != "000000" else "111111", False)
        n.isp.sender_responds(r["id"], r["code"], False)
        self.assertEqual(r["status"], "phishing-confirmed")
        self.assertIn("password-reset-required", n.isp.accounts["h.lee@bgmail.com"]["flags"])
        self.assertEqual(n.outbox.messages[0]["to"], "kim.s@example.com")


class ChangeTest(unittest.TestCase):
    def test_change_preserves_history(self):
        n = seed()
        r = n.isp.request_id_change("j.park@bgmail.com", "jpark@univ.edu", ["univ", "coupang", "kakao"])
        self.assertEqual(r["platforms"], ["univ", "coupang"])   # KakaoTalk has not joined
        n.bca("kt").issue(r["bca_request"])
        n.isp.issue_change_tokens(r["id"])
        self.assertEqual(r["results"]["univ"]["result"], "remapped")
        self.assertEqual(r["results"]["coupang"]["result"], "no-change")
        m = n.platform("univ")._by_login("j.park@bgmail.com")
        self.assertEqual(m["history"][0]["from"], "jpark@univ.edu")

    def test_bca_refuses_when_owner_differs(self):
        n = seed()
        r = n.isp.request_id_change("h.lee@bgmail.com", "jpark@univ.edu", ["univ"])
        with self.assertRaises(ProtocolError):
            n.bca("kt").issue(r["bca_request"])

    def test_forged_and_replayed_tokens_rejected(self):
        n = seed()
        univ = n.platform("univ")
        evil = jws.KeyPair.generate(n.isp.key.kid)  # same kid, wrong key
        forged = jws.encode({"aud": "univ", "old_id": "jpark@univ.edu", "new_id": "evil@bgmail.com",
                             "nonce": "N1", "bca": "bca:kt", "exp": 2 ** 40}, evil, typ="bmail-id-change")
        self.assertEqual(univ.apply_change_token(forged)["result"], "rejected")
        good = jws.encode({"aud": "univ", "old_id": "jpark@univ.edu", "new_id": "j.park@bgmail.com",
                           "nonce": "N2", "bca": "bca:kt", "exp": 2 ** 40}, n.isp.key, typ="bmail-id-change")
        self.assertEqual(univ.apply_change_token(good)["result"], "remapped")
        self.assertEqual(univ.apply_change_token(good)["result"], "rejected")  # replay


class ScenarioTest(unittest.TestCase):
    def test_four_transactions_in_order(self):
        n = seed()
        with self.assertRaises(ProtocolError):
            n.run_step("t2")
        for s in ("t1", "t2", "t3", "t4"):
            self.assertTrue(n.run_step(s))
        m = n.platform("amazon")._by_login("alex.morgan@bgmail.com")
        self.assertEqual((m["kind"], m["certified_by"]), ("bMember", "SKT"))
        self.assertEqual(n.platform("amazon").trust_tier("alex.morgan@bgmail.com"), "Identifiable author")


if __name__ == "__main__":
    unittest.main()
