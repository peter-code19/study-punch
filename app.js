/* ================================================================
   学习打卡 PWA — 使用 Supabase 云端数据库
   ================================================================ */

// Supabase 配置
const SUPABASE_URL = 'https://icxyuscrfsnjlexeejtp.supabase.com';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljeHl1c2NyZnNuamxleGVlanRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjAyOTQsImV4cCI6MjA5NjczNjI5NH0.2tbJGgLShQXEdu644kINqpRYtuHC_xhnMX34asJQgo4';

const supabase = window.supabase(SUPABASE_URL, SUPABASE_KEY);

// ===== 全局状态 =====
const STATE = {
  user: null,           // 当前登录用户
  activeSession: null,  // 进行中的学习任务
  currentGroup: '__all__',
  currentGroupName: '全部成员',
  currentStatTab: 'daily',
  historyPage: 1,
  pollTimer: null,
  timerInterval: null,
};

// ===== 工具函数 =====
function esc(s) { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }
function pad(n) { return String(n).padStart(2,'0'); }

function formatDuration(sec) {
  if (!sec || sec <= 0) return '0 分钟';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
}
function formatTimer(sec) {
  return `${pad(Math.floor(sec/3600))}:${pad(Math.floor((sec%3600)/60))}:${pad(sec%60)}`;
}
function formatTime(iso) {
  if (!iso) return ''; const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDate(iso) {
  if (!iso) return ''; const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}
function hslToHex(hsl) {
  const m = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!m) return hsl;
  const h = +m[1]/360, s = +m[2]/100, l = +m[3]/100;
  const hue = (p,q,t) => { if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p; };
  const q = l<0.5?l*(1+s):l+s-l*s, p = 2*l-q;
  const toH = x => Math.round(x*255).toString(16).padStart(2,'0');
  return '#'+toH(hue(p,q,h+1/3))+toH(hue(p,q,h))+toH(hue(p,q,h-1/3));
}
function getInitial(name) {
  if (!name) return '?';
  const c = name.trim().charAt(0);
  return /[一-鿿]/.test(c) ? c : c.toUpperCase();
}
function isWeekend(d) { const day = (d||new Date()).getDay(); return day===0||day===6; }
function isInStudyWindow() { const h = new Date().getHours(); return h>=10 && h<22; }
function getStudyWindowStatus() {
  const now = new Date(), h = now.getHours(), m = now.getMinutes();
  const type = isWeekend(now) ? '节假日' : '工作日';
  if (h>=10 && h<22) {
    const rm = (21-h)*60 + (59-m);
    return {text:`${type} · 学习时间窗口中 · 剩余 ${Math.floor(rm/60)}时${rm%60}分`, cls:'ok'};
  } else if (h<10) {
    const wm = (9-h)*60 + (59-m);
    return {text:`${type} · 距学习窗口开启还有 ${Math.floor(wm/60)}时${wm%60}分`, cls:'waiting'};
  }
  return {text:`${type} · 今日学习窗口已结束 (10:00-22:00)`, cls:'closed'};
}
function getTodayLabel() {
  const n = new Date(), w = ['日','一','二','三','四','五','六'];
  return `${n.getMonth()+1}月${n.getDate()}日 星期${w[n.getDay()]} · ${isWeekend(n)?'节假日':'工作日'}`;
}

// ===== Toast =====
let toastT = null;
function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast '+(type||'');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2500);
}

// ===== 弹窗 =====
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  STATE._modalClosing = true;
  setTimeout(() => STATE._modalClosing = false, 500);
}
function handleOverlayClick(e) {
  if (e.target.id === 'modal-overlay' && !STATE._modalClosing) closeModal();
}

// ===== Tab 导航 =====
function setTab(t) {
  document.querySelectorAll('.tab-item').forEach(el => el.classList.toggle('active', el.dataset.tab===t));
}

// ===== 加载状态 =====
function setLoading(el, loading) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) el.disabled = loading;
}

// ====== 初始化 =====
async function init() {
  // 检查本地存储的用户
  const uid = localStorage.getItem('study_user_id');
  if (uid) {
    const { data } = await supabase.from('users').select('*').eq('id', uid).single();
    if (data) {
      STATE.user = data;
      const { data: active } = await supabase.from('sessions').select('*').eq('user_id', uid).is('end_time', null).order('start_time', { ascending: false }).limit(1).single();
      STATE.activeSession = active;
    } else {
      localStorage.removeItem('study_user_id');
    }
  }
  route();
  window.addEventListener('hashchange', route);
}

