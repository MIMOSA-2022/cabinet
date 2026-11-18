// 柜子：资料结构、默认值、从数字算出每一片板和柜面。
// 柜子自己的坐标（站在柜子前面看）：x 从左到右（0 = 柜子最左边），y = 离地高度，z = 离墙（0 = 贴墙，往前变大）。
// 板的数字留空 (null) = 跟着柜子；填了数字就用那个数字。

import { uid, resolveSizes } from './model.js';
import { rect, circle } from './symbols.js';

export const CAB_TYPES = { base: '下座橱', upper: '上座橱', tall: '高橱' };
export const FRONT_TYPES = { door: '门', drawer: '抽屉', fake: '假门', glass: '玻璃门', oven: 'Oven 空位', microwave: 'Microwave 空位' };
export const HANDLE_TYPES = {
  none: '没有拉手（按压弹开）',
  bevel45: '45° 斜切',
  notch: '坑（边缘凹位）',
  jprofile: 'J 形拉手',
  bar: '长条形拉手',
  recessed: '嵌入式',
  knob: '小圆钮',
};

export const CAB_DEFAULTS = {
  base: { width: 600, height: 760, depth: 560, elevation: 100, preset: 'door2' },
  upper: { width: 600, height: 700, depth: 330, elevation: 1550, preset: 'door1' },
  tall: { width: 600, height: 2100, depth: 560, elevation: 100, preset: 'tall3' },
};

export const FACE_PRESETS = {
  base: { door1: '一扇门', door2: '两扇门', drawerDoor2: '上面一个抽屉，下面两扇门', drawer2door2: '上面两个抽屉，下面两扇门', drawer3: '三个抽屉', open: '没有门（开放）' },
  upper: { door1: '一扇门', door2: '两扇门', glass2: '两扇玻璃门', open: '没有门（开放）' },
  tall: { tall3: '三段门（下、中、上）', tallFull: '一扇门到顶', tall2: '上下两段', open: '没有门（开放）' },
};

export function defaultHandle(cabType, frontType) {
  if (frontType === 'drawer') return { type: 'bar', orient: 'h', length: 160 };
  return { type: 'bar', orient: 'v', length: cabType === 'tall' ? 320 : 160 };
}

export function makeFront(cabType, type = 'door', hinge = 'L', w = null) {
  return {
    w, type, hinge,
    style: 'flat', // flat 平板 / frame 有边框
    thickness: 18, frameWidth: 60, panelDepth: 6, panelMode: 'recess', // recess 凹进去 / raised 凸出来
    handle: defaultHandle(cabType, type),
  };
}

export function facePreset(cabType, preset) {
  const f = (type, hinge, w) => makeFront(cabType, type, hinge, w);
  switch (preset) {
    case 'open': return [];
    case 'door1': return [{ h: null, cells: [f('door', 'L')] }];
    case 'door2': return [{ h: null, cells: [f('door', 'L'), f('door', 'R')] }];
    case 'glass2': return [{ h: null, cells: [f('glass', 'L'), f('glass', 'R')] }];
    case 'drawerDoor2': return [{ h: 150, cells: [f('drawer')] }, { h: null, cells: [f('door', 'L'), f('door', 'R')] }];
    case 'drawer2door2': return [{ h: 150, cells: [f('drawer'), f('drawer')] }, { h: null, cells: [f('door', 'L'), f('door', 'R')] }];
    case 'drawer3': return [{ h: null, cells: [f('drawer')] }, { h: null, cells: [f('drawer')] }, { h: null, cells: [f('drawer')] }];
    case 'tallFull': return [{ h: null, cells: [f('door', 'L')] }];
    case 'tall2': return [{ h: 600, cells: [f('door', 'L')] }, { h: null, cells: [f('door', 'L')] }];
    case 'tall3': return [{ h: 500, cells: [f('door', 'L')] }, { h: null, cells: [f('door', 'L')] }, { h: 700, cells: [f('door', 'L')] }];
    default: return [{ h: null, cells: [f('door', 'L')] }];
  }
}

