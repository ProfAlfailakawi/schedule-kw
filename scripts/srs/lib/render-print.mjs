/** نسخة PDF بلغةٍ واحدة: غلاف مستقل وجسم بفهرس وملاحق. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./common.mjs";
import { icon, logo, deco } from "./icons.mjs";
import { LABELS, STATUS_ORDER } from "./model.mjs";
import { techBlock } from "./tech.mjs";
import { usageCards, USAGE_PREFIX } from "./usage.mjs";
import { sinceMedal, historyBlock } from "./history.mjs";
import { algoCard, algoAnswer, algoIndex } from "./algorithms.mjs";
import { identityBlock, keysBlock, configBlock, routesBlock } from "./integration.mjs";
import { ctxFor, esc, md, reqCard, diagramBlock, journeyBlock, matrixBlock, screensBlock, edgeBlock, termsBlock, barRows, actorChip, statusBadge, priorityBadge } from "./fragments.mjs";

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const T2 = (ar, en) => ({ ar, en });

/** أقسام الفصل بالترتيب: نفسُها في الفهرس وشريط التنقل والمتن. */
const PART_TITLES = {
  overview: T2("نظرة عامة", "Overview"), journeys: T2("رحلات المستخدمين", "User journeys"), diagrams: T2("المخططات", "Diagrams"),
  screens: T2("الشاشات", "Screens"), reqs: T2("المتطلبات", "Requirements"), algos: T2("الخوارزميات", "Algorithms"), edges: T2("الحالات الحدية", "Edge cases"), rules: T2("قرارات المالك الثابتة", "Standing owner decisions"),
};
const presentParts = x => ["overview", x.journeys?.length && "journeys", (x.diagrams?.length || x.matrix) && "diagrams", x.screens?.length && "screens", "reqs", x.algos?.length && "algos", x.edgeCases?.length && "edges", x.ownerRules?.length && "rules"].filter(Boolean);

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
    ...m.modules.flatMap(x => [{ mk: `M${x.id}`, n: `3.${x.index}`, title: L(x.title), lvl: 2 }, ...presentParts(x).map((k, i) => ({ mk: `S${x.id}${i + 1}`, n: `3.${x.index}.${i + 1}`, title: L(PART_TITLES[k]), lvl: 3 }))]),
    { mk: "APPX", n: "A", title: L(T2("ملحق التتبّع وفهرس المتطلبات", "Appendix A: Traceability and requirement index")), lvl: 1 },
    { mk: "INFER", n: "B", title: L(T2("ملحق المتطلبات المستنتجة للتأكيد", "Appendix B: Inferred requirements for confirmation")), lvl: 1 },
    { mk: "GLOSS", n: "C", title: L(T2("ملحق المصطلحات", "Appendix C: Glossary")), lvl: 1 },
    { mk: "REV", n: "D", title: L(T2("ملحق سجل الإصدارات", "Appendix D: Revision history")), lvl: 1 },
    { mk: "INTEG", n: "E", title: L(T2("ملحق التكامل والتشغيل", "Appendix E: Integration and operation")), lvl: 1 },
    { mk: "INTEG1", n: "E.1", title: L(m.integration.identity.title), lvl: 2 },
    { mk: "INTEG2", n: "E.2", title: L(m.integration.keys.title), lvl: 2 },
    { mk: "INTEG3", n: "E.3", title: L(m.integration.config.title), lvl: 2 },
    { mk: "INTEG4", n: "E.4", title: L(m.integration.routes.title), lvl: 2 },
  ];
  return items;
}

