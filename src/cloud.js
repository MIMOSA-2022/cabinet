// 网上服务：登入、项目存在网上（电脑、平板、手机看到同一份）、共用资料库。
// 用 Supabase。没有网络或没设定的时候，照旧存在这台电脑。

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { upgradeProject, newProject } from './model.js';
import { h } from './ui.js';

const CUR_KEY = 'cabinet.cloud.current'; // 这台电脑上次打开的项目

export const cloud = {
  enabled: !!(SUPABASE_URL && SUPABASE_KEY),
  client: null,
  user: null,
  profile: null,
  projectId: null,
  status: 'local', // local / saving / saved / error / offline
  lastSavedAt: null,
  library: [], // 所有人的资料库（含同事的）
  profiles: {}, // id → 名字
};

let saveTimer = null;
let app = null;
let onReady = null;

async function loadClient() {
  const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm');
  return mod.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

// 开始：没登入就显示登入画面
export async function initCloud(theApp, readyCallback) {
  app = theApp;
  onReady = readyCallback;
  if (!cloud.enabled) { setStatus('local'); return; }
  try {
    cloud.client = await loadClient();
  } catch {
    setStatus('offline');
    toastError('连不上网上服务，先用这台电脑的资料。');
    return;
  }
  cloud.client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { showSetPassword(); return; }
    if (event === 'SIGNED_OUT') { cloud.user = null; showLogin(); renderAccount(); }
  });
  const { data } = await cloud.client.auth.getSession();
  // 从邀请或忘记密码的 email 链接进来：先设密码
  const hash = location.hash || '';
  if (data.session && /type=(invite|recovery)/.test(hash)) {
    cloud.user = data.session.user;
    showSetPassword();
    return;
  }
  if (data.session) await afterLogin(data.session.user);
  else showLogin();
}

async function afterLogin(user) {
  cloud.user = user;
  hideOverlay();
  history.replaceState(null, '', location.pathname); // 把网址里的登入资料清掉
  await loadProfiles();
  cloud.profile = cloud.profiles[user.id] || { display_name: (user.email || '').split('@')[0] };
  await openStartProject();
  await refreshLibrary();
  renderAccount();
  onReady?.();
}

