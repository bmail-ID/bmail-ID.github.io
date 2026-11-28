# Supplementary: Code Documentation of the Prototype for the bMail ID Infrastructure

**Main paper:** *Synergizing Individual and Social Trust in Online Identifiers: The bMail ID Approach*

**Prototype:** <https://bmail-ID.github.io/prototype> · **Source code:** <https://bmail-ID.github.io/code>

## 1. Scope of Prototype

The prototype is a static interface mock-up that demonstrates the activities of the four stakeholders
and the workflows of the four features (Identifiability, Verification, Sustainability, Changeability).
The accompanying Python implementation runs these workflows as real protocols with signed tokens and
simulated message delivery; it does not send or receive real email.

The original mock-up is included, anonymised for review (author names, citations and local paths
replaced; otherwise unchanged), as `prototype/bmail_id_research_prototype.html` (2,052 lines; SHA-256
in `prototype_extract/SOURCE_SHA256.txt`). Pure Python 3 standard library on the back end and plain
HTML/CSS/JS on the front end: nothing to install.

### Four Stakeholders

* **bMail Users:** `network.py` (the user's own client, `Wallet`)
* **bMail ID Service Providers (ISPs):** `isp.py`
* **bMail ID Certification Authorities (bCAs):** `bca.py`
* **bMember Platforms:** `bmember.py`

### Run it

From the repository folder, with any Python 3.8+:
```
python run_server.py
```
State is in memory: restarting the server, or "Reset demo data" in the sidebar footer, returns to
the prototype's starting data.

Tests (21: crypto vectors, every protocol, HTTP layer):
```
python run_tests.py
```

### Flows of the Four bMail Features

| Feature | Flow | Where |
|---|---|---|
| **Identifiability** | Receiver requests identification from the ISP → ISP validates the request and asks the sender's permission → Sender approves → bCA signs an identification certificate addressed to that receiver; Sender receives a disclosure event confirming it. If the sender declines, no certificate is issued | `isp.py request_identification → notify_sender → sender_decides`, `bca.py attest_identifiable` |
| **Verification** | Receiver requests verification from the ISP → ISP contacts the sender over one backup channel (messenger, phone or backup email), never through the reported address → Sender confirms whether they sent the email → ISP sends the receiver the result | `isp.py report_suspicious / process_verification / sender_responds` |
| **Sustainability** | Implemented as the ID-change protocol's purpose plus the "lifelong" policy (the institutional deactivation itself is outside the system) | — |
| **Changeability** | Implemented end to end (see the bCA and platform rows below) | `isp.py request_id_change / issue_change_tokens` |

## 2. Status Map of Feature Implementation

Status key: Implemented = real logic; Implemented (static) = kept verbatim as explanatory
or survey content; Baseline = figure carried from the prototype as a starting number, live
activity added on top; Not implemented = stated in the row.

### bMail Users
| Prototype feature | Status | Where |
|---|---|---|
| Registration wizard: provider/domain, privacy mode, email name | Implemented — name rules: real `a-z0-9 . _ -`, anon 6–12 digits | `isp.py register`, `app.js submitReg` |
| Wizard: select bCA | Implemented — lists only active bCAs partnered with the chosen domain | `app.js renderBcaOptions` |
| "Personal data stays at the bCA; only a signed certificate is passed" | Implemented — consent token at bCA, certificate token to ISP | `bca.py grant_consent / issue` |
| Wizard: backup channels, "at least one required", "must differ from bMail ID" | Implemented | `isp.py register` |
| Wizard: two consent checkboxes | Implemented — both required by the ISP | `isp.py register` |
| "bCA will verify within 24 hours" | Implemented as a pending queue the bCA operator works (bCA › Certifications) | `bca.py queue/issue/reject` |
| Dashboard metrics: status, platforms linked, requests | Implemented (live) | `network.py state`, `app.js renderUser` |
| Dashboard "Trust score" | Replaced by "Flags on record" — the prototype gives no formula | `app.js` |
| Identity summary, certificate validity | Implemented, plus "View signed token" | `app.js renderUser` |
| Pending action: approve/deny identification request | Implemented | `isp.py sender_decides` |
| Pending action: expiring university email → Change ID | Implemented (legacy logins from the user's Wallet) | `network.py memberships` |
| Recent events timeline; Events & requests tabs | Implemented (ISP event feed per user) | `isp.py _event` |
| Backup channels list, add channel | Implemented | `isp.py add_backup_channel` |
| "Channels are validated annually" | Implemented as a manual "Run annual re-validation" (sends a check over every channel). No scheduler | `isp.py revalidate_channels` |
| "Identifiable anonymity explained" cards | Implemented (static, verbatim) | template KEEP 628-644 |
| Platform memberships table; "Upgrade to bMail" on KakaoTalk | Implemented; KakaoTalk shows "not in bMember registry" | `network.py memberships` |
| "Lifelong ID" | Implemented as policy: certificate valid 2 years (prototype's value), ID itself never expires. Renewal not implemented | `bca.py CERT_VALIDITY` |

### bMail ISP
| Prototype feature | Status | Where |
|---|---|---|
| Operator metrics (users, domains, requests, fake domains) | Implemented; user counts = Baseline + live | `isp.py view` |
| Domain health (DKIM renewal on bcoremail.com) | Implemented as registry data. Real DKIM/SPF/DMARC/ARC checks: not implemented | `isp.py add_domain` |
| Request queue, 4 tabs, Notify user / Reject / Process / Issue token | Implemented | `isp.py notify_sender / reject_request / process_verification / issue_change_tokens` |
| Domain registry, CA partners per domain | Implemented, partners derived from active bCAs | `isp.py ca_partners` |
| Fake domain intercepts | Implemented for portal look-ups (each look-up of a known fake is logged). "Transport layer filter" row is seed data only | `isp.py check_domain` |
| 30-day trust overview | Baseline + this session's completed requests | `app.js renderIsp` |
| Trust stats page (adoption bars, cross-country survey) | Implemented (static, verbatim); "Zero-copy certifications" is live | template KEEP 890-938 |
| bCA registry with pinned keys; platform registry | New (implied by "lists certified domains", "issues tokens to platforms") | `isp.py register_bca / register_platform` |

### Certification Authority (bCA)
| Prototype feature | Status | Where |
|---|---|---|
| bCA overview, profile, issuance process | Implemented, for any bCA (selector) | `bca.py public_view` |
| Pending: new registration → Issue cert / Reject | Implemented | `bca.py issue / reject` |
| Pending: "Re-certification — ID change, identity match confirmed" | Implemented: the bCA checks the old ID is on the same subscriber's record; refuses otherwise | `bca.py receive_change_verification` |
| Recently issued table | Implemented | `bca.py issued` |
| ISP partnerships table | Implemented | `app.js renderBca` |

### bMember platform
| Prototype feature | Status | Where |
|---|---|---|
| Platform overview metrics | Baseline (2.1M, 847K, 12,840, 4,211 for Coupang) + live records | `network.py seed`, `bmember.py view` |
| Member trust breakdown | Implemented over the live member records | `app.js renderPlatform` |
| Member detail and roster | Implemented, plus ID history after a change | `bmember.py` |
| Enrolment with a bMail ID (txn 4) | Implemented: portal check + ISP-signed status attestation verified with the pinned ISP key | `bmember.py enroll` |
| Review trust layer: tags by certification | Implemented: tier assigned from the author's login (Identifiable author / Domain certified / Unverified) | `bmember.py trust_tier / post_review` |
| Unreachable members, Send change invite | Implemented (invite goes to the simulated outbox) | `bmember.py outreach_action` |
| Secure ID-change on the platform side | Implemented: verifies ISP signature, audience, expiry, one-time nonce (replay), duplicate new ID; remaps and keeps history | `bmember.py apply_change_token` |

### Other System Features
| Prototype feature | Status | Where |
|---|---|---|
| Domain verification portal (3 outcomes, same wording) | Implemented; also accepts a full address | `isp.py check_domain`, `app.js checkDomain` |
| How to interpret a bMail address | Implemented (static, verbatim) | template KEEP 1278-1298 |
| Trust flow visualizer, Architecture, SEM table | Implemented (static, verbatim) | template KEEP 1303-1431 |
| Floating transaction panel T1–T4 | Implemented: each button runs the real protocol on the server; the prototype's progress animation replays the server's log | `network.py run_step`, `app.js runTx` |
| Receiver tools, Backup-channel outbox, Token inspector | New — the prototype had no way to act as the receiver or to see backup-channel messages | `app.js` |

## 3. Source layout

```
bmail_id_src/
  run_server.py               start the server
  run_tests.py                run all tests
  backend/
    crypto/ed25519.py         Ed25519 sign/verify, pure Python (RFC 8032)
    crypto/jws.py             compact signed tokens (JWS, alg EdDSA)
    common.py                 ids, errors, simulated backup-channel Outbox
    bca.py                    bCA: subscriber records (private), consent, certificates,
                              change confirmation
    isp.py                    ISP: domain registry, portal, registration, the 4 protocols,
                              metrics
    bmember.py                platform: enrolment, change-token verification,
                              review tiers, outreach
    network.py                wiring, user Wallet, seed data,
                              guided scenario (txn panel T1-T4)
    api.py                    HTTP/JSON routes + static file server (http.server)
  frontend/
    layout.template.html      page template; {{KEEP a-b}} = verbatim prototype lines a-b
    index.html                GENERATED by tools/build_frontend.py; do not edit by hand
    styles.css                GENERATED: prototype CSS verbatim + additions.css
    additions.css             the few new styles (toast, token box)
    app.js                    UI logic (prototype helpers verbatim where marked)
                              + API calls
  tools/build_frontend.py     rebuilds index.html/styles.css;
                              refuses if the prototype file changed
  prototype/                  the original research prototype HTML (anonymised)
  prototype_extract/          the prototype's script, style and markup blocks,
                              verbatim, for reference
  tests/                      test_crypto.py, test_protocols.py, test_api.py
```

## 4. Limitations of the Implementation

* Sending or receiving email. No SMTP, no mailbox, no DKIM signing. "bMail" here is the identity layer only.
* Authentication of the parties. As in the prototype, the sidebar lets anyone act as user, ISP,
  bCA or platform. A real deployment needs login for users and mutual TLS / API keys between parties.
* Real messenger/SMS/email delivery — the outbox is a list on the server.
* Persistence — in memory only.
* Production-grade crypto — the Ed25519 code is correct but not constant-time; swap in a vetted
  library behind the same `sign/verify/public_key` functions before any real use.

## 5. Optional Design Choices

| Question | Choice | Why |
|---|---|---|
| How does the bCA know which subscriber is registering? | The user gives the bCA their subscriber number directly (stands for logging into the bCA's own app) and gets a signed consent token bound to the exact bMail address | The only way to keep "no personal data at the ISP" true |
| Signature scheme / token format | Ed25519 + JWS compact form | Standard, short, explainable in a Methods section; no dependencies needed |
| What a certificate says | `sub` (bMail ID), `identifiable: true`, `mode`, `iss`, `iat`, `exp` — no name | Zero-copy; pseudonyms and real names are certified alike |
| Change-token contents | old ID, new ID, issuing bCA, `aud` = one platform, one-time nonce, 24 h expiry | Prototype listed "old ID, new ID, bCA confirmation, timestamp"; audience + nonce stop reuse at another platform and replay |
| Anonymous pseudonym when none is typed | Generated number (`1990…`) by the ISP for programmatic use; the wizard asks for one because the consent token is bound to the exact address | — |
| Seed inconsistencies in the prototype | SKT is shown both as "pending" (bCA page) and as certifying h.lee; here SKT is pending until T1, and h.lee is certified by KT. KT partners both bgmail.com and bnaver.com (its own partnership page), so bnaver.com lists KT + KB (+ SKT after T1) instead of "SKT, KB Bank" | One consistent state |
| Display name | Kept in the user's client (Wallet) and given to platforms by the user, never to the ISP | Zero-copy |
| Seed headline numbers | Kept exactly (24,831 users; 18,402 / 5,210 / 1,219 per domain; KT 14,221) as baselines; test `test_seed_matches_prototype_headline_figures` | The prototype's screens look the same at start |
