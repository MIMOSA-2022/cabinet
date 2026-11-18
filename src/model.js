// 项目数据结构、默认值、"上一次填的"记忆。
// 所有尺寸单位都是 mm。

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);

export function wallLetter(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export const WINDOW_STYLES = {
  casement: 'Casement（平开）',
  multipoint: 'Casement Multi-Point',
  fixed: 'Fixed（固定）',
  sliding: '推拉',
  louver: '百叶',
};

export const DOOR_TYPES = {
  alu: '铝合金门',
  woodBeading: '木门，有 Beading',
  wood: '木门，无 Beading',
  opening: '门洞（没有门）',
};

export const CEILING_KINDS = {
  pelmet: 'Pelmet（窗帘盒）',
  beam: 'Beam（横梁）',
  column: '柱子',
};

export const WALL_ITEM_KINDS = {
  socket: '插座',
  switch: '开关钮',
  waterIn: '水喉进水',
  drainWall: '水喉排水（墙上）',
  drainFloor: '水喉排水（地上）',
};

// ---------- "上一次填的"记忆 ----------
const LAST_KEY = 'cabinet.lastUsed.v1';
function readLast() {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}'); } catch { return {}; }
}
export function getLast(kind, fallback) {
  const all = readLast();
  return { ...fallback, ...(all[kind] || {}) };
}
export function setLast(kind, values) {
  try {
    const all = readLast();
    all[kind] = { ...(all[kind] || {}), ...values };
    localStorage.setItem(LAST_KEY, JSON.stringify(all));
  } catch { /* 浏览器不让存就算了 */ }
}

// ---------- 默认值 ----------
export const DEFAULTS = {
  wallThickness: 150,
  ceilingHeight: 2800,
  window: { width: 1200, height: 1200, sill: 900, offset: 300, style: 'casement',
    frameOffset: 50, frameDepth: 50, frameWidth: 40 },
  door: { width: 900, height: 2100, offset: 300, doorType: 'wood', leaves: 1, hinge: 'L',
    swing: 'in', operation: 'swing', beadingWidth: 60, beadingThickness: 15, leafThickness: 40,
    frameOffset: 50, frameDepth: 50, frameWidth: 40 },
  pelmet: { offset: 0, length: 1500, drop: 150, projection: 150 },
  beam: { offset: 0, length: 1500, drop: 300, projection: 200 },
  column: { offset: 0, width: 300, depth: 300 },
  socket: { offset: 500, height: 1100 },
  switch: { offset: 500, height: 1300 },
  waterIn: { offset: 500, height: 500 },
  drainWall: { offset: 500, height: 400 },
  drainFloor: { offset: 500, distFromWall: 300 },
};

export function makeWall(length, thickness = DEFAULTS.wallThickness) {
  return { id: uid('w'), length, thickness, turn: 'R', angle: 90 };
}

export function rectWalls(a, b, t) {
  return [makeWall(a, t), makeWall(b, t), makeWall(a, t), makeWall(b, t)];
}

export function newProject() {
  return {
    version: 1,
    name: '新项目',
    room: {
      ceilingHeight: DEFAULTS.ceilingHeight,
      startAngle: 0,
      defaultThickness: DEFAULTS.wallThickness,
      walls: rectWalls(3600, 2400, DEFAULTS.wallThickness),
    },
    openings: [],
    ceilingItems: [],
    wallItems: [],
    finish: { code: '', edl: '' }, // 饰面编号、封边（整个项目）
    view: { openAll: false, openAngle: 45, showDims: true, pdfOpen: true },
    dimSettings: {}, // 每面墙：哪些尺寸关掉、每一排放多远
    notes: [], // 红字说明
    cabinets: [],
    countertops: [],
    slideSpecs: defaultSlideSpecs(),
  };
}

// 滑轨规格表：只有名字，数字全部由使用者自己填（不预设任何牌子的数字）
export function defaultSlideSpecs() {
  const blank = { minHeight: null, minDepth: null, sideClear: null, bottomClear: null, backClear: null, boardT: null };
  return [
    { id: uid('slide'), name: 'Undermount Soft Close', kind: 'undermount', ...blank },
    { id: uid('slide'), name: '三节滑轨', kind: '3section', ...blank },
  ];
}

