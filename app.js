/* ================================================================
   学习打卡 PWA v2.1 — 零外部依赖，纯 fetch 调用 Supabase
   ================================================================ */

const SUPABASE_URL = 'https://icxyuscrfsnjlexeejtp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljeHl1c2NyZnNuamxleGVlanRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjAyOTQsImV4cCI6MjA5NjczNjI5NH0.2tbJGgLShQXEdu644kINqpRYtuHC_xhnMX34asJQgo4';

// ===== 轻量 Supabase 请求封装 (零依赖) =====
function db() {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  return {
    from: (table) => ({
      _table: table,
      _filters: '',
      _order: '',
      _range: '',
      _single: false,

      select(cols) { this._select = cols || '*'; return this; },
      eq(k,v) { this._filters += `&${k}=eq.${encodeURIComponent(v)}`; return this; },
      neq(k,v) { this._filters += `&${k}=neq.${encodeURIComponent(v)}`; return this; },
      is(k,v) { this._filters += `&${k}=is.${v||'null'}`; return this; },
      gte(k,v) { this._filters += `&${k}=gte.${encodeURIComponent(v)}`; return this; },
      not(k,op,v) { this._filters += `&${k}=not.${op}.${encodeURIComponent(v)}`; return this; },
      in(k,vals) { this._filters += `&${k}=in.(${vals.map(encodeURIComponent).join(',')})`; return this; },
      order(col, opt) { this._order = `&order=${col}.${opt||'asc'}`; return this; },
      limit(n) { this._range = `&limit=${n}`; return this; },
      range(from,to) { this._range = `&limit=${to-from+1}&offset=${from}`; return this; },
      single() { this._single = true; return this; },

      async _fetch(method, body, extraHeaders) {
        let url = `${SUPABASE_URL}/rest/v1/${this._table}?select=${this._select||'*'}${this._filters}${this._order}${this._range}`;
        if (this._single) url += '&limit=1';
        const opts = { method, headers: {...headers, ...extraHeaders} };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err);
        }
        const data = await res.json();
        return this._single ? data[0] || null : data;
      },

      then(resolve, reject) { return this._fetch('GET').then(resolve, reject); },

      insert(body) { return this._fetch('POST', body); },
      update(body) { return this._fetch('PATCH', body); },
      upsert(body, opts) { return this._fetch('POST', body, {'Prefer':'resolution=merge-duplicates,return=representation'}); },
      delete() { return this._fetch('DELETE'); },
    })
  };
}

// ===== 全局状态 =====
const STATE = {
  user: null,
  activeSession: null,
  currentGroup: '__all__',
  currentGroupName: '全部成员',
  currentStatTab: 'daily',
  historyPage: 1,
  pollTimer: null,
  timerInterval: null,
  clockTimer: null,
};

// ===== 工具函数 =====
const esc = s => { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; };
const pd = n => String(n).padStart(2,'0');
function fmtDur(sec) {
  if (!sec||sec<=0) return '0 分钟';
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60);
  return h>0?`${h} 小时 ${m} 分钟`:`${m} 分钟`;
}
function fmtTimer(sec) {
  return `${pd(Math.floor(sec/3600))}:${pd(Math.floor((sec%3600)/60))}:${pd(sec%60)}`;
}
function fmtTime(iso) {
  if (!iso) return ''; const d=new Date(iso);
  return `${pd(d.getHours())}:${pd(d.getMinutes())}`;
}
function fmtDate(iso) {
  if (!iso) return ''; const d=new Date(iso);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}
function hsl2hex(hsl) {
  const m=hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/); if(!m)return hsl;
  const h=+m[1]/360,s=+m[2]/100,l=+m[3]/100;
  const hue=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
  const toH=x=>Math.round(x*255).toString(16).padStart(2,'0');
  return '#'+toH(hue(p,q,h+1/3))+toH(hue(p,q,h))+toH(hue(p,q,h-1/3));
}
function getIni(name) {
  if(!name)return'?';const c=name.trim().charAt(0);
  return /[一-鿿]/.test(c)?c:c.toUpperCase();
}
function isWeekend(d){const day=(d||new Date()).getDay();return day===0||day===6;}
function isInWindow(){return true;}
function getTodayLabel(){
  const n=new Date(),w=['日','一','二','三','四','五','六'];
  return `${n.getMonth()+1}月${n.getDate()}日 星期${w[n.getDay()]}`;
}

// ===== Toast =====
let _tt=null;
function toast(msg,type){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='toast '+(type||'');
  clearTimeout(_tt);_tt=setTimeout(()=>t.classList.add('hidden'),2500);
}

// ===== 弹窗 =====
function openModal(html){
  document.getElementById('modal-content').innerHTML=html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal(){
  document.getElementById('modal-overlay').classList.add('hidden');
}
document.addEventListener('click',e=>{if(e.target.id==='modal-overlay')closeModal();});

// ===== Tab =====
function setTab(t){
  document.querySelectorAll('.tab-item').forEach(el=>el.classList.toggle('active',el.dataset.tab===t));
}

// ===== 轮询/计时器 =====
function startPoll(){
  stopPoll();
  STATE.pollTimer=setInterval(()=>{updateWinBanner();loadMembers();},30000);
}
function stopPoll(){if(STATE.pollTimer){clearInterval(STATE.pollTimer);STATE.pollTimer=null;}}
function stopTimer(){if(STATE.timerInterval){clearInterval(STATE.timerInterval);STATE.timerInterval=null;}}

// ====== 深色模式 ======
function getTheme() { return localStorage.getItem('theme') || 'light'; }
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
}
function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  updateThemeToggleUI();
  if (window.location.hash === '#home' || window.location.hash === '') updateWinBanner();
}
function updateThemeToggleUI() {
  const isDark = getTheme() === 'dark';
  document.querySelectorAll('.theme-toggle-icon').forEach(el => {
    el.textContent = isDark ? '☀️' : '🌙';
    el.title = isDark ? '切换浅色模式' : '切换深色模式';
  });
}

// ===== 初始化 =====
async function init(){
  // 恢复主题
  setTheme(getTheme());

  // 立即渲染
  route();
  window.addEventListener('hashchange',route);

  // 恢复会话
  const uid=localStorage.getItem('study_user_id');
  if(uid){
    try{
      const user=await db().from('users').select().eq('id',uid).single();
      if(user){
        STATE.user=user;
        const active=await db().from('sessions').select().eq('user_id',uid).is('end_time',null).order('start_time','desc').single();
        STATE.activeSession=active;
        route();
      }else{localStorage.removeItem('study_user_id');}
    }catch(e){console.log('加载用户数据失败');}
  }
}

// ===== 路由 =====
function route(){
  stopPoll();stopTimer();stopClock();
  const hash=window.location.hash.slice(1)||'login';
  if(!STATE.user&&hash!=='login'){window.location.hash='#login';return;}
  if(STATE.user&&hash==='login'){window.location.hash='#home';return;}

  document.getElementById('tabbar').classList.toggle('hidden',hash!=='home'&&hash!=='profile'&&hash!=='groups'&&hash!=='mindmap'&&hash!=='admin');
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden', !(STATE.user&&STATE.user.is_admin)));

  switch(hash){
    case'login':renderLogin();break;
    case'home':renderHome();setTab('home');break;
    case'profile':renderProfile();setTab('profile');break;
    case'groups':renderGroups();setTab('groups');break;
    case'mindmap':renderMindMap();setTab('mindmap');break;
    case'admin':renderAdmin();setTab('admin');break;
    default:window.location.hash='#home';
  }
  setTimeout(() => updateThemeToggleUI(), 0);
}

