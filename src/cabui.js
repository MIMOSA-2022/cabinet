// 柜子的输入栏：加柜子、改尺寸、每一片板、柜面拼块、拉手、踢脚。

import { findItem, getLast, setLast, uid } from './model.js';
import { fmt } from './geometry.js';
import {
  CAB_TYPES, CAB_DEFAULTS, FACE_PRESETS, FRONT_TYPES, HANDLE_TYPES,
  makeCabinet, makeFront, facePreset, defaultHandle, SPECIALS, SINK_TYPES, ACCESSORY_TYPES, LED_POSITIONS, makeSpecial, cabToWall, buildCabinet,
} from './cabinet.js';
import { UNIT_DEFAULTS, FRIDGE_STYLES, HOOD_STYLES, makeUnit } from './units.js';
import { MATERIALS, CT_DEFAULTS, makeCountertop, autoCountertops, exposedEnds, seamPositions } from './countertop.js';
import { h, numInput, selInput, row, warn, note, itemList, wallOptions } from './ui.js';
import { saveDialog, loadLib, frontStyleOf, applyFrontStyle } from './library.js';

const ELEV_LABEL = { base: 'ABS 脚高度（柜底离地）', upper: '柜底离地', tall: 'ABS 脚高度（柜底离地）' };
const isUpperLevel = (c) => (c.kind === 'cabinet' && c.type === 'upper') || c.kind === 'hood';

// 同一面墙上最后一样东西的右边（上面的和地上的分开算）
function nextOffset(project, wallId, upper) {
  let end = 0;
  for (const c of project.cabinets) {
    if (c.wall !== wallId || isUpperLevel(c) !== upper) continue;
    end = Math.max(end, +c.offset + +c.width);
  }
  return end;
}

export function cabinetsTab(body, app, project) {
  body.append(h('h4', {}, '柜子'), h('div', { class: 'btnrow' },
    h('button', { onclick: () => openCabDialog(app, 'base') }, '+ 下座橱'),
    h('button', { onclick: () => openCabDialog(app, 'upper') }, '+ 上座橱'),
    h('button', { onclick: () => openCabDialog(app, 'tall') }, '+ 高橱')));
  const sp = h('div', { class: 'btnrow' });
  for (const [k, s] of Object.entries(SPECIALS)) sp.append(h('button', { onclick: () => openCabDialog(app, s.type, k) }, '+ ' + s.label));
  body.append(sp);
  body.append(h('h4', {}, '其他'), h('div', { class: 'btnrow' },
    h('button', { onclick: () => openUnitDialog(app, 'filler') }, '+ Filler'),
    h('button', { onclick: () => openUnitDialog(app, 'exposed') }, '+ Exposed Panel'),
    h('button', { onclick: () => openUnitDialog(app, 'fridge') }, '+ 冰箱'),
    h('button', { onclick: () => openUnitDialog(app, 'hood') }, '+ 油烟机'),
    h('button', { onclick: () => openUnitDialog(app, 'top') }, '+ 台面板（坐凳面、书桌台面）')));
  body.append(note('加进去之后，可以在平面图上拖动（沿着墙移动，碰到墙角或旁边的东西会吸住），或在右边直接改数字。'));
  body.append(itemList(app, project.cabinets));

  body.append(h('h4', {}, '台面'), h('div', { class: 'btnrow' },
    h('button', { onclick: () => autoCt(app) }, '按下座橱自动生成台面'),
    h('button', { onclick: () => openCtDialog(app) }, '+ 台面')));
  body.append(itemList(app, project.countertops));

  finishSection(body, app, project);
  slideSpecTable(body, app, project);
}

function autoCt(app) {
  const p = app.project;
  if (p.countertops.length && !confirm('会换掉现在的台面（垫板、帽、材质用上一次填的数字）。确定吗？')) return;
  const list = autoCountertops(p, app.geom, getLast('countertop', CT_DEFAULTS));
  if (!list.length) { alert('没有找到下座橱。请先加下座橱、水盆橱或电气炉橱。'); return; }
  app.commit((q) => { q.countertops = list; });
}

// 加柜子（普通或特别的）
export function openCabDialog(app, type, special = null) {
  const project = app.project;
  if (!project.room.walls.length) { alert('请先画墙。'); return; }
  const memKey = 'cab.' + (special || type);
  const extra = special === 'sink' ? { sinkType: 'ss1', sinkWidth: 760, sinkDepth: 430, width: 900 }
    : special === 'hob' ? { hobWidth: 560, hobDepth: 490, width: 900 }
      : special === 'ovenMicro' ? { width: 600, height: 2300 }
        : special === 'wardrobe' ? { width: 940, height: 2560, depth: 600, elevation: 50, topDoor: 470 }
        : special?.startsWith('corner') ? { cornerSide: 'R', A: 500, B: 150, C: 18, ext: 0 } : {};
  const vals = getLast(memKey, { ...CAB_DEFAULTS[type], ...extra });
  if (!project.room.walls.some((w) => w.id === vals.wall)) vals.wall = project.room.walls[0].id;
  vals.offset = nextOffset(project, vals.wall, type === 'upper');
  const corner = special?.startsWith('corner');
  const dlg = document.getElementById('dlg');
  const body = h('div', { class: 'form' });
  const N = (k) => numInput(vals[k], (v) => { vals[k] = v; });
  const draw = () => {
    body.innerHTML = '';
    body.append(
      row('在哪面墙', selInput(vals.wall, wallOptions(project), (v) => { vals.wall = v; vals.offset = nextOffset(project, v, type === 'upper'); draw(); }), null),
      row('离起点墙角', N('offset'), 'mm'),
      corner ? null : row('宽', N('width'), 'mm'),
      row('高（柜身）', N('height'), 'mm'),
      row('深', N('depth'), 'mm'),
      row(ELEV_LABEL[type], N('elevation'), 'mm'),
      special ? null : row('柜面', selInput(vals.preset, FACE_PRESETS[type], (v) => { vals.preset = v; }), null));
    if (special === 'sink') {
      body.append(row('水盆', selInput(vals.sinkType, SINK_TYPES, (v) => { vals.sinkType = v; }), null),
        row('水盆宽', N('sinkWidth'), 'mm'), row('水盆深', N('sinkDepth'), 'mm'),
        note('水盆默认放在柜子正中间，之后可以在右边改偏多少。'));
    }
    if (special === 'hob') body.append(row('台面开孔 宽', N('hobWidth'), 'mm'), row('台面开孔 深', N('hobDepth'), 'mm'));
    if (corner) {
      body.append(row('左/右', selInput(vals.cornerSide, { R: '右转角（门在左，Filler 在右）', L: '左转角（Filler 在左，门在右）' }, (v) => { vals.cornerSide = v; }), null),
        row('A：门板那一段宽', N('A'), 'mm'), row('B：Filler 那一段宽', N('B'), 'mm'),
        row('C：Filler 厚度', N('C'), 'mm'), row('Filler 延伸（+ 向上，− 向下）', N('ext'), 'mm'),
        note('总宽 = A + B。改 A 不会改 B。'));
    }
    if (special === 'wardrobe') body.append(row('上面一排小门的高度', N('topDoor'), 'mm'), note('默认：上面一排小门、下面大门，里面一片层板、挂衣杆、一个 45° 抽屉。加进去之后可以在右边改。'));
    if (special === 'ovenMicro') body.append(note('默认由下到上：两个抽屉、Oven、Microwave、最上面一个门。加进去之后可以在右边改顺序和每段高度。'));
    body.append(note('"离起点墙角"已经帮你填好：接在这面墙最后一样东西的旁边。'));
  };
  draw();
  dlg.innerHTML = '';
  dlg.append(h('h3', {}, '加' + (special ? SPECIALS[special].label : CAB_TYPES[type])), body,
    h('div', { class: 'btns' },
      h('button', { onclick: () => dlg.close() }, '取消'),
      h('button', {
        class: 'primary', onclick: () => {
          const { offset, ...remember } = vals;
          setLast(memKey, remember);
          const cab = special ? makeSpecial(special, vals) : makeCabinet(type, vals);
          app.commit((p) => p.cabinets.push(cab));
          app.select(cab.id);
          dlg.close();
        },
      }, '加进去')));
  dlg.showModal();
}

