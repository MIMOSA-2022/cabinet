// 左边的输入栏、右边的属性栏、加东西时弹出的栏。

import {
  uid, wallLetter, WINDOW_STYLES, DOOR_TYPES, CEILING_KINDS, WALL_ITEM_KINDS, DEFAULTS,
  getLast, setLast, makeWall, rectWalls, windowLayout, findItem, itemLabel, resolveSizes,
} from './model.js';
import { solveQuadByDiagonal, fmt } from './geometry.js';
import { cellRects } from './symbols.js';
import { cabinetsTab, cabinetProps, unitProps, countertopProps } from './cabui.js';
import { outputTab, noteProps } from './output.js';
import { libraryTab, libTypeOf, saveItem } from './library.js';
import { cloud } from './cloud.js';

// ---------- 小工具 ----------
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

export function numInput(value, onCommit, { fkey, blank = false, placeholder } = {}) {
  const inp = h('input', { type: 'number', step: 'any', value: value ?? '', placeholder, dataset: fkey ? { fkey } : {} });
  inp.addEventListener('change', () => {
    const raw = inp.value.trim();
    if (raw === '') { if (blank) onCommit(null); else inp.classList.add('bad'); return; }
    const n = Number(raw);
    if (!Number.isFinite(n)) { inp.classList.add('bad'); return; }
    onCommit(n);
  });
  return inp;
}

export function selInput(value, options, onCommit, fkey) {
  const s = h('select', { dataset: fkey ? { fkey } : {} });
  for (const [v, label] of Object.entries(options)) s.append(h('option', { value: v, selected: String(v) === String(value) }, label));
  s.addEventListener('change', () => onCommit(s.value));
  return s;
}

export const row = (label, input, unit) => h('label', { class: 'row' }, h('span', { class: 'lab' }, label), input, unit ? h('span', { class: 'unit' }, unit) : null);
export const warn = (text) => h('div', { class: 'warn' }, '⚠ ' + text);
export const note = (text) => h('div', { class: 'note' }, text);

export function wallOptions(project) {
  return Object.fromEntries(project.room.walls.map((w, i) => [w.id, `墙 ${wallLetter(i)}`]));
}

// ---------- 每种东西有哪些栏 ----------
const OFFSET = { key: 'offset', label: '离起点墙角', unit: 'mm' };
function fieldsFor(kind) {
  const wall = { key: 'wall', label: '在哪面墙', type: 'wall' };
  switch (kind) {
    case 'window': return [wall, OFFSET,
      { key: 'width', label: '宽度', unit: 'mm' }, { key: 'height', label: '高度', unit: 'mm' },
      { key: 'sill', label: '距地高度', unit: 'mm' }];
    case 'door': return [wall, OFFSET,
      { key: 'width', label: '宽度', unit: 'mm' }, { key: 'height', label: '高度', unit: 'mm' },
      { key: 'doorType', label: '类型', type: 'select', options: DOOR_TYPES },
      { key: 'beadingWidth', label: 'Beading 宽度', unit: 'mm', show: (o) => o.doorType === 'woodBeading' },
      { key: 'beadingThickness', label: 'Beading 凸出厚度', unit: 'mm', show: (o) => o.doorType === 'woodBeading' },
      { key: 'leaves', label: '扇数', type: 'select', options: { 1: '单扇', 2: '双扇' }, show: (o) => o.doorType !== 'opening' },
      { key: 'operation', label: '开法', type: 'select', options: { swing: '推开', sliding: '推拉' }, show: (o) => o.doorType !== 'opening' },
      { key: 'hinge', label: '铰链', type: 'select', options: { L: '在左边', R: '在右边' }, show: (o) => o.doorType !== 'opening' && o.operation !== 'sliding' && Number(o.leaves) !== 2 },
      { key: 'swing', label: '开向', type: 'select', options: { in: '向房间里开', out: '向外开' }, show: (o) => o.doorType !== 'opening' && o.operation !== 'sliding' }];
    case 'pelmet': return [wall, OFFSET, { key: 'length', label: '长度', unit: 'mm' },
      { key: 'drop', label: '落下深度', unit: 'mm' }, { key: 'projection', label: '凸出宽度', unit: 'mm' }];
    case 'beam': return [wall, OFFSET, { key: 'length', label: '长度', unit: 'mm' },
      { key: 'drop', label: '往下垂多少', unit: 'mm' }, { key: 'projection', label: '凸出墙面多少（宽度）', unit: 'mm' }];
    case 'column': return [wall, OFFSET, { key: 'width', label: '宽（沿着墙）', unit: 'mm' }, { key: 'depth', label: '深（凸出墙面）', unit: 'mm' }];
    case 'drainFloor': return [{ ...wall, label: '靠哪面墙' }, { key: 'offset', label: '沿着墙离起点墙角', unit: 'mm' },
      { key: 'distFromWall', label: '离这面墙', unit: 'mm' }];
    default: return [wall, OFFSET, { key: 'height', label: '离地高度', unit: 'mm' }];
  }
}

