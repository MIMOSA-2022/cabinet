// 柜子以外放在墙边的东西：冰箱、油烟机、Filler、Exposed Panel。
// 和柜子用同一套坐标（x 从左到右，y 离地，z 离墙），也可以在平面图上拖。
// 冰箱和油烟机只画通用款式，不照某个牌子某个型号的外形。

import { uid } from './model.js';
import { rect } from './symbols.js';
import { buildCabinet } from './cabinet.js';

export const FRIDGE_STYLES = {
  single: '单门',
  topFreezer: '双门上冷冻',
  bottomFreezer: '双门下冷冻',
  sideBySide: '左右开（Side-by-Side）',
  french: '三门/四门法式门（French Door）',
};
export const HOOD_STYLES = { chimney: '烟囱型（Chimney）', slanted: '斜面型（Slanted）', slim: '超薄型（Slim）', island: '岛型' };
export const PANEL_TYPES = { exposed: 'Exposed Panel（见光板）', filler: 'Filler（填缝板）', top: '台面板（坐凳面、书桌台面）' };

export const UNIT_DEFAULTS = {
  fridge: { width: 700, height: 1800, depth: 650, elevation: 0, style: 'topFreezer', brand: '', model: '' },
  hood: { width: 900, height: 900, depth: 500, elevation: 1550, style: 'chimney', distFromWall: 0, brand: '', model: '' },
  exposed: { width: 18, height: 860, depth: 580, elevation: 0 },
  filler: { width: 50, height: 760, thickness: 18, front: 578, elevation: 100 },
  top: { width: 1800, depth: 600, thickness: 40, elevation: 760 },
};

export function makeUnit(kind, v) {
  const d = UNIT_DEFAULTS[kind];
  const pick = (k) => (v[k] != null && v[k] !== '' ? v[k] : d[k]);
  const base = { id: uid(kind), wall: v.wall, offset: Number(v.offset) || 0 };
  if (kind === 'fridge' || kind === 'hood') {
    return { ...base, kind, ...Object.fromEntries(Object.keys(d).map((k) => [k, typeof d[k] === 'number' ? Number(pick(k)) : pick(k)])) };
  }
  return { ...base, kind: 'panel', panelType: kind, ...Object.fromEntries(Object.keys(d).map((k) => [k, Number(pick(k))])) };
}

export function unitLabel(u) {
  if (u.kind === 'fridge') return `冰箱 · ${FRIDGE_STYLES[u.style]} · ${u.width}×${u.height}${u.brand ? ' · ' + u.brand : ''}`;
  if (u.kind === 'hood') return `油烟机 · ${HOOD_STYLES[u.style]} · ${u.width}`;
  if (u.kind === 'panel') return `${PANEL_TYPES[u.panelType]} · ${u.width}`;
  return u.kind;
}

