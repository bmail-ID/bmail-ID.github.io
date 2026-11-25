/* bMail ID prototype — front end.
 *
 * The prototype's UI helpers (navigation, modals, tabs, wizard stepping, flow
 * visualizer, transaction-panel animation) are kept verbatim where marked.
 * Everything that showed data now renders from GET /api/state, and every
 * button calls the API: the hard-coded rows of the prototype are gone.
 */
'use strict';

var S = null;                       // last /api/state snapshot
var currentUser = null;
var currentBca = 'kt';
var currentPlatform = 'coupang';
var selectedMember = null;
var phishingReq = null;
var changeReq = null;

// ── API ──────────────────────────────────────────────────────────────
function api(method, path, body) {
  return fetch(path, {method: method, headers: {'Content-Type': 'application/json'},
                      body: body ? JSON.stringify(body) : undefined})
    .then(function (r) { return r.json().then(function (j) {
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      return j;
    }); });
}
function act(method, path, body, okMsg) {
  return api(method, path, body).then(function (res) {
    if (okMsg) toast(okMsg, true);
    return refresh().then(function () { return res; });
  }).catch(function (e) { toast(e.message, false); throw e; });
}
function refresh() {
  return api('GET', '/api/state' + (currentUser ? '?user=' + encodeURIComponent(currentUser) : ''))
    .then(function (s) { S = s; currentUser = s.current_user; renderAll(); });
}
var toastTimer = null;
function toast(msg, ok) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + (ok ? 'ok' : 'err');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, 4500);
}

// ── small render helpers ──────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; });
}
function q(s) { return esc(JSON.stringify(s)); }   // safe inline-handler argument
function badge(cls, html) { return '<span class="badge b-' + cls + '">' + html + '</span>'; }
function metric(label, val, cls, sub) {
  return '<div class="metric"><div class="metric-label">' + label + '</div><div class="metric-val ' + (cls || '') + '">' +
    val + '</div>' + (sub ? '<div class="metric-sub">' + sub + '</div>' : '') + '</div>';
}
function field(lbl, val) { return '<div class="field"><span class="field-lbl">' + lbl + '</span><span class="field-val">' + val + '</span></div>'; }
function fmt(n) { return Number(n).toLocaleString('en-US'); }
function set(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }
function setAll(sel, html) { document.querySelectorAll(sel).forEach(function (el) { el.innerHTML = html; }); }
function reqItem(icon, color, title, sub, actions) {
  return '<div class="req-item"><div class="req-icon ri-' + color + '"><i class="ti ti-' + icon + '" style="color:var(--' + color + '-600)"></i></div>' +
    '<div class="req-body"><div class="req-title">' + title + '</div><div class="req-sub">' + sub + '</div></div>' +
    (actions ? '<div class="req-actions">' + actions + '</div>' : '') + '</div>';
}
var STATUS = {
  'received': ['amber', 'Received'], 'awaiting-sender': ['amber', 'Awaiting sender'],
  'awaiting-bca': ['amber', 'Awaiting bCA'], 'bca-confirmed': ['blue', 'bCA confirmed'],
  'certified': ['green', 'Certificate issued'], 'declined': ['red', 'Declined by sender'],
  'rejected': ['red', 'Rejected'], 'rejected-by-bca': ['red', 'Rejected by bCA'],
  'completed': ['green', 'Completed'], 'legitimate': ['green', 'Sender confirmed'],
  'phishing-confirmed': ['red', 'Phishing confirmed'], 'active': ['green', 'Active'],
  'pending-certification': ['amber', 'Pending certification'], 'pending': ['amber', 'Pending'],
  'issued': ['green', 'Issued'], 'approved': ['green', 'Approved']
};
function statusBadge(s) { var m = STATUS[s] || ['gray', s]; return badge(m[0], esc(m[1])); }
function bcaName(id) { return S.bcas[id] ? S.bcas[id].name : id; }