export function makeCabinet(type, v) {
  const d = CAB_DEFAULTS[type];
  const num = (k) => (v[k] != null ? Number(v[k]) : d[k]);
  return {
    id: uid('cab'), kind: 'cabinet', type,
    wall: v.wall, offset: num('offset') || 0,
    width: num('width'), height: num('height'), depth: num('depth'), elevation: num('elevation'),
    sideL: { t: 18, depth: null, height: null, bottom: 0 },
    sideR: { t: 18, depth: null, height: null, bottom: 0 },
    bottom: { t: 18, depth: null, raise: 0 },
    top: { mode: type === 'base' ? 'rails' : 'full', t: 18, railWidth: 100 },
    back: { t: 9, inset: 0 },
    dividers: [],
    shelves: type === 'base' ? [{ y: null, t: 18, bay: null }] : type === 'upper' ? [{ y: null, t: 18, bay: null }] : [{ y: null, t: 18, bay: null }, { y: null, t: 18, bay: null }, { y: null, t: 18, bay: null }],
    face: { gap: 3, rows: facePreset(type, v.preset) },
    kick: { board: type !== 'upper', position: 'recess', thickness: 16, legs: type !== 'upper' },
    accessories: [],
    special: null,
  };
}

// 特别的柜子：在普通柜子上加东西
export const SPECIALS = {
  sink: { label: '水盆橱', type: 'base' },
  hob: { label: '电气炉橱', type: 'base' },
  ovenMicro: { label: 'Oven Microwave 橱', type: 'tall' },
  cornerBase: { label: '下座转角橱', type: 'base' },
  cornerUpper: { label: '上座转角橱', type: 'upper' },
  wardrobe: { label: '衣橱', type: 'tall' },
};
export const SINK_TYPES = { ss1: '白钢单盆（Undermount）', ss2: '白钢双盆（Undermount）', farmhouse: 'Ceramic 盆（Farmhouse）' };
export const ACCESSORY_TYPES = {
  basket: '拉篮（一层）', basket2: '拉篮（两层）', gasBasket: '煤气桶拉篮（GAS ACC）', trouser: '挂裤子配件',
  rail: '挂衣杆', innerDrawer: '橱身里的抽屉', mirror: '镜子', ironing: '放烫衣板', led: 'LED 灯条',
};
export const LED_POSITIONS = { sides: '左右两边（竖）', under: '横的一条（在某个高度）', shelves: '每片层板下面' };

export function makeSpecial(key, v) {
  const sp = SPECIALS[key];
  const cab = makeCabinet(sp.type, v);
  if (key === 'sink') {
    cab.special = 'sink';
    cab.sink = { type: v.sinkType || 'ss1', width: num(v.sinkWidth, 760), depth: num(v.sinkDepth, 430), offset: 0, apronHeight: 220, protrude: 5 };
    cab.shelves = [];
    cab.face.rows = facePreset('base', 'door2');
  } else if (key === 'hob') {
    cab.special = 'hob';
    cab.hob = { width: num(v.hobWidth, 560), depth: num(v.hobDepth, 490), offset: 0 };
  } else if (key === 'ovenMicro') {
    cab.special = 'ovenMicro';
    cab.shelves = [];
    const f = (t, hgt) => ({ h: hgt, cells: [makeFront('tall', t, 'L')] });
    cab.face.rows = [f('door', null), f('microwave', 400), f('oven', 600), f('drawer', 250), f('drawer', 250)];
  } else if (key === 'wardrobe') {
    // 衣橱：上面一排小门，下面大门；里面一片层板、挂衣杆、一个 45° 抽屉
    cab.special = 'wardrobe';
    const topH = num(v.topDoor, 470);
    const H = +cab.height;
    const shelfY = H - 36 - topH + 9;
    cab.shelves = [{ y: shelfY, t: 18, bay: null }];
    const d2 = (hgt) => ({ h: hgt, cells: [makeFront('tall', 'door', 'L'), makeFront('tall', 'door', 'R')] });
    cab.face.rows = [d2(topH), d2(null)];
    cab.accessories = [
      { type: 'rail', bay: 0, y: shelfY - 80 },
      { type: 'innerDrawer', bay: 0, y: 0, count: 1, height: 250 },
    ];
  } else {
    cab.special = 'corner';
    cab.corner = { side: v.cornerSide || 'R', A: num(v.A, 500), B: num(v.B, 150), C: num(v.C, 18), ext: num(v.ext, 0) };
    cab.width = cab.corner.A + cab.corner.B;
    cab.face.rows = facePreset(sp.type, 'door1');
  }
  return cab;
}

