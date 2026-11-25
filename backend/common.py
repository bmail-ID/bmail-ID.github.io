"""Shared helpers: ids, clocks, errors, the simulated backup-channel outbox."""
import itertools
import secrets
import time

_counter = itertools.count(1)

DAY = 86400
YEAR = 365 * DAY


class ProtocolError(Exception):
    """A request that a party refuses (bad input, wrong state, failed check)."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def new_id(prefix):
    return "%s-%04d" % (prefix, next(_counter))


def now():
    return time.time()


def iso(ts=None):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts if ts is not None else now()))


def one_time_code():
    return "%06d" % secrets.randbelow(10 ** 6)


class Outbox:
    """Messages sent over channels OTHER than bMail (KakaoTalk, SMS, backup email...).

    Nothing leaves the machine: this list stands in for the messenger/SMS gateway,
    so the demo can show that a phishing check reaches the sender on a backup
    channel and never through the possibly-compromised bMail address.
    """

    def __init__(self):
        self.messages = []

    def send(self, sender, channel_kind, address, text, ref=None):
        msg = {"id": new_id("MSG"), "from": sender, "channel": channel_kind,
               "to": address, "text": text, "ref": ref, "sent": iso()}
        self.messages.insert(0, msg)
        return msg