// ── Navigation / modals / tabs (verbatim from the prototype) ─────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  var el = document.getElementById('view-' + id);
  if (el) el.classList.add('active');
  event && event.target && event.target.closest('.nav-item') && event.target.closest('.nav-item').classList.add('active');
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-wrap').forEach(function(m) {
  m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('open'); });
});
function switchInnerTab(el, panelId) {
  var card = el.closest('.card');
  card.querySelectorAll('.inner-tab').forEach(t => t.classList.remove('active'));
  card.querySelectorAll('.inner-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  var panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
}
function showFlow(prefix, n, total) {
  for (var i = 1; i <= total; i++) {
    var panel = document.getElementById(prefix + 'panel' + i);
    var btn = document.getElementById(prefix + 'btn' + i);
    if (panel) panel.style.display = i === n ? 'block' : 'none';
    if (btn) btn.className = i === n ? 'btn btn-primary' : 'btn';
  }
}

// ── selectors ─────────────────────────────────────────────────────────
function setUser(u) { currentUser = u; refresh(); }
function setBca(b) { currentBca = b; renderAll(); }
function setPlatform(p) { currentPlatform = p; selectedMember = null; renderAll(); }

// ══════════════════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════════════════
function renderAll() {
  if (!S) return;
  set('isp-req-badge', S.isp.open_requests);
  var bcaPend = Object.keys(S.bcas).reduce(function (a, k) { return a + S.bcas[k].pending; }, 0);
  set('bca-req-badge', bcaPend);
  set('outbox-badge', S.outbox.length);
  renderUser(); renderIsp(); renderBca(); renderPlatform(); renderPortal(); renderReceiver(); renderOutbox();
  renderScenarioPanel();
}

// ── USER ─────────────────────────────────────────────────────────────
function renderUser() {
  set('user-select', S.users.map(function (u) {
    return '<option value="' + esc(u) + '"' + (u === currentUser ? ' selected' : '') + '>' + esc(u) + '</option>'; }).join(''));
  var U = S.user;
  if (!U) return;
  var a = U.account;
  set('ud-email', esc(U.bmail_id));
  set('ud-ca', esc(a.bca_name));
  var bm = U.memberships.filter(function (m) { return m.kind === 'bMember'; }).length;
  var pendingCount = U.pending.length + U.verifications.length;
  set('ud-metrics',
    metric('bMail status', '<span style="font-size:18px">' + (a.status === 'active' ? 'Active' : esc(STATUS[a.status] ? STATUS[a.status][1] : a.status)) + '</span>',
           a.status === 'active' ? 'mv-green' : 'mv-amber', 'Lifelong ID') +
    metric('Platforms linked', U.memberships.length, 'mv-blue', bm + ' bMember · ' + (U.memberships.length - bm) + ' legacy') +
    metric('Pending requests', pendingCount, 'mv-amber', pendingCount ? 'needs your answer' : 'nothing waiting') +
    metric('Flags on record', a.flags.length, a.flags.length ? 'mv-red' : 'mv-purple', a.flags.length ? esc(a.flags.join(', ')) : 'No flags on record'));
  set('ud-identity',
    '<div class="card-header"><div class="card-title"><i class="ti ti-id-badge-2"></i> Identity summary</div><button class="btn btn-sm btn-primary" onclick="showView(\'user-identity\')">Manage</button></div>' +
    field('bMail address', '<span class="mono">' + esc(U.bmail_id) + '</span>') +
    field('Display name', esc(U.display_name)) +
    field('Certified by', esc(a.bca_name) + ' ' + statusBadge(a.status)) +
    field('Privacy mode', badge('blue', a.mode === 'real' ? 'Real name' : 'Anonymous')) +
    field('Certificate', U.certificate ? 'valid until ' + esc(a.cert_expiry) + ' <button class="btn btn-sm" onclick="openToken(S.user.certificate)">View signed token</button>' : '—'));

  var p = '';
  U.memberships.filter(function (m) { return m.expiring; }).forEach(function (m) {
    p += reqItem('alert-triangle', 'amber', 'Legacy login at ' + esc(m.platform), esc(m.login) + (m.protocol ? ' · can move to your bMail ID' : ' · platform has not adopted the protocol'),
      m.protocol ? '<button class="btn btn-sm btn-primary" onclick="openIdChange(' + q(m.login) + ')">Change ID</button>' : '');
  });
  U.pending.forEach(function (r) {
    p += reqItem('id-badge-2', 'blue', 'Identification request', 'From ' + esc(r.requester) + ' · ' + esc(r.purpose) + ' · ' + esc(r.created),
      '<button class="btn btn-sm btn-success" onclick="decide(' + q(r.id) + ',true)">Approve</button><button class="btn btn-sm btn-danger" onclick="decide(' + q(r.id) + ',false)">Deny</button>');
  });
  U.verifications.forEach(function (r) {
    p += '<div class="req-item" style="display:block">' +
      '<div class="req-title"><i class="ti ti-shield-exclamation" style="color:var(--purple-600)"></i> Phishing check: did you send an email to ' + esc(r.receiver) + '?</div>' +
      '<div class="req-sub">The one-time code was sent to your backup channel (' + esc(r.channel.kind) + ' ' + esc(r.channel.value) + ') — see the outbox.</div>' +
      '<div class="inline-form"><input class="form-input" id="code-' + esc(r.id) + '" placeholder="6-digit code">' +
      '<button class="btn btn-sm btn-success" onclick="respond(' + q(r.id) + ',true)">Yes, I sent it</button>' +
      '<button class="btn btn-sm btn-danger" onclick="respond(' + q(r.id) + ',false)">No — not me</button></div></div>';
  });
  U.change_requests.filter(function (r) { return r.status !== 'completed'; }).forEach(function (r) {
    p += reqItem('arrows-exchange', 'amber', 'ID change in progress', esc(r.old_id) + ' → ' + esc(r.target), statusBadge(r.status));
  });
  if (a.status !== 'active') p += reqItem('clock', 'amber', 'Waiting for certification', esc(a.bca_name) + ' has not issued your certificate yet (bCA › Certifications)', '');
  set('ud-pending', p || '<div class="form-hint">Nothing waiting.</div>');

  set('user-events-timeline', U.events.slice(0, 8).map(function (e) {
    return '<div class="tl-item"><div class="tl-time">' + esc(e.time) + '</div><div class="tl-text"><strong>' + esc(e.title) + '</strong> — ' + esc(e.detail) + '</div></div>';
  }).join('') || '<div class="form-hint">No events yet.</div>');

  // identity view
  set('uid-settings',
    '<div class="card-title" style="margin-bottom:1rem"><i class="ti ti-mail"></i> bMail address settings</div>' +
    '<div class="form-group"><label class="form-label">Privacy mode of this ID</label>' +
    '<div>' + badge(a.mode === 'real' ? 'blue' : 'gray', a.mode === 'real' ? 'Real name' : 'Anonymous') + '</div>' +
    '<div class="form-hint">' + (a.mode === 'anon'
      ? 'Receivers see only your pseudonym. The ' + esc(a.domain) + ' domain still certifies your identifiability — you remain reachable via the bMail ISP if a valid request is made and you approve it.'
      : 'Receivers can see your name. Your certified identity remains private unless you approve a request from a valid receiver through the bMail ISP.') +
    ' The mode is fixed per address: to use the other mode, register a second bMail ID.</div></div>' +
    '<div class="alert a-info"><i class="ti ti-mail"></i>Active bMail ID: <strong>' + esc(U.bmail_id) + '</strong></div><hr class="div">' +
    field('Certified by', esc(a.bca_name) + ' ' + (a.cert_expiry ? badge('green', '<i class="ti ti-check"></i> Valid until ' + esc(a.cert_expiry)) : statusBadge(a.status))) +
    field('ID sustainability', badge('blue', 'Lifelong — ISP guaranteed')) +
    field('Domain status', badge('green', '<span class="dot dot-green"></span> ' + esc(a.domain) + ' listed on bMail portal')) +
    '<div class="btn-row"><button class="btn btn-primary" onclick="showView(\'domain-portal\');document.getElementById(\'domain-input\').value=' + q(a.domain) + ';checkDomain()"><i class="ti ti-search"></i> Verify my domain</button></div>');
  set('uid-channels',
    '<div class="card-title" style="margin-bottom:1rem"><i class="ti ti-shield"></i> Backup verification channels</div>' +
    '<div class="alert a-info"><i class="ti ti-lock"></i>These are never disclosed to anyone. Used only when you approve a verification request.</div>' +
    a.backup_channels.map(function (c) {
      return field(esc(c.kind), '<span class="mono">' + esc(c.value) + '</span> ' + badge('green', esc(c.status)) + ' <span class="form-hint">validated ' + esc(c.last_validated) + '</span>');
    }).join('') + '<hr class="div">' +
    '<div class="form-group" style="margin-bottom:0"><label class="form-label">Add new channel</label><div style="display:flex;gap:8px">' +
    '<select class="form-select" id="ch-kind" style="width:130px"><option value="messenger">Messenger</option><option value="phone">Phone</option><option value="email">Email</option></select>' +
    '<input type="text" class="form-input" id="ch-value" placeholder="Messenger ID or phone">' +
    '<button class="btn btn-primary" onclick="addChannel()"><i class="ti ti-plus"></i> Add</button></div></div>' +
    '<div class="btn-row"><button class="btn" onclick="revalidate()"><i class="ti ti-refresh"></i> Run annual re-validation</button></div>');

  // platforms view
  set('up-metrics', metric('Total platforms', U.memberships.length, 'mv-blue') + metric('bMember status', bm, 'mv-green') +
    metric('Legacy login', U.memberships.filter(function (m) { return m.expiring; }).length, 'mv-amber') +
    metric('Change possible', U.memberships.filter(function (m) { return m.expiring && m.protocol; }).length, 'mv-purple'));
  set('user-plat-tbody', U.memberships.map(function (m) {
    var st = m.kind === 'bMember' ? badge('green', '<i class="ti ti-shield-check"></i> bMember') : m.expiring ? badge('amber', 'Legacy / expiring') : badge('gray', 'Legacy ID');
    var action = m.expiring && m.protocol ? '<button class="btn btn-sm btn-primary" onclick="openIdChange(' + q(m.login) + ')"><i class="ti ti-arrows-exchange"></i> Change ID</button>'
      : m.expiring ? '<span class="form-hint">Platform not in bMember registry</span>' : '';
    return '<tr><td><strong>' + esc(m.platform) + '</strong></td><td class="mono"' + (m.expiring ? ' style="color:var(--amber-600)"' : '') + '>' + esc(m.login) + '</td><td>' + esc(m.since) +
      '</td><td>' + st + '</td><td>' + esc(m.activity) + '</td><td>' + action + '</td></tr>';
  }).join(''));

  // events view
  var icon = {identification: ['id-badge-2', 'blue'], verification: ['shield-exclamation', 'purple'], system: ['circle-check', 'green']};
  function evList(filter) {
    return U.events.filter(filter).map(function (e) {
      var ic = icon[e.category] || icon.system;
      return reqItem(ic[0], ic[1], esc(e.title), esc(e.detail) + ' · ' + esc(e.time), '');
    }).join('') || '<div class="form-hint">None.</div>';
  }
  set('events-all', evList(function () { return true; }));
  set('events-id', evList(function (e) { return e.category === 'identification'; }));
  set('events-ver', evList(function (e) { return e.category === 'verification'; }));
  set('events-sys', evList(function (e) { return e.category === 'system'; }));
}

function decide(id, approve) { act('POST', '/api/user/requests/' + id + '/decide', {approve: approve}, approve ? 'Approved: certificate sent to the receiver' : 'Declined'); }
function respond(id, sent) {
  var code = (document.getElementById('code-' + id) || {}).value;
  act('POST', '/api/user/verifications/' + id + '/respond', {code: code, sent_by_me: sent}, sent ? 'Confirmed as genuine' : 'Phishing confirmed — change your password');
}
function addChannel() {
  act('POST', '/api/user/backup-channels', {bmail_id: currentUser, kind: document.getElementById('ch-kind').value,
    value: document.getElementById('ch-value').value}, 'Channel added');
}
function revalidate() { act('POST', '/api/user/backup-channels/revalidate', {bmail_id: currentUser}, 'Check messages sent to every channel (see outbox)'); }

// ── ISP ──────────────────────────────────────────────────────────────
function ispReqRow(r) {
  var a = '';
  if (r.kind === 'identification') {
    if (r.status === 'received') a = '<button class="btn btn-sm btn-success" onclick="ispAct(' + q(r.id) + ',\'notify\')">Notify user</button><button class="btn btn-sm btn-danger" onclick="ispAct(' + q(r.id) + ',\'reject\')">Reject</button>';
    else if (r.status === 'certified') a = statusBadge(r.status) + ' <button class="btn btn-sm" onclick="openToken(' + q(r.certificate) + ')">Token</button>';
    else a = statusBadge(r.status);
    return reqItem('id-badge-2', 'blue', 'Identification request', 'Receiver: ' + esc(r.requester) + ' · Sender: ' + esc(r.target) + ' · ' + esc(r.created), a);
  }
  if (r.kind === 'verification') {
    a = r.status === 'received' ? '<button class="btn btn-sm btn-primary" onclick="openPhishing(' + q(r.id) + ')">Process</button>' : statusBadge(r.status);
    return reqItem('shield-exclamation', 'purple', 'Verification — phishing alert', 'Receiver: ' + esc(r.receiver) + ' · Sender: ' + esc(r.target) + ' · ' + esc(r.created), a);
  }
  if (r.status === 'bca-confirmed') a = '<button class="btn btn-sm btn-success" onclick="ispAct(' + q(r.id) + ',\'issue-token\')">Issue token</button>';
  else if (r.status === 'completed') a = statusBadge(r.status) + ' <span class="form-hint">' + esc(Object.keys(r.results).map(function (k) { return k + ': ' + r.results[k].result; }).join(', ')) + '</span>';
  else a = statusBadge(r.status);
  return reqItem('arrows-exchange', 'amber', 'ID change request', esc(r.old_id) + ' → ' + esc(r.target) + ' · Platforms: ' + esc(r.platforms.join(', ')) + ' · ' + esc(r.created), a);
}
function ispAct(id, verb) {
  var msg = {notify: 'Sender notified', reject: 'Rejected', 'issue-token': 'Signed change tokens transmitted to platforms'}[verb];
  act('POST', '/api/isp/requests/' + id + '/' + verb, {}, msg);
}
function renderIsp() {
  var I = S.isp, reqs = I.requests;
  var open = function (r) { return ['received', 'awaiting-sender', 'awaiting-bca', 'bca-confirmed'].indexOf(r.status) >= 0; };
  var count = function (k) { return reqs.filter(function (r) { return r.kind === k && open(r); }).length; };
  set('isp-domain-list', esc(I.domains.map(function (d) { return d.domain; }).join(' · ')));
  set('isp-metrics', metric('Registered users', fmt(I.registered_users), 'mv-blue', 'prototype baseline + this session') +
    metric('Active domains', I.domains.length, 'mv-green', 'All portal-listed') +
    metric('Open requests', I.open_requests, 'mv-amber', count('identification') + ' ID · ' + count('verification') + ' verify · ' + count('id-change') + ' change') +
    metric('Fake domains blocked', I.intercepts.length, 'mv-red', 'look-ups logged'));
  set('isp-health', I.domains.map(function (d) {
    return field(esc(d.domain), d.dkim === 'Active' ? badge('green', '<span class="dot dot-green"></span> Healthy · ' + fmt(d.users) + ' users')
      : badge('amber', '<span class="dot dot-amber"></span> DKIM renewal needed · ' + fmt(d.users) + ' users'));
  }).join(''));
  set('isp-latest', reqs.slice(0, 3).map(ispReqRow).join(''));
  var done = function (k, s) { return reqs.filter(function (r) { return r.kind === k && s.indexOf(r.status) >= 0; }).length; };
  set('isp-30d', metric('Identification events', fmt(I.baseline.id_events_30d + done('identification', ['certified', 'declined'])), 'mv-blue') +
    metric('Phishing verifications', fmt(I.baseline.phishing_30d + done('verification', ['legitimate', 'phishing-confirmed'])), 'mv-purple', I.incidents.length + ' incident(s) this session') +
    metric('ID changes processed', fmt(I.baseline.id_changes_30d + done('id-change', ['completed'])), 'mv-green') +
    metric('Fake domain attempts', fmt(I.baseline.fake_attempts_30d + I.intercepts.length - 3), 'mv-red', 'All blocked'));
  set('isp-req-sub', I.open_requests + ' open requests — identification, verification, and ID-change');
  set('req-tabs', '<div class="inner-tab active" onclick="switchInnerTab(this,\'req-all\')">All (' + reqs.length + ')</div>' +
    '<div class="inner-tab" onclick="switchInnerTab(this,\'req-id\')">Identification (' + reqs.filter(function (r) { return r.kind === 'identification'; }).length + ')</div>' +
    '<div class="inner-tab" onclick="switchInnerTab(this,\'req-ver\')">Verification (' + reqs.filter(function (r) { return r.kind === 'verification'; }).length + ')</div>' +
    '<div class="inner-tab" onclick="switchInnerTab(this,\'req-change\')">ID change (' + reqs.filter(function (r) { return r.kind === 'id-change'; }).length + ')</div>');
  set('req-all', reqs.map(ispReqRow).join(''));
  set('req-id-list', reqs.filter(function (r) { return r.kind === 'identification'; }).map(ispReqRow).join(''));
  set('req-ver-list', reqs.filter(function (r) { return r.kind === 'verification'; }).map(ispReqRow).join(''));
  set('req-change-list', reqs.filter(function (r) { return r.kind === 'id-change'; }).map(ispReqRow).join(''));
  set('isp-domain-tbody', I.domains.map(function (d) {
    var ok = d.dkim === 'Active';
    return '<tr><td class="mono">' + esc(d.domain) + '</td><td>' + esc(d.provider) + '</td><td>' + esc(d.ca_partners.join(', ')) + '</td><td>' + fmt(d.users) + '</td>' +
      '<td>' + badge(ok ? 'green' : 'amber', ok ? 'Active' : 'Renewal due') + '</td><td>' + badge('green', esc(d.dmarc)) + '</td><td>' + badge('green', 'Yes') + '</td>' +
      '<td>' + badge(ok ? 'green' : 'amber', '<span class="dot dot-' + (ok ? 'green' : 'amber') + '"></span> ' + (ok ? 'Healthy' : 'Action needed')) + '</td></tr>';
  }).join(''));
  set('isp-intercept-tbody', I.intercepts.map(function (x) {
    return '<tr><td class="mono" style="color:var(--red-600)">' + esc(x.domain) + '</td><td class="mono">' + esc(x.target) + '</td><td>' + esc(x.via) + '</td><td>' + esc(x.time) + '</td><td>' + badge('red', 'Blocked') + '</td></tr>';
  }).join(''));
  set('isp-bca-tbody', I.bcas.map(function (b) {
    return '<tr><td>' + esc(b.name) + '</td><td>' + esc(b.domains.join(', ')) + '</td><td class="mono">' + esc(S.bcas[b.id].kid) + '</td><td>' + statusBadge(b.status) + '</td></tr>';
  }).join(''));
  set('isp-plat-tbody', I.platforms.map(function (p) {
    return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.joined) + '</td><td>' + statusBadge(p.status) + '</td></tr>';
  }).join(''));
  var zc = document.getElementById('isp-zerocopy');
  if (zc) zc.textContent = fmt(I.registered_users);
}

