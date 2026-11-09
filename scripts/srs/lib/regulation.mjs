/**
 * تطبيق اللائحة: القواعد ومكتبة الأنماط والفحوص والاعتمادات وأين تُطبَّق.
 * السرد من docs/srs/regulation.json، والأرقام من docs/srs/regulation.snapshot.json التي تكتبها
 * scripts/srs/regulation-snapshot.ts من src/utils/scheduleRegulations.ts نفسها (npm run srs:sync)،
 * ويحرس tests/srs-regulation-sync-audit.ts أن اللقطة لا تتأخر عن الكود. والتحقق هنا يحرس أن السرد
 * لا يتأخر عن اللقطة: كل رقمٍ يقتبسه النص يُقارن بها، وكل بندٍ مراجعةٍ في الكود موصوف.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, SRS_DIR, readJson, trackedFiles, stripRef } from "./common.mjs";
import { icon } from "./icons.mjs";

export const REGULATION_FILE = "docs/srs/regulation.json";
export const REGULATION_SNAPSHOT = "docs/srs/regulation.snapshot.json";
export const regulationFiles = () => [REGULATION_FILE, REGULATION_SNAPSHOT];

const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const T2 = (ar, en) => ({ ar, en });

export const EFFECT = {
  block: { icon: "octagon-x", ar: "يمنع", en: "Blocks" },
  warn: { icon: "triangle-alert", ar: "ينبّه", en: "Warns" },
  review: { icon: "eye", ar: "للمراجعة", en: "Review" },
  exception: { icon: "file-pen-line", ar: "استثناء", en: "Exception" },
  note: { icon: "info", ar: "ملاحظة", en: "Note" },
  auto: { icon: "circle-check", ar: "تلقائي", en: "Automatic" },
  none: { icon: "minus", ar: "—", en: "—" },
};
const SEVERITY = { high: T2("عالية", "High"), medium: T2("متوسطة", "Medium"), low: T2("منخفضة", "Low") };
const OUTCOME = {
  400: { icon: "octagon-x", tone: "block", title: T2("يُرفض بـ400", "Refused with 400"), sub: T2("تحقّق الشكل والساعات", "Shape and hours validation") },
  409: { icon: "octagon-x", tone: "block", title: T2("يُرفض بـ409", "Refused with 409"), sub: T2("تعارضٌ أو قفل", "A conflict or a lock") },
  soft: { icon: "message-circle", tone: "warn", title: T2("يُقال ولا يمنع", "Said, never blocks"), sub: T2("ملاحظة لينة مع الرد", "A soft note with the reply") },
};
const DAY_AR = { fsunday: "أحد", fmonday: "اثنين", ftuesday: "ثلاثاء", fwednesday: "أربعاء", fthursday: "خميس" };
const DAY_EN = { fsunday: "Sun", fmonday: "Mon", ftuesday: "Tue", fwednesday: "Wed", fthursday: "Thu" };
const DAY_FULL_EN = { fsunday: "Sunday", fmonday: "Monday", ftuesday: "Tuesday", fwednesday: "Wednesday", fthursday: "Thursday" };
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
const toMin = v => { const [h, m] = String(v).split(":").map(Number); return h * 60 + m; };

export function loadRegulation() {
  const data = readJson(path.join(SRS_DIR, "regulation.json"));
  const snapFile = path.join(ROOT, REGULATION_SNAPSHOT);
  if (!fs.existsSync(snapFile)) throw new Error(`لا ${REGULATION_SNAPSHOT} — شغّل npm run srs:sync`);
  return { ...data, snap: readJson(snapFile) };
}

/** الأرقامُ التي يقتبسها السرد في نصوصه: إن تغيّرت في الكود فالنصُّ يُراجَع قبل أن يُبنى. */
function quotedFigures(s) {
  const day = k => s.days.find(d => d.key === k);
  return [
    ["طول محاضرة الأحد والثلاثاء والخميس", s.lectureMinutes.short, 50],
    ["طول محاضرة الاثنين والأربعاء", s.lectureMinutes.long, 80],
    ["الفاصل بين المحاضرتين", new Set(s.days.map(d => d.gapMinutes)).size === 1 ? s.days[0].gapMinutes : -1, 10],
    ["خطوة سُلّم الأحد", day("fsunday").ladderStep, 60],
    ["خطوة سُلّم الاثنين", day("fmonday").ladderStep, 90],
    ["أول بداية", s.days.every(d => d.firstStart === "08:00") ? "08:00" : "?", "08:00"],
    ["بداية اليوم الجامعي", s.teachingDay.from, "08:00"],
    ["نهاية اليوم الجامعي", s.teachingDay.to, "20:00"],
    ["سقف 3 ساعات", s.weeklyCap.byHours.find(h => h.hours === 3)?.max, 165],
    ["حدّ المتتالي فوق الساعة", s.consecutive.maxLongInRow, 2],
    ["حدّ المتتالي بساعة", s.consecutive.maxOneHourInRow, 3],
    ["ما يُعدّ فوق الساعة", s.consecutive.longLectureOverMinutes, 60],
    ["فاصل التتابع", s.consecutive.consecutiveGapMinutes, 15],
    ["أدنى حصة صباحية", s.periodBalance.morningShare.min, 50],
    ["أعلى حصة صباحية", s.periodBalance.morningShare.max, 70],
    ["نهاية الفترة الصباحية", s.periodBalance.morning.to, "14:00"],
    ["عدد أنماط المكتبة", s.library.reduce((n, g) => n + g.patterns.length, 0), 17],
  ];
}

