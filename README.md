# bMail ID Infrastructure — source build of the research prototype

Built from the original research prototype, included (anonymised for review: author names, citations and local paths replaced; otherwise unchanged) as
`prototype/bmail_id_research_prototype.html` (2,052 lines; SHA-256 in
`prototype_extract/SOURCE_SHA256.txt`; open it directly in a browser to see the original mock-up).
Pure Python 3 standard library on the back end and plain HTML/CSS/JS on the front end: nothing to install.

**Quick start:** `python run_server.py`, then open <http://127.0.0.1:8765/>. Tests: `python run_tests.py`.

## 1. What the prototype actually was

**A static, front-end-only mock-up.** It has no back end, no network calls, no cryptography and no
stored state. Its JavaScript (extracted verbatim to `prototype_extract/`) does three things only:

| Prototype code | What it really does |
|---|---|
| `showView`, `openModal`, `switchInnerTab`, `showFlow`, wizard `setWizStep` | UI navigation |
| `submitReg`, `submitIDChange`, `processPhishing`, `processReq`, `approveRequest`, `denyRequest` | **Show a "done" message or badge. Nothing is submitted, signed or checked.** |
| `checkDomain` | The only real logic: a lookup in two hard-coded lists (3 valid, 5 fake domains) |
| "Transaction engine" `doT1`–`doT4` (floating "Prof. Morgan — Transactions" panel) | Prints scripted log lines on timers and overwrites numbers in the page (`14,221` → `14,222`, …) |

Every "signed certificate", "signed change token" and "zero-copy" statement in the prototype is
descriptive text. Every table row, count and request is hard-coded HTML.

## 2. What this source tree implements

The prototype's text describes four parties and four protocols (Identifiability, Verification,
Sustainability, Changeability). They are now real code:

* **Three separate parties**, each an object with private state that talks to the others only by
  method calls carrying signed tokens: `backend/isp.py`, `backend/bca.py`, `backend/bmember.py`
  (platform). The user's own client is `Wallet` in `backend/network.py`.
* **Real signatures.** Every token is a JWS (RFC 7515) signed with Ed25519 (RFC 8032, `alg: EdDSA`
  per RFC 8037). Ed25519 is implemented in pure Python (`backend/crypto/ed25519.py`) and is
  checked against the RFC 8032 test vectors.
* **Zero-copy is enforced, not stated.** The subscriber number goes from the browser straight to the
  bCA, which returns a signed consent token; the ISP only ever sees that token and the bCA's signed
  certificate, neither of which carries a name. A test (`test_zero_copy_isp_holds_no_personal_data`)
  serialises the whole ISP state and checks that no subscriber name, number or phone appears.
* **All the prototype's screens are kept** — same CSS (verbatim), same layout and wording — but
  every data view is rendered from `GET /api/state` and every button calls the API.

### Run it

From the repository folder, with any Python 3.8+:
```
python run_server.py            # optional: --port 8765
```
Open <http://127.0.0.1:8765/>.
The server binds to 127.0.0.1 only. State is in memory: restarting the server, or "Reset demo data"
in the sidebar footer, returns to the prototype's starting data.

Tests (21: crypto vectors, every protocol, HTTP layer):
```
python run_tests.py
```

Icons: the prototype linked a local `tabler-icons.min.css` that is not on disk, so its icons were
already blank. `index.html` loads that icon font from cdn.jsdelivr.net when online; offline the icons
are blank and nothing else changes.

### A 3-minute walk-through
1. **Floating panel** (bottom right) → run 1–4: SKT onboards as bCA, Prof. Morgan registers
   `alex.morgan@bgmail.com`, Amazon joins, Prof. Morgan enrolls. Log lines come from the server.
2. **My dashboard** (as j.park) → *Approve* the Coupang identification request → **Receiver tools**
   shows the signed identification certificate; *Verify certificate* checks its signature.
3. **ISP › Request queue** → *Process* the phishing report → **Backup-channel outbox** shows the code
   sent to h.lee's KakaoTalk → switch user to h.lee → enter code → *No — not me*.
4. As j.park → **Platform memberships** → *Change ID* on University Portal → *Initiate change* →
   *Act as bCA + ISP operators* → the portal remaps the member and keeps the history.

## 3. Source layout

