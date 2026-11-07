/** نسخة PDF بلغةٍ واحدة: غلاف مستقل وجسم بفهرس وملاحق. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./common.mjs";
import { icon } from "./icons.mjs";
import { LABELS, STATUS_ORDER } from "./model.mjs";
import { ctxFor, esc, md, reqCard, diagramBlock, journeyBlock, matrixBlock, screensBlock, edgeBlock, termsBlock, barRows, actorChip, statusBadge, priorityBadge } from "./fragments.mjs";

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const T2 = (ar, en) => ({ ar, en });

function head(lang, css, fontsUrl, body, cls = "") {
  return `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>SCHEDULE · SRS</title><style>${css.replaceAll("{{FONTS}}", fontsUrl)}</style></head><body class="${cls}">${body}</body></html>`;
}

/** يعيد فهرس الأقسام الذي تُبنى منه صفحة المحتويات ومعلَّمات الصفحات. */
export function outline(m, lang) {
  const c = ctxFor(lang, { print: true });
  const L = o => o[lang];
  const items = [
    { mk: "CTRL", n: "", title: L(T2("ضبط الوثيقة", "Document control")), lvl: 1 },
    { mk: "INTRO", n: "1", title: L(T2("المقدمة", "Introduction")), lvl: 1 },
    { mk: "OVERALL", n: "2", title: L(T2("الوصف العام", "Overall description")), lvl: 1 },
    { mk: "SPEC", n: "3", title: L(T2("المتطلبات التفصيلية", "Specific requirements")), lvl: 1 },
    ...m.modules.map(x => ({ mk: `M${x.id}`, n: `3.${x.index}`, title: L(x.title), lvl: 2 })),
    { mk: "APPX", n: "A", title: L(T2("ملحق التتبّع وفهرس المتطلبات", "Appendix A: Traceability and requirement index")), lvl: 1 },
    { mk: "INFER", n: "B", title: L(T2("ملحق المتطلبات المستنتجة للتأكيد", "Appendix B: Inferred requirements for confirmation")), lvl: 1 },
    { mk: "GLOSS", n: "C", title: L(T2("ملحق المصطلحات", "Appendix C: Glossary")), lvl: 1 },
    { mk: "REV", n: "D", title: L(T2("ملحق سجل الإصدارات", "Appendix D: Revision history")), lvl: 1 },
  ];
  return items;
}