export function validateRegulation(m) {
  const g = m.regulation, s = g.snap, errs = [], files = new Set(trackedFiles());
  const ids = new Set(m.reqs.map(r => r.id)), algos = new Set(m.algorithms.map(a => a.id));
  const places = new Set(g.places.map(p => p.id));
  if (g.decision.ar !== s.decisionLabel) errs.push(`اسم القرار «${g.decision.ar}» ≠ ما تعرضه الشاشات «${s.decisionLabel}»`);
  for (const [what, got, want] of quotedFigures(s)) if (got !== want) errs.push(`السرد يقتبس ${what} = ${want} والكود الآن ${got}: حدّث docs/srs/regulation.json`);
  const refs = [...g.evidence, ...g.library.evidence, ...g.approvals.evidence, ...g.approvals.score.evidence,
    ...g.rules.items.flatMap(r => r.evidence || []), ...g.checks.save.flatMap(r => r.evidence || []),
    ...g.approvals.actions.flatMap(a => a.evidence || []), ...g.where.points.flatMap(p => p.evidence || [])];
  for (const ref of refs) {
    const file = stripRef(ref), sym = String(ref).includes("#") ? String(ref).split("#")[1] : "";
    if (!files.has(file)) { errs.push(`مرجع غير موجود: ${ref}`); continue; }
    if (sym && !read(file).includes(sym)) errs.push(`الرمز «${sym}» ليس في ${file}`);
  }
  const reqLists = [g.library.reqs, g.approvals.reqs, g.approvals.commonReqs, g.approvals.score.reqs, ...g.rules.items.map(r => r.reqs), ...g.checks.review.map(r => r.reqs),
    ...g.checks.save.map(r => r.reqs), ...g.approvals.actions.map(a => a.reqs), ...g.approvals.deadlines.items.map(d => d.reqs), ...g.where.points.map(p => p.reqs)];
  for (const list of reqLists) for (const id of list || []) if (!ids.has(id)) errs.push(`متطلب غير موجود: ${id}`);
  for (const id of [...g.library.algos || [], ...g.rules.items.flatMap(r => r.algos || [])]) if (!algos.has(id)) errs.push(`خوارزمية غير موجودة: ${id}`);
  for (const r of g.rules.items) {
    for (const p of places) if (!EFFECT[r.effects?.[p]]) errs.push(`القاعدة ${r.id}: أثرٌ غير معروف في ${p}: ${r.effects?.[p]}`);
    for (const k of Object.keys(r.effects || {})) if (!places.has(k)) errs.push(`القاعدة ${r.id}: بابٌ غير معروف ${k}`);
  }
  const codeRules = new Map(s.findings.map(f => [f.rule, f]));
  for (const c of g.checks.review) {
    const f = codeRules.get(c.rule);
    if (!f) { errs.push(`بند مراجعة لا يكتبه الكود: ${c.rule}`); continue; }
    if (c.article.ar !== f.article) errs.push(`مادة البند ${c.rule}: «${c.article.ar}» والكود «${f.article}»`);
  }
  for (const rule of codeRules.keys()) if (!g.checks.review.some(c => c.rule === rule)) errs.push(`بند يكتبه reviewSchedule ولا تصفه الوثيقة: ${rule}`);
  for (const c of g.checks.save) if (!OUTCOME[c.outcome]) errs.push(`نتيجة حفظ غير معروفة: ${c.id} ${c.outcome}`);
  const actors = [...g.approvals.stages.map(x => x.actor), ...g.approvals.actions.flatMap(a => a.actors), ...g.approvals.deadlines.items.map(d => d.actor)];
  for (const a of actors) if (!m.actorMap.has(a)) errs.push(`دور غير موجود: ${a}`);
  const statuses = new Set(["drafting", "committee", "head", "submitted", "returned", "accepted"]);
  for (const x of [...g.approvals.stages.map(x => x.status), ...g.approvals.loops.flatMap(l => [l.from, l.to])]) if (!statuses.has(x)) errs.push(`حالة اعتماد غير معروفة: ${x}`);
  if (!files.has("src/utils/approvalWorkflow.ts") || [...statuses].some(st => !new RegExp(`\\b${st}:\\s*"`).test(read("src/utils/approvalWorkflow.ts")))) errs.push("حالات الاعتماد الست لم تعد في APPROVAL_STATUS_LABEL");
  if (errs.length) throw new Error(`تطبيق اللائحة:\n  ${errs.join("\n  ")}`);
}

