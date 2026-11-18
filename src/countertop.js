// 台面：先一层垫板，台面放在上面。前面一定"戴帽"，见光的两头也戴帽。
// 一片板默认 2400 长，超过就在 2400 处直角对接，图上标出接缝。
// 台面用墙的 u 坐标（不用柜子的左右），z = 离墙。

import { uid } from './model.js';
import { buildUnit } from './units.js';
import { cabToWall } from './cabinet.js';
import { rect, circle } from './symbols.js';

export const MATERIALS = { sintered: 'Sintered Stone', marble: 'Marble', granite: 'Granite' };
export const CT_DEFAULTS = { substrateT: 18, topT: 20, capFront: 50, capLH: 50, capRH: 50, overhang: 20, slabLength: 2400, material: 'sintered' };

const num = (x, f) => (x == null || x === '' ? f : Number(x));
const isBaseLevel = (c) => c.kind === 'cabinet' && c.type === 'base';

export function makeCountertop(v) {
  return { id: uid('ct'), kind: 'countertop', wall: v.wall, offset: +v.offset || 0, length: +v.length || 1000, depth: +v.depth || 560,
    elevation: +v.elevation || 860, capL: 'auto', capR: 'auto', ...CT_DEFAULTS, ...pickDefined(v, Object.keys(CT_DEFAULTS)) };
}
function pickDefined(v, keys) { return Object.fromEntries(keys.filter((k) => v[k] != null && v[k] !== '').map((k) => [k, v[k]])); }

// 从下座橱自动算出台面：同一面墙上连着的下座橱连成一条
export function autoCountertops(project, geom, last = {}) {
  const res = [];
  const ends = {}; // 每面墙最后一段台面（转角用）
  for (const w of geom.walls) {
    const cabs = project.cabinets.filter((c) => c.wall === w.id && isBaseLevel(c))
      .map((c) => ({ c, a: +c.offset, b: +c.offset + +c.width })).sort((p, q) => p.a - q.a);
    const runs = [];
    for (const x of cabs) {
      const r = runs[runs.length - 1];
      if (r && x.a <= r.b + 2) { r.b = Math.max(r.b, x.b); r.cabs.push(x.c); } else runs.push({ a: x.a, b: x.b, cabs: [x.c] });
    }
    for (const r of runs) {
      const depth = Math.max(...r.cabs.map((c) => +c.depth));
      const elevation = Math.max(...r.cabs.map((c) => +c.elevation + +c.height));
      res.push({ wall: w.id, wi: w.index, a: r.a, b: r.b, depth, elevation });
    }
  }
  // 转角：后一面墙的台面如果从墙角开始，而前一面墙的台面到墙角，就让前一面墙的台面盖住墙角
  const N = geom.walls.length;
  for (const r of res) {
    if (r.a > 5) continue;
    const prev = res.find((q) => q.wi === (r.wi - 1 + N) % N && q.b >= geom.walls[q.wi].L - 5);
    if (prev) r.a = Math.max(r.a, prev.depth + num(last.overhang, CT_DEFAULTS.overhang));
  }
  return res.filter((r) => r.b - r.a > 1).map((r) => makeCountertop({ ...last, wall: r.wall, offset: r.a, length: r.b - r.a, depth: r.depth, elevation: r.elevation }));
}

// 两头见光吗：靠墙或靠着比台面高的柜子 / 见光板 = 不见光
export function exposedEnds(ct, project, geom) {
  const w = geom.byId[ct.wall];
  const a = +ct.offset, b = a + +ct.length;
  const top = +ct.elevation + num(ct.substrateT, 18) + num(ct.topT, 20);
  const covers = (u) => project.cabinets.some((c) => {
    if (c.wall !== ct.wall) return false;
    const tall = (c.kind === 'cabinet' && +c.elevation + +c.height > top + 1) || (c.kind === 'panel' && +c.elevation + +c.height > top + 1);
    return tall && Math.abs(+c.offset - u) < 2 || tall && Math.abs(+c.offset + +c.width - u) < 2;
  });
  const autoL = !(a < 1 || covers(a));
  const autoR = !((w && b > w.L - 1) || covers(b));
  const pick = (mode, auto) => (mode === 'on' ? true : mode === 'off' ? false : auto);
  return { L: pick(ct.capL, autoL), R: pick(ct.capR, autoR), autoL, autoR };
}

