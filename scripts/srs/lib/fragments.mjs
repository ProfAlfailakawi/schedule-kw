/** مقاطعُ HTML مشتركة بين الصفحة التفاعلية والنسخة المطبوعة. mode: dual | ar | en. */
import { icon } from "./icons.mjs";
import { flowSvg, bestFlowSvg } from "./diagram.mjs";
import { LABELS, STATUS_ORDER } from "./model.mjs";

export const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** **غامق** و`شيفرة` فقط. */
export const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
export const norm = s => String(s).toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
const STATUS_ICON = { implemented: "circle-check", "in-progress": "loader", planned: "circle-dashed" };

export function ctxFor(mode, opts = {}) {
  const T = (o, fmt = esc) => (mode === "dual"
    ? `<span class="ar" lang="ar" dir="rtl">${fmt(o.ar)}</span><span class="en" lang="en" dir="ltr">${fmt(o.en)}</span>`
    : fmt(o[mode]));
  const M = o => T(o, md);
  return { mode, T, M, print: !!opts.print, orient: opts.print ? "tb" : "lr" };
}

export const badge = (cls, label, ic = "", plain = false) => `<span class="badge ${cls}">${ic && !plain ? icon(ic, 13) : ""}${label}</span>`;
export const statusBadge = (c, s) => badge(`b-${s}`, c.T(LABELS.status[s]), STATUS_ICON[s], c.print);
export const priorityBadge = (c, p) => badge(`b-${p}`, c.T(LABELS.priority[p]));
export const kindBadge = (c, k) => badge("b-kind", c.T(LABELS.kind[k]));

export function actorChip(c, m, id) {
  const a = m.actorMap.get(id);
  return a ? `<span class="chip">${c.print ? "" : icon(a.icon, 13)}${c.T(a.name)}</span>` : "";
}

export function diagramBlock(c, d) {
  /* الطباعة تختار أنظف تخطيطٍ لكل مخطط (رأسي أو عمودي للقصير)؛ الشاشة أفقية، والهاتف عمودي. */
  const printCandidates = d.nodes.length <= 9 ? ["tb", "col"] : ["tb"];
  const one = (lang, orient) => (c.print ? bestFlowSvg(d, lang, printCandidates).svg : flowSvg(d, lang, orient));
  const both = orient => (c.mode === "dual"
    ? `<div class="ar">${one("ar", orient)}</div><div class="en">${one("en", orient)}</div>`
    : one(c.mode, orient));
  const svg = c.mode === "dual" && !c.print ? `<div class="dg-d">${both(c.orient)}</div><div class="dg-m">${both("col")}</div>` : both(c.orient);
  return `<figure class="diagram" id="dg-${esc(d.id)}"><h4>${c.T(d.title)}</h4>${d.caption ? `<p class="cap">${c.T(d.caption)}</p>` : ""}${svg}</figure>`;
}

export function journeyBlock(c, m, j) {
  return `<section class="journey"><div class="journey-head"><span class="journey-actor">${icon(m.actorMap.get(j.actor)?.icon || "user", 16)}${c.T(m.actorMap.get(j.actor).name)}</span><h4>${c.T(j.title)}</h4></div>`
    + `<ol class="steps">${j.steps.map(s => `<li>${c.T(s)}</li>`).join("")}</ol></section>`;
}

export function matrixBlock(c, m, mx) {
  const head = mx.cols.map(col => `<th scope="col">${c.T(col)}</th>`).join("");
  const body = mx.rows.map(r => `<tr><th scope="row" class="row">${icon(m.actorMap.get(r.actor).icon, 14)} ${c.T(m.actorMap.get(r.actor).name)}</th>${r.cells.map(v => `<td><span class="cell c${v}" title="${v === 2 ? "write" : v === 1 ? "read" : "none"}">${v === 2 ? icon("pencil", 14) : v === 1 ? icon("eye", 14) : icon("minus", 14)}</span></td>`).join("")}</tr>`).join("");
  const legend = `<div class="legend"><span><i class="cell c2">${icon("pencil", 13)}</i>${c.T({ ar: "كتابة", en: "Write" })}</span><span><i class="cell c1">${icon("eye", 13)}</i>${c.T({ ar: "قراءة", en: "Read" })}</span><span><i class="cell c0">${icon("minus", 13)}</i>${c.T({ ar: "لا صلاحية", en: "No access" })}</span></div>`;
  return `<div class="matrix-wrap"><h4 style="padding:.7rem .8rem 0">${c.T(mx.title)}</h4><div style="overflow:auto"><table class="matrix"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>${legend}</div>`;
}

