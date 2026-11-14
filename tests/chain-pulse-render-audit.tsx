/**
 * ── «حلّ بسلسلة» (الورقة) و«ميزان الطالب الحي» (نبض الطلبة): الرسم ─────────────────
 *   V  ChainSolveView: الحالاتُ الخمس (هيكل، جاهز، فراغ بسببٍ واحد، خطأ، تمّ) وأرقامٌ لاتينية.
 *   P  StudentPulse: سطرُ البطل لا يظهر إلا مع أثرٍ على الخريجين، والهيكلُ و«لا بيانات»، والشريط، والطيّ كما هو.
 *   S  الربط: الأنماطُ مسجّلة، وrun مع الحركة المخفّضة، والتركيز.
 */
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* مخزنٌ وهمي قبل استيراد المكوّنات: «نبض الطلبة» يتذكر الفتح في safeStorage. */
const store = new Map<string, string>();
(globalThis as any).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) } };

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const ARABIC_INDIC = /[٠-٩۰-۹]/;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  const { ChainSolveView } = await import("../src/components/ChainSolveSheet");
  const { default: StudentPulse } = await import("../src/components/StudentPulse");
  const { solveChain } = await import("../src/utils/chainSolve");
  const { chainImpactLine } = await import("../src/utils/chainSolve");

  /* ── V ─────────────────────────────────────────────────────────────── */
  const rows: any[] = [
    { id: 1, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 11, AdCourseName: "مقرر أ", CourseCodeSnapshot: "ABC101", SCode: "1", AdInstructorId: 5, fsunday: true, ftuesday: true, fthursday: true, fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "101", AdRoomHall: "A", buildingId: "b", roomId: "r1", locationStatus: "VERIFIED" },
    { id: 2, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 12, AdCourseName: "مقرر ب", CourseCodeSnapshot: "XYZ202", SCode: "1", AdInstructorId: 6, fsunday: true, ftuesday: true, fthursday: true, fstarttime: "13:00", fendtime: "13:50", AdRoomCode: "102", AdRoomHall: "A", buildingId: "b", roomId: "r2", locationStatus: "VERIFIED" },
  ];
  const input = { draft: { courseCode: "NEW100", courseName: "جديد", instructorId: 9, room: { code: "101", hall: "A", roomId: "r1", buildingId: "b" }, days: ["fsunday", "ftuesday", "fthursday"] as any, start: "08:00", end: "08:50" }, rows, scope: { collegeId: 1, sectionId: 1, termId: 1 } };
  const solution = solveChain(input);
  const slot = { days: input.draft.days, start: "08:00", end: "08:50", room: "101", hall: "A" };
  const ready = renderToStaticMarkup(<ChainSolveView phase="ready" solution={solution} impact={chainImpactLine({ helped: 0, harmed: 0 })} draftLabel={{ code: "NEW100", slot }} />);
  check(solution.ok && /chain-steps/.test(ready) && /ABC101/.test(ready) && /يدخل هنا/.test(ready), "V1 جاهز: بطاقةُ المقرر ثم «يدخل هنا»", text(ready).slice(0, 160));
  check((ready.match(/class="chain-step"/g) || []).length === solution.steps.length && /chain-arrow/.test(ready) && /chain-slot is-from/.test(ready) && /chain-slot is-to/.test(ready), "V2 كل خطوةٍ: شريحةُ «من» ← شريحةُ «إلى» بسهم");
  check((ready.match(/chain-week is-/g) || []).length === 2 && />قبل</.test(ready) && />بعد</.test(ready) && /chain-blk is-draft/.test(ready), "V3 أسبوعان مصغّران قبل/بعد وموعدك مظلّل");
  check(/chain-impact is-good/.test(ready) && /لا يمسّ طلبة/.test(ready) && /chain-dot/.test(ready), "V4 سطرُ أثرٍ واحد بنقطةٍ ملوّنة");
  check(/طبّق السلسلة/.test(ready) && />\s*<span>تراجع<\/span>/.test(ready.replace(/<svg.*?<\/svg>/g, "")) && /min-height|chain-btn is-primary/.test(ready), "V5 زرّا «طبّق السلسلة» و«تراجع»");
  check(new RegExp(`<b dir="ltr">${solution.steps.length}</b>`).test(ready) && /chain-ring/.test(ready), "V6 حلقةُ عدد النقلات في الرأس");
  check(/role="dialog"/.test(read("src/components/ChainSolveSheet.tsx")) && /aria-modal="true"/.test(read("src/components/ChainSolveSheet.tsx")) && /useDialogDismiss\(open/.test(read("src/components/ChainSolveSheet.tsx")) && /trapFocusRef/.test(read("src/components/ChainSolveSheet.tsx")) && /event\.key !== "Tab"/.test(read("src/hooks/useFocusTrap.ts")), "V7 حوارٌ مشروط: aria-modal وEsc وحبسُ التركيز");

  const skeleton = renderToStaticMarkup(<ChainSolveView phase="solving" solution={null} impact={null} />);
  check(/chain-skel-card/.test(skeleton) && /aria-busy="true"/.test(skeleton) && !/طبّق السلسلة/.test(skeleton), "V8 التحميل: هيكلٌ عظميٌّ بلا زرّ تطبيق");

  const stuck = solveChain({ ...input, rows: [rows[1]] });
  const empty = renderToStaticMarkup(<ChainSolveView phase="empty" solution={stuck} impact={null} />);
  check(!stuck.ok && /لا سلسلة آمنة/.test(text(empty)) && /chain-empty/.test(empty) && (empty.match(/chain-reason/g) || []).length === 1, "V9 الفراغ: أيقونةٌ وكلمةُ سببٍ واحدة", text(empty));
  const none = solveChain({ ...input, frozen: true });
  const frozen = renderToStaticMarkup(<ChainSolveView phase="empty" solution={none} impact={null} />);
  check(/الفصل مجمّد/.test(frozen) && /لا سلسلة آمنة/.test(frozen), "V10 «لا سلسلة آمنة» ومعه سببُ التجميد");
  const error = renderToStaticMarkup(<ChainSolveView phase="error" solution={null} impact={null} error="تغيّر الجدول — أعد الحلّ" onRetry={() => undefined} />);
  check(/role="alert"/.test(error) && /تغيّر الجدول/.test(error) && /أعد المحاولة/.test(error), "V11 الخطأ: تنبيهٌ وإعادة محاولة");
  const done = renderToStaticMarkup(<ChainSolveView phase="done" solution={solution} impact={null} onUndo={() => undefined} />);
  check(/تراجع عن السلسلة/.test(done) && /is-done/.test(done) && />\s*<span>تمّ<\/span>/.test(done.replace(/<svg.*?<\/svg>/g, "")), "V12 بعد التطبيق: «تمّ» و«تراجع عن السلسلة»");
  const applying = renderToStaticMarkup(<ChainSolveView phase="applying" solution={solution} impact={null} />);
  check(/aria-busy="true"/.test(applying) && /disabled/.test(applying), "V13 أثناء التطبيق: الأزرار معطّلة");
  check(![ready, skeleton, empty, frozen, error, done, applying].some(html => ARABIC_INDIC.test(html)), "V14 أرقامٌ لاتينية فقط");

  /* ── P ─────────────────────────────────────────────────────────────── */
  const side = (over: any = {}) => ({ need: 40, fit: 30, blocked: 10, percent: 75, clashes: [{ code: "MATH101", name: "تفاضل", students: 7 }, { code: "PHY102", name: "فيزياء", students: 3 }], ...over });
  const fit: any = { track: "boys", sections: { before: 2, after: 3 }, students: side(), graduates: side({ need: 12, fit: 9, blocked: 3, percent: 75, clashes: [{ code: "CS300", name: "خوارزميات", students: 3 }] }) };

  store.set("schedule-pulse-open", "on");
  const withImpact = renderToStaticMarkup(<StudentPulse fit={fit} graduateImpact={{ graduates: 12, pairs: ["CS300 × CS310"] }} />);
  check(/pulse-hero/.test(withImpact) && /يمسّ <b>12 خريجاً<\/b>/.test(withImpact) && /pulse-hero[^>]*role="alert"/.test(withImpact), "P1 سطرُ البطل الأحمر مع أثرٍ على الخريجين: «يمسّ 12 خريجاً»", text(withImpact).slice(0, 140));
  check(/CS300 × CS310/.test(withImpact) && /لا مفرّ منه/.test(withImpact), "P2 يبقى الزوجُ المتعارض وكلمةُ «لا مفرّ منه» صادقةً");
  const noImpact = renderToStaticMarkup(<StudentPulse fit={fit} graduateImpact={null} />);
  const zero = renderToStaticMarkup(<StudentPulse fit={fit} graduateImpact={{ graduates: 0 }} />);
  check(!/pulse-hero/.test(noImpact) && !/pulse-hero/.test(zero) && !/يمسّ/.test(noImpact), "P3 بلا أثرٍ على الخريجين لا سطرَ بطل ولا رقمٌ مخترع");
  check((noImpact.match(/class="pulse-ring /g) || []).length === 2 && /is-grad/.test(noImpact) && /is-stud/.test(noImpact), "P4 الحلقتان باقيتان (الخريجون ثم الطلبة)");
  check((noImpact.match(/class="pulse-bar /g) || []).length === 2 && /pulse-bar is-grad[^>]*role="img"[^>]*aria-label="يناسب 9 ويحجب 3 من 12"/.test(noImpact) && /style="width:75%"/.test(noImpact) && /style="width:25%"/.test(noImpact), "P5 شريطٌ رفيعٌ تحت كل حلقة: يناسب 75٪ مقابل يحجب 25٪ بأرقام الحاجة");
  check(/<bdi dir="ltr">MATH101<\/bdi><em dir="ltr">7<\/em>/.test(noImpact) && !/<small>تفاضل<\/small>/.test(noImpact) && /title="تفاضل/.test(noImpact), "P6 شرائحُ المقررات: رمزٌ وعدد، والاسمُ في التلميح");
  const all = renderToStaticMarkup(<StudentPulse fit={{ ...fit, students: side({ blocked: 0, fit: 40, percent: 100, clashes: [] }), graduates: null }} />);
  check(/يناسب الجميع/.test(all) && !/pulse-bar-clash|is-clash/.test(all), "P7 الجميع يناسبه: «يناسب الجميع» وشريطٌ بلا أحمر");
  const nodata = renderToStaticMarkup(<StudentPulse fit={{ ...fit, students: side({ percent: null, clashes: [] }), graduates: side({ percent: null, clashes: [] }) }} />);
  check(/is-nodata/.test(nodata) && /لا بيانات/.test(nodata) && !/pulse-bar/.test(nodata), "P8 بلا نسب في التقرير: «لا بيانات» بلا شريطٍ مخترع", text(nodata).slice(0, 120));
  check(/is-empty/.test(renderToStaticMarkup(<StudentPulse fit={null} showEmpty />)) && /لا بيانات/.test(renderToStaticMarkup(<StudentPulse fit={null} showEmpty />)), "P9 fit=null مع showEmpty: بطاقةٌ صادقة «لا بيانات»");
  check(renderToStaticMarkup(<StudentPulse fit={null} />) === "" && renderToStaticMarkup(<StudentPulse fit={null} graduateImpact={{ graduates: 5 }} />) === "", "P10 كالسابق تماماً: fit=null بلا خيارات لا يرسم شيئاً");
  const loading = renderToStaticMarkup(<StudentPulse fit={null} loading />);
  check(/is-loading/.test(loading) && /aria-busy="true"/.test(loading) && /pulse-skel/.test(loading) && !/\d/.test(text(loading)), "P11 التحميل: هيكلٌ عظميٌّ بلا أرقام");
  store.set("schedule-pulse-open", "off");
  const closed = renderToStaticMarkup(<StudentPulse fit={fit} graduateImpact={{ graduates: 12 }} />);
  check(/aria-expanded="false"/.test(closed) && /pulse-chips/.test(closed) && !/pulse-body/.test(closed) && !/pulse-hero/.test(closed), "P12 المطويّ كما كان: شرائحُ فقط بلا جسمٍ ولا بطل");
  check(!ARABIC_INDIC.test(withImpact + noImpact + closed + loading + nodata) && /%/.test(noImpact) && !/٪/.test(noImpact), "P13 أرقامٌ لاتينية و«%» لا «٪»");

  /* ── S ─────────────────────────────────────────────────────────────── */
  const index = read("src/index.css");
  check(index.includes('@import "./styles/67-chain-solve.css";') && index.includes('@import "./styles/67-student-pulse-live.css";'), "S1 الأنماطُ الجديدة في الورقة العامة");
  const css = read("src/styles/67-chain-solve.css") + read("src/styles/67-student-pulse-live.css");
  check(/prefers-reduced-motion:reduce/.test(read("src/styles/67-chain-solve.css")) && /prefers-reduced-motion:reduce/.test(read("src/styles/67-student-pulse-live.css")), "S2 الحركة المخفّضة محترمة في الملفين");
  check(/@media \(pointer:coarse\)/.test(css) && /min-height:48px/.test(css) && /@media \(min-width:900px\)/.test(css) && /@media \(max-width:420px\)/.test(css), "S3 لمسٌ ≥44 وجانبٌ على المكتب وضيقٌ على الجوال");
  check(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/var\(--accent-contrast,#fff\)|var\(--ink,#111\)/g, "")), "S4 ألوانٌ من الرموز فقط (لا ألوانَ ثابتة)");
  const ban = new RegExp(["ذكاء" + " اصطناعي", "\\bA" + "I\\b"].join("|"));
  check(![read("src/components/ChainSolveSheet.tsx"), read("src/utils/chainSolve.ts"), read("src/components/StudentPulse.tsx"), css].some(file => ban.test(file)), "S5 لا عبارةَ ممنوعة");

  console.log(`\nchain-pulse render audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