function buildFields(container, fields, obj, project, onChange) {
  for (const f of fields) {
    if (f.show && !f.show(obj)) continue;
    const fkey = 'f.' + f.key;
    let inp;
    if (f.type === 'wall') inp = selInput(obj.wall, wallOptions(project), (v) => onChange(f.key, v), fkey);
    else if (f.type === 'select') inp = selInput(obj[f.key], f.options, (v) => onChange(f.key, v), fkey);
    else inp = numInput(obj[f.key], (v) => onChange(f.key, v), { fkey });
    container.append(row(f.label, inp, f.unit));
  }
}

const KIND_NAMES = { window: '窗', door: '门', ...CEILING_KINDS, ...WALL_ITEM_KINDS };
const KIND_LIST = { window: 'openings', door: 'openings', pelmet: 'ceilingItems', beam: 'ceilingItems', column: 'ceilingItems' };
const listOf = (kind) => KIND_LIST[kind] || 'wallItems';

// ---------- 弹出栏：加东西 ----------
export function openAddDialog(app, kind) {
  const project = app.project;
  if (!project.room.walls.length) { alert('请先画墙。'); return; }
  const base = { ...DEFAULTS[kind] };
  if (kind === 'window') Object.assign(base, { preset: 'single' });
  const vals = getLast(kind, base);
  if (!project.room.walls.some((w) => w.id === vals.wall)) vals.wall = project.room.walls[0].id;

  const dlg = document.getElementById('dlg');
  const body = h('div', { class: 'form' });
  const draw = () => {
    body.innerHTML = '';
    buildFields(body, fieldsFor(kind), vals, project, (k, v) => { vals[k] = v; if (typeof v === 'string') draw(); });
    if (kind === 'window') {
      body.append(row('款式', selInput(vals.style, WINDOW_STYLES, (v) => { vals.style = v; }), null));
      body.append(row('排法', selInput(vals.preset, { single: '一整格', bottomOpen: '下面开、上面固定', leftOpen: '左边开、右边固定' }, (v) => { vals.preset = v; }), null));
      body.append(note('加进去之后，可以在右边把窗拆成几格，每格选款式；转角窗也在右边设。'));
    }
    if (kind !== 'window' && kind !== 'drainFloor') body.append(note('"离起点墙角" = 从这面墙开始的那个墙角量过来（平面图上沿着画墙的方向）。'));
  };
  draw();
  dlg.innerHTML = '';
  dlg.append(
    h('h3', {}, '加' + KIND_NAMES[kind]),
    body,
    h('div', { class: 'btns' },
      h('button', { onclick: () => dlg.close() }, '取消'),
      h('button', {
        class: 'primary', onclick: () => {
          const item = makeItem(kind, vals);
          const { preset, ...remember } = vals;
          setLast(kind, kind === 'window' ? { ...remember, preset } : remember);
          app.commit((p) => p[listOf(kind)].push(item));
          app.select(item.id);
          dlg.close();
        },
      }, '加进去')),
  );
  dlg.showModal();
}

function makeItem(kind, v) {
  const id = uid(kind);
  const pick = (keys) => Object.fromEntries(keys.map((k) => [k, v[k]]));
  if (kind === 'window') {
    return { id, kind, ...pick(['wall', 'offset', 'width', 'height', 'sill', 'frameOffset', 'frameDepth', 'frameWidth']),
      rows: windowLayout(v.preset, v.style), corner: null };
  }
  if (kind === 'door') {
    return { id, kind, ...pick(['wall', 'offset', 'width', 'height', 'doorType', 'leaves', 'hinge', 'swing', 'operation',
      'beadingWidth', 'beadingThickness', 'leafThickness', 'frameOffset', 'frameDepth', 'frameWidth']) };
  }
  return { id, kind, ...pick(fieldsFor(kind).map((f) => f.key)) };
}

