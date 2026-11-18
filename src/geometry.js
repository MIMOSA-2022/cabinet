// 从墙的长度和转角算出房间形状。
// 平面坐标：x 向右，y 向下（和屏幕一样），单位 mm。
// 墙的长度 = 内墙面的长度（现场量的是房间里面）。
// 每面墙自己的坐标：u 沿着内墙面（0 = 起点墙角），w = 离内墙面的距离（正数往墙外，负数往房间里），v = 离地高度。

import { wallLetter } from './model.js';

const EPS = 0.5;

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function intersectLines(p1, d1, p2, d2) {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-9) return null;
  const q = sub(p2, p1);
  const a = (q.x * d2.y - q.y * d2.x) / cross;
  return add(p1, mul(d1, a));
}

export function computeRoom(project) {
  const { walls, startAngle = 0 } = project.room;
  const N = walls.length;
  let th = (startAngle * Math.PI) / 180;
  let p = { x: 0, y: 0 };
  const out = [];
  for (let i = 0; i < N; i++) {
    const w = walls[i];
    const d = { x: Math.cos(th), y: Math.sin(th) };
    const L = Math.max(0, Number(w.length) || 0);
    const s = { ...p };
    const e = add(s, mul(d, L));
    out.push({ id: w.id, index: i, letter: wallLetter(i), s, e, d, L, t: Math.max(0, Number(w.thickness) || 0) });
    p = e;
    if (i < N - 1) {
      const ang = Number(w.angle) || 90;
      const turn = (180 - ang) * (w.turn === 'L' ? -1 : 1);
      th += (turn * Math.PI) / 180;
    }
  }
  const gap = N ? dist(p, out[0].s) : 0;

  // 面积正 = 一路往右转，房间在墙的右手边
  let area = 0;
  for (let i = 0; i < N; i++) {
    const a = out[i].s;
    const b = out[(i + 1) % N].s;
    area += a.x * b.y - b.x * a.y;
  }
  const sign = area >= 0 ? 1 : -1;
  for (const w of out) {
    w.n = sign > 0 ? { x: -w.d.y, y: w.d.x } : { x: w.d.y, y: -w.d.x }; // 指向房间里面
    w.rightIsU = sign > 0; // 站在房间里面对着墙，u 是不是往右边增加
  }
  // 外墙面墙角（斜接）
  for (let i = 0; i < N; i++) {
    const a = out[i];
    const b = out[(i + 1) % N];
    const pa = sub(a.s, mul(a.n, a.t));
    const pb = sub(b.s, mul(b.n, b.t));
    const P = N > 1 ? intersectLines(pa, a.d, pb, b.d) : null;
    a.extEnd = P && dist(P, a.e) < 20 * (a.t + b.t + 1) ? P : sub(a.e, mul(a.n, a.t));
    b.extStart = P && dist(P, b.s) < 20 * (a.t + b.t + 1) ? P : sub(b.s, mul(b.n, b.t));
  }
  if (N === 1) out[0].extStart = sub(out[0].s, mul(out[0].n, out[0].t));

  const xs = out.flatMap((w) => [w.s.x, w.extStart.x, w.extEnd.x]);
  const ys = out.flatMap((w) => [w.s.y, w.extStart.y, w.extEnd.y]);
  const bounds = N
    ? { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    : { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
  const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  return { walls: out, gap, bounds, center, H: Number(project.room.ceilingHeight) || 0, byId: Object.fromEntries(out.map((w) => [w.id, w])) };
}

// 墙上某一点（平面）
export function wallPt(wall, u, w = 0) {
  return { x: wall.s.x + wall.d.x * u - wall.n.x * w, y: wall.s.y + wall.d.y * u - wall.n.y * w };
}

// 外墙面上某一点：两头用斜接点
export function wallExtPt(wall, u) {
  if (u <= EPS) return wall.extStart;
  if (u >= wall.L - EPS) return wall.extEnd;
  return wallPt(wall, u, wall.t);
}

// 转角窗：窗框（离内墙面 wOff）在墙角要多伸出去多少才和下一面墙的窗框接上
export function cornerExtension(geom, wallIndex, wOff) {
  const N = geom.walls.length;
  const a = geom.walls[wallIndex];
  const b = geom.walls[(wallIndex + 1) % N];
  const P = intersectLines(wallPt(a, 0, wOff), a.d, wallPt(b, 0, wOff), b.d);
  if (!P) return { ext1: 0, ext2: 0 };
  return { ext1: dot(sub(P, a.s), a.d) - a.L, ext2: -dot(sub(P, b.s), b.d) };
}

// 每面墙上的洞（门、窗）
export function openingSpans(project, geom) {
  const N = geom.walls.length;
  const map = geom.walls.map(() => []);
  for (const item of project.openings) {
    const w = geom.byId[item.wall];
    if (!w) continue;
    const i = w.index;
    if (item.kind === 'door') {
      map[i].push({ item, part: 1, u0: +item.offset, u1: +item.offset + +item.width, v0: 0, v1: +item.height });
    } else if (item.kind === 'window') {
      const v0 = +item.sill;
      const v1 = +item.sill + +item.height;
      if (item.corner && N > 1) {
        map[i].push({ item, part: 1, u0: w.L - +item.width, u1: w.L, v0, v1, atEnd: true });
        map[(i + 1) % N].push({ item, part: 2, u0: 0, u1: +item.corner.width2, v0, v1, atStart: true });
      } else {
        map[i].push({ item, part: 1, u0: +item.offset, u1: +item.offset + +item.width, v0, v1 });
      }
    }
  }
  for (const list of map) list.sort((a, b) => a.u0 - b.u0);
  return map;
}

// 把一面墙分成一段段：没有洞的地方是整片，有洞的地方分成洞下面和洞上面
export function wallPieces(wall, spans, H) {
  const cuts = new Set([0, wall.L]);
  for (const s of spans) { cuts.add(clamp(s.u0, 0, wall.L)); cuts.add(clamp(s.u1, 0, wall.L)); }
  const xs = [...cuts].sort((a, b) => a - b);
  const pieces = [];
  for (let k = 0; k < xs.length - 1; k++) {
    const a = xs[k];
    const b = xs[k + 1];
    if (b - a < 0.01) continue;
    const mid = (a + b) / 2;
    const span = spans.find((s) => s.u0 <= mid && s.u1 >= mid);
    if (!span) pieces.push({ u0: a, u1: b, v0: 0, v1: H, solid: true });
    else {
      if (span.v0 > 0.01) pieces.push({ u0: a, u1: b, v0: 0, v1: Math.min(span.v0, H) });
      if (span.v1 < H - 0.01) pieces.push({ u0: a, u1: b, v0: Math.max(span.v1, 0), v1: H });
    }
  }
  return pieces;
}

// 实心（没有洞）的区段，用来画平面图
export function solidIntervals(wall, spans) {
  const res = [];
  let cur = 0;
  for (const s of spans) {
    const a = clamp(s.u0, 0, wall.L);
    const b = clamp(s.u1, 0, wall.L);
    if (a > cur + 0.01) res.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (wall.L > cur + 0.01) res.push([cur, wall.L]);
  return res;
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// 斜角：四面墙 + 一条对角线（A 起点墙角 到 C 起点墙角）算出每个墙角的角度
export function solveQuadByDiagonal(lengths, diag) {
  const [A, B, C, D] = lengths.map(Number);
  const g = Number(diag);
  const tri = (a, b, c) => a + b > c && a + c > b && b + c > a;
  if (!tri(A, B, g) || !tri(C, D, g)) return { error: '这几个数字围不成形状，请检查长度和对角线。' };
  const ang = (a, b, opp) => (Math.acos(clamp((a * a + b * b - opp * opp) / (2 * a * b), -1, 1)) * 180) / Math.PI;
  const c1 = ang(A, B, g); // A 和 B 之间
  const c2 = ang(B, g, A) + ang(C, g, D); // B 和 C 之间
  const c3 = ang(C, D, g); // C 和 D 之间
  const c0 = 360 - c1 - c2 - c3; // D 和 A 之间
  return { angles: [c1, c2, c3], closing: c0 };
}

export function fmt(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
