// 程序入口：保存项目、撤销/重做、把平面图、3D、输入栏连起来。

import { newProject, findItem, wallLetter, upgradeProject } from './model.js';
import { computeRoom, openingSpans } from './geometry.js';
import { PlanView } from './plan.js';
import { View3D } from './view3d.js';
import { renderLeft, renderRight, h } from './ui.js';
import { wallDims } from './dims.js';
import { openNoteDialog } from './output.js';
import { exportPDF } from './pdf.js';
import { cloud, initCloud, scheduleSave, saveNow, checkRemoteNewer, renderAccount, startNewFrom } from './cloud.js';

const SAVE_KEY = 'cabinet.project.v1';

function load() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function save(p) {
  scheduleSave(); // 登入了就自动存上网
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch { /* 存不了就算了 */ }
}

const app = {
  project: upgradeProject(load() || newProject()),
  selectedId: null,
  ui: { tab: 'walls', advancedWalls: false, view: 'split' },
  past: [],
  future: [],
  geom: null,
  spans: null,

  commit(fn, opts = {}) {
    const next = structuredClone(this.project);
    fn(next);
    this.past.push(JSON.stringify(this.project));
    if (this.past.length > 200) this.past.shift();
    this.future = [];
    this.project = next;
    save(next);
    if (opts.refit) plan.vb = null;
    renderAll();
  },
  undo() {
    if (!this.past.length) return;
    this.future.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.past.pop());
    save(this.project);
    renderAll();
  },
  redo() {
    if (!this.future.length) return;
    this.past.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.future.pop());
    save(this.project);
    renderAll();
  },
  select(id) {
    this.selectedId = id;
    const it = id && findItem(this.project, id);
    if (it) this.ui.tab = it.kind === 'window' || it.kind === 'door' ? 'openings'
      : ['cabinet', 'fridge', 'hood', 'panel', 'countertop'].includes(it.kind) ? 'cabinets'
        : it.kind === 'note' ? 'output'
        : ['pelmet', 'beam', 'column'].includes(it.kind) ? 'ceiling' : 'wallItems';
    else if (id && this.project.room.walls.some((w) => w.id === id)) this.ui.tab = 'walls';
    renderAll();
  },
  deleteSelected() {
    const id = this.selectedId;
    if (!id) return;
    if (this.project.room.walls.some((w) => w.id === id)) return; // 墙在左边删
    this.commit((p) => { for (const k of ['openings', 'ceilingItems', 'wallItems', 'cabinets', 'countertops', 'notes']) p[k] = p[k].filter((x) => x.id !== id); });
    this.selectedId = null;
    renderAll();
  },
  refreshPanels() { panels(); },
  newProject() {
    if (cloud.user) { app.loadProjectData(newProject()); return; }
    this.commit((p) => Object.assign(p, newProject()), { refit: true });
    this.selectedId = null;
    view3d.hasView = false;
    renderAll();
  },
  exportFile() {
    const blob = new Blob([JSON.stringify(this.project, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: (this.project.name || 'project') + '.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importFile() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data.room || !Array.isArray(data.room.walls)) throw new Error('bad');
        await app.loadProjectData(data);
        this.selectedId = null;
        view3d.hasView = false;
        renderAll();
      } catch { alert('这个文件打不开，不是这个工具导出的项目文件。'); }
    });
    inp.click();
  },
};
window.app = app; // 方便除错

