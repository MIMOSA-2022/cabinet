// "图纸"分页：开门、尺寸线开关和位置、红字说明、导出 PDF。

import { findItem, wallLetter, uid } from './model.js';
import { fmt } from './geometry.js';
import { wallDims, CHAIN_NAMES } from './dims.js';
import { h, numInput, selInput, row, note, warn } from './ui.js';

export function outputTab(body, app, project) {
  const v = project.view || {};
  const setView = (k, val) => app.commit((p) => { p.view = { ...(p.view || {}), [k]: val }; });

  // ---------- 开门 ----------
  body.append(h('h4', {}, '开门'));
  body.append(h('div', { class: 'btnrow' },
    h('button', { class: v.openAll ? 'primary' : '', onclick: () => setView('openAll', !v.openAll) }, v.openAll ? '全部关上' : '全部打开')));
  body.append(row('开门角度', numInput(v.openAngle ?? 45, (val) => setView('openAngle', val), { fkey: 'v.angle' }), '°'));
  body.append(note('每扇门也可以单独开关：在柜子的柜面里按"更多…"。假门和抽屉不会开。这只影响图，不影响柜子本身。'));

  // ---------- 尺寸线 ----------
  body.append(h('h4', {}, '尺寸线'));
  const cb = h('input', { type: 'checkbox', checked: v.showDims !== false });
  cb.addEventListener('change', () => setView('showDims', cb.checked));
  body.append(h('label', { class: 'row' }, cb, h('span', {}, '在 3D 图上显示尺寸线')));
  const wi = app.activeWall();
  if (wi == null) {
    body.append(note('先按 3D 上面的"墙 A""墙 B"按钮，正面看一面墙，尺寸线和红字说明就会出现。'));
  } else {
    const dims = wallDims(project, app.geom, wi);
    const w = app.geom.walls[wi];
    body.append(note(`现在是墙 ${w.letter}。在图上拖尺寸线可以移动；双击数字可以关掉那一条。`));
    const set = project.dimSettings?.[w.id] || {};
    const upd = (fn) => app.commit((p) => { p.dimSettings ||= {}; p.dimSettings[w.id] ||= { hidden: {}, offsets: {} }; fn(p.dimSettings[w.id]); });
    for (const ch of dims?.chains || []) {
      const box = h('div', { class: 'cells' });
      const all = h('input', { type: 'checkbox', checked: !set.hidden?.[ch.key] });
      all.addEventListener('change', () => upd((s) => { s.hidden ||= {}; if (all.checked) delete s.hidden[ch.key]; else s.hidden[ch.key] = true; }));
      const offNow = Math.round(Math.abs(ch.line - ch.ref));
      box.append(h('div', { class: 'cellhead' }, all, h('b', {}, CHAIN_NAMES[ch.key] || ch.key),
        h('span', { class: 'mini' }, '离开'),
        numInput(set.offsets?.[ch.key] ?? offNow, (val) => upd((s) => { s.offsets ||= {}; s.offsets[ch.key] = val; }), { fkey: `dim.${ch.key}.off` }),
        h('span', { class: 'mini' }, 'mm')));
      const segRow = h('div', { class: 'cell segs' });
      for (const sg of ch.segs) {
        const c2 = h('input', { type: 'checkbox', checked: !set.hidden?.[sg.key] });
        c2.addEventListener('change', () => upd((s) => { s.hidden ||= {}; if (c2.checked) delete s.hidden[sg.key]; else s.hidden[sg.key] = true; }));
        segRow.append(h('label', { class: 'seg' }, c2, sg.label || fmt(sg.b - sg.a)));
      }
      box.append(segRow);
      body.append(box);
    }
    body.append(h('div', { class: 'btnrow small' },
      h('button', { onclick: () => upd((s) => { s.hidden = {}; }) }, '全部显示'),
      h('button', { onclick: () => upd((s) => { s.offsets = {}; }) }, '位置还原')));
  }

  // ---------- 红字说明 ----------
  body.append(h('h4', {}, '红字说明'));
  body.append(h('div', { class: 'btnrow' },
    h('button', { class: app.ui.picking ? 'primary' : '', onclick: () => app.startNote() }, app.ui.picking ? '在 3D 图上点一下要指的位置…' : '+ 加红字说明')));
  body.append(note('按了之后，在 3D 图上点要指的地方，再输入文字。文字可以拖动。'));
  const notes = (project.notes || []).filter((n) => wi == null || n.wall === app.geom.walls[wi]?.id);
  const list = h('div', { class: 'list' });
  if (!notes.length) list.append(h('div', { class: 'empty' }, '还没有'));
  for (const n of notes) list.append(h('button', { class: 'item' + (app.selectedId === n.id ? ' sel' : ''), onclick: () => app.select(n.id) }, (n.text || '').split('\n')[0] || '(空)'));
  body.append(list);

  // ---------- 导出 ----------
  body.append(h('h4', {}, '导出 PDF（A3）'));
  const oc = h('input', { type: 'checkbox', checked: v.pdfOpen !== false });
  oc.addEventListener('change', () => setView('pdfOpen', oc.checked));
  body.append(h('label', { class: 'row' }, oc, h('span', {}, '每面墙多一页"门全部打开"')));
  body.append(h('div', { class: 'btnrow' }, h('button', { class: 'primary', onclick: () => app.exportPDF() }, '导出 PDF')));
  body.append(note('第 1 页平面图，之后每面有柜子的墙一页（门关着），再一页门打开。'));
}