// ── Phishing modal ───────────────────────────────────────────────────
function openPhishing(id) {
  phishingReq = id;
  var r = S.isp.requests.filter(function (x) { return x.id === id; })[0];
  set('phishing-body', '<div class="alert a-danger"><i class="ti ti-shield-exclamation"></i>Receiver ' + esc(r.receiver) + ' flagged a suspicious email from ' + esc(r.target) + ': “' + esc(r.note) + '”.</div>' +
    '<div class="steps">' +
    '<div class="step"><div class="step-num active">1</div><div class="step-body"><div class="step-title">ISP validates the receiver\'s request</div><div class="step-desc">The claimed sender must be a registered bMail ID.</div></div></div>' +
    '<div class="step"><div class="step-num">2</div><div class="step-body"><div class="step-title">ISP contacts sender via backup channel</div><div class="step-desc">A one-time code goes to the sender\'s registered messenger (or phone, then backup email) — never via the potentially compromised email address.</div></div></div>' +
    '<div class="step"><div class="step-num">3</div><div class="step-body"><div class="step-title">Sender confirms or denies</div><div class="step-desc">Answered from the sender\'s dashboard with the code. If denied: phishing confirmed, password reset flagged, incident logged.</div></div></div>' +
    '<div class="step"><div class="step-num">4</div><div class="step-body"><div class="step-title">Both parties protected</div><div class="step-desc">The receiver is told the result on its own channel.</div></div></div></div>');
  document.getElementById('phishing-done').style.display = 'none';
  document.getElementById('phishing-process').disabled = false;
  openModal('modal-phishing');
}
function processPhishing() {
  act('POST', '/api/isp/requests/' + phishingReq + '/process', {}).then(function (r) {
    var d = document.getElementById('phishing-done');
    d.innerHTML = '<i class="ti ti-circle-check"></i>Verification code sent to ' + esc(r.target) + ' via ' + esc(r.channel.kind) + ' (' + esc(r.channel.value) +
      '). The sender answers from their dashboard (switch user to ' + esc(r.target) + '); the code is in the backup-channel outbox.';
    d.style.display = 'flex';
    document.getElementById('phishing-process').disabled = true;
  });
}