const left = document.getElementById('left');
const right = document.getElementById('right');
// 在平面图上拖柜子：只沿着它那面墙移动，碰到墙角或旁边的柜子会吸过去
let dragState = null;
const plan = new PlanView(document.getElementById('plan'), {
  onSelect: (id) => app.select(id),
  onDragStart: (id) => {
    const it = findItem(app.project, id);
    if (!it) return;
    dragState = { id, snapshot: JSON.stringify(app.project), start: +it.offset };
    app.selectedId = id;
  },
  onDrag: (id, delta, pxToMm) => {
    if (!dragState || dragState.id !== id) return;
    const it = findItem(app.project, id);
    const w = app.geom.byId[it.wall];
    if (!w) return;
    let off = dragState.start + delta.x * w.d.x + delta.y * w.d.y;
    const W = +it.width;
    const tol = 10 * pxToMm;
    const edges = [0, w.L];
    for (const c of app.project.cabinets) {
      if (c.id === id || c.wall !== it.wall) continue;
      edges.push(+c.offset, +c.offset + +c.width);
    }
    let best = null;
    for (const e of edges) {
      for (const [cand, d] of [[e, Math.abs(off - e)], [e - W, Math.abs(off + W - e)]]) {
        if (d < tol && (!best || d < best.d)) best = { v: cand, d };
      }
    }
    off = best ? best.v : Math.round(off);
    it.offset = Math.round(off * 10) / 10;
    renderAll();
  },
  onDragEnd: () => {
    if (!dragState) return;
    app.past.push(dragState.snapshot);
    app.future = [];
    dragState = null;
    save(app.project);
    renderAll();
  },
});
const view3d = new View3D(document.getElementById('view3d'), { onSelect: (id) => app.select(id) });

window.view3d = view3d; window.plan = plan; // 方便除错

// ---------- 图纸：尺寸线、红字说明、导出 ----------
app.renderAll = () => renderAll();
app.toast = (text) => {
  const box = document.getElementById('busy');
  box.textContent = text; box.hidden = false;
  clearTimeout(app._toastT); app._toastT = setTimeout(() => { box.hidden = true; }, 1800);
};
// 从资料库打开整个项目
app.loadProjectData = async (data, opts = {}) => {
  // 登入时：另开一个网上项目，不盖掉现在这个（从网上打开的项目除外）
  if (cloud.user && !opts.fromCloud && !(await startNewFrom(data))) return;
  app.commit((p) => { Object.keys(p).forEach((k) => delete p[k]); Object.assign(p, upgradeProject(data)); }, { refit: true });
  app.selectedId = null;
  view3d.hasView = false;
  view3d.activeWall = null;
  renderAll();
};
app.activeWall = () => view3d.activeWall;
app.startNote = () => {
  if (view3d.activeWall == null) { alert('先按 3D 上面的"墙 A""墙 B"这种按钮，正面看一面墙。'); return; }
  if (app.ui.view === 'plan') document.querySelector('[data-view="split"]').click();
  app.ui.picking = true;
  document.getElementById('view3d').classList.add('picking');
  panels();
  view3d.pickMode = (pt) => {
    view3d.pickMode = null;
    app.ui.picking = false;
    document.getElementById('view3d').classList.remove('picking');
    panels();
    if (!pt) return;
    const w = app.geom.walls[view3d.activeWall];
    const rx = pt.x - w.s.x, ry = pt.z - w.s.y;
    const u = rx * w.d.x + ry * w.d.y;
    const z = rx * w.n.x + ry * w.n.y;
    openNoteDialog(app, { wall: w.id, ax: Math.round(u), ay: Math.round(pt.y), az: Math.round(z), lx: Math.round(u + 350), ly: Math.round(pt.y + 400) });
  };
};
app.exportPDF = async () => {
  const box = document.getElementById('busy');
  box.hidden = false;
  try {
    const n = await exportPDF({ app, view3d, plan, onProgress: (t) => { box.textContent = '正在导出 PDF：' + t; } });
    box.textContent = `PDF 做好了（${n} 页），已经下载。`;
    setTimeout(() => { box.hidden = true; }, 2500);
  } catch (e) {
    box.hidden = true;
    alert('导出 PDF 失败：' + e.message);
  }
};