// 新的说明
export function openNoteDialog(app, base) {
  const dlg = document.getElementById('dlg');
  const ta = h('textarea', { rows: 3, style: 'width:100%;font:inherit' });
  const arrow = h('input', { type: 'checkbox', checked: true });
  let showIn = app.project.view?.openAll ? 'open' : 'both';
  dlg.innerHTML = '';
  dlg.append(h('h3', {}, '红字说明'), h('div', { class: 'form' },
    ta,
    h('label', { class: 'row' }, arrow, h('span', {}, '带箭头')),
    row('显示在', selInput(showIn, { both: '门关和门开的图都有', closed: '只在门关的图', open: '只在门开的图' }, (val) => { showIn = val; }), null),
    note('例：粗面背板要顶 SHELF、左右橱两边要 LED STRIP 前面进去 75mm。可以分几行。')),
  h('div', { class: 'btns' },
    h('button', { onclick: () => dlg.close() }, '取消'),
    h('button', {
      class: 'primary', onclick: () => {
        if (!ta.value.trim()) { ta.focus(); return; }
        const n = { id: uid('note'), kind: 'note', ...base, text: ta.value, arrow: arrow.checked, showIn, size: 1 };
        app.commit((p) => { (p.notes ||= []).push(n); });
        app.select(n.id);
        dlg.close();
      },
    }, '加进去')));
  dlg.showModal();
  ta.focus();
}

export function noteProps(el, app, n) {
  const upd = (fn) => app.commit((p) => fn(findItem(p, n.id)));
  el.append(h('h3', {}, '红字说明'));
  const ta = h('textarea', { rows: 3, style: 'width:100%;font:inherit', dataset: { fkey: 'n.text' } });
  ta.value = n.text || '';
  ta.addEventListener('change', () => upd((x) => { x.text = ta.value; }));
  const arrow = h('input', { type: 'checkbox', checked: n.arrow !== false });
  arrow.addEventListener('change', () => upd((x) => { x.arrow = arrow.checked; }));
  el.append(h('div', { class: 'form' }, ta,
    h('label', { class: 'row' }, arrow, h('span', {}, '带箭头')),
    row('显示在', selInput(n.showIn || 'both', { both: '门关和门开的图都有', closed: '只在门关的图', open: '只在门开的图' }, (val) => upd((x) => { x.showIn = val; }), 'n.show'), null),
    row('字的大小（倍）', numInput(n.size ?? 1, (val) => upd((x) => { x.size = val; }), { fkey: 'n.size' }), null),
    note('在图上拖文字可以移动；箭头指的位置不变。')));
  el.append(h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => app.deleteSelected() }, '删除')));
}

export { wallLetter, warn };
