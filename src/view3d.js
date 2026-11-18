// 黑白线条 3D 视图：白色的面只用来挡住后面的线，看得到的只有黑色线条。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { wallPt, wallExtPt, wallPieces, cornerExtension } from './geometry.js';
import { windowSegments, doorSegments, wallItemSegments, rect } from './symbols.js';
import { cabToWall } from './cabinet.js';
import { buildUnit } from './units.js';
import { buildCountertop } from './countertop.js';
import { overlaySVG, pxPerMm } from './overlay.js';

const SEL = 0xe8590c;

export class View3D {
  constructor(container, { onSelect }) {
    this.container = container;
    this.onSelect = onSelect;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);
    this.camera = new THREE.PerspectiveCamera(45, 1, 10, 200000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', () => this.render());
    this.controls.addEventListener('start', () => { this.preset = null; });
    this.preset = null; // 现在是"总览"或"正面看墙"时，改窗口大小会重新对准
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.matFace = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.matLine = new THREE.LineBasicMaterial({ color: 0x111111 });
    this.matSel = new THREE.LineBasicMaterial({ color: SEL });
    this.matHit = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.matDash = new THREE.LineDashedMaterial({ color: 0x555555, dashSize: 40, gapSize: 30 });
    this.matDot = new THREE.LineDashedMaterial({ color: 0x222222, dashSize: 6, gapSize: 14 }); // LED 灯条
    this.showSwing = true; // 门上画开门方向虚线
    this.wallGroups = [];
    this.hasView = false;
    new ResizeObserver(() => this.resize()).observe(container);
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    container.appendChild(this.overlay);
    this.activeWall = null;
    this._bindOverlay();
    this._bindPick();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.preset === 'overview') this.viewOverview();
    else if (typeof this.preset === 'number') this.viewWall(this.preset);
    else this.render();
  }

  _bindPick() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > (e.pointerType === "touch" ? 10 : 4)) { down = null; return; }
      down = null;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, this.camera);
      const meshes = [];
      this.root.traverseVisible((o) => { if (o.isMesh && o.userData.id) meshes.push(o); });
      const hit = rc.intersectObjects(meshes, false)[0];
      if (this.pickMode) { this.pickMode(hit ? hit.point : null); return; }
      this.onSelect(hit ? hit.object.userData.id : null);
    });
  }

  update(project, geom, spans, selectedId) {
    this.project = project;
    this.selectedId = selectedId;
    this.geom = geom;
    this.root.clear();
    this.wallGroups = [];
    const H = geom.H;
    const N = geom.walls.length;

    geom.walls.forEach((w, i) => {
      const grp = new THREE.Group();
      grp.userData.wall = w;
      this.root.add(grp);
      this.wallGroups.push(grp);
      const B = new Builder(grp, this, w);

      // 墙身
      for (const pc of wallPieces(w, spans[i], H)) {
        const q = [wallPt(w, pc.u0, 0), wallPt(w, pc.u1, 0), wallExtPt(w, pc.u1), wallExtPt(w, pc.u0)];
        B.prism(q, pc.v0, pc.v1, w.id, false);
      }
      const wl = B.lines(selectedId === w.id);
      wl.seg3(B.at(0, 0, 0), B.at(w.L, 0, 0));
      wl.seg3(B.at(0, H, 0), B.at(w.L, H, 0));
      wl.seg3(B.ext(0, 0), B.ext(w.L, 0));
      wl.seg3(B.ext(0, H), B.ext(w.L, H));
      // 墙角竖线（转角窗那段不画）
      const cut = spans[i].filter((s) => s.atStart).map((s) => [s.v0, s.v1]);
      for (const [a, b] of subtractRanges([0, H], cut)) {
        wl.seg3(B.at(0, a, 0), B.at(0, b, 0));
        wl.seg3(B.ext(0, a), B.ext(0, b));
      }
      // 洞口边线
      for (const sp of spans[i]) {
        const L = B.lines(selectedId === sp.item.id);
        const { u0, u1, v0, v1 } = sp;
        for (const v of [v0, v1]) {
          L.seg3(B.at(u0, v, 0), B.at(u1, v, 0));
          L.seg3(B.ext(u0, v), B.ext(u1, v));
        }
        if (!sp.atStart) {
          L.seg3(B.at(u0, v0, 0), B.at(u0, v1, 0)); L.seg3(B.ext(u0, v0), B.ext(u0, v1));
        }
        if (!sp.atEnd) {
          L.seg3(B.at(u1, v0, 0), B.at(u1, v1, 0)); L.seg3(B.ext(u1, v0), B.ext(u1, v1));
        }
        for (const u of [u0, u1]) for (const v of [v0, v1]) L.seg3(B.at(u, v, 0), B.ext(u, v));
      }

      // 门窗本体
      for (const sp of spans[i]) {
        const it = sp.item;
        const sel = selectedId === it.id;
        if (it.kind === 'window') this._window(B, geom, w, sp, it, sel);
        else this._door(B, w, sp, it, sel);
      }

      // 天花障碍物、柱子
      for (const it of project.ceilingItems) {
        if (it.wall !== w.id) continue;
        const sel = selectedId === it.id;
        const u0 = +it.offset;
        if (it.kind === 'column') B.box(u0, u0 + +it.width, 0, H, -it.depth, 0, it.id, sel);
        else B.box(u0, u0 + +it.length, H - it.drop, H, -it.projection, 0, it.id, sel);
      }

      // 墙上的东西
      for (const it of project.wallItems) {
        if (it.wall !== w.id || it.kind === 'drainFloor') continue;
        const L = B.lines(selectedId === it.id);
        for (const s of wallItemSegments(it.kind)) {
          const m = w.rightIsU ? 1 : -1;
          L.seg3(B.at(+it.offset + m * s[0], +it.height + s[1], -1), B.at(+it.offset + m * s[2], +it.height + s[3], -1));
        }
        // 点击区
        const q = [wallPt(w, it.offset - 45, -2), wallPt(w, +it.offset + 45, -2), wallPt(w, +it.offset + 45, -3), wallPt(w, it.offset - 45, -3)];
        B.prism(q, it.height - 45, +it.height + 45, it.id, false, this.matHit);
      }

      // 柜子
      const kicks = [];
      for (const cab of project.cabinets || []) {
        if (cab.wall !== w.id) continue;
        const sel = selectedId === cab.id;
        const built = buildUnit(cab, { openAll: !!project.view?.openAll, angle: +(project.view?.openAngle ?? 45) });
        const U = cabToWall(cab, w);
        for (const bx of built.boxes) {
          const a = U(bx.x0), b = U(bx.x1);
          if (bx.tag === 'kick') { kicks.push({ u0: Math.min(a, b), u1: Math.max(a, b), y1: bx.y1, z0: bx.z0, z1: bx.z1, id: cab.id, sel }); continue; }
          B.box(Math.min(a, b), Math.max(a, b), bx.y0, bx.y1, -bx.z1, -bx.z0, cab.id, sel);
        }
        const L = B.lines(sel);
        for (const s of built.lines) L.seg3(B.at(U(s[0]), s[1], -s[2]), B.at(U(s[3]), s[4], -s[5]));
        for (const f of built.frusta || []) B.frustum(f.b.map(([x, z]) => [U(x), -z]), f.y0, f.t.map(([x, z]) => [U(x), -z]), f.y1, cab.id, sel);
        if (this.showSwing) for (const s of built.dashed) B.dashed.push(...B.at(U(s[0]), s[1], -s[2]), ...B.at(U(s[3]), s[4], -s[5]));
        for (const s of built.dotted || []) B.dotted.push(...B.at(U(s[0]), s[1], -s[2]), ...B.at(U(s[3]), s[4], -s[5]));
      }
      // 踢脚板：连着的柜子连成一整条
      kicks.sort((a, b) => a.u0 - b.u0);
      const runs = [];
      for (const k of kicks) {
        const r = runs[runs.length - 1];
        if (r && Math.abs(r.u1 - k.u0) < 1 && r.y1 === k.y1 && r.z0 === k.z0 && r.z1 === k.z1) { r.u1 = k.u1; r.sel = r.sel || k.sel; }
        else runs.push({ ...k });
      }
      for (const r of runs) B.box(r.u0, r.u1, 0, r.y1, -r.z1, -r.z0, r.id, r.sel);

      // 台面（直接用墙的 u 坐标）
      for (const ct of project.countertops || []) {
        if (ct.wall !== w.id) continue;
        const sel = selectedId === ct.id;
        const built = buildCountertop(ct, project, geom);
        for (const bx of built.boxes) B.box(bx.x0, bx.x1, bx.y0, bx.y1, -bx.z1, -bx.z0, ct.id, sel);
        const L = B.lines(sel);
        for (const s of built.lines) L.seg3(B.at(s[0], s[1], -s[2]), B.at(s[3], s[4], -s[5]));
      }
      B.flush();
    });

    // 地上的东西（不跟着墙隐藏）
    const floor = new THREE.Group();
    this.root.add(floor);
    for (const it of project.wallItems) {
      if (it.kind !== 'drainFloor') continue;
      const w = geom.byId[it.wall];
      if (!w) continue;
      const B = new Builder(floor, this, w);
      const L = B.lines(selectedId === it.id);
      for (const s of wallItemSegments('drainFloor')) {
        L.seg3(B.at(+it.offset + s[0], 1, -it.distFromWall + s[1]), B.at(+it.offset + s[2], 1, -it.distFromWall + s[3]));
      }
      B.flush();
    }
    if (N && geom.gap > 1) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(geom.walls[N - 1].e.x, 0, geom.walls[N - 1].e.y),
        new THREE.Vector3(geom.walls[0].s.x, 0, geom.walls[0].s.y)]);
      this.root.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd00000 })));
    }

    if (!this.hasView) { this.viewOverview(); this.hasView = true; }
    else this.render();
  }

  _window(B, geom, w, sp, it, sel) {
    const fo = +it.frameOffset, fd = +it.frameDepth;
    const N = geom.walls.length;
    let u0 = sp.u0, u1 = sp.u1;
    if (sp.atEnd) u1 = w.L + cornerExtension(geom, w.index, fo).ext1;
    if (sp.atStart) u0 = -cornerExtension(geom, (w.index - 1 + N) % N, fo).ext2;
    const W = u1 - u0, Hh = sp.v1 - sp.v0;
    const rows = sp.part === 2 ? it.corner.rows : it.rows;
    const glassCorner = it.corner && !it.corner.post;
    const opts = { frameWidth: +it.frameWidth };
    const endSide = w.rightIsU ? 'R' : 'L', startSide = w.rightIsU ? 'L' : 'R';
    if (glassCorner && sp.atEnd) { opts.noFrameSide = endSide; opts.forceFixed = endSide; }
    if (glassCorner && sp.atStart) { opts.noFrameSide = startSide; opts.forceFixed = startSide; }
    const L = B.lines(sel);
    for (const s of windowSegments(rows, W, Hh, opts)) {
      const a = w.rightIsU ? s[0] : W - s[0], b = w.rightIsU ? s[2] : W - s[2];
      L.seg3(B.at(u0 + a, sp.v0 + s[1], fo), B.at(u0 + b, sp.v0 + s[3], fo));
    }
    // 窗框的厚度（后面那一圈和四个角）
    for (const s of rect(u0, sp.v0, u1, sp.v1)) L.seg3(B.at(s[0], s[1], fo + fd), B.at(s[2], s[3], fo + fd));
    for (const u of [u0, u1]) for (const v of [sp.v0, sp.v1]) L.seg3(B.at(u, v, fo), B.at(u, v, fo + fd));
    // 玻璃（白色，挡住外面）
    B.prism([wallPt(w, u0, fo + fd / 2), wallPt(w, u1, fo + fd / 2), wallPt(w, u1, fo + fd / 2 + 1), wallPt(w, u0, fo + fd / 2 + 1)], sp.v0, sp.v1, it.id, false, true);
  }

  _door(B, w, sp, it, sel) {
    if (it.doorType === 'opening') return; // 门洞：只有洞，没有门
    const W = sp.u1 - sp.u0, Hh = sp.v1;
    const L = B.lines(sel);
    let face;
    if (it.doorType === 'alu') {
      face = +it.frameOffset;
      for (const s of rect(sp.u0, 0, sp.u1, Hh)) L.seg3(B.at(s[0], s[1], face + +it.frameDepth), B.at(s[2], s[3], face + +it.frameDepth));
      for (const u of [sp.u0, sp.u1]) L.seg3(B.at(u, Hh, face), B.at(u, Hh, face + +it.frameDepth));
      B.prism([wallPt(w, sp.u0, face + 20), wallPt(w, sp.u1, face + 20), wallPt(w, sp.u1, face + 21), wallPt(w, sp.u0, face + 21)], 0, Hh, it.id, false, true);
    } else {
      face = 0;
      const lt = +it.leafThickness || 40;
      B.prism([wallPt(w, sp.u0, 0), wallPt(w, sp.u1, 0), wallPt(w, sp.u1, lt), wallPt(w, sp.u0, lt)], 0, Hh, it.id, false, true);
      if (it.doorType === 'woodBeading') {
        const bw = +it.beadingWidth, bt = +it.beadingThickness;
        B.box(sp.u0 - bw, sp.u0, 0, Hh + bw, -bt, 0, it.id, sel);
        B.box(sp.u1, sp.u1 + bw, 0, Hh + bw, -bt, 0, it.id, sel);
        B.box(sp.u0, sp.u1, Hh, Hh + bw, -bt, 0, it.id, sel);
      }
    }
    for (const s of doorSegments(it, W, Hh)) {
      const a = w.rightIsU ? s[0] : W - s[0], b = w.rightIsU ? s[2] : W - s[2];
      L.seg3(B.at(sp.u0 + a, s[1], face), B.at(sp.u0 + b, s[3], face));
    }
  }

  // 墙的外面朝着镜头时把墙藏起来，这样看得到房间里面
  cull() {
    const c = this.camera.position;
    for (const g of this.wallGroups) {
      const w = g.userData.wall;
      const side = (c.x - w.s.x) * w.n.x + (c.z - w.s.y) * w.n.y;
      g.visible = side > -w.t * 0.5;
    }
  }

  render() {
    this.cull();
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay();
  }

  // 尺寸线和红字说明（正面看某一面墙之后才有）
  drawOverlay() {
    if (!this.overlay) return;
    if (this.activeWall == null || !this.project || !this.geom?.walls[this.activeWall]) { this.overlay.innerHTML = ''; return; }
    this.overlay.innerHTML = overlaySVG({
      project: this.project, geom: this.geom, wi: this.activeWall, camera: this.camera,
      W: this.container.clientWidth, H: this.container.clientHeight,
      mode: this.project.view?.openAll ? 'open' : 'closed', interactive: true, selectedId: this.selectedId,
    });
  }

  _bindOverlay() {
    const ov = this.overlay;
    let drag = null;
    const scale = () => {
      const g = this.geom, w = g.walls[this.activeWall];
      const W = this.container.clientWidth, H = this.container.clientHeight;
      const z = 300;
      const sx = pxPerMm(g, this.activeWall, this.camera, W, H, w.L / 2, g.H / 2, z, 'h');
      const sy = pxPerMm(g, this.activeWall, this.camera, W, H, w.L / 2, g.H / 2, z, 'v');
      return { x: Math.hypot(sx.x, sx.y) || 1, y: Math.hypot(sy.x, sy.y) || 1 };
    };
    ov.addEventListener('pointerdown', (e) => {
      const chain = e.target.closest('[data-chain]');
      const note = e.target.closest('[data-note]');
      if (!chain && !note) return;
      e.stopPropagation();
      drag = { x: e.clientX, y: e.clientY, moved: false, chain: chain?.getAttribute('data-chain'), dir: chain?.getAttribute('data-dir'), note: note?.getAttribute('data-note'), s: scale() };
      ov.setPointerCapture(e.pointerId);
      this.onOverlay?.({ phase: 'start', ...drag });
    });
    ov.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) this.onOverlay?.({ phase: 'move', ...drag, dxMm: dx / drag.s.x, dyMm: -dy / drag.s.y });
    });
    ov.addEventListener('pointerup', () => {
      if (!drag) return;
      this.onOverlay?.({ phase: 'end', ...drag });
      drag = null;
    });
    ov.addEventListener('dblclick', (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) this.onOverlay?.({ phase: 'hideSeg', key: seg.getAttribute('data-seg') });
    });
  }

  // 导出用：在一张大图上画某一面墙（不影响屏幕上的大小）
  snapshot(wi, W, H) {
    const oldW = this.container.clientWidth, oldH = this.container.clientHeight;
    const oldPR = this.renderer.getPixelRatio();
    const pos = this.camera.position.clone(), tgt = this.controls.target.clone(), aspect = this.camera.aspect, preset = this.preset;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.frameWall(wi, 900);
    this.cull();
    this.renderer.render(this.scene, this.camera);
    const png = this.renderer.domElement.toDataURL('image/png');
    const svg = overlaySVG({ project: this.project, geom: this.geom, wi, camera: this.camera, W, H, mode: this.project.view?.openAll ? 'open' : 'closed' });
    // 还原
    this.renderer.setPixelRatio(oldPR);
    this.renderer.setSize(oldW, oldH);
    this.renderer.domElement.style.width = '';
    this.renderer.domElement.style.height = '';
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(pos); this.controls.target.copy(tgt); this.preset = preset;
    this.controls.update();
    this.resize();
    return { png, svg };
  }

  viewOverview() {
    const g = this.geom;
    if (!g) return;
    this.preset = 'overview';
    const b = g.bounds;
    const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, 2000);
    const c = new THREE.Vector3(g.center.x, g.H * 0.4, g.center.y);
    this.controls.target.copy(c);
    this.camera.position.set(c.x + size * 0.15, g.H + size * 1.1, c.z + size * 1.0);
    this.controls.update();
    this.render();
  }

  // 正面看某一面墙（像 2020 导出的那种角度）
  viewWall(index) {
    const g = this.geom;
    if (!g || !g.walls[index]) return;
    this.preset = index;
    this.activeWall = index;
    this.frameWall(index, this.project?.view?.showDims === false ? 400 : 800);
    this.render();
  }

  frameWall(index, margin) {
    const g = this.geom;
    const w = g.walls[index];
    const H = g.H;
    const mid = wallPt(w, w.L / 2, 0);
    const vf = (this.camera.fov * Math.PI) / 180;
    const distH = (w.L / 2 + margin) / (Math.tan(vf / 2) * this.camera.aspect);
    const distV = (H / 2 + margin) / Math.tan(vf / 2);
    const d = Math.max(distH, distV);
    const ty = H * 0.48 - (margin > 500 ? 180 : 0); // 下面要放尺寸线，往下看一点
    this.controls.target.set(mid.x, ty, mid.y);
    this.camera.position.set(mid.x + w.n.x * d, ty + H * 0.04, mid.y + w.n.y * d);
    this.controls.update();
  }
}