/* ── مقاطع مشتركة ─────────────────────────────────────────────────────────── */
const ev = (c, refs) => (refs || []).length
  ? (c.print ? `<div class="ev rg-evp">${refs.map(p => `<code>${esc(p)}</code>`).join("")}</div>`
    : `<details class="rg-ev"><summary>${icon("code-xml", 14)}${c.T(T2("الدليل في الكود", "Evidence in code"))}</summary><div class="ev">${refs.map(p => `<code>${esc(p)}</code>`).join("")}</div></details>`)
  : "";
const reqLinks = (ids, algos = []) => (ids || []).length || algos.length ? `<div class="areqs rg-reqs">${[...(ids || []), ...algos].map(id => `<a class="hreq" href="#${id}">${id}</a>`).join("")}</div>` : "";
const effBadge = (c, k, short = false) => `<span class="rg-b eff-${k}" title="${esc(EFFECT[k].ar)} / ${esc(EFFECT[k].en)}">${icon(EFFECT[k].icon, 13)}${k === "none" ? "" : `<span class="rg-bt${short ? " sm-hide" : ""}">${c.T(EFFECT[k])}</span>`}</span>`;
const sevBadge = (c, k) => `<span class="rg-sev sev-${k}"><i></i>${c.T(SEVERITY[k])}</span>`;
const arrow = c => c.mode === "dual" ? `<span class="ar">${icon("arrow-left", 15)}</span><span class="en">${icon("arrow-right", 15)}</span>` : icon(c.mode === "ar" ? "arrow-left" : "arrow-right", 14);
const actorChip = (c, m, id) => { const a = m.actorMap.get(id); return a ? `<span class="chip">${icon(a.icon, 13)}${c.T(a.name)}</span>` : ""; };
const dayName = d => T2(DAY_AR[d], DAY_EN[d]);
const mins = (c, n) => c.T(T2(`${n} د`, `${n} min`));