// ====== 加密 ======
async function sha256(text){
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ====== 登录页 ======
function renderLogin(){
  document.getElementById('app').innerHTML=`
    <div class="login-page">
      <div class="login-logo">📚</div>
      <h1 class="login-title">学习打卡</h1>
      <p class="login-subtitle">和朋友们一起坚持学习</p>
      <div class="login-form">
        <div class="form-group">
          <label class="form-label">ID</label>
          <input id="login-id" class="input" placeholder="例如: alex、小明" maxlength="20" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">显示名称（可选）</label>
          <input id="login-name" class="input" placeholder="让大家认识你" maxlength="15">
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input id="login-pw" class="input" type="password" placeholder="设置/输入密码" maxlength="30">
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">
          🔒 首次输入 ID+密码 = 注册 ；再次输入相同 ID+密码 = 登录
        </div>
        <button id="login-btn" class="btn btn-primary btn-block btn-lg" onclick="doLogin()">进入打卡</button>
      </div>
    </div>`;
  document.getElementById('login-id').focus();
  ['login-id','login-name','login-pw'].forEach(id=>{
    document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
  });
}

async function doLogin(){
  const id=document.getElementById('login-id').value.trim();
  const name=document.getElementById('login-name').value.trim()||id;
  const pw=document.getElementById('login-pw').value.trim();
  if(!id)return toast('请输入 ID','error');
  if(!pw)return toast('请输入密码','error');
  const btn=document.getElementById('login-btn');
  btn.disabled=true;btn.textContent='进入中...';
  try{
    const pwHash=await sha256(pw);
    let user=await db().from('users').select().eq('id',id).single();
    if(user){
      // 用户已存在
      if(user.password_hash){
        // 有密码 → 验证密码
        if(user.password_hash!==pwHash) return toast('密码错误', 'error'), btn.disabled=false, void(btn.textContent='进入打卡');
      } else {
        // 旧用户无密码 → 首次设置密码
        await db().from('users').eq('id',id).update({password_hash:pwHash});
        toast('已设置密码！🔒','success');
      }
    } else {
      // 新用户 → 注册
      const hue=Math.floor(Math.random()*360);
      const result=await db().from('users').insert({id,name,color:`hsl(${hue},55%,50%)`,password_hash:pwHash});
      user=result[0];
      toast('注册成功！🎉','success');
    }
    localStorage.setItem('study_user_id',user.id);
    STATE.user=user;
    window.location.hash='#home';
  }catch(e){
    toast('连接失败: ' + (e.message || '网络错误'), 'error');
    btn.disabled=false;btn.textContent='进入打卡';
  }
}

// ====== 首页 ======
function renderHome(){
  const u=STATE.user;
  document.getElementById('app').innerHTML=`
    <div class="home-header">
      <div class="avatar avatar-lg" style="background:${hsl2hex(u.color)}">${getIni(u.name)}</div>
      <div class="home-header-info">
        <div class="home-header-name">${esc(u.name)}</div>
        <div class="home-header-id">@${esc(u.id)}</div>
      </div>
      <button class="theme-toggle-btn" onclick="toggleTheme()" title="切换深色模式"><span class="theme-toggle-icon">🌙</span></button>
      <button class="btn btn-outline" onclick="doLogout()" style="padding:8px 14px;font-size:13px;">退出</button>
    </div>
    <div id="study-window-banner" class="card" style="padding:12px 16px;margin:0 16px;"></div>
    <div class="punch-section">
      <div id="punch-content-display" class="punch-content hidden"></div>
      <div id="punch-timer" class="punch-timer hidden">00:00:00</div>
      <button id="punch-btn" class="btn btn-success btn-xl btn-block" onclick="handlePunch()">📖 开始学习</button>
      <button id="punch-cancel" class="btn btn-outline mt-16 hidden" onclick="cancelPunch()" style="padding:10px 20px;font-size:14px;">取消本次学习</button>
      <div id="punch-hint" style="font-size:13px;color:var(--text-muted);margin-top:10px;"></div>
    </div>
    <div id="live-clock" style="text-align:center;font-size:16px;color:var(--text);font-weight:600;margin:0 0 16px;"></div>
    <div class="section-title">👥 学习伙伴</div>
    <div id="group-selector" class="group-selector"></div>
    <div id="member-grid" class="member-grid"></div>
    <div id="member-empty" class="empty-state hidden"><div class="empty-icon">🤝</div><div class="empty-text">还没有群组，去创建一个吧</div><button class="btn btn-primary mt-16" onclick="window.location.hash='#groups'">去创建群组</button></div>`;

  updateWinBanner();
  updatePunchUI();
  loadGroupsAndMembers();
  startClock();
  startPoll();
}

function startClock(){
  stopClock();
  const tick=()=>{
    const el=document.getElementById('live-clock');
    if(el){const n=new Date();el.textContent='🕐 '+pd(n.getHours())+':'+pd(n.getMinutes())+':'+pd(n.getSeconds());}
  };
  tick();STATE.clockTimer=setInterval(tick,1000);
}
function stopClock(){if(STATE.clockTimer){clearInterval(STATE.clockTimer);STATE.clockTimer=null;}}

// 学习窗口
function updateWinBanner(){
  const b=document.getElementById('study-window-banner');
  if(!b)return;
  b.style.background='';b.style.color='';b.className='card study-banner';
  b.innerHTML=`<div style="display:flex;align-items:center;gap:8px;"><span>🟢</span><span style="font-size:13px;font-weight:600;">${getTodayLabel()}</span></div><div style="font-size:12px;margin-top:4px;">全天可打卡，随时开始学习！</div>`;
}

// 打卡 UI
function updatePunchUI(){
  const btn=document.getElementById('punch-btn');
  const timerEl=document.getElementById('punch-timer');
  const ctEl=document.getElementById('punch-content-display');
  const cancelEl=document.getElementById('punch-cancel');
  const hintEl=document.getElementById('punch-hint');
  if(!btn)return;
  const a=STATE.activeSession;
  if(a){
    btn.textContent='✋ 结束学习';btn.className='btn btn-danger btn-xl btn-block';
    timerEl.classList.remove('hidden');ctEl.classList.remove('hidden');
    ctEl.textContent='📝 '+(a.content||'学习中...');
    cancelEl.classList.remove('hidden');hintEl.textContent='';
    stopTimer();
    const st=new Date(a.start_time);
    const tick=()=>{timerEl.textContent=fmtTimer(Math.floor((new Date()-st)/1000));};
    tick();STATE.timerInterval=setInterval(tick,1000);
  }else{
    btn.textContent='📖 开始学习';btn.className='btn btn-success btn-xl btn-block';
    timerEl.classList.add('hidden');ctEl.classList.add('hidden');
    cancelEl.classList.add('hidden');
    hintEl.textContent='点击开始，记录你的学习时光';
  }
}

function handlePunch(){STATE.activeSession?showEndModal():showStartModal();}

function showStartModal(){
  openModal(`<div class="modal-title">📖 开始学习</div>
    <div class="form-group"><label class="form-label">本次学习内容</label>
    <textarea id="m-input" class="input" placeholder="例如：复习高等数学第三章..." rows="3"></textarea></div>
    <button class="btn btn-success btn-block btn-lg" onclick="confirmStart()">确认开始</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">取消</button>`);
  setTimeout(()=>document.getElementById('m-input')?.focus(),300);
}

async function confirmStart(){
  const content=document.getElementById('m-input').value.trim();
  if(!content)return toast('请输入学习内容','error');
  try{
    const data=await db().from('sessions').insert({user_id:STATE.user.id,start_time:new Date().toISOString(),content});
    STATE.activeSession=data[0];
    closeModal();toast('开始学习！加油 💪','success');
    updatePunchUI();loadMembers();
  }catch(e){toast('操作失败','error');}
}

function showEndModal(){
  const a=STATE.activeSession;
  const elapsed=Math.floor((new Date()-new Date(a.start_time))/1000);
  openModal(`<div class="modal-title">✅ 结束学习</div>
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:36px;font-weight:800;color:var(--primary);">${fmtTimer(elapsed)}</div>
      <div style="color:var(--text-muted);font-size:14px;">本次学习时长：${fmtDur(elapsed)}</div>
    </div>
    <div class="form-group"><label class="form-label">确认/修改学习内容</label>
    <textarea id="m-input" class="input" rows="3">${esc(a.content||'')}</textarea></div>
    <button class="btn btn-primary btn-block btn-lg" onclick="confirmEnd()">确认结束</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">继续学习</button>`);
}

async function confirmEnd(){
  const content=document.getElementById('m-input').value.trim();
  const endTime=new Date().toISOString();
  const st=new Date(STATE.activeSession.start_time);
  const dur=Math.floor((new Date(endTime)-st)/1000);
  try{
    await db().from('sessions').eq('id',STATE.activeSession.id).update({end_time:endTime,content:content||STATE.activeSession.content,duration_sec:dur});
    STATE.activeSession=null;
    closeModal();stopTimer();toast('学习打卡完成！🎉','success');
    updatePunchUI();loadMembers();
  }catch(e){toast('操作失败','error');}
}

async function cancelPunch(){
  if(!confirm('确定要取消吗？不会保存记录。'))return;
  try{
    await db().from('sessions').eq('id',STATE.activeSession.id).delete();
    STATE.activeSession=null;stopTimer();updatePunchUI();loadMembers();toast('已取消');
  }catch(e){toast('操作失败','error');}
}

// 群组 & 成员
async function loadGroupsAndMembers(){
  const sel=document.getElementById('group-selector');
  try{
    const gm=await db().from('group_members').select('group_id').eq('user_id',STATE.user.id);
    const myIds=[...(new Set((gm||[]).map(m=>m.group_id)))];
    let groups=[];
    if(myIds.length>0){
      groups=await db().from('groups_table').select().in('id',myIds);
    }
    if(sel)sel.innerHTML=[
      `<div class="group-chip ${STATE.currentGroup==='__all__'?'active':''}" onclick="switchGroup('__all__','全部成员')">全部成员</div>`,
      ...(groups||[]).map(g=>`<div class="group-chip ${STATE.currentGroup===g.id?'active':''}" onclick="switchGroup('${g.id}','${esc(g.name)}')">${esc(g.name)}</div>`)
    ].join('');
  }catch(e){if(sel)sel.innerHTML='';}
  loadMembers();
}

function switchGroup(id,name){
  STATE.currentGroup=id;STATE.currentGroupName=name;
  document.querySelectorAll('.group-chip').forEach(c=>c.classList.remove('active'));
  document.querySelector(`[onclick*="${id}"]`)?.classList.add('active');
  loadMembers();
}

async function loadMembers(){
  const grid=document.getElementById('member-grid');
  const empty=document.getElementById('member-empty');
  if(!grid)return;
  try{
    let members=[];
    if(STATE.currentGroup==='__all__'){
      const all=await db().from('users').select().neq('id',STATE.user.id);
      members=all||[];
    }else{
      const gm=await db().from('group_members').select('user_id').eq('group_id',STATE.currentGroup);
      if(gm&&gm.length>0){
        members=await db().from('users').select().in('id',gm.map(m=>m.user_id));
        members=members||[];
      }
    }
    if(members.length===0){grid.innerHTML='';empty?.classList.remove('hidden');return;}
    empty?.classList.add('hidden');
    const today=new Date().toISOString().slice(0,10);
    const enriched=await Promise.all(members.map(async m=>{
      const active=await db().from('sessions').select().eq('user_id',m.id).is('end_time',null).single();
      const stats=await db().from('sessions').select('duration_sec').eq('user_id',m.id).gte('start_time',today).not('end_time','is',null);
      const total=(stats||[]).reduce((s,r)=>s+(r.duration_sec||0),0);
      return {...m,is_online:!!active,online_since:active?.start_time,total_sec:total,session_count:(stats||[]).length};
    }));
    const isAllMembers = STATE.currentGroup === '__all__';
    grid.innerHTML=enriched.map(m=>`
      <div class="member-item" ${isAllMembers?'':`onclick="showMemberDetail('${esc(m.id)}')"`} style="${isAllMembers?'cursor:default;':''}">
        <div class="avatar-wrapper">
          <div class="avatar avatar-sm" style="background:${hsl2hex(m.color)}">${getIni(m.name)}</div>
          <span class="status-dot ${m.is_online?'online':'offline'}"></span>
        </div>
        <div class="member-name">${esc(m.name)}</div>
        <div class="member-status">${m.is_online?'学习中 '+fmtTime(m.online_since):'离线'}</div>
      </div>`).join('');
  }catch(e){console.log('加载成员失败');}
}

async function showMemberDetail(uid){
  openModal('<div style="text-align:center;padding:20px;">加载中...</div>');
  try{
    const today=new Date().toISOString().slice(0,10);
    const user=await db().from('users').select().eq('id',uid).single();
    const active=await db().from('sessions').select().eq('user_id',uid).is('end_time',null).single();
    const sessions=await db().from('sessions').select().eq('user_id',uid).gte('start_time',today).order('start_time','desc');
    const totalSec=(sessions||[]).filter(s=>s.end_time).reduce((s,r)=>s+(r.duration_sec||0),0);
    const n=user?.name||uid,c=user?.color||'hsl(200,55%,50%)';
    openModal(`
      <div class="modal-title" style="position:relative;">学习详情
        <button class="btn" onclick="closeModal()" style="position:absolute;right:0;top:-8px;font-size:18px;">✕</button>
      </div>
      <div class="member-detail-header">
        <div class="avatar avatar-lg" style="background:${hsl2hex(c)}">${getIni(n)}</div>
        <div class="member-detail-info">
          <div class="member-detail-name">${esc(n)}</div>
          <div class="member-detail-status" style="color:${active?'var(--success)':'var(--text-muted)'}">
            ${active?'🟢 学习中 · 开始于 '+fmtTime(active.start_time):'⚪ 当前离线'}
          </div>
        </div>
      </div>
      <div class="member-detail-section"><h4>📊 今日统计</h4>
        <div style="display:flex;gap:16px;">
          <div style="flex:1;background:var(--primary-bg);border-radius:var(--radius-sm);padding:14px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:var(--primary);">${fmtDur(totalSec)}</div>
            <div style="font-size:12px;color:var(--text-muted);">总学习时长</div></div>
          <div style="flex:1;background:var(--primary-bg);border-radius:var(--radius-sm);padding:14px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:var(--primary);">${(sessions||[]).length}</div>
            <div style="font-size:12px;color:var(--text-muted);">今日任务数</div></div>
        </div></div>
      <div class="member-detail-section"><h4>📝 今日学习记录</h4>
        ${(sessions||[]).length>0?sessions.map(s=>`
          <div class="history-item">
            <div class="history-item-header">
              <span class="history-date">${fmtTime(s.start_time)} - ${s.end_time?fmtTime(s.end_time):'进行中'}</span>
              <span class="history-duration">${s.duration_sec?fmtDur(s.duration_sec):'进行中'}</span></div>
            ${s.content?`<div class="history-content">${esc(s.content)}</div>`:''}
          </div>`).join(''):'<div style="text-align:center;color:var(--text-muted);padding:20px;">今天还没有学习记录</div>'}
      </div>
      <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">关闭</button>`);
  }catch(e){openModal('<div style="text-align:center;padding:20px;">加载失败</div><button class="btn btn-outline btn-block" onclick="closeModal()">关闭</button>');}
}

async function doLogout(){
  stopPoll();stopTimer();stopClock();
  localStorage.removeItem('study_user_id');
  STATE.user=null;STATE.activeSession=null;
  window.location.hash='#login';
}

// ====== 统计页 ======
function renderProfile(){
  document.getElementById('app').innerHTML=`
    <div style="padding:20px 16px 8px;"><h2 style="font-size:22px;font-weight:800;">📊 学习统计</h2></div>
    <div class="stats-grid">
      <div class="stat-card active" id="tab-daily" onclick="switchStat('daily')"><div class="stat-label">今日</div><div class="stat-value" id="val-daily">--</div><div class="stat-detail" id="detail-daily"></div></div>
      <div class="stat-card" id="tab-weekly" onclick="switchStat('weekly')"><div class="stat-label">本周</div><div class="stat-value" id="val-weekly">--</div><div class="stat-detail" id="detail-weekly"></div></div>
      <div class="stat-card" id="tab-monthly" onclick="switchStat('monthly')"><div class="stat-label">本月</div><div class="stat-value" id="val-monthly">--</div><div class="stat-detail" id="detail-monthly"></div></div>
      <div class="stat-card" id="tab-all" onclick="switchStat('all')"><div class="stat-label">全部</div><div class="stat-value" id="val-all">--</div><div class="stat-detail" id="detail-all"></div></div>
    </div>
    <div class="section-title" id="history-title">今日记录</div>
    <div id="history-list" class="history-list"></div>
    <div id="load-more" class="text-center mt-16 hidden"><button class="btn btn-outline" onclick="loadMore()">加载更多</button></div>`;
  loadAllStats();loadHistoryList();
}

async function loadAllStats(){
  const uid=STATE.user.id;
  const today=new Date().toISOString().slice(0,10);
  const now=new Date();
  const mon=new Date(now);mon.setDate(now.getDate()-((now.getDay()+6)%7));
  const monStr=mon.toISOString().slice(0,10);
  const ms=`${now.getFullYear()}-${pd(now.getMonth()+1)}-01`;
  try{
    const qs=[['gte','start_time',today],['gte','start_time',monStr],['gte','start_time',ms],[]];
    const results=await Promise.all(qs.map(q=>{
      let b=db().from('sessions').select('duration_sec').eq('user_id',uid).not('end_time','is',null);
      if(q.length)b=b[q[0]](q[1],q[2]);
      return b;
    }));
    const st=results.map(r=>{
      const total=(r||[]).reduce((s,x)=>s+(x.duration_sec||0),0);
      return[total,(r||[]).length];
    });
    ['daily','weekly','monthly','all'].forEach((k,i)=>{
      document.getElementById(`val-${k}`).textContent=fmtDur(st[i][0]);
      document.getElementById(`detail-${k}`).textContent=`${st[i][1]} 次学习`;
    });
  }catch(e){console.log('加载统计失败');}
}

function switchStat(tab){
  STATE.currentStatTab=tab;STATE.historyPage=1;
  document.querySelectorAll('.stat-card').forEach(c=>c.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  document.getElementById('history-title').textContent={daily:'今日记录',weekly:'本周记录',monthly:'本月记录',all:'全部记录'}[tab]||'';
  loadHistoryList();
}

async function loadHistoryList(append){
  const list=document.getElementById('history-list');
  const lm=document.getElementById('load-more');
  if(!append)list.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:20px;">加载中...</div>';
  const uid=STATE.user.id,tab=STATE.currentStatTab;
  try{
    if(tab==='daily'){
      const today=new Date().toISOString().slice(0,10);
      const data=await db().from('sessions').select().eq('user_id',uid).gte('start_time',today).order('start_time','desc');
      renderHistItems(data||[],list,append);lm.classList.add('hidden');
    }else if(tab==='all'){
      const from=(STATE.historyPage-1)*20,to=STATE.historyPage*20-1;
      const data=await db().from('sessions').select().eq('user_id',uid).not('end_time','is',null).order('start_time','desc').range(from,to);
      renderHistItems(data||[],list,append);
      lm.classList.toggle('hidden',(data||[]).length<20);
    }else{
      let sd;
      if(tab==='weekly'){
        const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));sd=d.toISOString().slice(0,10);
      }else{sd=`${new Date().getFullYear()}-${pd(new Date().getMonth()+1)}-01`;}
      const data=await db().from('sessions').select('start_time,duration_sec').eq('user_id',uid).gte('start_time',sd).not('end_time','is',null).order('start_time','desc');
      const grp={};(data||[]).forEach(s=>{
        const day=s.start_time.slice(0,10);
        if(!grp[day])grp[day]={total:0,count:0};
        grp[day].total+=(s.duration_sec||0);grp[day].count++;
      });
      if(!append)list.innerHTML='';
      if(Object.keys(grp).length===0&&!append)list.innerHTML='<div class="empty-state"><div class="empty-text">暂无记录</div></div>';
      else list.innerHTML=Object.entries(grp).map(([day,d])=>`
        <div class="history-item" style="border-left:3px solid var(--primary);">
          <div class="history-item-header"><span class="history-date">${fmtDate(day)}</span><span class="history-duration">${fmtDur(d.total)}</span></div>
          <div style="font-size:12px;color:var(--text-muted);">${d.count} 次学习</div>
        </div>`).join('');
      lm.classList.add('hidden');
    }
  }catch(e){list.innerHTML='<div class="empty-state"><div class="empty-text">加载失败</div></div>';}
}

