"""Compact signed tokens: JWS (RFC 7515) with alg "EdDSA" (RFC 8037).

Every token the prototype calls "signed" — the bCA certificate token, the
bCA consent (permission) token, the identification certificate, the ID-change
token and the status attestation — is one of these:

    base64url(header) "." base64url(payload) "." base64url(Ed25519 signature)

header = {"alg": "EdDSA", "kid": <signer key id>, "typ": <token type>}
"""
import base64
import json
import time

from . import ed25519


class TokenError(Exception):
    """Raised when a token is malformed, unsigned by a trusted key, or expired."""


def b64e(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64d(text):
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


class KeyPair:
    def __init__(self, kid, secret):
        self.kid = kid
        self._secret = secret
        self.public = ed25519.public_key(secret)

    @classmethod
    def generate(cls, kid):
        return cls(kid, ed25519.generate_secret())

    def public_jwk(self):
        return {"kty": "OKP", "crv": "Ed25519", "kid": self.kid, "x": b64e(self.public)}

    def sign(self, data):
        return ed25519.sign(self._secret, data)


def encode(payload, key, typ):
    header = {"alg": "EdDSA", "kid": key.kid, "typ": typ}
    signing_input = b64e(canonical(header)) + "." + b64e(canonical(payload))
    return signing_input + "." + b64e(key.sign(signing_input.encode("ascii")))


def peek(token):
    """Header and payload WITHOUT verification (for display only)."""
    try:
        h, p, _ = token.split(".")
        return json.loads(b64d(h)), json.loads(b64d(p))
    except Exception as exc:  # noqa: BLE001
        raise TokenError("malformed token") from exc


def decode(token, trusted_keys, expected_typ=None, now=None):
    """Verify `token` against {kid: public_key_bytes}; return (header, payload)."""
    try:
        h_b64, p_b64, s_b64 = token.split(".")
        header = json.loads(b64d(h_b64))
        payload = json.loads(b64d(p_b64))
        sig = b64d(s_b64)
    except Exception as exc:  # noqa: BLE001
        raise TokenError("malformed token") from exc
    if header.get("alg") != "EdDSA":
        raise TokenError("unsupported alg")
    pub = trusted_keys.get(header.get("kid"))
    if pub is None:
        raise TokenError("signer key %r is not trusted" % header.get("kid"))
    if not ed25519.verify(pub, (h_b64 + "." + p_b64).encode("ascii"), sig):
        raise TokenError("bad signature")
    if expected_typ and header.get("typ") != expected_typ:
        raise TokenError("wrong token type %r" % header.get("typ"))
    exp = payload.get("exp")
    if exp is not None and (now or time.time()) > exp:
        raise TokenError("token expired")
    return header, payload