const num = (x, fallback) => (x == null || x === '' ? fallback : Number(x));

// ---------- 算出板和柜面 ----------
// 输出：boxes（每块板一个盒子）、lines（另外要画的线：拉手、边框等）、dashed（开门方向）
export function buildCabinet(cab, opts = {}) {
  const W = +cab.width, H = +cab.height, D = +cab.depth, y0 = +cab.elevation;
  const boxes = [];
  const frusta = []; // 打开的门：转了角度的板
  const lines = [];
  const dashed = [];
  const dotted = []; // LED 灯条
  const box = (x0, x1, ya, yb, z0, z1, tag) => {
    if (x1 - x0 > 0.1 && yb - ya > 0.1 && z1 - z0 > 0.1) boxes.push({ x0, x1, y0: ya, y1: yb, z0, z1, tag });
  };
  const seg = (a, b, arr = lines) => arr.push([...a, ...b]);

  // 侧板
  const sL = cab.sideL, sR = cab.sideR;
  const tL = num(sL.t, 18), tR = num(sR.t, 18);
  box(0, tL, y0 + num(sL.bottom, 0), y0 + num(sL.bottom, 0) + num(sL.height, H), 0, num(sL.depth, D), 'sideL');
  box(W - tR, W, y0 + num(sR.bottom, 0), y0 + num(sR.bottom, 0) + num(sR.height, H), 0, num(sR.depth, D), 'sideR');
  const xi0 = tL, xi1 = W - tR;

  // 底板
  const tb = num(cab.bottom.t, 18);
  const yb0 = y0 + num(cab.bottom.raise, 0);
  box(xi0, xi1, yb0, yb0 + tb, 0, num(cab.bottom.depth, D), 'bottom');
  const yIn0 = yb0 + tb;

  // 顶部
  const tt = num(cab.top.t, 18);
  const yTop = y0 + H;
  if (cab.top.mode === 'rails') {
    const rw = num(cab.top.railWidth, 100);
    box(xi0, xi1, yTop - tt, yTop, D - rw, D, 'railF');
    box(xi0, xi1, yTop - tt, yTop, 0, rw, 'railB');
  } else {
    box(xi0, xi1, yTop - tt, yTop, 0, D, 'top');
  }
  const yIn1 = yTop - tt;

  // 背板
  const bt = num(cab.back.t, 9), bi = num(cab.back.inset, 0);
  box(xi0, xi1, yIn0, yIn1, bi, bi + bt, 'back');
  const zIn0 = bi + bt;

  // 竖隔板
  const divs = (cab.dividers || []).map((dv, k, arr) => {
    const t = num(dv.t, 18);
    const cx = dv.x == null || dv.x === '' ? xi0 + ((xi1 - xi0) * (k + 1)) / (arr.length + 1) : Number(dv.x);
    return { x0: cx - t / 2, x1: cx + t / 2 };
  }).sort((a, b) => a.x0 - b.x0);
  for (const dv of divs) box(dv.x0, dv.x1, yIn0, yIn1, zIn0, D, 'divider');
  const bays = [];
  let cur = xi0;
  for (const dv of divs) { bays.push([cur, dv.x0]); cur = dv.x1; }
  bays.push([cur, xi1]);

  // 层板（y = 层板底离柜里面底板的高度；留空 = 平均分布）
  const Hi = yIn1 - yIn0;
  const shelves = cab.shelves || [];
  const autoCount = shelves.filter((s) => s.y == null || s.y === '').length;
  let autoK = 0;
  for (const s of shelves) {
    const t = num(s.t, 18);
    let y;
    if (s.y == null || s.y === '') { autoK++; y = (Hi * autoK) / (autoCount + 1) - t / 2; } else y = Number(s.y);
    const targets = s.bay == null || s.bay === '' ? bays : [bays[Number(s.bay)]].filter(Boolean);
    for (const [a, b] of targets) box(a, b, yIn0 + y, yIn0 + y + t, zIn0, D - 20, 'shelf');
  }

  // 踢脚板 + ABS 脚
  const kick = cab.kick || {};
  if (kick.legs && y0 > 1) {
    const lg = 40, inset = 40, zf = D - 80;
    for (const x of [inset, W - inset - lg]) for (const z of [inset, zf - lg]) box(x, x + lg, 0, y0, z, z + lg, 'leg');
  }

  // 柜面的范围：转角橱只有门那一段；Farmhouse 水盆上面一段是水盆前面
  let fx0 = 0, fx1 = W, faceH = H;
  if (cab.special === 'corner' && cab.corner) {
    const A = num(cab.corner.A, 500), B = num(cab.corner.B, 150), C = num(cab.corner.C, 18), ext = num(cab.corner.ext, 0);
    const right = cab.corner.side !== 'L'; // 右转角：门在左，Filler 在右
    fx0 = right ? 0 : B; fx1 = right ? A : B + A;
    const bx0 = right ? A : 0, bx1 = right ? A + B : B;
    const ya = ext < 0 ? y0 + ext : y0, yb = ext > 0 ? y0 + H + ext : y0 + H;
    box(bx0, bx1, ya, yb, D, D + C, 'filler');
  }
  const sink = cab.special === 'sink' ? cab.sink : null;
  if (sink && sink.type === 'farmhouse') {
    const sw = num(sink.width, 760), ah = num(sink.apronHeight, 220), pr = num(sink.protrude, 5);
    const cx = W / 2 + num(sink.offset, 0);
    faceH = H - ah;
    box(cx - sw / 2, cx + sw / 2, y0 + H - ah, y0 + H, D - 20, D + 18 + pr, 'apron');
    // 水盆前面露出来那一片：两边各一小块面板补满
    box(fx0, cx - sw / 2, y0 + H - ah, y0 + H, D, D + 18, 'front');
    box(cx + sw / 2, fx1, y0 + H - ah, y0 + H, D, D + 18, 'front');
  }

  // 柜面
  const rows = cab.face?.rows || [];
  const gap = num(cab.face?.gap, 3);
  const fronts = [];
  if (rows.length) {
    const rh = resolveSizes(rows.map((r) => r.h), faceH);
    let top = y0 + faceH;
    rows.forEach((row, ri) => {
      const hgt = rh.sizes[ri];
      const cw = resolveSizes(row.cells.map((c) => c.w), fx1 - fx0);
      let x = fx0;
      row.cells.forEach((c, ci) => {
        const w = cw.sizes[ci];
        fronts.push({ ri, ci, c, x0: x + gap / 2, x1: x + w - gap / 2, y0: top - hgt + gap / 2, y1: top - gap / 2, cx0: x, cx1: x + w, cy0: top - hgt, cy1: top });
        x += w;
      });
      top -= hgt;
    });
  }
  let maxT = 0;
  for (const f of fronts) {
    if (f.c.type === 'oven' || f.c.type === 'microwave') {
      // 放电器的空位：上下各一片层板夹着，电器本身画黑白线条
      const st = 18;
      box(xi0, xi1, f.cy0 - (f.ri === rows.length - 1 ? 0 : st / 2), f.cy0 + st / 2, zIn0, D, 'shelf');
      box(xi0, xi1, f.cy1 - st / 2, f.cy1 + (f.ri === 0 ? 0 : st / 2), zIn0, D, 'shelf');
      applianceFront(f.c.type, f.x0 + 2, f.x1 - 2, f.cy0 + st / 2 + 2, f.cy1 - st / 2 - 2, D, box, seg);
      continue;
    }
    const t = num(f.c.thickness, 18);
    maxT = Math.max(maxT, t);
    const isDoor = f.c.type === 'door' || f.c.type === 'glass';
    const open = isDoor && (f.c.open === 'open' || (f.c.open !== 'closed' && opts.openAll));
    if (!open) { buildFront(f, t, D, cab.type, box, seg, lines, dashed); continue; }
    // 门打开：先照关着的样子算，再绕铰链转一个角度
    const fb = [], fl = [], fd = [];
    buildFront(f, t, D, cab.type, (x0, x1, ya, yb, z0, z1, tag) => fb.push({ x0, x1, y0: ya, y1: yb, z0, z1, tag }), (a, b, arr = fl) => arr.push([...a, ...b]), fl, fd);
    const th = ((opts.angle ?? 45) * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th);
    const hingeR = f.c.hinge === 'R', hx = hingeR ? f.x1 : f.x0;
    const R = (x, z) => { const dx = hingeR ? hx - x : x - hx, dz = z - D; const rx = dx * cs - dz * sn; return [hingeR ? hx - rx : hx + rx, D + dx * sn + dz * cs]; };
    for (const b of fb) {
      const q = [R(b.x0, b.z0), R(b.x1, b.z0), R(b.x1, b.z1), R(b.x0, b.z1)];
      frusta.push({ b: q, y0: b.y0, t: q, y1: b.y1, tag: 'openFront' });
    }
    for (const s of fl) { const [ax, az] = R(s[0], s[2]); const [bx, bz] = R(s[3], s[5]); lines.push([ax, s[1], az, bx, s[4], bz]); }
  }
  if (cab.special === 'corner' && cab.corner) maxT = Math.max(maxT, num(cab.corner.C, 18));

  // 配件（拉篮、煤气桶拉篮、挂裤架）：只画线，不挡东西，开门或开放柜才看得到
  const shelfTops = boxes.filter((b) => b.tag === 'shelf').map((b) => b.y0);
  for (const acc of cab.accessories || []) accessoryParts(acc, { bays, yIn0, yIn1, zIn0, D, seg, box, dotted, shelfTops });

  // 水盆橱：给台面用的开孔位置
  let sinkCut = null, hobCut = null;
  if (sink) sinkCut = { type: sink.type, x: W / 2 + num(sink.offset, 0), w: num(sink.width, 760), d: num(sink.depth, 430) };
  if (cab.special === 'hob' && cab.hob) hobCut = { x: W / 2 + num(cab.hob.offset, 0), w: num(cab.hob.width, 560), d: num(cab.hob.depth, 490) };

  if (kick.board && y0 > 1) {
    const kt = num(kick.thickness, 16);
    const zFront = kick.position === 'flush' ? D + (maxT || 18) : D;
    box(0, W, 0, y0, zFront - kt, zFront, 'kick');
  }

  return { boxes, frusta, lines, dashed, dotted, fronts, frontDepth: D + maxT, bays, inner: { xi0, xi1, yIn0, yIn1, zIn0 }, sinkCut, hobCut };
}