function renderHistItems(data,list,append){
  if(!append)list.innerHTML='';
  if(data.length===0&&!append){list.innerHTML='<div class="empty-state"><div class="empty-text">暂无记录</div></div>';return;}
  list.innerHTML+=data.map(s=>`
    <div class="history-item">
      <div class="history-item-header"><span class="history-date">${fmtTime(s.start_time)} - ${s.end_time?fmtTime(s.end_time):'进行中'}</span><span class="history-duration">${s.duration_sec?fmtDur(s.duration_sec):'进行中'}</span></div>
      ${s.content?`<div class="history-content">${esc(s.content)}</div>`:''}
    </div>`).join('');
}

async function loadMore(){STATE.historyPage++;await loadHistoryList(true);}

// ====== 群组页 ======
function renderGroups(){
  document.getElementById('app').innerHTML=`
    <div style="padding:20px 16px 8px;"><h2 style="font-size:22px;font-weight:800;">👥 群组管理</h2></div>
    <div style="display:flex;gap:10px;padding:0 16px;margin-bottom:20px;">
      <button class="btn btn-primary" onclick="showCreateGroup()" style="flex:1;">➕ 创建群组</button>
      <button class="btn btn-outline" onclick="showJoinGroup()" style="flex:1;">🔗 加入群组</button></div>
    <div class="section-title">我的群组</div>
    <div id="groups-list"></div>
    <div id="groups-empty" class="empty-state hidden"><div class="empty-icon">📭</div><div class="empty-text">还没有加入任何群组</div></div>
    <div class="section-title">⚙️ 设置</div>
    <div class="card" style="margin:0 16px;">
      <div class="setting-item"><span>当前用户</span><span style="color:var(--text-muted);">${esc(STATE.user.name)} (@${esc(STATE.user.id)})</span></div>
      <div class="setting-item"><span>学习时间规定</span><span style="color:var(--text-muted);font-size:13px;">全天 24 小时可打卡</span></div>
      <div class="setting-item" style="cursor:pointer;" onclick="toggleTheme()"><span>深色模式</span><span class="theme-toggle-icon" style="font-size:20px;">🌙</span></div>
      <div class="setting-item" style="cursor:pointer;" onclick="showAbout()"><span>关于学习打卡</span><span>📚</span></div>
      <div class="setting-item"><span>联系方式</span><span style="color:var(--text-muted);font-size:12px;">QQ: 646335835</span></div>
    </div>`;
  loadMyGroups();
}