// ── bCA ──────────────────────────────────────────────────────────────
function renderBca() {
  setAll('.bca-select', Object.keys(S.bcas).map(function (k) {
    return '<option value="' + k + '"' + (k === currentBca ? ' selected' : '') + '>' + esc(S.bcas[k].name) + (S.bcas[k].status !== 'active' ? ' (pending)' : '') + '</option>'; }).join(''));
  var B = S.bcas[currentBca];
  set('bca-title', esc(B.name) + (B.status !== 'active' ? ' <span style="color:var(--gray-400);font-size:16px">not yet onboarded</span>' : ''));
  set('bca-metrics', metric('Certified users', fmt(B.certified), 'mv-blue') + metric('Pending requests', B.pending, 'mv-amber') +
    metric('ISP domains', B.isp_domains.length, 'mv-green') + metric('Personal data at ISP', 0, 'mv-green', 'Zero-copy enforced'));
  set('bca-profile', '<div class="card-title" style="margin-bottom:1rem"><i class="ti ti-building-broadcast-tower"></i> CA profile</div>' +
    field('CA type', esc(B.type)) + field('Data held', esc(B.data_held)) + field('Country', esc(B.country)) +
    field('ISP partners', esc(B.isp_domains.join(', '))) + field('Certificate validity', '2 years') +
    field('Signing key', '<span class="mono">' + esc(B.kid) + '</span> Ed25519 · <span class="mono" style="font-size:10px">' + esc(B.jwk.x.slice(0, 22)) + '…</span>') +
    field('Zero-copy status', badge('green', '<i class="ti ti-check"></i> Enforced — no personal data transmitted to ISP')) +
    field('Pseudonym support', badge('blue', 'Yes — domain certified regardless of email name')));
  var pend = B.queue.filter(function (r) { return r.status === 'pending'; });
  set('cert-pending-tab', 'Pending (' + pend.length + ')');
  set('cert-pending', B.queue.map(function (r) {
    var title = r.kind === 'new' ? 'New registration — ' + esc(r.bmail_id) : 'Re-certification — ID change';
    var sub = (r.kind === 'new' ? esc(r.check) + ' · ' + (r.mode === 'real' ? 'Real name' : 'Anonymous') + ' mode'
      : esc(r.old_id) + ' → ' + esc(r.bmail_id) + ' · ' + esc(r.check)) + ' · ' + esc(r.received);
    var a = r.status !== 'pending' ? statusBadge(r.status) :
      '<button class="btn btn-sm btn-success" onclick="bcaAct(' + q(r.id) + ',\'issue\')">' + (r.kind === 'new' ? 'Issue cert' : 'Approve') + '</button>' +
      '<button class="btn btn-sm btn-danger" onclick="bcaAct(' + q(r.id) + ',\'reject\')">Reject</button>';
    return reqItem(r.kind === 'new' ? 'user-check' : 'refresh', r.kind === 'new' ? 'blue' : 'amber', title, sub, a);
  }).join('') || '<div class="form-hint">No requests.</div>');
  set('cert-recent-tbody', B.issued.map(function (c) {
    return '<tr><td class="mono">' + esc(c.bmail_id) + '</td><td>' + esc(c.type) + '</td><td>' + (c.mode === '-' ? '—' : badge(c.mode === 'real' ? 'blue' : 'gray', c.mode === 'real' ? 'Real name' : 'Anonymous')) +
      '</td><td>' + esc(c.issued) + '</td><td>' + esc(c.expiry === '-' ? '—' : c.expiry) + '</td><td>' + badge('green', esc(c.status)) + '</td></tr>';
  }).join(''));
  set('bca-partner-tbody', S.isp.bcas.map(function (b) {
    return '<tr><td>' + esc(b.name) + '</td><td class="mono">' + esc(b.domains.join(', ')) + '</td><td>' + esc(b.joined) + '</td><td>' + fmt(S.bcas[b.id].certified) +
      '</td><td>' + badge('green', 'Zero-copy') + '</td><td>' + statusBadge(b.status) + '</td></tr>';
  }).join(''));
}
function bcaAct(id, verb) { act('POST', '/api/bca/' + currentBca + '/requests/' + id + '/' + verb, {}, verb === 'issue' ? 'Signed and delivered to the ISP' : 'Rejected'); }