// ===== 路由 =====
function route() {
  stopPoll(); stopTimer();
  const hash = window.location.hash.slice(1) || 'login';
  if (!STATE.user && hash !== 'login') { window.location.hash = '#login'; return; }
  if (STATE.user && hash === 'login') { window.location.hash = '#home'; return; }

  document.getElementById('tabbar').classList.toggle('hidden', hash !== 'home' && hash !== 'profile' && hash !== 'groups');

  switch (hash) {
    case 'login': renderLogin(); break;
    case 'home': renderHome(); setTab('home'); break;
    case 'profile': renderProfile(); setTab('profile'); break;
    case 'groups': renderGroups(); setTab('groups'); break;
    default: window.location.hash = '#home';
  }
}

// ====== 登录页 ======
function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-page">
      <div class="login-logo">📚</div>
      <h1 class="login-title">学习打卡</h1>
      <p class="login-subtitle">和朋友们一起坚持学习</p>
      <div class="login-form">
        <div class="form-group">
          <label class="form-label">设置你的 ID</label>
          <input id="login-id" class="input" placeholder="例如: alex、小明" maxlength="20" autocomplete="off">
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">首次使用自动注册，请牢记你的 ID</div>
        </div>
        <div class="form-group">
          <label class="form-label">显示名称（可选）</label>
          <input id="login-name" class="input" placeholder="让大家认识你" maxlength="15">
        </div>
        <button id="login-btn" class="btn btn-primary btn-block btn-lg" onclick="doLogin()">进入打卡</button>
      </div>
    </div>`;
  document.getElementById('login-id').focus();
  ['login-id','login-name'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  });
}

async function doLogin() {
  const id = document.getElementById('login-id').value.trim();
  const name = document.getElementById('login-name').value.trim() || id;
  if (!id) return toast('请输入 ID', 'error');

  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = '进入中...';

  // 查找或创建用户
  let { data: user } = await supabase.from('users').select('*').eq('id', id).single();
  if (!user) {
    const hue = Math.floor(Math.random() * 360);
    const { data: created, error } = await supabase.from('users').insert({
      id, name, color: `hsl(${hue}, 55%, 50%)`
    }).select().single();
    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = '进入打卡'; return; }
    user = created;
    toast('注册成功！欢迎加入 🎉', 'success');
  }

  localStorage.setItem('study_user_id', user.id);
  STATE.user = user;
  window.location.hash = '#home';
}

// ====== 首页 ======
function renderHome() {
  const u = STATE.user;
  document.getElementById('app').innerHTML = `
    <div class="home-header">
      <div class="avatar avatar-lg" style="background:${hslToHex(u.color)}">${getInitial(u.name)}</div>
      <div class="home-header-info">
        <div class="home-header-name">${esc(u.name)}</div>
        <div class="home-header-id">@${esc(u.id)}</div>
      </div>
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

    <div class="section-title">👥 学习伙伴</div>
    <div id="group-selector" class="group-selector"></div>
    <div id="member-grid" class="member-grid"></div>
    <div id="member-empty" class="empty-state hidden"><div class="empty-icon">🤝</div><div class="empty-text">还没有群组，去创建一个吧</div><button class="btn btn-primary mt-16" onclick="window.location.hash='#groups'">去创建群组</button></div>`;

  updateWindowBanner();
  updatePunchUI();
  loadGroupsAndMembers();
  startPoll();
}

function startPoll() {
  stopPoll();
  STATE.pollTimer = setInterval(() => { updateWindowBanner(); loadMembers(); }, 30000);
}
function stopPoll() { if (STATE.pollTimer) { clearInterval(STATE.pollTimer); STATE.pollTimer = null; } }
function stopTimer() { if (STATE.timerInterval) { clearInterval(STATE.timerInterval); STATE.timerInterval = null; } }

// 学习窗口
function updateWindowBanner() {
  const b = document.getElementById('study-window-banner');
  if (!b) return;
  const s = getStudyWindowStatus();
  const colors = { ok: ['#f0fdf4','#166534','🟢'], waiting: ['#fefce8','#854d0e','🟡'], closed: ['#fef2f2','#991b1b','🔴'] };
  const c = colors[s.cls] || ['#f8fafc','#475569','📅'];
  b.style.background = c[0]; b.style.color = c[1];
  b.innerHTML = `<div style="display:flex;align-items:center;gap:8px;"><span>${c[2]}</span><span style="font-size:13px;font-weight:600;">${getTodayLabel()}</span></div><div style="font-size:12px;margin-top:4px;">${s.text}</div><div style="font-size:11px;margin-top:2px;opacity:0.7;">规定学习时间：每天 10:00 - 22:00（含节假日）</div>`;
}

// 打卡按钮
function updatePunchUI() {
  const btn = document.getElementById('punch-btn');
  const timerEl = document.getElementById('punch-timer');
  const contentEl = document.getElementById('punch-content-display');
  const cancelEl = document.getElementById('punch-cancel');
  const hintEl = document.getElementById('punch-hint');
  if (!btn) return;

  const active = STATE.activeSession;
  if (active) {
    btn.textContent = '✋ 结束学习';
    btn.className = 'btn btn-danger btn-xl btn-block';
    timerEl.classList.remove('hidden');
    contentEl.classList.remove('hidden');
    contentEl.textContent = '📝 ' + (active.content || '学习中...');
    cancelEl.classList.remove('hidden');
    hintEl.textContent = '';
    stopTimer();
    const st = new Date(active.start_time);
    const tick = () => { timerEl.textContent = formatTimer(Math.floor((new Date()-st)/1000)); };
    tick(); STATE.timerInterval = setInterval(tick, 1000);
  } else {
    btn.textContent = '📖 开始学习';
    btn.className = 'btn btn-success btn-xl btn-block';
    timerEl.classList.add('hidden');
    contentEl.classList.add('hidden');
    cancelEl.classList.add('hidden');
    hintEl.textContent = isInStudyWindow() ? '点击开始，记录你的学习时光' : '💡 ' + getStudyWindowStatus().text + '，也可以提前开始';
  }
}

function handlePunch() {
  if (STATE.activeSession) { showEndModal(); } else { showStartModal(); }
}

function showStartModal() {
  openModal(`
    <div class="modal-title">📖 开始学习</div>
    <div class="form-group"><label class="form-label">本次学习内容</label>
    <textarea id="modal-content-input" class="input" placeholder="例如：复习高等数学第三章..." rows="3"></textarea></div>
    <button class="btn btn-success btn-block btn-lg" onclick="confirmStart()">确认开始</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">取消</button>`);
  setTimeout(() => document.getElementById('modal-content-input')?.focus(), 300);
}

