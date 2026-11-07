/**
 * مخطط التدفق: يُوزَّع آلياً على طبقات (أطول مسار) ويُرسم SVG بلا مكتبات.
 * الاتجاه: lr أفقي (للشاشة) أو tb رأسي (لصفحة A4). في العربية تنعكس القراءة يميناً إلى اليسار.
 */
import { iconInner } from "./icons.mjs";

const W = 184, H = 78, GX = 64, GY = 54, PAD = 34;
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
  const lr = orient === "lr";
  const snake = orient === "snake";
  const center = new Map();
  if (snake) {
    const order = nodes.map(n => n.id).sort((a, b) => layer.get(a) - layer.get(b) || pos.get(a) - pos.get(b));
    const per = 3;
    order.forEach((id, i) => {
      const row = Math.floor(i / per), col = i % per;
      center.set(id, { x: PAD + (rtl ? per - 1 - col : col) * (W + GX) + W / 2, y: PAD + 14 + row * (H + GY + 8) + H / 2 });
    });
  }
  if (!snake) cols.forEach((col, k) => {
    col.forEach((id, i) => {
      const off = (maxN - col.length) / 2;
      let a, b;
      if (lr) {
        a = PAD + (rtl ? L - 1 - k : k) * (W + GX) + W / 2;
        b = PAD + 14 + (i + off) * (H + GY) + H / 2;
      } else {
        const ii = rtl ? maxN - 1 - (i + off) : i + off;
        a = PAD + ii * (W + 40) + W / 2;
        b = PAD + 14 + k * (H + GY + 6) + H / 2;
      }
      center.set(id, { x: a, y: b });
    });
  });
  const sRows = snake ? Math.ceil(nodes.length / 3) : 0;
  const width = snake ? PAD * 2 + Math.min(3, nodes.length) * W + (Math.min(3, nodes.length) - 1) * GX : lr ? PAD * 2 + L * W + (L - 1) * GX : PAD * 2 + maxN * W + (maxN - 1) * 40;
  const height = snake ? PAD * 2 + 14 + sRows * H + (sRows - 1) * (GY + 8) + 24 : lr ? PAD * 2 + 14 + maxN * H + (maxN - 1) * GY + 40 : PAD * 2 + 14 + L * H + (L - 1) * (GY + 6) + 40;
  const mid = `m${diagram.id}-${lang}`.replace(/[^a-z0-9-]/gi, "");
  const parts = [];
  const edgeBoundary = (c, toward) => {
    const dx = toward.x - c.x, dy = toward.y - c.y;
    if (!dx && !dy) return { x: c.x, y: c.y };
    const sx = Math.abs(dx) > 0 ? (W / 2) / Math.abs(dx) : Infinity, sy = Math.abs(dy) > 0 ? (H / 2) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: c.x + dx * s, y: c.y + dy * s };
  };
  const labels = [];
  edges.forEach(e => {
    const a = center.get(e.from), b = center.get(e.to);
    const isBack = back.has(`${e.from}>${e.to}`) || e.from === e.to;
    let p1, p2, c1, c2;
    if (snake && e.from !== e.to) {
      p1 = edgeBoundary(a, b); p2 = edgeBoundary(b, a);
      const horiz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y), d = (horiz ? Math.abs(p2.x - p1.x) : Math.abs(p2.y - p1.y)) * 0.5;
      const sx = Math.sign(p2.x - p1.x) || 1, sy = Math.sign(p2.y - p1.y) || 1;
      c1 = horiz ? { x: p1.x + sx * d, y: p1.y } : { x: p1.x, y: p1.y + sy * d }; c2 = horiz ? { x: p2.x - sx * d, y: p2.y } : { x: p2.x, y: p2.y - sy * d };
    } else if (e.from === e.to) {
      p1 = { x: a.x + W / 2, y: a.y - 14 }; p2 = { x: a.x + W / 2, y: a.y + 14 };
      c1 = { x: p1.x + 56, y: p1.y - 26 }; c2 = { x: p2.x + 56, y: p2.y + 26 };
    } else if (isBack) {
      const off = 58;
      if (lr) { p1 = { x: a.x, y: a.y - H / 2 }; p2 = { x: b.x, y: b.y - H / 2 }; c1 = { x: a.x, y: Math.min(a.y, b.y) - H / 2 - off }; c2 = { x: b.x, y: Math.min(a.y, b.y) - H / 2 - off }; }
      else { const side = rtl ? -1 : 1, x0 = Math.max(a.x, b.x) + side * (W / 2); p1 = { x: a.x + side * W / 2, y: a.y }; p2 = { x: b.x + side * W / 2, y: b.y }; c1 = { x: x0 + side * off, y: a.y }; c2 = { x: x0 + side * off, y: b.y }; }
    } else if (lr && layer.get(e.from) === layer.get(e.to)) {
      p1 = edgeBoundary(a, b); p2 = edgeBoundary(b, a); c1 = p1; c2 = p2;
    } else if (lr) {
      p1 = edgeBoundary(a, b); p2 = edgeBoundary(b, a);
      const d = Math.abs(p2.x - p1.x) * 0.5, s = Math.sign(p2.x - p1.x) || 1;
      c1 = { x: p1.x + s * d, y: p1.y }; c2 = { x: p2.x - s * d, y: p2.y };
    } else {
      p1 = edgeBoundary(a, b); p2 = edgeBoundary(b, a);
      const d = Math.abs(p2.y - p1.y) * 0.5, s = Math.sign(p2.y - p1.y) || 1;
      c1 = { x: p1.x, y: p1.y + s * d }; c2 = { x: p2.x, y: p2.y - s * d };
    }
    parts.push(`<path class="edge${isBack ? " back" : ""}" d="M${p1.x.toFixed(1)} ${p1.y.toFixed(1)}C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}" marker-end="url(#${mid})"/>`);
    if (e.label) {
      const span = snake ? 1 : Math.abs(layer.get(e.to) - layer.get(e.from)); const t = span > 1 ? 0.8 : 0.5, bx = (1 - t) ** 3 * p1.x + 3 * (1 - t) ** 2 * t * c1.x + 3 * (1 - t) * t ** 2 * c2.x + t ** 3 * p2.x;
      const by = (1 - t) ** 3 * p1.y + 3 * (1 - t) ** 2 * t * c1.y + 3 * (1 - t) * t ** 2 * c2.y + t ** 3 * p2.y;
      labels.push({ x: bx, y: by, text: e.label[lang] });
    }
  });
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
  for (const l of labels) {
    const w = Math.max(28, l.text.length * 6.6 + 14);
    parts.push(`<g class="elabel"><rect x="${(l.x - w / 2).toFixed(1)}" y="${(l.y - 11).toFixed(1)}" width="${w.toFixed(1)}" height="22" rx="11"/><text x="${l.x.toFixed(1)}" y="${(l.y + 4.2).toFixed(1)}">${esc(l.text)}</text></g>`);
  }
  return `<svg class="flow" role="img" aria-label="${esc(diagram.title[lang])}" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}" xmlns="http://www.w3.org/2000/svg" direction="${rtl ? "rtl" : "ltr"}">`
    + `<defs><marker id="${mid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="arrow" d="M0 0L10 5L0 10z"/></marker></defs>`
    + parts.join("") + `</svg>`;
}