export function renderPrint(m, lang, { pages = {}, fontsUrl = "/fonts/" } = {}) {
  const c = ctxFor(lang, { print: true });
  const L = o => o[lang];
  const css = read("scripts/srs/theme/base.css") + read("scripts/srs/theme/print.css");
  const s = m.stats, f = m.facts.totals;
  const mk = k => `<span class="mk" aria-hidden="true">§${k}§</span>`;
  const sub = (no, titleObj, inner) => `<div class="sub"><h3><span class="no">${no}</span>${L(titleObj)}</h3>${inner}</div>`;
  const paras = arr => arr.map(p => `<p>${md(p)}</p>`).join("");
  const lis = arr => `<ul>${arr.map(p => `<li>${md(p)}</li>`).join("")}</ul>`;
  const bold = t => `<b>${t}</b>`;

  /* الغلاف */
  const coverBody = `<div class="cover"><div><div class="mark">${icon("calendar-range", 56)}</div></div>
    <div><div class="kick">${icon("scroll-text", 18)} ${L(m.meta.document)} · ${esc(m.meta.standard)}</div><h1>${L(m.meta.system)}</h1>
    <p class="sub2">${L(T2("ما يجب أن يقدمه النظام، ولمن، وبأي ضمانات.", "What the system must provide, for whom, and under which guarantees."))}</p>
    <div class="meta"><span>v${esc(m.meta.version)}</span><span>${esc(m.meta.releaseDate)}</span><span>${lang === "ar" ? "العربية" : "English"}</span></div>
    <div class="chips-row"><div><b>${s.requirements}</b><span>${L(T2("متطلباً", "Requirements"))}</span></div><div><b>${s.modules}</b><span>${L(T2("وحدة", "Modules"))}</span></div><div><b>${f.endpoints}</b><span>${L(T2("مسار خادم", "Server routes"))}</span></div><div><b>${f.tests}</b><span>${L(T2("ملف اختبار", "Test files"))}</span></div></div></div>
    <div class="authors">${m.meta.authors.map(a => `<div><b>${L(a)}</b><small>${L(T2("إعداد", "Prepared by"))}</small></div>`).join("")}</div></div>`;
  const coverCss = read("scripts/srs/theme/base.css") + read("scripts/srs/theme/print.css") + "@page{margin:0}html,body{margin:0;padding:0}";
  const cover = `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>${coverCss.replaceAll("{{FONTS}}", fontsUrl)}</style></head><body>${coverBody}</body></html>`;

  const ol = outline(m, lang);
  const tocRows = ol.map(i => `<a class="toc-row l${i.lvl}" href="#sec-${i.mk}"><span class="n">${i.n}</span><span class="t">${esc(i.title)}</span><span class="dots"></span><span class="pg">${pages[i.mk] ?? "·"}</span></a>`).join("");

  const control = `<section class="part" id="sec-CTRL">${mk("CTRL")}<h2 class="ph">${icon("clipboard-list", 26)} ${L(T2("ضبط الوثيقة", "Document control"))}</h2>
    <div class="ctrl"><b>${L(T2("النظام", "System"))}</b><span>${L(m.meta.system)}</span><b>${L(T2("الوثيقة", "Document"))}</b><span>${L(m.meta.document)}</span><b>${L(T2("المعيار", "Standard"))}</b><span>${esc(m.meta.standard)}</span><b>${L(T2("الإصدار", "Version"))}</b><span>${esc(m.meta.version)}</span><b>${L(T2("التاريخ", "Date"))}</b><span>${esc(m.meta.releaseDate)}</span><b>${L(T2("الإعداد", "Prepared by"))}</b><span>${m.meta.authors.map(a => L(a)).join(" · ")}</span><b>${L(T2("بصمة المحتوى", "Content fingerprint"))}</b><span class="mono">${m.hash}</span></div>
    <h3 style="margin-top:1.2em">${L(T2("الوثيقة في أرقام", "The document in numbers"))}</h3>
    <div class="stat-row">${[[s.requirements, T2("متطلباً", "Requirements")], [s.modules, T2("وحدة", "Modules")], [`${s.implementedPct}%`, T2("منفّذ", "Implemented")], [`${s.tracedPct}%`, T2("مثبت باختبار", "Test-proven")], [f.endpoints, T2("مسار خادم", "Server routes")], [f.components, T2("شاشة ومكوّن", "Screens and components")], [f.tests, T2("ملف اختبار", "Test files")], [s.acceptance, T2("معيار قبول", "Acceptance criteria")]].map(([n, t]) => `<div><b>${n}</b><span>${L(t)}</span></div>`).join("")}</div>
    <h3>${L(T2("سجل الإصدارات", "Revision history"))}</h3>
    <table class="tbl"><thead><tr><th>${L(T2("الإصدار", "Version"))}</th><th>${L(T2("التاريخ", "Date"))}</th><th>${L(T2("التغييرات", "Changes"))}</th></tr></thead><tbody>${m.revisions.map(r => `<tr><td class="mono">${esc(r.version)}</td><td class="mono">${esc(r.date)}</td><td>${md(L(r.changes))}</td></tr>`).join("")}</tbody></table>
    <h3>${L(T2("المحتويات", "Contents"))}</h3><nav class="toc-print">${tocRows}</nav></section>`;

  const intro = m.front.intro;
  const part1 = `<section class="part" id="sec-INTRO">${mk("INTRO")}<h2 class="ph"><span class="no">1</span>${icon("book-open", 26)} ${L(T2("المقدمة", "Introduction"))}</h2>
    ${sub("1.1", T2("الغرض", "Purpose"), paras(intro.purpose[lang]))}
    ${sub("1.2", T2("النطاق", "Scope"), paras(intro.scope[lang]))}
    ${sub("1.3", T2("الفئات المخاطَبة", "Intended audience"), lis(intro.audience[lang]))}
    ${sub("1.4", T2("اصطلاحات الوثيقة", "Document conventions"), lis(intro.conventions[lang]))}
    ${sub("1.5", T2("المراجع", "References"), `<ol>${intro.references.map(r => `<li>${esc(r[lang])}</li>`).join("")}</ol>`)}
    ${sub("1.6", T2("المصطلحات", "Definitions"), `<p>${L(T2(`يضم الملحق (ج) ${m.glossary.length} مصطلحاً بمقابليه العربي والإنجليزي.`, `Appendix C lists ${m.glossary.length} terms with their Arabic and English equivalents.`))}</p>`)}</section>`;

  const gTable = m.groups.map(g => `<div class="grp-block"><h3>${icon(g.icon, 16)}${L(g.title)}</h3><div class="tiles">${g.mods.map(x => `<div class="tile"><span class="no">3.${x.index} · ${x.id}</span>${icon(x.icon, 20)}<b>${L(x.title)}</b><small>${L(x.tagline)}</small><div class="meter"><i style="width:${x.counts.total ? Math.round(x.counts.status.implemented / x.counts.total * 100) : 0}%"></i></div></div>`).join("")}</div></div>`).join("");
  const part2 = `<section class="part" id="sec-OVERALL">${mk("OVERALL")}<h2 class="ph"><span class="no">2</span>${icon("layers", 26)} ${L(T2("الوصف العام", "Overall description"))}</h2>
    ${sub("2.1", T2("نظرة موجزة", "Summary"), `<p>${md(m.front.abstract[lang])}</p><div class="pillars">${m.front.pillars.map(p => `<div class="pillar">${icon(p.icon, 20)}<b>${L(p.title)}</b>${L(p.text)}</div>`).join("")}</div>`)}
    ${sub("2.2", T2("منظور المنتج", "Product perspective"), paras(m.front.overall.perspective[lang]))}
    ${sub("2.3", T2("خريطة الوحدات", "Module map"), gTable)}
    ${sub("2.4", T2("فئات المستخدمين", "User classes"), `<table class="tbl"><thead><tr><th>${L(T2("الدور", "Actor"))}</th><th>${L(T2("متطلبات", "Requirements"))}</th><th>${L(T2("وحدات", "Modules"))}</th></tr></thead><tbody>${m.actors.map(a => { const u = m.actorUse.get(a.id); return `<tr><td>${icon(a.icon, 14)} ${L(a.name)}</td><td class="num">${u.reqs}</td><td class="num">${u.modules.size}</td></tr>`; }).join("")}</tbody></table>`)}
    ${sub("2.5", T2("القيود التصميمية", "Design constraints"), lis(m.front.overall.constraints[lang]))}
    ${sub("2.6", T2("الافتراضات والاعتماديات", "Assumptions and dependencies"), lis(m.front.overall.assumptions[lang]))}</section>`;

  const chapter = x => {
    const b = [];
    b.push(`<div class="sub"><h3><span class="no">3.${x.index}.1</span>${L(T2("نظرة عامة", "Overview"))}</h3><p>${md(L(x.summary))}</p><div class="req-meta">${x.actors.map(a => actorChip(c, m, a)).join("")}</div></div>`);
    if (x.journeys?.length) b.push(`<div class="sub"><h3><span class="no">3.${x.index}.2</span>${L(T2("رحلات المستخدمين", "User journeys"))}</h3>${x.journeys.map(j => journeyBlock(c, m, j)).join("")}</div>`);
    if (x.diagrams?.length || x.matrix) b.push(`<div class="sub"><h3><span class="no">3.${x.index}.3</span>${L(T2("المخططات", "Diagrams"))}</h3>${(x.diagrams || []).map(d => diagramBlock(c, d)).join("")}${x.matrix ? matrixBlock(c, m, x.matrix) : ""}</div>`);
    if (x.screens?.length) b.push(`<div class="sub"><h3><span class="no">3.${x.index}.4</span>${L(T2("الشاشات", "Screens"))}</h3>${screensBlock(c, x.screens)}</div>`);
    b.push(`<div class="sub"><h3><span class="no">3.${x.index}.5</span>${L(T2("المتطلبات", "Requirements"))}</h3>${x.reqs.map(r => reqCard(c, m, r)).join("")}</div>`);
    if (x.edgeCases?.length) b.push(`<div class="sub"><h3><span class="no">3.${x.index}.6</span>${L(T2("الحالات الحدية", "Edge cases"))}</h3>${x.edgeCases.map(e => edgeBlock(c, e)).join("")}</div>`);
    if (x.ownerRules?.length) b.push(`<div class="sub"><h3><span class="no">3.${x.index}.7</span>${L(T2("قرارات المالك الثابتة", "Standing owner decisions"))}</h3>${lis(x.ownerRules.map(o => L(o)))}</div>`);
    return `<section class="part" id="sec-M${x.id}">${mk("M" + x.id)}<div class="chapter-open"><div class="big">${icon(x.icon, 30)}</div><div><small>3.${x.index} · ${x.id}</small><h2>${L(x.title)}</h2><p>${L(x.tagline)}</p></div></div>
      <div class="mini-stats"><div><b>${x.counts.total}</b><span>${L(T2("متطلب", "reqs"))}</span></div><div><b>${x.counts.total ? Math.round(x.counts.status.implemented / x.counts.total * 100) : 0}%</b><span>${L(T2("منفّذ", "done"))}</span></div><div><b>${x.facts.endpoints}</b><span>${L(T2("مسار", "routes"))}</span></div><div><b>${x.facts.files}</b><span>${L(T2("ملف", "files"))}</span></div></div>${b.join("")}</section>`;
  };
  const part3 = `<section class="part" id="sec-SPEC">${mk("SPEC")}<h2 class="ph"><span class="no">3</span>${icon("list-checks", 26)} ${L(T2("المتطلبات التفصيلية", "Specific requirements"))}</h2>
    <p>${L(T2(`تضم هذه الأقسام ${s.modules} وحدة. لكل وحدة نظرة عامة ورحلات مستخدمين ومخططات وشاشات ومتطلبات بمعايير قبول ومراجع، ثم الحالات الحدية.`, `This part holds ${s.modules} modules. Each has an overview, user journeys, diagrams, screens, requirements with acceptance criteria and evidence, and edge cases.`))}</p>
    <div class="legend"><span>${statusBadge(c, "implemented")}</span><span>${statusBadge(c, "in-progress")}</span><span>${statusBadge(c, "planned")}</span></div>
    <div class="sub"><h3>${L(T2("الأعمال حسب الوحدة", "Requirements by module"))}</h3>${barRows(c, m.modules.map(x => ({ icon: x.icon, label: L(x.title), seg: x.counts.status, value: x.counts.total })), Math.max(...m.modules.map(x => x.counts.total), 1))}</div></section>
    ${m.modules.map(chapter).join("")}`;

  const reqRows = m.reqs.map(r => `<tr><td class="mono"><a href="#${r.id}">${r.id}</a></td><td>${esc(L(r.title))}</td><td>${L(LABELS.status[r.status])}</td><td>${L(LABELS.priority[r.priority])}</td><td class="num">${(r.evidence?.code || []).length}</td><td class="num">${(r.evidence?.tests || []).length}</td></tr>`).join("");
  const tr = `<section class="part" id="sec-APPX">${mk("APPX")}<h2 class="ph"><span class="no">A</span>${icon("git-compare-arrows", 26)} ${L(T2("التتبّع وفهرس المتطلبات", "Traceability and requirement index"))}</h2>
    <table class="tbl"><thead><tr><th>${L(T2("الوحدة", "Module"))}</th><th>${L(T2("متطلبات", "Reqs"))}</th><th>${L(T2("منفّذ", "Done"))}</th><th>${L(T2("مختبَر", "Tested"))}</th><th>${L(T2("مستنتج", "Inferred"))}</th><th>${L(T2("مسارات", "Routes"))}</th><th>${L(T2("ملفات", "Files"))}</th></tr></thead><tbody>${m.modules.map(x => { const impl = x.reqs.filter(r => r.status === "implemented"); return `<tr><td>${L(x.title)}</td><td class="num">${x.counts.total}</td><td class="num">${impl.length}</td><td class="num">${impl.filter(r => (r.evidence?.tests || []).length).length}</td><td class="num">${x.counts.inferred}</td><td class="num">${x.facts.endpoints}</td><td class="num">${x.facts.files}</td></tr>`; }).join("")}</tbody></table>
    <h3 style="margin-top:1.4em">${L(T2("فهرس المتطلبات", "Requirement index"))}</h3>
    <table class="tbl"><thead><tr><th>ID</th><th>${L(T2("العنوان", "Title"))}</th><th>${L(T2("الحالة", "Status"))}</th><th>${L(T2("الأولوية", "Priority"))}</th><th>${L(T2("كود", "Code"))}</th><th>${L(T2("اختبار", "Tests"))}</th></tr></thead><tbody>${reqRows}</tbody></table></section>`;
  const inferred = m.reqs.filter(r => r.inferred);
  const infer = `<section class="part" id="sec-INFER">${mk("INFER")}<h2 class="ph"><span class="no">B</span>${icon("circle-help", 26)} ${L(T2("المتطلبات المستنتجة للتأكيد", "Inferred requirements for confirmation"))}</h2>
    <p>${L(T2("استُخلصت هذه المتطلبات من سلوك الكود ولم يوجد اختبار مباشر يثبتها. تحتاج تأكيد المالك قبل اعتمادها نهائياً.", "These requirements were derived from the behaviour of the code and no direct test proves them. They need owner confirmation before final approval."))}</p>
    <table class="tbl"><thead><tr><th>ID</th><th>${L(T2("العنوان", "Title"))}</th><th>${L(T2("الوحدة", "Module"))}</th></tr></thead><tbody>${inferred.map(r => `<tr><td class="mono">${r.id}</td><td>${esc(L(r.title))}</td><td>${r.module}</td></tr>`).join("")}</tbody></table></section>`;
  const gl = `<section class="part" id="sec-GLOSS">${mk("GLOSS")}<h2 class="ph"><span class="no">C</span>${icon("book-a", 26)} ${L(T2("المصطلحات", "Glossary"))}</h2>${termsBlock(c, m.glossary)}</section>`;
  const rv = `<section class="part" id="sec-REV">${mk("REV")}<h2 class="ph"><span class="no">D</span>${icon("history", 26)} ${L(T2("سجل الإصدارات", "Revision history"))}</h2><table class="tbl"><thead><tr><th>${L(T2("الإصدار", "Version"))}</th><th>${L(T2("التاريخ", "Date"))}</th><th>${L(T2("التغييرات", "Changes"))}</th></tr></thead><tbody>${m.revisions.map(r => `<tr><td class="mono">${esc(r.version)}</td><td class="mono">${esc(r.date)}</td><td>${md(L(r.changes))}</td></tr>`).join("")}</tbody></table></section>`;

  const body = head(lang, css, fontsUrl, `${control}${part1}${part2}${part3}${tr}${infer}${gl}${rv}`, "print");
  return { cover, body, outline: ol };
}