// ── PLATFORM ─────────────────────────────────────────────────────────
function renderPlatform() {
  setAll('.plat-select', Object.keys(S.platforms).map(function (k) {
    var P = S.platforms[k];
    return '<option value="' + k + '"' + (k === currentPlatform ? ' selected' : '') + '>' + esc(P.name) + ' (' + esc(P.protocol_status) + ')</option>'; }).join(''));
  var P = S.platforms[currentPlatform], b = P.baseline || {};
  var members = P.members, bmLive = P.bmembers_live;
  set('plat-title', esc(P.name) + ' · <span style="color:' + (P.bmember_platform ? 'var(--teal-600)' : 'var(--gray-400)') + ';font-size:16px">' +
    (P.bmember_platform ? 'bMember active ✓' : 'bMember: ' + esc(P.protocol_status)) + '</span>');
  set('plat-metrics', metric('Total members', b.total_members ? esc(b.total_members) : members.length) +
    metric('bMembers', b.bmembers ? fmt(b.bmembers + bmLive) : bmLive, 'mv-green', b.bmembers ? 'baseline + ' + bmLive + ' live records' : 'live records') +
    metric('Unreachable', b.unreachable ? fmt(b.unreachable) : P.outreach.length, 'mv-red', 'Suspended email IDs') +
    metric('Reviews flagged', (b.fake_blocked ? fmt(b.fake_blocked) + ' + ' : '') + P.reviews.filter(function (r) { return r.flag; }).length, 'mv-purple', 'baseline + live'));
  var total = members.length || 1;
  var legacy = members.filter(function (m) { return m.kind === 'legacy'; }).length;
  var unver = members.filter(function (m) { return m.kind === 'unverified'; }).length;
  function bar(lbl, n, color) {
    var pct = Math.round(100 * n / total);
    return '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:var(--text3)">' + lbl +
      '</span><span>' + n + ' (' + pct + '%)</span></div><div class="progress-wrap"><div class="progress-bar" style="width:' + pct + '%;background:var(--' + color + ')"></div></div></div>';
  }
  set('plat-breakdown', '<div class="card-title" style="margin-bottom:1rem"><i class="ti ti-users"></i> Member trust breakdown (live records)</div>' +
    bar('bMembers (identifiable)', bmLive, 'green-400') + bar('Legacy members', legacy, 'blue-200') + bar('Unverified', unver, 'red-400'));
  set('plat-urgent', '<div class="card-header"><div class="card-title"><i class="ti ti-alert-circle"></i> Unreachable members</div><button class="btn btn-sm btn-primary" onclick="showView(\'plat-unreachable\')">Manage</button></div>' +
    '<div class="alert a-warn"><i class="ti ti-alert-triangle"></i>' + (b.unreachable ? fmt(b.unreachable) + ' members have suspended email IDs. Revenue at risk: ' + esc(b.revenue_at_risk) + ' estimated annual orders (prototype figure).' : P.outreach.length + ' listed.') + '</div>');
  set('plat-enroll', '<div class="card-title" style="margin-bottom:1rem"><i class="ti ti-user-plus"></i> Sign-up with a bMail ID</div>' +
    (P.bmember_platform ? '<div class="form-hint" style="margin-bottom:8px">The platform checks the domain on the public portal, then verifies an ISP-signed status attestation with the ISP key it pinned when it joined.</div>' +
      '<div class="inline-form"><input class="form-input" id="en-bmail" placeholder="bMail ID" value="' + esc(currentUser || '') + '"><input class="form-input" id="en-name" placeholder="Display name" value="' + esc(S.user ? S.user.display_name : '') + '">' +
      '<button class="btn btn-primary" onclick="enroll()">Enroll</button></div>'
      : '<div class="alert a-warn"><i class="ti ti-alert-triangle"></i>' + esc(P.name) + ' has not joined the bMember registry, so it holds no ISP key and cannot verify bMail tokens.</div>'));
  // members
  var sel = members.filter(function (m) { return m.member_no === selectedMember; })[0] || members.filter(function (m) { return m.kind === 'bMember'; })[0] || members[0];
  if (sel) {
    var initials = (sel.name || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);
    set('plat-member-detail', '<div class="card-header"><div class="card-title"><i class="ti ti-user"></i> Member detail — ' + esc(sel.name) + '</div>' +
      (sel.kind === 'bMember' ? badge('green', '<i class="ti ti-shield-check"></i> bMember') : badge('gray', esc(sel.kind))) + '</div>' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:1rem"><div class="avatar av-blue" style="width:52px;height:52px;font-size:18px">' + esc(initials) + '</div>' +
      '<div><div style="font-size:16px;font-weight:600">' + esc(sel.name) + '</div><div style="font-size:13px;color:var(--text3)">Member ' + esc(sel.member_no) + ' since ' + esc(sel.since) + '</div></div></div>' +
      '<div class="g2"><div>' + field('Login ID', '<span class="mono">' + esc(sel.login) + '</span>') +
      field('Identifiable', sel.kind === 'bMember' ? badge('green', 'Yes — ' + esc(sel.certified_by) + ' certified') : badge('amber', 'No')) +
      field('ID sustainability', sel.kind === 'bMember' ? badge('blue', 'Lifelong') : badge('gray', 'Depends on provider')) + '</div><div>' +
      field('Total orders', esc(sel.orders)) + field('Member tier', badge('purple', esc(sel.tier))) +
      field('ID history', sel.history.length ? sel.history.map(function (h) { return esc(h.from) + ' → ' + esc(h.to) + ' (' + esc(h.time) + ')'; }).join('<br>') : '—') + '</div></div>');
  } else set('plat-member-detail', '<div class="form-hint">No members yet.</div>');
  var riskCls = {Low: 'green', Medium: 'amber', High: 'red'};
  set('plat-member-tbody', members.map(function (m) {
    var type = m.kind === 'bMember' ? (m.mode === 'anon' ? badge('teal', 'bMember (anon)') : badge('green', 'bMember')) : m.kind === 'legacy' ? badge('gray', 'Legacy') : badge('red', 'Unverified');
    return '<tr style="cursor:pointer" onclick="selectedMember=' + q(m.member_no) + ';renderPlatform()"><td>' + esc(m.name) + '</td><td class="mono">' + esc(m.login) + '</td><td>' + type + '</td><td>' + esc(m.certified_by || 'None') +
      '</td><td>' + esc(m.orders) + '</td><td>' + badge(riskCls[m.risk] || 'gray', esc(m.risk || '—')) + '</td></tr>';
  }).join(''));
  // reviews
  set('plat-review-metrics', metric('bMember reviews', (b.bmember_reviews ? fmt(b.bmember_reviews) + ' + ' : '') + P.reviews.filter(function (r) { return r.tier !== 'Unverified'; }).length, 'mv-green', 'Identifiable authors') +
    metric('Reviews removed', P.reviews.filter(function (r) { return r.removed; }).length, 'mv-purple', 'this session') +
    metric('Review trust score', b.review_trust ? esc(b.review_trust) : '—', 'mv-blue', 'prototype figure'));
  var tierBadge = {'Identifiable author': badge('green', '<i class="ti ti-shield-check"></i> bMember'), 'Domain certified': badge('teal', '<i class="ti ti-shield"></i> Domain certified'), 'Unverified': badge('amber', '<i class="ti ti-alert-triangle"></i> Unverified')};
  set('plat-review-feed', P.reviews.map(function (r) {
    var stars = '★★★★★'.slice(0, r.stars) + '☆☆☆☆☆'.slice(0, 5 - r.stars);
    return '<div class="review-card' + (r.removed ? ' removed' : '') + '"><div class="review-meta"><div class="avatar av-' + (r.tier === 'Unverified' ? 'amber' : r.tier === 'Domain certified' ? 'teal' : 'blue') + '" style="width:32px;height:32px;font-size:12px">' + esc((r.author || '?')[0]) + '</div>' +
      '<div><div style="font-size:13px;font-weight:500">' + esc(r.author) + ' ' + tierBadge[r.tier] + '</div><div style="font-size:11px;color:var(--text3)">' + esc(r.login) + ' · ' + (r.certified_by ? esc(r.certified_by) + ' certified' : 'No certification') + '</div></div>' +
      '<div class="stars" style="margin-left:auto">' + stars + '</div></div><div style="font-size:13px">“' + esc(r.text) + '”</div>' +
      (r.flag ? '<div style="margin-top:6px">' + badge(r.flag.indexOf('High') === 0 ? 'red' : 'amber', '<i class="ti ti-flag"></i> ' + esc(r.flag)) + '</div>' : '') +
      (r.removed ? '' : '<div style="margin-top:6px"><button class="btn btn-sm btn-danger" onclick="removeReview(' + q(r.id) + ')">Remove</button></div>') + '</div>';
  }).join('') || '<div class="form-hint">No reviews.</div>');
  // unreachable
  set('plat-unreach-summary', b.unreachable ? '<div class="alert a-warn"><i class="ti ti-alert-triangle"></i>' + fmt(b.unreachable) + ' members cannot be reached. Without the bMail ID-change protocol, these customers are permanently lost. Estimated annual order value at risk: ' + esc(b.revenue_at_risk) + '.</div>' +
    '<div class="g3" style="margin-bottom:1rem">' + metric('University emails', fmt(b.univ_emails), 'mv-amber', 'Graduates, leavers') + metric('Corporate emails', fmt(b.corp_emails), 'mv-amber', 'Job changers') + metric('Defunct providers', fmt(b.defunct), 'mv-red', 'Service discontinued') + '</div>' : '');
  set('plat-outreach-tbody', P.outreach.map(function (o) {
    var a = o.status !== 'Unreachable' ? '' : o.type === 'Defunct' ? '<button class="btn btn-sm btn-danger" onclick="outreach(' + q(o.login) + ',\'deactivate\')">Deactivate</button>'
      : '<button class="btn btn-sm btn-primary" onclick="outreach(' + q(o.login) + ',\'invite\')">Send change invite</button>';
    return '<tr><td class="mono">' + esc(o.login) + '</td><td>' + badge(o.type === 'Defunct' ? 'red' : 'amber', esc(o.type)) + '</td><td>' + esc(o.last_active) + '</td><td>' + esc(o.ltv) + '</td><td>' + esc(o.status) + '</td><td>' + a + '</td></tr>';
  }).join('') || '<tr><td colspan="6" class="form-hint">None.</td></tr>');
}
function enroll() {
  act('POST', '/api/platform/' + currentPlatform + '/enroll', {bmail_id: document.getElementById('en-bmail').value.trim(), display_name: document.getElementById('en-name').value},
      'Enrolled as bMember (attestation verified)');
}
function postReview() {
  act('POST', '/api/platform/' + currentPlatform + '/reviews', {login: document.getElementById('rv-login').value.trim(), stars: document.getElementById('rv-stars').value,
    text: document.getElementById('rv-text').value}, 'Review posted');
}
function removeReview(id) { act('POST', '/api/platform/' + currentPlatform + '/reviews/' + id + '/remove', {}, 'Review removed'); }
function outreach(login, action) { act('POST', '/api/platform/' + currentPlatform + '/outreach/' + action, {login: login}, action === 'invite' ? 'Invite sent (see outbox)' : 'Deactivated'); }

