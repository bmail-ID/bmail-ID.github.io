"""Wires the parties together and loads the prototype's demo data.

Each party is a separate object with its own private state; they talk only by
calling each other's protocol methods with signed tokens, which stands in for
the network. `seed()` creates the same people, domains and platforms the HTML
prototype shows, but runs them through the real protocols so every certificate
in the demo is a genuine Ed25519-signed token.
"""
from .bca import BCA
from .bmember import Platform
from .common import Outbox, ProtocolError, iso
from .isp import ISP


class Wallet:
    """The user's own client: what the user knows about themself.

    Display name and legacy logins live here, on the user's side — not at the ISP.
    """

    def __init__(self, bmail_id, display_name, legacy_logins=()):
        self.bmail_id = bmail_id
        self.display_name = display_name
        self.legacy_logins = list(legacy_logins)   # [(platform_id, login)]


class Network:
    def __init__(self):
        self.outbox = Outbox()
        self.isp = ISP("bmail-isp", self.outbox)
        self.bcas = {}
        self.platforms = {}
        self.wallets = {}
        self.scenario = {"t1": False, "t2": False, "t3": False, "t4": False}

    # ------------------------------------------------------------ helpers
    def bca(self, bca_id):
        if bca_id not in self.bcas:
            raise ProtocolError("no such bCA %r" % bca_id, 404)
        return self.bcas[bca_id]

    def platform(self, pid):
        if pid not in self.platforms:
            raise ProtocolError("no such platform %r" % pid, 404)
        return self.platforms[pid]

    def wallet(self, bmail_id):
        if bmail_id not in self.wallets:
            raise ProtocolError("no wallet for %r" % bmail_id, 404)
        return self.wallets[bmail_id]

    def enroll_user(self, bca_id, subscriber_id, domain, local, mode, channels, display_name,
                    legacy_logins=(), certify=True):
        """Full registration as the wizard does it: consent at bCA, register at ISP, bCA issues."""
        bmail_id = (local + "@" + domain).lower()
        consent = self.bca(bca_id).grant_consent(subscriber_id, bmail_id)
        acct = self.isp.register(domain, local, mode, bca_id, consent, channels, True, True)
        self.wallets[acct["bmail_id"]] = Wallet(acct["bmail_id"], display_name, legacy_logins)
        if certify:
            self.bca(bca_id).issue(acct["bca_request"])
        return acct

    def memberships(self, bmail_id):
        """Every platform account of this user, as the user's own client knows them."""
        w = self.wallet(bmail_id)
        logins = [(None, bmail_id)] + w.legacy_logins
        rows = []
        for pid, p in self.platforms.items():
            for want_pid, login in logins:
                if want_pid not in (None, pid):
                    continue
                m = p._by_login(login)
                if m:
                    rows.append({"platform_id": pid, "platform": p.name, "login": m["login"],
                                 "since": m["since"], "kind": m["kind"], "activity": m["activity"],
                                 "expiring": login != bmail_id and m["login"] != bmail_id,
                                 "protocol": self.isp.platforms.get(pid, {}).get("status") == "active"})
        return rows

    # ------------------------------------------------------------- views
    def state(self, current_user=None):
        users = sorted(self.wallets)
        default = "j.park@bgmail.com" if "j.park@bgmail.com" in self.wallets else (users[0] if users else None)
        current = current_user if current_user in self.wallets else default
        user = None
        if current:
            w = self.wallets[current]
            acct = self.isp.accounts[current]
            user = {"bmail_id": current, "display_name": w.display_name,
                    "account": {k: v for k, v in acct.items() if k != "certificate"},
                    "certificate": acct["certificate"],
                    "events": self.isp.events.get(current, []),
                    "memberships": self.memberships(current),
                    "pending": [r for r in self.isp.requests
                                if r["target"] == current and r["status"] == "awaiting-sender"
                                and r["kind"] == "identification"],
                    "verifications": [{k: v for k, v in r.items() if k != "code"} for r in self.isp.requests
                                      if r["target"] == current and r["kind"] == "verification"
                                      and r["status"] == "awaiting-sender"],
                    "change_requests": [r for r in self.isp.requests
                                        if r["target"] == current and r["kind"] == "id-change"]}
        return {"now": iso(), "users": users, "current_user": current, "user": user,
                "isp": self.isp.view(),
                "bcas": {k: dict(b.public_view(), status=self.isp.bcas[k]["status"],
                                 isp_domains=sorted(self.isp.bcas[k]["domains"]))
                         for k, b in self.bcas.items()},
                "platforms": {k: dict(p.view(), protocol_status=self.isp.platforms.get(k, {}).get("status", "not joined"))
                              for k, p in self.platforms.items()},
                "outbox": self.outbox.messages, "scenario": self.scenario}

    # ======================================================= guided scenario
    # The prototype's floating "Prof. Morgan — Transactions" panel, now running
    # the real protocols. Each step returns the log lines it produced.
    def run_step(self, step):
        steps = {"t1": self._t1, "t2": self._t2, "t3": self._t3, "t4": self._t4}
        if step not in steps:
            raise ProtocolError("unknown step", 404)
        if self.scenario[step]:
            raise ProtocolError("step already done")
        need = {"t2": ["t1"], "t4": ["t1", "t2", "t3"]}.get(step, [])
        if not all(self.scenario[n] for n in need):
            raise ProtocolError("step %s needs %s first" % (step, ", ".join(need)))
        log = steps[step]()
        self.scenario[step] = True
        return log

    def _t1(self):
        skt = self.bca("skt")
        e = self.isp.register_bca(skt, ["bgmail.com", "bnaver.com"], status="active")
        return ["SKT → ISP: bCA onboarding request submitted",
                "ISP: SKT public key pinned (kid %s)" % skt.key.kid,
                "ISP: Zero-copy protocol signed (agreement: %s)" % e["agreement"],
                "ISP: SKT added to bCA registry for %s" % ", ".join(sorted(e["domains"])),
                "ISP: Public bCA portal updated — SKT active"]

    def _t2(self):
        local, domain = "alex.morgan", "bgmail.com"
        bmail = local + "@" + domain
        consent = self.bca("skt").grant_consent("SKT-2001", bmail)
        acct = self.isp.register(domain, local, "real", "skt", consent,
                                 [{"kind": "messenger", "value": "kakao:amorgan_demo"}], True, True)
        self.wallets[bmail] = Wallet(bmail, "Alex Morgan (Prof.)")
        self.bca("skt").issue(acct["bca_request"])
        return ["USER → SKT: consent granted for %s (subscriber data stays at SKT)" % bmail,
                "USER → ISP: %s | real-name mode | bCA SKT" % bmail,
                "ISP → SKT: certification request %s (no personal data)" % acct["bca_request"],
                "SKT: subscriber confirmed — signed certificate token issued (zero-copy)",
                "ISP: certificate signature verified — bMail ID activated, LIFELONG (expires %s, renewable)"
                % self.isp.accounts[bmail]["cert_expiry"]]

    def _t3(self):
        amz = self.platform("amazon")
        self.isp.register_platform(amz, status="active")
        return ["Amazon → ISP: bMember onboarding request submitted",
                "ISP: Amazon.com approved — added to bMember platform registry",
                "ISP → Amazon: ISP public key delivered (trust anchor for tokens)",
                "ISP: Secure ID-change protocol enabled for Amazon",
                "Amazon: Review tier configured → \"Identifiable author\""]

    def _t4(self):
        bmail = "alex.morgan@bgmail.com"
        m = self.platform("amazon").enroll(bmail, "Alex Morgan")
        self.isp._event(bmail, "system", "Enrolled at Amazon.com",
                        "as bMember — Identifiable author tier assigned", "green")
        return ["USER → Amazon: sign-up with %s" % bmail,
                "Amazon → portal: bgmail.com is a certified bMail domain ✓",
                "Amazon → ISP: status attestation received and signature verified",
                "Amazon: bMember record %s created — %s certified — Identifiable author" % (m["member_no"], m["certified_by"]),
                "ISP: enrolment logged in the user's event feed"]