async function loadMyGroups(){
  const list=document.getElementById('groups-list'),empty=document.getElementById('groups-empty');
  try{
    const gm=await db().from('group_members').select('group_id').eq('user_id',STATE.user.id);
    if(!gm||gm.length===0){list.innerHTML='';empty.classList.remove('hidden');return;}
    const groups=await db().from('groups_table').select().in('id',gm.map(m=>m.group_id));
    empty.classList.add('hidden');
    list.innerHTML=(groups||[]).map(g=>`
      <div class="group-card">
        <div><div class="group-card-name">${esc(g.name)}</div><div class="group-card-id">邀请码：<strong style="color:var(--primary);">${esc(g.id)}</strong></div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline" style="padding:8px 14px;font-size:13px;" onclick="copyCode('${esc(g.id)}')">复制</button>
          <button class="btn btn-outline" style="padding:8px 14px;font-size:13px;color:var(--danger);" onclick="leaveGroup('${esc(g.id)}')">退出</button></div>
      </div>`).join('');
  }catch(e){list.innerHTML='';empty.classList.remove('hidden');}
}

function copyCode(code){
  try{navigator.clipboard.writeText(code).then(()=>toast('邀请码已复制','success'));}
  catch(e){const i=document.createElement('input');i.value=code;document.body.appendChild(i);i.select();document.execCommand('copy');document.body.removeChild(i);toast('邀请码已复制','success');}
}

async function leaveGroup(gid){
  if(!confirm('确定退出吗？'))return;
  try{await db().from('group_members').eq('group_id',gid).eq('user_id',STATE.user.id).delete();toast('已退出');loadMyGroups();}
  catch(e){toast('操作失败','error');}
}

function showCreateGroup(){
  openModal(`<div class="modal-title">➕ 创建群组</div>
    <div class="form-group"><label class="form-label">群组名称</label><input id="gname" class="input" placeholder="例如：考研冲刺组" maxlength="20"></div>
    <button class="btn btn-primary btn-block btn-lg" onclick="createGroup()">确认创建</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">取消</button>`);
  setTimeout(()=>document.getElementById('gname')?.focus(),300);
}

