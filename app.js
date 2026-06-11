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

  document.getElementById('tabbar').classList.toggle('hidden',hash!=='home'&&hash!=='profile'&&hash!=='groups'&&hash!=='admin');
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden', !(STATE.user&&STATE.user.is_admin)));

  switch(hash){
    case'login':renderLogin();break;
    case'home':renderHome();setTab('home');break;
    case'profile':renderProfile();setTab('profile');break;
    case'groups':renderGroups();setTab('groups');break;
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

// ===== 启动！=====
init();