// 焗炉 / 微波炉的正面线条（通用款式，不照某个牌子）
function applianceFront(kind, x0, x1, y0, y1, D, box, seg) {
  const z = D + 2;
  box(x0, x1, y0, y1, D - 450, D + 1, 'appliance');
  const P = (pts) => pts.forEach((s) => seg([s[0], s[1], z], [s[2], s[3], z]));
  const w = x1 - x0, h = y1 - y0;
  if (kind === 'oven') {
    const strip = Math.min(100, h * 0.18);
    P(rect(x0, y1 - strip, x1, y1)); // 控制条
    P(circle(x0 + w * 0.15, y1 - strip / 2, strip * 0.25, 16));
    P(circle(x1 - w * 0.15, y1 - strip / 2, strip * 0.25, 16));
    P(rect(x0 + w * 0.38, y1 - strip * 0.7, x1 - w * 0.38, y1 - strip * 0.3)); // 显示屏
    const dy1 = y1 - strip;
    P(rect(x0 + w * 0.12, dy1 - 60, x1 - w * 0.12, dy1 - 45)); // 拉手
    P(rect(x0 + w * 0.12, y0 + h * 0.12, x1 - w * 0.12, dy1 - 90)); // 玻璃窗
  } else {
    const panelX = x0 + w * 0.74;
    P([[panelX, y0, panelX, y1]]);
    P(rect(x0 + w * 0.06, y0 + h * 0.15, panelX - w * 0.06, y1 - h * 0.15)); // 玻璃窗
    P(rect(panelX + w * 0.04, y1 - h * 0.35, x1 - w * 0.04, y1 - h * 0.15)); // 显示屏
    for (let k = 0; k < 3; k++) {
      const yy = y1 - h * (0.45 + k * 0.13);
      P(rect(panelX + w * 0.05, yy - h * 0.04, x1 - w * 0.05, yy + h * 0.04));
    }
  }
}