export function seamPositions(ct) {
  const slab = num(ct.slabLength, 2400);
  const out = [];
  if (slab > 10) for (let u = +ct.offset + slab; u < +ct.offset + +ct.length - 1; u += slab) out.push(u);
  return out;
}

// 水盆、炉头开孔：从同一面墙上的柜子找
export function cutouts(ct, project, geom) {
  const w = geom.byId[ct.wall];
  if (!w) return [];
  const a = +ct.offset, b = a + +ct.length;
  const out = [];
  for (const c of project.cabinets) {
    if (c.wall !== ct.wall || c.kind !== 'cabinet' || !(c.special === 'sink' || c.special === 'hob')) continue;
    const built = buildUnit(c);
    const cut = built.sinkCut || built.hobCut;
    if (!cut) continue;
    const U = cabToWall(c, w);
    const u = U(cut.x);
    if (u < a || u > b) continue;
    out.push({ kind: c.special, type: cut.type, u, w: cut.w, d: cut.d, cabDepth: +c.depth });
  }
  return out;
}

export function buildCountertop(ct, project, geom) {
  const boxes = [], lines = [];
  const box = (x0, x1, y0, y1, z0, z1, tag) => { if (x1 - x0 > 0.1 && y1 - y0 > 0.1 && z1 - z0 > 0.1) boxes.push({ x0, x1, y0, y1, z0, z1, tag }); };
  const a = +ct.offset, b = a + +ct.length, D = +ct.depth, ov = num(ct.overhang, 20);
  const ts = num(ct.substrateT, 18), tt = num(ct.topT, 20);
  const e = +ct.elevation, top = e + ts + tt, F = D + ov;
  const capF = num(ct.capFront, 50);
  const ends = exposedEnds(ct, project, geom);
  const capL = ends.L ? num(ct.capLH, 50) : 0, capR = ends.R ? num(ct.capRH, 50) : 0;

  box(a, b, e, e + ts, 0, D, 'substrate');
  box(a, b, e + ts, top, 0, F, 'slab');
  if (capF > tt) box(a, b, top - capF, top - tt, F - 20, F, 'cap');
  if (capL > tt) box(a, a + 20, top - capL, top - tt, 0, F, 'cap');
  if (capR > tt) box(b - 20, b, top - capR, top - tt, 0, F, 'cap');

  const yS = top + 0.4;
  for (const u of seamPositions(ct)) {
    lines.push([u, yS, 0, u, yS, F]);
    lines.push([u, top - Math.max(capF, tt), F + 0.4, u, top, F + 0.4]);
  }
  for (const c of cutouts(ct, project, geom)) {
    if (c.kind === 'sink') {
      const farm = c.type === 'farmhouse';
      const z1 = farm ? F : Math.min(F - 60, (F + c.d) / 2 + 20);
      const z0 = z1 - c.d;
      const segs = [...rect(c.u - c.w / 2, z0, c.u + c.w / 2, z1)];
      if (!farm) segs.push(...rect(c.u - c.w / 2 + 15, z0 + 15, c.u + c.w / 2 - 15, z1 - 15));
      if (c.type === 'ss2') segs.push([c.u, z0 + 15, c.u, z1 - 15], [c.u + 8, z0 + 15, c.u + 8, z1 - 15]);
      const drains = c.type === 'ss2' ? [c.u - c.w / 4, c.u + c.w / 4] : [c.u];
      for (const dx of drains) segs.push(...circle(dx, (z0 + z1) / 2, 25, 16));
      // 水龙头：盆后面一个小圆
      segs.push(...circle(c.u, Math.max(25, z0 - 45), 18, 16));
      for (const s of segs) lines.push([s[0], yS, s[1], s[2], yS, s[3]]);
    } else {
      const z1 = Math.min(F - 50, (F + c.d) / 2), z0 = z1 - c.d;
      box(c.u - c.w / 2 - 20, c.u + c.w / 2 + 20, top, top + 6, z0 - 20, z1 + 20, 'hob');
      const segs = [];
      const r1 = Math.min(c.w, c.d) * 0.22;
      segs.push(...circle(c.u - c.w * 0.22, (z0 + z1) / 2, r1, 28), ...circle(c.u + c.w * 0.22, (z0 + z1) / 2, r1 * 0.8, 28));
      segs.push(...rect(c.u - c.w * 0.15, z1 - 10, c.u + c.w * 0.15, z1 + 10));
      for (const s of segs) lines.push([s[0], top + 6.4, s[1], s[2], top + 6.4, s[3]]);
    }
  }
  return { boxes, lines, ends, top, F };
}