// ---------- 左边 ----------
const TABS = [['walls', '墙体'], ['openings', '门窗'], ['cabinets', '柜子'], ['ceiling', '天花'], ['wallItems', '墙上的东西'], ['output', '图纸'], ['library', '资料库'], ['file', '文件']];

export function renderLeft(el, app) {
  const project = app.project;
  el.innerHTML = '';
  const tabs = h('div', { class: 'tabs' });
  for (const [k, label] of TABS) {
    tabs.append(h('button', { class: app.ui.tab === k ? 'on' : '', onclick: () => { app.ui.tab = k; app.refreshPanels(); } }, label));
  }
  el.append(tabs);
  const body = h('div', { class: 'tabbody' });
  el.append(body);
  ({ walls: wallsTab, openings: openingsTab, cabinets: cabinetsTab, output: outputTab, library: libraryTab, ceiling: ceilingTab, wallItems: wallItemsTab, file: fileTab })[app.ui.tab](body, app, project);
}

function wallsTab(body, app, project) {
  const room = project.room;
  const N = room.walls.length;
  body.append(h('p', { class: 'hint' }, '从一个墙角出发，沿着墙一路输入每面墙的长度（量房间里面），每个墙角选往右转还是往左转。'));
  const tbl = h('div', { class: 'walltable' });
  room.walls.forEach((w, i) => {
    const r = h('div', { class: 'wallrow' + (app.selectedId === w.id ? ' sel' : '') });
    r.append(h('button', { class: 'letter', title: '选这面墙', onclick: () => app.select(w.id) }, wallLetter(i)));
    r.append(h('span', { class: 'mini' }, '长'), numInput(w.length, (v) => app.commit((p) => { p.room.walls[i].length = v; }), { fkey: `w${i}.len` }));
    r.append(h('span', { class: 'mini' }, '厚'), numInput(w.thickness, (v) => app.commit((p) => { p.room.walls[i].thickness = v; }), { fkey: `w${i}.t` }));
    if (i < N - 1) {
      r.append(selInput(w.turn, { R: '右转', L: '左转' }, (v) => app.commit((p) => { p.room.walls[i].turn = v; }), `w${i}.turn`));
      if (app.ui.advancedWalls) r.append(numInput(w.angle, (v) => app.commit((p) => { p.room.walls[i].angle = v; }), { fkey: `w${i}.ang` }), h('span', { class: 'mini' }, '°'));
    } else {
      r.append(h('span', { class: 'mini dim' }, '→ 回到 A'));
    }
    r.append(h('button', { class: 'x', title: '删除这面墙', onclick: () => deleteWall(app, i) }, '×'));
    tbl.append(r);
  });
  body.append(tbl);

  const g = app.geom;
  if (N >= 3) {
    body.append(g.gap > 1
      ? warn(`墙没有闭合：最后一面墙的终点离起点还差 ${fmt(g.gap)} mm。请检查长度或转角。`)
      : h('div', { class: 'ok' }, '✓ 墙已闭合'));
  }
  body.append(h('div', { class: 'btnrow' },
    h('button', { onclick: () => app.commit((p) => p.room.walls.push(makeWall(1000, p.room.defaultThickness))) }, '+ 加一面墙'),
    h('button', { onclick: () => rectDialog(app) }, '快速：长方形房间')));

  body.append(row('新墙默认厚度', numInput(room.defaultThickness, (v) => app.commit((p) => { p.room.defaultThickness = v; }), { fkey: 'defT' }), 'mm'));

  const adv = h('details', { open: app.ui.advancedWalls || null });
  adv.addEventListener('toggle', () => { if (app.ui.advancedWalls !== adv.open) { app.ui.advancedWalls = adv.open; app.refreshPanels(); } });
  adv.append(h('summary', {}, '进阶：斜角'));
  adv.append(note('打开后，每个墙角旁边可以填角度（默认 90°）。也可以用对角线算出角度。'));
  if (N === 4) {
    const diagBox = h('div', { class: 'form' });
    let diag = app.ui.lastDiag ?? '';
    diagBox.append(row('对角线（A 起点 到 C 起点）', numInput(diag, (v) => { diag = v; app.ui.lastDiag = v; }, { fkey: 'diag' }), 'mm'));
    const msg = h('div');
    diagBox.append(h('button', {
      onclick: () => {
        const r = solveQuadByDiagonal(room.walls.map((w) => w.length), diag);
        if (r.error) { msg.replaceChildren(warn(r.error)); return; }
        app.commit((p) => { r.angles.forEach((a, k) => { p.room.walls[k].angle = Math.round(a * 100) / 100; p.room.walls[k].turn = 'R'; }); });
      },
    }, '用对角线算角度'), msg);
    adv.append(diagBox);
  } else {
    adv.append(note('对角线计算目前只支持四面墙的房间；其他形状请直接填角度。'));
  }
  adv.append(row('墙 A 的方向', numInput(room.startAngle, (v) => app.commit((p) => { p.room.startAngle = v; }), { fkey: 'startAngle' }), '°'));
  body.append(adv);
}