async function createGroup(){
  const name=document.getElementById('gname').value.trim();
  if(!name)return toast('请输入群组名称','error');
  try{
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do{code=Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('');}
    while(await db().from('groups_table').select('id').eq('id',code).single());
    await db().from('groups_table').insert({id:code,name,created_by:STATE.user.id});
    await db().from('group_members').insert({group_id:code,user_id:STATE.user.id});
    closeModal();loadMyGroups();
    openModal(`<div class="modal-title">✅ 群组创建成功</div>
      <div style="text-align:center;padding:20px 0;">
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:8px;">邀请码</div>
        <div style="font-size:40px;font-weight:800;color:var(--primary);letter-spacing:6px;">${code}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:8px;">把邀请码发给朋友就能加入</div></div>
      <button class="btn btn-primary btn-block btn-lg" onclick="copyCode('${code}');closeModal();">📋 复制邀请码</button>
      <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">关闭</button>`);
  }catch(e){toast('创建失败','error');}
}

function showJoinGroup(){
  openModal(`<div class="modal-title">🔗 加入群组</div>
    <div class="form-group"><label class="form-label">输入邀请码</label>
    <input id="invite" class="input" placeholder="6位邀请码" maxlength="6" style="text-transform:uppercase;letter-spacing:4px;text-align:center;font-size:20px;font-weight:700;"></div>
    <button class="btn btn-primary btn-block btn-lg" onclick="joinGroup()">确认加入</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">取消</button>`);
  setTimeout(()=>document.getElementById('invite')?.focus(),300);
}

async function joinGroup(){
  const code=document.getElementById('invite').value.trim().toUpperCase();
  if(!code)return toast('请输入邀请码','error');
  try{
    const group=await db().from('groups_table').select().eq('id',code).single();
    if(!group)return toast('群组不存在，请检查邀请码','error');
    await db().from('group_members').insert({group_id:code,user_id:STATE.user.id});
    closeModal();loadMyGroups();toast('加入成功！','success');
  }catch(e){toast('加入失败，可能已经在群组中','error');}
}

function showAbout(){
  openModal(`<div class="modal-title">📚 关于学习打卡</div>
    <div style="text-align:center;padding:20px 0;">
      <div style="font-size:48px;margin-bottom:12px;">📚</div>
      <div style="font-size:18px;font-weight:700;">学习打卡 v2.1</div>
      <div style="color:var(--text-muted);margin-top:4px;">云端版 · 随时随地</div>
      <div style="margin-top:20px;font-size:14px;color:var(--text-secondary);line-height:1.8;">
        📌 记录每日学习任务<br>👥 创建群组互相监督<br>📊 查看学习时长统计<br>🕐 全天可打卡
      </div>
      <div style="margin-top:20px;font-size:13px;color:var(--text-muted);">
        如果有更好建议请联系作者<br>QQ: 646335835
      </div></div>
    <button class="btn btn-outline btn-block" onclick="closeModal()">关闭</button>`);
}

// ====== 管理页 ======
async function renderAdmin(){
  if(!STATE.user||!STATE.user.is_admin){window.location.hash='#home';return;}
  document.getElementById('app').innerHTML=`
    <div style="padding:20px 16px 8px;"><h2 style="font-size:22px;font-weight:800;">⚙️ 管理面板</h2></div>
    <div class="section-title">👤 用户管理</div>
    <div id="admin-users" class="history-list"></div>
    <div class="section-title">👥 群组管理</div>
    <div id="admin-groups" class="history-list"></div>`;
  loadAdminData();
}

async function loadAdminData(){
  try{
    const users=await db().from('users').select().order('created_at','desc');
    const groups=await db().from('groups_table').select().order('created_at','desc');
    // 获取每个群组的成员数
    const enriched=await Promise.all((groups||[]).map(async g=>{
      const gm=await db().from('group_members').select('user_id').eq('group_id',g.id);
      return {...g,member_count:(gm||[]).length};
    }));
    document.getElementById('admin-users').innerHTML=(users||[]).map(u=>`
      <div class="history-item" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:600;">${esc(u.name)} <span style="color:var(--text-muted);font-size:12px;">@${esc(u.id)}</span></div>
          <div style="font-size:12px;color:var(--text-muted);">${u.is_admin?'🔧 管理员 · ':''}注册于 ${fmtDate(u.created_at)}</div>
        </div>
        <button class="btn btn-outline" style="padding:6px 14px;font-size:12px;color:var(--danger);" onclick="deleteUser('${esc(u.id)}')">删除</button>
      </div>`).join('');
    document.getElementById('admin-groups').innerHTML=(enriched||[]).map(g=>`
      <div class="history-item" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:600;">${esc(g.name)} <span style="color:var(--primary);font-size:12px;">${esc(g.id)}</span></div>
          <div style="font-size:12px;color:var(--text-muted);">${g.member_count} 名成员 · 创建者: ${esc(g.created_by)}</div>
        </div>
        <button class="btn btn-outline" style="padding:6px 14px;font-size:12px;color:var(--danger);" onclick="deleteGroup('${esc(g.id)}')">删除</button>
      </div>`).join('');
  }catch(e){toast('加载管理数据失败','error');}
}

async function deleteUser(uid){
  if(!confirm(`确定删除用户「${uid}」及其所有学习记录吗？此操作不可恢复。`))return;
  let deleted = [];
  try{
    await db().from('sessions').eq('user_id',uid).delete();
    deleted.push('学习记录');
    await db().from('group_members').eq('user_id',uid).delete();
    deleted.push('群组成员关系');
    await db().from('users').eq('id',uid).delete();
    deleted.push('用户账号');
    toast('用户已删除','success');
    loadAdminData();
  }catch(e){
    const done = deleted.length > 0 ? `（已清理: ${deleted.join('、')}）` : '';
    toast(`删除失败: ${e.message || '未知错误'}${done}`,'error');
    if(deleted.length > 0) loadAdminData();
  }
}

async function deleteGroup(gid){
  if(!confirm(`确定删除群组「${gid}」吗？此操作不可恢复。`))return;
  let deleted = [];
  try{
    await db().from('group_members').eq('group_id',gid).delete();
    deleted.push('成员关系');
    await db().from('groups_table').eq('id',gid).delete();
    deleted.push('群组');
    toast('群组已删除','success');
    loadAdminData();
  }catch(e){
    const done = deleted.length > 0 ? `（已清理: ${deleted.join('、')}）` : '';
    toast(`删除失败: ${e.message || '未知错误'}${done}`,'error');
    if(deleted.length > 0) loadAdminData();
  }
}

/* ================================================================
   Mind Map / Knowledge Network v1.0
   ================================================================ */

// ===== Mind Map State =====
const MMS = {
  parts: [],
  nodes: [],
  allNodes: [],
  links: [],
  currentPartId: '__all__',
  viewMode: 'tree',
  truncateLen: 30,
  svgScale: 1,
  svgPanX: 0,
  svgPanY: 0,
  layoutDirty: true,
  nodePositions: {},
};

function getPartColor(idx) {
  const colors = ['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#f97316'];
  return colors[idx % colors.length];
}

// ===== Mind Map Page Render =====
function renderMindMap() {
  const u = STATE.user;
  document.getElementById('app').innerHTML = `
    <div class="mm-page">
      <div style="padding:14px 16px 4px;">
        <h2 style="font-size:20px;font-weight:800;">🧠 脑图</h2>
      </div>
      <div class="mm-part-bar" id="mm-part-bar">
        <div class="mm-part-chip active" data-pid="__all__" onclick="switchMMPart('__all__')">📋 全部</div>
      </div>
      <div class="mm-controls">
        <div class="mm-toggle" id="mm-toggle">
          <button class="mm-toggle-btn active" data-mode="tree" onclick="setMMView('tree')">🌳 脑图</button>
          <button class="mm-toggle-btn" data-mode="network" onclick="setMMView('network')">🕸️ 知识网络</button>
        </div>
        <div class="mm-slider-wrap">
          <span>省略</span>
          <input type="range" id="mm-slider" min="10" max="80" value="${MMS.truncateLen}" oninput="onMMSlider(this.value)">
          <span id="mm-slider-val">${MMS.truncateLen}字</span>
        </div>
      </div>
      <div class="mm-canvas-wrap" id="mm-canvas-wrap">
        <svg id="mm-svg"></svg>
      </div>
      <div class="mm-input-bar" id="mm-input-bar" style="${MMS.currentPartId==='__all__'?'display:none;':''}">
        <input class="mm-input" id="mm-node-input" placeholder="输入学习内容，按回车添加..." maxlength="500">
        <button class="btn btn-primary" onclick="addMMNode()">添加</button>
      </div>
    </div>`;

  document.getElementById('mm-node-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addMMNode();
  });

  loadMMData();
}