/* ── شريط اليوم: الأسرتان وسُلّماهما ───────────────────────────────────────── */
function familyStrip(c, s) {
  const from = toMin(s.teachingDay.from), to = toMin(s.teachingDay.to), span = to - from;
  const pct = v => `${((v - from) / span * 100).toFixed(3)}%`;
  const fams = ["short", "long"].map(f => {
    const days = s.days.filter(d => d.family === f), d0 = days[0];
    const names = T2(days.map(d => d.name).join(" · "), days.map(d => DAY_FULL_EN[d.key]).join(" · "));
    const blocks = d0.ladder.map(t => { const st = toMin(t), w = Math.min(d0.lectureMinutes, to - st); return `<i class="rg-lec" style="inset-inline-start:${pct(st)};width:${(w / span * 100).toFixed(3)}%"><span>${t}</span></i>`; }).join("");
    const hours = []; for (let h = from; h <= to; h += 60) hours.push(h);
    const grid = hours.map(h => `<i style="inset-inline-start:${pct(h)}"></i>`).join("");
    const axis = hours.filter(h => (h - from) % 120 === 0).map(h => `<span style="inset-inline-start:${pct(h)}">${String(h / 60).padStart(2, "0")}:00</span>`).join("");
    const zoom = `<div class="rg-zoom" aria-hidden="true"><i class="z-lec" style="flex:${d0.lectureMinutes}"><b>${mins(c, d0.lectureMinutes)}</b></i><i class="z-gap" style="flex:${d0.gapMinutes}"><b>${d0.gapMinutes}</b></i><i class="z-lec" style="flex:${d0.lectureMinutes}"><b>${mins(c, d0.lectureMinutes)}</b></i></div>`;
    const facts = [[icon("ruler", 14), T2("محاضرة", "Lecture"), mins(c, d0.lectureMinutes)], [icon("between-horizontal-start", 14), T2("فاصل", "Gap"), mins(c, d0.gapMinutes)],
      [icon("chart-no-axes-gantt", 14), T2("خطوة السُّلّم", "Ladder step"), mins(c, d0.ladderStep)], [icon("sunrise", 14), T2("أول بداية", "First start"), `<span class="mono">${d0.firstStart}</span>`]];
    return `<article class="rg-fam fam-${f}"><header><span class="rg-fdot"></span><b>${c.T(names)}</b></header>
      <div class="rg-facts">${facts.map(([ic, k, v]) => `<span>${ic}<small>${c.T(k)}</small><b>${v}</b></span>`).join("")}</div>
      <div class="rg-tl"><div class="rg-track">${grid}${blocks}</div><div class="rg-axis">${axis}</div></div>
      <div class="rg-zrow"><small>${c.T(T2("محاضرتان متتاليتان", "Two consecutive lectures"))}</small>${zoom}</div>
      <p class="rg-ladder"><small>${c.T(T2("السُّلّم", "Ladder"))}</small><span class="mono">${d0.ladder.join(" · ")}</span></p></article>`;
  }).join("");
  return `<div class="rg-fams">${fams}</div>`;
}

