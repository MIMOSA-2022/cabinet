// 资料库：改好的东西存起来，下次直接拿出来用（尺寸还是可以再改）。
// 登入之后存在网上：每个人一份，所有同事都看得到，只能改自己的。
// 没登入（或没设定网上服务）时，存在这台电脑的浏览器里。
// 每一笔记着 owner（谁的）和 source（从谁那里复制来的）。
// 拿别人的东西来用 = 复制一份到自己名下，原件不会被动到。

import { uid, findItem, wallLetter, itemLabel } from './model.js';
import { h, numInput, selInput, row, note, wallOptions } from './ui.js';
import { cloud, cloudAddEntry, cloudRenameEntry, cloudDeleteEntry, ownerName, refreshLibrary } from './cloud.js';

const KEY = 'cabinet.library.v1';
const online = () => !!(cloud.enabled && cloud.user);

export const LIB_TYPES = {
  cabinet: '柜子',
  unit: '冰箱 / 油烟机 / 板',
  window: '窗',
  door: '门',
  ceiling: 'Pelmet / Beam / 柱子',
  countertop: '台面',
  frontStyle: '门板款式和拉手',
  accessory: '配件',
  slideSpec: '滑轨规格表',
  project: '整个厨房 / 衣帽间',
};

// 放在墙边、要选墙和位置的东西，以及它们在项目里的哪一栏
const PLACED = {
  cabinet: 'cabinets', unit: 'cabinets', window: 'openings', door: 'openings', ceiling: 'ceilingItems', countertop: 'countertops',
};

// 这台电脑上的资料库（没登入时用；登入后可以上传）
export function loadLocalLib() {
  try {
    const lib = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (lib && Array.isArray(lib.entries)) return lib;
  } catch { /* 读不到就当空的 */ }
  return { version: 1, owner: 'me', entries: [] };
}
export function saveLib(lib) {
  try { localStorage.setItem(KEY, JSON.stringify(lib)); return true; } catch { return false; }
}

// 现在用的资料库：登入了 = 网上（含同事的），没登入 = 这台电脑
export function loadLib() {
  if (!online()) return { ...loadLocalLib(), entries: loadLocalLib().entries.map((e) => ({ ...e, mine: true })) };
  return {
    version: 1, owner: cloud.user.id,
    entries: cloud.library.map((e) => ({ ...e, mine: e.owner === cloud.user.id, ownerName: ownerName(e.owner) })),
  };
}

async function renameEntry(e, name) {
  if (online()) return cloudRenameEntry(e.id, name);
  const L = loadLocalLib(); const x = L.entries.find((y) => y.id === e.id);
  if (x) { x.name = name; x.updatedAt = new Date().toISOString(); saveLib(L); }
}
async function deleteEntry(e) {
  if (online()) return cloudDeleteEntry(e.id);
  const L = loadLocalLib(); L.entries = L.entries.filter((y) => y.id !== e.id); saveLib(L);
}

export function libTypeOf(item) {
  if (!item) return null;
  if (item.kind === 'cabinet') return 'cabinet';
  if (['fridge', 'hood', 'panel'].includes(item.kind)) return 'unit';
  if (item.kind === 'window') return 'window';
  if (item.kind === 'door') return 'door';
  if (['pelmet', 'beam', 'column'].includes(item.kind)) return 'ceiling';
  if (item.kind === 'countertop') return 'countertop';
  return null;
}

// 一笔资料的尺寸（列表里显示，同一款可以存好几个尺寸）
export function sizeText(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'cabinet': case 'unit':
      if (d.kind === 'panel' && d.panelType === 'top') return `${d.width}×${d.depth}×${d.thickness}`;
      return [d.width, d.height, d.depth].filter((x) => x != null).join('×');
    case 'window': return `${d.width}×${d.height}${d.corner ? ` + ${d.corner.width2}` : ''}`;
    case 'door': return `${d.width}×${d.height}`;
    case 'ceiling': return d.kind === 'column' ? `${d.width}×${d.depth}` : `长 ${d.length} · 落 ${d.drop}`;
    case 'countertop': return `长 ${Math.round(d.length)} · 深 ${d.depth}`;
    case 'project': return `${d.room?.walls?.length || 0} 面墙 · ${(d.cabinets || []).length} 样东西`;
    default: return '';
  }
}