// 旧的项目文件没有柜子那一栏，补上
export function upgradeProject(p) {
  if (!Array.isArray(p.cabinets)) p.cabinets = [];
  if (!Array.isArray(p.countertops)) p.countertops = [];
  if (!Array.isArray(p.slideSpecs)) p.slideSpecs = defaultSlideSpecs();
  if (!p.finish) p.finish = { code: '', edl: '' };
  if (!p.view) p.view = { openAll: false, openAngle: 45, showDims: true, pdfOpen: true };
  if (!p.dimSettings) p.dimSettings = {};
  if (!Array.isArray(p.notes)) p.notes = [];
  return p;
}

// 窗的格子：rows 由上到下，每一行 cells 由左到右。h / w 留空 (null) = 平分。
export function windowLayout(preset, style = 'casement') {
  const cell = (s, hinge = 'L') => ({ w: null, style: s, hinge });
  switch (preset) {
    case 'bottomOpen': // 下面开、上面固定
      return [{ h: null, cells: [cell('fixed')] }, { h: null, cells: [cell(style)] }];
    case 'leftOpen': // 左边开、右边固定
      return [{ h: null, cells: [cell(style, 'L'), cell('fixed')] }];
    default:
      return [{ h: null, cells: [cell(style)] }];
  }
}

// 留空的平分剩下的。给出的数字加起来超过总数时不改使用者的数字，只回报 over。
export function resolveSizes(list, total) {
  const fixed = list.reduce((s, x) => s + (x == null || x === '' ? 0 : Number(x)), 0);
  const free = list.filter((x) => x == null || x === '').length;
  const rest = Math.max(0, total - fixed);
  const each = free ? rest / free : 0;
  const sizes = list.map((x) => (x == null || x === '' ? each : Number(x)));
  const sum = sizes.reduce((a, b) => a + b, 0);
  return { sizes, over: sum - total };
}

export function findWall(project, wallId) {
  return project.room.walls.find((w) => w.id === wallId);
}

export function allItems(project) {
  return [...project.openings, ...project.ceilingItems, ...project.wallItems, ...(project.cabinets || []), ...(project.countertops || []), ...(project.notes || [])];
}

export function findItem(project, id) {
  return allItems(project).find((x) => x.id === id);
}

export function itemLabel(project, item) {
  const idx = project.room.walls.findIndex((w) => w.id === item.wall);
  const letter = idx >= 0 ? wallLetter(idx) : '?';
  if (item.kind === 'window') return `窗 · 墙 ${letter} · ${item.width}×${item.height}${item.corner ? ' · 转角' : ''}`;
  if (item.kind === 'door') return `${DOOR_TYPES[item.doorType]} · 墙 ${letter} · ${item.width}×${item.height}`;
  if (CEILING_KINDS[item.kind]) return `${CEILING_KINDS[item.kind]} · 墙 ${letter}`;
  if (WALL_ITEM_KINDS[item.kind]) return `${WALL_ITEM_KINDS[item.kind]} · 墙 ${letter}`;
  if (item.kind === 'cabinet') {
    const sp = { sink: '水盆橱', hob: '电气炉橱', ovenMicro: 'Oven Microwave 橱', corner: item.type === 'upper' ? '上座转角橱' : '下座转角橱' }[item.special];
    return `${sp || { base: '下座橱', upper: '上座橱', tall: '高橱' }[item.type]} · 墙 ${letter} · ${item.width}×${item.height}×${item.depth}`;
  }
  if (item.kind === 'fridge') return `冰箱 · 墙 ${letter} · ${item.width}×${item.height}${item.brand ? ' · ' + item.brand : ''}`;
  if (item.kind === 'hood') return `油烟机 · 墙 ${letter} · ${item.width}`;
  if (item.kind === 'panel') return `${{ filler: 'Filler', exposed: 'Exposed Panel', top: '台面板' }[item.panelType]} · 墙 ${letter} · ${item.width}${item.panelType === 'top' ? '' : '×' + item.height}`;
  if (item.kind === 'countertop') return `台面 · 墙 ${letter} · 长 ${Math.round(item.length)}`;
  if (item.kind === 'note') return `说明 · 墙 ${letter} · ${(item.text || '').split('\n')[0]}`;
  return item.kind;
}
