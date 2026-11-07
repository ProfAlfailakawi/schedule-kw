/** الصفحة التفاعلية: ملف HTML واحد بلغتيه، تبويبات رئيسية، ووحدة واحدة في كل مرة. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./common.mjs";
import { icon, logo, logoDataUri, deco } from "./icons.mjs";
import { LABELS, STATUS_ORDER, PRIORITY_ORDER } from "./model.mjs";
import { techBlock } from "./tech.mjs";
import { ctxFor, esc, md, reqCard, diagramBlock, journeyBlock, matrixBlock, screensBlock, edgeBlock, termsBlock, barRows, actorChip } from "./fragments.mjs";

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const T2 = (ar, en) => ({ ar, en });

export function renderInteractive(m, { pdfs = {}, pdfInfo = null } = {}) {
  const c = ctxFor("dual");
  const css = (read("scripts/srs/theme/base.css") + read("scripts/srs/theme/screen.css")).replaceAll("{{FONTS}}", "/fonts/");
  const js = read("scripts/srs/lib/client.js");
  const s = m.stats, f = m.facts.totals;
  const T = o => c.T(o);
  const stat = (ic, n, ar, en, suffix = "") => `<div class="stat"><b data-count="${n}" data-suffix="${suffix}">${n}${suffix}</b><span>${icon(ic, 15)}${T(T2(ar, en))}</span></div>`;
  const pdfLinks = ["ar", "en"].filter(l => pdfs[l]);

  /* ── نظرة عامة ───────────────────────────────────────────── */
  const moduleRows = m.modules.map(x => ({ icon: x.icon, label: T(x.title), seg: x.counts.status, value: x.counts.total }));
  const maxReqs = Math.max(...m.modules.map(x => x.counts.total), 1);
  const legend = `<div class="legend" style="padding:.2rem 0 .6rem">${STATUS_ORDER.map(st => `<span><i class="seg s-${st}" style="display:inline-block;width:14px;height:14px;border-radius:4px"></i>${T(LABELS.status[st])} <b class="num">${s.status[st]}</b></span>`).join("")}</div>`;
  const prioRows = PRIORITY_ORDER.map(p => `<div class="barrow"><span class="lbl">${T(LABELS.priority[p])}</span><div class="track"><i class="seg s-implemented" style="width:${(s.priority[p] / s.requirements * 100).toFixed(1)}%"></i></div><span class="num">${s.priority[p]}</span></div>`).join("");
  const kindRows = Object.keys(LABELS.kind).filter(k => s.kind[k]).map(k => `<div class="barrow"><span class="lbl">${T(LABELS.kind[k])}</span><div class="track"><i class="seg s-in-progress" style="width:${(s.kind[k] / s.requirements * 100).toFixed(1)}%"></i></div><span class="num">${s.kind[k]}</span></div>`).join("");
  const overview = `<section class="view" id="v-overview">
    <div class="hero">${deco()}${logo(84)}<div><h1>${T(m.meta.system)}</h1><p class="sub">${T(T2("ما يجب أن يقدمه النظام، ولمن، وبأي ضمانات. مرتبط بالكود والاختبارات ويتحدث مع كل إصدار.", "What the system must provide, for whom, and under which guarantees. Linked to the code and tests, and refreshed with every release."))}</p>
      <div class="chips"><span class="hchip">${icon("scroll-text", 14)} ${T(m.meta.document)} · ${esc(m.meta.standard)}</span><span class="hchip">${icon("tag", 14)} v${esc(m.meta.version)}</span><span class="hchip">${icon("calendar", 14)} ${esc(m.meta.releaseDate)}</span><span class="hchip authors">${icon("users", 14)} ${m.meta.authors.map(a => T(a)).join(' <i class="dot">·</i> ')}</span></div></div>
      <div class="hero-actions"><button class="btn primary" type="button" data-go="modules">${icon("boxes", 18)}${T(T2("تصفّح الوحدات", "Browse modules"))}</button><button class="btn" type="button" data-go="requirements">${icon("list-checks", 18)}${T(T2("كل المتطلبات", "All requirements"))}</button>
      <a class="btn" data-live data-live-ar="print-ar.html#print" data-live-en="print-en.html#print" href="print-ar.html#print" target="_blank" rel="noopener">${icon("file-down", 18)}${T(T2("PDF حيّ", "Live PDF"))}</a>${pdfLinks.length ? `<a class="btn" data-pdf data-pdf-ar="${pdfs.ar || "#"}" data-pdf-en="${pdfs.en || "#"}" href="${pdfs.ar || pdfs.en}" download${pdfInfo ? ` title="${esc(`v${pdfInfo.version} · ${pdfInfo.date}`)}"` : ""}>${icon("archive", 18)}${T(T2("لقطة الإصدار", "Release snapshot"))}</a>` : ""}</div></div>
    <div class="statgrid">${stat("list-checks", s.requirements, "متطلباً", "Requirements")}${stat("boxes", s.modules, "وحدة", "Modules")}${stat("circle-check", s.implementedPct, "منفّذ", "Implemented", "%")}${stat("flask-conical", s.tracedPct, "مثبت باختبار", "Test-proven", "%")}${stat("route", f.endpoints, "مسار خادم", "Server routes")}${stat("file-check-2", f.tests, "ملف اختبار", "Test files")}</div>
    <p class="lead">${c.M(T2(m.front.abstract.ar, m.front.abstract.en))}</p>
    <div class="pillars">${m.front.pillars.map(p => `<div class="pillar">${icon(p.icon, 24)}<b>${T(p.title)}</b><span>${T(p.text)}</span></div>`).join("")}</div>
    <div class="grid2">
      <div class="card"><h3 style="margin-bottom:.6rem">${T(T2("المتطلبات حسب الوحدة والحالة", "Requirements by module and status"))}</h3>${legend}${barRows(c, moduleRows, maxReqs)}</div>
      <div class="card" style="display:grid;gap:1.1rem;align-content:start">
        <div style="display:flex;gap:1.1rem;align-items:center;flex-wrap:wrap"><div class="donut" style="--p:${s.implementedPct}" data-v="${s.implementedPct}%"></div><div><b>${T(T2("نسبة المنفَّذ", "Implemented share"))}</b><p style="margin:.2rem 0 0;color:var(--ink-2)">${T(T2(`${s.status.implemented} من ${s.requirements} متطلباً موجودة في النسخة الحالية.`, `${s.status.implemented} of ${s.requirements} requirements exist in the current release.`))}</p></div></div>
        <div style="display:flex;gap:1.1rem;align-items:center;flex-wrap:wrap"><div class="donut" style="--p:${s.tracedPct};background:conic-gradient(var(--brass-bright) calc(var(--p)*1%),var(--surface-3) 0)" data-v="${s.tracedPct}%"></div><div><b>${T(T2("مثبت باختبار", "Proven by a test"))}</b><p style="margin:.2rem 0 0;color:var(--ink-2)">${T(T2(`${s.traced} متطلباً منفَّذاً يرتبط باختبار واحد على الأقل.`, `${s.traced} implemented requirements link to at least one test.`))}</p></div></div>
        <div><b>${T(T2("حسب الأولوية", "By priority"))}</b><div class="bars" style="margin-top:.4rem">${prioRows}</div></div>
        <div><b>${T(T2("حسب النوع", "By kind"))}</b><div class="bars" style="margin-top:.4rem">${kindRows}</div></div>
      </div></div></section>`;

  /* ── الأدوار ─────────────────────────────────────────────── */
  const actors = `<section class="view" id="v-actors" hidden><h2 class="vh">${icon("users", 22)}${T(T2("الأدوار", "Actors"))}</h2>
    <p class="lead">${T(T2("من يتعامل مع النظام. اضغط دوراً لترى كل متطلباته.", "Who deals with the system. Select an actor to see all of its requirements."))}</p>
    <div class="actor-grid">${m.actors.map(a => { const u = m.actorUse.get(a.id); return `<button class="actor" type="button" data-filter-actor="${a.id}">${icon(a.icon, 22)}<div><b>${T(a.name)}</b><small>${u.reqs} ${T(T2("متطلباً في", "reqs in"))} ${u.modules.size} ${T(T2("وحدة", "modules"))}</small></div></button>`; }).join("")}</div></section>`;

  /* ── الوحدات والمتطلبات: مسرح واحد ──────────────────────── */
  const sidebar = m.groups.map(g => `<div class="grp">${T(g.title)}</div>${g.mods.map(x => `<button type="button" data-mod="${x.id}" aria-current="false">${icon(x.icon, 16)}<span>${T(x.title)}</span><span class="c">${x.counts.total}</span></button>`).join("")}`).join("");
  const picker = `<div class="mod-pick"><select id="modpick" aria-label="${esc(T2("الوحدة", "Module").ar)}"><option value="">${T(T2("اختر وحدة…", "Choose a module…"))}</option>${m.groups.map(g => `<optgroup label="${esc(g.title.ar)} / ${esc(g.title.en)}">${g.mods.map(x => `<option value="${x.id}">${esc(x.title.ar)} / ${esc(x.title.en)}</option>`).join("")}</optgroup>`).join("")}</select></div>`;
  const tiles = `<div class="mod-map" id="modmap">${m.groups.map(g => `<div class="grp-block"><h3>${icon(g.icon, 18)}${T(g.title)}</h3><div class="tiles">${g.mods.map(x => `<button type="button" class="tile" data-mod="${x.id}"><span class="no">${String(x.index).padStart(2, "0")}</span>${icon(x.icon, 24)}<b>${T(x.title)}</b><small>${T(x.tagline)}</small><div class="meter" aria-hidden="true"><i style="width:${x.counts.total ? Math.round(x.counts.status.implemented / x.counts.total * 100) : 0}%"></i></div><div class="cnt"><span>${x.counts.total} ${T(T2("متطلباً", "reqs"))}</span><span>${x.facts.endpoints} ${T(T2("مساراً", "routes"))}</span></div></button>`).join("")}</div></div>`).join("")}</div>`;

  const moduleSection = x => {
    const hasDiag = x.diagrams?.length || x.matrix, hasEdge = x.edgeCases?.length;
    const about = [`<p class="summary">${c.M(x.summary)}</p>`, `<div class="req-meta" style="margin:.4rem 0">${x.actors.map(a => actorChip(c, m, a)).join("")}</div>`];
    if (x.journeys?.length) about.push(`<h3>${icon("route", 20)}${T(T2("رحلات المستخدمين", "User journeys"))}</h3>${x.journeys.map(j => journeyBlock(c, m, j)).join("")}`);
    if (x.screens?.length) about.push(`<h3>${icon("app-window", 20)}${T(T2("الشاشات", "Screens"))}</h3>${screensBlock(c, x.screens)}`);
    if (x.ownerRules?.length) about.push(`<h3>${icon("gavel", 20)}${T(T2("قرارات المالك الثابتة", "Standing owner decisions"))}</h3><ul>${x.ownerRules.map(o => `<li>${c.M(o)}</li>`).join("")}</ul>`);
    const tabsDef = [["about", "info", T2("نظرة ورحلات", "Overview and journeys"), ""], hasDiag ? ["diagrams", "workflow", T2("مخططات", "Diagrams"), x.diagrams?.length || 1] : null, ["reqs", "list-checks", T2("المتطلبات", "Requirements"), x.counts.total], hasEdge ? ["edge", "triangle-alert", T2("حالات حدية", "Edge cases"), x.edgeCases.length] : null].filter(Boolean);
    return `<section class="mod" id="mod-${x.id}" data-module="${x.id}" hidden>
      <header class="mod-head"><div class="big">${icon(x.icon, 28)}</div><div><small>${String(x.index).padStart(2, "0")} · ${x.id}</small><h2>${T(x.title)}</h2><p>${T(x.tagline)}</p></div>
      <div class="mini"><div><b>${x.counts.total}</b><span>${T(T2("متطلب", "reqs"))}</span></div><div><b>${x.counts.total ? Math.round(x.counts.status.implemented / x.counts.total * 100) : 0}%</b><span>${T(T2("منفّذ", "done"))}</span></div><div><b>${x.facts.endpoints}</b><span>${T(T2("مسار", "routes"))}</span></div></div></header>
      <div class="subtabs" role="tablist">${tabsDef.map(([k, ic, t, n]) => `<button class="subtab" type="button" role="tab" data-p="${k}" aria-selected="false">${icon(ic, 15)}${T(t)}${n !== "" ? ` <span class="n">${n}</span>` : ""}</button>`).join("")}</div>
      <div class="panel" data-p="about" hidden>${about.join("")}</div>
      ${hasDiag ? `<div class="panel" data-p="diagrams" hidden>${(x.diagrams || []).map(d => diagramBlock(c, d)).join("")}${x.matrix ? matrixBlock(c, m, x.matrix) : ""}</div>` : ""}
      <div class="panel" data-p="reqs" hidden>${x.reqs.map(r => reqCard(c, m, r)).join("")}</div>
      ${hasEdge ? `<div class="panel" data-p="edge" hidden>${x.edgeCases.map(e => edgeBlock(c, e)).join("")}</div>` : ""}
    </section>`;
  };

  const rtools = `<div class="rtools" role="search">
    <div class="fgroup"><span class="lbl">${T(T2("الحالة", "Status"))}</span>${STATUS_ORDER.map(st => `<button class="fchip" type="button" data-fchip="status" data-val="${st}" aria-pressed="false">${T(LABELS.status[st])}</button>`).join("")}</div>
    <div class="fgroup"><span class="lbl">${T(T2("الأولوية", "Priority"))}</span>${PRIORITY_ORDER.map(p => `<button class="fchip" type="button" data-fchip="priority" data-val="${p}" aria-pressed="false">${T(LABELS.priority[p])}</button>`).join("")}</div>
    <div class="fgroup"><span class="lbl">${T(T2("النوع", "Kind"))}</span>${Object.keys(LABELS.kind).filter(k => s.kind[k]).map(k => `<button class="fchip" type="button" data-fchip="kind" data-val="${k}" aria-pressed="false">${T(LABELS.kind[k])}</button>`).join("")}<button class="fchip" type="button" id="f-inferred" aria-pressed="false">${icon("circle-help", 14)}${T(T2("مستنتج", "Inferred"))}</button></div>
    <div class="fgroup"><label><span class="sr">${T(T2("الوحدة", "Module"))}</span><select class="fsel" id="f-module"><option value="">${T(T2("كل الوحدات", "All modules"))}</option>${m.modules.map(x => `<option value="${x.id}">${x.id} · ${esc(x.title.ar)} / ${esc(x.title.en)}</option>`).join("")}</select></label>
      <label><span class="sr">${T(T2("الدور", "Actor"))}</span><select class="fsel" id="f-actor"><option value="">${T(T2("كل الأدوار", "All actors"))}</option>${m.actors.map(a => `<option value="${a.id}">${esc(a.name.ar)} / ${esc(a.name.en)}</option>`).join("")}</select></label>
      <button class="fchip" type="button" id="openall" aria-pressed="false">${icon("chevrons-down", 14)}${T(T2("فتح التفاصيل", "Expand details"))}</button><button class="fchip" type="button" data-clear>${icon("x", 14)}${T(T2("مسح", "Clear"))}</button></div>
    <div class="resultbar">${icon("filter", 16)} <span><b id="resultcount">${s.requirements}</b> ${T(T2("متطلباً", "requirements"))}</span></div></div>
    <div class="empty">${icon("search-x", 36)}<p>${T(T2("لا متطلبات مطابقة. جرّب كلمة أخرى أو امسح المرشحات.", "No matching requirements. Try another word or clear the filters."))}</p></div>`;

  const stage = `<div class="stage" id="stage" hidden>${rtools}
    <div class="mod-layout"><aside class="mod-list" aria-label="modules">${sidebar}</aside>
      <div class="mod-main">${picker}${tiles}${m.modules.map(moduleSection).join("")}</div></div></div>`;

  const techView = `<section class="view" id="v-tech" hidden><h2 class="vh">${icon("layers", 22)}${T(m.tech.title)}</h2>${techBlock(c, m.tech)}</section>`;

  /* ── ملاحق ───────────────────────────────────────────────── */
  const trace = `<section class="view" id="v-trace" hidden><h2 class="vh">${icon("git-compare-arrows", 22)}${T(T2("مصفوفة التتبّع", "Traceability matrix"))}</h2>
    <p class="lead">${T(T2("كل وحدة مقابل ما يثبتها من كود واختبارات. الأرقام تُستخرج من المستودع في كل بناء.", "Each module against the code and tests that back it. Figures are extracted from the repository on every build."))}</p>
    <div class="card" style="padding:0;overflow:auto"><table class="tbl"><thead><tr><th>${T(T2("الوحدة", "Module"))}</th><th>${T(T2("متطلبات", "Reqs"))}</th><th>${T(T2("منفّذ", "Done"))}</th><th>${T(T2("مختبَر", "Tested"))}</th><th>${T(T2("مستنتج", "Inferred"))}</th><th>${T(T2("مسارات الخادم", "Routes"))}</th><th>${T(T2("ملفات مغطّاة", "Files covered"))}</th></tr></thead><tbody>
    ${m.modules.map(x => { const impl = x.reqs.filter(r => r.status === "implemented"), tested = impl.filter(r => (r.evidence?.tests || []).length).length; return `<tr><td><button class="fchip" type="button" data-mod="${x.id}">${icon(x.icon, 14)} ${T(x.title)}</button></td><td class="num">${x.counts.total}</td><td class="num">${impl.length}</td><td class="num">${tested}/${impl.length}</td><td class="num">${x.counts.inferred}</td><td class="num">${x.facts.endpoints}</td><td class="num">${x.facts.files}</td></tr>`; }).join("")}
    <tr><td><b>${T(T2("المجموع", "Total"))}</b></td><td class="num">${s.requirements}</td><td class="num">${s.status.implemented}</td><td class="num">${s.traced}/${s.status.implemented}</td><td class="num">${s.inferred}</td><td class="num">${f.endpoints}</td><td class="num">${f.watchedFiles}</td></tr></tbody></table></div>
    <p class="lead" style="margin-top:.8rem">${T(T2(`يغطي المستودع ${f.watchedFiles} ملفاً برمجياً (${f.loc.toLocaleString("en")} سطراً)، و${f.components} شاشة ومكوّن، و${f.endpoints} مسار خادم مرصود، و${f.tests} ملف اختبار.`, `The repository covers ${f.watchedFiles} source files (${f.loc.toLocaleString("en")} lines), ${f.components} screens and components, ${f.endpoints} detected server routes and ${f.tests} test files.`))}</p></section>`;
  const glossary = `<section class="view" id="v-glossary" hidden><h2 class="vh">${icon("book-a", 22)}${T(T2("المصطلحات", "Glossary"))}</h2>${termsBlock(c, m.glossary)}</section>`;
  const revisions = `<section class="view" id="v-revisions" hidden><h2 class="vh">${icon("history", 22)}${T(T2("سجل الإصدارات", "Revision history"))}</h2><div class="card" style="padding:0;overflow:auto"><table class="tbl"><thead><tr><th>${T(T2("الإصدار", "Version"))}</th><th>${T(T2("التاريخ", "Date"))}</th><th>${T(T2("التغييرات", "Changes"))}</th></tr></thead><tbody>${m.revisions.map(r => `<tr><td class="mono">${esc(r.version)}</td><td class="mono">${esc(r.date)}</td><td>${c.M(r.changes)}</td></tr>`).join("")}</tbody></table></div></section>`;

  const tabDefs = [["overview", "layout-dashboard", T2("نظرة عامة", "Overview"), ""], ["modules", "boxes", T2("الوحدات", "Modules"), s.modules], ["requirements", "list-checks", T2("المتطلبات", "Requirements"), s.requirements], ["actors", "users", T2("الأدوار", "Actors"), ""], ["tech", "layers", T2("التقنية", "Technology"), ""], ["trace", "git-compare-arrows", T2("التتبّع", "Traceability"), ""], ["glossary", "book-a", T2("المصطلحات", "Glossary"), ""], ["revisions", "history", T2("الإصدارات", "Revisions"), ""]];
  const authors = m.meta.authors;
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#141917">
<title>SCHEDULE · SRS</title><link rel="icon" type="image/svg+xml" href="${logoDataUri()}"><style>${css}</style></head>
<body data-view="overview">
<header class="topbar"><div class="topbar-in">
  <a class="brand" href="#/overview"><span class="mark">${logo(34)}</span><span>SCHEDULE<small>${T(m.meta.document)}</small></span></a>
  <div class="search">${icon("search", 18)}<input id="q" type="search" autocomplete="off" aria-label="search" data-ph-ar="ابحث في المتطلبات…" data-ph-en="Search requirements…"></div>
  <div class="tools">
    <button class="btn" data-lang-btn="ar" aria-pressed="true">AR</button><button class="btn" data-lang-btn="en" aria-pressed="false">EN</button>
    <button class="btn" id="theme" type="button" aria-label="theme">${icon("sun-moon", 18)}</button>
    <a class="btn primary" data-live data-live-ar="print-ar.html#print" data-live-en="print-en.html#print" href="print-ar.html#print" target="_blank" rel="noopener" title="PDF">${icon("file-down", 18)}<span class="hide-sm">PDF</span></a>
  </div></div></header>
<nav class="tabs" aria-label="sections"><div class="tabs-in" role="tablist">${tabDefs.map(([id, ic, t, n]) => `<button class="tab" type="button" role="tab" data-view="${id}" aria-selected="${id === "overview"}">${icon(ic, 17)}${T(t)}${n !== "" ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div></nav>
<main class="wrap">
  ${overview}${actors}${techView}${stage}${trace}${glossary}${revisions}
</main>
<button class="totop" id="totop" type="button" aria-label="${esc(T2("العودة إلى الأعلى", "Back to top").ar)} / ${esc(T2("العودة إلى الأعلى", "Back to top").en)}" title="↑">${icon("arrow-up", 22)}</button>
<footer class="foot"><div class="foot-in"><div class="foot-brand">${logo(44)}<div><b>${T(m.meta.system)}</b><small>${T(m.meta.document)} · v${esc(m.meta.version)} · ${esc(m.meta.releaseDate)}</small></div></div><div><b class="authors-line">${authors.map(a => T(a)).join(' <i class="dot">·</i> ')}</b><small>${T(T2("بُنيت هذه الصفحة من مصدر الوثيقة نفسه، وتتحدث مع كل نشر.", "This page is built from the document source itself and refreshes with every release."))}</small></div></div></footer>
<script>${js}</script></body></html>`;
}