function stripPlacement(item) {
  const { id, wall, offset, ...rest } = structuredClone(item);
  return rest;
}

export async function addEntry(type, name, data, source = null) {
  if (online()) return cloudAddEntry({ type, name: name || LIB_TYPES[type], data, source });
  const lib = loadLocalLib();
  const now = new Date().toISOString();
  const e = { id: uid('lib'), type, name: name || LIB_TYPES[type], owner: lib.owner || 'me', source, createdAt: now, updatedAt: now, data };
  lib.entries.push(e);
  saveLib(lib);
  return e;
}

// ---------- 存入资料库（弹出栏取名字） ----------
export function saveDialog(app, type, data, suggestedName) {
  const dlg = document.getElementById('dlg');
  const name = h('input', { type: 'text', value: suggestedName || '', style: 'width:100%' });
  const preview = { type, data };
  dlg.innerHTML = '';
  dlg.append(h('h3', {}, `存入资料库：${LIB_TYPES[type]}`),
    h('div', { class: 'form' },
      row('名字', name, null),
      sizeText(preview) ? note(`尺寸：${sizeText(preview)}（列表里会显示，同一款可以存好几个尺寸）`) : null,
      note('存进去之后，在左边"资料库"分页可以拿出来用，拿出来尺寸还是可以再改。')),
    h('div', { class: 'btns' },
      h('button', { onclick: () => dlg.close() }, '取消'),
      h('button', {
        class: 'primary', onclick: async () => {
          try {
            await addEntry(type, name.value.trim() || suggestedName || LIB_TYPES[type], data);
            app.toast?.('已存入资料库');
          } catch (err) { alert('存不进资料库：' + err.message); }
          dlg.close();
          app.refreshPanels();
        },
      }, '存进去')));
  dlg.showModal();
  name.select();
}

export function saveItem(app, item) {
  const type = libTypeOf(item);
  if (!type) return;
  saveDialog(app, type, stripPlacement(item), defaultName(app, item));
}

function defaultName(app, item) {
  const label = itemLabel(app.project, item).split(' · ');
  return label.filter((s) => !/^墙 /.test(s)).slice(0, 2).join(' ');
}

// ---------- 拿出来用 ----------
export function useEntry(app, e) {
  const p = app.project;
  if (PLACED[e.type]) return placeDialog(app, e);
  if (e.type === 'slideSpec') {
    const s = { ...structuredClone(e.data), id: uid('slide') };
    app.commit((q) => q.slideSpecs.push(s));
    app.toast?.('已加进滑轨规格表（左边"柜子"最下面）');
    return;
  }
  const sel = app.selectedId && findItem(p, app.selectedId);
  if (e.type === 'frontStyle') {
    if (!sel || sel.kind !== 'cabinet') { alert('先选一个柜子，再按"用这个"，整个柜子的门板和抽屉面板都会换成这个款式。'); return; }
    app.commit((q) => applyFrontStyle(findItem(q, sel.id), e.data));
    return;
  }
  if (e.type === 'accessory') {
    if (!sel || sel.kind !== 'cabinet') { alert('先选一个柜子，再按"用这个"，配件会加进那个柜子。'); return; }
    app.commit((q) => { const c = findItem(q, sel.id); (c.accessories ||= []).push(structuredClone(e.data)); });
    return;
  }
  if (e.type === 'project') {
    if (!confirm(`打开"${e.name}"？现在的项目会被换掉（要留着的话，先到"文件"导出）。`)) return;
    app.loadProjectData(structuredClone(e.data));
  }
}

// 款式：门板厚度、边框、凹凸、拉手（不改宽高、门/抽屉、开向）
const STYLE_KEYS = ['style', 'thickness', 'frameWidth', 'panelDepth', 'panelMode', 'handle'];
export function frontStyleOf(cell) {
  return Object.fromEntries(STYLE_KEYS.map((k) => [k, structuredClone(cell[k])]));
}
export function applyFrontStyle(cab, style) {
  for (const r of cab.face?.rows || []) {
    for (const c of r.cells) {
      if (c.type === 'oven' || c.type === 'microwave') continue;
      // 抽屉和门的拉手方向不一样：保留每一块原来的方向
      const keepOrient = c.handle?.orient || 'auto';
      Object.assign(c, structuredClone(style));
      if (c.handle) c.handle.orient = keepOrient;
    }
  }
}