export function renderPrint(m, lang, { pages = {}, fontsUrl = "/fonts/", live = false } = {}) {
  const c = ctxFor(lang, { print: true });
  const L = o => o[lang];
  const css = read("scripts/srs/theme/base.css") + read("scripts/srs/theme/print.css");
  const s = m.stats, f = m.facts.totals;
  const mk = () => "";
  const up = `<a class="up" href="#sec-CTRL">↑ ${L(T2("المحتويات", "Contents"))}</a>`;
  const sub = (no, titleObj, inner) => `<div class="sub"><h3><span class="no">${no}</span>${L(titleObj)}</h3>${inner}</div>`;
  const paras = arr => arr.map(p => `<p>${md(p)}</p>`).join("");
  const lis = arr => `<ul>${arr.map(p => `<li>${md(p)}</li>`).join("")}</ul>`;
  const bold = t => `<b>${t}</b>`;

  /* الغلاف */
  const coverBody = `<div class="cover">${deco("cover-deco")}<div class="cover-top"><div class="mark">${logo(120)}</div>${sinceMedal(c, m, "cover-medal")}</div>
    <div><div class="kick">${icon("scroll-text", 18)} ${L(m.meta.document)} · ${esc(m.meta.standard)}</div><h1>${L(m.meta.system)}</h1>
    <p class="sub2">${L(T2("ما يجب أن يقدمه النظام، ولمن، وبأي ضمانات.", "What the system must provide, for whom, and under which guarantees."))}</p>
    <div class="meta"><span>v${esc(m.meta.version)}</span><span>${esc(m.meta.releaseDate)}</span><span>${lang === "ar" ? "العربية" : "English"}</span></div>
    <div class="chips-row"><div><b>${s.requirements}</b><span>${L(T2("متطلباً", "Requirements"))}</span></div><div><b>${s.modules}</b><span>${L(T2("وحدة", "Modules"))}</span></div><div><b>${f.endpoints}</b><span>${L(T2("مسار خادم", "Server routes"))}</span></div><div><b>${f.tests}</b><span>${L(T2("ملف اختبار", "Test files"))}</span></div></div></div>
    <div class="authors"><div><b>${m.meta.authors.map(a => L(a)).join(' <i class="dot">·</i> ')}</b><small>${L(T2("إعداد", "Prepared by"))}</small></div></div></div>`;
  const coverCss = read("scripts/srs/theme/base.css") + read("scripts/srs/theme/print.css") + "@page{margin:0}html,body{margin:0;padding:0}";
  const cover = `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>${coverCss.replaceAll("{{FONTS}}", fontsUrl)}</style></head><body>${coverBody}</body></html>`;

  const ol = outline(m, lang);
  const tocRows = ol.filter(i => i.lvl <= 2).map(i => `<a class="toc-row l${i.lvl}" href="#sec-${i.mk}"><span class="n">${i.n}</span><span class="t">${esc(i.title)}</span><span class="dots"></span><span class="pg">${pages[i.mk] ?? "·"}</span></a>`).join("");

  const control = `<section class="part" id="sec-CTRL">${mk("CTRL")}<h2 class="ph">${icon("clipboard-list", 26)} ${L(T2("ضبط الوثيقة", "Document control"))}</h2>
    <div class="ctrl"><b>${L(T2("النظام", "System"))}</b><span>${L(m.meta.system)}</span><b>${L(T2("الوثيقة", "Document"))}</b><span>${L(m.meta.document)}</span><b>${L(T2("المعيار", "Standard"))}</b><span>${esc(m.meta.standard)}</span><b>${L(T2("بدء التشغيل الفعلي", "In service since"))}</b><span>${m.usage.since}</span><b>${L(T2("الإصدار", "Version"))}</b><span>${esc(m.meta.version)}</span><b>${L(T2("التاريخ", "Date"))}</b><span>${esc(m.meta.releaseDate)}</span><b>${L(T2("الإعداد", "Prepared by"))}</b><span>${m.meta.authors.map(a => L(a)).join(" · ")}</span><b>${L(T2("بصمة المحتوى", "Content fingerprint"))}</b><span class="mono">${m.hash}</span></div>
    <h3 style="margin-top:1.2em">${L(T2("الوثيقة في أرقام", "The document in numbers"))}</h3>
    <div class="stat-row">${[[s.requirements, T2("متطلباً", "Requirements")], [s.modules, T2("وحدة", "Modules")], [`${s.implementedPct}%`, T2("منفّذ", "Implemented")], [`${s.tracedPct}%`, T2("مثبت باختبار", "Test-proven")], [f.endpoints, T2("مسار خادم", "Server routes")], [f.components, T2("شاشة ومكوّن", "Screens and components")], [f.tests, T2("ملف اختبار", "Test files")], [s.acceptance, T2("معيار قبول", "Acceptance criteria")]].map(([n, t]) => `<div><b>${n}</b><span>${L(t)}</span></div>`).join("")}</div>
    <h3>${L(T2("سجل الإصدارات", "Revision history"))}</h3>
    <table class="tbl"><thead><tr><th>${L(T2("الإصدار", "Version"))}</th><th>${L(T2("التاريخ", "Date"))}</th><th>${L(T2("التغييرات", "Changes"))}</th></tr></thead><tbody>${m.revisions.map(r => `<tr><td class="mono">${esc(r.version)}</td><td class="mono">${esc(r.date)}</td><td>${md(L(r.changes))}</td></tr>`).join("")}</tbody></table>
    <h3>${L(T2("المحتويات", "Contents"))}</h3><nav class="toc-print${live ? " toc-live" : ""}">${tocRows}</nav></section>`;

  const intro = m.front.intro;
  const part1 = `<section class="part" id="sec-INTRO">${mk("INTRO")}<h2 class="ph"><span class="no">1</span>${icon("book-open", 26)} ${L(T2("المقدمة", "Introduction"))}${up}</h2>
    ${sub("1.1", T2("الغرض", "Purpose"), paras(intro.purpose[lang]))}
    ${sub("1.2", T2("النطاق", "Scope"), paras(intro.scope[lang]))}
    ${sub("1.3", T2("الفئات المخاطَبة", "Intended audience"), lis(intro.audience[lang]))}
    ${sub("1.4", T2("اصطلاحات الوثيقة", "Document conventions"), lis(intro.conventions[lang]))}
    ${sub("1.5", T2("المراجع", "References"), `<ol>${intro.references.map(r => `<li>${esc(r[lang])}</li>`).join("")}</ol>`)}
    ${sub("1.6", T2("المصطلحات", "Definitions"), `<p>${L(T2(`يضم الملحق (ج) ${m.glossary.length} مصطلحاً بمقابليه العربي والإنجليزي.`, `Appendix C lists ${m.glossary.length} terms with their Arabic and English equivalents.`))}</p>`)}</section>`;

  const gTable = m.groups.map(g => `<div class="grp-block"><h3>${icon(g.icon, 16)}${L(g.title)}</h3><div class="tiles">${g.mods.map(x => `<a class="tile" href="#sec-M${x.id}"><span class="no">3.${x.index} · ${x.id}</span>${icon(x.icon, 20)}<b>${L(x.title)}</b><small>${L(x.tagline)}</small><div class="meter"><i style="width:${x.counts.total ? Math.round(x.counts.status.implemented / x.counts.total * 100) : 0}%"></i></div></a>`).join("")}</div></div>`).join("");
  const part2 = `<section class="part" id="sec-OVERALL">${mk("OVERALL")}<h2 class="ph"><span class="no">2</span>${icon("layers", 26)} ${L(T2("الوصف العام", "Overall description"))}${up}</h2>
    ${sub("2.1", T2("نظرة موجزة", "Summary"), `<p>${md(m.front.abstract[lang])}</p><div class="pillars">${m.front.pillars.map(p => `<div class="pillar">${icon(p.icon, 20)}<b>${L(p.title)}</b>${L(p.text)}</div>`).join("")}</div>`)}
    ${sub("2.2", T2("منظور المنتج", "Product perspective"), paras(m.front.overall.perspective[lang]))}
    ${sub("2.3", T2("تاريخ النظام واستخدامه", "History and use"), `<div class="hist-head">${sinceMedal(c, m, "doc-medal")}${historyBlock(c, m)}</div><h4 class="ustitle">${L(T2("الاستخدام بالأرقام", "Use in figures"))}</h4><p>${L(T2(`أرقام مجمّعة بلا أسماء، بحسب إدارة النظام حتى ${m.usage.asOf}؛ «حوالي» تقدير، و«أكثر من» حدٌّ أدنى. الصفحة التفاعلية تعرضها حيّةً من النظام.`, `Aggregated, anonymous figures from the system administration as of ${m.usage.asOf}; “about” is an estimate and “over” is a lower bound. The interactive page shows them live from the system.`))}</p><div class="ucards">${usageCards(m.usage).map(u => `<div class="ucard">${icon(u.icon, 16)}<small>${L(USAGE_PREFIX[u.kind])}</small><b${u.key ? ` data-usage="${u.key}"` : ""}>${u.value(lang)}</b><span>${L(u.label)}</span></div>`).join("")}</div>`)}
    ${sub("2.4", T2("البنية التقنية والتقنيات المستخدمة", "Architecture and technologies"), techBlock(c, m.tech))}
    ${m.algorithms.length ? sub("2.5", T2("كيف يحسب النظام قراراته", "How the system computes its decisions"), `${algoAnswer(c, m)}<h4 class="ustitle">${L(T2("فهرس الخوارزميات", "Algorithm index"))}</h4>${algoIndex(c, m)}`) : ""}
    ${sub("2.6", T2("خريطة الوحدات", "Module map"), gTable)}
    ${sub("2.7", T2("فئات المستخدمين", "User classes"), `<table class="tbl"><thead><tr><th>${L(T2("الدور", "Actor"))}</th><th>${L(T2("متطلبات", "Requirements"))}</th><th>${L(T2("وحدات", "Modules"))}</th></tr></thead><tbody>${m.actors.map(a => { const u = m.actorUse.get(a.id); return `<tr><td>${icon(a.icon, 14)} ${L(a.name)}</td><td class="num">${u.reqs}</td><td class="num">${u.modules.size}</td></tr>`; }).join("")}</tbody></table>`)}
    ${sub("2.8", T2("القيود التصميمية", "Design constraints"), lis(m.front.overall.constraints[lang]))}
    ${sub("2.9", T2("الافتراضات والاعتماديات", "Assumptions and dependencies"), lis(m.front.overall.assumptions[lang]))}</section>`;

  const chapter = x => {
    const builders = {
      overview: () => `<p>${md(L(x.summary))}</p><div class="req-meta">${x.actors.map(a => actorChip(c, m, a)).join("")}</div>`,
      journeys: () => x.journeys.map(j => journeyBlock(c, m, j)).join(""),
      diagrams: () => `${(x.diagrams || []).map(d => diagramBlock(c, d)).join("")}${x.matrix ? matrixBlock(c, m, x.matrix) : ""}`,
      screens: () => screensBlock(c, x.screens),
      reqs: () => x.reqs.map(r => reqCard(c, m, r)).join(""),
      algos: () => x.algos.map(a => algoCard(c, m, a)).join(""),
      edges: () => x.edgeCases.map(e => edgeBlock(c, e)).join(""),
      rules: () => lis(x.ownerRules.map(o => L(o))),
    };
    const parts = presentParts(x);
    const nav = `<nav class="chap-nav">${parts.map((k, i) => `<a href="#sub-${x.id}-${i + 1}">${i + 1}. ${L(PART_TITLES[k])}</a>`).join("")}${up}</nav>`;
    const body = parts.map((k, i) => `<div class="sub" id="sub-${x.id}-${i + 1}">${mk(`S${x.id}${i + 1}`)}<h3><span class="no">3.${x.index}.${i + 1}</span>${L(PART_TITLES[k])}</h3>${builders[k]()}</div>`).join("");
    return `<section class="part" id="sec-M${x.id}">${mk("M" + x.id)}<div class="chapter-open"><div class="big">${icon(x.icon, 30)}</div><div><small>3.${x.index} · ${x.id}</small><h2>${L(x.title)}</h2><p>${L(x.tagline)}</p></div></div>
      <div class="mini-stats"><div><b>${x.counts.total}</b><span>${L(T2("متطلب", "reqs"))}</span></div><div><b>${x.counts.total ? Math.round(x.counts.status.implemented / x.counts.total * 100) : 0}%</b><span>${L(T2("منفّذ", "done"))}</span></div><div><b>${x.facts.endpoints}</b><span>${L(T2("مسار", "routes"))}</span></div><div><b>${x.facts.files}</b><span>${L(T2("ملف", "files"))}</span></div></div>${nav}${body}<nav class="chap-nav end">${up}</nav></section>`;
  };
  const part3 = `<section class="part" id="sec-SPEC">${mk("SPEC")}<h2 class="ph"><span class="no">3</span>${icon("list-checks", 26)} ${L(T2("المتطلبات التفصيلية", "Specific requirements"))}${up}</h2>
    <p>${L(T2(`تضم هذه الأقسام ${s.modules} وحدة. لكل وحدة نظرة عامة ورحلات مستخدمين ومخططات وشاشات ومتطلبات بمعايير قبول ومراجع، ثم الحالات الحدية.`, `This part holds ${s.modules} modules. Each has an overview, user journeys, diagrams, screens, requirements with acceptance criteria and evidence, and edge cases.`))}</p>
    <div class="legend">${STATUS_ORDER.filter(st => s.status[st]).map(st => `<span>${statusBadge(c, st)}</span>`).join("")}</div>
    <div class="sub"><h3>${L(T2("الأعمال حسب الوحدة", "Requirements by module"))}</h3>${barRows(c, m.modules.map(x => ({ icon: x.icon, label: L(x.title), seg: x.counts.status, value: x.counts.total })), Math.max(...m.modules.map(x => x.counts.total), 1))}</div></section>
    ${m.modules.map(chapter).join("")}`;

  const reqRows = m.reqs.map(r => `<tr><td class="mono"><a href="#${r.id}">${r.id}</a></td><td>${esc(L(r.title))}</td><td>${L(LABELS.status[r.status])}</td><td>${L(LABELS.priority[r.priority])}</td><td class="num">${(r.evidence?.code || []).length}</td><td class="num">${(r.evidence?.tests || []).length}</td></tr>`).join("");
  const tr = `<section class="part" id="sec-APPX">${mk("APPX")}<h2 class="ph"><span class="no">A</span>${icon("git-compare-arrows", 26)} ${L(T2("التتبّع وفهرس المتطلبات", "Traceability and requirement index"))}${up}</h2>
    <table class="tbl"><thead><tr><th>${L(T2("الوحدة", "Module"))}</th><th>${L(T2("متطلبات", "Reqs"))}</th><th>${L(T2("منفّذ", "Done"))}</th><th>${L(T2("مختبَر", "Tested"))}</th><th>${L(T2("مستنتج", "Inferred"))}</th><th>${L(T2("مسارات", "Routes"))}</th><th>${L(T2("ملفات", "Files"))}</th></tr></thead><tbody>${m.modules.map(x => { const impl = x.reqs.filter(r => r.status === "implemented"); return `<tr><td><a href="#sec-M${x.id}">${L(x.title)}</a></td><td class="num">${x.counts.total}</td><td class="num">${impl.length}</td><td class="num">${impl.filter(r => (r.evidence?.tests || []).length).length}</td><td class="num">${x.counts.inferred}</td><td class="num">${x.facts.endpoints}</td><td class="num">${x.facts.files}</td></tr>`; }).join("")}</tbody></table>
    <h3 style="margin-top:1.4em">${L(T2("فهرس المتطلبات", "Requirement index"))}</h3>
    <table class="tbl"><thead><tr><th>ID</th><th>${L(T2("العنوان", "Title"))}</th><th>${L(T2("الحالة", "Status"))}</th><th>${L(T2("الأولوية", "Priority"))}</th><th>${L(T2("كود", "Code"))}</th><th>${L(T2("اختبار", "Tests"))}</th></tr></thead><tbody>${reqRows}</tbody></table></section>`;
  const inferred = m.reqs.filter(r => r.inferred);
  const infer = `<section class="part" id="sec-INFER">${mk("INFER")}<h2 class="ph"><span class="no">B</span>${icon("circle-help", 26)} ${L(T2("المتطلبات المستنتجة للتأكيد", "Inferred requirements for confirmation"))}${up}</h2>
    <p>${L(T2("استُخلصت هذه المتطلبات من سلوك الكود ولم يوجد اختبار مباشر يثبتها. تحتاج تأكيد المالك قبل اعتمادها نهائياً.", "These requirements were derived from the behaviour of the code and no direct test proves them. They need owner confirmation before final approval."))}</p>
    <table class="tbl"><thead><tr><th>ID</th><th>${L(T2("العنوان", "Title"))}</th><th>${L(T2("الوحدة", "Module"))}</th></tr></thead><tbody>${inferred.map(r => `<tr><td class="mono"><a href="#${r.id}">${r.id}</a></td><td>${esc(L(r.title))}</td><td><a href="#sec-M${r.module}">${r.module}</a></td></tr>`).join("")}</tbody></table></section>`;
  const gl = `<section class="part" id="sec-GLOSS">${mk("GLOSS")}<h2 class="ph"><span class="no">C</span>${icon("book-a", 26)} ${L(T2("المصطلحات", "Glossary"))}${up}</h2>${termsBlock(c, m.glossary)}</section>`;
  const rv = `<section class="part" id="sec-REV">${mk("REV")}<h2 class="ph"><span class="no">D</span>${icon("history", 26)} ${L(T2("سجل الإصدارات", "Revision history"))}${up}</h2><table class="tbl"><thead><tr><th>${L(T2("الإصدار", "Version"))}</th><th>${L(T2("التاريخ", "Date"))}</th><th>${L(T2("التغييرات", "Changes"))}</th></tr></thead><tbody>${m.revisions.map(r => `<tr><td class="mono">${esc(r.version)}</td><td class="mono">${esc(r.date)}</td><td>${md(L(r.changes))}</td></tr>`).join("")}</tbody></table></section>`;

  const ig = m.integration;
  const integ = `<section class="part" id="sec-INTEG">${mk("INTEG")}<h2 class="ph"><span class="no">E</span>${icon("plug", 26)} ${L(T2("التكامل والتشغيل", "Integration and operation"))}${up}</h2>
    ${[[1, ig.identity.title, identityBlock(c, m)], [2, ig.keys.title, keysBlock(c, m)], [3, ig.config.title, configBlock(c, m)], [4, ig.routes.title, routesBlock(c, m)]].map(([n, t, body]) => `<div class="sub" id="sec-INTEG${n}">${mk(`INTEG${n}`)}<h3><span class="no">E.${n}</span>${L(t)}</h3>${body}</div>`).join("")}</section>`;
  const sections = `${control}${part1}${part2}${part3}${tr}${infer}${gl}${rv}${integ}`;
  if (live) {
    const hint = `<div class="live-hint no-print"><span>${L(T2("هذه نسخة حيّة من الوثيقة تُبنى من المصدر نفسه. لحفظها PDF: اطبع واختر «حفظ بصيغة PDF» وألغِ «الرؤوس والتذييلات».", "This is a live copy built from the document source. To save it as PDF: print and choose “Save as PDF”, with “Headers and footers” off."))}</span><button type="button" onclick="window.print()">${L(T2("طباعة / حفظ PDF", "Print / Save as PDF"))}</button></div>`;
    const auto = `<script>(function(){var L=document.documentElement.lang;function f(n){if(n>=1e6){var v=(n/1e6).toFixed(1).replace(/\\.0$/,"");return L==="ar"?v+" مليون":v+" million"}return Math.round(n).toLocaleString("en-US")}
var live=(window.fetch?fetch("/api/public/audience-headline",{credentials:"omit",cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(d){if(!d)return;document.querySelectorAll("[data-usage]").forEach(function(el){var k=el.getAttribute("data-usage");if(typeof d[k]==="number")el.textContent=f(d[k])})}).catch(function(){}):Promise.resolve());
addEventListener("load",function(){if(location.hash!=="#print")return;var wait=new Promise(function(r){setTimeout(r,2500)});Promise.all([document.fonts&&document.fonts.ready||Promise.resolve(),Promise.race([live,wait])]).then(function(){setTimeout(function(){print()},300)})})})()</script>`;
    return { body: head(lang, css, fontsUrl, `${hint}${coverBody}${sections}${auto}`, "print live"), outline: ol };
  }
  const body = head(lang, css, fontsUrl, sections, "print");
  return { cover, body, outline: ol };
}
