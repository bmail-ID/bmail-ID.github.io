// ── Navigation ──
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  var el = document.getElementById('view-' + id);
  if (el) el.classList.add('active');
  event && event.target && event.target.closest('.nav-item') && event.target.closest('.nav-item').classList.add('active');
}

// ── Modals ──
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-wrap').forEach(function(m) {
  m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('open'); });
});

// ── Inner tabs ──
function switchInnerTab(el, panelId) {
  var card = el.closest('.card');
  card.querySelectorAll('.inner-tab').forEach(t => t.classList.remove('active'));
  card.querySelectorAll('.inner-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  var panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
}

// ── Registration wizard ──
var wizStep = 1;
var selectedBCA = '';
function wizNext(from) {
  if (from === 4) return;
  setWizStep(from + 1);
}
function wizBack(from) {
  if (from === 1) return;
  setWizStep(from - 1);
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
  if (n === 4) {
    var addr = document.getElementById('reg-name').value || 'jiyeon.park';
    var domain = document.getElementById('reg-provider').value + '.com';
    document.getElementById('confirm-addr').textContent = addr + '@' + domain;
    document.getElementById('confirm-mode').textContent = document.getElementById('reg-mode').value === 'real' ? 'Real name' : 'Anonymous';
    var bcaNames = {kt:'KT Telecom', kb:'KB Bank', skt:'SKT'};
    document.getElementById('confirm-bca').textContent = bcaNames[selectedBCA] || 'Not selected';
  }
}
function updateRegPreview() {
  var name = document.getElementById('reg-name').value || 'jiyeon.park';
  var domain = (document.getElementById('reg-provider') ? document.getElementById('reg-provider').value : 'bgmail') + '.com';
  document.getElementById('preview-addr').textContent = name + '@' + domain;
}
function selectBCA(el, id) {
  selectedBCA = id;
  ['kt','kb','skt'].forEach(function(k) {
    var badge = document.getElementById('bca-' + k + '-badge');
    var item = document.getElementById('bca-' + k);
    badge.className = k === id ? 'badge b-green' : 'badge b-gray';
    badge.textContent = k === id ? 'Selected ✓' : 'Select';
    item.style.borderColor = k === id ? 'var(--green-100)' : 'var(--border)';
    item.style.background = k === id ? 'var(--green-50)' : 'var(--bg)';
  });
}
function submitReg() {
  document.getElementById('reg-done').style.display = 'flex';
}

// ── ID change ──
function submitIDChange() {
  document.getElementById('idchange-done').style.display = 'flex';
}

// ── Phishing modal ──
function processPhishing() {
  document.getElementById('phishing-done').style.display = 'flex';
}

// ── Request actions ──
function processReq(btn, label) {
  var item = btn.closest('.req-item');
  btn.parentElement.innerHTML = '<span class="badge b-green"><i class="ti ti-check"></i> ' + label + '</span>';
  item.style.opacity = '0.6';
}
function approveRequest(btn) {
  var item = btn.closest('.req-item');
  btn.parentElement.innerHTML = '<span class="badge b-green"><i class="ti ti-check"></i> Approved</span>';
  item.style.opacity = '0.6';
}
function denyRequest(btn) {
  var item = btn.closest('.req-item');
  item.querySelectorAll('button').forEach(b => b.remove());
  item.querySelector('.req-actions, .req-body').insertAdjacentHTML('afterend', '<span class="badge b-red">Denied</span>');
  item.style.opacity = '0.6';
}

// ── Trust flow visualizer ──
function showFlow(prefix, n, total) {
  for (var i = 1; i <= total; i++) {
    var panel = document.getElementById(prefix + 'panel' + i);
    var btn = document.getElementById(prefix + 'btn' + i);
    if (panel) panel.style.display = i === n ? 'block' : 'none';
    if (btn) btn.className = i === n ? 'btn btn-primary' : 'btn';
  }
}

// ── Identity mode ──
function updateIDPreview() {
  var mode = document.getElementById('id-mode').value;
  var preview = document.getElementById('id-preview');
  var hint = document.getElementById('id-mode-hint');
  if (mode === 'anon') {
    preview.innerHTML = '<i class="ti ti-mail"></i> Active bMail ID: <strong>19902301@bgmail.com</strong> (anonymous mode)';
    hint.textContent = 'Receivers see only your pseudonym. The bgmail.com domain still certifies your identifiability — you remain reachable via the bMail ISP if a valid request is made and you approve it.';
  } else {
    preview.innerHTML = '<i class="ti ti-mail"></i> Active bMail ID: <strong>j.park@bgmail.com</strong> (real name mode)';
    hint.textContent = 'Receivers can see your name. Your certified identity remains private unless you approve a request from a valid receiver through the bMail ISP.';
  }
}

// ── Domain portal ──
var validDomains = ['bgmail.com','bnaver.com','bcoremail.com'];
var fakeDomains = ['bgmail.net','b-gmail.com','bnaver.org','bmail-gmail.com','bgmail.org'];
function checkDomain() {
  var val = document.getElementById('domain-input').value.trim().toLowerCase();
  var result = document.getElementById('domain-result');
  result.style.display = 'block';
  if (!val) { result.className = 'domain-result dr-invalid'; result.innerHTML = '<i class="ti ti-alert-triangle" style="color:var(--red-600)"></i> Please enter a domain name.'; return; }
  if (validDomains.indexOf(val) !== -1) {
    var caMap = {'bgmail.com':'KT Telecom, Shinhan Bank','bnaver.com':'SKT, KB Bank','bcoremail.com':'China Mobile, ICBC'};
    var statusMap = {'bgmail.com':'<span class="badge b-green">Healthy</span>','bnaver.com':'<span class="badge b-green">Healthy</span>','bcoremail.com':'<span class="badge b-amber">DKIM renewal pending</span>'};
    result.className = 'domain-result dr-valid';
    result.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><i class="ti ti-circle-check" style="color:var(--green-600);font-size:24px"></i><div><div style="font-size:15px;font-weight:600;color:var(--green-800)">✓ Certified bMail domain</div><div class="mono" style="font-size:14px;color:var(--green-600)">'+val+'</div></div></div><div style="font-size:13px;color:var(--green-800)">CA partners: '+caMap[val]+'<br>Status: '+statusMap[val]+'<br>Emails from <strong>@'+val+'</strong> are identifiable — sender is certified by a trusted CA.</div>';
  } else if (fakeDomains.indexOf(val) !== -1) {
    result.className = 'domain-result dr-invalid';
    result.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><i class="ti ti-ban" style="color:var(--red-600);font-size:24px"></i><div><div style="font-size:15px;font-weight:600;color:var(--red-800)">⚠ Known fake / impersonation domain</div><div class="mono" style="font-size:14px;color:var(--red-600)">'+val+'</div></div></div><div style="font-size:13px;color:var(--red-800)">This domain is NOT a registered bMail domain. It appears to impersonate a legitimate bMail domain. Treat any email from <strong>@'+val+'</strong> as a potential phishing attempt.</div>';
  } else {
    result.className = 'domain-result dr-invalid';
    result.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><i class="ti ti-circle-x" style="color:var(--red-600);font-size:24px"></i><div><div style="font-size:15px;font-weight:600;color:var(--red-800)">Not a registered bMail domain</div><div class="mono" style="font-size:14px;color:var(--red-600)">'+val+'</div></div></div><div style="font-size:13px;color:var(--red-800)">This domain is not listed in the bMail domain registry. Emails from <strong>@'+val+'</strong> are not identifiable through the bMail system. This may be a regular email address or an unregistered provider.</div>';
  }
}
document.getElementById('domain-input').addEventListener('keydown', function(e){ if(e.key==='Enter') checkDomain(); });