// ---------- 项目 ----------
export async function listProjects() {
  const { data, error } = await cloud.client.from('projects').select('id, name, updated_at').order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function openStartProject() {
  let list = [];
  try { list = await listProjects(); } catch (e) { toastError('读不到网上的项目：' + e.message); return; }
  let id = null;
  try { id = localStorage.getItem(CUR_KEY + '.' + cloud.user.id); } catch { /* */ }
  if (!list.length) {
    // 第一次登入：把这台电脑现在的项目放上网
    const created = await createProject(app.project);
    if (created) { cloud.projectId = created.id; rememberCurrent(); setStatus('saved'); }
    return;
  }
  const target = list.find((p) => p.id === id) || list[0];
  await openProject(target.id);
}

export async function openProject(id) {
  const { data, error } = await cloud.client.from('projects').select('id, name, data, updated_at').eq('id', id).single();
  if (error) { toastError('打不开项目：' + error.message); return false; }
  cloud.projectId = data.id;
  cloud.lastSavedAt = data.updated_at;
  rememberCurrent();
  app.loadProjectData(upgradeProject(data.data), { fromCloud: true });
  app.past = []; app.future = [];
  setStatus('saved');
  return true;
}

export async function createProject(project) {
  const { data, error } = await cloud.client.from('projects')
    .insert({ owner: cloud.user.id, name: project.name || '新项目', data: project })
    .select('id, updated_at').single();
  if (error) { toastError('新项目存不上去：' + error.message); return null; }
  cloud.lastSavedAt = data.updated_at;
  return data;
}

export async function newCloudProject() {
  const p = newProject();
  const created = await createProject(p);
  if (!created) return;
  cloud.projectId = created.id;
  rememberCurrent();
  app.loadProjectData(p, { fromCloud: true });
  app.past = []; app.future = [];
  setStatus('saved');
}

export async function deleteProject(id) {
  const { error } = await cloud.client.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function duplicateProject(id) {
  const { data, error } = await cloud.client.from('projects').select('name, data').eq('id', id).single();
  if (error) throw error;
  const copy = { ...data.data, name: (data.name || '项目') + '（副本）' };
  return createProject(copy);
}

function rememberCurrent() {
  try { localStorage.setItem(CUR_KEY + '.' + cloud.user.id, cloud.projectId); } catch { /* */ }
}

// 每次修改后 1.5 秒自动存上网
export function scheduleSave() {
  if (!cloud.enabled || !cloud.user || !cloud.projectId) return;
  setStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1500);
}

export async function saveNow() {
  if (!cloud.user || !cloud.projectId) return;
  clearTimeout(saveTimer);
  const p = app.project;
  const { data, error } = await cloud.client.from('projects')
    .update({ name: p.name || '新项目', data: p, updated_at: new Date().toISOString() })
    .eq('id', cloud.projectId).select('updated_at').single();
  if (error) { setStatus('error'); return; }
  cloud.lastSavedAt = data.updated_at;
  setStatus('saved');
}

// 回到这个窗口时，看看别的电脑/平板有没有改过
export async function checkRemoteNewer() {
  if (!cloud.user || !cloud.projectId || cloud.status === 'saving') return;
  const { data } = await cloud.client.from('projects').select('updated_at').eq('id', cloud.projectId).single();
  if (data && cloud.lastSavedAt && new Date(data.updated_at) > new Date(cloud.lastSavedAt)) {
    if (confirm('这个项目在别的电脑或平板上改过了。要载入最新的吗？')) await openProject(cloud.projectId);
    else cloud.lastSavedAt = data.updated_at;
  }
}

// ---------- 资料库（所有人的，网上）----------
async function loadProfiles() {
  const { data } = await cloud.client.from('profiles').select('id, email, display_name');
  cloud.profiles = Object.fromEntries((data || []).map((p) => [p.id, p]));
}

export function ownerName(id) {
  if (id === cloud.user?.id) return '我';
  const p = cloud.profiles[id];
  return p ? (p.display_name || p.email) : '同事';
}

export async function refreshLibrary() {
  if (!cloud.user) return;
  const { data, error } = await cloud.client.from('library_entries').select('id, owner, type, name, data, source, created_at, updated_at').order('name');
  if (error) { toastError('读不到资料库：' + error.message); return; }
  cloud.library = data || [];
}

export async function cloudAddEntry(e) {
  const { data, error } = await cloud.client.from('library_entries')
    .insert({ owner: cloud.user.id, type: e.type, name: e.name, data: e.data, source: e.source || null })
    .select('id, owner, type, name, data, source, created_at, updated_at').single();
  if (error) throw error;
  cloud.library.push(data);
  return data;
}

export async function cloudRenameEntry(id, name) {
  const { error } = await cloud.client.from('library_entries').update({ name, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  const e = cloud.library.find((x) => x.id === id);
  if (e) e.name = name;
}

export async function cloudDeleteEntry(id) {
  const { error } = await cloud.client.from('library_entries').delete().eq('id', id);
  if (error) throw error;
  cloud.library = cloud.library.filter((x) => x.id !== id);
}

export async function signOut() {
  await saveNow();
  await cloud.client.auth.signOut();
}

export async function setDisplayName(name) {
  const { error } = await cloud.client.from('profiles').update({ display_name: name }).eq('id', cloud.user.id);
  if (error) throw error;
  cloud.profiles[cloud.user.id] = { ...(cloud.profiles[cloud.user.id] || {}), display_name: name };
  cloud.profile = cloud.profiles[cloud.user.id];
}

// ---------- 画面：登入、设密码、状态 ----------
function overlayEl() {
  let el = document.getElementById('authOverlay');
  if (!el) { el = h('div', { id: 'authOverlay' }); document.body.append(el); }
  return el;
}
function hideOverlay() { const el = document.getElementById('authOverlay'); if (el) el.remove(); }

function showLogin(message = '') {
  const el = overlayEl();
  const email = h('input', { type: 'email', placeholder: 'Email', autocomplete: 'username' });
  const pw = h('input', { type: 'password', placeholder: '密码', autocomplete: 'current-password' });
  const msg = h('div', { class: 'authmsg' }, message);
  const go = async () => {
    msg.textContent = '登入中…';
    const { data, error } = await cloud.client.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
    if (error) { msg.textContent = /invalid/i.test(error.message) ? 'Email 或密码不对。' : '登入失败：' + error.message; return; }
    await afterLogin(data.user);
  };
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  el.innerHTML = '';
  el.append(h('div', { class: 'authbox' },
    h('h2', {}, '橱柜设计'),
    h('p', { class: 'note' }, '请用你的帐号登入。没有帐号的话，请向管理员要邀请。'),
    email, pw,
    h('button', { class: 'primary', onclick: go }, '登入'),
    h('button', {
      onclick: async () => {
        if (!email.value.trim()) { msg.textContent = '先填 email，再按"忘记密码"。'; return; }
        const { error } = await cloud.client.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
        msg.textContent = error ? '发送失败：' + error.message : '已经发了重设密码的 email，请去收信。';
      },
    }, '忘记密码'),
    msg));
  email.focus();
}

function showSetPassword() {
  const el = overlayEl();
  const pw = h('input', { type: 'password', placeholder: '新密码（至少 6 个字）', autocomplete: 'new-password' });
  const pw2 = h('input', { type: 'password', placeholder: '再输入一次', autocomplete: 'new-password' });
  const msg = h('div', { class: 'authmsg' });
  el.innerHTML = '';
  el.append(h('div', { class: 'authbox' },
    h('h2', {}, '设定你的密码'),
    h('p', { class: 'note' }, '第一次进来，或是重设密码，请设一个新密码。'),
    pw, pw2,
    h('button', {
      class: 'primary', onclick: async () => {
        if (pw.value.length < 6) { msg.textContent = '密码至少 6 个字。'; return; }
        if (pw.value !== pw2.value) { msg.textContent = '两次输入的不一样。'; return; }
        const { data, error } = await cloud.client.auth.updateUser({ password: pw.value });
        if (error) { msg.textContent = '设定失败：' + error.message; return; }
        await afterLogin(data.user);
      },
    }, '设定密码并进入'),
    msg));
  pw.focus();
}

const STATUS_TEXT = { local: '存在这台电脑', saving: '保存中…', saved: '已存到网上', error: '⚠ 存不上去，请检查网络', offline: '⚠ 离线：存在这台电脑' };
function setStatus(s) {
  cloud.status = s;
  const el = document.getElementById('cloudStatus');
  if (el) { el.textContent = STATUS_TEXT[s] || ''; el.className = 'cloudstatus ' + s; }
}

export function renderAccount() {
  const box = document.getElementById('account');
  if (!box) return;
  box.innerHTML = '';
  if (!cloud.enabled || !cloud.user) return;
  box.append(
    h('button', { onclick: () => projectsDialog() }, '我的项目'),
    h('button', { title: cloud.user.email, onclick: () => accountDialog() }, '👤 ' + (cloud.profile?.display_name || cloud.user.email)));
}

function fmtTime(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function projectsDialog() {
  await saveNow();
  const dlg = document.getElementById('dlg');
  const listBox = h('div', { class: 'list' }, '读取中…');
  dlg.innerHTML = '';
  dlg.append(h('h3', {}, '我的项目（网上）'), listBox,
    h('div', { class: 'btns' },
      h('button', { onclick: () => dlg.close() }, '关闭'),
      h('button', { class: 'primary', onclick: async () => { dlg.close(); await newCloudProject(); } }, '+ 新项目')));
  dlg.showModal();
  let list = [];
  try { list = await listProjects(); } catch (e) { listBox.textContent = '读不到：' + e.message; return; }
  listBox.innerHTML = '';
  for (const p of list) {
    const cur = p.id === cloud.projectId;
    listBox.append(h('div', { class: 'libitem' + (cur ? ' cur' : '') },
      h('div', {}, h('b', {}, p.name || '新项目'), h('span', { class: 'mini' }, `  ${fmtTime(p.updated_at)}${cur ? ' · 现在打开的' : ''}`)),
      h('div', { class: 'btnrow small' },
        cur ? null : h('button', { class: 'primary', onclick: async () => { dlg.close(); await openProject(p.id); } }, '打开'),
        h('button', { onclick: async () => { await duplicateProject(p.id); dlg.close(); projectsDialog(); } }, '复制一份'),
        cur ? null : h('button', {
          class: 'x', title: '删除', onclick: async () => {
            if (!confirm(`删除项目"${p.name}"？删除之后找不回来。`)) return;
            try { await deleteProject(p.id); } catch (e) { alert('删除失败：' + e.message); }
            dlg.close(); projectsDialog();
          },
        }, '×'))));
  }
}

function accountDialog() {
  const dlg = document.getElementById('dlg');
  const name = h('input', { type: 'text', value: cloud.profile?.display_name || '' });
  dlg.innerHTML = '';
  dlg.append(h('h3', {}, '我的帐号'),
    h('div', { class: 'form' },
      h('p', {}, cloud.user.email),
      h('label', { class: 'row' }, h('span', { class: 'lab' }, '名字（同事在资料库看到的）'), name),
      h('p', { class: 'note' }, '要加同事：在 Supabase 网站 → Authentication → Users → Invite user，填同事的 email。同事收到 email 后按链接设密码就能用。')),
    h('div', { class: 'btns' },
      h('button', { class: 'danger', onclick: async () => { dlg.close(); await signOut(); } }, '登出'),
      h('button', {
        class: 'primary', onclick: async () => {
          try { await setDisplayName(name.value.trim()); } catch (e) { alert('存不上去：' + e.message); }
          renderAccount(); dlg.close();
        },
      }, '保存')));
  dlg.showModal();
}

function toastError(t) { app?.toast ? app.toast(t) : alert(t); }

// 登入时打开别的资料（资料库里的整个项目、导入的文件、新项目）：另外开一个网上项目，不盖掉现在这个
export async function startNewFrom(data) {
  if (!cloud.user) return true;
  await saveNow();
  const created = await createProject(data);
  if (!created) return false;
  cloud.projectId = created.id;
  rememberCurrent();
  setStatus('saved');
  return true;
}