/* ── رسوم صغيرة داخل بطاقات القواعد ───────────────────────────────────────── */
function ruleFigure(c, g, r) {
  const s = g.snap;
  if (r.figure === "cap") return `<div class="rg-cap">${s.weeklyCap.byHours.map(h => `<span><small>${c.T(T2(`${h.hours} س`, `${h.hours} h`))}</small><b>${h.max}</b></span>`).join("")}<em>${c.T(T2("دقيقة أسبوعياً بحدٍّ أعلى", "max minutes a week"))}</em></div>`;
  if (r.figure === "balance") {
    const b = s.periodBalance.morningShare;
    return `<div class="rg-bal"><div class="rg-baltrack"><i style="inset-inline-start:${b.min}%;width:${b.max - b.min}%"></i><span style="inset-inline-start:${b.min}%">${b.min}%</span><span style="inset-inline-start:${b.max}%">${b.max}%</span></div><small>${c.T(T2(`حصة الصباح المقبولة (${s.periodBalance.morning.from}–${s.periodBalance.morning.to})، من ${s.periodBalance.minSections} مواعيد فأكثر`, `Accepted morning share (${s.periodBalance.morning.from}–${s.periodBalance.morning.to}), from ${s.periodBalance.minSections} appointments up`))}</small></div>`;
  }
  if (r.figure === "consecutive") {
    const row = (n, cls, limit, label) => `<div class="rg-run"><small>${c.T(label)}</small><span>${Array.from({ length: n }, (_, i) => `<i class="${cls}${i >= limit ? " over" : ""}"></i>`).join("")}</span></div>`;
    const k = s.consecutive;
    return `<div class="rg-runs">${row(k.maxLongInRow + 1, "long", k.maxLongInRow, T2(`فوق ${k.longLectureOverMinutes} د: ${k.maxLongInRow} حدّاً`, `Over ${k.longLectureOverMinutes} min: ${k.maxLongInRow} max`))}${row(k.maxOneHourInRow + 1, "short", k.maxOneHourInRow, T2(`ساعة: ${k.maxOneHourInRow} حدّاً`, `One hour: ${k.maxOneHourInRow} max`))}</div>`;
  }
  if (r.figure === "lengths") {
    const fam = f => s.days.find(d => d.family === f);
    return `<div class="rg-lens">${["short", "long"].map(f => `<span><small>${c.T(T2(f === "short" ? "أحد · ثلاثاء · خميس" : "اثنين · أربعاء", f === "short" ? "Sun · Tue · Thu" : "Mon · Wed"))}</small><b class="mono">${fam(f).acceptedLengths.join(" · ")}</b></span>`).join("")}<em>${c.T(T2("أطوال الصفّ بيومٍ واحد المقبولة لمقررٍ بخمس ساعات (دقيقة)", "Accepted one-day row lengths for a five-hour course (minutes)"))}</em></div>`;
  }
  return "";
}

export function rulesBlock(c, m) {
  const g = m.regulation, r = g.rules;
  const principles = `<div class="rg-princ">${g.principles.map(p => `<div>${icon(p.icon, 20)}<b>${c.T(p.title)}</b><span>${c.T(p.text)}</span></div>`).join("")}</div>`;
  const legend = `<div class="rg-legend">${["block", "warn", "review", "note", "auto"].map(k => effBadge(c, k)).join("")}</div>`;
  const cards = r.items.map(x => `<article class="rg-rule" id="rg-${x.id}"><header>${icon(x.icon, 19)}<b>${c.T(x.title)}</b>${x.article ? `<span class="rg-art">${c.T(x.article)}</span>` : ""}</header>
    <p>${c.T(x.text)}</p>${ruleFigure(c, g, x)}
    <ul class="rg-eff">${g.places.map(p => `<li><span class="rg-pl">${icon(p.icon, 13)}${c.T(p.title)}</span>${effBadge(c, x.effects[p.id])}</li>`).join("")}</ul>
    ${reqLinks(x.reqs, x.algos)}${ev(c, x.evidence)}</article>`).join("");
  return `<div class="rg"><p class="ilead">${c.T(g.lead)}</p>${principles}
    <h4 class="cfg-h">${icon("calendar-days", 17)}${c.T(T2("أسرتا الأيام: الطول والفاصل والسُّلّم", "The two day families: length, gap and ladder"))}</h4>${familyStrip(c, g.snap)}
    <h4 class="cfg-h">${icon("list-checks", 17)}${c.T(r.title)} <span class="n">${r.items.length}</span></h4><p class="ilead">${c.T(r.lead)}</p>${legend}<div class="rg-rules">${cards}</div></div>`;
}