```
bmail_id_src/
  run_server.py               start the server
  run_tests.py                run all tests
  backend/
    crypto/ed25519.py         Ed25519 sign/verify, pure Python (RFC 8032)
    crypto/jws.py             compact signed tokens (JWS, alg EdDSA)
    common.py                 ids, errors, simulated backup-channel Outbox
    bca.py                    bCA: subscriber records (private), consent, certificates, change confirmation
    isp.py                    ISP: domain registry, portal, registration, the 4 protocols, metrics
    bmember.py                platform: enrolment, change-token verification, review tiers, outreach
    network.py                wiring, user Wallet, seed data, guided scenario (txn panel T1-T4)
    api.py                    HTTP/JSON routes + static file server (http.server)
  frontend/
    layout.template.html      page template; {{KEEP a-b}} = verbatim prototype lines a-b
    index.html                GENERATED by tools/build_frontend.py — do not edit by hand
    styles.css                GENERATED: prototype CSS verbatim + additions.css
    additions.css             the few new styles (toast, token box)
    app.js                    UI logic (prototype helpers verbatim where marked) + API calls
  tools/build_frontend.py     rebuilds index.html/styles.css; refuses if the prototype file changed
  prototype/                  the original research prototype HTML (anonymised)
  prototype_extract/          the prototype's script, style and markup blocks, verbatim, for reference
  tests/                      test_crypto.py, test_protocols.py, test_api.py
```

## 4. Feature map — every prototype feature

**Status key:** **Implemented** = real logic; **Implemented (static)** = kept verbatim as explanatory
or survey content; **Baseline** = figure carried from the prototype as a starting number, live
activity added on top; **Not implemented** = see reason.