async function confirmStart() {
  const content = document.getElementById('modal-content-input').value.trim();
  if (!content) return toast('请输入学习内容', 'error');
  const { data, error } = await supabase.from('sessions').insert({
    user_id: STATE.user.id, start_time: new Date().toISOString(), content
  }).select().single();
  if (error) return toast(error.message, 'error');
  STATE.activeSession = data;
  closeModal();
  toast('开始学习！加油 💪', 'success');
  updatePunchUI(); loadMembers();
}

function showEndModal() {
  const a = STATE.activeSession;
  const elapsed = Math.floor((new Date() - new Date(a.start_time)) / 1000);
  openModal(`
    <div class="modal-title">✅ 结束学习</div>
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:36px;font-weight:800;color:var(--primary);">${formatTimer(elapsed)}</div>
      <div style="color:var(--text-muted);font-size:14px;">本次学习时长：${formatDuration(elapsed)}</div>
    </div>
    <div class="form-group"><label class="form-label">确认/修改学习内容</label>
    <textarea id="modal-content-input" class="input" rows="3">${esc(a.content||'')}</textarea></div>
    <button class="btn btn-primary btn-block btn-lg" onclick="confirmEnd(${a.id})">确认结束</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">继续学习</button>`);
}

async function confirmEnd(id) {
  const content = document.getElementById('modal-content-input').value.trim();
  const endTime = new Date().toISOString();
  const st = new Date(STATE.activeSession.start_time);
  const dur = Math.floor((new Date(endTime) - st) / 1000);

  const { error } = await supabase.from('sessions').update({
    end_time: endTime, content: content || STATE.activeSession.content, duration_sec: dur
  }).eq('id', id);

  if (error) return toast(error.message, 'error');
  STATE.activeSession = null;
  closeModal(); stopTimer();
  toast('学习打卡完成！🎉', 'success');
  updatePunchUI(); loadMembers();
}

