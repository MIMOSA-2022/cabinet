// 叠在 3D 图上面的一层：蓝色尺寸线、红色文字说明。
// 屏幕和 PDF 用同一个函数画，所以导出来的和看到的一样。

import * as THREE from 'three';
import { wallPt, fmt } from './geometry.js';
import { wallDims } from './dims.js';

const BLUE = '#1f4fd8';
const RED = '#e00000';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 估计文字宽度（中文一个字比较宽）
export function textWidth(s, fs) {
  let w = 0;
  for (const ch of String(s)) w += /[⺀-￿]/.test(ch) ? fs : fs * 0.58;
  return w;
}

export function noteVisible(note, mode) {
  return !note.showIn || note.showIn === 'both' || note.showIn === mode;
}

export function overlaySVG({ project, geom, wi, camera, W, H, mode = 'closed', interactive = false, selectedId = null }) {
  const w = geom.walls[wi];
  if (!w) return '';
  const fs = Math.max(11, H * 0.0165);
  const P = (u, y, z) => {
    const p = wallPt(w, u, -z);
    const v = new THREE.Vector3(p.x, y, p.y).project(camera);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, behind: v.z > 1 };
  };
  const parts = [];
  const line = (a, b, attrs = '') => parts.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" ${attrs}/>`);

  // ---------- 尺寸线 ----------
  const dims = wallDims(project, geom, wi);
  if (dims && project.view?.showDims !== false) {
    const z = dims.zPlane;
    for (const ch of dims.chains) {
      const vis = ch.segs.filter((s) => !s.hidden);
      if (!vis.length) continue;
      const g = [];
      const used = new Set();
      for (const s of vis) { used.add(s.a); used.add(s.b); }
      const at = (val) => (ch.dir === 'h' ? P(val, ch.line, z) : P(ch.line, val, z));
      const ext = (val) => {
        if (ch.dir === 'h') {
          const toward = ch.line < ch.ref ? -1 : 1;
          return [P(val, ch.ref + toward * 20, z), P(val, ch.line + toward * 40, z)];
        }
        const toward = ch.line < ch.ref ? -1 : 1;
        return [P(ch.ref + toward * 20, val, z), P(ch.line + toward * 40, val, z)];
      };
      const gp = [];
      const L = (a, b, extra = '') => gp.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" ${extra}/>`);
      for (const val of used) { const [a, b] = ext(val); L(a, b, 'stroke-width="0.8"'); }
      for (const s of vis) {
        const a = at(s.a), b = at(s.b);
        L(a, b);
        // 斜杠记号
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const k = fs * 0.35;
        const tx = (ux - uy) * k / Math.SQRT2, ty = (uy + ux) * k / Math.SQRT2;
        for (const p of [a, b]) L({ x: p.x - tx, y: p.y - ty }, { x: p.x + tx, y: p.y + ty }, 'stroke-width="1.6"');
        // 数字
        let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (ang > 90 || ang < -90) ang += 180;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const nrm = ch.dir === 'v' ? { x: -fs * 0.55, y: 0 } : { x: 0, y: -fs * 0.5 };
        const label = s.label || fmt(s.b - s.a);
        const red = s.label ? ` fill="${RED}"` : '';
        gp.push(`<text x="${(mx + nrm.x).toFixed(1)}" y="${(my + nrm.y).toFixed(1)}" transform="rotate(${ang.toFixed(1)} ${(mx + nrm.x).toFixed(1)} ${(my + nrm.y).toFixed(1)})" text-anchor="middle" dominant-baseline="middle" stroke="none"${red}${interactive ? ` data-seg="${s.key}" class="dimlabel"` : ''}>${esc(label)}</text>`);
      }
      g.push(`<g data-chain="${ch.key}" data-dir="${ch.dir}" ${interactive ? 'class="chain"' : ''} stroke="${BLUE}" fill="${BLUE}" stroke-width="1.1" font-size="${fs.toFixed(1)}">${gp.join('')}</g>`);
      parts.push(...g);
    }
  }

  // ---------- 红色文字说明 ----------
  for (const n of project.notes || []) {
    if (n.wall !== w.id || !noteVisible(n, mode)) continue;
    const nfs = fs * 1.25 * (+n.size || 1);
    const A = P(+n.ax, +n.ay, +n.az);
    const T = P(+n.lx, +n.ly, +n.az);
    const lines = String(n.text || '').split('\n');
    const tw = Math.max(...lines.map((s) => textWidth(s, nfs)));
    const sel = selectedId === n.id;
    const color = sel ? '#e8590c' : RED;
    const g = [];
    lines.forEach((s, k) => g.push(`<text x="${T.x.toFixed(1)}" y="${(T.y - (lines.length - 1 - k) * nfs * 1.2 - nfs * 0.25).toFixed(1)}" font-size="${nfs.toFixed(1)}">${esc(s)}</text>`));
    if (n.arrow !== false) {
      g.push(`<line x1="${T.x.toFixed(1)}" y1="${T.y.toFixed(1)}" x2="${(T.x + tw).toFixed(1)}" y2="${T.y.toFixed(1)}" stroke="${color}" stroke-width="1.2"/>`);
      // 线从说明下面那条线比较近的一头拉到箭头
      const sx = Math.abs(A.x - T.x) < Math.abs(A.x - (T.x + tw)) ? T.x : T.x + tw;
      g.push(`<line x1="${sx.toFixed(1)}" y1="${T.y.toFixed(1)}" x2="${A.x.toFixed(1)}" y2="${A.y.toFixed(1)}" stroke="${color}" stroke-width="1.2"/>`);
      const dx = A.x - sx, dy = A.y - T.y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, ah = nfs * 0.6;
      g.push(`<polygon points="${A.x.toFixed(1)},${A.y.toFixed(1)} ${(A.x - ux * ah - uy * ah * 0.35).toFixed(1)},${(A.y - uy * ah + ux * ah * 0.35).toFixed(1)} ${(A.x - ux * ah + uy * ah * 0.35).toFixed(1)},${(A.y - uy * ah - ux * ah * 0.35).toFixed(1)}" fill="${color}"/>`);
    }
    const hit = interactive ? `<rect x="${(T.x - 4).toFixed(1)}" y="${(T.y - lines.length * nfs * 1.2 - 4).toFixed(1)}" width="${(tw + 8).toFixed(1)}" height="${(lines.length * nfs * 1.2 + 10).toFixed(1)}" fill="transparent" stroke="${sel ? color : 'none'}" stroke-dasharray="4 3"/>` : '';
    parts.push(`<g data-note="${n.id}" ${interactive ? 'class="note"' : ''} fill="${color}" font-family="SimSun, 'Songti SC', 'Microsoft YaHei', serif">${hit}${g.join('')}</g>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, 'Microsoft YaHei', sans-serif">${parts.join('')}</svg>`;
}

// 屏幕上 1 mm 大约是几个像素（在某个点、某个方向）
export function pxPerMm(geom, wi, camera, W, H, u, y, z, dir) {
  const w = geom.walls[wi];
  const P = (uu, yy) => { const p = wallPt(w, uu, -z); const v = new THREE.Vector3(p.x, yy, p.y).project(camera); return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H }; };
  const a = P(u, y), b = dir === 'h' ? P(u + 100, y) : P(u, y + 100);
  return { x: (b.x - a.x) / 100, y: (b.y - a.y) / 100 };
}