// ===== Data Loading =====
async function loadMMData() {
  try {
    MMS.parts = await db().from('mindmap_parts').select().eq('user_id', STATE.user.id).order('created_at') || [];

    if (MMS.parts.length > 0) {
      const partIds = MMS.parts.map(p => p.id);
      MMS.allNodes = await db().from('mindmap_nodes').select().eq('user_id', STATE.user.id).in('part_id', partIds).order('created_at') || [];
    } else {
      MMS.allNodes = [];
    }

    MMS.links = [];
    if (MMS.allNodes.length > 0) {
      const allLinks = await db().from('mindmap_links').select().eq('user_id', STATE.user.id) || [];
      const nodeIdSet = new Set(MMS.allNodes.map(n => n.id));
      MMS.links = allLinks.filter(l => nodeIdSet.has(l.from_node_id) && nodeIdSet.has(l.to_node_id));
    }

    updateMMPartBar();
    filterMMNodes();
    renderMMCanvas();
  } catch (e) {
    console.log('Load mind map failed:', e);
    const wrap = document.getElementById('mm-canvas-wrap');
    if (wrap) wrap.innerHTML = '<div class="mm-empty-state"><div class="mm-empty-icon">⚠️</div><div class="mm-empty-text">加载失败，请检查网络</div></div>';
  }
}

function updateMMPartBar() {
  const bar = document.getElementById('mm-part-bar');
  if (!bar) return;
  bar.innerHTML = `
    <div class="mm-part-chip ${MMS.currentPartId === '__all__' ? 'active' : ''}" data-pid="__all__" onclick="switchMMPart('__all__')">📋 全部</div>
    ${MMS.parts.map((p, i) => `
      <div class="mm-part-chip ${MMS.currentPartId === p.id ? 'active' : ''}" data-pid="${p.id}" onclick="switchMMPart('${p.id}')" style="border-left:3px solid ${getPartColor(i)};">
        ${esc(p.name)}
        <span class="mm-part-chip-del" onclick="event.stopPropagation();deleteMMPart('${p.id}')" title="删除">✕</span>
      </div>`).join('')}
    <div class="mm-part-chip-add" onclick="createMMPart()" title="创建新Part">+</div>`;
}

function filterMMNodes() {
  MMS.nodes = MMS.currentPartId === '__all__' ? [...MMS.allNodes] : MMS.allNodes.filter(n => n.part_id === MMS.currentPartId);
  MMS.layoutDirty = true;
}

// ===== Part Management =====
function switchMMPart(partId) {
  MMS.currentPartId = partId;
  MMS.svgScale = 1;
  MMS.svgPanX = 0;
  MMS.svgPanY = 0;
  filterMMNodes();
  updateMMPartBar();
  const inputBar = document.getElementById('mm-input-bar');
  if (inputBar) inputBar.style.display = (partId === '__all__') ? 'none' : 'flex';
  renderMMCanvas();
}

async function createMMPart() {
  openModal(`<div class="modal-title">🧠 创建脑图Part</div>
    <div class="form-group"><label class="form-label">Part名称（如：固体物理、机器学习...）</label>
    <input id="mm-part-name" class="input" placeholder="输入Part名称" maxlength="30"></div>
    <button class="btn btn-primary btn-block btn-lg" onclick="confirmCreateMMPart()">确认创建</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">取消</button>`);
  setTimeout(() => document.getElementById('mm-part-name')?.focus(), 300);
}

async function confirmCreateMMPart() {
  const name = document.getElementById('mm-part-name').value.trim();
  if (!name) return toast('请输入Part名称', 'error');
  try {
    const result = await db().from('mindmap_parts').insert({
      user_id: STATE.user.id,
      name: name,
      created_at: new Date().toISOString()
    });
    closeModal();
    toast('Part创建成功！🧠', 'success');
    if (result && result[0]) MMS.currentPartId = result[0].id;
    await loadMMData();
  } catch (e) {
    toast('创建失败: ' + (e.message || '未知错误'), 'error');
  }
}

async function deleteMMPart(partId) {
  const part = MMS.parts.find(p => p.id === partId);
  if (!part) return;
  if (!confirm(`确定删除「${part.name}」及其所有节点吗？此操作不可恢复。`)) return;
  try {
    const nodes = MMS.allNodes.filter(n => n.part_id === partId);
    for (const n of nodes) {
      await db().from('mindmap_links').eq('from_node_id', n.id).delete();
      await db().from('mindmap_links').eq('to_node_id', n.id).delete();
      await db().from('mindmap_nodes').eq('id', n.id).delete();
    }
    await db().from('mindmap_parts').eq('id', partId).delete();
    if (MMS.currentPartId === partId) MMS.currentPartId = '__all__';
    toast('Part已删除', 'success');
    await loadMMData();
  } catch (e) {
    toast('删除失败: ' + (e.message || '未知错误'), 'error');
  }
}

// ===== Node Management =====
async function addMMNode() {
  const input = document.getElementById('mm-node-input');
  if (!input) return;
  const content = input.value.trim();
  if (!content) return toast('请输入内容', 'error');
  const partId = MMS.currentPartId;
  if (!partId || partId === '__all__') return toast('请先选择一个Part', 'error');
  try {
    await db().from('mindmap_nodes').insert({
      part_id: partId,
      user_id: STATE.user.id,
      content: content,
      parent_id: null,
      created_at: new Date().toISOString()
    });
    input.value = '';
    toast('已添加！✨', 'success');
    await loadMMData();
  } catch (e) {
    toast('添加失败: ' + (e.message || '未知错误'), 'error');
  }
}