async function cancelPunch() {
  if (!confirm('确定要取消吗？不会保存记录。')) return;
  await supabase.from('sessions').delete().eq('id', STATE.activeSession.id);
  STATE.activeSession = null;
  stopTimer(); updatePunchUI(); loadMembers(); toast('已取消');
}

// 群组 & 成员
async function loadGroupsAndMembers() {
  const sel = document.getElementById('group-selector');
  const { data: groups } = await supabase.from('groups_table').select('*');
  // 通过 group_members 找到用户加入的群组
  const { data: memberships } = await supabase.from('group_members').select('group_id').eq('user_id', STATE.user.id);
  const myGroupIds = new Set((memberships||[]).map(m => m.group_id));
  const myGroups = (groups||[]).filter(g => myGroupIds.has(g.id));

  if (sel) sel.innerHTML = [
    `<div class="group-chip ${STATE.currentGroup==='__all__'?'active':''}" onclick="switchGroup('__all__','全部成员')">全部成员</div>`,
    ...myGroups.map(g => `<div class="group-chip ${STATE.currentGroup===g.id?'active':''}" onclick="switchGroup('${g.id}','${esc(g.name)}')">${esc(g.name)}</div>`)
  ].join('');

  loadMembers();
}

function switchGroup(id, name) {
  STATE.currentGroup = id; STATE.currentGroupName = name;
  document.querySelectorAll('.group-chip').forEach(c => c.classList.remove('active'));
  document.querySelector(`[onclick*="${id}"]`)?.classList.add('active');
  loadMembers();
}

