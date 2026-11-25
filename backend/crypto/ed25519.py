"""Pure-Python Ed25519 signatures (RFC 8032), standard library only.

Why pure Python: the prototype must run on a machine with only a bare Python 3
interpreter (no pip packages). This is a straightforward transcription of the
algorithm in RFC 8032 section 5.1 using extended twisted-Edwards coordinates.

It is correct (checked against the RFC 8032 test vectors in tests/test_crypto.py)
but NOT constant-time and NOT fast (~10-30 ms per operation). It is fit for a
research prototype; a production deployment must swap in a vetted library
(e.g. `cryptography` or libsodium) behind the same three functions.
"""
import hashlib
import os

_P = 2 ** 255 - 19
_L = 2 ** 252 + 27742317777372353535851937790883648493  # group order


def _inv(x):
    return pow(x, _P - 2, _P)


_D = (-121665 * _inv(121666)) % _P
_SQRT_M1 = pow(2, (_P - 1) // 4, _P)


def _sha512(data):
    return hashlib.sha512(data).digest()


def _sha512_mod_l(data):
    return int.from_bytes(_sha512(data), "little") % _L


def _add(p, q):
    a = (p[1] - p[0]) * (q[1] - q[0]) % _P
    b = (p[1] + p[0]) * (q[1] + q[0]) % _P
    c = 2 * p[3] * q[3] * _D % _P
    d = 2 * p[2] * q[2] % _P
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % _P, g * h % _P, f * g % _P, e * h % _P)


def _mul(s, p):
    q = (0, 1, 1, 0)  # neutral element
    while s > 0:
        if s & 1:
            q = _add(q, p)
        p = _add(p, p)
        s >>= 1
    return q


def _equal(p, q):
    return ((p[0] * q[2] - q[0] * p[2]) % _P == 0 and
            (p[1] * q[2] - q[1] * p[2]) % _P == 0)


def _recover_x(y, sign):
    if y >= _P:
        return None
    x2 = (y * y - 1) * _inv(_D * y * y + 1) % _P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P != 0:
        x = x * _SQRT_M1 % _P
    if (x * x - x2) % _P != 0:
        return None
    if (x & 1) != sign:
        x = _P - x
    return x


_GY = 4 * _inv(5) % _P
_GX = _recover_x(_GY, 0)
_G = (_GX, _GY, 1, _GX * _GY % _P)


def _compress(p):
    zinv = _inv(p[2])
    x = p[0] * zinv % _P
    y = p[1] * zinv % _P
    return int.to_bytes(y | ((x & 1) << 255), 32, "little")


def _decompress(s):
    if len(s) != 32:
        return None
    y = int.from_bytes(s, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, x * y % _P)


def _expand(secret):
    if len(secret) != 32:
        raise ValueError("Ed25519 secret key must be 32 bytes")
    h = _sha512(secret)
    a = int.from_bytes(h[:32], "little")
    a &= (1 << 254) - 8
    a |= 1 << 254
    return a, h[32:]


def generate_secret():
    """A new random 32-byte secret key."""
    return os.urandom(32)


def public_key(secret):
    a, _ = _expand(secret)
    return _compress(_mul(a, _G))


def sign(secret, message):
    a, prefix = _expand(secret)
    pub = _compress(_mul(a, _G))
    r = _sha512_mod_l(prefix + message)
    r_enc = _compress(_mul(r, _G))
    h = _sha512_mod_l(r_enc + pub + message)
    s = (r + h * a) % _L
    return r_enc + int.to_bytes(s, 32, "little")


def verify(public, message, signature):
    if len(public) != 32 or len(signature) != 64:
        return False
    a_pt = _decompress(public)
    if a_pt is None:
        return False
    r_enc = signature[:32]
    r_pt = _decompress(r_enc)
    if r_pt is None:
        return False
    s = int.from_bytes(signature[32:], "little")
    if s >= _L:
        return False
    h = _sha512_mod_l(r_enc + public + message)
    return _equal(_mul(s, _G), _add(r_pt, _mul(h, a_pt)))