// ---------- 冰箱、油烟机、Filler、Exposed Panel ----------
const UNIT_FIELDS = {
  fridge: [['width', '宽'], ['height', '高'], ['depth', '深'], ['elevation', '离地']],
  hood: [['width', '宽'], ['height', '总高（连烟囱）'], ['depth', '深'], ['elevation', '底离地']],
  exposed: [['width', '厚度'], ['height', '高'], ['depth', '深'], ['elevation', '离地']],
  filler: [['width', '宽'], ['height', '高'], ['thickness', '厚度'], ['front', '前面离墙'], ['elevation', '离地']],
  top: [['width', '长'], ['depth', '深'], ['thickness', '厚度'], ['elevation', '底离地']],
};
const UNIT_NAMES = { fridge: '冰箱', hood: '油烟机', exposed: 'Exposed Panel', filler: 'Filler', top: '台面板' };

function unitExtraFields(kind, vals, set) {
  const out = [];
  if (kind === 'fridge') out.push(row('款式', selInput(vals.style, FRIDGE_STYLES, (v) => set('style', v), 'u.style'), null));
  if (kind === 'hood') {
    out.push(row('款式', selInput(vals.style, HOOD_STYLES, (v) => set('style', v), 'u.style'), null));
    if (vals.style === 'island') out.push(row('离墙多远', numInput(vals.distFromWall, (v) => set('distFromWall', v), { fkey: 'u.dist' }), 'mm'));
  }
  if (kind === 'fridge' || kind === 'hood') {
    for (const [k, label] of [['brand', '牌子（文字）'], ['model', '型号（文字）']]) {
      const i = h('input', { type: 'text', value: vals[k] || '', dataset: { fkey: 'u.' + k } });
      i.addEventListener('change', () => set(k, i.value));
      out.push(row(label, i, null));
    }
  }
  return out;
}

export function openUnitDialog(app, kind) {
  const project = app.project;
  if (!project.room.walls.length) { alert('请先画墙。'); return; }
  const vals = getLast('unit.' + kind, { ...UNIT_DEFAULTS[kind] });
  if (!project.room.walls.some((w) => w.id === vals.wall)) vals.wall = project.room.walls[0].id;
  const placeDefault = () => {
    vals.offset = nextOffset(project, vals.wall, kind === 'hood');
    if (kind === 'hood') { // 默认放在炉头正上方
      const hob = project.cabinets.find((c) => c.wall === vals.wall && c.special === 'hob');
      if (hob) vals.offset = +hob.offset + +hob.width / 2 - (+vals.width) / 2;
    }
  };
  placeDefault();
  const dlg = document.getElementById('dlg');
  const body = h('div', { class: 'form' });
  const draw = () => {
    body.innerHTML = '';
    body.append(row('在哪面墙', selInput(vals.wall, wallOptions(project), (v) => { vals.wall = v; placeDefault(); draw(); }), null),
      row('离起点墙角', numInput(vals.offset, (v) => { vals.offset = v; }), 'mm'));
    for (const [k, label] of UNIT_FIELDS[kind]) body.append(row(label, numInput(vals[k], (v) => { vals[k] = v; }), 'mm'));
    body.append(...unitExtraFields(kind, vals, (k, v) => { vals[k] = v; if (k === 'style') draw(); }));
    if (kind === 'hood') body.append(note('有电气炉橱的话，默认放在炉头正上方。'));
    if (kind === 'fridge') body.append(note('只画通用款式的线条图；牌子和型号只是文字。'));
  };
  draw();
  dlg.innerHTML = '';
  dlg.append(h('h3', {}, '加' + UNIT_NAMES[kind]), body,
    h('div', { class: 'btns' },
      h('button', { onclick: () => dlg.close() }, '取消'),
      h('button', {
        class: 'primary', onclick: () => {
          const { offset, ...remember } = vals;
          setLast('unit.' + kind, remember);
          const u = makeUnit(kind, vals);
          app.commit((p) => p.cabinets.push(u));
          app.select(u.id);
          dlg.close();
        },
      }, '加进去')));
  dlg.showModal();
}