/* ── مكتبة الأنماط ─────────────────────────────────────────────────────────── */
function patternNoteEn(p) {
  if (p.days.length === 1) return `One ${p.minutesPerDay[0]}-minute block on any day: ${p.weeklyMinutes / 50} teaching periods of 50 minutes.`;
  return `${p.days.map((d, i) => `${p.minutesPerDay[i]} min on ${DAY_FULL_EN[d]}`).join(", ")}; ${p.weeklyMinutes} teaching minutes a week.`;
}
export function libraryBlock(c, m) {
  const g = m.regulation, s = g.snap, L = g.library;
  const top = Math.max(...s.library.flatMap(x => x.patterns.flatMap(p => p.minutesPerDay)));
  const total = s.library.reduce((n, x) => n + x.patterns.length, 0);
  const card = p => {
    const one = p.days.length === 1;
    const week = DAYS.map(d => { const i = p.days.indexOf(d), v = i >= 0 ? p.minutesPerDay[i] : 0; return `<div class="rg-d${v ? " on" : ""}"><span class="rg-bar"><i style="height:${(v / top * 100).toFixed(1)}%"></i></span><b>${v || ""}</b><small>${c.T(dayName(d))}</small></div>`; }).join("");
    return `<article class="rg-pat${one ? " one" : ""}"><header><code>${esc(p.id)}</code>${one ? `<span class="rg-tag">${icon("flask-conical", 12)}${c.T(T2("كتلة · أيّ يوم", "Block · any day"))}</span>` : ""}<span class="rg-wk"><b>${p.weeklyMinutes}</b> ${c.T(T2("د تدريسية/أسبوع", "teaching min/week"))}</span></header>
      <div class="rg-week">${week}</div><p class="rg-pnote">${c.T(T2(p.note, patternNoteEn(p)))}</p></article>`;
  };
  const groups = s.library.map(x => { const cap = s.weeklyCap.byHours.find(h => h.hours === x.hours); return `<section class="rg-hgroup"><h4><span class="rg-hn">${x.hours}</span>${c.T(T2(x.hours === 1 ? "ساعة أسبوعية" : x.hours === 2 ? "ساعتان أسبوعياً" : `${x.hours} ساعات أسبوعياً`, x.hours === 1 ? "weekly hour" : "weekly hours"))}<span class="rg-hmeta">${c.T(T2(`${x.patterns.length} ${x.patterns.length === 1 ? "نمط" : x.patterns.length === 2 ? "نمطان" : "أنماط"} · السقف ${cap.max} د`, `${x.patterns.length} pattern${x.patterns.length > 1 ? "s" : ""} · ceiling ${cap.max} min`))}</span></h4><div class="rg-pats">${x.patterns.map(card).join("")}</div></section>`; }).join("");
  return `<div class="rg"><p class="ilead">${c.T(L.lead)}</p>
    <div class="rg-lstats"><span><b>${total}</b>${c.T(T2("نمطاً معتمداً", "approved patterns"))}</span><span><b>${s.library.length}</b>${c.T(T2("فئات ساعات (1–5)", "hour groups (1–5)"))}</span><span><b>${s.library.reduce((n, x) => n + x.patterns.filter(p => p.days.length === 1).length, 0)}</b>${c.T(T2("كتل يومٍ واحد", "one-day blocks"))}</span><span><b class="mono">${esc(s.weeklyCap.formula.replace("hours", "h"))}</b>${c.T(T2("سقف دقائق الأسبوع", "weekly-minutes ceiling"))}</span></div>
    ${groups}<ul class="rg-notes">${L.notes.map(n => `<li>${icon("info", 15)}<span>${c.T(n)}</span></li>`).join("")}</ul>${reqLinks(L.reqs, L.algos)}${ev(c, L.evidence)}</div>`;
}