async function loadMembers() {
  const grid = document.getElementById('member-grid');
  const empty = document.getElementById('member-empty');
  if (!grid) return;

  let members = [];
  if (STATE.currentGroup === '__all__') {
    const { data } = await supabase.from('users').select('*').neq('id', STATE.user.id);
    members = data || [];
  } else {
    const { data: gm } = await supabase.from('group_members').select('user_id').eq('group_id', STATE.currentGroup);
    if (gm && gm.length > 0) {
      const { data: users } = await supabase.from('users').select('*').in('id', gm.map(m => m.user_id));
      members = users || [];
    }
  }

  if (members.length === 0) { grid.innerHTML = ''; empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  // 批量获取每个成员的状态
  const today = new Date().toISOString().slice(0,10);
  const enriched = await Promise.all(members.map(async m => {
    const { data: active } = await supabase.from('sessions').select('*').eq('user_id', m.id).is('end_time', null).limit(1).single();
    const { data: stats } = await supabase.from('sessions').select('duration_sec').eq('user_id', m.id).gte('start_time', today).not('end_time', 'is', null);
    const totalSec = (stats||[]).reduce((s, r) => s + (r.duration_sec||0), 0);
    return { ...m, is_online: !!active, online_since: active?.start_time, total_sec: totalSec, session_count: (stats||[]).length };
  }));

  grid.innerHTML = enriched.map(m => `
    <div class="member-item" onclick="showMemberDetail('${esc(m.id)}')">
      <div class="avatar-wrapper">
        <div class="avatar avatar-sm" style="background:${hslToHex(m.color)}">${getInitial(m.name)}</div>
        <span class="status-dot ${m.is_online?'online':'offline'}"></span>
      </div>
      <div class="member-name">${esc(m.name)}</div>
      <div class="member-status">${m.is_online ? '学习中 '+formatTime(m.online_since) : m.total_sec>0 ? '今日 '+formatDuration(m.total_sec) : '未打卡'}</div>
    </div>`).join('');
}

async function showMemberDetail(uid) {
  openModal('<div style="text-align:center;padding:20px;">加载中...</div>');
  const today = new Date().toISOString().slice(0,10);

  const { data: user } = await supabase.from('users').select('*').eq('id', uid).single();
  const { data: active } = await supabase.from('sessions').select('*').eq('user_id', uid).is('end_time', null).limit(1).single();
  const { data: sessions } = await supabase.from('sessions').select('*').eq('user_id', uid).gte('start_time', today).order('start_time', { ascending: false });
  const totalSec = (sessions||[]).filter(s => s.end_time).reduce((s, r) => s + (r.duration_sec||0), 0);

  const n = user?.name || uid, c = user?.color || 'hsl(200,55%,50%)';
  openModal(`
    <div class="modal-title" style="position:relative;">学习详情
      <button class="btn" onclick="closeModal()" style="position:absolute;right:0;top:-8px;font-size:18px;">✕</button>
    </div>
    <div class="member-detail-header">
      <div class="avatar avatar-lg" style="background:${hslToHex(c)}">${getInitial(n)}</div>
      <div class="member-detail-info">
        <div class="member-detail-name">${esc(n)}</div>
        <div class="member-detail-status" style="color:${active?'var(--success)':'var(--text-muted)'}">
          ${active ? '🟢 学习中 · 开始于 '+formatTime(active.start_time) : '⚪ 当前离线'}
        </div>
      </div>
    </div>
    <div class="member-detail-section"><h4>📊 今日统计</h4>
      <div style="display:flex;gap:16px;">
        <div style="flex:1;background:var(--primary-bg);border-radius:var(--radius-sm);padding:14px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:var(--primary);">${formatDuration(totalSec)}</div>
          <div style="font-size:12px;color:var(--text-muted);">总学习时长</div></div>
        <div style="flex:1;background:var(--primary-bg);border-radius:var(--radius-sm);padding:14px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:var(--primary);">${(sessions||[]).length}</div>
          <div style="font-size:12px;color:var(--text-muted);">今日任务数</div></div>
      </div></div>
    <div class="member-detail-section"><h4>📝 今日学习记录</h4>
      ${(sessions||[]).length > 0 ? sessions.map(s => `
        <div class="history-item">
          <div class="history-item-header">
            <span class="history-date">${formatTime(s.start_time)} - ${s.end_time?formatTime(s.end_time):'进行中'}</span>
            <span class="history-duration">${s.duration_sec?formatDuration(s.duration_sec):'进行中'}</span></div>
          ${s.content?`<div class="history-content">${esc(s.content)}</div>`:''}
        </div>`).join('') : '<div style="text-align:center;color:var(--text-muted);padding:20px;">今天还没有学习记录</div>'}
    </div>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">关闭</button>`);
}

async function doLogout() {
  stopPoll(); stopTimer();
  localStorage.removeItem('study_user_id');
  STATE.user = null; STATE.activeSession = null;
  window.location.hash = '#login';
}

// ====== 统计页 ======
function renderProfile() {
  document.getElementById('app').innerHTML = `
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
  loadAllStats(); loadHistoryList();
}

async function loadAllStats() {
  const uid = STATE.user.id;
  const today = new Date().toISOString().slice(0,10);
  // 本周一
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay()+6)%7));
  const mondayStr = monday.toISOString().slice(0,10);
  // 本月1号
  const monthStart = `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`;

  const queries = [
    supabase.from('sessions').select('duration_sec').eq('user_id', uid).gte('start_time', today).not('end_time','is',null),
    supabase.from('sessions').select('duration_sec').eq('user_id', uid).gte('start_time', mondayStr).not('end_time','is',null),
    supabase.from('sessions').select('duration_sec').eq('user_id', uid).gte('start_time', monthStart).not('end_time','is',null),
    supabase.from('sessions').select('duration_sec').eq('user_id', uid).not('end_time','is',null),
  ];
  const results = await Promise.all(queries);
  const stats = results.map(r => {
    const total = (r.data||[]).reduce((s,x)=>s+(x.duration_sec||0),0);
    return [total, (r.data||[]).length];
  });
  ['daily','weekly','monthly','all'].forEach((k,i) => {
    document.getElementById(`val-${k}`).textContent = formatDuration(stats[i][0]);
    document.getElementById(`detail-${k}`).textContent = `${stats[i][1]} 次学习`;
  });
}

function switchStat(tab) {
  STATE.currentStatTab = tab; STATE.historyPage = 1;
  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  document.getElementById('history-title').textContent = {daily:'今日记录',weekly:'本周记录',monthly:'本月记录',all:'全部记录'}[tab]||'';
  loadHistoryList();
}

async function loadHistoryList(append) {
  const list = document.getElementById('history-list');
  const lm = document.getElementById('load-more');
  if (!append) list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">加载中...</div>';

  const uid = STATE.user.id, tab = STATE.currentStatTab;
  if (tab === 'daily') {
    const today = new Date().toISOString().slice(0,10);
    const { data } = await supabase.from('sessions').select('*').eq('user_id', uid).gte('start_time', today).order('start_time', { ascending: false });
    renderHistoryItems(data||[], list, append);
    lm.classList.add('hidden');
  } else if (tab === 'all') {
    const from = (STATE.historyPage-1)*20, to = STATE.historyPage*20-1;
    const { data } = await supabase.from('sessions').select('*').eq('user_id', uid).not('end_time','is',null).order('start_time', { ascending: false }).range(from, to);
    renderHistoryItems(data||[], list, append);
    lm.classList.toggle('hidden', (data||[]).length < 20);
  } else {
    let startDate;
    if (tab === 'weekly') {
      const d = new Date(); d.setDate(d.getDate() - ((d.getDay()+6)%7));
      startDate = d.toISOString().slice(0,10);
    } else {
      startDate = `${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}-01`;
    }
    const { data } = await supabase.from('sessions').select('start_time, duration_sec').eq('user_id', uid).gte('start_time', startDate).not('end_time','is',null).order('start_time', { ascending: false });
    // 按日期分组
    const groups = {};
    (data||[]).forEach(s => {
      const day = s.start_time.slice(0,10);
      if (!groups[day]) groups[day] = { total: 0, count: 0 };
      groups[day].total += (s.duration_sec||0);
      groups[day].count++;
    });
    if (!append) list.innerHTML = '';
    if (Object.keys(groups).length === 0 && !append) list.innerHTML = '<div class="empty-state"><div class="empty-text">暂无记录</div></div>';
    else list.innerHTML = Object.entries(groups).map(([day, d]) => `
      <div class="history-item" style="border-left:3px solid var(--primary);">
        <div class="history-item-header"><span class="history-date">${formatDate(day)}</span><span class="history-duration">${formatDuration(d.total)}</span></div>
        <div style="font-size:12px;color:var(--text-muted);">${d.count} 次学习</div>
      </div>`).join('');
    lm.classList.add('hidden');
  }
}

function renderHistoryItems(data, list, append) {
  if (!append) list.innerHTML = '';
  if (data.length === 0 && !append) { list.innerHTML = '<div class="empty-state"><div class="empty-text">暂无记录</div></div>'; return; }
  list.innerHTML += data.map(s => `
    <div class="history-item">
      <div class="history-item-header"><span class="history-date">${formatTime(s.start_time)} - ${s.end_time?formatTime(s.end_time):'进行中'}</span><span class="history-duration">${s.duration_sec?formatDuration(s.duration_sec):'进行中'}</span></div>
      ${s.content?`<div class="history-content">${esc(s.content)}</div>`:''}
    </div>`).join('');
}

async function loadMore() { STATE.historyPage++; await loadHistoryList(true); }

// ====== 群组页 ======
function renderGroups() {
  document.getElementById('app').innerHTML = `
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
      <div class="setting-item"><span>学习时间规定</span><span style="color:var(--text-muted);font-size:13px;">工作日及节假日 10:00 - 22:00</span></div>
      <div class="setting-item" style="cursor:pointer;" onclick="showAbout()"><span>关于学习打卡</span><span>📚</span></div>
    </div>`;
  loadMyGroups();
}

async function loadMyGroups() {
  const list = document.getElementById('groups-list'), empty = document.getElementById('groups-empty');
  const { data: gm } = await supabase.from('group_members').select('group_id').eq('user_id', STATE.user.id);
  if (!gm || gm.length === 0) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  const { data: groups } = await supabase.from('groups_table').select('*').in('id', gm.map(m => m.group_id));
  empty.classList.add('hidden');
  list.innerHTML = (groups||[]).map(g => `
    <div class="group-card">
      <div><div class="group-card-name">${esc(g.name)}</div><div class="group-card-id">邀请码：<strong style="color:var(--primary);">${esc(g.id)}</strong></div></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline" style="padding:8px 14px;font-size:13px;" onclick="copyCode('${esc(g.id)}')">复制</button>
        <button class="btn btn-outline" style="padding:8px 14px;font-size:13px;color:var(--danger);" onclick="leaveGroup('${esc(g.id)}')">退出</button></div>
    </div>`).join('');
}

function copyCode(code) {
  navigator.clipboard?.writeText(code).then(() => toast('邀请码已复制', 'success'))
  || (() => { const i=document.createElement('input');i.value=code;document.body.appendChild(i);i.select();document.execCommand('copy');document.body.removeChild(i);toast('邀请码已复制','success'); })();
}

async function leaveGroup(gid) {
  if (!confirm('确定退出吗？')) return;
  await supabase.from('group_members').delete().eq('group_id', gid).eq('user_id', STATE.user.id);
  toast('已退出'); loadMyGroups();
}

function showCreateGroup() {
  openModal(`<div class="modal-title">➕ 创建群组</div>
    <div class="form-group"><label class="form-label">群组名称</label><input id="gname" class="input" placeholder="例如：考研冲刺组" maxlength="20"></div>
    <button class="btn btn-primary btn-block btn-lg" onclick="createGroup()">确认创建</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">取消</button>`);
  setTimeout(() => document.getElementById('gname')?.focus(), 300);
}

async function createGroup() {
  const name = document.getElementById('gname').value.trim();
  if (!name) return toast('请输入群组名称', 'error');
  // 生成唯一邀请码
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); }
  while ((await supabase.from('groups_table').select('id').eq('id', code).single()).data);
  await supabase.from('groups_table').insert({ id: code, name, created_by: STATE.user.id });
  await supabase.from('group_members').insert({ group_id: code, user_id: STATE.user.id });
  closeModal(); loadMyGroups();
  openModal(`<div class="modal-title">✅ 群组创建成功</div>
    <div style="text-align:center;padding:20px 0;">
      <div style="font-size:14px;color:var(--text-muted);margin-bottom:8px;">邀请码</div>
      <div style="font-size:40px;font-weight:800;color:var(--primary);letter-spacing:6px;">${code}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:8px;">把邀请码发给朋友就能加入</div></div>
    <button class="btn btn-primary btn-block btn-lg" onclick="copyCode('${code}');closeModal();">📋 复制邀请码</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">关闭</button>`);
}

