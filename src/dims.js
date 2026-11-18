// 3D 图上自动标的蓝色尺寸线（每面墙一套）。
// 全部从柜子的数字算出来：改柜子，尺寸跟着变。
// 每一排叫一个 chain；每一段可以单独关，每一排可以移动（offset，单位 mm）。

import { buildUnit } from './units.js';
import { cabToWall } from './cabinet.js';
import { exposedEnds } from './countertop.js';

const num = (x, f) => (x == null || x === '' ? f : Number(x));
const isUpper = (c) => (c.kind === 'cabinet' && c.type === 'upper') || c.kind === 'hood';

export const CHAIN_NAMES = {
  bottom: '下面：每个柜子的宽度',
  total: '下面：总宽度',
  top: '上面：上座橱的宽度',
  left: '左边：每一段的高度',
  leftCounter: '左边：台面高度',
  leftTotal: '左边：总高度',
  right: '右边：每一段的高度',
  rightCounter: '右边：台面高度',
  rightTotal: '右边：总高度',
};

// 默认离开参照线多远（mm）
const DEFAULT_OFFSET = { bottom: 180, total: 360, top: 180, left: 220, leftCounter: 440, leftTotal: 440, right: 220, rightCounter: 440, rightTotal: 440 };

function uniq(vals, tol = 1) {
  const s = [...vals].sort((a, b) => a - b);
  const out = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

export function wallDims(project, geom, wi) {
  const w = geom.walls[wi];
  if (!w) return null;
  const H = geom.H;
  const set = project.dimSettings?.[w.id] || {};
  const off = (k) => num(set.offsets?.[k], DEFAULT_OFFSET[k]);
  const units = project.cabinets.filter((c) => c.wall === w.id).map((c) => {
    const built = buildUnit(c);
    const U = cabToWall(c, w);
    const a = Math.min(U(0), U(+c.width)), b = Math.max(U(0), U(+c.width));
    return { c, built, a, b };
  });
  const cts = (project.countertops || []).filter((ct) => ct.wall === w.id);
  const lower = units.filter((x) => !isUpper(x.c) && !(x.c.kind === 'panel' && x.c.panelType === 'top'));
  const upper = units.filter((x) => isUpper(x.c));
  if (!units.length) return { wall: w, chains: [], zPlane: 0 };

  const zPlane = Math.max(0, ...lower.map((x) => x.built.frontDepth || +x.c.depth || 0), ...upper.map((x) => (x.built.frontDepth || 0)));
  const chains = [];
  const minU = Math.min(...units.map((x) => x.a)), maxU = Math.max(...units.map((x) => x.b));

  // 下面：每个柜子的宽度（连墙到第一个柜子的空位）+ 总宽
  if (lower.length) {
    const pts = uniq([0, w.L, ...lower.flatMap((x) => [x.a, x.b])].filter((u) => u >= -0.5 && u <= w.L + 0.5));
    chains.push({ key: 'bottom', dir: 'h', values: pts, line: -off('bottom'), ref: 0 });
  }
  chains.push({ key: 'total', dir: 'h', values: [0, w.L], line: -off('total'), ref: 0 });
  if (upper.length) {
    const top = Math.max(...upper.map((x) => +x.c.elevation + +x.c.height));
    chains.push({ key: 'top', dir: 'h', values: uniq(upper.flatMap((x) => [x.a, x.b])), line: top + off('top'), ref: top, defaultHidden: false });
  }

  // 两边：每一段高度
  const side = (which) => {
    const edge = which === 'left' ? minU : maxU;
    const near = units.filter((x) => (which === 'left' ? x.a <= edge + 20 : x.b >= edge - 20));
    const ys = [0, H];
    const labels = {};
    for (const x of near) {
      if (x.c.kind === 'panel' && x.c.panelType === 'top') continue;
      ys.push(+x.c.elevation, +x.c.elevation + +x.c.height);
      // 高橱才分开标每一段门的高度；下座橱、上座橱只标柜身
      if (x.c.kind === 'cabinet' && x.c.type === 'tall') for (const f of x.built.fronts || []) ys.push(f.cy0 ?? f.y0, f.cy1 ?? f.y1);
    }
    let counterTop = null;
    for (const ct of cts) {
      const a = +ct.offset, b = a + +ct.length;
      if (edge < a - 20 || edge > b + 20) continue;
      const ts = num(ct.substrateT, 18), tt = num(ct.topT, 20), e = +ct.elevation;
      ys.push(e, e + ts + tt);
      labels[`${Math.round(e)}-${Math.round(e + ts + tt)}`] = `${ts}+${tt}`;
      counterTop = e + ts + tt;
    }
    const vals = uniq(ys.filter((y) => y >= -0.5 && y <= H + 0.5), 3);
    const sgn = which === 'left' ? -1 : 1;
    chains.push({ key: which, dir: 'v', values: vals, line: edge + sgn * off(which), ref: edge, labels });
    // 有台面：多一排"台面高度 + 台面到天花"
    if (counterTop != null) chains.push({ key: which + 'Counter', dir: 'v', values: [0, counterTop, H], line: edge + sgn * off(which + 'Counter'), ref: edge });
    chains.push({ key: which + 'Total', dir: 'v', values: [0, H], line: edge + sgn * off(which + 'Total') + (counterTop != null && set.offsets?.[which + 'Total'] == null ? sgn * 220 : 0), ref: edge });
  };
  side('left');
  side('right');

  // 每一段的开关
  const hidden = set.hidden || {};
  for (const ch of chains) {
    ch.segs = [];
    const add = (a, b) => {
      if (b - a < 0.5) return;
      const key = `${ch.key}:${Math.round(a)}-${Math.round(b)}`;
      ch.segs.push({ a, b, key, hidden: !!hidden[key] || !!hidden[ch.key], label: ch.labels?.[`${Math.round(a)}-${Math.round(b)}`] });
    };
    for (let k = 0; k < ch.values.length - 1; k++) add(ch.values[k], ch.values[k + 1]);
    for (const [a, b] of ch.extra || []) add(a, b);
  }
  return { wall: w, chains, zPlane };
}

export { DEFAULT_OFFSET, exposedEnds };