export function reqCard(c, m, r) {
  const ev = r.evidence || {};
  const more = [];
  if (!c.print && (r.actors || []).length) more.push(`<div class="dl-title">${c.T({ ar: "الأدوار", en: "Actors" })}</div><div class="req-meta">${r.actors.map(a => actorChip(c, m, a)).join("")}</div>`);
  if (r.rationale) more.push(`<div class="dl-title">${c.T({ ar: "المبرر", en: "Rationale" })}</div><p class="req-rat">${c.M(r.rationale)}</p>`);
  more.push(`<div class="dl-title">${c.T({ ar: "معايير القبول", en: "Acceptance criteria" })}</div><ol>${r.acceptance.map(a => `<li>${c.M(a)}</li>`).join("")}</ol>`);
  if ((ev.code || []).length || (ev.tests || []).length) {
    more.push(`<div class="dl-title">${c.T({ ar: "المراجع", en: "Evidence" })}</div><div class="ev">${(ev.code || []).map(p => `<code>${esc(p)}</code>`).join("")}${(ev.tests || []).map(p => `<code class="t">${esc(p)}</code>`).join("")}</div>`);
  }
  const body = c.print
    ? `<div class="req-more">${more.join("")}</div>`
    : `<details><summary>${c.T({ ar: "معايير القبول والمراجع", en: "Acceptance and evidence" })}</summary>${more.join("")}</details>`;
  const q = norm([r.id, r.title.ar, r.title.en, r.text.ar, r.text.en, ...r.acceptance.map(a => a.ar + " " + a.en)].join(" "));
  return `<article class="req" id="${r.id}" data-id="${r.id}" data-module="${r.module}" data-status="${r.status}" data-priority="${r.priority}" data-kind="${r.kind}" data-actors="${(r.actors || []).join(" ")}" data-inferred="${r.inferred ? 1 : 0}" data-q="${esc(q)}">`
    + `<div class="req-head"><a class="req-id" href="#${r.id}">${r.id}</a><h4>${c.T(r.title)}</h4>${r.status !== "implemented" ? statusBadge(c, r.status) : ""}${r.inferred ? badge("b-inferred", c.T({ ar: "مستنتج", en: "Inferred" }), "circle-help", c.print) : ""}</div>`
    + `<p class="req-text">${c.M(r.text)}</p>`
    + `<div class="rm"><i class="sdot s-${r.status}"></i><span>${c.T(LABELS.status[r.status])}</span><span class="sep">·</span><span>${c.T(LABELS.priority[r.priority])}</span><span class="sep">·</span><span>${c.T(LABELS.kind[r.kind])}</span>${c.print && (r.actors || []).length ? `<span class="sep">·</span><span class="ra">${r.actors.map(a => c.T(m.actorMap.get(a).name)).join(c.mode === "ar" ? "، " : ", ")}</span>` : ""}</div>${body}</article>`;
}

export function screensBlock(c, s) {
  return `<div class="screen-list">${s.map(x => `<div class="screen">${icon("app-window", 15)} <b>${c.T(x.name)}</b>${x.note ? `<span>${c.T(x.note)}</span>` : ""}${x.file ? `<code>${esc(x.file)}</code>` : ""}</div>`).join("")}</div>`;
}

export function edgeBlock(c, e) {
  return `<div class="edge-card"><h5>${icon("triangle-alert", 16)} ${c.T(e.title)}</h5><div class="row"><b>${c.T({ ar: "الحالة", en: "Scenario" })}</b><span>${c.M(e.scenario)}</span><b>${c.T({ ar: "السلوك", en: "Behaviour" })}</b><span>${c.M(e.behavior)}</span></div></div>`;
}

export function termsBlock(c, terms) {
  return `<div class="terms">${terms.map(t => `<div class="term"><b>${c.mode === "en" ? esc(t.en) : esc(t.ar)}</b>${c.mode === "dual" ? `<small>${esc(t.en)}</small>` : c.mode === "ar" ? `<small>${esc(t.en)}</small>` : `<small dir="rtl" style="direction:rtl">${esc(t.ar)}</small>`}<span>${c.M(t.def)}</span></div>`).join("")}</div>`;
}

export function barRows(c, rows, total) {
  return `<div class="bars">${rows.map(r => `<div class="barrow"><span class="lbl">${r.icon ? icon(r.icon, 16) : ""}${r.label}</span><div class="track" role="img" aria-label="${esc(r.aria || "")}">${STATUS_ORDER.map(s => r.seg[s] ? `<i class="seg s-${s}" style="width:${(r.seg[s] / (total || 1) * 100).toFixed(2)}%"></i>` : "").join("")}</div><span class="num">${r.value}</span></div>`).join("")}</div>`;
}