// 配件：拉篮、挂衣杆、橱身里的抽屉、镜子、烫衣板、LED 灯条
function accessoryParts(acc, { bays, yIn0, yIn1, zIn0, D, seg, box, dotted, shelfTops }) {
  const bay = bays[acc.bay == null || acc.bay === '' ? 0 : Number(acc.bay)] || bays[0];
  if (!bay) return;
  const bw = bay[1] - bay[0];
  const y = yIn0 + num(acc.y, acc.type === 'rail' ? yIn1 - yIn0 - 80 : acc.type === 'innerDrawer' ? 0 : 40);

  if (acc.type === 'rail') { // 挂衣杆：椭圆杆，画成扁盒子
    const zc = (zIn0 + D) / 2;
    box(bay[0], bay[1], y - 15, y + 15, zc - 8, zc + 8, 'rail');
    return;
  }
  if (acc.type === 'innerDrawer') { // 橱身里的抽屉，面板缩在门后面，默认 45° 斜切
    const n = Math.max(1, Math.round(num(acc.count, 1)));
    const hh = num(acc.height, 250);
    const zF = D - 25;
    for (let k = 0; k < n; k++) {
      const ya = y + k * hh, yb = ya + hh - 3;
      box(bay[0] + 2, bay[1] - 2, ya, yb, zF - 18, zF, 'innerDrawer');
      seg([bay[0] + 2, yb - 15, zF + 0.3], [bay[1] - 2, yb - 15, zF + 0.3]); // 45° 斜切
      box(bay[0] + 15, bay[1] - 15, ya + 10, ya + Math.min(hh - 40, 160), zIn0 + 20, zF - 18, 'drawerBox');
    }
    return;
  }
  if (acc.type === 'mirror') { // 镜子贴在背板上
    const mw = num(acc.width, bw - 40), mh = num(acc.height, 600);
    const mx0 = bay[0] + (bw - mw) / 2, z = zIn0 + 1;
    for (const s of rect(mx0, y, mx0 + mw, y + mh)) seg([s[0], s[1], z], [s[2], s[3], z]);
    const k = Math.min(mw, mh) * 0.2;
    seg([mx0 + k, y + mh - k * 0.5, z], [mx0 + k * 2, y + mh - k * 1.5, z]);
    seg([mx0 + k * 1.5, y + mh - k * 0.5, z], [mx0 + k * 2.5, y + mh - k * 1.5, z]);
    return;
  }
  if (acc.type === 'ironing') { // 放烫衣板的位置：一块可以拉出来的板
    const hh = num(acc.height, 250);
    box(bay[0] + 5, bay[1] - 5, y, y + 25, zIn0 + 20, D - 30, 'ironing');
    seg([bay[0] + 5, y + hh, D - 30], [bay[1] - 5, y + hh, D - 30]);
    return;
  }
  if (acc.type === 'led') { // LED 灯条：虚点线
    const inset = num(acc.inset, 75);
    const pos = acc.position || 'sides';
    if (pos === 'sides') {
      const z = D - inset;
      dotted.push([bay[0] + 1, yIn0, z, bay[0] + 1, yIn1, z], [bay[1] - 1, yIn0, z, bay[1] - 1, yIn1, z]);
    } else if (pos === 'under') {
      const yy = yIn0 + num(acc.y, yIn1 - yIn0) - 1, z = (zIn0 + D) / 2;
      dotted.push([bay[0], yy, z, bay[1], yy, z]);
    } else {
      for (const ys of shelfTops) dotted.push([bay[0], ys - 1, D - inset, bay[1], ys - 1, D - inset]);
    }
    return;
  }

  const aw = num(acc.width, bw - 40);
  const ax0 = bay[0] + (bw - aw) / 2, ax1 = ax0 + aw;
  const ad = num(acc.depth, D - zIn0 - 60);
  const az0 = Math.max(zIn0 + 10, D - 30 - ad), az1 = D - 30;
  const ah = num(acc.height, acc.type === 'trouser' ? 60 : acc.type === 'gasBasket' ? Math.max(100, yIn1 - yIn0 - 120) : 150);
  const basketAt = (ya, yb) => {
    const c = [[ax0, az0], [ax1, az0], [ax1, az1], [ax0, az1]];
    for (let k = 0; k < 4; k++) {
      const [xa, za] = c[k], [xb, zb] = c[(k + 1) % 4];
      seg([xa, ya, za], [xb, ya, zb]); seg([xa, yb, za], [xb, yb, zb]); seg([xa, ya, za], [xa, yb, za]);
    }
    // 前面的铁线
    for (let x = ax0 + 60; x < ax1 - 30; x += 60) seg([x, ya, az1], [x, yb, az1]);
    seg([ax0, (ya + yb) / 2, az1], [ax1, (ya + yb) / 2, az1]);
  };
  if (acc.type === 'trouser') {
    for (let k = 0; k < 6; k++) { const z = az0 + ((az1 - az0) * (k + 0.5)) / 6; seg([ax0, y + ah, z], [ax1, y + ah, z]); }
    seg([ax0, y + ah, az0], [ax0, y + ah, az1]); seg([ax1, y + ah, az0], [ax1, y + ah, az1]);
  } else if (acc.type === 'basket2') {
    const gapY = num(acc.tierGap, 250);
    basketAt(y, y + ah);
    basketAt(y + gapY, y + gapY + ah);
  } else {
    basketAt(y, y + ah);
  }
}

