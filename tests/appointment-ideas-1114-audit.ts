/**
 * ── مراجعة «موعد» 2026-11-14 (٢): الملاحظات 1–4 والأفكار الثلاث ────────────────────────
 *
 *  W  مدد العجلة من المكتبة وحدها (wheelLengths): يومٌ منفرد، نمطٌ موحّد، بلا أيام، بلا ساعات.
 *  R  الوقت الذهبي (rankByFitBand): فئاتٌ ثلاث بفرزٍ مستقر، وما بلا نسبة في الوسط، وما بعد الحدّ لا يُمسّ.
 *  F  الخادم على بيانات تجريبية حقيقية (fitScoresFor / appointmentDemandFor): وقتٌ يغطّي الشعبة الوحيدة لمقررٍ يحتاجه
 *     الخريجون يحجبهم، ووقتٌ حرٌّ لا يحجب أحداً، وبلا تقرير لا حكم.
 *  S  الربط في المصدر: بطاقةُ الاقتراح تحمل النسبة، وخانات الأسبوع تُلوَّن، والمسودة تُحفظ وتُمحى، وحالة «تعديل» بلا تغيير.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { wheelLengths } from "../src/utils/appointmentRegulation";
import { fitBand, rankByFitBand } from "../src/utils/studentFit";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};

/* ── W ─────────────────────────────────────────────────────────────── */
const three = { CourseHours: 3 }, two = { CourseHours: 2 };
check(JSON.stringify(wheelLengths(three, ["fsunday", "ftuesday", "fthursday"])) === "[50]", "W1 أحد·ثلاثاء·خميس لثلاث ساعات: 50 وحدها", wheelLengths(three, ["fsunday", "ftuesday", "fthursday"]));
check(JSON.stringify(wheelLengths(three, ["fsunday", "ftuesday"])) === "[80]", "W1 أحد·ثلاثاء: 80 وحدها", wheelLengths(three, ["fsunday", "ftuesday"]));
const block = wheelLengths(three, ["fmonday"]) || [];
check(block.includes(170), "W2 يومٌ منفرد: كتلة 170 حاضرة", block);
check(![100, 120, 150, 180].some(n => block.includes(n)), "W2 لا مدد خارج المكتبة (100/120/150/180)", block);
const none = wheelLengths(three, []) || [];
check(none.includes(50) && none.includes(80) && none.includes(170) && !none.includes(120), "W3 بلا أيام: كل أطوال المقرر في المكتبة وحدها", none);
check(JSON.stringify(wheelLengths(three, ["fsunday", "fmonday"])) === JSON.stringify(none), "W4 أيامٌ ليست نمطاً: كل الأطوال لا طولٌ مخترَع");
check(wheelLengths({}, ["fsunday"]) === null && wheelLengths({ CourseHours: 11 }, ["fsunday"]) === null, "W5 بلا ساعات أو بلا أنماط: null (القائمة الافتراضية)");
check(wheelLengths(two, ["fmonday", "fwednesday"])?.join() === "50", "W6 اثنين·أربعاء لساعتين: 50");

/* ── R ─────────────────────────────────────────────────────────────── */
const slots = [{ n: "a", p: 40 }, { n: "b", p: 90 }, { n: "c", p: 70 }, { n: "d", p: 95 }, { n: "e", p: undefined }, { n: "f", p: 10 }];
const ranked = rankByFitBand(slots, s => s.p).map(s => s.n).join("");
check(ranked === "bdceaf", "R1 فئاتٌ ثلاث بفرزٍ مستقر: 85+ ثم الوسط (ومنه بلا نسبة) ثم الأدنى", ranked);
check(rankByFitBand(slots, s => s.p, 3).map(s => s.n).join("") === "bcadef", "R2 الحدّ: يُفرز الرأسُ وحده ولا يُمسّ ما بعده", rankByFitBand(slots, s => s.p, 3).map(s => s.n).join(""));
check(rankByFitBand([], () => 1).length === 0, "R3 قائمةٌ فارغة");
check(fitBand(85) === 0 && fitBand(84) === 1 && fitBand(60) === 1 && fitBand(59) === 2 && fitBand(null) === 1, "R4 حدود الفئات 85 و60");