function placeDialog(app, e) {
  const p = app.project;
  if (!p.room.walls.length) { alert('请先画墙。'); return; }
  const selWall = (app.selectedId && findItem(p, app.selectedId)?.wall) || p.room.walls.find((w) => w.id === app.selectedId)?.id;
  const v = { wall: selWall || p.room.walls[0].id, offset: 0 };
  const list = PLACED[e.type];
  const end = (wallId) => {
    if (list !== 'cabinets') return 0;
    const upper = (e.data.kind === 'cabinet' && e.data.type === 'upper') || e.data.kind === 'hood';
    let m = 0;
    for (const c of p.cabinets) if (c.wall === wallId && (((c.kind === 'cabinet' && c.type === 'upper') || c.kind === 'hood') === upper)) m = Math.max(m, +c.offset + +c.width);
    return m;
  };
  v.offset = end(v.wall);
  const dlg = document.getElementById('dlg');
  const body = h('div', { class: 'form' });
  const draw = () => {
    body.innerHTML = '';
    body.append(row('在哪面墙', selInput(v.wall, wallOptions(p), (x) => { v.wall = x; v.offset = end(x); draw(); }), null));
    if (!(e.type === 'window' && e.data.corner)) body.append(row('离起点墙角', numInput(v.offset, (x) => { v.offset = x; }), 'mm'));
    body.append(note(`尺寸：${sizeText(e)}。放进去之后尺寸还是可以改。`));
  };
  draw();
  dlg.innerHTML = '';
  dlg.append(h('h3', {}, `用"${e.name}"`), body,
    h('div', { class: 'btns' },
      h('button', { onclick: () => dlg.close() }, '取消'),
      h('button', {
        class: 'primary', onclick: () => {
          const item = { ...structuredClone(e.data), id: uid(e.data.kind || 'item'), wall: v.wall, offset: Number(v.offset) || 0 };
          app.commit((q) => { (q[list] ||= []).push(item); });
          app.select(item.id);
          dlg.close();
        },
      }, '放进去')));
  dlg.showModal();
}

