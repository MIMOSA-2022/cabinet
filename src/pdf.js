// 导出 A3 PDF：平面图 + 每面墙 3D 图（门关着）+ 门打开。
// 每一页先画成一张大图（中文字用电脑本身的字体），再放进 PDF。

const PAGE_W = 2970, PAGE_H = 2100; // A3 横放，约 180 dpi
const RED = '#e00000';

let jspdfLoading = null;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  jspdfLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.onload = () => resolve(window.jspdf);
    s.onerror = () => reject(new Error('jsPDF 载入失败，请检查网络'));
    document.head.appendChild(s);
  });
  return jspdfLoading;
}

function svgToImage(svgString) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  });
}
function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
}

function newPage() {
  const c = document.createElement('canvas');
  c.width = PAGE_W; c.height = PAGE_H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, PAGE_W, PAGE_H);
  return { c, g };
}

// 页脚：项目名、日期、页码
function footer(g, project, pageNo, total) {
  g.fillStyle = '#333';
  g.font = '28px "Microsoft YaHei", Arial, sans-serif';
  g.textAlign = 'left';
  g.fillText(project.name || '', 80, PAGE_H - 60);
  g.textAlign = 'right';
  const d = new Date();
  g.fillText(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}    ${pageNo} / ${total}`, PAGE_W - 80, PAGE_H - 60);
}

// 墙的标题：红色 (A)，下面一条线，和使用者原来的图一样
function wallTitle(g, letter, caption) {
  g.fillStyle = RED; g.strokeStyle = RED;
  g.font = '120px SimSun, "Songti SC", serif';
  g.textAlign = 'center';
  const y = PAGE_H - 150;
  g.fillText(`(${letter})`, PAGE_W / 2, y);
  const tw = g.measureText(`(${letter})`).width;
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(PAGE_W / 2 - tw / 2 - 10, y + 22); g.lineTo(PAGE_W / 2 + tw / 2 + 10, y + 22); g.stroke();
  if (caption) {
    g.font = '36px "Microsoft YaHei", sans-serif';
    g.fillStyle = '#666';
    g.fillText(caption, PAGE_W / 2, y + 80);
  }
}

export async function exportPDF({ app, view3d, plan, onProgress }) {
  const { jsPDF } = await loadJsPDF();
  const project = app.project;
  const geom = app.geom;
  const pages = [];

  // ---------- 第 1 页：平面图 ----------
  onProgress?.('平面图…');
  {
    const { c, g } = newPage();
    plan.fit();
    const svg = document.getElementById('plan');
    const css = [...document.styleSheets[0].cssRules].map((x) => x.cssText).filter((t) => t.includes('#plan')).join('\n')
      .replace(/var\(--blue\)/g, '#1f4fd8').replace(/var\(--accent\)/g, '#111');
    const clone = svg.cloneNode(true);
    clone.querySelectorAll('.sel').forEach((e) => e.classList.remove('sel'));
    const areaW = PAGE_W - 160, areaH = PAGE_H - 260;
    clone.setAttribute('width', areaW); clone.setAttribute('height', areaH);
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = css;
    clone.insertBefore(st, clone.firstChild);
    const img = await svgToImage(new XMLSerializer().serializeToString(clone));
    g.drawImage(img, 80, 60, areaW, areaH);
    g.fillStyle = '#111'; g.font = '48px "Microsoft YaHei", sans-serif'; g.textAlign = 'left';
    g.fillText('平面图 PLAN', 80, PAGE_H - 140);
    pages.push(c);
  }

  // ---------- 每面墙 ----------
  const hasUnits = (w) => project.cabinets.some((c) => c.wall === w.id);
  let walls = geom.walls.filter(hasUnits);
  if (!walls.length) walls = geom.walls;
  const hasDoors = (w) => project.cabinets.some((c) => c.wall === w.id && c.kind === 'cabinet' && (c.face?.rows || []).some((r) => r.cells.some((x) => x.type === 'door' || x.type === 'glass')));
  const savedOpen = !!project.view?.openAll;
  const imgW = PAGE_W - 160, imgH = PAGE_H - 330;
  try {
    for (const w of walls) {
      const modes = [false];
      if (project.view?.pdfOpen !== false && hasDoors(w)) modes.push(true);
      for (const open of modes) {
        onProgress?.(`墙 ${w.letter}${open ? '（门开）' : ''}…`);
        project.view = { ...(project.view || {}), openAll: open };
        app.renderAll();
        const shot = view3d.snapshot(w.index, imgW, imgH);
        const { c, g } = newPage();
        g.drawImage(await loadImage(shot.png), 80, 40, imgW, imgH);
        g.drawImage(await svgToImage(shot.svg), 80, 40, imgW, imgH);
        wallTitle(g, w.letter, open ? '门打开' : '');
        pages.push(c);
        await new Promise((r) => setTimeout(r, 30));
      }
    }
  } finally {
    project.view = { ...(project.view || {}), openAll: savedOpen };
    app.renderAll();
  }

  onProgress?.('做成 PDF…');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
  pages.forEach((c, k) => {
    if (k) doc.addPage('a3', 'landscape');
    footer(c.getContext('2d'), project, k + 1, pages.length);
    doc.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, 420, 297, undefined, 'FAST');
  });
  doc.save(`${project.name || '图纸'}.pdf`);
  return pages.length;
}