export function unitProps(el, app, u) {
  const kind = u.kind === 'panel' ? u.panelType : u.kind;
  const upd = (fn) => app.commit((p) => fn(findItem(p, u.id)));
  const set = (k, v) => { setLast('unit.' + kind, { [k]: v }); upd((x) => { x[k] = v; }); };
  el.append(h('h3', {}, UNIT_NAMES[kind]));
  const f = h('div', { class: 'form' });
  f.append(row('在哪面墙', selInput(u.wall, wallOptions(app.project), (v) => upd((x) => { x.wall = v; }), 'u.wall'), null),
    row('离起点墙角', numInput(u.offset, (v) => upd((x) => { x.offset = v; }), { fkey: 'u.off' }), 'mm'));
  for (const [k, label] of UNIT_FIELDS[kind]) f.append(row(label, numInput(u[k], (v) => set(k, v), { fkey: 'u.' + k }), 'mm'));
  f.append(...unitExtraFields(kind, u, set));
  el.append(f);
  const g = app.geom.byId[u.wall];
  if (g && (+u.offset < 0 || +u.offset + +u.width > g.L + 0.5)) el.append(warn(`超出墙 ${g.letter} 的长度`));
  el.append(h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => app.deleteSelected() }, '删除')));
}

// ---------- 台面 ----------
const CT_FIELDS = [
  ['offset', '离起点墙角'], ['length', '长度'], ['depth', '深（到柜子前面）'], ['overhang', '凸出柜子前面多少'],
  ['elevation', '垫板底离地'], ['substrateT', '垫板厚度'], ['topT', '台面厚度'], ['capFront', '前面戴帽（看起来多厚）'],
  ['slabLength', '一片板材长度'],
];

function openCtDialog(app) {
  const project = app.project;
  if (!project.room.walls.length) { alert('请先画墙。'); return; }
  const vals = getLast('countertop', { ...CT_DEFAULTS, length: 1200, depth: 560, elevation: 860, offset: 0 });
  if (!project.room.walls.some((w) => w.id === vals.wall)) vals.wall = project.room.walls[0].id;
  const dlg = document.getElementById('dlg');
  const body = h('div', { class: 'form' },
    row('在哪面墙', selInput(vals.wall, wallOptions(project), (v) => { vals.wall = v; }), null),
    ...CT_FIELDS.map(([k, label]) => row(label, numInput(vals[k], (v) => { vals[k] = v; }), 'mm')),
    row('材质', selInput(vals.material, MATERIALS, (v) => { vals.material = v; }), null));
  dlg.innerHTML = '';
  dlg.append(h('h3', {}, '加台面'), body,
    h('div', { class: 'btns' },
      h('button', { onclick: () => dlg.close() }, '取消'),
      h('button', {
        class: 'primary', onclick: () => {
          const { offset, length, ...remember } = vals;
          setLast('countertop', remember);
          const ct = makeCountertop(vals);
          app.commit((p) => p.countertops.push(ct));
          app.select(ct.id);
          dlg.close();
        },
      }, '加进去')));
  dlg.showModal();
}

export function countertopProps(el, app, ct) {
  const upd = (fn) => app.commit((p) => fn(findItem(p, ct.id)));
  const set = (k, v) => { if (!['offset', 'length'].includes(k)) setLast('countertop', { [k]: v }); upd((x) => { x[k] = v; }); };
  el.append(h('h3', {}, '台面'));
  const ends = exposedEnds(ct, app.project, app.geom);
  const capSel = (k, auto) => selInput(ct[k], { auto: `自动（现在${auto ? '见光，戴帽' : '不见光'}）`, on: '戴帽', off: '不戴帽' }, (v) => set(k, v), 'ct.' + k);
  el.append(h('div', { class: 'form' },
    row('在哪面墙', selInput(ct.wall, wallOptions(app.project), (v) => set('wall', v), 'ct.wall'), null),
    ...CT_FIELDS.map(([k, label]) => row(label, numInput(ct[k], (v) => set(k, v), { fkey: 'ct.' + k }), 'mm')),
    row('材质', selInput(ct.material, MATERIALS, (v) => set('material', v), 'ct.mat'), null),
    h('h4', {}, '两头戴帽'),
    row('左头（起点那头）', capSel('capL', ends.autoL), null),
    ends.L ? row('左头看起来多厚', numInput(ct.capLH, (v) => set('capLH', v), { fkey: 'ct.capLH' }), 'mm') : null,
    row('右头（终点那头）', capSel('capR', ends.autoR), null),
    ends.R ? row('右头看起来多厚', numInput(ct.capRH, (v) => set('capRH', v), { fkey: 'ct.capRH' }), 'mm') : null));
  const seams = seamPositions(ct);
  el.append(note(seams.length ? `接缝（直角对接）在离起点墙角 ${seams.map((s) => fmt(s)).join('、')} mm 的地方。` : '一片板就够，没有接缝。'));
  el.append(note('水盆和炉头的开孔从水盆橱、电气炉橱自动画上去。'));
  const g = app.geom.byId[ct.wall];
  if (g && (+ct.offset < 0 || +ct.offset + +ct.length > g.L + 0.5)) el.append(warn(`超出墙 ${g.letter} 的长度`));
  el.append(h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => app.deleteSelected() }, '删除')));
}

// ---------- 滑轨规格表 ----------
const SPEC_FIELDS = [['minHeight', '最小高度'], ['minDepth', '最小深度'], ['sideClear', '抽屉盒两边各留'], ['bottomClear', '抽屉盒底下留'],
  ['backClear', '抽屉盒后面留'], ['boardT', '抽屉盒板厚']];

function slideSpecTable(body, app, project) {
  const d = section(app, 'slides', `滑轨规格表（${project.slideSpecs.length} 张）`);
  d.append(note('数字全部由你自己填，工具不预设任何牌子的数字。抽屉用到哪张表，就按哪张表算。'));
  project.slideSpecs.forEach((s, k) => {
    const box = h('div', { class: 'cells' });
    const name = h('input', { type: 'text', value: s.name, dataset: { fkey: `sp${k}.name` } });
    name.addEventListener('change', () => app.commit((p) => { p.slideSpecs[k].name = name.value; }));
    box.append(h('div', { class: 'cellhead' }, name,
      selInput(s.kind, { undermount: 'Undermount Soft Close', '3section': '三节滑轨' }, (v) => app.commit((p) => { p.slideSpecs[k].kind = v; }), `sp${k}.kind`),
      h('button', { title: '存入资料库', onclick: () => { const { id, ...data } = structuredClone(s); saveDialog(app, 'slideSpec', data, s.name); } }, '★'),
      h('button', { class: 'x', onclick: () => { if (confirm(`删除"${s.name}"？`)) app.commit((p) => p.slideSpecs.splice(k, 1)); } }, '×')));
    for (const [f, label] of SPEC_FIELDS) {
      box.append(row(label, numInput(s[f], (v) => app.commit((p) => { p.slideSpecs[k][f] = v; }), { blank: true, placeholder: '未填', fkey: `sp${k}.${f}` }), 'mm'));
    }
    d.append(box);
  });
  d.append(h('div', { class: 'btnrow small' }, h('button', {
    onclick: () => app.commit((p) => p.slideSpecs.push({ id: uid('slide'), name: '新规格', kind: 'undermount', minHeight: null, minDepth: null, sideClear: null, bottomClear: null, backClear: null, boardT: null })),
  }, '+ 加一张规格表')));
  body.append(d);
}

