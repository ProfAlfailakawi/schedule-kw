/**
 * تاريخ النظام: وسام «منذ 2016» وخط الزمن وما يقرؤه النظام من تاريخه.
 * السنة وتاريخ القياس تُقرأ من src/utils/audienceBaseline.ts، والنصوص من docs/srs/front.json،
 * وكل بطاقةٍ تشير إلى متطلبٍ موجود (يُفحص عند البناء).
 */
import { icon } from "./icons.mjs";

const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? `{${k}}`));

export function historyVars(m) {
  const year = Number(m.meta.releaseDate.slice(0, 4));
  return { since: m.usage.since, year, years: year - m.usage.since, asOf: m.usage.asOf, release: m.meta.releaseDate, version: `v${m.meta.version}` };
}

/** كل متطلبٍ تشير إليه قصة التاريخ موجود فعلاً. */
export function validateHistory(m) {
  const ids = new Set(m.reqs.map(r => r.id)), h = m.front.history, bad = [];
  for (const x of [...h.milestones, ...h.reads]) if (x.req && !ids.has(x.req)) bad.push(x.req);
  if (bad.length) throw new Error(`front.json history: متطلبات غير موجودة ${bad.join("، ")}`);
}

const bi = (c, o, v) => c.T({ ar: fill(o.ar, v), en: fill(o.en, v) });
const span = (c, v) => ({ ar: `${v.years} سنوات من التشغيل`, en: `${v.years} years in service` });

/** وسام السنة: كبيرٌ ومميز، لأن السنة تاريخ النظام كله. */
export function sinceMedal(c, m, cls = "") {
  const v = historyVars(m);
  return `<div class="since-medal ${cls}"><small>${c.T({ ar: "منذ", en: "Since" })}</small><b>${v.since}</b><span>${c.T(span(c, v))}</span></div>`;
}

export function historyBlock(c, m, { withLead = true } = {}) {
  const h = m.front.history, v = historyVars(m);
  const when = w => (typeof w === "string" ? esc(fill(w, v)) : c.T(w));
  const line = `<ol class="htl">${h.milestones.map((x, i) => `<li class="${i === 0 ? "first" : ""}"><span class="hwhen">${when(x.when)}</span><span class="hdot">${icon(x.icon, i === 0 ? 20 : 16)}</span><div class="hbody"><b>${bi(c, x.title, v)}</b><p>${bi(c, x.text, v)}</p>${x.req ? `<a class="hreq" href="#${x.req}">${x.req}</a>` : ""}</div></li>`).join("")}</ol>`;
  const reads = `<div class="hreads"><h4>${icon("book-open-check", 18)}${c.T(h.readsTitle)}</h4><div class="hcards">${h.reads.map(x => `<a class="hcard" href="#${x.req}">${icon(x.icon, 20)}<b>${c.T(x.title)}</b><span>${c.T(x.text)}</span><code>${x.req}</code></a>`).join("")}</div></div>`;
  return `<div class="history">${withLead ? `<p class="hlead">${bi(c, h.lead, v)}</p>` : ""}${line}${reads}</div>`;
}
