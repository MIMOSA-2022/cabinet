// 平面图（SVG，从上往下看）。尺寸线蓝色，墙标 (A)(B)(C)(D)，头顶上的东西用虚线。

import { wallPt, wallExtPt, solidIntervals, cornerExtension, add, sub, mul, fmt } from './geometry.js';
import { wallItemSegments } from './symbols.js';
import { cabToWall } from './cabinet.js';
import { buildUnit } from './units.js';
import { seamPositions, cutouts } from './countertop.js';

const NS = 'http://www.w3.org/2000/svg';
const BLUE = '#1f4fd8';

function E(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}
const P = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

export class PlanView {
  constructor(svg, { onSelect, onDragStart, onDrag, onDragEnd }) {
    this.svg = svg;
    this.onSelect = onSelect;
    this.onDragStart = onDragStart;
    this.onDrag = onDrag;
    this.onDragEnd = onDragEnd;
    this.vb = null;
    this.lastBoundsKey = '';
    this._bindPanZoom();
  }

  fit() { this.vb = null; if (this._last) this.render(...this._last); }

  _bindPanZoom() {
    const svg = this.svg;
    svg.addEventListener('wheel', (e) => {
      if (!this.vb) return;
      e.preventDefault();
      const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      const r = svg.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const [x, y, w, h] = this._effectiveVB();
      const nw = w * k, nh = h * k;
      const nx = x + (w - nw) * fx, ny = y + (h - nh) * fy;
      this._setVBFromEffective(nx, ny, nw, nh);
    }, { passive: false });
    let drag = null;
    // 平板：两只手指捏开捏合 = 缩放，两只手指一起移动 = 平移
    const pts = new Map();
    let pinch = null;
    const pinchState = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    svg.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { svg.setPointerCapture(e.pointerId); } catch { /* 有些情况不能抓住手指，不影响 */ }
      if (pts.size === 2) {
        // 第二只手指放下：取消正在拖的东西，改成缩放
        if (drag && drag.moved && drag.itemId && this.onDragEnd) this.onDragEnd(drag.itemId);
        drag = null;
        pinch = { ...pinchState(), vb: this._effectiveVB() };
        return;
      }
      if (pts.size > 2) return;
      const item = e.target.closest && e.target.closest('[data-drag]');
      drag = { x: e.clientX, y: e.clientY, moved: false, vb: this._effectiveVB(), target: e.target,
        itemId: item ? item.getAttribute('data-id') : null, touch: e.pointerType === 'touch' };
    });
    const endPointer = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    svg.addEventListener('pointercancel', (e) => { endPointer(e); drag = null; });
    svg.addEventListener('pointermove', (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const s = pinchState();
        const r = svg.getBoundingClientRect();
        const [x, y, w, h] = pinch.vb;
        const k = pinch.d / s.d; // 手指分开 → 视图变小 → 放大
        const nw = w * k, nh = h * k;
        const fx0 = (pinch.mx - r.left) / r.width, fy0 = (pinch.my - r.top) / r.height;
        const fx1 = (s.mx - r.left) / r.width, fy1 = (s.my - r.top) / r.height;
        // 两指中点下的那一点跟着手指走
        const wx = x + fx0 * w, wy = y + fy0 * h;
        this._setVBFromEffective(wx - fx1 * nw, wy - fy1 * nh, nw, nh);
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > (drag.touch ? 10 : 4)) {
        drag.moved = true;
        if (drag.itemId && this.onDragStart) this.onDragStart(drag.itemId);
      }
      if (!drag.moved) return;
      const r = svg.getBoundingClientRect();
      const [x, y, w, h] = drag.vb;
      const k = w / r.width; // 每个屏幕像素是几 mm
      if (drag.itemId && this.onDrag) this.onDrag(drag.itemId, { x: dx * k, y: dy * k }, k);
      else this._setVBFromEffective(x - dx * k, y - (dy * h) / r.height, w, h);
    });
    svg.addEventListener('pointerup', (e) => {
      const wasPinch = !!pinch || pts.size > 1;
      endPointer(e);
      if (wasPinch) { drag = null; return; }
      if (drag && !drag.moved) {
        const hit = drag.target.closest && drag.target.closest('[data-id]');
        this.onSelect(hit ? hit.getAttribute('data-id') : null);
      } else if (drag && drag.itemId && this.onDragEnd) this.onDragEnd(drag.itemId);
      drag = null;
    });
  }

  // 视图框按 SVG 实际长宽比展开后的样子
  _effectiveVB() {
    const r = this.svg.getBoundingClientRect();
    const [x, y, w, h] = this.vb;
    const ar = r.width / Math.max(1, r.height);
    if (w / h > ar) { const nh = w / ar; return [x, y - (nh - h) / 2, w, nh]; }
    const nw = h * ar; return [x - (nw - w) / 2, y, nw, h];
  }
  _setVBFromEffective(x, y, w, h) {
    this.vb = [x, y, w, h];
    this.svg.setAttribute('viewBox', this.vb.map((n) => n.toFixed(1)).join(' '));
  }

  render(project, geom, spans, selectedId) {
    this._last = [project, geom, spans, selectedId];
    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const b = geom.bounds;
    const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1000);
    const fs = Math.min(160, Math.max(70, size / 38));
    this.fs = fs;
    if (!this.vb) {
      const m = fs * 9;
      this.vb = [b.minX - m, b.minY - m, b.maxX - b.minX + 2 * m, b.maxY - b.minY + 2 * m];
    }
    svg.setAttribute('viewBox', this.vb.join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const defs = E('defs', {}, svg);
    const pat = E('pattern', { id: 'hatch', patternUnits: 'userSpaceOnUse', width: 60, height: 60, patternTransform: 'rotate(45)' }, defs);
    E('rect', { width: 60, height: 60, fill: '#fff' }, pat);
    E('line', { x1: 0, y1: 0, x2: 0, y2: 60, stroke: '#9a9a9a', 'stroke-width': 6 }, pat);

    const gWalls = E('g', { class: 'walls' }, svg);
    const gOpen = E('g', { class: 'openings' }, svg);
    const gItems = E('g', { class: 'items' }, svg);
    const gDims = E('g', { class: 'dims' }, svg);
    const gLabels = E('g', { class: 'labels' }, svg);

    const line = (g, a, c, cls = 'ln', extra = {}) =>
      E('line', { x1: a.x, y1: a.y, x2: c.x, y2: c.y, class: cls, ...extra }, g);
    const poly = (g, pts, cls, extra = {}) => E('polygon', { points: pts.map(P).join(' '), class: cls, ...extra }, g);
    const polyline = (g, pts, cls, extra = {}) => E('polyline', { points: pts.map(P).join(' '), class: cls, ...extra }, g);

    // ---------- 墙 ----------
    geom.walls.forEach((w, i) => {
      const sel = selectedId === w.id ? ' sel' : '';
      const g = E('g', { 'data-id': w.id, class: 'wall' + sel }, gWalls);
      for (const [a, c] of solidIntervals(w, spans[i])) {
        poly(g, [wallPt(w, a), wallPt(w, c), wallExtPt(w, c), wallExtPt(w, a)], 'wallfill');
        line(g, wallPt(w, a), wallPt(w, c));
        line(g, wallExtPt(w, a), wallExtPt(w, c));
        if (a > 0.5) line(g, wallPt(w, a), wallExtPt(w, a));
        if (c < w.L - 0.5) line(g, wallPt(w, c), wallExtPt(w, c));
      }
    });
    if (geom.gap > 1 && geom.walls.length) {
      const last = geom.walls[geom.walls.length - 1];
      line(gWalls, last.e, geom.walls[0].s, 'gap');
      const m = mul(add(last.e, geom.walls[0].s), 0.5);
      E('text', { x: m.x, y: m.y - fs * 0.6, class: 'gaptext', 'font-size': fs * 0.8, 'text-anchor': 'middle' }, gWalls)
        .textContent = `没闭合：差 ${fmt(geom.gap)} mm`;
    }

    // ---------- 门窗 ----------
    geom.walls.forEach((w, i) => {
      for (const sp of spans[i]) {
        const it = sp.item;
        const g = E('g', { 'data-id': it.id, class: 'open' + (selectedId === it.id ? ' sel' : '') }, gOpen);
        // 洞口里面的透明点击区
        poly(g, [wallPt(w, sp.u0), wallPt(w, sp.u1), wallExtPt(w, sp.u1), wallExtPt(w, sp.u0)], 'hit');
        if (it.kind === 'window') this._window(g, geom, w, sp, it, line, poly);
        else this._door(g, w, sp, it, line, poly, polyline);
      }
    });

    // ---------- 天花障碍物 / 柱子 ----------
    for (const it of project.ceilingItems) {
      const w = geom.byId[it.wall];
      if (!w) continue;
      const g = E('g', { 'data-id': it.id, class: 'citem' + (selectedId === it.id ? ' sel' : '') }, gItems);
      const u0 = +it.offset;
      const u1 = u0 + (it.kind === 'column' ? +it.width : +it.length);
      const dep = it.kind === 'column' ? +it.depth : +it.projection;
      const pts = [wallPt(w, u0, 0), wallPt(w, u1, 0), wallPt(w, u1, -dep), wallPt(w, u0, -dep)];
      if (it.kind === 'column') {
        poly(g, pts, 'column');
        line(g, pts[0], pts[2]); line(g, pts[1], pts[3]);
      } else {
        poly(g, pts, 'overhead');
        const c = wallPt(w, (u0 + u1) / 2, -dep / 2);
        const t = E('text', { x: c.x, y: c.y, 'font-size': fs * 0.55, class: 'itemtext', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, g);
        t.textContent = it.kind === 'pelmet' ? 'PELMET' : 'BEAM';
        rotateText(t, w, c);
      }
    }

    // ---------- 柜子（上座橱用虚线，画在最上面）----------
    const overhead = (c) => (c.kind === 'cabinet' && c.type === 'upper') || c.kind === 'hood';
    const cabs = [...(project.cabinets || [])].sort((a, b) => overhead(a) - overhead(b));
    let ctDrawn = false;
    const drawCountertops = () => {
      if (ctDrawn) return;
      ctDrawn = true;
      for (const ct of project.countertops || []) {
        const w = geom.byId[ct.wall];
        if (!w) continue;
        const g = E('g', { 'data-id': ct.id, class: 'ct' + (selectedId === ct.id ? ' sel' : '') }, gItems);
        const a = +ct.offset, b = a + +ct.length, F = +ct.depth + (+ct.overhang || 0);
        poly(g, [wallPt(w, a, 0), wallPt(w, b, 0), wallPt(w, b, -F), wallPt(w, a, -F)], 'ctop');
        for (const u of seamPositions(ct)) line(g, wallPt(w, u, 0), wallPt(w, u, -F), 'seam');
        for (const c of cutouts(ct, project, geom)) {
          const zc = c.type === 'farmhouse' ? F - c.d / 2 : Math.min(F - 60, (F + c.d) / 2 + 20) - c.d / 2;
          poly(g, [wallPt(w, c.u - c.w / 2, -(zc - c.d / 2)), wallPt(w, c.u + c.w / 2, -(zc - c.d / 2)), wallPt(w, c.u + c.w / 2, -(zc + c.d / 2)), wallPt(w, c.u - c.w / 2, -(zc + c.d / 2))], 'cut');
          if (c.kind === 'hob') {
            const p1 = wallPt(w, c.u - c.w * 0.22, -zc), p2 = wallPt(w, c.u + c.w * 0.22, -zc);
            E('circle', { cx: p1.x, cy: p1.y, r: Math.min(c.w, c.d) * 0.22, class: 'cut' }, g);
            E('circle', { cx: p2.x, cy: p2.y, r: Math.min(c.w, c.d) * 0.18, class: 'cut' }, g);
          } else if (c.type === 'ss2') line(g, wallPt(w, c.u, -(zc - c.d / 2)), wallPt(w, c.u, -(zc + c.d / 2)), 'ln');
        }
      }
    };
    for (const cab of cabs) {
      if (overhead(cab)) drawCountertops();
      const w = geom.byId[cab.wall];
      if (!w) continue;
      const built = buildUnit(cab);
      const U = cabToWall(cab, w);
      const uA = Math.min(U(0), U(+cab.width)), uB = Math.max(U(0), U(+cab.width));
      const g = E('g', { 'data-id': cab.id, 'data-drag': '1', class: 'cab' + (selectedId === cab.id ? ' sel' : '') }, gItems);
      if (cab.kind !== 'cabinet') {
        // 冰箱、油烟机、见光板、Filler：画它的外形
        for (const bx of built.boxes.filter((x) => x.tag !== 'chimney')) {
          const a = U(bx.x0), b = U(bx.x1);
          poly(g, [wallPt(w, Math.min(a, b), -bx.z0), wallPt(w, Math.max(a, b), -bx.z0), wallPt(w, Math.max(a, b), -bx.z1), wallPt(w, Math.min(a, b), -bx.z1)], cab.kind === 'hood' ? 'cabUpper' : 'cabBase');
        }
        for (const f of built.frusta || []) poly(g, f.b.map(([x, z]) => wallPt(w, U(x), -z)), 'cabUpper');
        if (cab.kind === 'fridge' || cab.kind === 'hood') {
          const c = wallPt(w, (uA + uB) / 2, -(+cab.depth) / 2 - (cab.kind === 'hood' && cab.style === 'island' ? +cab.distFromWall : 0));
          const t = E('text', { x: c.x, y: c.y, 'font-size': fs * 0.5, class: 'cabtext', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, g);
          t.textContent = cab.kind === 'fridge' ? 'REF' : 'HOOD';
          rotateText(t, w, c);
        }
        continue;
      }
      const D = +cab.depth, FD = built.frontDepth;
      const body = [wallPt(w, uA, 0), wallPt(w, uB, 0), wallPt(w, uB, -D), wallPt(w, uA, -D)];
      poly(g, body, cab.type === 'upper' ? 'cabUpper' : 'cabBase');
      for (const bx of built.boxes.filter((x) => x.tag === 'filler' || x.tag === 'apron')) {
        const a = U(bx.x0), b = U(bx.x1);
        poly(g, [wallPt(w, Math.min(a, b), -bx.z0), wallPt(w, Math.max(a, b), -bx.z0), wallPt(w, Math.max(a, b), -bx.z1), wallPt(w, Math.min(a, b), -bx.z1)], 'filler');
      }
      if (FD > D + 0.5) {
        for (const f of built.fronts) {
          const a = U(f.x0), b = U(f.x1);
          poly(g, [wallPt(w, Math.min(a, b), -D), wallPt(w, Math.max(a, b), -D), wallPt(w, Math.max(a, b), -D - (+f.c.thickness || 18)), wallPt(w, Math.min(a, b), -D - (+f.c.thickness || 18))], cab.type === 'upper' ? 'cabUpper' : 'cabFront');
        }
      }
      if (cab.type === 'tall') line(g, body[0], body[2], 'thin');
      const c = wallPt(w, (uA + uB) / 2, -D / 2);
      const t = E('text', { x: c.x, y: c.y, 'font-size': fs * 0.5, class: 'cabtext', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, g);
      const tag = cab.special === 'sink' ? '水盆 ' : cab.special === 'hob' ? '炉 ' : cab.special === 'ovenMicro' ? 'OVEN ' : cab.special === 'corner' ? '转角 ' : '';
      t.textContent = `${tag}${cab.type === 'upper' ? '上 ' : cab.type === 'tall' && !tag ? '高 ' : ''}${fmt(+cab.width)}`;
      rotateText(t, w, c);
    }
    drawCountertops();

    // ---------- 墙上的东西 ----------
    for (const it of project.wallItems) {
      const w = geom.byId[it.wall];
      if (!w) continue;
      const g = E('g', { 'data-id': it.id, class: 'witem' + (selectedId === it.id ? ' sel' : '') }, gItems);
      const u = +it.offset;
      if (it.kind === 'drainFloor') {
        const c = wallPt(w, u, -it.distFromWall);
        for (const s of wallItemSegments('drainFloor')) {
          line(g, add(c, { x: s[0] * 1.2, y: -s[1] * 1.2 }), add(c, { x: s[2] * 1.2, y: -s[3] * 1.2 }));
        }
        E('circle', { cx: c.x, cy: c.y, r: 70, class: 'hit' }, g);
        // 离两面墙的尺寸
        smallDim(gDims, wallPt(w, u, 0), c, fmt(it.distFromWall), fs);
        smallDim(gDims, wallPt(w, 0, -it.distFromWall), c, fmt(u), fs);
        continue;
      }
      const base = wallPt(w, u, 0);
      const inward = (k) => wallPt(w, u, -k);
      if (it.kind === 'socket') {
        poly(g, [wallPt(w, u - 70, 0), wallPt(w, u + 70, 0), wallPt(w, u + 70, -60), wallPt(w, u - 70, -60)], 'sym');
        line(g, wallPt(w, u - 25, -15), wallPt(w, u - 25, -45));
        line(g, wallPt(w, u + 25, -15), wallPt(w, u + 25, -45));
      } else if (it.kind === 'switch') {
        const c = inward(70);
        E('circle', { cx: c.x, cy: c.y, r: 35, class: 'sym' }, g);
        line(g, base, wallPt(w, u, -35));
        line(g, c, wallPt(w, u + 50, -120));
      } else if (it.kind === 'waterIn') {
        const c = inward(55);
        E('circle', { cx: c.x, cy: c.y, r: 35, class: 'symfill' }, g);
        line(g, base, wallPt(w, u, -20));
      } else if (it.kind === 'drainWall') {
        const c = inward(55);
        E('circle', { cx: c.x, cy: c.y, r: 35, class: 'sym' }, g);
        line(g, wallPt(w, u - 25, -30), wallPt(w, u + 25, -80));
        line(g, wallPt(w, u + 25, -30), wallPt(w, u - 25, -80));
      }
      const tp = inward(180 + fs * 0.4);
      const t = E('text', { x: tp.x, y: tp.y, 'font-size': fs * 0.55, class: 'itemtext', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, g);
      t.textContent = `H${fmt(it.height)}`;
      rotateText(t, w, tp);
    }

    // ---------- 尺寸线 ----------
    geom.walls.forEach((w, i) => {
      const pts = new Set([0, w.L]);
      for (const sp of spans[i]) { pts.add(clampU(sp.u0, w)); pts.add(clampU(sp.u1, w)); }
      for (const it of project.ceilingItems) if (it.wall === w.id && it.kind === 'column') {
        pts.add(clampU(+it.offset, w)); pts.add(clampU(+it.offset + +it.width, w));
      }
      const chain = [...pts].sort((a, b) => a - b);
      const step = fs * 2.6;
      let off = w.t + step;
      if (chain.length > 2) {
        dimChain(gDims, w, chain, off, fs);
        off += step;
      }
      dimChain(gDims, w, [0, w.L], off, fs);
    });

    // ---------- 墙标 (A)(B)… ----------
    geom.walls.forEach((w) => {
      // 墙标放在柜子前面，不压到柜子
      const deepest = Math.max(0, ...(project.cabinets || []).filter((cb) => cb.wall === w.id).map((cb) => +cb.depth + 20));
      const c = wallPt(w, w.L / 2, -Math.max(fs * 4.2, deepest + fs * 1.6));
      const g = E('g', { 'data-id': w.id }, gLabels);
      E('circle', { cx: c.x, cy: c.y, r: fs * 0.9, class: 'label' }, g);
      E('text', { x: c.x, y: c.y, 'font-size': fs * 1.05, class: 'labeltext', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g).textContent = w.letter;
    });
  }

  _window(g, geom, w, sp, it, line, poly) {
    const fo = +it.frameOffset, fd = +it.frameDepth;
    let u0 = sp.u0, u1 = sp.u1;
    if (sp.atEnd) u1 = w.L + cornerExtension(geom, w.index, fo + fd / 2).ext1;
    if (sp.atStart) {
      const N = geom.walls.length;
      u0 = -cornerExtension(geom, (w.index - 1 + N) % N, fo + fd / 2).ext2;
    }
    poly(g, [wallPt(w, u0, fo), wallPt(w, u1, fo), wallPt(w, u1, fo + fd), wallPt(w, u0, fo + fd)], 'frame');
    line(g, wallPt(w, u0, fo + fd / 2), wallPt(w, u1, fo + fd / 2));
    line(g, wallPt(w, sp.u0, 0), wallPt(w, sp.u1, 0), 'thin');
    line(g, wallExtPt(w, sp.u0), wallExtPt(w, sp.u1), 'thin');
    if (sp.atEnd && it.corner && it.corner.post) {
      const c = wallPt(w, u1, fo + fd / 2);
      const r = fd * 0.6;
      E('rect', { x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r, class: 'post' }, g);
    }
  }

  _door(g, w, sp, it, line, poly, polyline) {
    if (it.doorType === 'opening') return;
    const W = sp.u1 - sp.u0;
    const n = Number(it.leaves) === 2 ? 2 : 1;
    const out = it.swing === 'out';
    const face = it.doorType === 'alu' ? +it.frameOffset : out ? w.t : 0;
    if (it.doorType === 'woodBeading') {
      const bw = +it.beadingWidth, bt = +it.beadingThickness;
      poly(g, [wallPt(w, sp.u0 - bw, 0), wallPt(w, sp.u0, 0), wallPt(w, sp.u0, -bt), wallPt(w, sp.u0 - bw, -bt)], 'sym');
      poly(g, [wallPt(w, sp.u1, 0), wallPt(w, sp.u1 + bw, 0), wallPt(w, sp.u1 + bw, -bt), wallPt(w, sp.u1, -bt)], 'sym');
    }
    if (it.doorType === 'alu') {
      poly(g, [wallPt(w, sp.u0, face), wallPt(w, sp.u1, face), wallPt(w, sp.u1, face + +it.frameDepth), wallPt(w, sp.u0, face + +it.frameDepth)], 'frame');
    }
    if (it.operation === 'sliding') {
      const k = it.doorType === 'alu' ? face + 10 : face;
      line(g, wallPt(w, sp.u0, k), wallPt(w, sp.u0 + W * 0.55, k), 'leaf');
      line(g, wallPt(w, sp.u0 + W * 0.45, k + 30), wallPt(w, sp.u1, k + 30), 'leaf');
      return;
    }
    const dirOpen = out ? 1 : -1; // w 方向
    const leaves = n === 2
      ? [{ hu: sp.u0, sgn: 1, lw: W / 2 }, { hu: sp.u1, sgn: -1, lw: W / 2 }]
      : [it.hinge === 'R' ? { hu: sp.u1, sgn: -1, lw: W } : { hu: sp.u0, sgn: 1, lw: W }];
    for (const lf of leaves) {
      const hinge = wallPt(w, lf.hu, face);
      const openEnd = wallPt(w, lf.hu, face + dirOpen * lf.lw);
      line(g, hinge, openEnd, 'leaf');
      const arc = [];
      for (let k = 0; k <= 18; k++) {
        const a = (k / 18) * (Math.PI / 2);
        arc.push(wallPt(w, lf.hu + lf.sgn * lf.lw * Math.cos(a), face + dirOpen * lf.lw * Math.sin(a)));
      }
      polyline(g, arc, 'arc');
    }
  }
}

function clampU(u, w) { return Math.max(0, Math.min(w.L, u)); }

function rotateText(t, w, c) {
  let ang = (Math.atan2(w.d.y, w.d.x) * 180) / Math.PI;
  if (ang > 90 || ang <= -90) ang += 180;
  t.setAttribute('transform', `rotate(${ang.toFixed(2)} ${c.x.toFixed(1)} ${c.y.toFixed(1)})`);
}

// 一排连续尺寸线，放在墙外 off 的位置
function dimChain(g, w, chain, off, fs) {
  const grp = E('g', { class: 'dim' }, g);
  const a = wallPt(w, chain[0], off), b = wallPt(w, chain[chain.length - 1], off);
  E('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'dimln' }, grp);
  const tick = mul(sub(w.d, w.n), fs * 0.28 / Math.SQRT2);
  for (const u of chain) {
    const p = wallPt(w, u, off);
    const e0 = wallPt(w, u, w.t + fs * 0.3);
    const e1 = wallPt(w, u, off + fs * 0.4);
    E('line', { x1: e0.x, y1: e0.y, x2: e1.x, y2: e1.y, class: 'dimext' }, grp);
    E('line', { x1: p.x - tick.x, y1: p.y - tick.y, x2: p.x + tick.x, y2: p.y + tick.y, class: 'dimtick' }, grp);
  }
  for (let k = 0; k < chain.length - 1; k++) {
    const len = chain[k + 1] - chain[k];
    if (len < 0.5) continue;
    const c = wallPt(w, (chain[k] + chain[k + 1]) / 2, off + fs * 0.55);
    const t = E('text', { x: c.x, y: c.y, 'font-size': fs * 0.75, class: 'dimtext', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, grp);
    t.textContent = fmt(len);
    rotateText(t, w, c);
  }
}

function smallDim(g, a, b, label, fs) {
  const grp = E('g', { class: 'dim' }, g);
  E('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'dimln dashed' }, grp);
  const m = mul(add(a, b), 0.5);
  E('text', { x: m.x, y: m.y, 'font-size': fs * 0.6, class: 'dimtext', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, grp).textContent = label;
}

export { BLUE };