// 可以收起来的一段，记住开关
function section(app, key, title, defaultOpen = false) {
  const open = app.ui.open?.[key] ?? defaultOpen;
  const d = h('details', { open: open || null });
  d.addEventListener('toggle', () => { app.ui.open = { ...(app.ui.open || {}), [key]: d.open }; });
  d.append(h('summary', {}, title));
  return d;
}

export function cabinetProps(el, app, cab) {
  const id = cab.id;
  const project = app.project;
  const upd = (fn) => app.commit((p) => fn(findItem(p, id)));
  const N = (v, fn, opts = {}) => numInput(v, fn, opts);
  const remember = (k, v) => setLast('cab.' + cab.type, { [k]: v });

  const spKey = cab.special === 'corner' ? (cab.type === 'upper' ? 'cornerUpper' : 'cornerBase') : cab.special;
  el.append(h('h3', {}, spKey ? SPECIALS[spKey].label : CAB_TYPES[cab.type]));
  el.append(h('div', { class: 'form' },
    row('在哪面墙', selInput(cab.wall, wallOptions(project), (v) => upd((c) => { c.wall = v; }), 'c.wall'), null),
    row('离起点墙角', N(cab.offset, (v) => upd((c) => { c.offset = v; }), { fkey: 'c.off' }), 'mm'),
    cab.special === 'corner'
      ? row('宽（= A + B）', h('span', {}, fmt(+cab.width)), 'mm')
      : row('宽', N(cab.width, (v) => { remember('width', v); upd((c) => { c.width = v; }); }, { fkey: 'c.w' }), 'mm'),
    row('高（柜身）', N(cab.height, (v) => { remember('height', v); upd((c) => { c.height = v; }); }, { fkey: 'c.h' }), 'mm'),
    row('深', N(cab.depth, (v) => { remember('depth', v); upd((c) => { c.depth = v; }); }, { fkey: 'c.d' }), 'mm'),
    row(ELEV_LABEL[cab.type], N(cab.elevation, (v) => { remember('elevation', v); upd((c) => { c.elevation = v; }); }, { fkey: 'c.e' }), 'mm')));
  const g = app.geom.byId[cab.wall];
  if (g) {
    if (+cab.offset < 0 || +cab.offset + +cab.width > g.L + 0.5) el.append(warn(`超出墙 ${g.letter} 的长度（墙长 ${fmt(g.L)} mm）`));
    const upper = cab.type === 'upper';
    const hit = project.cabinets.find((c) => c.id !== id && c.wall === cab.wall && isUpperLevel(c) === upper && c.kind !== 'panel'
      && +c.offset < +cab.offset + +cab.width - 0.5 && +c.offset + +c.width > +cab.offset + 0.5);
    if (hit) el.append(warn('和旁边的东西重叠了'));
    const top = +cab.elevation + +cab.height;
    if (top > app.geom.H + 0.5) el.append(warn(`比天花高 ${fmt(top - app.geom.H)} mm`));
    if (cab.special === 'sink') for (const t of waterWarnings(project, cab)) el.append(warn(t));
  }

  // ---------- 特别的柜子 ----------
  if (cab.special === 'sink') {
    const s = cab.sink;
    const S = (k, v) => { setLast('cab.sink', { [k === 'type' ? 'sinkType' : k === 'width' ? 'sinkWidth' : k === 'depth' ? 'sinkDepth' : k]: v }); upd((c) => { c.sink[k] = v; }); };
    const box = section(app, 'sink', '水盆', true);
    box.append(h('div', { class: 'form' },
      row('水盆', selInput(s.type, SINK_TYPES, (v) => S('type', v), 's.type'), null),
      row('水盆宽', N(s.width, (v) => S('width', v), { fkey: 's.w' }), 'mm'),
      row('水盆深', N(s.depth, (v) => S('depth', v), { fkey: 's.d' }), 'mm'),
      row('偏离中间（+ 往右，− 往左）', N(s.offset, (v) => S('offset', v), { fkey: 's.off' }), 'mm'),
      s.type === 'farmhouse' ? row('盆前面露出来的高度', N(s.apronHeight, (v) => S('apronHeight', v), { fkey: 's.ah' }), 'mm') : null,
      s.type === 'farmhouse' ? row('比门板凸出', N(s.protrude, (v) => S('protrude', v), { fkey: 's.pr' }), 'mm') : null,
      note(s.type === 'farmhouse' ? 'Farmhouse：盆前面露在外面，柜子前面上面那一段切开。' : 'Undermount：装在台面下面，台面上画开孔。')));
    el.append(box);
  }
  if (cab.special === 'hob') {
    const box = section(app, 'hob', '电磁炉（台面开孔）', true);
    const S = (k, v) => upd((c) => { c.hob[k] = v; });
    box.append(h('div', { class: 'form' },
      row('开孔宽', N(cab.hob.width, (v) => S('width', v), { fkey: 'hb.w' }), 'mm'),
      row('开孔深', N(cab.hob.depth, (v) => S('depth', v), { fkey: 'hb.d' }), 'mm'),
      row('偏离中间（+ 往右，− 往左）', N(cab.hob.offset, (v) => S('offset', v), { fkey: 'hb.off' }), 'mm')));
    el.append(box);
  }
  if (cab.special === 'corner') {
    const k = cab.corner;
    const S = (f, v) => { setLast('cab.' + spKey, { [f === 'side' ? 'cornerSide' : f]: v }); upd((c) => { c.corner[f] = v; c.width = +c.corner.A + +c.corner.B; }); };
    const box = section(app, 'corner', '转角', true);
    box.append(h('div', { class: 'form' },
      row('左/右', selInput(k.side, { R: '右转角（门在左，Filler 在右）', L: '左转角（Filler 在左，门在右）' }, (v) => S('side', v), 'k.side'), null),
      row('A：门板那一段宽', N(k.A, (v) => S('A', v), { fkey: 'k.A' }), 'mm'),
      row('B：Filler 那一段宽', N(k.B, (v) => S('B', v), { fkey: 'k.B' }), 'mm'),
      row('C：Filler 厚度', N(k.C, (v) => S('C', v), { fkey: 'k.C' }), 'mm'),
      row('Filler 延伸（+ 向上，− 向下）', N(k.ext, (v) => S('ext', v), { fkey: 'k.ext' }), 'mm'),
      note(`Filler 高度 = 柜高 ${fmt(+cab.height)} ${+k.ext >= 0 ? '+' : '−'} ${fmt(Math.abs(+k.ext))} = ${fmt(+cab.height + Math.abs(+k.ext))} mm。延伸多少全部由你填，工具不会自动算到天花或 ABS 脚。`)));
    el.append(box);
  }
  if (cab.special === 'ovenMicro') el.append(note('Oven / Microwave 空位：在柜面里选"Oven 空位"或"Microwave 空位"，那一行的高度就是空位高度，上下自动各夹一片层板。'));

  // ---------- 柜面 ----------
  const sFace = section(app, 'face', '柜面（门和抽屉）', true);
  sFace.append(faceEditor(app, cab, upd));
  el.append(sFace);

  // ---------- 每一片板 ----------
  const sPanels = section(app, 'panels', '每一片板');
  const follow = { blank: true, placeholder: '跟柜子' };
  const sideRows = (key, label) => [
    h('h4', {}, label),
    row('厚度', N(cab[key].t, (v) => upd((c) => { c[key].t = v; }), { fkey: key + '.t' }), 'mm'),
    row('深度', N(cab[key].depth, (v) => upd((c) => { c[key].depth = v; }), { ...follow, fkey: key + '.d' }), 'mm'),
    row('高度', N(cab[key].height, (v) => upd((c) => { c[key].height = v; }), { ...follow, fkey: key + '.h' }), 'mm'),
    row('离柜底（负数 = 往下长出来）', N(cab[key].bottom, (v) => upd((c) => { c[key].bottom = v; }), { fkey: key + '.b' }), 'mm'),
  ];
  sPanels.append(h('div', { class: 'form' },
    ...sideRows('sideL', '左侧板'),
    ...sideRows('sideR', '右侧板'),
    h('h4', {}, '底板'),
    row('厚度', N(cab.bottom.t, (v) => upd((c) => { c.bottom.t = v; }), { fkey: 'b.t' }), 'mm'),
    row('深度', N(cab.bottom.depth, (v) => upd((c) => { c.bottom.depth = v; }), { ...follow, fkey: 'b.d' }), 'mm'),
    row('抬高（从柜底）', N(cab.bottom.raise, (v) => upd((c) => { c.bottom.raise = v; }), { fkey: 'b.r' }), 'mm'),
    h('h4', {}, '顶部'),
    row('做法', selInput(cab.top.mode, { rails: '两条横板（前后各一条，中间空）', full: '整片顶板' }, (v) => upd((c) => { c.top.mode = v; }), 'top.m'), null),
    row('厚度', N(cab.top.t, (v) => upd((c) => { c.top.t = v; }), { fkey: 'top.t' }), 'mm'),
    cab.top.mode === 'rails' ? row('横板宽度', N(cab.top.railWidth, (v) => upd((c) => { c.top.railWidth = v; }), { fkey: 'top.rw' }), 'mm') : null,
    h('h4', {}, '背板'),
    row('厚度', N(cab.back.t, (v) => upd((c) => { c.back.t = v; }), { fkey: 'bk.t' }), 'mm'),
    row('缩进多少（离柜子后面）', N(cab.back.inset, (v) => upd((c) => { c.back.inset = v; }), { fkey: 'bk.i' }), 'mm')));
  el.append(sPanels);

  // ---------- 竖隔板、层板 ----------
  const sInside = section(app, 'inside', `里面：竖隔板 ${cab.dividers.length}、层板 ${cab.shelves.length}`);
  const ins = h('div', { class: 'form' });
  ins.append(h('h4', {}, '竖隔板'));
  cab.dividers.forEach((dv, k) => {
    ins.append(h('div', { class: 'cell' },
      h('span', { class: 'mini' }, `#${k + 1} 离柜左边`),
      N(dv.x, (v) => upd((c) => { c.dividers[k].x = v; }), { blank: true, placeholder: '平分', fkey: `dv${k}.x` }),
      h('span', { class: 'mini' }, '厚'),
      N(dv.t, (v) => upd((c) => { c.dividers[k].t = v; }), { fkey: `dv${k}.t` }),
      h('button', { class: 'x', onclick: () => upd((c) => { c.dividers.splice(k, 1); c.shelves.forEach((s) => { if (s.bay != null && s.bay > c.dividers.length) s.bay = null; }); }) }, '×')));
  });
  ins.append(h('div', { class: 'btnrow small' }, h('button', { onclick: () => upd((c) => c.dividers.push({ x: null, t: 18 })) }, '+ 加竖隔板')));
  ins.append(h('h4', {}, '层板'));
  const bayOpts = { '': '每一格都有' };
  for (let k = 0; k <= cab.dividers.length; k++) bayOpts[k] = `只在第 ${k + 1} 格（从左数）`;
  cab.shelves.forEach((s, k) => {
    ins.append(h('div', { class: 'cell' },
      h('span', { class: 'mini' }, `#${k + 1} 高度`),
      N(s.y, (v) => upd((c) => { c.shelves[k].y = v; }), { blank: true, placeholder: '平均', fkey: `sh${k}.y` }),
      h('span', { class: 'mini' }, '厚'),
      N(s.t, (v) => upd((c) => { c.shelves[k].t = v; }), { fkey: `sh${k}.t` }),
      cab.dividers.length ? selInput(s.bay ?? '', bayOpts, (v) => upd((c) => { c.shelves[k].bay = v === '' ? null : Number(v); }), `sh${k}.bay`) : null,
      h('button', { class: 'x', onclick: () => upd((c) => c.shelves.splice(k, 1)) }, '×')));
  });
  ins.append(h('div', { class: 'btnrow small' }, h('button', { onclick: () => upd((c) => c.shelves.push({ y: null, t: 18, bay: null })) }, '+ 加层板')));
  ins.append(note('层板高度 = 从底板上面量到层板下面。留空 = 平均分布。竖隔板位置 = 从柜子最左边量到隔板中间。'));
  sInside.append(ins);
  el.append(sInside);

  // ---------- 配件 ----------
  const accs = cab.accessories || [];
  const sAcc = section(app, 'acc', `配件（${accs.length}）`);
  const af = h('div', { class: 'form' });
  const bayOpts2 = {};
  for (let k = 0; k <= cab.dividers.length; k++) bayOpts2[k] = `第 ${k + 1} 格`;
  accs.forEach((a, k) => {
    const A = (f, v) => upd((c) => { c.accessories[k][f] = v; });
    const B = (v, f, ph) => N(v, (x) => A(f, x), { blank: true, placeholder: ph, fkey: `acc${k}.${f}` });
    af.append(h('div', { class: 'cells' },
      h('div', { class: 'cellhead' }, selInput(a.type, ACCESSORY_TYPES, (v) => A('type', v), `acc${k}.type`),
        cab.dividers.length ? selInput(a.bay ?? 0, bayOpts2, (v) => A('bay', Number(v)), `acc${k}.bay`) : null,
        h('button', { title: '存入资料库', onclick: () => saveDialog(app, 'accessory', structuredClone(a), ACCESSORY_TYPES[a.type]) }, '★'),
        h('button', { class: 'x', onclick: () => upd((c) => c.accessories.splice(k, 1)) }, '×')),
      ...accessoryRows(a, B, (f, v) => A(f, v), k)));
  });
  af.append(h('div', { class: 'btnrow small' },
    ...Object.entries(ACCESSORY_TYPES).map(([t, label]) => h('button', { onclick: () => upd((c) => { (c.accessories ||= []).push({ type: t, bay: 0, y: null, height: null, width: null, depth: null }); }) }, '+ ' + label))));
  af.append(note('配件尺寸由你自己填（煤气桶大小不预设）。留空 = 跟着格子或柜子。高度都从底板上面量起。开门或开放柜才看得到。'));
  sAcc.append(af);
  el.append(sAcc);

  // ---------- 饰面 ----------
  const sFin = section(app, 'finish', '饰面编号 / 封边');
  const fin = cab.finish || {};
  const txt = (val, ph, fn, fk) => { const i = h('input', { type: 'text', value: val || '', placeholder: ph, dataset: { fkey: fk } }); i.addEventListener('change', () => fn(i.value)); return i; };
  const pf = project.finish || {};
  sFin.append(h('div', { class: 'form' },
    row('饰面编号', txt(fin.code, pf.code ? `跟项目：${pf.code}` : '跟项目', (v) => upd((c) => { c.finish = { ...(c.finish || {}), code: v }; }), 'fin.code'), null),
    row('封边 EDL', txt(fin.edl, pf.edl ? `跟项目：${pf.edl}` : '跟项目', (v) => upd((c) => { c.finish = { ...(c.finish || {}), edl: v }; }), 'fin.edl'), null),
    note('留空 = 跟整个项目的饰面（左边"柜子"分页里设）。图上的红字说明在下一个阶段做。')));
  el.append(sFin);

  // ---------- 踢脚 ----------
  if (cab.type !== 'upper') {
    const sKick = section(app, 'kick', '踢脚板 / ABS 脚');
    const cb = h('input', { type: 'checkbox', checked: !!cab.kick.board });
    cb.addEventListener('change', () => upd((c) => { c.kick.board = cb.checked; }));
    const legs = h('input', { type: 'checkbox', checked: !!cab.kick.legs });
    legs.addEventListener('change', () => upd((c) => { c.kick.legs = legs.checked; }));
    sKick.append(h('div', { class: 'form' },
      h('label', { class: 'row' }, cb, h('span', {}, '这个柜子前面有踢脚板（不勾 = 这里断开）')),
      row('位置', selInput(cab.kick.position, { recess: '缩进去（和橱身前面平）', flush: '凸出来（和门板前面平）' }, (v) => upd((c) => { c.kick.position = v; }), 'k.pos'), null),
      row('踢脚板厚度', N(cab.kick.thickness, (v) => upd((c) => { c.kick.thickness = v; }), { fkey: 'k.t' }), 'mm'),
      h('label', { class: 'row' }, legs, h('span', {}, '画出 ABS 脚')),
      note(`踢脚高度 = 上面的"${ELEV_LABEL[cab.type]}"。相邻柜子的踢脚板会自动连成一整条。`)));
    el.append(sKick);
  }

  el.append(h('div', { class: 'btnrow' },
    h('button', {
      onclick: () => {
        const copy = structuredClone(cab);
        copy.id = uid('cab');
        copy.offset = +cab.offset + +cab.width;
        app.commit((p) => p.cabinets.push(copy));
        app.select(copy.id);
      },
    }, '复制一个（放在右边）'),
    h('button', { class: 'danger', onclick: () => app.deleteSelected() }, '删除')));
}