function deleteWall(app, i) {
  const p = app.project;
  const w = p.room.walls[i];
  const attached = [...p.openings, ...p.ceilingItems, ...p.wallItems, ...p.cabinets, ...p.countertops].filter((x) => x.wall === w.id).length;
  if (attached && !confirm(`墙 ${wallLetter(i)} 上有 ${attached} 样东西，会一起删除。确定吗？`)) return;
  app.commit((q) => {
    q.room.walls.splice(i, 1);
    for (const k of ['openings', 'ceilingItems', 'wallItems', 'cabinets', 'countertops', 'notes']) q[k] = q[k].filter((x) => x.wall !== w.id);
  });
}

function rectDialog(app) {
  const dlg = document.getElementById('dlg');
  const v = getLast('rectRoom', { a: 3600, b: 2400 });
  const t = app.project.room.defaultThickness;
  dlg.innerHTML = '';
  dlg.append(h('h3', {}, '长方形房间'),
    h('div', { class: 'form' },
      row('墙 A / C 长度', numInput(v.a, (x) => { v.a = x; }), 'mm'),
      row('墙 B / D 长度', numInput(v.b, (x) => { v.b = x; }), 'mm'),
      note('会换掉现在的墙，墙上的东西也会删除。')),
    h('div', { class: 'btns' },
      h('button', { onclick: () => dlg.close() }, '取消'),
      h('button', {
        class: 'primary', onclick: () => {
          setLast('rectRoom', v);
          app.commit((p) => { p.room.walls = rectWalls(v.a, v.b, t); p.openings = []; p.ceilingItems = []; p.wallItems = []; }, { refit: true });
          dlg.close();
        },
      }, '确定')));
  dlg.showModal();
}

export function itemList(app, items) {
  const ul = h('div', { class: 'list' });
  if (!items.length) ul.append(h('div', { class: 'empty' }, '还没有'));
  for (const it of items) {
    ul.append(h('button', { class: 'item' + (app.selectedId === it.id ? ' sel' : ''), onclick: () => app.select(it.id) }, itemLabel(app.project, it)));
  }
  return ul;
}

function openingsTab(body, app, project) {
  body.append(h('div', { class: 'btnrow' },
    h('button', { onclick: () => openAddDialog(app, 'window') }, '+ 加窗'),
    h('button', { onclick: () => openAddDialog(app, 'door') }, '+ 加门')));
  body.append(itemList(app, project.openings));
}

function ceilingTab(body, app, project) {
  body.append(row('天花高度', numInput(project.room.ceilingHeight, (v) => app.commit((p) => { p.room.ceilingHeight = v; }), { fkey: 'ceilH' }), 'mm'));
  body.append(h('div', { class: 'btnrow' },
    h('button', { onclick: () => openAddDialog(app, 'pelmet') }, '+ Pelmet'),
    h('button', { onclick: () => openAddDialog(app, 'beam') }, '+ Beam'),
    h('button', { onclick: () => openAddDialog(app, 'column') }, '+ 柱子')));
  body.append(note('平面图里 Pelmet 和 Beam 用虚线（在头顶上）。'));
  body.append(itemList(app, project.ceilingItems));
}