// 一样东西的线条和面；柜子交给 buildCabinet
export function buildUnit(u, opts = {}) {
  if (u.kind === 'cabinet') return buildCabinet(u, opts);
  const boxes = [], lines = [], frusta = [];
  const box = (x0, x1, y0, y1, z0, z1, tag) => {
    if (x1 - x0 > 0.1 && y1 - y0 > 0.1 && z1 - z0 > 0.1) boxes.push({ x0, x1, y0, y1, z0, z1, tag });
  };
  const W = +u.width, H = +u.height, e = +u.elevation;
  const P = (segs, z) => segs.forEach((s) => lines.push([s[0], s[1], z, s[2], s[3], z]));

  if (u.kind === 'panel') {
    if (u.panelType === 'exposed') box(0, W, e, e + H, 0, +u.depth, 'panel');
    else if (u.panelType === 'top') box(0, W, e, e + +u.thickness, 0, +u.depth, 'panel');
    else box(0, W, e, e + H, +u.front - +u.thickness, +u.front, 'panel');
    return { boxes, lines, dashed: [], frusta, frontDepth: u.panelType === 'filler' ? +u.front : +u.depth, fronts: [] };
  }

  if (u.kind === 'fridge') {
    const D = +u.depth;
    box(0, W, e, e + H, 0, D, 'fridge');
    const z = D + 0.5, g = 4;
    const hb = (x, y, len) => P(rect(x - 7, y - len / 2, x + 7, y + len / 2), z + 25); // 拉手凸出来一点
    const hh = (x, y, len) => P(rect(x - len / 2, y - 7, x + len / 2, y + 7), z + 25);
    switch (u.style) {
      case 'single':
        hb(W - 50, e + H * 0.62, 300);
        break;
      case 'topFreezer': {
        const ys = e + H * 0.7;
        P([[0, ys, W, ys], [0, ys - g, W, ys - g]], z);
        hb(W - 50, ys + 120, 160); hb(W - 50, ys - 300, 300);
        break;
      }
      case 'bottomFreezer': {
        const ys = e + H * 0.33;
        P([[0, ys, W, ys], [0, ys + g, W, ys + g]], z);
        hb(W - 50, ys + 320, 300); hh(W / 2, ys - 70, W * 0.5);
        break;
      }
      case 'sideBySide': {
        const xs = W * 0.48;
        P([[xs, e, xs, e + H], [xs + g, e, xs + g, e + H]], z);
        hb(xs - 45, e + H * 0.58, 600); hb(xs + g + 45, e + H * 0.58, 600);
        P(rect(W * 0.12, e + H * 0.55, xs - W * 0.1, e + H * 0.75), z); // 出水口
        break;
      }
      case 'french': {
        const ys = e + H * 0.4, xs = W / 2;
        P([[0, ys, W, ys], [0, ys - g, W, ys - g], [xs, ys, xs, e + H]], z);
        hb(xs - 45, ys + 350, 450); hb(xs + 45, ys + 350, 450);
        const ys2 = e + H * 0.2;
        P([[0, ys2, W, ys2]], z);
        hh(W / 2, ys - 70, W * 0.5); hh(W / 2, ys2 - 70, W * 0.5);
        break;
      }
      default: break;
    }
    return { boxes, lines, dashed: [], frusta, frontDepth: D, fronts: [] };
  }

  if (u.kind === 'hood') {
    const D = +u.depth;
    const z0 = u.style === 'island' ? +u.distFromWall : 0;
    const cw = Math.min(300, W * 0.4), cd = Math.min(260, D * 0.6);
    const cx0 = (W - cw) / 2, cx1 = cx0 + cw;
    const czA = u.style === 'island' ? z0 + (D - cd) / 2 : 0, czB = czA + cd;
    const chimneyTo = (yFrom) => { if (e + H > yFrom + 1) box(cx0, cx1, yFrom, e + H, czA, czB, 'chimney'); };
    if (u.style === 'slim') {
      box(0, W, e, e + Math.min(H, 150), z0, z0 + D, 'hood');
      P([[40, e + 30, W - 40, e + 30]], z0 + D + 0.5);
    } else if (u.style === 'slanted') {
      const hh = Math.min(H, 450);
      frusta.push({ b: [[0, z0], [W, z0], [W, z0 + D], [0, z0 + D]], y0: e, t: [[0, z0], [W, z0], [W, z0 + D * 0.3], [0, z0 + D * 0.3]], y1: e + hh });
      chimneyTo(e + hh);
    } else {
      const ch = 80, py = Math.min(260, Math.max(0, H - ch - 50));
      box(0, W, e, e + ch, z0, z0 + D, 'hood');
      frusta.push({ b: [[0, z0], [W, z0], [W, z0 + D], [0, z0 + D]], y0: e + ch, t: [[cx0, czA], [cx1, czA], [cx1, czB], [cx0, czB]], y1: e + ch + py });
      chimneyTo(e + ch + py);
    }
    return { boxes, lines, dashed: [], frusta, frontDepth: z0 + D, fronts: [] };
  }
  return { boxes, lines, dashed: [], frusta, frontDepth: 0, fronts: [] };
}