// 柜面拼块编辑：一行行（由上到下），每行几块（由左到右）
function faceEditor(app, cab, upd) {
  const box = h('div', { class: 'cells' });
  const rows = cab.face.rows;
  const R = (fn) => upd((c) => fn(c.face.rows, c));
  const N = (v, fn, opts) => numInput(v, fn, opts);

  const presetSel = selInput('', { '': '换成…', ...FACE_PRESETS[cab.type] }, (v) => { if (v) R((r, c) => r.splice(0, r.length, ...facePreset(c.type, v))); }, 'face.preset');
  box.append(h('div', { class: 'btnrow small' }, h('span', { class: 'mini' }, '快捷：'), presetSel,
    h('span', { class: 'mini' }, '缝'), N(cab.face.gap, (v) => upd((c) => { c.face.gap = v; }), { fkey: 'face.gap' }), h('span', { class: 'mini' }, 'mm')));

  // 全部一起改
  const all = (fn) => R((r) => r.forEach((rw) => rw.cells.forEach(fn)));
  box.append(h('div', { class: 'btnrow small' },
    h('span', { class: 'mini' }, '全部一起改：'),
    selInput('', { '': '门板款式…', flat: '平板', frame: '有边框' }, (v) => { if (v) all((cl) => { cl.style = v; }); }, 'all.style'),
    selInput('', { '': '拉手…', ...HANDLE_TYPES }, (v) => { if (v) all((cl) => { cl.handle = { ...(cl.handle || {}), type: v }; }); }, 'all.handle'),
    (() => { const fs = loadLib().entries.filter((e) => e.type === 'frontStyle'); return fs.length ? selInput('', { '': '资料库里的款式…', ...Object.fromEntries(fs.map((e) => [e.id, e.name])) }, (v) => { const e = fs.find((x) => x.id === v); if (e) upd((c) => applyFrontStyle(c, e.data)); }, 'all.lib') : null; })()));

  rows.forEach((rw, ri) => {
    const rb = h('div', { class: 'cellrow' });
    rb.append(h('div', { class: 'cellhead' },
      h('b', {}, `第 ${ri + 1} 行${rows.length > 1 ? (ri === 0 ? '（最上）' : ri === rows.length - 1 ? '（最下）' : '') : ''}`),
      h('span', { class: 'mini' }, '高'),
      N(rw.h, (v) => R((r) => { r[ri].h = v; }), { blank: true, placeholder: '平分', fkey: `f.r${ri}.h` }),
      h('button', { title: '这一行加一块', onclick: () => R((r, c) => r[ri].cells.push(makeFront(c.type, 'door', 'R'))) }, '+块'),
      h('button', { class: 'x', title: '删除这一行', onclick: () => R((r) => r.splice(ri, 1)) }, '×')));
    rw.cells.forEach((cl, ci) => {
      const key = `${cab.id}.${ri}.${ci}`;
      const more = app.ui.cellMore === key;
      const cr = h('div', { class: 'cell' });
      cr.append(h('span', { class: 'mini' }, `块 ${ci + 1} 宽`),
        N(cl.w, (v) => R((r) => { r[ri].cells[ci].w = v; }), { blank: true, placeholder: '平分', fkey: `f.r${ri}.c${ci}.w` }),
        selInput(cl.type, FRONT_TYPES, (v) => R((r, c) => {
          const x = r[ri].cells[ci];
          const wasDrawer = x.type === 'drawer';
          x.type = v;
          if ((v === 'drawer') !== wasDrawer) x.handle = { ...defaultHandle(c.type, v), type: x.handle?.type || 'bar' };
        }), `f.r${ri}.c${ci}.t`));
      if (cl.type === 'door' || cl.type === 'glass' || cl.type === 'fake') {
        cr.append(selInput(cl.hinge, { L: '铰链左', R: '铰链右' }, (v) => R((r) => { r[ri].cells[ci].hinge = v; }), `f.r${ri}.c${ci}.hg`));
      }
      cr.append(h('button', { title: '门板款式、拉手', onclick: () => { app.ui.cellMore = more ? null : key; app.refreshPanels(); } }, more ? '收起' : '更多…'));
      if (rw.cells.length > 1) cr.append(h('button', { class: 'x', onclick: () => R((r) => r[ri].cells.splice(ci, 1)) }, '×'));
      rb.append(cr);
      if (more) rb.append(frontDetails(cl, (fn) => R((r) => fn(r[ri].cells[ci])), `f.r${ri}.c${ci}`, { app, cab, ri, ci }));
    });
    box.append(rb);
  });
  box.append(h('div', { class: 'btnrow small' },
    h('button', { onclick: () => R((r, c) => r.push({ h: null, cells: [makeFront(c.type, 'drawer')] })) }, '+ 加一行（往下）')));
  box.append(note('高度、宽度留空 = 平分。假门看起来像门，但不会打开。'));
  return box;
}