/* ── الفحوص ────────────────────────────────────────────────────────────────── */
export function checksBlock(c, m) {
  const g = m.regulation, s = g.snap, k = g.checks;
  const byRule = new Map(s.findings.map(f => [f.rule, f]));
  const order = ["block", "review", "note"];
  const counts = order.map(e => [e, s.findings.filter(f => f.approvalEffect === e).length]);
  const gating = s.findings.filter(f => f.approvalEffect === "block" && f.source === "decision-1912").length;
  const source = f => f.source === "decision-1912" ? c.T(g.decision) : f.source === "readiness" ? c.T(T2("الجاهزية", "Readiness")) : f.source === "department" ? c.T(T2("القسم", "Department")) : c.T(T2("التاريخ", "History"));
  const bar = `<div class="rg-sum"><div class="rg-seg">${counts.map(([e, n]) => `<i class="eff-${e}" style="flex:${n}"></i>`).join("")}</div>
    <div class="rg-sumk">${counts.map(([e, n]) => `<span>${effBadge(c, e)}<b>${n}</b></span>`).join("")}<span class="rg-gate">${icon("stamp", 14)}${c.T(T2(`${gating} منها تمنع التوقيع والإرسال`, `${gating} of them stop signing and sending`))}</span></div></div>`;
  const rows = k.review.map(x => { const f = byRule.get(x.rule); return `<div class="rg-row"><div class="c-t"><b>${c.T(x.title)}</b><code>${esc(x.rule)}</code></div><div class="c-a"><span class="rg-art">${c.T(x.article)}</span><small>${source(f)}</small></div><div class="c-s">${sevBadge(c, f.severity)}</div><div class="c-e">${effBadge(c, f.approvalEffect)}</div><div class="c-d">${c.T(x.detects)}${reqLinks(x.reqs)}</div></div>`; }).join("");
  const head = `<div class="rg-row rg-rh"><div>${c.T(T2("البند", "Finding"))}</div><div>${c.T(T2("المادة والمصدر", "Article and source"))}</div><div>${c.T(T2("الشدّة", "Severity"))}</div><div>${c.T(T2("على الاعتماد", "On approval"))}</div><div>${c.T(T2("ما يكشفه", "What it detects"))}</div></div>`;
  const lanes = ["400", "409", "soft"].map(o => { const items = k.save.filter(x => x.outcome === o); const O = OUTCOME[o]; return `<section class="rg-lane lane-${O.tone}"><header>${icon(O.icon, 17)}<div><b>${c.T(O.title)}</b><small>${c.T(O.sub)}</small></div><span class="n">${items.length}</span></header><ul>${items.map(x => `<li><b>${c.T(x.title)}</b><span>${c.T(x.detects)}</span>${reqLinks(x.reqs)}${ev(c, x.evidence)}</li>`).join("")}</ul></section>`; }).join("");
  return `<div class="rg"><p class="ilead">${c.T(k.lead)}</p>
    <h4 class="cfg-h">${icon("scan-search", 17)}${c.T(k.reviewTitle)} <span class="n">${k.review.length}</span></h4><p class="ilead">${c.T(k.reviewLead)}</p>${bar}
    <div class="rg-table">${head}${rows}</div>
    <h4 class="cfg-h">${icon("door-closed", 17)}${c.T(k.saveTitle)} <span class="n">${k.save.length}</span></h4><p class="ilead">${c.T(k.saveLead)}</p><div class="rg-lanes">${lanes}</div></div>`;
}

