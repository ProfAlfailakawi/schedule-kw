/**
 * مخطط التدفق: يُوزَّع آلياً على طبقات (أطول مسار) ويُرسم SVG بلا مكتبات.
 * الاتجاه: lr أفقي (للشاشة)، tb رأسي (لصفحة A4)، snake صفوفٌ متعرجة (سلاسل طويلة)، col عمود واحد (للهاتف).
 * بعد التوزيع: كلُّ سهمٍ يمرّ على عقدةٍ يُنحنى حولها، وكلُّ تسميةٍ تُوضَع حيث لا تغطّي عقدةً ولا تسميةً أخرى.
 * في العربية تنعكس القراءة يميناً إلى اليسار.
 */
import { iconInner } from "./icons.mjs";

const W = 184, H = 78, GX = 64, GY = 54, PAD = 34, PIN = 16;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text, max) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 4) { lines.length = 4; lines[3] = lines[3].replace(/.{0,2}$/, "…"); }
  return lines;
}

function layers(nodes, edges) {
  const ids = nodes.map(n => n.id), out = new Map(ids.map(i => [i, []])), indeg = new Map(ids.map(i => [i, 0]));
  for (const e of edges) { out.get(e.from).push(e.to); indeg.set(e.to, indeg.get(e.to) + 1); }
  const back = new Set(), state = new Map();
  const dfs = u => {
    state.set(u, 1);
    for (const v of out.get(u)) {
      if (state.get(v) === 1) back.add(`${u}>${v}`);
      else if (!state.get(v)) dfs(v);
    }
    state.set(u, 2);
  };
  const roots = ids.filter(i => indeg.get(i) === 0);
  for (const r of roots.length ? roots : [ids[0]]) if (!state.get(r)) dfs(r);
  for (const i of ids) if (!state.get(i)) dfs(i);
  const layer = new Map(ids.map(i => [i, 0]));
  const fwd = edges.filter(e => !back.has(`${e.from}>${e.to}`) && e.from !== e.to);
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of fwd) if (layer.get(e.to) < layer.get(e.from) + 1) { layer.set(e.to, layer.get(e.from) + 1); changed = true; }
    if (!changed) break;
  }
  return { layer, back };
}

export const lastMetrics = { crossings: 0, badLabels: 0 };
const bez = (e, t) => {
  const u = 1 - t;
  return {
    x: u * u * u * e.p1.x + 3 * u * u * t * e.c1.x + 3 * u * t * t * e.c2.x + t * t * t * e.p2.x,
    y: u * u * u * e.p1.y + 3 * u * u * t * e.c1.y + 3 * u * t * t * e.c2.y + t * t * t * e.p2.y,
  };
};
const inside = (p, r, m = 0) => p.x > r.x0 - m && p.x < r.x1 + m && p.y > r.y0 - m && p.y < r.y1 + m;
const overlap = (a, b, m = 3) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;