function showJoinGroup() {
  openModal(`<div class="modal-title">🔗 加入群组</div>
    <div class="form-group"><label class="form-label">输入邀请码</label>
    <input id="invite" class="input" placeholder="6位邀请码" maxlength="6" style="text-transform:uppercase;letter-spacing:4px;text-align:center;font-size:20px;font-weight:700;"></div>
    <button class="btn btn-primary btn-block btn-lg" onclick="joinGroup()">确认加入</button>
    <button class="btn btn-outline btn-block mt-16" onclick="closeModal()">取消</button>`);
  setTimeout(() => document.getElementById('invite')?.focus(), 300);
}

async function joinGroup() {
  const code = document.getElementById('invite').value.trim().toUpperCase();
  if (!code) return toast('请输入邀请码', 'error');
  const { data: group } = await supabase.from('groups_table').select('*').eq('id', code).single();
  if (!group) return toast('群组不存在', 'error');
  await supabase.from('group_members').upsert({ group_id: code, user_id: STATE.user.id }, { onConflict: 'group_id,user_id' });
  closeModal(); loadMyGroups(); toast('加入成功！', 'success');
}

function showAbout() {
  openModal(`<div class="modal-title">📚 关于学习打卡</div>
    <div style="text-align:center;padding:20px 0;">
      <div style="font-size:48px;margin-bottom:12px;">📚</div>
      <div style="font-size:18px;font-weight:700;">学习打卡 v2.0</div>
      <div style="color:var(--text-muted);margin-top:4px;">云端版 · 随时随地</div>
      <div style="margin-top:20px;font-size:14px;color:var(--text-secondary);line-height:1.8;">
        📌 记录每日学习任务<br>👥 创建群组互相监督<br>📊 查看学习时长统计<br>⏰ 学习时间 10:00 - 22:00
      </div></div>
    <button class="btn btn-outline btn-block" onclick="closeModal()">关闭</button>`);
}

// ===== 启动 =====
init();
