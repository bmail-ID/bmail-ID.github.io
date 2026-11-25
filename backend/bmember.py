"""bMember platform — an e-commerce / service site that accepts bMail IDs.

It trusts exactly one thing: the ISP's public key, received when it joined the
bMember registry. With it, it verifies status attestations at enrolment and
signed change tokens when a member's old ID expires.
"""
from .common import ProtocolError, iso, new_id
from .crypto import jws

TIER_IDENTIFIABLE = "Identifiable author"
TIER_DOMAIN = "Domain certified"
TIER_UNVERIFIED = "Unverified"


class Platform:
    def __init__(self, platform_id, name, baseline=None):
        self.id = platform_id
        self.name = name
        self.baseline = baseline or {}
        self._isp = None
        self._isp_keys = {}
        self.members = {}            # member_no -> record
        self.reviews = []
        self.outreach = []           # unreachable members (expired IDs)
        self._seen_nonces = set()
        self.log = []

    # ------------------------------------------------------------- trust
    def trust_isp(self, isp, jwks):
        self._isp = isp
        self._isp_keys = {k["kid"]: jws.b64d(k["x"]) for k in jwks["keys"]}

    @property
    def is_bmember_platform(self):
        return bool(self._isp_keys)

    def _by_login(self, login):
        login = login.lower()
        for m in self.members.values():
            if m["login"] == login:
                return m
        return None

    def add_member(self, login, name, since, orders=0, activity=None, kind="legacy",
                   certified_by=None, mode=None, risk=None, tier="Standard"):
        no = new_id("M")
        self.members[no] = {"member_no": no, "login": login.lower(), "name": name, "since": since,
                            "orders": orders, "activity": activity or ("%d orders" % orders),
                            "kind": kind, "certified_by": certified_by, "mode": mode,
                            "risk": risk, "tier": tier, "history": []}
        return self.members[no]

    # ---------------------------------------------------------- enrolment
    def enroll(self, bmail_id, display_name):
        """Sign-up with a bMail ID: portal check + ISP-signed status attestation."""
        if not self.is_bmember_platform:
            raise ProtocolError("%s has not joined the bMember registry" % self.name)
        if self._by_login(bmail_id):
            raise ProtocolError("%s is already a member" % bmail_id, 409)
        portal = self._isp.check_domain(bmail_id)
        if portal["result"] != "certified":
            raise ProtocolError("%s is not a certified bMail domain (%s)" % (portal["domain"], portal["result"]))
        token = self._isp.status_attestation(bmail_id, self.id)
        _, st = jws.decode(token, self._isp_keys, "bmail-status")
        if st["aud"] != self.id or st["status"] != "active":
            raise ProtocolError("bMail ID is %s" % st["status"])
        m = self.add_member(bmail_id, display_name or "(anonymous)", iso()[:10], 0, "New member",
                            kind="bMember", certified_by=st["bca"], mode=st["mode"], risk="Low")
        m["attestation"] = token
        self.log.insert(0, "%s enrolled %s (%s certified)" % (iso(), bmail_id, st["bca"]))
        return m

    # ---------------------------------------------------------- ID change
    def apply_change_token(self, token):
        try:
            _, ch = jws.decode(token, self._isp_keys, "bmail-id-change")
        except jws.TokenError as exc:
            return {"result": "rejected", "reason": str(exc)}
        if ch["aud"] != self.id:
            return {"result": "rejected", "reason": "token addressed to another platform"}
        if ch["nonce"] in self._seen_nonces:
            return {"result": "rejected", "reason": "replayed token"}
        self._seen_nonces.add(ch["nonce"])
        old = self._by_login(ch["old_id"])
        if old is None:
            return {"result": "no-change", "reason": "no member with %s" % ch["old_id"]}
        if self._by_login(ch["new_id"]):
            return {"result": "rejected", "reason": "%s already used by another member" % ch["new_id"]}
        old["history"].append({"time": iso(), "event": "login remapped",
                               "from": old["login"], "to": ch["new_id"]})
        old["login"] = ch["new_id"]
        old["kind"] = "bMember"
        old["risk"] = "Low"
        old["certified_by"] = ch["bca"].split(":", 1)[-1]
        self.outreach = [o for o in self.outreach if o["login"] != ch["old_id"]]
        self.log.insert(0, "%s remapped %s -> %s (history kept)" % (iso(), ch["old_id"], ch["new_id"]))
        return {"result": "remapped", "member_no": old["member_no"], "orders_kept": old["orders"]}

    # ------------------------------------------------------- review layer
    def trust_tier(self, login):
        m = self._by_login(login)
        if m and m["kind"] == "bMember":
            return TIER_DOMAIN if m["mode"] == "anon" else TIER_IDENTIFIABLE
        return TIER_UNVERIFIED

    def post_review(self, login, stars, text, author=None, flag=None):
        stars = int(stars)
        if not 1 <= stars <= 5:
            raise ProtocolError("stars must be 1-5")
        m = self._by_login(login)
        tier = self.trust_tier(login)
        rv = {"id": new_id("RV"), "login": login, "author": author or (m["name"] if m else "Unknown"),
              "certified_by": m["certified_by"] if m else None, "stars": stars, "text": text,
              "tier": tier, "flag": flag, "removed": False, "time": iso()}
        if not flag and tier == TIER_UNVERIFIED:
            rv["flag"] = "Medium fake risk — unverified author"
        self.reviews.insert(0, rv)
        return rv

    def remove_review(self, review_id):
        for rv in self.reviews:
            if rv["id"] == review_id:
                rv["removed"] = True
                return rv
        raise ProtocolError("no such review", 404)

    # ---------------------------------------------- unreachable members
    def add_unreachable(self, login, kind, last_active, ltv):
        self.outreach.append({"login": login, "type": kind, "last_active": last_active,
                              "ltv": ltv, "status": "Unreachable"})

    def outreach_action(self, login, action, outbox):
        for o in self.outreach:
            if o["login"] == login:
                if action == "invite":
                    outbox.send(self.name, "phone/social", "alt contact of " + login,
                                "%s: your login %s no longer works. Register a bMail ID and use the "
                                "secure ID-change protocol to keep your history." % (self.name, login))
                    o["status"] = "Invite sent"
                elif action == "deactivate":
                    o["status"] = "Deactivated"
                else:
                    raise ProtocolError("unknown action")
                return o
        raise ProtocolError("no such unreachable member", 404)

    # ---------------------------------------------------------- views
    def view(self):
        members = list(self.members.values())
        bm = sum(1 for m in members if m["kind"] == "bMember")
        return {"id": self.id, "name": self.name, "bmember_platform": self.is_bmember_platform,
                "members": [{k: v for k, v in m.items() if k != "attestation"} for m in members],
                "reviews": self.reviews, "outreach": self.outreach, "log": self.log,
                "bmembers_live": bm, "baseline": self.baseline}