# ============================================================== demo data
def seed():
    n = Network()
    isp = n.isp
    isp.add_domain("bgmail.com", "Gmail", "Global", "2024-01", baseline_users=18402)
    isp.add_domain("bnaver.com", "Naver Mail", "South Korea", "2024-06", baseline_users=5210)
    isp.add_domain("bcoremail.com", "Coremail", "China", "2025-03", dkim="Renewal due", baseline_users=1219)
    for fake, target in [("bgmail.net", "bgmail.com"), ("b-gmail.com", "bgmail.com"),
                         ("bnaver.org", "bnaver.com"), ("bmail-gmail.com", "bgmail.com"),
                         ("bgmail.org", "bgmail.com")]:
        isp.add_fake_domain(fake, target)
    isp.intercepts = [
        {"domain": "bnaver.org", "target": "bnaver.com", "via": "Portal allowlist", "time": "14:37", "action": "Blocked"},
        {"domain": "b-gmail.com", "target": "bgmail.com", "via": "Transport layer filter", "time": "11:04", "action": "Blocked"},
        {"domain": "bgmail.net", "target": "bgmail.com", "via": "Portal allowlist", "time": "08:22", "action": "Blocked"}]

    def add_bca(bca, domains, status="active", joined=None):
        n.bcas[bca.id] = bca
        isp.register_bca(bca, domains, status=status, joined=joined)
        return bca

    kt = add_bca(BCA("kt", "KT Telecom", "Telecommunications provider", "South Korea",
                     "Mobile subscriber records (name, address, phone)", baseline_certified=14221 - 5),
                 ["bgmail.com", "bnaver.com"], joined="2024-01")
    add_bca(BCA("shinhan", "Shinhan Bank", "Bank", "South Korea", "Banking account records"),
            ["bgmail.com"], joined="2024-01")
    kb = add_bca(BCA("kb", "KB Bank", "Bank", "South Korea", "Banking account records"),
                 ["bnaver.com"], joined="2024-06")
    skt = add_bca(BCA("skt", "SKT", "Telecommunications provider", "South Korea",
                      "Mobile subscriber records (name, address, phone)"),
                  ["bgmail.com", "bnaver.com"], status="pending")
    add_bca(BCA("cmcc", "China Mobile", "Telecommunications provider", "China", "Mobile subscriber records"),
            ["bcoremail.com"], joined="2025-03")
    add_bca(BCA("icbc", "ICBC", "Bank", "China", "Banking account records"), ["bcoremail.com"], joined="2025-03")

    kt.add_subscriber("KT-1001", "Jiyeon Park", "+82-10-1111-0001", ["jpark@univ.edu"])
    kt.add_subscriber("KT-1002", "Seoyeon Han", "+82-10-1111-0002")
    kt.add_subscriber("KT-1003", "Hyunjun Lee", "+82-10-1111-0003")
    kt.add_subscriber("KT-1004", "Sunmi Choi", "+82-10-1111-0004", ["choi@corp.co.kr", "schoi@oldcompany.co.kr"])
    kt.add_subscriber("KT-1005", "Minjun Kim", "+82-10-1111-0005")
    kt.add_subscriber("KT-1006", "Dohyun Yoon", "+82-10-1111-0006")
    kb.add_subscriber("KB-5001", "Yuna Seo", "+82-10-2222-0001")
    skt.add_subscriber("SKT-2001", "Alex Morgan", "+82-10-3333-0001")

    # Platforms (Amazon pending until scenario step 3; KakaoTalk never joined)
    def add_platform(p, status=None, joined=None):
        n.platforms[p.id] = p
        if status:
            isp.register_platform(p, status=status, joined=joined)
        return p

    coupang = add_platform(Platform("coupang", "Coupang", baseline={
        "total_members": "2.1M", "bmembers": 847000, "unreachable": 12840, "fake_blocked": 4211,
        "bmember_reviews": 68441, "review_trust": "91%", "univ_emails": 6201, "corp_emails": 4918,
        "defunct": 1721, "revenue_at_risk": "₩2.4B"}), "active", "2024-01")
    naver = add_platform(Platform("naver", "Naver Shopping"), "active", "2024-03")
    univ = add_platform(Platform("univ", "University Portal"), "active", "2024-05")
    kakao = add_platform(Platform("kakao", "KakaoTalk"))
    add_platform(Platform("amazon", "Amazon.com"), "pending")

    # Users, through the real protocol
    n.enroll_user("kt", "KT-1001", "bgmail.com", "j.park", "real",
                  [{"kind": "email", "value": "jiyeon@gmail.com"}, {"kind": "messenger", "value": "kakao:jpark_kr"},
                   {"kind": "phone", "value": "+82-10-XXXX-XXXX"}], "Jiyeon Park",
                  legacy_logins=[("univ", "jpark@univ.edu"), ("kakao", "jpark_kr")])
    n.enroll_user("kt", "KT-1002", "bgmail.com", "19902301", "anon",
                  [{"kind": "email", "value": "anon1@example.org"}], "(anonymous)")
    n.enroll_user("kt", "KT-1003", "bgmail.com", "h.lee", "real",
                  [{"kind": "messenger", "value": "kakao:hlee_kr"}], "Hyunjun Lee")
    n.enroll_user("kt", "KT-1004", "bgmail.com", "s.choi", "real",
                  [{"kind": "phone", "value": "+82-10-XXXX-0004"}], "Sunmi Choi",
                  legacy_logins=[(None, "choi@corp.co.kr")])
    n.enroll_user("kt", "KT-1005", "bgmail.com", "m.kim", "real",
                  [{"kind": "email", "value": "minjun.k@example.org"}], "Minjun Kim")
    n.enroll_user("kb", "KB-5001", "bnaver.com", "19911201", "anon",
                  [{"kind": "messenger", "value": "kakao:anon_kb"}], "(anonymous)")
    n.enroll_user("kt", "KT-1006", "bgmail.com", "19911204", "anon",
                  [{"kind": "email", "value": "anon2@example.org"}], "(anonymous)", certify=False)
    isp.baseline = {"users": 24831 - len(isp.accounts), "id_events_30d": 2841, "phishing_30d": 187,
                    "id_changes_30d": 623, "fake_attempts_30d": 41}
    for d in isp.domains.values():
        d["baseline_users"] -= sum(1 for a in isp.accounts.values() if a["domain"] == d["domain"])

    # Platform memberships
    coupang.add_member("j.park@bgmail.com", "Jiyeon Park", "2023-04", 184, kind="bMember",
                       certified_by="KT Telecom", mode="real", risk="Low", tier="Gold")
    coupang.add_member("h.lee@bgmail.com", "Hyunjun Lee", "2023-08", 92, kind="bMember",
                       certified_by="KT Telecom", mode="real", risk="Low")
    coupang.add_member("19911201@bnaver.com", "(anonymous)", "2024-02", 41, kind="bMember",
                       certified_by="KB Bank", mode="anon", risk="Low")
    coupang.add_member("schoi@oldcompany.co.kr", "Sunmi Choi", "2021-05", 18, risk="Medium")
    coupang.add_member("choi@corp.co.kr", "Sunmi Choi", "2022-11", 27, risk="Medium")
    coupang.add_member("buyer4412@mail.ru", "Unknown", "2026-05", 3, kind="unverified", risk="High")
    naver.add_member("j.park@bgmail.com", "Jiyeon Park", "2024-01", 42, kind="bMember",
                     certified_by="KT Telecom", mode="real", risk="Low")
    univ.add_member("jpark@univ.edu", "Jiyeon Park", "2019-09", 0, "Academic records")
    kakao.add_member("jpark_kr", "Jiyeon Park", "2021-06", 0, "Messaging")
    for row in [("kim.j@university.ac.kr", "University", "2024-06", "₩840K"),
                ("lee.s@oldcompany.co.kr", "Corporate", "2024-03", "₩1.2M"),
                ("park.h@graduated.edu", "University", "2023-12", "₩320K"),
                ("choi.m@oldmail.net", "Defunct", "2023-06", "₩90K")]:
        coupang.add_unreachable(*row)
    coupang.post_review("buyer4412@mail.ru", 5, "Perfect! 10/10! Buy immediately!",
                        flag="High fake risk — pattern detected")
    coupang.post_review("anon_user_4421", 5, "Best purchase ever!!!! Amazing!!!!", author="Anonymous")
    coupang.post_review("19911201@bnaver.com", 4, "Good value. Packaging could be improved but overall satisfied.",
                        author="Anonymous bMember")
    coupang.post_review("j.park@bgmail.com", 5, "Great product quality and fast delivery. Highly recommend.")

    # Open requests, as in the prototype's queue
    r = isp.request_identification("Coupang seller verification", "j.park@bgmail.com", "seller verification")
    isp.notify_sender(r["id"])
    isp.request_identification("Amazon KR", "m.kim@bgmail.com", "account verification")
    isp.report_suspicious("kim.s@example.com", "h.lee@bgmail.com", "Asks to click a payment link")
    isp.request_id_change("s.choi@bgmail.com", "choi@corp.co.kr", ["coupang"])

    # A short history for the default user (the prototype's timeline)
    isp.events["j.park@bgmail.com"] += [
        {"time": "(demo history)", "category": "system", "title": "bCA certificate renewed",
         "detail": "KT Telecom", "color": "blue", "ref": None},
        {"time": "(demo history)", "category": "system", "title": "Backup channel re-validated",
         "detail": "KakaoTalk jpark_kr confirmed active", "color": "green", "ref": None}]
    return n