function wallItemsTab(body, app, project) {
  const br = h('div', { class: 'btnrow' });
  for (const [k, label] of Object.entries(WALL_ITEM_KINDS)) br.append(h('button', { onclick: () => openAddDialog(app, k) }, '+ ' + label));
  body.append(br, itemList(app, project.wallItems));
}

function fileTab(body, app, project) {
  body.append(row('项目名称', (() => {
    const i = h('input', { type: 'text', value: project.name, dataset: { fkey: 'name' } });
    i.addEventListener('change', () => app.commit((p) => { p.name = i.value; }));
    return i;
  })(), null));
  body.append(note(cloud.user ? '登入了：每次修改都会自动存到网上，电脑、平板、手机登入后看到同一份。上面"我的项目"可以换项目。"导出文件"可以另外存一份备份。' : '每次修改都会自动存在这台电脑的浏览器里。要换电脑或备份，请"导出文件"。'));
  body.append(h('div', { class: 'btnrow col' },
    h('button', { onclick: () => app.exportFile() }, '导出文件（.json）'),
    h('button', { onclick: () => app.importFile() }, '导入文件'),
    h('button', { onclick: () => { if (confirm('开一个新项目？现在的项目如果没有导出会被换掉。')) app.newProject(); } }, '新项目')));
}

// ---------- 右边：选中的东西 ----------
export function renderRight(el, app) {
  renderRightInner(el, app);
  const it = app.selectedId && findItem(app.project, app.selectedId);
  if (it && libTypeOf(it)) {
    el.prepend(h('div', { class: 'btnrow small libbar' }, h('button', { onclick: () => saveItem(app, it) }, '★ 存入资料库')));
  }
}

function renderRightInner(el, app) {
  const project = app.project;
  el.innerHTML = '';
  const id = app.selectedId;
  if (!id) { el.append(h('div', { class: 'empty big' }, '在平面图或 3D 里点一样东西，或从左边的列表选，就可以在这里改尺寸。')); return; }
  const wi = project.room.walls.findIndex((w) => w.id === id);
  if (wi >= 0) return wallProps(el, app, wi);
  const it = findItem(project, id);
  if (!it) { el.append(h('div', { class: 'empty' }, '没有选中')); return; }
  if (it.kind === 'cabinet') return cabinetProps(el, app, it);
  if (['fridge', 'hood', 'panel'].includes(it.kind)) return unitProps(el, app, it);
  if (it.kind === 'countertop') return countertopProps(el, app, it);
  if (it.kind === 'note') return noteProps(el, app, it);

  el.append(h('h3', {}, KIND_NAMES[it.kind]));
  const form = h('div', { class: 'form' });
  const set = (k, v) => {
    app.commit((p) => { const x = findItem(p, id); x[k] = v; });
    if (typeof v === 'number' || k === 'doorType') setLast(it.kind, { [k]: v });
  };
  let fields = fieldsFor(it.kind);
  if (it.kind === 'window' && it.corner) {
    fields = fields.filter((f) => f.key !== 'offset').map((f) => (f.key === 'width' ? { ...f, label: '这面墙上的宽度' } : f));
  }
  buildFields(form, fields, it, project, set);
  el.append(form);
  for (const wtxt of itemWarnings(app, it)) el.append(warn(wtxt));

  if (it.kind === 'window') windowExtras(el, app, it);
  if (it.kind === 'door' && it.doorType === 'alu') {
    const adv = h('details', {}, h('summary', {}, '进阶：门框'));
    const f = h('div', { class: 'form' });
    buildFields(f, [{ key: 'frameOffset', label: '门框离内墙面', unit: 'mm' }, { key: 'frameDepth', label: '门框厚度', unit: 'mm' }, { key: 'frameWidth', label: '门框宽度', unit: 'mm' }], it, project, set);
    adv.append(f); el.append(adv);
  }
  el.append(h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => app.deleteSelected() }, '删除')));
}