// ── DOMAIN PORTAL (same three outcomes and wording as the prototype's checkDomain) ──
function renderPortal() {
  set('portal-tbody', S.isp.domains.map(function (d) {
    var ok = d.dkim === 'Active';
    return '<tr><td class="mono" style="color:var(--green-600)"><i class="ti ti-circle-check" style="font-size:14px"></i> ' + esc(d.domain) + '</td><td>' + esc(d.provider) + '</td><td>' + esc(d.country) +
      '</td><td>' + esc(d.ca_partners.join(', ')) + '</td><td>' + esc(d.listed_since) + '</td><td>' + badge(ok ? 'green' : 'amber', ok ? 'Certified' : 'Certified (DKIM renewal)') + '</td></tr>';
  }).join(''));
  set('portal-fakes', esc(S.isp.fake_domains.map(function (f) { return f.domain; }).join(', ')));
}
function checkDomain() {
  var val = document.getElementById('domain-input').value;
  var result = document.getElementById('domain-result');
  api('GET', '/api/portal/domains/' + encodeURIComponent(val.trim() || ' ')).then(function (r) {
    result.style.display = 'block';
    var v = esc(r.domain);
    if (r.result === 'empty') { result.className = 'domain-result dr-invalid'; result.innerHTML = '<i class="ti ti-alert-triangle" style="color:var(--red-600)"></i> Please enter a domain name.'; return; }
    if (r.result === 'certified') {
      var st = r.status === 'Healthy' ? '<span class="badge b-green">Healthy</span>' : '<span class="badge b-amber">DKIM renewal pending</span>';
      result.className = 'domain-result dr-valid';
      result.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><i class="ti ti-circle-check" style="color:var(--green-600);font-size:24px"></i><div><div style="font-size:15px;font-weight:600;color:var(--green-800)">✓ Certified bMail domain</div><div class="mono" style="font-size:14px;color:var(--green-600)">' + v + '</div></div></div><div style="font-size:13px;color:var(--green-800)">CA partners: ' + esc(r.ca_partners.join(', ')) + '<br>Status: ' + st + '<br>Emails from <strong>@' + v + '</strong> are identifiable — sender is certified by a trusted CA.</div>';
    } else if (r.result === 'fake') {
      result.className = 'domain-result dr-invalid';
      result.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><i class="ti ti-ban" style="color:var(--red-600);font-size:24px"></i><div><div style="font-size:15px;font-weight:600;color:var(--red-800)">⚠ Known fake / impersonation domain</div><div class="mono" style="font-size:14px;color:var(--red-600)">' + v + '</div></div></div><div style="font-size:13px;color:var(--red-800)">This domain is NOT a registered bMail domain. It appears to impersonate a legitimate bMail domain (' + esc(r.target) + '). Treat any email from <strong>@' + v + '</strong> as a potential phishing attempt.</div>';
      refresh();
    } else {
      result.className = 'domain-result dr-invalid';
      result.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><i class="ti ti-circle-x" style="color:var(--red-600);font-size:24px"></i><div><div style="font-size:15px;font-weight:600;color:var(--red-800)">Not a registered bMail domain</div><div class="mono" style="font-size:14px;color:var(--red-600)">' + v + '</div></div></div><div style="font-size:13px;color:var(--red-800)">This domain is not listed in the bMail domain registry. Emails from <strong>@' + v + '</strong> are not identifiable through the bMail system. This may be a regular email address or an unregistered provider.</div>';
    }
  }).catch(function (e) { toast(e.message, false); });
}
document.getElementById('domain-input').addEventListener('keydown', function(e){ if(e.key==='Enter') checkDomain(); });

// ── RECEIVER TOOLS / OUTBOX / TOKENS ─────────────────────────────────
function val(id) { return document.getElementById(id).value.trim(); }
function requestIdentification() {
  act('POST', '/api/isp/requests/identification', {requester: val('rx-id-requester'), target: val('rx-id-target'), purpose: val('rx-id-purpose')},
      'Submitted — ISP operator validates it in Request queue, then the sender decides');
}
function reportPhishing() {
  act('POST', '/api/isp/requests/verification', {receiver: val('rx-ph-receiver'), target: val('rx-ph-target'), note: val('rx-ph-note')},
      'Reported — ISP operator processes it in Request queue');
}
function renderReceiver() {
  set('rx-results', S.isp.requests.filter(function (r) { return r.kind === 'identification'; }).map(function (r) {
    return reqItem('certificate', r.status === 'certified' ? 'green' : 'blue', esc(r.requester) + ' asked about ' + esc(r.target), esc(r.purpose) + ' · ' + esc(r.created),
      statusBadge(r.status) + (r.certificate ? ' <button class="btn btn-sm" onclick="openToken(' + q(r.certificate) + ')">Verify certificate</button>' : ''));
  }).join(''));
}
function renderOutbox() {
  set('outbox-list', S.outbox.map(function (m) {
    return reqItem('message-circle', 'teal', esc(m.channel) + ' → ' + esc(m.to), esc(m.text) + ' · from ' + esc(m.from) + ' · ' + esc(m.sent), '');
  }).join('') || '<div class="form-hint">No messages yet.</div>');
}
function openToken(t) { document.getElementById('token-text').value = t || ''; set('token-result', ''); openModal('modal-token'); if (t) verifyToken(); }
function verifyToken() {
  api('POST', '/api/tokens/verify', {token: document.getElementById('token-text').value}).then(function (r) {
    set('token-result', (r.valid ? '<div class="alert a-success"><i class="ti ti-circle-check"></i>Valid Ed25519 signature by <strong>' + esc(r.header.kid) + '</strong> · type ' + esc(r.header.typ) + '</div>'
      : '<div class="alert a-danger"><i class="ti ti-alert-triangle"></i>Not valid: ' + esc(r.error) + '</div>') +
      (r.payload ? '<div class="token-box">' + esc(JSON.stringify(r.payload, null, 2)) + '</div>' : ''));
  });
}