// ---------- 资料库分页 ----------
export function libraryTab(body, app) {
  const lib = loadLib();
  body.append(note(online()
    ? '资料库存在网上：你的和同事的都看得到。同事的东西拿来用，或"复制到我的"，都是复制一份，不会动到原件。'
    : '资料库存在这台电脑的浏览器里。在右边选一样东西，按"存入资料库"就会出现在这里。'));
  if (online()) {
    const who = app.ui.libWho || 'all';
    body.append(h('div', { class: 'seg', style: 'margin:6px 0' },
      ...[['all', '全部'], ['mine', '我的'], ['others', '同事的']].map(([k, label]) =>
        h('button', { class: who === k ? 'on' : '', onclick: () => { app.ui.libWho = k; app.refreshPanels(); } }, label)),
      h('button', { title: '重新读取同事的新东西', onclick: async () => { await refreshLibrary(); app.refreshPanels(); } }, '↻')));
  }
  const q = h('input', { type: 'text', placeholder: '搜名字…', value: app.ui.libQuery || '', style: 'width:100%' });
  q.addEventListener('input', () => { app.ui.libQuery = q.value; renderList(); });
  body.append(q);
  const listBox = h('div');
  body.append(listBox);

  const renderList = () => {
    listBox.innerHTML = '';
    const kw = (app.ui.libQuery || '').trim().toLowerCase();
    const who = online() ? (app.ui.libWho || 'all') : 'all';
    const entries = lib.entries.filter((e) => (!kw || e.name.toLowerCase().includes(kw) || sizeText(e).includes(kw) || (e.ownerName || '').toLowerCase().includes(kw))
      && (who === 'all' || (who === 'mine' ? e.mine : !e.mine)));
    if (!entries.length) { listBox.append(h('div', { class: 'empty' }, lib.entries.length ? '找不到' : '还没有存东西')); return; }
    for (const [t, label] of Object.entries(LIB_TYPES)) {
      const group = entries.filter((e) => e.type === t).sort((a, b) => a.name.localeCompare(b.name, 'zh') || sizeText(a).localeCompare(sizeText(b)));
      if (!group.length) continue;
      listBox.append(h('h4', {}, `${label}（${group.length}）`));
      for (const e of group) {
        const tag = online() ? h('span', { class: 'mini owner' + (e.mine ? ' me' : '') }, e.mine ? ' · 我的' : ` · ${e.ownerName}的`) : null;
        const ownBtns = e.mine ? [
          h('button', {
            onclick: async () => {
              const n = prompt('新的名字', e.name);
              if (n == null || !n.trim()) return;
              try { await renameEntry(e, n.trim()); } catch (err) { alert('改不了：' + err.message); }
              app.refreshPanels();
            },
          }, '改名'),
          h('button', {
            class: 'x', title: '从资料库删除', onclick: async () => {
              if (!confirm(`从资料库删除"${e.name}"？已经放进项目里的不会被删。`)) return;
              try { await deleteEntry(e); } catch (err) { alert('删不了：' + err.message); }
              app.refreshPanels();
            },
          }, '×'),
        ] : [
          h('button', {
            title: '复制一份到我的资料库，之后可以自己改', onclick: async () => {
              try { await addEntry(e.type, e.name, structuredClone(e.data), { owner: e.owner, id: e.id }); app.toast?.('已复制到我的资料库'); } catch (err) { alert('复制不了：' + err.message); }
              app.refreshPanels();
            },
          }, '复制到我的'),
        ];
        listBox.append(h('div', { class: 'libitem' },
          h('div', { class: 'libname' }, h('b', {}, e.name), sizeText(e) ? h('span', { class: 'mini' }, ' ' + sizeText(e)) : null, tag),
          h('div', { class: 'btnrow small' },
            h('button', { class: 'primary', onclick: () => useEntry(app, e) }, '用这个'),
            ...ownBtns)));
      }
    }
  };
  renderList();

  body.append(h('h4', {}, '整个项目'));
  body.append(h('div', { class: 'btnrow' },
    h('button', { onclick: () => saveDialog(app, 'project', projectSnapshot(app.project), app.project.name) }, '把现在整个项目存入资料库')));
  body.append(note('给老客户改版用：存起来，下次"用这个"就打开整张图。'));

  body.append(h('h4', {}, '资料库文件'));
  body.append(h('div', { class: 'btnrow' },
    h('button', { onclick: () => exportLib() }, '导出资料库'),
    h('button', { onclick: () => importLib(app) }, '导入资料库')));
  body.append(note('导出 = 存一份备份文件（只有我的）。导入时会加进我的资料库（复制一份），不会删掉原来的。'));

  // 登入之后，这台电脑以前存的资料库可以搬上网
  const local = loadLocalLib().entries;
  if (online() && local.length) {
    body.append(h('div', { class: 'btnrow' }, h('button', {
      onclick: async () => {
        if (!confirm(`把这台电脑以前存的 ${local.length} 笔资料上传到你的网上资料库？`)) return;
        let n = 0;
        for (const e of local) { try { await addEntry(e.type, e.name, e.data, e.source); n++; } catch { /* 跳过 */ } }
        if (n === local.length) saveLib({ version: 1, owner: 'me', entries: [] });
        alert(`上传了 ${n} 笔。`);
        app.refreshPanels();
      },
    }, `把这台电脑以前的资料库上传（${local.length} 笔）`)));
  }
}

function projectSnapshot(p) {
  const { view, ...rest } = structuredClone(p);
  return { ...rest, view: { ...view, openAll: false } };
}

function exportLib() {
  const lib = loadLib();
  const mine = { version: 1, owner: lib.owner, entries: lib.entries.filter((e) => e.mine).map(({ mine, ownerName: _o, ...e }) => e) };
  const blob = new Blob([JSON.stringify(mine, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: '资料库.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importLib(app) {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.entries)) throw new Error('bad');
      let n = 0;
      for (const e of data.entries) {
        if (!LIB_TYPES[e.type] || !e.data) continue;
        // 复制一份到自己名下，记住是从谁那里来的
        await addEntry(e.type, e.name, structuredClone(e.data), { owner: e.owner || data.owner || '?', id: e.id });
        n++;
      }
      alert(`加进了 ${n} 笔。`);
      app.refreshPanels();
    } catch { alert('这个文件打不开，不是资料库文件。'); }
  });
  inp.click();
}

export { wallLetter };