export function flowSvg(diagram, lang, orient = "lr") {
  const rtl = lang === "ar";
  const { nodes, edges } = diagram;
  const { layer, back } = layers(nodes, edges);
  const L = Math.max(...layer.values()) + 1;
  const cols = Array.from({ length: L }, () => []);
  for (const n of nodes) cols[layer.get(n.id)].push(n.id);
  const pos = new Map(nodes.map(n => [n.id, 0]));
  cols.forEach(c => c.forEach((id, i) => pos.set(id, i)));
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let k = 1; k < L; k++) {
      const bary = id => {
        const ps = edges.filter(e => e.to === id && layer.get(e.from) === k - 1).map(e => pos.get(e.from));
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : pos.get(id);
      };
      cols[k].sort((a, b) => bary(a) - bary(b)).forEach((id, i) => pos.set(id, i));
    }
  }
  const maxN = Math.max(...cols.map(c => c.length));
  if (orient === "tb" && maxN <= 2 && L >= 4) orient = "snake";
  const lr = orient === "lr", snake = orient === "snake", col = orient === "col";
  const order = nodes.map(n => n.id).sort((a, b) => layer.get(a) - layer.get(b) || pos.get(a) - pos.get(b));
  const center = new Map();
  const lw = e => (e.label ? Math.max(30, e.label[lang].length * 6.6 + 14) : 0);
  const gapFor = pred => Math.min(230, Math.max(GX, ...edges.filter(pred).map(e => lw(e) + 44)));
  if (col) {
    order.forEach((id, i) => center.set(id, { x: PAD + W / 2, y: PAD + PIN + i * (H + GY) + H / 2 }));
  } else if (snake) {
    const per = 3, gx = gapFor(() => true);
    order.forEach((id, i) => {
      const row = Math.floor(i / per), raw = i % per, c = row % 2 ? per - 1 - raw : raw;
      center.set(id, { x: PAD + (rtl ? per - 1 - c : c) * (W + gx) + W / 2, y: PAD + PIN + row * (H + GY + 8) + H / 2 });
    });
  } else if (lr) {
    const gaps = Array.from({ length: Math.max(L - 1, 0) }, (_, k) => gapFor(e => Math.abs(layer.get(e.from) - layer.get(e.to)) === 1 && Math.min(layer.get(e.from), layer.get(e.to)) === k));
    const xs = []; let acc = PAD + W / 2;
    for (let k = 0; k < L; k++) { xs.push(acc); acc += W + (gaps[k] ?? 0); }
    cols.forEach((cc, k) => cc.forEach((id, i) => {
      const off = (maxN - cc.length) / 2;
      center.set(id, { x: rtl ? PAD + xs[L - 1] + W / 2 + PAD - xs[k] : xs[k], y: PAD + PIN + (i + off) * (H + GY) + H / 2 });
    }));
  } else {
    cols.forEach((cc, k) => cc.forEach((id, i) => {
      const off = (maxN - cc.length) / 2, ii = rtl ? maxN - 1 - (i + off) : i + off;
      center.set(id, { x: PAD + ii * (W + 70) + W / 2, y: PAD + PIN + k * (H + GY + 34) + H / 2 });
    }));
  }
  const rect = id => { const c = center.get(id); return { id, x0: c.x - W / 2, x1: c.x + W / 2, y0: c.y - H / 2 - PIN, y1: c.y + H / 2 }; };
  const rects = nodes.map(n => rect(n.id));
  const boundary = (c, toward) => {
    const dx = toward.x - c.x, dy = toward.y - c.y;
    if (!dx && !dy) return { x: c.x, y: c.y };
    const sx = Math.abs(dx) > 0 ? (W / 2) / Math.abs(dx) : Infinity, sy = Math.abs(dy) > 0 ? (H / 2) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: c.x + dx * s, y: c.y + dy * s };
  };

  /* ── المسارات الأولية ─────────────────────────────────────── */
  const routes = edges.map(e => {
    const a = center.get(e.from), b = center.get(e.to);
    const isBack = back.has(`${e.from}>${e.to}`) || e.from === e.to;
    let p1, p2, c1, c2;
    if (e.from === e.to) {
      p1 = { x: a.x + W / 2, y: a.y - 14 }; p2 = { x: a.x + W / 2, y: a.y + 14 };
      c1 = { x: p1.x + 56, y: p1.y - 26 }; c2 = { x: p2.x + 56, y: p2.y + 26 };
    } else if (col && Math.abs(order.indexOf(e.to) - order.indexOf(e.from)) !== 1) {
      const sd = rtl ? -1 : 1, span = Math.abs(order.indexOf(e.to) - order.indexOf(e.from)), x0 = a.x + sd * W / 2, bulge = Math.max(46 + 22 * span, (lw(e) / 2 + 30) / 0.75);
      p1 = { x: x0, y: a.y }; p2 = { x: x0, y: b.y };
      c1 = { x: x0 + sd * bulge, y: a.y }; c2 = { x: x0 + sd * bulge, y: b.y };
    } else if (col && order.indexOf(e.to) < order.indexOf(e.from)) {
      const sd = rtl ? -1 : 1, x0 = a.x + sd * W / 2;
      p1 = { x: x0, y: a.y }; p2 = { x: x0, y: b.y };
      c1 = { x: x0 + sd * Math.max(70, (lw(e) / 2 + 30) / 0.75), y: a.y }; c2 = { x: x0 + sd * Math.max(70, (lw(e) / 2 + 30) / 0.75), y: b.y };
    } else if (lr && isBack) {
      const top = Math.min(a.y, b.y) - H / 2 - PIN - 40;
      p1 = { x: a.x + (rtl ? 34 : -34), y: a.y - H / 2 }; p2 = { x: b.x + (rtl ? -34 : 34), y: b.y - H / 2 };
      c1 = { x: p1.x, y: top }; c2 = { x: p2.x, y: top };
    } else {
      p1 = boundary(a, b); p2 = boundary(b, a);
      const horiz = lr ? true : (snake || col) ? Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) : false;
      const d = (horiz ? Math.abs(p2.x - p1.x) : Math.abs(p2.y - p1.y)) * 0.5;
      const sx = Math.sign(p2.x - p1.x) || 1, sy = Math.sign(p2.y - p1.y) || 1;
      if (lr && layer.get(e.from) === layer.get(e.to)) { c1 = p1; c2 = p2; }
      else { c1 = horiz ? { x: p1.x + sx * d, y: p1.y } : { x: p1.x, y: p1.y + sy * d }; c2 = horiz ? { x: p2.x - sx * d, y: p2.y } : { x: p2.x, y: p2.y - sy * d }; }
    }
    return { e, p1, p2, c1, c2, isBack, from: e.from, to: e.to };
  });

  /* ── تفادي العقد: كلُّ سهمٍ يعبر عقدةً يُنحنى حولها ─────────────── */
  const hits = r => {
    let n = 0;
    for (let t = 0.1; t <= 0.9; t += 0.04) {
      const p = bez(r, t);
      for (const q of rects) {
        const own = q.id === r.from || q.id === r.to;
        if (own && (t < 0.22 || t > 0.78)) continue;
        if (inside(p, q, 5)) n++;
      }
    }
    return n;
  };
  for (const r of routes) {
    if (r.from === r.to) continue;
    let best = { k: 0, n: hits(r), c1: r.c1, c2: r.c2 };
    if (best.n > 0) {
      const dx = r.p2.x - r.p1.x, dy = r.p2.y - r.p1.y, len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      if (rtl ? nx > 0 : nx < 0) { nx = -nx; ny = -ny; }
      for (const k of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
        const off = k * 46;
        const cand = { ...r, c1: { x: r.c1.x + nx * off, y: r.c1.y + ny * off }, c2: { x: r.c2.x + nx * off, y: r.c2.y + ny * off } };
        const n = hits(cand);
        if (n < best.n) best = { k, n, c1: cand.c1, c2: cand.c2 };
        if (n === 0) break;
      }
    }
    r.c1 = best.c1; r.c2 = best.c2;
  }

  lastMetrics.crossings += routes.reduce((n, r) => n + (r.from === r.to ? 0 : hits(r)), 0);

  /* ── وضع التسميات بلا تراكب ───────────────────────────────── */
  const placed = [];
  const labelRects = [];
  for (const r of routes) {
    if (!r.e.label) continue;
    const text = r.e.label[lang], w = Math.max(30, text.length * 6.6 + 14), h = 22;
    let best = null;
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88]) {
      const c = bez(r, t), box = { x0: c.x - w / 2, x1: c.x + w / 2, y0: c.y - h / 2, y1: c.y + h / 2 };
      let pen = Math.abs(t - 0.5) * 8;
      for (const q of rects) if (overlap(box, q, 2)) pen += 100;
      for (const q of placed) if (overlap(box, q, 2)) pen += 100;
      if (!best || pen < best.pen) best = { pen, c, box };
      if (pen < 4) break;
    }
    placed.push(best.box);
    if (best.pen >= 100) lastMetrics.badLabels++;
    labelRects.push({ text, w, h, c: best.c });
  }

  /* ── الحدود الفعلية ───────────────────────────────────────── */
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const q of rects) { grow(q.x0, q.y0); grow(q.x1, q.y1); }
  for (const r of routes) for (let t = 0; t <= 1; t += 0.1) { const p = bez(r, t); grow(p.x, p.y); }
  for (const l of labelRects) { grow(l.c.x - l.w / 2, l.c.y - l.h / 2); grow(l.c.x + l.w / 2, l.c.y + l.h / 2); }
  const pad = 22;
  const vx = Math.floor(minX - pad), vy = Math.floor(minY - pad), vw = Math.ceil(maxX - minX + pad * 2), vh = Math.ceil(maxY - minY + pad * 2);

  /* ── الرسم ───────────────────────────────────────────────── */
  const mid = `m${diagram.id}-${lang}-${orient}`.replace(/[^a-z0-9-]/gi, "");
  const parts = routes.map(r => `<path class="edge${r.isBack ? " back" : ""}" d="M${r.p1.x.toFixed(1)} ${r.p1.y.toFixed(1)}C${r.c1.x.toFixed(1)} ${r.c1.y.toFixed(1)} ${r.c2.x.toFixed(1)} ${r.c2.y.toFixed(1)} ${r.p2.x.toFixed(1)} ${r.p2.y.toFixed(1)}" marker-end="url(#${mid})"/>`);
  for (const n of nodes) {
    const c = center.get(n.id), kind = n.kind || "state";
    const lines = wrap(n.label[lang], lang === "ar" ? 20 : 23);
    const x = c.x - W / 2, y = c.y - H / 2;
    const ty = c.y + 9 - ((lines.length - 1) * 8.5);
    parts.push(`<g class="fn fn-${kind}"><rect class="box" x="${x}" y="${y}" width="${W}" height="${H}" rx="15"/>`
      + `<circle class="pin" cx="${c.x}" cy="${y}" r="15"/>`
      + `<svg class="pinic" x="${c.x - 9}" y="${y - 9}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconInner(n.icon || (kind === "decision" ? "git-branch" : kind === "end" ? "flag" : kind === "start" ? "play" : kind === "system" ? "cpu" : "circle-dot"))}</svg>`
      + lines.map((ln, i) => `<text x="${c.x}" y="${ty + i * 17}">${esc(ln)}</text>`).join("") + `</g>`);
  }
  for (const l of labelRects) {
    parts.push(`<g class="elabel"><rect x="${(l.c.x - l.w / 2).toFixed(1)}" y="${(l.c.y - l.h / 2).toFixed(1)}" width="${l.w.toFixed(1)}" height="${l.h}" rx="11"/><text x="${l.c.x.toFixed(1)}" y="${(l.c.y + 4.2).toFixed(1)}">${esc(l.text)}</text></g>`);
  }
  return `<svg class="flow o-${orient}" role="img" aria-label="${esc(diagram.title[lang])}" viewBox="${vx} ${vy} ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg" direction="${rtl ? "rtl" : "ltr"}">`
    + `<defs><marker id="${mid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="arrow" d="M0 0L10 5L0 10z"/></marker></defs>`
    + parts.join("") + `</svg>`;
}

/** يجرّب التخطيطات المرشَّحة ويعيد أنظفها: أقلُّ عبوراً للعقد وتراكباً للتسميات (وعند التعادل الأول في القائمة). */
export function bestFlowSvg(diagram, lang, candidates, dims = { pageW: 628, colW: 389, pageH: 756 }) {
  let best = null;
  for (const orient of candidates) {
    lastMetrics.crossings = 0; lastMetrics.badLabels = 0;
    const svg = flowSvg(diagram, lang, orient);
    const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
    const vw = +vb[3], vh = +vb[4], pageW = orient === "col" ? dims.colW : dims.pageW, pageH = dims.pageH;
    const scale = Math.min(pageW / vw, pageH / vh, 1.1);
    const score = lastMetrics.crossings * 4 + lastMetrics.badLabels * 6 + Math.max(0, 0.9 - scale) * 40;
    if (!best || score < best.score) best = { score, svg, orient };
  }
  return best;
}