// ── REGISTRATION WIZARD (stepping logic verbatim; data from the API) ──
var wizStep = 1;
var selectedBCA = '';
function openRegister() {
  set('reg-provider', S.isp.domains.map(function (d) { return '<option value="' + esc(d.domain) + '">' + esc(d.provider) + ' → ' + esc(d.domain) + '</option>'; }).join(''));
  ['reg-name', 'reg-display', 'reg-subscriber', 'reg-bk-email', 'reg-bk-messenger', 'reg-bk-phone'].forEach(function (id) { document.getElementById(id).value = ''; });
  document.getElementById('consent1').checked = false; document.getElementById('consent2').checked = false;
  document.getElementById('reg-done').style.display = 'none';
  document.getElementById('reg-submit').disabled = false;
  selectedBCA = '';
  setWizStep(1); updateRegPreview(); openModal('modal-register');
}
function wizNext(from) {
  if (from === 4) return;
  if (from === 2 && !selectedBCA) { toast('Select a bCA first', false); return; }
  setWizStep(from + 1);
}
function wizBack(from) {
  if (from === 1) return;
  setWizStep(from - 1);
}
function regAddress() {
  var mode = document.getElementById('reg-mode').value;
  var name = document.getElementById('reg-name').value.trim().toLowerCase();
  return (name || (mode === 'anon' ? '(generated number)' : 'jiyeon.park')) + '@' + document.getElementById('reg-provider').value;
}
function regChannels() {
  return [['email', 'reg-bk-email'], ['messenger', 'reg-bk-messenger'], ['phone', 'reg-bk-phone']]
    .map(function (p) { return {kind: p[0], value: document.getElementById(p[1]).value.trim()}; })
    .filter(function (c) { return c.value; });
}
function setWizStep(n) {
  wizStep = n;
  for (var i = 1; i <= 4; i++) {
    document.getElementById('ws' + i).classList.toggle('active', i === n);
    var circle = document.getElementById('wc' + i);
    var label = document.getElementById('wl' + i);
    circle.className = 'wiz-circle' + (i < n ? ' done' : i === n ? ' active' : '');
    circle.innerHTML = i < n ? '<i class="ti ti-check"></i>' : i;
    label.className = 'wiz-label' + (i < n ? ' done' : i === n ? ' active' : '');
    if (i < 4) document.getElementById('wline' + i).className = 'wiz-line' + (i < n ? ' done' : '');
  }
  if (n === 2) renderBcaOptions();
  if (n === 4) {
    document.getElementById('confirm-addr').textContent = regAddress();
    document.getElementById('confirm-mode').textContent = document.getElementById('reg-mode').value === 'real' ? 'Real name' : 'Anonymous';
    document.getElementById('confirm-bca').textContent = selectedBCA ? bcaName(selectedBCA) : 'Not selected';
    var ch = regChannels();
    document.getElementById('confirm-channels').textContent = ch.length ? ch.map(function (c) { return c.kind; }).join(' + ') : 'NONE (required)';
  }
}
function updateRegPreview() { document.getElementById('preview-addr').textContent = regAddress(); }
function renderBcaOptions() {
  var dom = document.getElementById('reg-provider').value;
  var opts = S.isp.bcas.filter(function (b) { return b.status === 'active' && b.domains.indexOf(dom) >= 0; });
  if (opts.map(function (b) { return b.id; }).indexOf(selectedBCA) < 0) selectedBCA = '';
  set('bca-options', opts.map(function (b) {
    var B = S.bcas[b.id], sel = b.id === selectedBCA;
    return '<div class="req-item" onclick="selectBCA(this,' + q(b.id) + ')" style="cursor:pointer;' + (sel ? 'border-color:var(--green-100);background:var(--green-50)' : '') + '">' +
      '<div class="req-icon ri-blue"><i class="ti ti-' + (B.type.indexOf('Bank') >= 0 ? 'building-bank' : 'building-broadcast-tower') + '" style="color:var(--blue-600)"></i></div>' +
      '<div class="req-body"><div class="req-title">' + esc(B.name) + '</div><div class="req-sub">Certifies via ' + esc(B.data_held.toLowerCase()) + ' · ' + esc(B.country) + '</div></div>' +
      (sel ? badge('green', 'Selected ✓') : badge('gray', 'Select')) + '</div>';
  }).join('') || '<div class="alert a-warn">No active bCA partners for ' + esc(dom) + '.</div>');
}
function selectBCA(el, id) { selectedBCA = id; renderBcaOptions(); }
function submitReg() {
  var domain = document.getElementById('reg-provider').value;
  var mode = document.getElementById('reg-mode').value;
  var local = document.getElementById('reg-name').value.trim().toLowerCase();
  var done = document.getElementById('reg-done');
  var step = local ? Promise.resolve(local) : (mode === 'anon'
    ? Promise.reject(new Error('Enter a numeric pseudonym, e.g. 19912345 (the consent token is bound to the exact address)'))
    : Promise.reject(new Error('Enter an email name')));
  step.then(function (loc) {
    var bmail = loc + '@' + domain;
    // 1. user → bCA directly: the subscriber number never goes to the ISP
    return api('POST', '/api/bca/' + selectedBCA + '/consent', {subscriber_id: document.getElementById('reg-subscriber').value.trim(), bmail_id: bmail})
      .then(function (c) {
        // 2. user → ISP with only the signed consent token
        return api('POST', '/api/isp/register', {domain: domain, local: loc, mode: mode, bca_id: selectedBCA, consent_token: c.consent_token,
          backup_channels: regChannels(), consent_certify: document.getElementById('consent1').checked,
          consent_identifiable: document.getElementById('consent2').checked, display_name: document.getElementById('reg-display').value.trim()});
      });
  }).then(function (acct) {
    done.className = 'alert a-success';
    done.innerHTML = '<i class="ti ti-circle-check"></i><div><strong>Registration submitted!</strong> ' + esc(acct.bmail_id) + ' is waiting for ' + esc(acct.bca_name) +
      ' to certify it (bCA › Certifications › Issue cert). Your backup channel will be used to notify you.</div>';
    done.style.display = 'flex';
    document.getElementById('reg-submit').disabled = true;
    currentUser = acct.bmail_id; currentBca = acct.bca_id;
    return refresh();
  }).catch(function (e) {
    done.className = 'alert a-danger'; done.innerHTML = '<i class="ti ti-alert-triangle"></i>' + esc(e.message); done.style.display = 'flex';
  });
}

