// ══════════════════════════════════════════════════════
// TRANSACTION ENGINE
// ══════════════════════════════════════════════════════
var TX = {t1:false,t2:false,t3:false,t4:false};
var txCompleted = 0;

function toggleTxnPanel(){
  var p=document.getElementById('txn-panel');
  p.classList.toggle('collapsed');
  document.getElementById('txn-toggle-btn').textContent = p.classList.contains('collapsed') ? '▼' : '▲';
}

function txSleep(ms){return new Promise(function(r){setTimeout(r,ms);})}
function txTs(){return new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function txDate(){return new Date().toLocaleDateString('en-GB',{year:'numeric',month:'short',day:'numeric'});}
function txExp2(){var d=new Date();d.setFullYear(d.getFullYear()+2);return d.toLocaleDateString('en-GB',{year:'numeric',month:'short',day:'numeric'});}

function txLog(msg){
  var el=document.getElementById('txn-log');
  el.style.display='block';
  var d=document.createElement('div');
  d.style.cssText='padding:1px 0;border-bottom:0.5px solid var(--border);color:var(--text)';
  d.innerHTML='<span style="color:var(--text3);margin-right:6px">'+txTs()+'</span>'+msg;
  el.appendChild(d); el.scrollTop=el.scrollHeight;
}

function txBadge(id,cls,html){var el=document.getElementById(id);if(el){el.className='badge b-'+cls;el.style.fontSize='10px';el.innerHTML=html;}}
function txText(id,val){var el=document.getElementById(id);if(el)el.textContent=val;}
function txHtml(id,val){var el=document.getElementById(id);if(el)el.innerHTML=val;}

function setProgress(n, pct){
  var p=document.getElementById('tp'+n), b=document.getElementById('tpb'+n);
  if(!p||!b) return;
  p.style.display='block'; b.style.width=pct+'%';
}

function updateHeader(){
  txCompleted = [TX.t1,TX.t2,TX.t3,TX.t4].filter(Boolean).length;
  document.getElementById('txn-header-sub').textContent = txCompleted+' / 4 complete · navigate dashboards to see changes';
}

function checkT4(){
  if(TX.t1&&TX.t2&&TX.t3){
    document.getElementById('tb4').disabled=false;
    txBadge('tb4-badge','amber','Run');
    txBadge('gs4','amber','4. Enroll');
  }
}

// ── Transaction 1: SKT bCA ─────────────────────────────────────
async function doT1(){
  if(TX.t1) return;
  var btn=document.getElementById('tb1');
  btn.disabled=true; btn.classList.add('running');
  txBadge('tb1-badge','amber','<i class="ti ti-loader-2"></i>');

  txLog('SKT → ISP: bCA onboarding request submitted');
  setProgress(1,20); await txSleep(800);
  txLog('ISP: SKT credentials verified — approved');
  setProgress(1,45); await txSleep(700);
  txLog('ISP: Zero-copy protocol signed');
  setProgress(1,65); await txSleep(600);
  txLog('ISP: SKT added to bCA registry for bgmail.com, bnaver.com');
  setProgress(1,85); await txSleep(500);
  txLog('ISP: Public bCA portal updated — SKT active');
  setProgress(1,100); await txSleep(350);

  TX.t1=true;
  btn.classList.remove('running'); btn.classList.add('done');
  txBadge('tb1-badge','green','✓');
  txBadge('gs1','green','✓ SKT bCA');
  updateHeader();

  // ── Dashboard updates ──
  // bCA dashboard: certified users +1
  txText('bca-certified','14,222');
  // bCA dashboard: pending requests
  txText('bca-pending','6');
  // Domain registry: add SKT as CA partner for bgmail.com
  txHtml('bgmail-ca-cell','KT Telecom, Shinhan Bank, <strong style="color:var(--teal-600)">SKT ✓</strong>');
  // ISP trust stats: zero-copy
  txText('isp-zerocopy','24,832');
  // bCA certifications pending: add SKT agreement entry
  var certPend = document.getElementById('cert-pending');
  if(certPend){
    var item=document.createElement('div'); item.className='req-item';
    item.style.cssText='background:var(--teal-50);border-color:var(--teal-100)';
    item.innerHTML='<div class="req-icon" style="background:var(--teal-50)"><i class="ti ti-building-broadcast-tower" style="color:var(--teal-600)"></i></div>'+
      '<div class="req-body"><div class="req-title">bCA agreement — SK Telecom (SKT)</div>'+
      '<div class="req-sub">bgmail.com · bnaver.com · Zero-copy protocol · '+txDate()+'</div></div>'+
      '<span class="badge b-green"><i class="ti ti-check"></i> Active</span>';
    certPend.insertBefore(item, certPend.firstChild);
  }

  // bCA page title — show SKT active
  var bcaSkt=document.getElementById('bca-page-skt');
  if(bcaSkt){bcaSkt.textContent='SKT: active ✓';bcaSkt.style.color='var(--teal-600)';}
  txHtml('bca-isp-partners','bgmail.com (Gmail), bnaver.com (Naver) · <strong style="color:var(--teal-600)">+ SKT certified</strong>');

  // Unlock T2
  document.getElementById('tb2').disabled=false;
  txBadge('tb2-badge','amber','Run');
  txBadge('gs2','amber','2. bMail ID');
}

// ── Transaction 2: Register bMail ID ──────────────────────────
async function doT2(){
  if(TX.t2||!TX.t1) return;
  var btn=document.getElementById('tb2');
  btn.disabled=true; btn.classList.add('running');
  txBadge('tb2-badge','amber','<i class="ti ti-loader-2"></i>');

  txLog('USER → ISP: alex.morgan@bgmail.com | Alex Morgan | Demo University');
  setProgress(2,15); await txSleep(700);
  txLog('ISP: bgmail.com validated · bCA SKT — REGISTERED ✓');
  setProgress(2,35); await txSleep(650);
  txLog('SKT: Alex Morgan — subscriber confirmed');
  setProgress(2,60); await txSleep(750);
  txLog('SKT: Signed certificate token issued (zero-copy)');
  setProgress(2,80); await txSleep(600);
  txLog('ISP: bMail ID activated — LIFELONG');
  setProgress(2,100); await txSleep(350);

  TX.t2=true;
  btn.classList.remove('running'); btn.classList.add('done');
  txBadge('tb2-badge','green','✓');
  txBadge('gs2','green','✓ bMail ID');
  updateHeader();

  // ── Dashboard updates ──
  // User dashboard sub
  txText('ud-email','alex.morgan@bgmail.com');
  txText('ud-ca','SKT Telecom');
  // User identity fields
  txHtml('uid-bmailid','alex.morgan@bgmail.com');
  txText('uid-displayname','Alex Morgan (Prof.)');
  txHtml('uid-certby','SK Telecom (SKT) <span class="badge b-green"><i class="ti ti-check"></i> Verified</span>');
  txText('uid-email','alex.morgan@bgmail.com');
  // User events timeline
  var tl = document.getElementById('user-events-timeline');
  if(tl){
    var item=document.createElement('div'); item.className='tl-item';
    item.style.cssText='background:var(--green-50);border-radius:var(--radius);padding:6px 8px;margin-bottom:10px';
    item.innerHTML='<div class="tl-time">'+txDate()+' · '+txTs()+'</div>'+
      '<div class="tl-text"><strong>bMail ID activated</strong> — alex.morgan@bgmail.com · Certified by SKT · Lifelong <span class="badge b-green" style="margin-left:4px">New</span></div>';
    tl.insertBefore(item, tl.firstChild);
  }
  // ISP metrics
  txText('isp-users','24,832');
  txText('isp-users-sub','↑ Prof. Morgan registered today');
  txText('isp-req-today','13');
  txText('isp-req-today-sub','8 ID · 3 verify · 2 change');
  txText('isp-zerocopy','24,832');
  var badge=document.getElementById('isp-req-badge');
  if(badge) badge.textContent='13';
  // ISP request queue
  var reqAll=document.getElementById('req-all');
  if(reqAll){
    var ri=document.createElement('div'); ri.className='req-item';
    ri.style.cssText='background:var(--green-50);border-color:var(--green-100)';
    ri.innerHTML='<div class="req-icon ri-blue"><i class="ti ti-user-plus" style="color:var(--blue-600)"></i></div>'+
      '<div class="req-body"><div class="req-title">bMail ID registration — Alex Morgan</div>'+
      '<div class="req-sub">alex.morgan@bgmail.com · SKT certified · '+txDate()+'</div></div>'+
      '<span class="badge b-green"><i class="ti ti-check"></i> Processed</span>';
    reqAll.insertBefore(ri, reqAll.firstChild);
  }
  // bCA certifications: recently issued
  var crt=document.getElementById('cert-recent-tbody');
  if(crt){
    var row=document.createElement('tr');
    row.style.background='var(--green-50)';
    row.innerHTML='<td class="mono" style="font-size:11px">alex.morgan@bgmail.com</td>'+
      '<td>Alex Morgan</td><td><span class="badge b-blue">Real name</span></td>'+
      '<td>SKT</td><td>'+txDate()+'</td><td>'+txExp2()+'</td>'+
      '<td><span class="badge b-green">Active</span></td>';
    crt.insertBefore(row, crt.firstChild);
  }
  // bCA certified count
  txText('bca-certified','14,222');

  checkT4();
}

// ── Transaction 3: Amazon bMember ─────────────────────────────
async function doT3(){
  if(TX.t3) return;
  var btn=document.getElementById('tb3');
  btn.disabled=true; btn.classList.add('running');
  txBadge('tb3-badge','amber','<i class="ti ti-loader-2"></i>');

  txLog('Amazon → ISP: bMember onboarding request submitted');
  setProgress(3,15); await txSleep(900);
  txLog('ISP: Amazon.com verified — Tier-1 e-commerce — approved');
  setProgress(3,32); await txSleep(800);
  txLog('ISP: Domain allowlist extended → Amazon.com');
  setProgress(3,50); await txSleep(700);
  txLog('ISP: Secure ID-change protocol issued to Amazon');
  setProgress(3,67); await txSleep(650);
  txLog('Amazon: Review tier configured → "Identifiable author"');
  setProgress(3,84); await txSleep(550);
  txLog('ISP: Amazon.com added to bMember platform registry');
  setProgress(3,100); await txSleep(350);

  TX.t3=true;
  btn.classList.remove('running'); btn.classList.add('done');
  txBadge('tb3-badge','green','✓');
  txBadge('gs3','green','✓ Amazon');
  updateHeader();

  // ── Dashboard updates ──
  // Platform dashboard bMembers
  txText('plat-bmembers','847,001');
  txText('plat-bmem-sub','↑ Amazon.com onboarded today');
  // Platform review layer alert
  var revAlert=document.querySelector('#view-plat-reviews .a-info');
  if(revAlert) revAlert.innerHTML='<i class="ti ti-info-circle"></i>Amazon.com bMember onboarding complete on '+txDate()+'. bMail ID reviews are tagged "Identifiable author". Review trust layer is active.';
  // ISP request queue
  var reqAll2=document.getElementById('req-all');
  if(reqAll2){
    var ri2=document.createElement('div'); ri2.className='req-item';
    ri2.style.cssText='background:var(--purple-50);border-color:var(--purple-100)';
    ri2.innerHTML='<div class="req-icon ri-purple"><i class="ti ti-building-store" style="color:var(--purple-600)"></i></div>'+
      '<div class="req-body"><div class="req-title">Amazon.com bMember agreement</div>'+
      '<div class="req-sub">ID-change protocol active · Review tier configured · '+txDate()+'</div></div>'+
      '<span class="badge b-green"><i class="ti ti-check"></i> Processed</span>';
    reqAll2.insertBefore(ri2, reqAll2.firstChild);
  }
  // ISP req count
  var cnt=parseInt(document.getElementById('isp-req-today').textContent||'13')+1;
  txText('isp-req-today', cnt.toString());
  var badge2=document.getElementById('isp-req-badge');
  if(badge2) badge2.textContent=cnt.toString();
  // Domain registry: add Amazon as accepted platform note under bgmail.com
  txHtml('bgmail-user-count','18,403');

  checkT4();
}

// ── Transaction 4: Enroll at Amazon ───────────────────────────
async function doT4(){
  if(TX.t4||!TX.t1||!TX.t2||!TX.t3) return;
  var btn=document.getElementById('tb4');
  btn.disabled=true; btn.classList.add('running');
  txBadge('tb4-badge','amber','<i class="ti ti-loader-2"></i>');

  txLog('USER → Amazon: alex.morgan@bgmail.com');
  setProgress(4,15); await txSleep(700);
  txLog('Amazon → ISP: bgmail.com domain verified ✓');
  setProgress(4,35); await txSleep(650);
  txLog('ISP: alex.morgan@bgmail.com — SKT certified — Lifelong');
  setProgress(4,55); await txSleep(600);
  txLog('Amazon: bMember record created — Identifiable author');
  setProgress(4,80); await txSleep(550);
  txLog('ISP: Enrollment logged · KakaoTalk notification sent');
  setProgress(4,100); await txSleep(350);

  TX.t4=true;
  btn.classList.remove('running'); btn.classList.add('done');
  txBadge('tb4-badge','green','✓');
  txBadge('gs4','green','✓ Enrolled');
  updateHeader();

  // ── Dashboard updates ──
  // User dashboard: platforms linked
  txText('ud-platforms','5');
  txText('ud-plat-sub','3 bMember · 2 legacy');
  // User platforms: add Amazon row at top of table
  var platBody=document.getElementById('user-plat-tbody');
  if(platBody){
    var row=document.createElement('tr');
    row.style.background='var(--green-50)';
    row.innerHTML='<td><strong>Amazon.com</strong></td>'+
      '<td class="mono" style="font-size:11px">alex.morgan@bgmail.com</td>'+
      '<td>'+txDate()+'</td>'+
      '<td><span class="badge b-green"><i class="ti ti-shield-check"></i> bMember</span></td>'+
      '<td>New member</td>'+
      '<td><button class="btn btn-sm">Manage</button></td>';
    platBody.insertBefore(row, platBody.firstChild);
  }
  // User events timeline
  var tl2=document.getElementById('user-events-timeline');
  if(tl2){
    var ev=document.createElement('div'); ev.className='tl-item';
    ev.style.cssText='background:var(--green-50);border-radius:var(--radius);padding:6px 8px;margin-bottom:10px';
    ev.innerHTML='<div class="tl-time">'+txDate()+' · '+txTs()+'</div>'+
      '<div class="tl-text"><strong>Enrolled at Amazon.com</strong> as bMember — Identifiable author tier assigned <span class="badge b-green" style="margin-left:4px">New</span></div>';
    tl2.insertBefore(ev, tl2.firstChild);
  }
  // Platform bMembers
  txText('plat-bmembers','847,002');
  txText('plat-bmem-sub','↑ Prof. Morgan enrolled today');
  // Platform member table: add Lee at top
  var memTbl=document.querySelector('#view-plat-members .tbl tbody');
  if(memTbl){
    var mrow=document.createElement('tr');
    mrow.style.background='var(--green-50)';
    mrow.innerHTML='<td>Alex Morgan</td>'+
      '<td class="mono" style="font-size:11px">alex.morgan@bgmail.com</td>'+
      '<td><span class="badge b-green">bMember</span></td>'+
      '<td>SKT Telecom</td><td>0</td>'+
      '<td><span class="badge b-green">Low</span></td>';
    memTbl.insertBefore(mrow, memTbl.firstChild);
  }
  // Platform review feed: add Lee's profile card at top
  var revCard=document.getElementById('plat-review-feed-card');
  if(revCard){
    var reviewItem=document.createElement('div'); reviewItem.className='review-card';
    reviewItem.style.cssText='background:var(--green-50);border-color:var(--green-100)';
    reviewItem.innerHTML=
      '<div class="review-meta">'+
      '<div class="avatar av-blue" style="width:32px;height:32px;font-size:12px">JL</div>'+
      '<div><div style="font-size:13px;font-weight:500">Alex Morgan '+
        '<span class="badge b-green" style="margin-left:4px"><i class="ti ti-shield-check"></i> bMember</span>'+
        '<span class="badge b-teal" style="margin-left:4px">New</span></div>'+
        '<div style="font-size:11px;color:var(--text3)">alex.morgan@bgmail.com · SKT certified · Enrolled '+txDate()+'</div>'+
      '</div></div>'+
      '<div style="font-size:13px;color:var(--text2);font-style:italic;margin-top:6px">No reviews posted yet. Reviews will carry "Identifiable author" trust tier.</div>';
    var firstReview = revCard.querySelector('.review-card');
    if(firstReview) revCard.insertBefore(reviewItem, firstReview);
    else revCard.appendChild(reviewItem);
  }
  // ISP request queue
  var reqAll3=document.getElementById('req-all');
  if(reqAll3){
    var ri3=document.createElement('div'); ri3.className='req-item';
    ri3.style.cssText='background:var(--green-50);border-color:var(--green-100)';
    ri3.innerHTML='<div class="req-icon ri-green"><i class="ti ti-id-badge-2" style="color:var(--green-600)"></i></div>'+
      '<div class="req-body"><div class="req-title">Amazon enrollment — Prof. Alex Morgan</div>'+
      '<div class="req-sub">alex.morgan@bgmail.com · bMember · Identifiable author · '+txDate()+'</div></div>'+
      '<span class="badge b-green"><i class="ti ti-check"></i> Processed</span>';
    reqAll3.insertBefore(ri3, reqAll3.firstChild);
  }
  var cnt2=parseInt(document.getElementById('isp-req-today').textContent||'14')+1;
  txText('isp-req-today', cnt2.toString());
  var badge3=document.getElementById('isp-req-badge');
  if(badge3) badge3.textContent=cnt2.toString();
  // Update platform Amazon status in page title
  var amzTitle=document.getElementById('plat-amazon-title');
  if(amzTitle){ amzTitle.textContent='Amazon.com: bMember active ✓'; amzTitle.style.color='var(--teal-600)'; }
}