function wallProps(el, app, i) {
  const project = app.project;
  const w = project.room.walls[i];
  const g = app.geom.walls[i];
  el.append(h('h3', {}, `墙 ${wallLetter(i)}`));
  el.append(h('div', { class: 'form' },
    row('长度（房间里面）', numInput(w.length, (v) => app.commit((p) => { p.room.walls[i].length = v; }), { fkey: 'sw.len' }), 'mm'),
    row('厚度', numInput(w.thickness, (v) => app.commit((p) => { p.room.walls[i].thickness = v; }), { fkey: 'sw.t' }), 'mm')));
  if (g) el.append(note(`外墙面长度约 ${fmt(Math.hypot(g.extEnd.x - g.extStart.x, g.extEnd.y - g.extStart.y))} mm`));
  const items = [...project.openings, ...project.ceilingItems, ...project.wallItems, ...project.cabinets, ...project.countertops].filter((x) => x.wall === w.id);
  el.append(h('h4', {}, '这面墙上的东西'), itemList(app, items));
}

function itemWarnings(app, it) {
  const out = [];
  const g = app.geom.byId[it.wall];
  if (!g) return ['找不到这面墙'];
  const H = app.geom.H;
  if (it.kind === 'window' || it.kind === 'door') {
    const end = it.kind === 'window' && it.corner ? g.L : +it.offset + +it.width;
    const start = it.kind === 'window' && it.corner ? g.L - it.width : +it.offset;
    if (start < 0 || end > g.L + 0.5) out.push(`超出墙 ${g.letter} 的长度（墙长 ${fmt(g.L)} mm）`);
    const top = it.kind === 'window' ? +it.sill + +it.height : +it.height;
    if (top > H) out.push(`比天花高 ${fmt(top - H)} mm`);
    for (const sp of app.spans[g.index]) {
      if (sp.item.id === it.id) continue;
      if (sp.u0 < end && sp.u1 > start) { out.push('和另一个门窗重叠了'); break; }
    }
    if (it.kind === 'window') {
      const r = cellRects(it.rows, it.width, it.height);
      if (r.overH > 0.5) out.push(`格子高度加起来超过窗高 ${fmt(r.overH)} mm`);
      if (r.cells.some((c) => c.overW > 0.5)) out.push('有一行格子的宽度加起来超过窗宽');
    }
  } else if (it.kind === 'pelmet' || it.kind === 'beam') {
    if (+it.offset + +it.length > g.L + 0.5 || it.offset < 0) out.push(`超出墙 ${g.letter} 的长度`);
  } else if (it.kind === 'column') {
    if (+it.offset + +it.width > g.L + 0.5 || it.offset < 0) out.push(`超出墙 ${g.letter} 的长度`);
  } else if (+it.offset > g.L || it.offset < 0) out.push(`超出墙 ${g.letter} 的长度`);
  return out;
}

function windowExtras(el, app, it) {
  const id = it.id;
  const commitRows = (key, fn) => app.commit((p) => {
    const x = findItem(p, id);
    const target = key === 'corner' ? x.corner : x;
    fn(target.rows);
  });
  el.append(h('h4', {}, it.corner ? '格子（这面墙这一段）' : '格子'));
  el.append(cellEditor(app, it.rows, (fn) => commitRows('main', fn), 'main', it.corner && !it.corner.post ? 'R' : null));

  const adv = h('details', { open: it.corner ? true : null });
  adv.append(h('summary', {}, '进阶：转角窗'));
  const cb = h('input', { type: 'checkbox', checked: !!it.corner });
  cb.addEventListener('change', () => app.commit((p) => {
    const x = findItem(p, id);
    x.corner = cb.checked ? { width2: getLast('cornerWindow', { width2: 1000 }).width2, post: true, rows: windowLayout('single') } : null;
  }));
  adv.append(h('label', { class: 'row' }, cb, h('span', {}, '一整条转过墙角，接到下一面墙')));
  if (it.corner) {
    const f = h('div', { class: 'form' });
    f.append(row('下一面墙上的宽度', numInput(it.corner.width2, (v) => { setLast('cornerWindow', { width2: v }); app.commit((p) => { findItem(p, id).corner.width2 = v; }); }, { fkey: 'c.w2' }), 'mm'));
    f.append(row('墙角', selInput(it.corner.post ? 'post' : 'glass', { post: '有铝合金立柱', glass: '没有立柱（两片 Fixed 玻璃粘在一起）' },
      (v) => app.commit((p) => { findItem(p, id).corner.post = v === 'post'; }), 'c.post'), null));
    adv.append(f);
    if (!it.corner.post) adv.append(note('没有立柱时，墙角两边的格子只能是 Fixed，图上会自动画成 Fixed。'));
    adv.append(h('h4', {}, '格子（下一面墙那一段）'));
    adv.append(cellEditor(app, it.corner.rows, (fn) => commitRows('corner', fn), 'corner', !it.corner.post ? 'L' : null));
  }
  el.append(adv);

  const fr = h('details', {}, h('summary', {}, '进阶：窗框'));
  const f2 = h('div', { class: 'form' });
  buildFields(f2, [{ key: 'frameOffset', label: '窗框离内墙面', unit: 'mm' }, { key: 'frameDepth', label: '窗框厚度', unit: 'mm' }, { key: 'frameWidth', label: '窗框宽度', unit: 'mm' }],
    it, app.project, (k, v) => app.commit((p) => { findItem(p, id)[k] = v; }));
  fr.append(f2);
  el.append(fr);
}