// ── ID CHANGE ────────────────────────────────────────────────────────
function openIdChange(oldId) {
  changeReq = null;
  document.getElementById('chg-old').value = oldId || '';
  document.getElementById('chg-new').value = currentUser;
  set('chg-platforms', S.isp.platforms.filter(function (p) { return p.status === 'active'; }).map(function (p) {
    var has = S.user.memberships.some(function (m) { return m.platform_id === p.id && m.login === oldId; });
    return '<div class="checkbox-row"><input type="checkbox" class="chg-plat" value="' + esc(p.id) + '"' + (has ? ' checked' : '') + '><label style="font-size:13px">' + esc(p.name) + '</label></div>';
  }).join(''));
  document.getElementById('idchange-done').style.display = 'none';
  document.getElementById('chg-submit').disabled = false;
  document.getElementById('chg-auto').style.display = 'none';
  renderChangeSteps(null);
  openModal('modal-idchange');
}
function renderChangeSteps(r) {
  var st = r ? r.status : 'none';
  var order = ['none', 'awaiting-bca', 'bca-confirmed', 'completed'];
  var k = order.indexOf(st);
  function step(i, title, desc) {
    var cls = k > i || st === 'completed' ? 'done' : k === i ? 'active' : '';
    return '<div class="step"><div class="step-num ' + cls + '">' + (cls === 'done' ? '<i class="ti ti-check"></i>' : i + 1) + '</div><div class="step-body"><div class="step-title">' + title + '</div><div class="step-desc">' + desc + '</div></div></div>';
  }
  set('chg-steps', step(0, 'Request sent to the bMail ISP', 'The ISP forwards a re-verification request to your bCA.') +
    step(1, 'Identity verified by bCA (' + esc(S.user ? S.user.account.bca_name : '') + ')', 'The bCA confirms one subscriber owns both IDs and returns a signed confirmation.') +
    step(2, 'Signed change token issued by ISP', 'One Ed25519-signed token per platform binds old ID, new ID, bCA confirmation and a one-time nonce.') +
    step(3, 'Platforms verify and remap — all history preserved', r && r.results ? esc(Object.keys(r.results).map(function (p) { return p + ': ' + r.results[p].result + (r.results[p].reason ? ' (' + r.results[p].reason + ')' : ''); }).join('; ')) : 'Purchase records, reviews, loyalty points — all retained under the new bMail ID.'));
}
function submitIDChange() {
  var plats = Array.prototype.map.call(document.querySelectorAll('.chg-plat:checked'), function (c) { return c.value; });
  act('POST', '/api/isp/requests/id-change', {target: currentUser, old_id: document.getElementById('chg-old').value, platforms: plats}, 'Change request sent to the ISP')
    .then(function (r) {
      changeReq = r.id; renderChangeSteps(r);
      document.getElementById('chg-submit').disabled = true;
      document.getElementById('chg-auto').style.display = 'inline-flex';
      var d = document.getElementById('idchange-done');
      d.innerHTML = '<i class="ti ti-circle-check"></i>Request ' + esc(r.id) + ' is waiting for your bCA (bCA › Certifications › Approve), then the ISP operator (Request queue › Issue token). Or run both operator steps here.';
      d.style.display = 'flex';
    });
}
function runChangeAsOperators() {
  var r = S.isp.requests.filter(function (x) { return x.id === changeReq; })[0];
  var bca = S.isp.accounts.filter(function (a) { return a.bmail_id === r.target; })[0].bca_id;
  api('POST', '/api/bca/' + bca + '/requests/' + r.bca_request + '/issue', {})
    .then(function () { return api('POST', '/api/isp/requests/' + r.id + '/issue-token', {}); })
    .then(function (done) {
      renderChangeSteps(done); document.getElementById('chg-auto').style.display = 'none';
      set('idchange-done', '<i class="ti ti-circle-check"></i>Change completed. Platform answers are shown in step 4.');
      toast('ID change completed', true); return refresh();
    }).catch(function (e) { toast(e.message, false); refresh(); });
}

// ══════════════════════════════════════════════════════════════════════
// TRANSACTION PANEL — helpers verbatim from the prototype's "TRANSACTION
// ENGINE"; doT1..doT4 now run the real protocol steps on the server and
// replay the server's own log lines with the prototype's progress animation.
// ══════════════════════════════════════════════════════════════════════
var TX = {t1:false,t2:false,t3:false,t4:false};
var txCompleted = 0;
function toggleTxnPanel(){
  var p=document.getElementById('txn-panel');
  p.classList.toggle('collapsed');
  document.getElementById('txn-toggle-btn').textContent = p.classList.contains('collapsed') ? '▼' : '▲';
}
function txSleep(ms){return new Promise(function(r){setTimeout(r,ms);})}
function txTs(){return new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function txLog(msg){
  var el=document.getElementById('txn-log');
  el.style.display='block';
  var d=document.createElement('div');
  d.style.cssText='padding:1px 0;border-bottom:0.5px solid var(--border);color:var(--text)';
  d.innerHTML='<span style="color:var(--text3);margin-right:6px">'+txTs()+'</span>'+esc(msg);
  el.appendChild(d); el.scrollTop=el.scrollHeight;
}
function txBadge(id,cls,html){var el=document.getElementById(id);if(el){el.className='badge b-'+cls;el.style.fontSize='10px';el.innerHTML=html;}}
function setProgress(n, pct){
  var p=document.getElementById('tp'+n), b=document.getElementById('tpb'+n);
  if(!p||!b) return;
  p.style.display='block'; b.style.width=pct+'%';
}
function updateHeader(){
  txCompleted = [TX.t1,TX.t2,TX.t3,TX.t4].filter(Boolean).length;
  document.getElementById('txn-header-sub').textContent = txCompleted+' / 4 complete · navigate dashboards to see changes';
}
var GS_LABEL = {1: '✓ SKT bCA', 2: '✓ bMail ID', 3: '✓ Amazon', 4: '✓ Enrolled'};
function renderScenarioPanel() {
  var sc = S.scenario;
  for (var n = 1; n <= 4; n++) {
    var done = sc['t' + n], btn = document.getElementById('tb' + n);
    TX['t' + n] = done;
    var unlocked = n === 2 ? sc.t1 : n === 4 ? (sc.t1 && sc.t2 && sc.t3) : true;
    if (btn.classList.contains('running')) continue;
    btn.disabled = done || !unlocked;
    btn.classList.toggle('done', done);
    if (done) { txBadge('tb' + n + '-badge', 'green', '✓'); txBadge('gs' + n, 'green', GS_LABEL[n]); }
    else if (unlocked) txBadge('tb' + n + '-badge', 'amber', 'Run');
    else txBadge('tb' + n + '-badge', 'gray', 'Locked');
  }
  updateHeader();
}
function runTx(n) {
  var btn = document.getElementById('tb' + n);
  btn.disabled = true; btn.classList.add('running');
  txBadge('tb' + n + '-badge', 'amber', '<i class="ti ti-loader-2"></i>');
  return api('POST', '/api/scenario/t' + n, {}).then(async function (res) {
    for (var i = 0; i < res.log.length; i++) {
      txLog(res.log[i]); setProgress(n, Math.round(100 * (i + 1) / res.log.length)); await txSleep(450);
    }
    btn.classList.remove('running');
    if (n === 2) currentUser = 'alex.morgan@bgmail.com';
    if (n === 1) currentBca = 'skt';
    if (n >= 3) currentPlatform = 'amazon';
    return refresh();
  }).catch(function (e) { btn.classList.remove('running'); txLog('ERROR: ' + e.message); toast(e.message, false); refresh(); });
}
function doT1(){ if(!TX.t1) runTx(1); }
function doT2(){ if(!TX.t2&&TX.t1) runTx(2); }
function doT3(){ if(!TX.t3) runTx(3); }
function doT4(){ if(!TX.t4&&TX.t1&&TX.t2&&TX.t3) runTx(4); }

function resetDemo() {
  if (!confirm('Reset all demo data to the prototype\'s starting state?')) return;
  document.getElementById('txn-log').innerHTML = '';
  for (var n = 1; n <= 4; n++) { setProgress(n, 0); txBadge('gs' + n, 'gray', n + '. ' + ['SKT bCA', 'bMail ID', 'Amazon', 'Enroll'][n - 1]); }
  currentUser = null; currentBca = 'kt'; currentPlatform = 'coupang';
  act('POST', '/api/reset', {}, 'Demo data reset');
}

refresh().catch(function (e) { toast('Cannot reach the server: ' + e.message, false); });
