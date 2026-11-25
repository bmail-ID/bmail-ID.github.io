"""bCA — bMail Certification Authority (telco, bank, ...).

Holds the genuine identity data (its existing subscriber / account records) and
NEVER passes it to the ISP ("zero-copy"). What leaves a bCA is only signed tokens:

  * consent token        — the user's permission, granted at the bCA itself
  * certificate token    — "this bMail ID belongs to a subscriber we know"
  * identification cert  — the same fact, addressed to one receiver, on the
                           sender's approval
  * change confirmation  — "the same subscriber owns the old ID and the new one"
"""
from .common import DAY, YEAR, ProtocolError, iso, new_id, now
from .crypto import jws

CONSENT_TTL = 1 * DAY
CERT_VALIDITY = 2 * YEAR          # prototype: "Certificate validity: 2 years"
ID_CERT_TTL = 30 * DAY


class BCA:
    def __init__(self, bca_id, name, ca_type, country, data_held,
                 baseline_certified=0):
        self.id = bca_id
        self.name = name
        self.type = ca_type
        self.country = country
        self.data_held = data_held
        self.key = jws.KeyPair.generate("bca:" + bca_id)
        self.baseline_certified = baseline_certified
        # --- private to the bCA: never serialised to the ISP -------------
        self._subscribers = {}      # subscriber_id -> {name, phone, known_emails}
        self._consents = {}         # consent nonce -> subscriber_id
        self._bindings = {}         # bmail_id -> subscriber_id
        # --- operator queues -------------------------------------------------
        self.queue = []             # pending certification / re-certification
        self.issued = []            # certificate metadata (no personal data)
        self._deliver = None        # set by the network: callback to the ISP

    # ---------------------------------------------------------------- setup
    def add_subscriber(self, subscriber_id, name, phone, known_emails=()):
        self._subscribers[subscriber_id] = {
            "name": name, "phone": phone, "known_emails": set(known_emails)}

    def connect(self, deliver_to_isp):
        self._deliver = deliver_to_isp

    # ------------------------------------------------------ user-facing step
    def grant_consent(self, subscriber_id, bmail_id):
        """User, authenticated at the bCA's own channel, allows certification.

        The token names the bMail ID and a random nonce only; the subscriber
        identity stays here, keyed by the nonce.
        """
        if subscriber_id not in self._subscribers:
            raise ProtocolError("%s has no subscriber record %r" % (self.name, subscriber_id), 404)
        nonce = new_id("CONSENT")
        self._consents[nonce] = subscriber_id
        return jws.encode({"iss": self.key.kid, "sub": bmail_id, "scope": "bmail-certification",
                           "nonce": nonce, "iat": int(now()), "exp": int(now() + CONSENT_TTL)},
                          self.key, typ="bca-consent")

    # ------------------------------------------------------ ISP-facing steps
    def receive_certification_request(self, isp_id, bmail_id, mode, consent_token):
        _, consent = jws.decode(consent_token, {self.key.kid: self.key.public}, "bca-consent")
        if consent["sub"] != bmail_id:
            raise ProtocolError("consent was granted for a different bMail ID")
        subscriber_id = self._consents.get(consent["nonce"])
        if subscriber_id is None:
            raise ProtocolError("consent already used or unknown")
        req = {"id": new_id("CERTREQ"), "kind": "new", "bmail_id": bmail_id, "mode": mode,
               "isp": isp_id, "nonce": consent["nonce"], "received": iso(), "status": "pending",
               "check": "subscriber record found"}
        self.queue.insert(0, req)
        return req["id"]

    def receive_change_verification(self, isp_id, change_req_id, old_id, new_id_):
        """ISP asks: does one subscriber own both the old and the new ID?"""
        sub = self._bindings.get(new_id_)
        owns_old = bool(sub) and old_id in self._subscribers[sub]["known_emails"]
        req = {"id": new_id("CERTREQ"), "kind": "id-change", "bmail_id": new_id_, "old_id": old_id,
               "isp": isp_id, "change_req": change_req_id, "received": iso(), "status": "pending",
               "check": "identity match confirmed" if owns_old else "NO MATCH: old ID not on the subscriber's record"}
        self.queue.insert(0, req)
        return req["id"]

    def _find(self, req_id):
        for r in self.queue:
            if r["id"] == req_id:
                return r
        raise ProtocolError("no such bCA request %r" % req_id, 404)

    # ------------------------------------------------------- operator actions
    def issue(self, req_id):
        """Operator approves a queued request; the signed result goes to the ISP."""
        r = self._find(req_id)
        if r["status"] != "pending":
            raise ProtocolError("request already %s" % r["status"])
        if r["kind"] == "new":
            sub = self._consents.pop(r["nonce"])
            self._bindings[r["bmail_id"]] = sub
            self._subscribers[sub]["known_emails"].add(r["bmail_id"])
            iat = int(now())
            token = jws.encode({"iss": self.key.kid, "sub": r["bmail_id"], "identifiable": True,
                                "mode": r["mode"], "iat": iat, "exp": iat + CERT_VALIDITY},
                               self.key, typ="bmail-certificate")
            self.issued.insert(0, {"bmail_id": r["bmail_id"], "type": "New", "mode": r["mode"],
                                   "issued": iso(iat)[:10], "expiry": iso(iat + CERT_VALIDITY)[:10],
                                   "status": "Active"})
            r["status"] = "issued"
            self._deliver("certificate", r["bmail_id"], token)
        else:
            if r["check"].startswith("NO MATCH"):
                raise ProtocolError("cannot confirm: " + r["check"])
            token = jws.encode({"iss": self.key.kid, "old_id": r["old_id"], "new_id": r["bmail_id"],
                                "same_owner": True, "change_req": r["change_req"], "iat": int(now())},
                               self.key, typ="bca-change-confirmation")
            self.issued.insert(0, {"bmail_id": r["bmail_id"], "type": "ID change", "mode": "-",
                                   "issued": iso()[:10], "expiry": "-", "status": "Confirmed"})
            r["status"] = "approved"
            self._deliver("change-confirmation", r["change_req"], token)
        return r

    def reject(self, req_id):
        r = self._find(req_id)
        if r["status"] != "pending":
            raise ProtocolError("request already %s" % r["status"])
        r["status"] = "rejected"
        if r["kind"] == "new":
            self._consents.pop(r["nonce"], None)
            self._deliver("certificate-rejected", r["bmail_id"], None)
        else:
            self._deliver("change-rejected", r["change_req"], None)
        return r

    def attest_identifiable(self, bmail_id, audience, purpose):
        """Identification certificate for one receiver. Carries no personal data."""
        if bmail_id not in self._bindings:
            raise ProtocolError("%s has not certified %s" % (self.name, bmail_id), 404)
        iat = int(now())
        return jws.encode({"iss": self.key.kid, "sub": bmail_id, "identifiable": True,
                           "aud": audience, "purpose": purpose, "iat": iat, "exp": iat + ID_CERT_TTL},
                          self.key, typ="bmail-identification")

    # ---------------------------------------------------------------- views
    def certified_count(self):
        return self.baseline_certified + len(self._bindings)

    def public_view(self):
        return {"id": self.id, "name": self.name, "type": self.type, "country": self.country,
                "data_held": self.data_held, "kid": self.key.kid, "jwk": self.key.public_jwk(),
                "certified": self.certified_count(),
                "pending": sum(1 for r in self.queue if r["status"] == "pending"),
                "queue": self.queue, "issued": self.issued}