function frontDetails(cl, set, fk, ctx) {
  const d = h('div', { class: 'form more' });
  const N = (v, fn, k) => numInput(v, fn, { fkey: `${fk}.${k}` });
  if (cl.type === 'oven' || cl.type === 'microwave') {
    d.append(note('电器空位：那一行的高度 = 空位高度。'));
    return d;
  }
  if (cl.type === 'drawer') drawerDetails(d, cl, set, fk, ctx);
  if (cl.type === 'door' || cl.type === 'glass') {
    d.append(row('图上开门', selInput(cl.open || 'auto', { auto: '跟"全部打开"', open: '这扇打开', closed: '这扇关着' }, (v) => set((x) => { x.open = v === 'auto' ? undefined : v; }), `${fk}.open`), null));
  }
  d.append(row('门板款式', selInput(cl.style, { flat: '平板', frame: '有边框' }, (v) => set((x) => { x.style = v; }), `${fk}.st`), null));
  d.append(row('门板厚度', N(cl.thickness, (v) => set((x) => { x.thickness = v; }), 'th'), 'mm'));
  if (cl.style === 'frame' || cl.type === 'glass') {
    d.append(row('边框宽度', N(cl.frameWidth, (v) => set((x) => { x.frameWidth = v; }), 'fw'), 'mm'));
    if (cl.type !== 'glass') {
      d.append(row('中间那块', selInput(cl.panelMode, { recess: '凹进去', raised: '凸出来' }, (v) => set((x) => { x.panelMode = v; }), `${fk}.pm`), null));
      d.append(row(cl.panelMode === 'raised' ? '凸出多少' : '凹进去多少', N(cl.panelDepth, (v) => set((x) => { x.panelDepth = v; }), 'pd'), 'mm'));
    }
  }
  const hd = cl.handle || { type: 'none' };
  d.append(row('拉手', selInput(hd.type, HANDLE_TYPES, (v) => set((x) => { x.handle = { ...hd, type: v }; }), `${fk}.ht`), null));
  if (['bar', 'recessed'].includes(hd.type)) {
    d.append(row('方向', selInput(hd.orient || 'auto', { auto: '自动', h: '横装', v: '竖装' }, (v) => set((x) => { x.handle = { ...hd, orient: v }; }), `${fk}.ho`), null));
  }
  if (hd.type === 'bar') d.append(row('拉手长度', N(hd.length, (v) => set((x) => { x.handle = { ...hd, length: v }; }), 'hl'), 'mm'));
  if (ctx?.app && cl.type !== 'oven' && cl.type !== 'microwave') d.append(h('div', { class: 'btnrow small' }, h('button', { onclick: () => saveDialog(ctx.app, 'frontStyle', frontStyleOf(cl), `${cl.style === 'frame' ? '有边框' : '平板'} · ${HANDLE_TYPES[hd.type] || ''}`) }, '★ 把这个门板款式和拉手存入资料库')));
  return d;
}