/* ── الاعتمادات ────────────────────────────────────────────────────────────── */
export function approvalsBlock(c, m) {
  const g = m.regulation, a = g.approvals;
  const label = st => st === "returned" ? a.returnedLabel : st === "head" ? a.headLabel : a.stages.find(x => x.status === st)?.label;
  const steps = a.stages.map((x, i) => `<li class="rg-step st-${x.status}"><div class="rg-node">${icon(x.icon, 20)}<span class="rg-sn">${i + 1}</span></div><div class="rg-sb"><b>${c.T(x.label)}</b>${actorChip(c, m, x.actor)}<p>${c.T(x.action)}</p></div></li>`).join("");
  const loops = a.loops.map(l => `<li>${icon(l.icon, 16)}<span class="rg-st">${c.T(label(l.from))}</span>${arrow(c)}<span class="rg-st">${c.T(label(l.to))}</span><p>${c.T(l.label)}</p></li>`).join("");
  const actions = a.actions.map(x => `<article class="rg-act"><header>${icon(x.icon, 19)}<b>${c.T(x.title)}</b><code>${esc(x.route)}</code></header><div class="rg-actors">${x.actors.map(id => actorChip(c, m, id)).join("")}</div>
    <p>${c.T(x.effect)}</p><div class="rg-gt"><small>${icon("octagon-x", 13)}${c.T(T2("يُمنع إذا", "Refused when"))}</small><ol>${x.gates.map(gt => `<li><span>${c.T(gt.text)}</span>${gt.code ? `<code>${esc(gt.code)}</code>` : ""}</li>`).join("")}</ol></div>${reqLinks(x.reqs)}${ev(c, x.evidence)}</article>`).join("");
  const sc = a.score;
  const score = `<article class="rg-score"><header>${icon("gauge", 19)}<b>${c.T(sc.title)}</b></header><div class="rg-sc"><div class="donut" style="--p:81" data-v="81"></div><div><p class="rg-formula">${c.T(sc.formula)}</p><p class="rg-ex">${c.T(sc.example)}</p></div></div><p>${c.T(sc.text)}</p>${reqLinks(sc.reqs)}${ev(c, sc.evidence)}</article>`;
  const nb = `<article class="rg-nb"><header>${icon("circle-check", 19)}<b>${c.T(a.notBlocking.title)}</b></header><ul>${a.notBlocking.items.map(t => `<li>${icon("check", 14)}<span>${c.T(t)}</span></li>`).join("")}</ul></article>`;
  const dl = a.deadlines.items.map(d => `<li>${icon(d.icon, 18)}<div>${actorChip(c, m, d.actor)}<p>${c.T(d.text)}</p>${reqLinks(d.reqs)}</div></li>`).join("");
  return `<div class="rg"><p class="ilead">${c.T(a.lead)}</p>
    <ol class="rg-steps">${steps}</ol><p class="rg-headnote">${icon("info", 15)}<span><b>${c.T(a.headLabel)}:</b> ${c.T(a.headNote)}</span></p>
    <ul class="rg-loops">${loops}</ul>
    <h4 class="cfg-h">${icon("shield-alert", 17)}${c.T(a.gatesTitle)}</h4><div class="rg-acts">${actions}</div>
    <p class="rg-common">${icon("lock-keyhole", 15)}<span>${c.T(a.commonGates)}</span></p>${reqLinks(a.commonReqs)}
    <div class="rg-two">${nb}${score}</div>
    <h4 class="cfg-h">${icon("calendar-clock", 17)}${c.T(a.deadlines.title)}</h4><ul class="rg-dl">${dl}</ul>${reqLinks(a.reqs)}${ev(c, a.evidence)}</div>`;
}

/* ── أين تُطبَّق ────────────────────────────────────────────────────────────── */
export function whereBlock(c, m) {
  const g = m.regulation, w = g.where;
  const head = `<tr><th>${c.T(T2("القاعدة", "Rule"))}</th>${g.places.map(p => `<th>${icon(p.icon, 15)}<span>${c.T(p.title)}</span></th>`).join("")}</tr>`;
  const body = g.rules.items.map(r => `<tr><td>${icon(r.icon, 15)}<span>${c.T(r.title)}</span></td>${g.places.map(p => `<td>${effBadge(c, r.effects[p.id], true)}</td>`).join("")}</tr>`).join("");
  const legend = `<div class="rg-legend">${["block", "warn", "review", "note", "auto", "none"].map(k => `<span>${effBadge(c, k)}${k === "none" ? c.T(T2("لا يُطبَّق هنا", "Not applied here")) : ""}</span>`).join("")}</div>`;
  const pts = w.points.map(p => `<article class="rg-pt"><header>${icon(p.icon, 19)}<b>${c.T(p.screen)}</b></header><p>${c.T(p.text)}</p>${reqLinks(p.reqs)}${ev(c, p.evidence)}</article>`).join("");
  return `<div class="rg"><p class="ilead">${c.T(w.lead)}</p>${legend}<div class="rg-mx"><table class="rg-matrix"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <h4 class="cfg-h">${icon("door-open", 17)}${c.T(T2("الأبواب", "The doors"))} <span class="n">${w.points.length}</span></h4><div class="rg-pts">${pts}</div></div>`;
}

export const REG_PARTS = [
  ["rules", "list-checks", m => m.regulation.rules.title, rulesBlock],
  ["library", "library", m => m.regulation.library.title, libraryBlock],
  ["checks", "scan-search", m => m.regulation.checks.title, checksBlock],
  ["approvals", "stamp", m => m.regulation.approvals.title, approvalsBlock],
  ["where", "door-open", m => m.regulation.where.title, whereBlock],
];