// 在图上拖尺寸线、拖说明文字、双击关掉某一条尺寸
let ovDrag = null;
view3d.onOverlay = (ev) => {
  const wi = view3d.activeWall;
  const w = app.geom.walls[wi];
  if (!w) return;
  const p = app.project;
  if (ev.phase === 'hideSeg') {
    app.commit((q) => { q.dimSettings ||= {}; q.dimSettings[w.id] ||= { hidden: {}, offsets: {} }; (q.dimSettings[w.id].hidden ||= {})[ev.key] = true; });
    return;
  }
  if (ev.phase === 'start') {
    ovDrag = { snapshot: JSON.stringify(p), moved: false };
    if (ev.chain) {
      const ch = wallDims(p, app.geom, wi).chains.find((c) => c.key === ev.chain);
      ovDrag.off0 = ch ? Math.abs(ch.line - ch.ref) : 0;
      ovDrag.below = ch ? ch.line < ch.ref : true; // 尺寸线在参照线的下面 / 左边
    }
    if (ev.note) { const n = findItem(p, ev.note); ovDrag.l0 = { x: +n.lx, y: +n.ly }; }
    return;
  }
  if (!ovDrag) return;
  if (ev.phase === 'move') {
    ovDrag.moved = true;
    if (ev.chain) {
      const d = ev.dir === 'h' ? ev.dyMm : ev.dxMm;
      const off = Math.max(0, Math.round(ovDrag.off0 + (ovDrag.below ? -d : d)));
      p.dimSettings ||= {}; p.dimSettings[w.id] ||= { hidden: {}, offsets: {} };
      (p.dimSettings[w.id].offsets ||= {})[ev.chain] = off;
    } else if (ev.note) {
      const n = findItem(p, ev.note);
      n.lx = Math.round(ovDrag.l0.x + ev.dxMm * (w.rightIsU ? 1 : -1));
      n.ly = Math.round(ovDrag.l0.y + ev.dyMm);
    }
    view3d.drawOverlay();
    return;
  }
  if (ev.phase === 'end') {
    if (ovDrag.moved) {
      app.past.push(ovDrag.snapshot);
      app.future = [];
      save(p);
      renderAll();
    } else if (ev.note) app.select(ev.note);
    ovDrag = null;
  }
};

function panels() {
  const focusKey = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.fkey;
  const inRight = right.contains(document.activeElement);
  renderLeft(left, app);
  renderRight(right, app);
  if (focusKey) {
    const el = (inRight ? right : left).querySelector(`[data-fkey="${CSS.escape(focusKey)}"]`);
    if (el) el.focus();
  }
}

function wallButtons() {
  const box = document.getElementById('wallviews');
  box.innerHTML = '';
  box.append(h('button', { onclick: () => view3d.viewOverview() }, '总览'));
  app.project.room.walls.forEach((w, i) => box.append(h('button', { onclick: () => view3d.viewWall(i) }, `墙 ${wallLetter(i)}`)));
  box.append(h('button', {
    class: view3d.showSwing ? 'on' : '',
    title: '门上画开门方向的虚线（尖角指向铰链那一边）',
    onclick: () => { view3d.showSwing = !view3d.showSwing; renderAll(); },
  }, view3d.showSwing ? '开门方向线：开' : '开门方向线：关'));
}

function renderAll() {
  if (app.selectedId && !findItem(app.project, app.selectedId) && !app.project.room.walls.some((w) => w.id === app.selectedId)) app.selectedId = null;
  app.geom = computeRoom(app.project);
  app.spans = openingSpans(app.project, app.geom);
  plan.render(app.project, app.geom, app.spans, app.selectedId);
  view3d.update(app.project, app.geom, app.spans, app.selectedId);
  panels();
  wallButtons();
  document.getElementById('projname').textContent = app.project.name;
  document.getElementById('undo').disabled = !app.past.length;
  document.getElementById('redo').disabled = !app.future.length;
}

// ---------- 上面那一排 ----------
document.getElementById('undo').onclick = () => app.undo();
document.getElementById('redo').onclick = () => app.redo();
document.getElementById('fit').onclick = () => plan.fit();
for (const b of document.querySelectorAll('[data-view]')) {
  b.onclick = () => {
    app.ui.view = b.dataset.view;
    document.getElementById('views').className = 'v-' + app.ui.view;
    for (const x of document.querySelectorAll('[data-view]')) x.classList.toggle('on', x === b);
    requestAnimationFrame(() => { view3d.resize(); plan.render(...plan._last); });
  };
}

document.addEventListener('keydown', (e) => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); app.redo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && !document.getElementById('dlg').open) app.deleteSelected();
  else if (e.key === 'Escape' && !typing) app.select(null);
});

renderAll();

// ---------- 网上服务：登入、自动存档 ----------
initCloud(app, () => { renderAll(); plan.fit(); });
window.addEventListener('focus', () => { checkRemoteNewer(); });
window.addEventListener('beforeunload', (e) => {
  if (cloud.status === 'saving') { saveNow(); e.preventDefault(); e.returnValue = ''; }
});