function onMMNodeClick(nodeId) {
  const node = MMS.allNodes.find(n => n.id === nodeId);
  if (!node) return;
  const part = MMS.parts.find(p => p.id === node.part_id);
  const otherNodes = MMS.allNodes.filter(n => n.id !== nodeId && n.part_id === node.part_id);

  openModal(`<div class="modal-title">📝 节点详情</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
      Part: ${esc(part?.name || '未知')} · ${fmtDate(node.created_at)}
    </div>
    <div class="form-group">
      <label class="form-label">内容</label>
      <textarea id="mm-edit-content" class="input" rows="4">${esc(node.content)}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">父节点（可选，用于构建层级）</label>
      <select id="mm-edit-parent" class="input">
        <option value="">无父节点（顶层）</option>
        ${otherNodes.map(n => `<option value="${n.id}" ${n.id === node.parent_id ? 'selected' : ''}>${esc((n.content || '').slice(0, 25))}${n.content.length>25?'...':''}</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-primary btn-block" onclick="saveMMNode('${node.id}')">💾 保存</button>
    <button class="btn btn-outline btn-block mt-16" style="color:var(--danger);" onclick="deleteMMNode('${node.id}')">🗑️ 删除此节点</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">关闭</button>`);
}

async function saveMMNode(nodeId) {
  const content = document.getElementById('mm-edit-content').value.trim();
  const parentId = document.getElementById('mm-edit-parent').value || null;
  if (!content) return toast('内容不能为空', 'error');
  // Prevent circular reference
  if (parentId === nodeId) return toast('不能将自己设为父节点', 'error');
  try {
    await db().from('mindmap_nodes').eq('id', nodeId).eq('user_id', STATE.user.id).update({
      content: content,
      parent_id: parentId || null
    });
    closeModal();
    toast('已保存！', 'success');
    await loadMMData();
  } catch (e) {
    toast('保存失败: ' + (e.message || '未知错误'), 'error');
  }
}

async function deleteMMNode(nodeId) {
  if (!confirm('确定删除此节点吗？其子节点将变为顶层节点。')) return;
  try {
    // Unlink children
    const children = MMS.allNodes.filter(n => n.parent_id === nodeId);
    for (const child of children) {
      await db().from('mindmap_nodes').eq('id', child.id).update({ parent_id: null });
    }
    await db().from('mindmap_links').eq('from_node_id', nodeId).delete();
    await db().from('mindmap_links').eq('to_node_id', nodeId).delete();
    await db().from('mindmap_nodes').eq('id', nodeId).delete();
    closeModal();
    toast('节点已删除', 'success');
    await loadMMData();
  } catch (e) {
    toast('删除失败: ' + (e.message || '未知错误'), 'error');
  }
}

// ===== View Mode & Slider =====
function setMMView(mode) {
  MMS.viewMode = mode;
  MMS.layoutDirty = true;
  document.querySelectorAll('#mm-toggle .mm-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  renderMMCanvas();
}

function onMMSlider(val) {
  MMS.truncateLen = parseInt(val);
  const label = document.getElementById('mm-slider-val');
  if (label) label.textContent = val + '字';
  renderMMCanvas();
}

// ===== Canvas Rendering =====
function renderMMCanvas() {
  const wrap = document.getElementById('mm-canvas-wrap');
  if (!wrap) return;

  // Empty states
  if (MMS.parts.length === 0) {
    wrap.innerHTML = `<div class="mm-empty-state"><div class="mm-empty-icon">🧠</div><div class="mm-empty-text">还没有脑图Part<br><small>点击上方 + 按钮创建第一个Part</small></div></div>`;
    return;
  }
  if (MMS.nodes.length === 0 && MMS.currentPartId !== '__all__') {
    wrap.innerHTML = `<div class="mm-empty-state"><div class="mm-empty-icon">📝</div><div class="mm-empty-text">这个Part还没有内容<br><small>在下方输入框添加你的第一条学习笔记</small></div></div>`;
    return;
  }
  if (MMS.currentPartId === '__all__' && MMS.nodes.length === 0) {
    wrap.innerHTML = `<div class="mm-empty-state"><div class="mm-empty-icon">📋</div><div class="mm-empty-text">各Part中还没有内容<br><small>选择上方某个Part，开始添加学习笔记吧</small></div></div>`;
    return;
  }

  // Restore SVG element if replaced by empty state
  if (!wrap.querySelector('svg')) {
    wrap.innerHTML = '<svg id="mm-svg"></svg>';
  }
  const svg = wrap.querySelector('svg');
  const W = wrap.clientWidth || 400;
  const H = wrap.clientHeight || 400;

  // Calculate layout
  let positions, edges, bounds, rootNode;
  if (MMS.viewMode === 'tree') {
    const result = calcTreeLayout(MMS.nodes, MMS.currentPartId, MMS.parts);
    positions = result.positions;
    edges = result.edges;
    bounds = result.bounds;
    rootNode = result.rootNode;
  } else {
    const result = calcNetworkLayout(MMS.nodes, MMS.links, MMS.allNodes, MMS.currentPartId, MMS.parts, W, H);
    positions = result.positions;
    edges = result.edges;
    bounds = result.bounds;
    rootNode = null;
  }

  MMS.nodePositions = positions;

  // Cross-part auto connections (in "all" + network mode)
  let crossEdges = [];
  if (MMS.currentPartId === '__all__') {
    crossEdges = detectCrossConnections(MMS.nodes, MMS.parts);
  }

  // ViewBox
  const pad = 60;
  const vbW = Math.max(bounds.maxX - bounds.minX + pad * 2, W);
  const vbH = Math.max(bounds.maxY - bounds.minY + pad * 2, H);
  const vbX = bounds.minX - pad;
  const vbY = bounds.minY - pad;

  // Build SVG content
  let html = '';

  // Regular edges
  for (const e of edges) {
    const fp = positions[e.from], tp = positions[e.to];
    if (!fp || !tp) continue;
    const mx = (fp.x + tp.x) / 2;
    html += `<path d="M${fp.x},${fp.y} C${mx},${fp.y} ${mx},${tp.y} ${tp.x},${tp.y}" fill="none" stroke="var(--border)" stroke-width="1.5" stroke-linecap="round"/>`;
  }

  // Cross-part edges
  for (const e of crossEdges) {
    const fp = positions[e.from], tp = positions[e.to];
    if (!fp || !tp) continue;
    html += `<line x1="${fp.x}" y1="${fp.y}" x2="${tp.x}" y2="${tp.y}" stroke="var(--primary-light)" stroke-width="1" stroke-dasharray="6,3" opacity="0.6"/>`;
  }

  // Root node (part name in tree mode)
  if (rootNode && positions['__root__']) {
    const rp = positions['__root__'];
    const rw = 170, rh = 42;
    html += `<g class="mm-node-group" transform="translate(${rp.x - rw/2}, ${rp.y - rh/2})">
      <rect x="0" y="0" width="${rw}" height="${rh}" rx="12" ry="12" fill="var(--primary-bg)" stroke="var(--primary)" stroke-width="2.5"/>
      <text x="${rw/2}" y="${rh/2 + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--primary)" font-family="inherit">📁 ${esc(rootNode.content)}</text>
    </g>`;
  }

  // Content nodes
  for (const n of MMS.nodes) {
    const pos = positions[n.id];
    if (!pos) continue;

    const partIdx = MMS.parts.findIndex(p => p.id === n.part_id);
    const color = getPartColor(Math.max(partIdx, 0));
    const text = n.content || '';
    const truncated = text.length > MMS.truncateLen ? text.slice(0, MMS.truncateLen) + '...' : text;
    const lines = wrapTextMM(truncated, 14);
    const lineH = 15, nodeW = 150;
    const nodeH = Math.max(34, lines.length * lineH + 18);

    html += `<g class="mm-node-group" transform="translate(${pos.x - nodeW/2}, ${pos.y - nodeH/2})" onclick="onMMNodeClick('${n.id}')">
      <rect x="0" y="0" width="${nodeW}" height="${nodeH}" rx="8" ry="8" fill="var(--card)" stroke="${color}" stroke-width="2"/>
      ${lines.map((l, li) => `<text x="${nodeW/2}" y="${13 + li * lineH}" text-anchor="middle" font-size="11" fill="var(--text)" font-family="inherit">${esc(l)}</text>`).join('')}
    </g>`;
  }

  svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
  svg.innerHTML = html;

  // Setup pan/zoom interaction
  setupMMInteraction(wrap, svg);
}

// ===== Tree Layout Algorithm =====
function calcTreeLayout(nodes, currentPartId, parts) {
  const nodeW = 150, nodeH = 48, hGap = 28, vGap = 70;
  const ROOT = '__root__';
  const nodeMap = {};
  for (const n of nodes) nodeMap[n.id] = n;

  // Build children map
  const children = {};
  for (const n of nodes) {
    const pid = n.parent_id || ROOT;
    (children[pid] = children[pid] || []).push(n);
  }

  // Count leaves in subtree
  function leafCount(nodeId) {
    const kids = children[nodeId] || [];
    if (kids.length === 0) return 1;
    return kids.reduce((s, k) => s + leafCount(k.id), 0);
  }

  const positions = {};
  const edges = [];

  // Recursive placement
  function place(nodeId, left, top, availWidth) {
    const kids = children[nodeId] || [];
    if (kids.length === 0) {
      if (nodeId !== ROOT) positions[nodeId] = { x: left + availWidth / 2, y: top };
      return;
    }

    const totalLeaves = kids.reduce((s, k) => s + leafCount(k.id), 0);
    const totalW = totalLeaves * (nodeW + hGap) - hGap;
    const startX = left + (availWidth - totalW) / 2;

    let cx = startX;
    for (const kid of kids) {
      const kl = leafCount(kid.id);
      const kw = kl * (nodeW + hGap) - hGap;
      const kx = cx + kw / 2;
      const ky = top + nodeH + vGap;
      positions[kid.id] = { x: kx, y: ky };
      if (nodeId !== ROOT) edges.push({ from: nodeId, to: kid.id });
      place(kid.id, cx, ky, kw);
      cx += kw + hGap;
    }
  }

  const rootKids = children[ROOT] || [];
  const totalLeaves = rootKids.reduce((s, k) => s + leafCount(k.id), 0);
  const totalW = Math.max(totalLeaves * (nodeW + hGap) - hGap, 300);
  const rootX = totalW / 2;
  const rootY = 0;

  // Root node
  let rootNode = null;
  if (currentPartId !== '__all__') {
    const part = parts.find(p => p.id === currentPartId);
    rootNode = { id: ROOT, content: part?.name || 'Unnamed' };
    positions[ROOT] = { x: rootX, y: rootY };
    for (const kid of rootKids) {
      edges.push({ from: ROOT, to: kid.id });
    }
  }

  place(ROOT, 0, rootY + nodeH + vGap, totalW);

  // If no root, shift all nodes up
  if (!rootNode) {
    const allY = Object.values(positions).map(p => p.y);
    const minY = allY.length > 0 ? Math.min(...allY) : 0;
    for (const key of Object.keys(positions)) {
      positions[key].y -= minY - 20;
    }
  }

  // Calculate bounds
  const allPos = Object.values(positions);
  const xs = allPos.map(p => p.x), ys = allPos.map(p => p.y);

  return {
    positions,
    edges,
    rootNode,
    bounds: {
      minX: (xs.length > 0 ? Math.min(...xs) : 0) - nodeW,
      minY: (ys.length > 0 ? Math.min(...ys) : 0) - nodeH,
      maxX: (xs.length > 0 ? Math.max(...xs) : totalW) + nodeW,
      maxY: (ys.length > 0 ? Math.max(...ys) : totalW) + nodeH + vGap,
    }
  };
}

// ===== Force-Directed Network Layout =====
function calcNetworkLayout(nodes, links, allNodes, currentPartId, parts, canvasW, canvasH) {
  const nodeW = 150, nodeH = 48;
  const cx = 400, cy = 300;

  // Init positions in a circle
  const positions = {};
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length + 0.08;
    const r = Math.min(canvasW, canvasH, 500) * 0.3;
    // Deterministic jitter based on content hash
    const jx = ((n.content || '').length * 7) % 40 - 20;
    const jy = ((n.content || '').length * 13) % 40 - 20;
    positions[n.id] = {
      x: cx + Math.cos(angle) * r + jx,
      y: cy + Math.sin(angle) * r + jy,
    };
  });

  // Build edges: parent-child + explicit links
  const edgeList = [];
  const seenE = new Set();
  for (const n of nodes) {
    if (n.parent_id && positions[n.parent_id]) {
      const k = n.parent_id + '->' + n.id;
      if (!seenE.has(k)) { seenE.add(k); edgeList.push({ from: n.parent_id, to: n.id }); }
    }
  }
  for (const l of links) {
    if (positions[l.from_node_id] && positions[l.to_node_id]) {
      const k = l.from_node_id + '->' + l.to_node_id;
      if (!seenE.has(k)) { seenE.add(k); edgeList.push({ from: l.from_node_id, to: l.to_node_id }); }
    }
  }

  // Force simulation
  const ids = nodes.map(n => n.id);
  for (let iter = 0; iter < 50; iter++) {
    // Repulsion
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        const dx = positions[a].x - positions[b].x;
        const dy = positions[a].y - positions[b].y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = 5000 / (d * d);
        positions[a].x += (dx / d) * f;
        positions[a].y += (dy / d) * f;
        positions[b].x -= (dx / d) * f;
        positions[b].y -= (dy / d) * f;
      }
    }
    // Attraction
    for (const e of edgeList) {
      const a = e.from, b = e.to;
      if (!positions[a] || !positions[b]) continue;
      const dx = positions[b].x - positions[a].x;
      const dy = positions[b].y - positions[a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = d * 0.025;
      positions[a].x += (dx / d) * f;
      positions[a].y += (dy / d) * f;
      positions[b].x -= (dx / d) * f;
      positions[b].y -= (dy / d) * f;
    }
    // Center gravity
    for (const id of ids) {
      positions[id].x += (cx - positions[id].x) * 0.015;
      positions[id].y += (cy - positions[id].y) * 0.015;
    }
    // Clamp
    for (const id of ids) {
      positions[id].x = Math.max(60, Math.min(cx * 2 - 60, positions[id].x));
      positions[id].y = Math.max(30, Math.min(cy * 2 - 30, positions[id].y));
    }
  }

  const allPos = Object.values(positions);
  const xs = allPos.map(p => p.x), ys = allPos.map(p => p.y);

  return {
    positions,
    edges: edgeList,
    bounds: {
      minX: Math.min(...xs, 0) - nodeW,
      minY: Math.min(...ys, 0) - nodeH,
      maxX: Math.max(...xs, cx * 2) + nodeW,
      maxY: Math.max(...ys, cy * 2) + nodeH,
    }
  };
}

