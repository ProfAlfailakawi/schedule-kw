/** الصفحة التفاعلية: ملف HTML واحد يحمل المحتوى بلغتيه وسلوكه. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./common.mjs";
import { icon, logo, logoDataUri } from "./icons.mjs";
import { LABELS, STATUS_ORDER, PRIORITY_ORDER } from "./model.mjs";
import { ctxFor, esc, md, reqCard, diagramBlock, journeyBlock, matrixBlock, screensBlock, edgeBlock, termsBlock, barRows, actorChip, statusBadge } from "./fragments.mjs";

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const fonts = "/fonts/";
const T2 = (ar, en) => ({ ar, en });

export function renderInteractive(m, { pdfs = {}, pdfInfo = null } = {}) {
  const c = ctxFor("dual");
  const css = (read("scripts/srs/theme/base.css") + read("scripts/srs/theme/screen.css")).replaceAll("{{FONTS}}", fonts);
  const js = read("scripts/srs/lib/client.js");
  const s = m.stats, f = m.facts.totals;
  const stat = (ic, n, ar, en, suffix = "") => `<div class="stat"><b data-count="${n}" data-suffix="${suffix}">${n}${suffix}</b><span>${icon(ic, 15)}${c.T(T2(ar, en))}</span></div>`;
  const sections = [
    ["overview", "layout-dashboard", T2("نظرة عامة", "Overview")],
    ["map", "map", T2("خريطة النظام", "System map")],
    ["actors", "users", T2("الأدوار", "Actors")],
  ];
  const toc = [
    `<div class="grp">${c.T(T2("البداية", "Start"))}</div>`,
    ...sections.map(([id, ic, t]) => `<a href="#${id}" data-sec="${id}">${icon(ic, 16)}${c.T(t)}</a>`),
    ...m.groups.flatMap(g => [`<div class="grp">${c.T(g.title)}</div>`, ...g.mods.map(x => `<a href="#mod-${x.id}" data-sec="mod-${x.id}">${icon(x.icon, 16)}<span>${c.T(x.title)}</span></a>`)]),
    `<div class="grp">${c.T(T2("الملاحق", "Appendices"))}</div>`,
    `<a href="#trace" data-sec="trace">${icon("git-compare-arrows", 16)}${c.T(T2("التتبّع", "Traceability"))}</a>`,
    `<a href="#glossary" data-sec="glossary">${icon("book-a", 16)}${c.T(T2("المصطلحات", "Glossary"))}</a>`,
    `<a href="#revisions" data-sec="revisions">${icon("history", 16)}${c.T(T2("الإصدارات", "Revisions"))}</a>`,
  ].join("");

  const moduleRows = m.modules.map(x => ({ icon: x.icon, label: c.T(x.title), seg: x.counts.status, value: x.counts.total, aria: `${x.counts.total}` }));
  const maxReqs = Math.max(...m.modules.map(x => x.counts.total), 1);
  const legend = `<div class="legend" style="padding:.2rem 0 .6rem">${STATUS_ORDER.map(st => `<span><i class="seg s-${st}" style="display:inline-block;width:14px;height:14px;border-radius:4px"></i>${c.T(LABELS.status[st])} <b class="num">${s.status[st]}</b></span>`).join("")}</div>`;
  const prioRows = PRIORITY_ORDER.map(p => `<div class="barrow"><span class="lbl">${c.T(LABELS.priority[p])}</span><div class="track"><i class="seg s-implemented" style="width:${(s.priority[p] / s.requirements * 100).toFixed(1)}%"></i></div><span class="num">${s.priority[p]}</span></div>`).join("");
  const kindRows = Object.keys(LABELS.kind).filter(k => s.kind[k]).map(k => `<div class="barrow"><span class="lbl">${c.T(LABELS.kind[k])}</span><div class="track"><i class="seg s-in-progress" style="width:${(s.kind[k] / s.requirements * 100).toFixed(1)}%"></i></div><span class="num">${s.kind[k]}</span></div>`).join("");

  const overview = `<section class="sec overview" id="overview" data-secid>
    <h2>${icon("layout-dashboard", 24)}${c.T(T2("نظرة عامة", "Overview"))}</h2>
    <p class="lead">${c.M(T2(m.front.abstract.ar, m.front.abstract.en))}</p>
    <div class="pillars" style="margin:1rem 0 1.4rem">${m.front.pillars.map(p => `<div class="pillar">${icon(p.icon, 24)}<b>${c.T(p.title)}</b><span>${c.T(p.text)}</span></div>`).join("")}</div>
    <div class="grid2">
      <div class="card"><h3 style="margin-bottom:.6rem">${c.T(T2("المتطلبات حسب الوحدة والحالة", "Requirements by module and status"))}</h3>${legend}${barRows(c, moduleRows, maxReqs)}</div>
      <div class="card" style="display:grid;gap:1.1rem;align-content:start">
        <div style="display:flex;gap:1.1rem;align-items:center;flex-wrap:wrap"><div class="donut" style="--p:${s.implementedPct}" data-v="${s.implementedPct}%"></div><div><b>${c.T(T2("نسبة المنفَّذ", "Implemented share"))}</b><p style="margin:.2rem 0 0;color:var(--ink-2)">${c.T(T2(`${s.status.implemented} من ${s.requirements} متطلباً موجودة في النسخة الحالية.`, `${s.status.implemented} of ${s.requirements} requirements exist in the current release.`))}</p></div></div>
        <div style="display:flex;gap:1.1rem;align-items:center;flex-wrap:wrap"><div class="donut" style="--p:${s.tracedPct};background:conic-gradient(var(--brass-bright) calc(var(--p)*1%),var(--surface-3) 0)" data-v="${s.tracedPct}%"></div><div><b>${c.T(T2("مثبت باختبار", "Proven by a test"))}</b><p style="margin:.2rem 0 0;color:var(--ink-2)">${c.T(T2(`${s.traced} متطلباً منفَّذاً يرتبط باختبار واحد على الأقل.`, `${s.traced} implemented requirements link to at least one test.`))}</p></div></div>
        <div><b>${c.T(T2("حسب الأولوية", "By priority"))}</b><div class="bars" style="margin-top:.4rem">${prioRows}</div></div>
        <div><b>${c.T(T2("حسب النوع", "By kind"))}</b><div class="bars" style="margin-top:.4rem">${kindRows}</div></div>
      </div>
    </div></section>`;

  const map = `<section class="sec overview" id="map" data-secid><h2>${icon("map", 24)}${c.T(T2("خريطة النظام", "System map"))}</h2>
    <p class="lead">${c.T(T2(`${m.stats.modules} وحدة في ${m.groups.length} طبقات. اضغط وحدة لتصل إلى فصلها.`, `${m.stats.modules} modules in ${m.groups.length} layers. Select a module to jump to its chapter.`))}</p>
    ${m.groups.map(g => `<div class="grp-block"><h3>${icon(g.icon, 18)}${c.T(g.title)}</h3><div class="tiles">${g.mods.map(x => `<a class="tile" href="#mod-${x.id}"><span class="no">${String(x.index).padStart(2, "0")} · ${x.id}</span>${icon(x.icon, 24)}<b>${c.T(x.title)}</b><small>${c.T(x.tagline)}</small><div class="meter" aria-hidden="true"><i style="width:${x.counts.total ? Math.round(x.counts.status.implemented / x.counts.total * 100) : 0}%"></i></div><div class="cnt"><span>${x.counts.total} ${c.T(T2("متطلباً", "reqs"))}</span><span>${x.facts.endpoints} ${c.T(T2("مساراً", "routes"))}</span></div></a>`).join("")}</div></div>`).join("")}</section>`;

  const actors = `<section class="sec overview" id="actors" data-secid><h2>${icon("users", 24)}${c.T(T2("الأدوار", "Actors"))}</h2>
    <p class="lead">${c.T(T2("من يتعامل مع النظام. اضغط دوراً لترى متطلباته.", "Who deals with the system. Select an actor to see its requirements."))}</p>
    <div class="actor-grid">${m.actors.map(a => { const u = m.actorUse.get(a.id); return `<a class="actor" href="#" data-filter-actor="${a.id}" style="text-decoration:none;color:inherit">${icon(a.icon, 22)}<div><b>${c.T(a.name)}</b><small>${u.reqs} ${c.T(T2("متطلباً في", "reqs in"))} ${u.modules.size} ${c.T(T2("وحدة", "modules"))}</small></div></a>`; }).join("")}</div></section>`;

  const chapters = m.modules.map(x => {
    const body = [];
    body.push(`<p class="summary nonreq">${c.M(x.summary)}</p>`);
    body.push(`<div class="req-meta nonreq" style="margin:.4rem 0">${x.actors.map(a => actorChip(c, m, a)).join("")}</div>`);
    if (x.journeys?.length) body.push(`<div class="nonreq"><h3>${icon("route", 20)}${c.T(T2("رحلات المستخدمين", "User journeys"))}</h3>${x.journeys.map(j => journeyBlock(c, m, j)).join("")}</div>`);
    if (x.diagrams?.length) body.push(`<div class="nonreq"><h3>${icon("workflow", 20)}${c.T(T2("المخططات", "Diagrams"))}</h3>${x.diagrams.map(d => diagramBlock(c, d)).join("")}</div>`);
    if (x.matrix) body.push(`<div class="nonreq">${matrixBlock(c, m, x.matrix)}</div>`);
    if (x.screens?.length) body.push(`<div class="nonreq"><h3>${icon("app-window", 20)}${c.T(T2("الشاشات", "Screens"))}</h3>${screensBlock(c, x.screens)}</div>`);
    body.push(`<h3>${icon("list-checks", 20)}${c.T(T2("المتطلبات", "Requirements"))}</h3>${x.reqs.map(r => reqCard(c, m, r)).join("")}`);
    if (x.edgeCases?.length) body.push(`<div class="nonreq"><h3>${icon("triangle-alert", 20)}${c.T(T2("الحالات الحدية", "Edge cases"))}</h3>${x.edgeCases.map(e => edgeBlock(c, e)).join("")}</div>`);
    if (x.ownerRules?.length) body.push(`<div class="nonreq"><h3>${icon("gavel", 20)}${c.T(T2("قرارات المالك الثابتة", "Standing owner decisions"))}</h3><ul>${x.ownerRules.map(o => `<li>${c.M(o)}</li>`).join("")}</ul></div>`);
    return `<section class="chapter" id="mod-${x.id}" data-module="${x.id}" data-secid>
      <header class="chapter-head"><div class="big">${icon(x.icon, 34)}</div><div><small>${String(x.index).padStart(2, "0")} · ${x.id}</small><h2>${c.T(x.title)}</h2><p>${c.T(x.tagline)}</p></div>
      <div class="mini"><div><b>${x.counts.total}</b><span>${c.T(T2("متطلب", "reqs"))}</span></div><div><b>${x.counts.total ? Math.round(x.counts.status.implemented / x.counts.total * 100) : 0}%</b><span>${c.T(T2("منفّذ", "done"))}</span></div><div><b>${x.facts.endpoints}</b><span>${c.T(T2("مسار", "routes"))}</span></div></div></header>
      ${body.join("")}</section>`;
  }).join("");

  const trace = `<section class="sec appendix" id="trace" data-secid><h2>${icon("git-compare-arrows", 24)}${c.T(T2("مصفوفة التتبّع", "Traceability matrix"))}</h2>
    <p class="lead">${c.T(T2("كل وحدة مقابل ما يثبتها من كود واختبارات. الأرقام تُستخرج من المستودع في كل بناء.", "Each module against the code and tests that back it. Figures are extracted from the repository on every build."))}</p>
    <div class="card" style="padding:0;overflow:auto"><table class="tbl"><thead><tr><th>${c.T(T2("الوحدة", "Module"))}</th><th>${c.T(T2("متطلبات", "Reqs"))}</th><th>${c.T(T2("منفّذ", "Done"))}</th><th>${c.T(T2("مختبَر", "Tested"))}</th><th>${c.T(T2("مستنتج", "Inferred"))}</th><th>${c.T(T2("مسارات الخادم", "Routes"))}</th><th>${c.T(T2("ملفات مغطّاة", "Files covered"))}</th></tr></thead><tbody>
    ${m.modules.map(x => { const impl = x.reqs.filter(r => r.status === "implemented"), tested = impl.filter(r => (r.evidence?.tests || []).length).length; return `<tr><td><a href="#mod-${x.id}">${icon(x.icon, 15)} ${c.T(x.title)}</a></td><td class="num">${x.counts.total}</td><td class="num">${impl.length}</td><td class="num">${tested}/${impl.length}</td><td class="num">${x.counts.inferred}</td><td class="num">${x.facts.endpoints}</td><td class="num">${x.facts.files}</td></tr>`; }).join("")}
    <tr><td><b>${c.T(T2("المجموع", "Total"))}</b></td><td class="num">${s.requirements}</td><td class="num">${s.status.implemented}</td><td class="num">${s.traced}/${s.status.implemented}</td><td class="num">${s.inferred}</td><td class="num">${f.endpoints}</td><td class="num">${f.watchedFiles}</td></tr></tbody></table></div>
    <p class="lead" style="margin-top:.8rem">${c.T(T2(`يغطي المستودع ${f.watchedFiles} ملفاً برمجياً (${f.loc.toLocaleString("en")} سطراً)، و${f.components} شاشة ومكوّن، و${f.endpoints} مسار خادم مرصود، و${f.tests} ملف اختبار.`, `The repository covers ${f.watchedFiles} source files (${f.loc.toLocaleString("en")} lines), ${f.components} screens and components, ${f.endpoints} detected server routes and ${f.tests} test files.`))}</p></section>`;

  const glossary = `<section class="sec appendix" id="glossary" data-secid><h2>${icon("book-a", 24)}${c.T(T2("المصطلحات", "Glossary"))}</h2>${termsBlock(c, m.glossary)}</section>`;
  const revisions = `<section class="sec appendix" id="revisions" data-secid><h2>${icon("history", 24)}${c.T(T2("سجل الإصدارات", "Revision history"))}</h2><div class="card" style="padding:0;overflow:auto"><table class="tbl"><thead><tr><th>${c.T(T2("الإصدار", "Version"))}</th><th>${c.T(T2("التاريخ", "Date"))}</th><th>${c.T(T2("التغييرات", "Changes"))}</th></tr></thead><tbody>${m.revisions.map(r => `<tr><td class="mono">${esc(r.version)}</td><td class="mono">${esc(r.date)}</td><td>${c.M(r.changes)}</td></tr>`).join("")}</tbody></table></div></section>`;

  const filterbar = `<div class="filterbar" id="filterbar"><div class="filterbar-in" role="search"><button class="fchip ftoggle" type="button" id="ftoggle" aria-expanded="false">${icon("funnel", 14)}${c.T(T2("المرشحات", "Filters"))}</button>
    <div class="fgroup"><span class="lbl">${c.T(T2("الحالة", "Status"))}</span>${STATUS_ORDER.map(st => `<button class="fchip" type="button" data-fchip="status" data-val="${st}" aria-pressed="false">${c.T(LABELS.status[st])}</button>`).join("")}</div>
    <div class="fgroup"><span class="lbl">${c.T(T2("الأولوية", "Priority"))}</span>${PRIORITY_ORDER.map(p => `<button class="fchip" type="button" data-fchip="priority" data-val="${p}" aria-pressed="false">${c.T(LABELS.priority[p])}</button>`).join("")}</div>
    <div class="fgroup"><span class="lbl">${c.T(T2("النوع", "Kind"))}</span>${Object.keys(LABELS.kind).filter(k => s.kind[k]).map(k => `<button class="fchip" type="button" data-fchip="kind" data-val="${k}" aria-pressed="false">${c.T(LABELS.kind[k])}</button>`).join("")}</div>
    <button class="fchip" type="button" id="f-inferred" aria-pressed="false">${icon("circle-help", 14)}${c.T(T2("مستنتج", "Inferred"))}</button>
    <label class="fgroup"><span class="sr">${c.T(T2("الوحدة", "Module"))}</span><select class="fsel" id="f-module"><option value="">${c.T(T2("كل الوحدات", "All modules"))}</option>${m.modules.map(x => `<option value="${x.id}">${x.id} · ${esc(x.title.ar)} / ${esc(x.title.en)}</option>`).join("")}</select></label>
    <label class="fgroup"><span class="sr">${c.T(T2("الدور", "Actor"))}</span><select class="fsel" id="f-actor"><option value="">${c.T(T2("كل الأدوار", "All actors"))}</option>${m.actors.map(a => `<option value="${a.id}">${esc(a.name.ar)} / ${esc(a.name.en)}</option>`).join("")}</select></label>
    <button class="fchip" type="button" id="openall" aria-pressed="false">${icon("chevrons-down", 14)}${c.T(T2("فتح التفاصيل", "Expand details"))}</button>
    <button class="fchip" type="button" data-clear>${icon("x", 14)}${c.T(T2("مسح", "Clear"))}</button></div></div>`;

  const authors = m.meta.authors;
  const pdfLinks = ["ar", "en"].filter(l => pdfs[l]);
  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#141917">
<title>SCHEDULE · SRS</title><link rel="icon" type="image/svg+xml" href="${logoDataUri()}"><style>${css}</style></head>
<body>
<header class="topbar"><div class="topbar-in">
  <a class="brand" href="#top"><span class="mark">${logo(34)}</span><span>SCHEDULE<small>${c.T(m.meta.document)}</small></span></a>
  <div class="search">${icon("search", 18)}<input id="q" type="search" autocomplete="off" aria-label="search" data-ph-ar="ابحث في المتطلبات…  ( / )" data-ph-en="Search requirements…  ( / )"></div>
  <div class="tools">
    <button class="btn" data-lang-btn="ar" aria-pressed="true">AR</button><button class="btn" data-lang-btn="en" aria-pressed="false">EN</button>
    <button class="btn" id="theme" type="button" aria-label="theme">${icon("sun-moon", 18)}</button>
    <a class="btn primary" data-live data-live-ar="print-ar.html#print" data-live-en="print-en.html#print" href="print-ar.html#print" target="_blank" rel="noopener" title="PDF">${icon("file-down", 18)}<span class="hide-sm">PDF</span></a>
  </div></div></header>
${filterbar}
<div class="hero" id="top"><div class="hero-in">
  <div class="hero-logo">${logo(76)}</div>
  <span class="kicker">${icon("scroll-text", 16)} ${c.T(m.meta.document)} · ${esc(m.meta.standard)}</span>
  <h1>${c.T(m.meta.system)}</h1>
  <p class="sub">${c.T(T2("ما يجب أن يقدمه النظام، ولمن، وبأي ضمانات. مرتبط بالكود والاختبارات ويتحدث مع كل إصدار.", "What the system must provide, for whom, and under which guarantees. Linked to the code and tests, and refreshed with every release."))}</p>
  <div class="chips"><span class="hchip">${icon("tag", 14)} v${esc(m.meta.version)}</span><span class="hchip">${icon("calendar", 14)} ${esc(m.meta.releaseDate)}</span>${authors.map(a => `<span class="hchip">${icon("user-round", 14)} ${c.T(a)}</span>`).join("")}</div>
  <p class="chips" style="margin:0 0 1rem"><a class="hchip" data-live data-live-ar="print-ar.html#print" data-live-en="print-en.html#print" href="print-ar.html#print" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">${icon("file-down", 14)} ${c.T(T2("PDF حيّ: يُبنى من المصدر الحالي", "Live PDF: built from the current source"))}</a>${pdfLinks.length ? `<a class="hchip" data-pdf data-pdf-ar="${pdfs.ar || "#"}" data-pdf-en="${pdfs.en || "#"}" href="${pdfs.ar || pdfs.en}" download style="text-decoration:none;color:inherit">${icon("archive", 14)} ${c.T(T2("لقطة الإصدار", "Release snapshot"))}</a>` : ""}</p>
  ${pdfInfo ? `<p class="hchip" style="margin:0 0 1rem">${icon("file-down", 14)} ${c.T(T2(`ملف PDF: لقطة الإصدار ${pdfInfo.version} بتاريخ ${pdfInfo.date}${pdfInfo.stale ? " — الصفحة أحدث منه" : ""}`, `PDF snapshot: release ${pdfInfo.version} dated ${pdfInfo.date}${pdfInfo.stale ? " — this page is newer" : ""}`))}</p>` : ""}
  <div class="statgrid">${stat("list-checks", s.requirements, "متطلباً", "Requirements")}${stat("boxes", s.modules, "وحدة", "Modules")}${stat("circle-check", s.implementedPct, "منفّذ", "Implemented", "%")}${stat("flask-conical", s.tracedPct, "مثبت باختبار", "Test-proven", "%")}${stat("route", f.endpoints, "مسار خادم", "Server routes")}${stat("app-window", f.components, "شاشة ومكوّن", "Screens and components")}${stat("file-check-2", f.tests, "ملف اختبار", "Test files")}${stat("badge-check", s.acceptance, "معيار قبول", "Acceptance criteria")}</div>
</div></div>
<div class="layout"><nav class="toc" aria-label="contents">${toc}</nav>
<main>
  <div class="resultbar"><span>${icon("filter", 16)} <b id="resultcount">0</b> ${c.T(T2("متطلباً مطابقاً", "matching requirements"))}</span><button class="fchip" type="button" data-clear>${icon("x", 14)}${c.T(T2("مسح المرشحات", "Clear filters"))}</button></div>
  <div class="empty">${icon("search-x", 36)}<p>${c.T(T2("لا متطلبات مطابقة. جرّب كلمة أخرى أو امسح المرشحات.", "No matching requirements. Try another word or clear the filters."))}</p></div>
  ${overview}${map}${actors}
  ${chapters}
  ${trace}${glossary}${revisions}
</main></div>
<footer class="foot"><div class="foot-in"><div class="foot-brand">${logo(44)}<div><b>${c.T(m.meta.system)}</b><small>${c.T(m.meta.document)} · v${esc(m.meta.version)} · ${esc(m.meta.releaseDate)}</small></div></div><div>${authors.map(a => `<b>${c.T(a)}</b>`).join(" · ")}<small>${c.T(T2("بُنيت هذه الصفحة من مصدر الوثيقة نفسه، وتتحدث مع كل نشر.", "This page is built from the document source itself and refreshes with every release."))}</small></div></div></footer>
<script>${js}</script></body></html>`;
  return html;
}