function subtractRanges([a, b], cuts) {
  let res = [[a, b]];
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [x, y] of res) {
      if (c1 <= x || c0 >= y) { next.push([x, y]); continue; }
      if (c0 > x) next.push([x, c0]);
      if (c1 < y) next.push([c1, y]);
    }
    res = next;
  }
  return res;
}

// 把线段和面收集起来，一次放进场景
class Builder {
  constructor(group, view, wall) {
    this.group = group; this.view = view; this.w = wall;
    this.normal = []; this.sel = []; this.dashed = []; this.dotted = [];
  }
  at(u, v, wOff) { const p = wallPt(this.w, u, wOff); return [p.x, v, p.y]; }
  ext(u, v) { const p = wallExtPt(this.w, u); return [p.x, v, p.y]; }
  lines(sel) {
    const arr = sel ? this.sel : this.normal;
    return { seg3: (a, b) => arr.push(...a, ...b) };
  }
  // 平面四边形往上拉成一块
  prism(q, v0, v1, id, edges = true, mat = null) {
    const pos = [];
    const b = q.map((p) => [p.x, v0, p.y]);
    const t = q.map((p) => [p.x, v1, p.y]);
    const quad = (A, B2, C, D) => pos.push(...A, ...B2, ...C, ...A, ...C, ...D);
    quad(b[0], b[1], b[2], b[3]); quad(t[0], t[1], t[2], t[3]);
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; quad(b[k], b[k2], t[k2], t[k]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, mat || this.view.matFace);
    m.userData.id = id;
    this.group.add(m);
    if (edges) {
      const L = this.lines(false);
      for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; L.seg3(b[k], b[k2]); L.seg3(t[k], t[k2]); L.seg3(b[k], t[k]); }
    }
    return m;
  }
  // 上下两个四边形（u, w）连起来，例如油烟机的斜面
  frustum(bq, y0, tq, y1, id, sel) {
    const P = (q, y) => q.map(([u, w]) => { const p = wallPt(this.w, u, w); return [p.x, y, p.y]; });
    const b = P(bq, y0), t = P(tq, y1);
    const pos = [];
    const quad = (A, B2, C, D) => pos.push(...A, ...B2, ...C, ...A, ...C, ...D);
    quad(b[0], b[1], b[2], b[3]); quad(t[0], t[1], t[2], t[3]);
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; quad(b[k], b[k2], t[k2], t[k]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, this.view.matFace);
    m.userData.id = id;
    this.group.add(m);
    const L = this.lines(sel);
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; L.seg3(b[k], b[k2]); L.seg3(t[k], t[k2]); L.seg3(b[k], t[k]); }
  }
  // 贴着墙的盒子：u、v、w 三个方向的范围
  box(u0, u1, v0, v1, w0, w1, id, sel) {
    const q = [wallPt(this.w, u0, w0), wallPt(this.w, u1, w0), wallPt(this.w, u1, w1), wallPt(this.w, u0, w1)];
    this.prism(q, v0, v1, id, false);
    const L = this.lines(sel);
    const b = q.map((p) => [p.x, v0, p.y]);
    const t = q.map((p) => [p.x, v1, p.y]);
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; L.seg3(b[k], b[k2]); L.seg3(t[k], t[k2]); L.seg3(b[k], t[k]); }
  }
  flush() {
    for (const [arr, mat] of [[this.normal, this.view.matLine], [this.sel, this.view.matSel]]) {
      if (!arr.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      this.group.add(new THREE.LineSegments(g, mat));
    }
    if (this.dashed.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.dashed, 3));
      const ls = new THREE.LineSegments(g, this.view.matDash);
      ls.computeLineDistances();
      this.group.add(ls);
    }
    if (this.dotted.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(this.dotted, 3));
      const ls = new THREE.LineSegments(g, this.view.matDot);
      ls.computeLineDistances();
      this.group.add(ls);
    }
  }
}