// ===== Auto Cross-Part Connection Detection =====
function detectCrossConnections(nodes, parts) {
  if (nodes.length < 2) return [];

  // Extract keywords per node
  const nodeKW = {};
  for (const n of nodes) {
    nodeKW[n.id] = extractKeywordsMM(n.content || '');
  }

  const crossEdges = [];
  const seen = new Set();

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.part_id === b.part_id) continue; // same part, skip
      const common = nodeKW[a.id].filter(kw => kw.length >= 2 && nodeKW[b.id].includes(kw));
      if (common.length >= 2) {
        const key = [a.id, b.id].sort().join('--');
        if (!seen.has(key)) {
          seen.add(key);
          crossEdges.push({ from: a.id, to: b.id, keywords: common });
        }
      }
    }
  }

  return crossEdges;
}

function extractKeywordsMM(text) {
  const result = new Set();
  // Split by delimiters
  const words = text.split(/[,，。、.、\s\n【】《》\(\)（）：:;；!！?？+=-]+/).filter(w => w.length >= 2);
  words.forEach(w => result.add(w));
  // Chinese bigrams
  for (let i = 0; i < text.length - 1; i++) {
    if (/[一-鿿]/.test(text[i]) && /[一-鿿]/.test(text[i + 1])) {
      result.add(text[i] + text[i + 1]);
    }
  }
  return [...result];
}

// ===== SVG Text Wrapping =====
function wrapTextMM(text, charsPerLine) {
  const lines = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    cur += text[i];
    if (cur.length >= charsPerLine) { lines.push(cur); cur = ''; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

// ===== Pan & Zoom Interaction =====
function setupMMInteraction(wrap, svg) {
  // Remove old listeners by cloning
  const newWrap = wrap.cloneNode(true);
  wrap.parentNode.replaceChild(newWrap, wrap);
  // Re-acquire svg reference since it was cloned
  const newSvg = newWrap.querySelector('svg');

  let isPanning = false;
  let startX = 0, startY = 0;
  let startPanX = 0, startPanY = 0;

  newWrap.addEventListener('mousedown', e => {
    if (e.target.closest('.mm-node-group')) return;
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    startPanX = MMS.svgPanX;
    startPanY = MMS.svgPanY;
    newWrap.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!isPanning) return;
    MMS.svgPanX = startPanX + (e.clientX - startX);
    MMS.svgPanY = startPanY + (e.clientY - startY);
    const g = (document.getElementById('mm-svg') || newSvg)?.querySelector('g, svg');
    // Use viewBox shift by adjusting the SVG's viewBox
    updateMMPanZoom();
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      const w = document.getElementById('mm-canvas-wrap');
      if (w) w.style.cursor = 'grab';
    }
  });

  newWrap.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    MMS.svgScale = Math.max(0.3, Math.min(3, MMS.svgScale * delta));
    updateMMPanZoom();
  }, { passive: false });

  // Touch support
  newWrap.addEventListener('touchstart', e => {
    if (e.touches.length === 1 && !e.target.closest('.mm-node-group')) {
      isPanning = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startPanX = MMS.svgPanX;
      startPanY = MMS.svgPanY;
    }
  }, { passive: false });

  newWrap.addEventListener('touchmove', e => {
    if (!isPanning || e.touches.length !== 1) return;
    MMS.svgPanX = startPanX + (e.touches[0].clientX - startX);
    MMS.svgPanY = startPanY + (e.touches[0].clientY - startY);
    updateMMPanZoom();
    e.preventDefault();
  }, { passive: false });

  newWrap.addEventListener('touchend', () => { isPanning = false; });
}

function updateMMPanZoom() {
  const svg = document.getElementById('mm-svg');
  if (!svg) return;
  // Apply pan/zoom by adjusting viewBox
  const vb = svg.getAttribute('viewBox');
  if (!vb) return;
  const parts = vb.split(' ').map(Number);
  if (parts.length < 4) return;

  const scale = MMS.svgScale;
  const w = parts[2] / scale;
  const h = parts[3] / scale;
  const x = parts[0] - MMS.svgPanX / scale;
  const y = parts[1] - MMS.svgPanY / scale;

  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
}

// ===== 启动！=====
init();