// 水盆橱：进水或排水超过了隔壁那个橱才提醒
function waterWarnings(project, cab) {
  let a = +cab.offset, b = a + +cab.width;
  const same = project.cabinets.filter((c) => c.wall === cab.wall && c.id !== cab.id && c.kind === 'cabinet' && c.type !== 'upper');
  const left = same.find((c) => Math.abs(+c.offset + +c.width - a) < 2);
  const right = same.find((c) => Math.abs(+c.offset - b) < 2);
  if (left) a = +left.offset;
  if (right) b = +right.offset + +right.width;
  const names = { waterIn: '进水', drainWall: '排水（墙上）', drainFloor: '排水（地上）' };
  return project.wallItems
    .filter((it) => it.wall === cab.wall && names[it.kind] && (+it.offset < a - 0.5 || +it.offset > b + 0.5))
    .map((it) => `${names[it.kind]}（离起点墙角 ${fmt(+it.offset)} mm）超过了隔壁那个橱`);
}

// 抽屉：滑轨规格表、抽屉盒、里面能用的空间
function drawerDetails(d, cl, set, fk, { app, cab, ri, ci }) {
  const specs = app.project.slideSpecs || [];
  const spec = specs.find((s) => s.id === cl.slide) || specs[0];
  const built = buildCabinet(cab);
  const f = built.fronts.find((x) => x.ri === ri && x.ci === ci);
  if (!f) return;
  const cx = (f.x0 + f.x1) / 2;
  const bay = built.bays.find(([p, q]) => cx >= p && cx <= q) || [built.inner.xi0, built.inner.xi1];
  const openW = bay[1] - bay[0];
  const innerD = +cab.depth - built.inner.zIn0;
  const v = (k) => (spec && spec[k] != null && spec[k] !== '' ? Number(spec[k]) : 0);
  const autoH = Math.max(0, f.y1 - f.y0 - 40);
  const autoD = Math.max(0, innerD - v('backClear'));
  const boxH = cl.boxH == null || cl.boxH === '' ? autoH : Number(cl.boxH);
  const boxD = cl.boxD == null || cl.boxD === '' ? autoD : Number(cl.boxD);
  const boxW = openW - 2 * v('sideClear');
  const t = v('boardT');
  d.append(h('h4', {}, '抽屉盒'));
  d.append(row('滑轨', selInput(spec?.id || '', Object.fromEntries(specs.map((s) => [s.id, s.name])), (val) => set((x) => { x.slide = val; }), `${fk}.slide`), null));
  d.append(row('抽屉盒高', numInput(cl.boxH, (val) => set((x) => { x.boxH = val; }), { blank: true, placeholder: `自动 ${fmt(autoH)}`, fkey: `${fk}.bh` }), 'mm'));
  d.append(row('抽屉盒深', numInput(cl.boxD, (val) => set((x) => { x.boxD = val; }), { blank: true, placeholder: `自动 ${fmt(autoD)}`, fkey: `${fk}.bd` }), 'mm'));
  d.append(h('div', { class: 'ok' }, `里面能用的空间：宽 ${fmt(boxW - 2 * t)} × 深 ${fmt(boxD - 2 * t)} × 高 ${fmt(boxH - t)} mm`));
  if (spec) {
    const blanks = ['minHeight', 'minDepth', 'sideClear', 'bottomClear', 'backClear', 'boardT'].filter((k) => spec[k] == null || spec[k] === '');
    if (blanks.length) d.append(note(`"${spec.name}"规格表还有 ${blanks.length} 个数字没填（在左边"柜子"最下面），没填的当 0 算。`));
    if (spec.minHeight != null && spec.minHeight !== '' && boxH < +spec.minHeight) d.append(warn(`抽屉盒比"${spec.name}"的最小高度 ${spec.minHeight} 还矮`));
    if (spec.minDepth != null && spec.minDepth !== '' && boxD < +spec.minDepth) d.append(warn(`抽屉盒比"${spec.name}"的最小深度 ${spec.minDepth} 还浅`));
  }
}