/* ── F: على بيانات تجريبية حقيقية في صندوق رمل ──────────────────────────── */
async function server() {
  process.env.DATA_MODE = "demo";
  process.env.NODE_ENV = "development";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-ideas-"));
  process.env.SCHEDULE_PRIVATE_DIR = dir;
  const { initDatabase, Repository } = await import("../src/db/repository");
  await initDatabase();
  const sid = `demo_ideas_${Date.now()}`;
  Repository.createDemoSandbox(sid, 3_600_000);
  try {
    await Repository.withDemoSandbox(sid, async () => {
      const ad = await import("../src/server/actualDemand");
      const { authorityCourseCode } = await import("../src/utils/authorityAcademicCodes");
      const sections: any[] = await Repository.getSections();
      const tech = sections.find(s => /تكنولوجيا التعليم/.test(String(s.AdSectionName)) && !/تجريبي/.test(String(s.AdSectionName)));
      const req: any = { user: { IsAdminUser: true }, scopes: [] };
      const terms: any[] = await Repository.getTerms();
      const termId = Number(terms.find((t: any) => /2026\/2027/.test(String(t.AdTermName)) && /الأول/.test(String(t.AdTermName)))?.AdTermId || terms[0].AdTermId);
      const family = await ad.demandFamilyFor(req, Number(tech.AdCollegeId), Number(tech.AdSectionId));
      const courses: any[] = (await Repository.getCourses()).filter((c: any) => family.members.some(m => m.sectionId === Number(c.AdSectionId)));
      const code = (c: any) => authorityCourseCode(c.CourseCode, family.members.find(m => m.sectionId === Number(c.AdSectionId))?.departmentKey) || "";
      const rows: any[] = await Repository.getSchedulesByScope({ collegeId: Number(tech.AdCollegeId), sectionId: Number(tech.AdSectionId), termId });
      const ids = [...new Set(rows.map(r => Number(r.AdCourseId)))];
      const sectionsOf = (id: number) => new Set(rows.filter(r => Number(r.AdCourseId) === id).map(r => `${r.AdCollegeId}|${r.SCode}`)).size;
      const a = courses.find(c => c.AdCourseId === ids[0])!;
      const b = courses.find(c => c.AdCourseId === ids.find(id => id !== ids[0] && sectionsOf(id) === 1))!;
      const mk = (c: any, programs: Array<[string, number, number]>) => {
        const boys = programs.reduce((s, p) => s + p[1], 0), girls = programs.reduce((s, p) => s + p[2], 0);
        return { code: code(c), name: c.CourseName, units: 3, offered: { boys: 0, girls: 0 }, average: { boys: 0, girls: 0 }, students: { boys, girls, total: boys + girls },
          suggested: { boys: 0, girls: 0, total: 0 }, programs: programs.map(([k, bo, gi]) => ({ code: k, name: k, boys: bo, girls: gi, total: bo + gi })) };
      };
      const report = (list: any[]) => ({ termLabel: "", department: String(tech.AdSectionName), facultyCount: 0, legalLoad: 0, warnings: [], courses: list });
      const entry = (r: any) => ({ report: r, uploadedAt: new Date().toISOString(), uploadedBy: "audit", hash: "x" });
      const rb = rows.find(r => Number(r.AdCourseId) === b.AdCourseId);
      const days = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].filter(d => rb[d]);
      const base = { AdCollegeId: Number(tech.AdCollegeId), AdSectionId: Number(tech.AdSectionId), AdTermId: termId, AdCourseId: a.AdCourseId, SCode: "599" };
      const clashing = { days, start: rb.fstarttime, end: rb.fendtime }, free = { days, start: "19:00", end: "19:50" };

      const before = await ad.fitScoresFor(req, base, [clashing, free]);
      check(before.every(item => item === null), "F1 بلا تقرير طلبٍ فعلي: لا حكم لأي وقت");
      check((await ad.appointmentDemandFor(req, { ...base, fstarttime: clashing.start, fendtime: clashing.end, ...Object.fromEntries(days.map(d => [d, true])) })).studentFit === null, "F1 ولا بطاقة نبض");

      await ad.storeDemandVariant(termId, family.key, "graduates", entry(report([mk(a, [["BA-0115", 10, 6]]), mk(b, [["BA-0115", 7, 4]])])));
      await ad.storeDemandVariant(termId, family.key, "general", entry(report([mk(a, [["BA-0115", 40, 30]]), mk(b, [["BA-0115", 20, 10]])])));
      const scores = await ad.fitScoresFor(req, base, [clashing, free, clashing]);
      check(scores[0]?.kind === "grad" && scores[0].need === 16 && scores[0].blocked > 0 && scores[0].percent < 60, "F2 وقتٌ يغطّي الشعبة الوحيدة لمقررٍ يحتاجه الخريجون: يحجبهم (الخريجون أولاً)", scores[0]);
      check(scores[1]?.percent === 100 && scores[1].blocked === 0, "F3 وقتٌ حرّ: ١٠٠٪ ولا حجب", scores[1]);
      check(JSON.stringify(scores[0]) === JSON.stringify(scores[2]), "F4 الوقتُ نفسه يُحكم عليه حكماً واحداً");
      const read = await ad.appointmentDemandFor(req, { ...base, fstarttime: clashing.start, fendtime: clashing.end, ...Object.fromEntries(days.map(d => [d, true])) });
      check(Boolean(read.studentFit?.graduates && read.studentFit.students), "F5 بطاقة النبض تحمل الخريجين والطلبة معاً", read.studentFit);
      check(read.studentFit?.graduates?.clashes[0]?.code === code(b), "F6 المقرر المحجوب يُسمّى برقمه السباعي", read.studentFit?.graduates?.clashes);
      const cov = read.studentFit?.graduates?.coverage;
      check(Number.isFinite(cov?.before) && Number.isFinite(cov?.after) && cov!.after >= 0 && cov!.after <= 100, "F7 تغطية المقرر كله تصل في قراءة الحفظ (قبل/بعد)", cov);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* ── S ─────────────────────────────────────────────────────────────── */
function source() {
  const read = (file: string) => fs.readFileSync(file, "utf8");
  const schedules = read("src/components/Schedules.tsx"), mini = read("src/components/TeacherMiniWeek.tsx"), cards = read("src/components/RoomSuggestionCards.tsx");
  const route = read("src/server/routes/scheduleToolsRoutes.ts"), css = read("src/styles/58-appt-ideas.css"), counter = read("src/components/TimeCounter.tsx");
  check(/lengths=\{wheelLengths\(formCourse, formDays as RegDayKey\[\]\)\}/.test(schedules) && /lengths=\{wheelLengths\(selectedCourse, chosenDays\)\}/.test(read("src/components/QuickCreatePopover.tsx")), "S1 العجلتان (المحرّر والبطاقة السريعة) تأخذان مدد المكتبة");
  check(/editorFitStart/.test(schedules) && /ضمن الدوام الشامل/.test(schedules) && /ابدأ <bdi dir="ltr">\{editorFitStart\}/.test(schedules), "S0 موعدٌ يتجاوز الدوام الشامل: زرّ «ابدأ HH:MM» بآخر بدايةٍ تتّسع");
  check(/lengths && lengths\.length \? \[\.\.\.lengths\]/.test(counter), "S1 والعجلة تعود لقائمتها الافتراضية بلا مدد");
  check(/fendtime: !start \? \(timingOverride \? p\.fendtime : ""\)/.test(schedules), "S2 مسحُ البداية يمسح النهاية المحسوبة ويُبقي النهاية العمدية");
  check(/studioTone === "warn" && editor === "edit" && !editorDirty \? "لم يتغيّر شيء"/.test(schedules), "S3 «تعديل» بلا تغيير يقول «لم يتغيّر شيء» ولو كانت فيه ملاحظات");
  check(/rankByFitBand\(ordered0/.test(route) && /fitted = slots\.map/.test(route) && /\/api\/schedules\/fit-grid/.test(route), "S4 الخادم يرتّب بالفئات ويُلحق النسبة، ومساره fit-grid");
  check(/slot\.fit \? <FitPill fit=\{slot\.fit\} \/>/.test(cards), "S5 بطاقة الاقتراح تحمل شريحة النسبة");
  check(/useFitGrid\(\{/.test(mini) && /has-fit fit-\$\{fitTone/.test(mini) && /mini-week-legend-fit/.test(mini), "S6 خانات «أسبوع الأستاذ» تُلوَّن ولها وسيلة إيضاح");
  check(/\.mini-week-target\.has-fit\.fit-good/.test(css) && /\.room-suggest-fit\.is-grad/.test(css) && /\.appt-draft\{/.test(css), "S7 الأنماط: الخانة والشريحة والمسودة");
  check(/schedule-appt-draft:\$\{Number\(user\?\.SystemUserId \|\| 0\)\}/.test(schedules) && /if \(editor === "create"\) clearDraft\(\);\s*\n\s*markChanged/.test(schedules) && /if \(!leave\) return;[\s\S]{0,200}if \(editor === "create"\) clearDraft\(\);/.test(schedules), "S8 المسودة: مفتاحٌ لكل مستخدم، وتُمحى بحفظ «موعد جديد» وبالإغلاق المقصود له وحده (التعديل لا يمسّها)");
  check(/editorDirty \|\| !form\.AdCourseId/.test(schedules) && /readDraft\(\)/.test(schedules) && /editor === "create" && draftOffer \?/.test(schedules) && /if \(draftOffer\) return;/.test(schedules), "S9 تُحفظ حين يتغيّر النموذج فقط، وتبقى معروضةً حتى يُجاب عنها ولا تُكتب فوقها");
}

(async () => {
  source();
  await server();
  console.log(`\nappointment-ideas-1114 audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