function buildFront(f, t, D, cabType, box, seg, lines, dashed) {
  const { c } = f;
  const { x0, x1, y0, y1 } = f;
  const zF = D + t; // 门板前面
  const w = x1 - x0, h = y1 - y0;
  const face = (u, v) => [u, v, zF + 0.3];

  if (c.style === 'frame' || c.type === 'glass') {
    const fw = Math.min(num(c.frameWidth, 60), w / 2 - 1, h / 2 - 1);
    box(x0, x0 + fw, y0, y1, D, zF, 'front');
    box(x1 - fw, x1, y0, y1, D, zF, 'front');
    box(x0 + fw, x1 - fw, y1 - fw, y1, D, zF, 'front');
    box(x0 + fw, x1 - fw, y0, y0 + fw, D, zF, 'front');
    if (c.type === 'glass') {
      // 玻璃：不挡后面，画两条反光线
      const gx0 = x0 + fw, gx1 = x1 - fw, gy0 = y0 + fw, gy1 = y1 - fw;
      const k = Math.min(gx1 - gx0, gy1 - gy0) * 0.25;
      seg([gx0 + k, gy1 - k * 0.4, D + t / 2], [gx0 + k * 1.8, gy1 - k * 1.2, D + t / 2]);
      seg([gx0 + k * 1.3, gy1 - k * 0.4, D + t / 2], [gx0 + k * 2.1, gy1 - k * 1.2, D + t / 2]);
      for (const s of rect(gx0, gy0, gx1, gy1)) seg([s[0], s[1], D + t / 2], [s[2], s[3], D + t / 2]);
    } else {
      const pd = num(c.panelDepth, 6);
      const zp = c.panelMode === 'raised' ? zF + pd : zF - pd;
      box(x0 + fw, x1 - fw, y0 + fw, y1 - fw, D, Math.max(D + 1, zp), 'front');
    }
  } else {
    box(x0, x1, y0, y1, D, zF, 'front');
  }

  // 拉手
  const hd = c.handle || { type: 'none' };
  const isDoor = c.type === 'door' || c.type === 'glass' || c.type === 'fake';
  const openSideX = c.hinge === 'R' ? x0 : x1; // 拉手在铰链的对面
  const dirIn = c.hinge === 'R' ? 1 : -1;
  // 拉手高度：下座橱的门在上面，上座橱在下面，高橱在中间偏下
  const handleY = c.type === 'drawer' ? y1 - Math.min(60, h / 3)
    : cabType === 'upper' ? y0 + Math.min(80, h / 4)
      : cabType === 'tall' ? Math.min(y1 - 80, Math.max(y0 + 80, 1050))
        : y1 - Math.min(90, h / 4);
  const orient = hd.orient === 'auto' || !hd.orient ? (c.type === 'drawer' ? 'h' : 'v') : hd.orient;
  const P = (pts) => pts.forEach((s) => seg(face(s[0], s[1]), face(s[2], s[3])));
  switch (hd.type) {
    case 'bevel45': { // 45° 斜切：上面（上座橱是下面）切一条
      const yb = cabType === 'upper' && c.type !== 'drawer' ? y0 + 15 : y1 - 15;
      P([[x0, yb, x1, yb]]);
      break;
    }
    case 'notch': {
      const nw = Math.min(120, w * 0.5), nd = 25;
      if (c.type === 'drawer' || !isDoor) {
        const cx = (x0 + x1) / 2;
        P([[cx - nw / 2, y1, cx - nw / 2, y1 - nd], [cx - nw / 2, y1 - nd, cx + nw / 2, y1 - nd], [cx + nw / 2, y1 - nd, cx + nw / 2, y1]]);
      } else {
        const ex = openSideX, ix = openSideX + dirIn * nd;
        const ny = cabType === 'upper' ? y0 + nw / 2 + 20 : y1 - nw / 2 - 20;
        P([[ex, ny - nw / 2, ix, ny - nw / 2], [ix, ny - nw / 2, ix, ny + nw / 2], [ix, ny + nw / 2, ex, ny + nw / 2]]);
      }
      break;
    }
    case 'jprofile': {
      const yb = cabType === 'upper' && c.type !== 'drawer' ? y0 : y1;
      const s = yb === y1 ? -1 : 1;
      P([[x0, yb + s * 30, x1, yb + s * 30], [x0, yb + s * 22, x1, yb + s * 22]]);
      break;
    }
    case 'bar': {
      const len = Math.min(num(hd.length, 160), (orient === 'h' ? w : h) - 40);
      if (orient === 'h') {
        const cx = (x0 + x1) / 2;
        P(rect(cx - len / 2, handleY - 6, cx + len / 2, handleY + 6));
      } else {
        const hx = isDoor ? openSideX + dirIn * 45 : (x0 + x1) / 2;
        const cy = c.type === 'drawer' ? (y0 + y1) / 2 : Math.max(y0 + len / 2 + 20, Math.min(y1 - len / 2 - 20, cabType === 'upper' ? y0 + len / 2 + 50 : cabType === 'base' ? y1 - len / 2 - 50 : handleY));
        P(rect(hx - 6, cy - len / 2, hx + 6, cy + len / 2));
      }
      break;
    }
    case 'recessed': {
      const rw = 120, rh = 30;
      if (orient === 'h' || !isDoor) {
        const cx = (x0 + x1) / 2;
        P([...rect(cx - rw / 2, handleY - rh / 2, cx + rw / 2, handleY + rh / 2), ...rect(cx - rw / 2 + 6, handleY - rh / 2 + 6, cx + rw / 2 - 6, handleY + rh / 2 - 6)]);
      } else {
        const hx = openSideX + dirIn * 40;
        const cy = cabType === 'upper' ? y0 + 120 : cabType === 'base' ? y1 - 120 : handleY;
        P([...rect(hx - rh / 2, cy - rw / 2, hx + rh / 2, cy + rw / 2), ...rect(hx - rh / 2 + 6, cy - rw / 2 + 6, hx + rh / 2 - 6, cy + rw / 2 - 6)]);
      }
      break;
    }
    case 'knob': {
      const kx = isDoor ? openSideX + dirIn * 45 : (x0 + x1) / 2;
      P(circle(kx, handleY, 15, 16));
      break;
    }
    default: break;
  }

  // 开门方向（虚线）：尖角指向铰链那一边
  if (c.type === 'door' || c.type === 'glass') {
    const hx = c.hinge === 'R' ? x1 : x0;
    const ox = c.hinge === 'R' ? x0 : x1;
    const my = (y0 + y1) / 2;
    seg(face(ox, y1), face(hx, my), dashed);
    seg(face(hx, my), face(ox, y0), dashed);
  }
}

// 柜子在墙上：左右怎么对到墙的 u 方向
export function cabToWall(cab, wall) {
  const W = +cab.width;
  const off = +cab.offset;
  return wall.rightIsU ? (x) => off + x : (x) => off + W - x;
}

export function cabLabel(cab, letter) {
  return `${CAB_TYPES[cab.type]} · 墙 ${letter} · ${cab.width}×${cab.height}×${cab.depth}`;
}