// 每种配件要填的数字
function accessoryRows(a, B, set, k) {
  const C = (...kids) => h('div', { class: 'cell' }, ...kids);
  const m = (t) => h('span', { class: 'mini' }, t);
  switch (a.type) {
    case 'rail':
      return [C(m('离底板高度'), B(a.y, 'y', '层板下 80'))];
    case 'innerDrawer':
      return [C(m('几个'), B(a.count, 'count', '1'), m('每个高'), B(a.height, 'height', '250')), C(m('离底板'), B(a.y, 'y', '0'))];
    case 'mirror':
      return [C(m('离底板'), B(a.y, 'y', '40'), m('高'), B(a.height, 'height', '600')), C(m('宽'), B(a.width, 'width', '跟格子'))];
    case 'ironing':
      return [C(m('离底板'), B(a.y, 'y', '40'), m('位置高'), B(a.height, 'height', '250'))];
    case 'led':
      return [C(selInput(a.position || 'sides', LED_POSITIONS, (v) => set('position', v), `acc${k}.pos`)),
        (a.position || 'sides') === 'under'
          ? C(m('离底板高度'), B(a.y, 'y', '最上面'))
          : C(m('前面进去'), B(a.inset, 'inset', '75'))];
    default:
      return [
        C(m('离底板'), B(a.y, 'y', '40'), m('高'), B(a.height, 'height', '自动')),
        C(m('宽'), B(a.width, 'width', '跟格子'), m('深'), B(a.depth, 'depth', '跟柜子')),
        a.type === 'basket2' ? C(m('两层间距'), B(a.tierGap, 'tierGap', '250')) : null,
      ];
  }
}

// 整个项目的饰面
export function finishSection(body, app, project) {
  const f = project.finish || {};
  const txt = (val, fn, fk) => { const i = h('input', { type: 'text', value: val || '', dataset: { fkey: fk } }); i.addEventListener('change', () => fn(i.value)); return i; };
  const d = section(app, 'pfinish', '饰面编号（整个项目）');
  d.append(h('div', { class: 'form' },
    row('饰面编号', txt(f.code, (v) => app.commit((p) => { p.finish = { ...(p.finish || {}), code: v }; }), 'pf.code'), null),
    row('封边 EDL', txt(f.edl, (v) => app.commit((p) => { p.finish = { ...(p.finish || {}), edl: v }; }), 'pf.edl'), null),
    note('例：S-MY 57005 YM (ALMOND MILK)。个别柜子不一样，可以在那个柜子里另外填。')));
  body.append(d);
}
