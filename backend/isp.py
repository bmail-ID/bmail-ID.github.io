"""bMail ISP — issues bMail domains, routes the four trust protocols, stores no
personal identity data.

What the ISP keeps per account: the address, privacy mode, which bCA certified
it, the bCA's signed certificate token, and the user's backup channels (which
are used only to reach the user and are never disclosed). It never receives a
name, a subscriber number or any bCA record.
"""
import re

from .common import DAY, ProtocolError, iso, new_id, now, one_time_code
from .crypto import jws

CHANGE_TOKEN_TTL = 1 * DAY
STATUS_TTL = 1 * DAY
LOCAL_REAL = re.compile(r"^[a-z0-9]+([._-][a-z0-9]+)*$")
LOCAL_ANON = re.compile(r"^[0-9]{6,12}$")


class ISP:
    def __init__(self, isp_id, outbox):
        self.id = isp_id
        self.key = jws.KeyPair.generate("isp:" + isp_id)
        self.outbox = outbox
        self.domains = {}          # name -> registry row
        self.fake_domains = {}     # name -> spoofing target
        self.intercepts = []       # blocked look-ups of fake domains
        self.bcas = {}             # bca_id -> {"bca": BCA, "domains": set, "status", "joined"}
        self.platforms = {}        # platform_id -> {"platform": Platform, "status", "joined"}
        self.accounts = {}         # bmail_id -> account (no personal data)
        self.requests = []         # identification / verification / id-change
        self.incidents = []
        self.events = {}           # bmail_id -> [event]  (the user's notification feed)
        self.baseline = {}         # aggregate figures carried from the prototype

    # ================================================================ registry
    def add_domain(self, name, provider, country, listed_since, dkim="Active", dmarc="Active",
                   baseline_users=0):
        self.domains[name] = {"domain": name, "provider": provider, "country": country,
                              "listed_since": listed_since, "dkim": dkim, "dmarc": dmarc,
                              "baseline_users": baseline_users}

    def add_fake_domain(self, name, target):
        self.fake_domains[name] = target

    def register_bca(self, bca, domains, status="active", joined=None):
        """Txn 1 (prototype: 'SKT joins as bCA'): pin the bCA key, sign zero-copy."""
        for d in domains:
            if d not in self.domains:
                raise ProtocolError("unknown bMail domain %r" % d)
        entry = self.bcas.setdefault(bca.id, {"bca": bca, "domains": set(), "status": status,
                                              "joined": joined or iso()[:7], "agreement": "zero-copy"})
        entry["domains"].update(domains)
        entry["status"] = status
        bca.connect(self._from_bca)
        return entry

    def register_platform(self, platform, status="active", joined=None):
        """Txn 3 (prototype: 'Amazon joins bMember'): hand the platform the ISP key."""
        self.platforms[platform.id] = {"platform": platform, "status": status,
                                       "joined": joined or iso()[:7]}
        if status == "active":
            platform.trust_isp(self, self.jwks())
        return self.platforms[platform.id]

    def jwks(self):
        return {"keys": [self.key.public_jwk()]}

    def trusted_bca_keys(self):
        return {e["bca"].key.kid: e["bca"].key.public for e in self.bcas.values()
                if e["status"] == "active"}

    def ca_partners(self, domain):
        return [e["bca"].name for e in self.bcas.values()
                if e["status"] == "active" and domain in e["domains"]]

    # =========================================================== domain portal
    def check_domain(self, value):
        """Public portal look-up. Same three outcomes as the prototype's checkDomain()."""
        val = (value or "").strip().lower()
        if "@" in val:
            val = val.rsplit("@", 1)[1]
        if not val:
            return {"result": "empty", "domain": val}
        if val in self.domains:
            d = self.domains[val]
            return {"result": "certified", "domain": val, "ca_partners": self.ca_partners(val),
                    "status": "Healthy" if d["dkim"] == "Active" else "DKIM renewal pending"}
        if val in self.fake_domains:
            self.intercepts.insert(0, {"domain": val, "target": self.fake_domains[val],
                                       "via": "Portal allowlist", "time": iso()[11:16],
                                       "action": "Blocked"})
            return {"result": "fake", "domain": val, "target": self.fake_domains[val]}
        return {"result": "unregistered", "domain": val}

    # ============================================================ registration
    def register(self, domain, local, mode, bca_id, consent_token, backup_channels,
                 consent_certify, consent_identifiable):
        if domain not in self.domains:
            raise ProtocolError("%r is not a bMail domain" % domain)
        entry = self.bcas.get(bca_id)
        if not entry or entry["status"] != "active" or domain not in entry["domains"]:
            raise ProtocolError("bCA %r is not an active partner of %s" % (bca_id, domain))
        if mode not in ("real", "anon"):
            raise ProtocolError("privacy mode must be 'real' or 'anon'")
        local = (local or "").strip().lower()
        if mode == "anon" and not local:
            local = self._fresh_pseudonym(domain)
        pattern = LOCAL_ANON if mode == "anon" else LOCAL_REAL
        if not pattern.match(local):
            raise ProtocolError("email name %r is not valid for %s mode" % (local, mode))
        bmail_id = local + "@" + domain
        if bmail_id in self.accounts:
            raise ProtocolError("%s is already taken" % bmail_id, 409)
        channels = [c for c in (backup_channels or []) if (c.get("value") or "").strip()]
        if not channels:
            raise ProtocolError("at least one backup channel is required")
        for c in channels:
            if c["value"].strip().lower() == bmail_id:
                raise ProtocolError("a backup channel must differ from the bMail ID itself")
        if not (consent_certify and consent_identifiable):
            raise ProtocolError("both consents are required")
        bca = entry["bca"]
        bca_req = bca.receive_certification_request(self.id, bmail_id, mode, consent_token)
        self.accounts[bmail_id] = {
            "bmail_id": bmail_id, "domain": domain, "mode": mode, "bca_id": bca_id,
            "bca_name": bca.name, "status": "pending-certification", "certificate": None,
            "cert_expiry": None, "created": iso(), "flags": [], "bca_request": bca_req,
            "backup_channels": [{"kind": c["kind"], "value": c["value"].strip(), "status": "Active",
                                 "last_validated": iso()[:10]} for c in channels]}
        self._event(bmail_id, "system", "Registration submitted",
                    "Waiting for %s to certify %s" % (bca.name, bmail_id), "amber")
        return self.accounts[bmail_id]

    def _fresh_pseudonym(self, domain):
        n = 19900000 + len(self.accounts) * 7 + 1
        while "%d@%s" % (n, domain) in self.accounts:
            n += 1
        return str(n)

    def _from_bca(self, kind, ref, token):
        """Callback used by a bCA to deliver its signed answer."""
        if kind == "certificate":
            _, cert = jws.decode(token, self.trusted_bca_keys(), "bmail-certificate")
            acct = self.accounts[cert["sub"]]
            acct.update(status="active", certificate=token, cert_expiry=iso(cert["exp"])[:10])
            self._event(cert["sub"], "system", "bMail ID activated",
                        "%s · Certified by %s · Lifelong" % (cert["sub"], acct["bca_name"]), "green")
        elif kind == "certificate-rejected":
            self.accounts[ref]["status"] = "rejected"
            self._event(ref, "system", "Certification rejected", "The bCA did not certify this ID", "red")
        elif kind == "change-confirmation":
            req = self._req(ref)
            jws.decode(token, self.trusted_bca_keys(), "bca-change-confirmation")
            req.update(status="bca-confirmed", bca_confirmation=token)
        elif kind == "change-rejected":
            self._req(ref)["status"] = "rejected-by-bca"

    def account(self, bmail_id):
        acct = self.accounts.get(bmail_id)
        if not acct:
            raise ProtocolError("no bMail account %r" % bmail_id, 404)
        return acct

    def status_attestation(self, bmail_id, audience):
        """Signed, short-lived statement a platform can verify offline."""
        acct = self.account(bmail_id)
        iat = int(now())
        return jws.encode({"iss": self.key.kid, "sub": bmail_id, "status": acct["status"],
                           "mode": acct["mode"], "bca": acct["bca_name"], "lifelong": True,
                           "aud": audience, "iat": iat, "exp": iat + STATUS_TTL},
                          self.key, typ="bmail-status")

    # ======================================================== backup channels
    def add_backup_channel(self, bmail_id, kind, value):
        acct = self.account(bmail_id)
        if not (value or "").strip():
            raise ProtocolError("empty channel")
        acct["backup_channels"].append({"kind": kind, "value": value.strip(), "status": "Active",
                                        "last_validated": iso()[:10]})
        return acct["backup_channels"]

    def revalidate_channels(self, bmail_id):
        """Annual re-validation: send a check message over every channel."""
        acct = self.account(bmail_id)
        for c in acct["backup_channels"]:
            self.outbox.send(self.id, c["kind"], c["value"],
                             "bMail ISP annual check: your backup channel for %s is active." % bmail_id)
            c["last_validated"] = iso()[:10]
        self._event(bmail_id, "system", "Backup channels re-validated",
                    "%d channel(s) confirmed active" % len(acct["backup_channels"]), "green")
        return acct["backup_channels"]

    # ===================================================== request bookkeeping
    def _req(self, req_id):
        for r in self.requests:
            if r["id"] == req_id:
                return r
        raise ProtocolError("no such request %r" % req_id, 404)

    def _new_req(self, kind, **fields):
        r = {"id": new_id({"identification": "IDREQ", "verification": "VERREQ",
                           "id-change": "CHGREQ"}[kind]), "kind": kind, "created": iso(),
             "status": "received", "log": []}
        r.update(fields)
        self.requests.insert(0, r)
        return r

    def _event(self, bmail_id, category, title, detail, color="blue", ref=None):
        self.events.setdefault(bmail_id, []).insert(0, {"time": iso(), "category": category,
                                                        "title": title, "detail": detail,
                                                        "color": color, "ref": ref})

    # ================================================= 1. Identifiability flow
    def request_identification(self, requester, bmail_id, purpose):
        if not (requester or "").strip():
            raise ProtocolError("the receiver must identify itself")
        self.account(bmail_id)
        return self._new_req("identification", requester=requester.strip(), target=bmail_id,
                             purpose=purpose or "identification")

    def notify_sender(self, req_id):
        """ISP validates the request and asks the sender for permission."""
        r = self._req(req_id)
        if r["kind"] != "identification" or r["status"] != "received":
            raise ProtocolError("request is %s" % r["status"])
        if self.account(r["target"])["status"] != "active":
            r["status"] = "rejected"
            raise ProtocolError("target ID is not active")
        r["status"] = "awaiting-sender"
        r["log"].append("%s ISP validated request; sender notified" % iso())
        self._event(r["target"], "identification", "Identification request",
                    "From %s · %s" % (r["requester"], r["purpose"]), "blue", ref=r["id"])
        return r

    def sender_decides(self, req_id, approve):
        r = self._req(req_id)
        if r["kind"] != "identification" or r["status"] != "awaiting-sender":
            raise ProtocolError("request is %s" % r["status"])
        acct = self.account(r["target"])
        if approve:
            bca = self.bcas[acct["bca_id"]]["bca"]
            r["certificate"] = bca.attest_identifiable(r["target"], r["requester"], r["purpose"])
            r["status"] = "certified"
            r["log"].append("%s sender approved; %s issued identification certificate" % (iso(), bca.name))
            self._event(r["target"], "identification", "Disclosure event",
                        "Identification certificate delivered to %s" % r["requester"], "green", ref=r["id"])
        else:
            r["status"] = "declined"
            r["log"].append("%s sender declined" % iso())
            self._event(r["target"], "identification", "Identification declined",
                        "You declined the request from %s" % r["requester"], "red", ref=r["id"])
        return r

    def reject_request(self, req_id):
        r = self._req(req_id)
        if r["status"] in ("certified", "completed", "phishing-confirmed", "legitimate"):
            raise ProtocolError("request already closed")
        r["status"] = "rejected"
        r["log"].append("%s rejected by ISP operator" % iso())
        return r

    # ==================================================== 2. Verification flow
    def report_suspicious(self, receiver, sender_bmail, note):
        if not (receiver or "").strip():
            raise ProtocolError("the receiver must identify itself")
        self.account(sender_bmail)
        return self._new_req("verification", receiver=receiver.strip(), target=sender_bmail,
                             note=note or "")

    def process_verification(self, req_id):
        """Contact the sender over a backup channel — never via the flagged address."""
        r = self._req(req_id)
        if r["kind"] != "verification" or r["status"] != "received":
            raise ProtocolError("request is %s" % r["status"])
        acct = self.account(r["target"])
        preferred = sorted(acct["backup_channels"],
                           key=lambda c: {"messenger": 0, "phone": 1, "email": 2}.get(c["kind"], 3))
        channel = next((c for c in preferred if c["value"].lower() != r["target"]), None)
        if channel is None:
            raise ProtocolError("sender has no usable backup channel")
        r["code"] = one_time_code()
        r["channel"] = {"kind": channel["kind"], "value": channel["value"]}
        self.outbox.send(self.id, channel["kind"], channel["value"],
                         "bMail ISP: %s reported an email from %s. Did you send it? Answer in your "
                         "bMail app with code %s." % (r["receiver"], r["target"], r["code"]), ref=r["id"])
        r["status"] = "awaiting-sender"
        r["log"].append("%s ISP validated receiver; challenge sent via %s" % (iso(), channel["kind"]))
        self._event(r["target"], "verification", "Phishing alert",
                    "%s reported an email from your address" % r["receiver"], "amber", ref=r["id"])
        return r

    def sender_responds(self, req_id, code, sent_by_me):
        r = self._req(req_id)
        if r["kind"] != "verification" or r["status"] != "awaiting-sender":
            raise ProtocolError("request is %s" % r["status"])
        if (code or "").strip() != r["code"]:
            raise ProtocolError("wrong one-time code", 403)
        if sent_by_me:
            r["status"] = "legitimate"
            verdict = "The sender confirmed the email is genuine."
        else:
            r["status"] = "phishing-confirmed"
            acct = self.account(r["target"])
            if "password-reset-required" not in acct["flags"]:
                acct["flags"].append("password-reset-required")
            self.incidents.insert(0, {"id": new_id("INC"), "request": r["id"], "target": r["target"],
                                      "receiver": r["receiver"], "time": iso()})
            verdict = "The sender did NOT send it: treat it as phishing. Do not click its links."
        self.outbox.send(self.id, "email", r["receiver"],
                         "bMail ISP verification result for the email from %s: %s" % (r["target"], verdict),
                         ref=r["id"])
        r["log"].append("%s sender answered: %s; receiver notified" % (iso(), r["status"]))
        self._event(r["target"], "verification", "Phishing check closed", verdict,
                    "green" if sent_by_me else "red", ref=r["id"])
        return r

    # ==================================================== 3./4. ID change flow
    def request_id_change(self, new_bmail, old_id, platform_ids):
        acct = self.account(new_bmail)
        if acct["status"] != "active":
            raise ProtocolError("the new bMail ID is not active")
        old_id = (old_id or "").strip().lower()
        if not old_id or old_id == new_bmail:
            raise ProtocolError("give the expiring ID to replace")
        targets = [p for p in platform_ids if self.platforms.get(p, {}).get("status") == "active"]
        if not targets:
            raise ProtocolError("no selected platform supports the bMail ID-change protocol")
        r = self._new_req("id-change", target=new_bmail, old_id=old_id, platforms=targets,
                          status="awaiting-bca")
        bca = self.bcas[acct["bca_id"]]["bca"]
        r["bca_request"] = bca.receive_change_verification(self.id, r["id"], old_id, new_bmail)
        r["log"].append("%s re-verification requested from %s" % (iso(), bca.name))
        self._event(new_bmail, "system", "ID change requested",
                    "%s → %s on %d platform(s)" % (old_id, new_bmail, len(targets)), "amber", ref=r["id"])
        return r

    def issue_change_tokens(self, req_id):
        """Sign one change token per platform and transmit it."""
        r = self._req(req_id)
        if r["kind"] != "id-change" or r["status"] != "bca-confirmed":
            raise ProtocolError("request is %s (needs bCA confirmation first)" % r["status"])
        _, conf = jws.decode(r["bca_confirmation"], self.trusted_bca_keys(), "bca-change-confirmation")
        results = {}
        for pid in r["platforms"]:
            iat = int(now())
            token = jws.encode({"iss": self.key.kid, "aud": pid, "old_id": r["old_id"],
                                "new_id": r["target"], "bca": conf["iss"], "bca_confirmed": True,
                                "nonce": new_id("NONCE"), "iat": iat, "exp": iat + CHANGE_TOKEN_TTL},
                               self.key, typ="bmail-id-change")
            results[pid] = self.platforms[pid]["platform"].apply_change_token(token)
        r["status"] = "completed"
        r["results"] = results
        r["log"].append("%s change tokens transmitted to %s" % (iso(), ", ".join(r["platforms"])))
        self._event(r["target"], "system", "ID change completed",
                    "; ".join("%s: %s" % (k, v["result"]) for k, v in results.items()), "green", ref=r["id"])
        return r

    # ================================================================== views
    def view(self):
        accounts = list(self.accounts.values())
        by_domain = {d: 0 for d in self.domains}
        for a in accounts:
            by_domain[a["domain"]] += 1
        domains = []
        for name, d in self.domains.items():
            row = dict(d)
            row["ca_partners"] = self.ca_partners(name)
            row["users"] = d["baseline_users"] + by_domain[name]
            domains.append(row)
        open_reqs = [r for r in self.requests if r["status"] in
                     ("received", "awaiting-sender", "awaiting-bca", "bca-confirmed")]
        return {
            "id": self.id, "jwks": self.jwks(), "domains": domains,
            "fake_domains": [{"domain": k, "target": v} for k, v in self.fake_domains.items()],
            "intercepts": self.intercepts,
            "bcas": [{"id": k, "name": e["bca"].name, "status": e["status"], "joined": e["joined"],
                      "domains": sorted(e["domains"]), "agreement": e["agreement"]}
                     for k, e in self.bcas.items()],
            "platforms": [{"id": k, "name": e["platform"].name, "status": e["status"],
                           "joined": e["joined"]} for k, e in self.platforms.items()],
            "accounts": [{k: v for k, v in a.items() if k != "certificate"} for a in accounts],
            "requests": [{k: v for k, v in r.items() if k != "code"} for r in self.requests],
            "open_requests": len(open_reqs), "incidents": self.incidents,
            "registered_users": self.baseline.get("users", 0) + len(accounts),
            "baseline": self.baseline,
        }