// 窗的格子编辑：每一行可以改高度、加格；每一格改宽度、款式、铰链
function cellEditor(app, rows, commit, tag, fixedSide) {
  const box = h('div', { class: 'cells' });
  box.append(h('div', { class: 'btnrow small' },
    h('span', { class: 'mini' }, '快捷：'),
    h('button', { onclick: () => commit((r) => r.splice(0, r.length, ...windowLayout('single'))) }, '一整格'),
    h('button', { onclick: () => commit((r) => r.splice(0, r.length, ...windowLayout('bottomOpen'))) }, '下开上固定'),
    h('button', { onclick: () => commit((r) => r.splice(0, r.length, ...windowLayout('leftOpen'))) }, '左开右固定')));
  rows.forEach((rw, ri) => {
    const rb = h('div', { class: 'cellrow' });
    rb.append(h('div', { class: 'cellhead' },
      h('b', {}, `第 ${ri + 1} 行${rows.length > 1 ? (ri === 0 ? '（最上）' : ri === rows.length - 1 ? '（最下）' : '') : ''}`),
      h('span', { class: 'mini' }, '高'),
      numInput(rw.h, (v) => commit((r) => { r[ri].h = v; }), { blank: true, placeholder: '平分', fkey: `${tag}.r${ri}.h` }),
      h('button', { title: '这一行加一格', onclick: () => commit((r) => r[ri].cells.push({ w: null, style: 'fixed', hinge: 'L' })) }, '+格'),
      rows.length > 1 ? h('button', { class: 'x', title: '删除这一行', onclick: () => commit((r) => r.splice(ri, 1)) }, '×') : null));
    rw.cells.forEach((c, ci) => {
      const forced = (fixedSide === 'L' && ci === 0) || (fixedSide === 'R' && ci === rw.cells.length - 1);
      const cr = h('div', { class: 'cell' });
      cr.append(h('span', { class: 'mini' }, `格 ${ci + 1} 宽`),
        numInput(c.w, (v) => commit((r) => { r[ri].cells[ci].w = v; }), { blank: true, placeholder: '平分', fkey: `${tag}.r${ri}.c${ci}.w` }));
      if (forced) cr.append(h('span', { class: 'mini' }, 'Fixed（墙角）'));
      else {
        cr.append(selInput(c.style, WINDOW_STYLES, (v) => commit((r) => { r[ri].cells[ci].style = v; }), `${tag}.r${ri}.c${ci}.s`));
        if (c.style === 'casement' || c.style === 'multipoint') {
          cr.append(selInput(c.hinge || 'L', { L: '铰链左', R: '铰链右' }, (v) => commit((r) => { r[ri].cells[ci].hinge = v; }), `${tag}.r${ri}.c${ci}.h`));
        }
      }
      if (rw.cells.length > 1) cr.append(h('button', { class: 'x', onclick: () => commit((r) => r[ri].cells.splice(ci, 1)) }, '×'));
      rb.append(cr);
    });
    box.append(rb);
  });
  box.append(h('div', { class: 'btnrow small' },
    h('button', { onclick: () => commit((r) => r.push({ h: null, cells: [{ w: null, style: 'fixed', hinge: 'L' }] })) }, '+ 加一行（往下）')));
  box.append(note('高度、宽度留空 = 平分剩下的。'));
  return box;
}

export { resolveSizes };