### User
| Prototype feature | Status | Where |
|---|---|---|
| Registration wizard: provider/domain, privacy mode, email name | Implemented — name rules: real `a-z0-9 . _ -`, anon 6–12 digits | `isp.py register`, `app.js submitReg` |
| Wizard: select bCA | Implemented — lists only **active bCAs partnered with the chosen domain** | `app.js renderBcaOptions` |
| "Personal data stays at the bCA; only a signed certificate is passed" | Implemented — consent token at bCA, certificate token to ISP | `bca.py grant_consent / issue` |
| Wizard: backup channels, "at least one required", "must differ from bMail ID" | Implemented | `isp.py register` |
| Wizard: two consent checkboxes | Implemented — both required by the ISP | `isp.py register` |
| "bCA will verify within 24 hours" | Implemented as a pending queue the bCA operator works (bCA › Certifications) | `bca.py queue/issue/reject` |
| Dashboard metrics: status, platforms linked, requests | Implemented (live) | `network.py state`, `app.js renderUser` |
| Dashboard "Trust score 98" | **Replaced** by "Flags on record" — the prototype gives no formula | `app.js` |
| Identity summary, certificate validity | Implemented, plus "View signed token" | `app.js renderUser` |
| Pending action: approve/deny identification request | Implemented | `isp.py sender_decides` |
| Pending action: expiring university email → Change ID | Implemented (legacy logins from the user's Wallet) | `network.py memberships` |
| Recent events timeline; Events & requests tabs | Implemented (ISP event feed per user) | `isp.py _event` |
| Privacy-mode selector (real ↔ anon) | **Not implemented as a switch** — the prototype only changed preview text. Here the mode is fixed per address; use a second bMail ID for the other mode | `app.js` note |
| Backup channels list, add channel | Implemented | `isp.py add_backup_channel` |
| "Channels are validated annually" | Implemented as a manual "Run annual re-validation" (sends a check over every channel). No scheduler | `isp.py revalidate_channels` |
| "Identifiable anonymity explained" cards | Implemented (static, verbatim) | template KEEP 628-644 |
| Platform memberships table; "Upgrade to bMail" on KakaoTalk | Implemented; KakaoTalk shows "not in bMember registry" (it never joined, so no protocol exists) | `network.py memberships` |
| "Lifelong ID" | Implemented as policy: certificate valid 2 years (prototype's value), ID itself never expires. **Renewal not implemented** | `bca.py CERT_VALIDITY` |

### bMail ISP
| Prototype feature | Status | Where |
|---|---|---|
| Operator metrics (users, domains, requests, fake domains) | Implemented; user counts = Baseline + live | `isp.py view` |
| Domain health (DKIM renewal on bcoremail.com) | Implemented as registry data. **Real DKIM/SPF/DMARC/ARC checks: not implemented** (no mail transport exists) | `isp.py add_domain` |
| Request queue, 4 tabs, Notify user / Reject / Process / Issue token | Implemented | `isp.py notify_sender / reject_request / process_verification / issue_change_tokens` |
| Domain registry, CA partners per domain | Implemented, partners derived from active bCAs | `isp.py ca_partners` |
| Fake domain intercepts | Implemented for portal look-ups (each look-up of a known fake is logged). "Transport layer filter" row is seed data only | `isp.py check_domain` |
| Detection of *new* look-alike domains | **Not implemented** — the prototype only had a fixed list | — |
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
| CA preference by country (survey) | Implemented (static, verbatim) | template KEEP 1017-1036 |
| ISP partnerships table | Implemented | `app.js renderBca` |

### bMember platform
| Prototype feature | Status | Where |
|---|---|---|
| Platform overview metrics | Baseline (2.1M, 847K, 12,840, 4,211 for Coupang) + live records | `network.py seed`, `bmember.py view` |
| Member trust breakdown | Implemented over the live member records | `app.js renderPlatform` |
| Member detail and roster | Implemented, plus ID history after a change | `bmember.py` |
| Enrolment with a bMail ID (txn 4) | Implemented: portal check + ISP-signed status attestation verified with the pinned ISP key | `bmember.py enroll` |
| Review trust layer: tags by certification | Implemented: tier assigned from the author's login (Identifiable author / Domain certified / Unverified) | `bmember.py trust_tier / post_review` |
| "High fake risk — pattern detected" | **Not implemented** — no detection rule in the prototype; the seeded flag is kept, and Remove works | `bmember.py remove_review` |
| Unreachable members, Send change invite, Deactivate | Implemented (invite goes to the simulated outbox) | `bmember.py outreach_action` |
| Secure ID-change on the platform side | Implemented: verifies ISP signature, audience, expiry, one-time nonce (replay), duplicate new ID; remaps and keeps history | `bmember.py apply_change_token` |

### System and the four protocols
| Prototype feature | Status | Where |
|---|---|---|
| Domain verification portal (3 outcomes, same wording) | Implemented; also accepts a full address | `isp.py check_domain`, `app.js checkDomain` |
| How to interpret a bMail address | Implemented (static, verbatim) | template KEEP 1278-1298 |
| **Identifiability flow** | Implemented: receiver → ISP validates → sender approves → bCA signs an identification certificate addressed to that receiver; sender gets a disclosure event | `isp.py request_identification → notify_sender → sender_decides`, `bca.py attest_identifiable` |
| **Verification (phishing) flow** | Implemented: ISP picks a backup channel (messenger, then phone, then email; never the flagged address), sends a one-time code; sender answers; denial → incident + password-reset flag; receiver told the result | `isp.py process_verification / sender_responds` |
| **Sustainability** | Implemented as the ID-change protocol's purpose plus the "lifelong" policy; the institutional deactivation itself is outside the system | — |
| **Changeability flow** | Implemented end to end (see bCA and platform rows) | `isp.py request_id_change / issue_change_tokens` |
| Trust flow visualizer, Architecture, SEM table | Implemented (static, verbatim) | template KEEP 1303-1431 |
| Floating transaction panel T1–T4 | Implemented: each button runs the real protocol on the server; the prototype's progress animation replays the server's log | `network.py run_step`, `app.js runTx` |
| Receiver tools, Backup-channel outbox, Token inspector | **New** — the prototype had no way to act as the receiver or to see backup-channel messages | `app.js` |

### Not implemented at all (the prototype never had these either)
* **Sending or receiving email.** No SMTP, no mailbox, no DKIM signing. "bMail" here is the identity layer only.
* **Authentication of the parties.** As in the prototype, the sidebar lets anyone act as user, ISP,
  bCA or platform. A real deployment needs login for users and mutual TLS / API keys between parties.
* **Real messenger/SMS/email delivery** — the outbox is a list on the server.
* **Persistence** — in memory only.
* **Production-grade crypto** — the Ed25519 code is correct but not constant-time; swap in a vetted
  library behind the same `sign/verify/public_key` functions before any real use.

## 5. Design choices where the prototype was silent

| Question | Choice | Why |
|---|---|---|
| How does the bCA know which subscriber is registering? | The user gives the bCA their subscriber number directly (stands for logging into the bCA's own app) and gets a signed consent token bound to the exact bMail address | The only way to keep "no personal data at the ISP" true |
| Signature scheme / token format | Ed25519 + JWS compact form | Standard, short, explainable in a Methods section; no dependencies needed |
| What a certificate says | `sub` (bMail ID), `identifiable: true`, `mode`, `iss`, `iat`, `exp` — no name | Zero-copy; pseudonyms and real names are certified alike |
| Change-token contents | old ID, new ID, issuing bCA, `aud` = one platform, one-time nonce, 24 h expiry | Prototype listed "old ID, new ID, bCA confirmation, timestamp"; audience + nonce stop reuse at another platform and replay |
| Anonymous pseudonym when none is typed | Generated number (`1990…`) by the ISP for programmatic use; the wizard asks for one because the consent token is bound to the exact address | — |
| Seed inconsistencies in the prototype | SKT is shown both as "pending" (bCA page) and as certifying h.lee; here SKT is **pending until T1**, and h.lee is certified by KT. KT partners both bgmail.com and bnaver.com (its own partnership page), so bnaver.com lists KT + KB (+ SKT after T1) instead of "SKT, KB Bank" | One consistent state |
| Display name | Kept in the user's client (Wallet) and given to platforms by the user, never to the ISP | Zero-copy |
| Seed headline numbers | Kept exactly (24,831 users; 18,402 / 5,210 / 1,219 per domain; KT 14,221) as baselines; test `test_seed_matches_prototype_headline_figures` | The prototype's screens look the same at start |
| Earlier prototype versions | Not used: a later copy differed only in two comment/link lines; an earlier version had a subset of the same functions | — |
