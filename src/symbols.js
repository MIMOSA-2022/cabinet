// 立面线条：窗、门、插座等，输出一条条线段 [u1, v1, u2, v2]（u 向右，v 向上，单位 mm）。
// 3D 视图把这些线段贴到墙面上；以后立面图和 PDF 也用同一份。

import { resolveSizes } from './model.js';

export function rect(x0, y0, x1, y1) {
  return [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
}

export function circle(cx, cy, r, n = 24) {
  const segs = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    segs.push([cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b)]);
  }
  return segs;
}

function arrow(x0, y, x1) {
  const dir = Math.sign(x1 - x0) || 1;
  const k = Math.min(30, Math.abs(x1 - x0) * 0.3);
  return [[x0, y, x1, y], [x1, y, x1 - dir * k, y + k * 0.6], [x1, y, x1 - dir * k, y - k * 0.6]];
}

// 窗格子的位置（给立面和 UI 警告用）
export function cellRects(rows, W, H) {
  const rh = resolveSizes(rows.map((r) => r.h), H);
  const out = [];
  let top = H;
  rows.forEach((row, ri) => {
    const h = rh.sizes[ri];
    const cw = resolveSizes(row.cells.map((c) => c.w), W);
    let x = 0;
    row.cells.forEach((cell, ci) => {
      const w = cw.sizes[ci];
      out.push({ ri, ci, cell, x0: x, x1: x + w, y0: top - h, y1: top, first: ci === 0, last: ci === row.cells.length - 1, overW: cw.over });
      x += w;
    });
    top -= h;
  });
  return { cells: out, overH: rh.over };
}

// 窗。opts: frameWidth, noFrameSide ('L'|'R'：墙角两片玻璃粘在一起，那一边没有框), forceFixed ('L'|'R')
export function windowSegments(rows, W, H, opts = {}) {
  const fw = opts.frameWidth ?? 40;
  const sw = 30; // 窗扇框
  const segs = [...rect(0, 0, W, H)];
  const { cells } = cellRects(rows, W, H);
  for (const c of cells) {
    const inL = c.first ? (opts.noFrameSide === 'L' ? 0 : fw) : fw / 2;
    const inR = c.last ? (opts.noFrameSide === 'R' ? 0 : fw) : fw / 2;
    const inB = c.y0 <= 0.01 ? fw : fw / 2;
    const inT = c.y1 >= H - 0.01 ? fw : fw / 2;
    const gx0 = c.x0 + inL, gx1 = c.x1 - inR, gy0 = c.y0 + inB, gy1 = c.y1 - inT;
    if (gx1 - gx0 < 1 || gy1 - gy0 < 1) continue;
    segs.push(...rect(gx0, gy0, gx1, gy1));
    let style = c.cell.style;
    if ((opts.forceFixed === 'L' && c.first) || (opts.forceFixed === 'R' && c.last)) style = 'fixed';
    const gw = gx1 - gx0, gh = gy1 - gy0, my = (gy0 + gy1) / 2;
    if (style === 'casement' || style === 'multipoint') {
      if (gw > 2 * sw && gh > 2 * sw) segs.push(...rect(gx0 + sw, gy0 + sw, gx1 - sw, gy1 - sw));
      const len = Math.min(style === 'multipoint' ? 260 : 120, gh * 0.6);
      const hw = style === 'multipoint' ? 10 : 7;
      const hx = c.cell.hinge === 'R' ? gx0 + sw / 2 : gx1 - sw / 2;
      segs.push(...rect(hx - hw, my - len / 2, hx + hw, my + len / 2));
    } else if (style === 'sliding') {
      const a1 = gx0 + gw * 0.55, b0 = gx0 + gw * 0.45;
      segs.push(...rect(gx0, gy0, a1, gy1), ...rect(b0, gy0, gx1, gy1));
      if (gh > 2 * sw) {
        segs.push(...rect(gx0 + sw, gy0 + sw, a1 - sw, gy1 - sw), ...rect(b0 + sw, gy0 + sw, gx1 - sw, gy1 - sw));
      }
      segs.push(...arrow(gx0 + gw * 0.15, my, gx0 + gw * 0.35), ...arrow(gx0 + gw * 0.85, my, gx0 + gw * 0.65));
    } else if (style === 'louver') {
      for (let y = gy0 + 50; y < gy1 - 20; y += 80) segs.push([gx0, y, gx1, y]);
    }
  }
  return segs;
}

// 门（在门洞里，宽 W 高 H）
export function doorSegments(d, W, H) {
  const segs = [];
  const n = Number(d.leaves) === 2 ? 2 : 1;
  if (d.doorType === 'alu') {
    const fw = d.frameWidth ?? 40;
    segs.push(...rect(0, 0, W, H), ...rect(fw, 0, W - fw, H - fw));
    const x0 = fw, x1 = W - fw, top = H - fw;
    if (d.operation === 'sliding') {
      const iw = x1 - x0;
      const a1 = x0 + iw * 0.53, b0 = x0 + iw * 0.47;
      segs.push(...rect(x0, 0, a1, top), ...rect(b0, 0, x1, top));
      segs.push(...rect(x0 + 50, 60, a1 - 50, top - 50), ...rect(b0 + 50, 60, x1 - 50, top - 50));
      segs.push(...arrow(x0 + iw * 0.15, 1000, x0 + iw * 0.35), ...arrow(x0 + iw * 0.85, 1000, x0 + iw * 0.65));
    } else {
      const lw = (x1 - x0) / n;
      for (let k = 0; k < n; k++) {
        const a = x0 + k * lw, b = a + lw;
        segs.push(...rect(a, 0, b, top), ...rect(a + 60, 80, b - 60, top - 60));
        const handleRight = n === 2 ? k === 0 : d.hinge !== 'R';
        const hx = handleRight ? b - 30 : a + 30;
        segs.push(...rect(hx - 8, 900, hx + 8, 1200));
      }
    }
  } else {
    const lw = W / n;
    for (let k = 0; k < n; k++) {
      const a = k * lw, b = a + lw;
      segs.push(...rect(a, 0, b, H));
      const handleRight = n === 2 ? k === 0 : d.hinge !== 'R';
      const px = handleRight ? b - 70 : a + 70;
      segs.push(...rect(px - 20, 920, px + 20, 1080));
      const lx = handleRight ? px - 120 : px + 120;
      segs.push(...rect(Math.min(px, lx), 990, Math.max(px, lx), 1010));
    }
  }
  return segs;
}

// 墙上的东西（中心在 0,0）
export function wallItemSegments(kind) {
  switch (kind) {
    case 'socket': // 英式三孔插座 + 开关
      return [
        ...rect(-43, -43, 43, 43),
        ...rect(-13, 8, -7, 24), // 地线（竖）
        ...rect(-28, -14, -16, -8), ...rect(-4, -14, 8, -8),
        ...rect(20, -12, 30, 12),
      ];
    case 'switch':
      return [...rect(-43, -43, 43, 43), ...rect(-10, -20, 10, 20), [-10, 0, 10, 0]];
    case 'waterIn':
      return [...circle(0, 0, 12, 16), ...circle(0, 0, 28, 20)];
    case 'drainWall':
      return [...circle(0, 0, 30, 20), ...circle(0, 0, 20, 16)];
    case 'drainFloor':
      return [...circle(0, 0, 50, 24), ...circle(0, 0, 40, 20), [-40, 0, 40, 0], [0, -40, 0, 40]];
    default:
      return [];
  }
}
