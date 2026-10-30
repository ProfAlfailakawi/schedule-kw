/**
 * ── شبكة الأمان تلتقط الجدولَ كما هو، والاسترجاعُ يعيد النسخةَ كما هي ──────────
 *
 * الحادثة (الكلية 6، القسم 7، الفصل 107، 2026-10-30): نُشر ملفُّ PDF، ثم «تراجع»
 * عنه، ثم تراجعٌ عن «قبل حذف موعد دراسي». النقطةُ التي أخذها التراجعُ الأول كانت
 * مطابقةً لحالة ما قبل النشر (لا ما بعده)، والتي أخذها الثاني كانت حالةَ ما بعد
 * الاستيراد (لا ما بعد التراجع الأول): كلُّ لقطةٍ متأخرةٌ خطوة.
 *
 * السبب: `replaceScheduleScope` كان يمسح ذاكرةَ الصفوف ثم يقرأ النطاقَ عبرها (فيملؤها
 * بالصفوف التي سيحذفها) ولا يمسحها بعد الكتابة؛ و`captureScopeVersion` ومقارنةُ
 * «N تغييراً ستُمحى» تقرآن عبر الذاكرة نفسها. هنا يُعاد المشهدُ كلُّه على مستودعٍ
 * محلي والذاكرةُ مفعّلة، وتُحقن فيها الصفوفُ القديمة كما كان مسارُ Firestore يحقنها.
 */
import fs from "fs";
import os from "os";
import path from "path";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 1500)); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

(async () => {
  const C = 6, S = 7, T = 107;
  const row = (id: number, course: number, section: string, instructor: number, start: string, end: string, hall: string, extra: Record<string, unknown> = {}) => ({
    id, AdCourseId: course, AdCourseName: "", SCode: section, AdInstructorId: instructor, AdTermId: T,
    fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
    fstarttime: start, fendtime: end, AdRoomCode: "B1", AdRoomHall: hall, ...extra,
  });
  /* S0: الجدول قبل «حذف موعد دراسي» (2026-10-29). */
  const S0 = [
    row(1, 701, "501", 101, "08:00", "09:15", "101", { CourseCodeSnapshot: "0109105", CourseNameSnapshot: "مقدمة في تكنولوجيا التعليم", origin: { kind: "planning" }, rev: 4 }),
    row(2, 701, "502", 102, "09:30", "10:45", "102"),
    row(3, 702, "501", 103, "11:00", "12:15", "103"),
    row(4, 703, "501", 104, "12:30", "13:45", "104"),
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-safety-net-"));
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [],
    terms: [{ AdTermId: T, AdTermName: "خريف 2026" }],
    colleges: [{ AdCollegeId: C, AdCollegeCode: "012", AdCollegeName: "كلية التربية الأساسية - بنات" }],
    sections: [{ AdSectionId: S, AdCollegeId: C, AdSectionCode: "09", AdSectionName: "قسم تكنولوجيا التعليم" }],
    courses: [701, 702, 703].map(id => ({ AdCourseId: id, AdCollegeId: C, AdSectionId: S, CourseCode: String(id), CourseName: `مقرر ${id}`, CourseCredit: 3, CourseHours: 3, MaxStudent: 40 })),
    instructors: [101, 102, 103, 104, 888, 1080].map(id => ({ AdInstructorId: id, AdInstructorName: `أستاذ ${id}`, AdSectionId: S })),
    schedules: S0, rooms: [], scheduleVersions: [],
  }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
  const quiet = console.warn; console.warn = () => {};
  const { Repository, initDatabase } = await import("../src/db/repository");
  const { cachedSchedules, invalidateSchedules } = await import("../src/db/referenceCache");
  const { captureScopeVersion, recordVersionAfter, scopeOverwriteRefusal } = await import("../src/server/core/versions");
  const { restoreVersionRows, restoreImpact, describeRestoreImpact, safetyPointKind, safetyPointTitle } = await import("../src/utils/safetyNet");
  const { rowSignature } = await import("../src/utils/scopeFingerprint");
  await initDatabase();
  console.warn = quiet;

  const req: any = { user: { SystemUserId: 1, Name: "منسق القسم" }, get: () => "" };
  const sigs = (rows: any[]) => rows.map(rowSignature).sort();
  const same = (a: any[], b: any[]) => JSON.stringify(sigs(a)) === JSON.stringify(sigs(b));
  const live = () => Repository.getSchedulesByScope({ collegeId: C, sectionId: S, termId: T });
  /* ما كان مسارُ Firestore يفعله: صفوفُ ما قبل الكتابة تُحفظ في الذاكرة تحت مفتاح النطاق. */
  const primeStale = async (rows: any[]) => {
    invalidateSchedules();
    await cachedSchedules(`${C}:${S}:${T}`, async () => rows.map(item => ({ ...item, AdCollegeId: C, AdSectionId: S })));
  };

  try {
    /* ── 1) ذاكرةُ الصفوف: قراءةٌ بدأت قبل الكتابة لا تُحفظ بعدها ── */
    {
      let release: (rows: any[]) => void = () => {};
      const slow = cachedSchedules("probe", () => new Promise<any[]>(resolve => { release = resolve; }));
      invalidateSchedules();               // الكتابة التزمت أثناء القراءة
      release([{ id: 1, stale: true }]);
      const got = await slow;
      check(got[0]?.stale === true, "C1 القراءةُ الجارية تُجيب صاحبها");
      const again = await cachedSchedules("probe", async () => [{ id: 1, stale: false }]);
      check(again[0]?.stale === false, "C1 ولا تُحفظ بعد المسح: السائلُ التالي يقرأ من جديد");
    }

    /* ── 2) «قبل حذف موعد دراسي»: S0 → S1 ── */
    const V0 = await captureScopeVersion(req, C, S, T, "قبل حذف موعد دراسي", "manual");
    check(Boolean(V0) && same(V0!.rows, S0), "D1 نقطةُ الحذف تحمل الجدولَ قبل الحذف", V0?.rows);
    await Repository.deleteSchedule(4);
    await recordVersionAfter(V0, before => before.filter((item: any) => Number(item.id) !== 4));
    const S1 = await live();
    check(S1.length === 3, "D1 الحذفُ تمّ");

    /* ── 3) نشرُ ملف PDF: S1 → S2 (مدرّسون وأوقات وقاعات أخرى، ومعرّفات جديدة) ── */
    const V1 = await captureScopeVersion(req, C, S, T, "قبل نشر: نسخة PDF المعتمدة — تكنولوجيا التعليم.pdf", "publish");
    check(same(V1!.rows, S1), "P1 نقطةُ النشر تحمل الجدولَ قبل النشر");
    const draft = [
      row(-1, 701, "501", 1080, "10:00", "11:15", "201"),
      row(-2, 701, "502", 888, "11:30", "12:45", "202"),
      row(-3, 702, "501", 103, "11:00", "12:15", "103"),
      row(-4, 703, "502", 888, "13:00", "14:15", "204"),
      row(-5, 703, "503", 1080, "14:30", "15:45", "205"),
    ];
    const published = await Repository.replaceScheduleScope(C, S, T, draft as any);
    await recordVersionAfter(V1, published as any[]);
    const S2 = await live();
    check(same(S2, published), "P1 الجدولُ الحيّ بعد النشر هو ما نُشر");

    /* مسار Firestore كان يترك في الذاكرة صفوفَ ما قبل النشر (S1). */
    await primeStale(S1);

    /* ── 4) التراجع عن النشر ── */
    const refusal1 = await scopeOverwriteRefusal(req, C, S, T, V1 as any);
    check(refusal1 === null, "U1 لا «تغييرات ستُمحى» حين لم يتغيّر شيء بعد النشر (يُقرأ الحيّ لا الذاكرة)", refusal1);
    const V2 = await captureScopeVersion(req, C, S, T, `قبل التراجع عن القرار: ${V1!.label}`, "undo");
    check(same(V2!.rows, S2), "U1 لقطةُ «قبل التراجع» هي حالةُ ما بعد النشر، لا ما قبله", { got: sigs(V2!.rows), want: sigs(S2) });
    check(!same(V2!.rows, V1!.rows), "U1 ولا تطابق النسخةَ التي يُتراجع إليها");
    const restored1 = restoreVersionRows(V1!.rows, C, S, T);
    const after1 = await Repository.replaceScheduleScope(C, S, T, restored1 as any);
    await recordVersionAfter(V2, after1 as any[]);
    const S3 = await live();
    check(same(S3, V1!.rows), "U1 بعد التراجع: الجدولُ يساوي النسخةَ تماماً");
    const kept = S3.find((item: any) => Number(item.AdCourseId) === 701 && item.SCode === "501") as any;
    check(kept?.CourseCodeSnapshot === "0109105" && kept?.CourseNameSnapshot === "مقدمة في تكنولوجيا التعليم" && kept?.origin?.kind === "planning",
      "U1 والاسترجاع لا يُسقط لقطة المقرر ولا مصدر آخر تغيير", kept);
    check(S3.every((item: any) => item.sourceOrder === undefined), "U1 ولا يضيف ترتيبَ مصدرٍ لم يكن في النسخة");

    /* الذاكرة القديمة مرةً أخرى: صفوفُ ما بعد النشر (S2). */
    await primeStale(S2);

    /* ── 5) التراجع الثاني: إلى «قبل حذف موعد دراسي» ── */
    const refusal2 = await scopeOverwriteRefusal(req, C, S, T, V0 as any);
    /* أساسُ V0 هو S1، والحيُّ الآن S3 = S1: لا شيء بعدها يُمحى. */
    check(refusal2 === null, "U2 العدُّ يُحسب على الجدول الحيّ (S1 بعد التراجع)، لا على صفوف الاستيراد في الذاكرة", refusal2);
    const V3 = await captureScopeVersion(req, C, S, T, `قبل التراجع عن القرار: ${V0!.label}`, "undo");
    check(same(V3!.rows, S3), "U2 لقطةُ التراجع الثاني هي الحالةُ بعد التراجع الأول", { got: sigs(V3!.rows), want: sigs(S3) });
    check(!V3!.rows.some((item: any) => [888, 1080].includes(Number(item.AdInstructorId))), "U2 ولا تحمل مدرّسي الاستيراد (888/1080)");
    const after2 = await Repository.replaceScheduleScope(C, S, T, restoreVersionRows(V0!.rows, C, S, T) as any);
    await recordVersionAfter(V3, after2 as any[]);
    check(same(await live(), S0), "U2 بعد التراجع الثاني: الجدولُ يساوي «قبل حذف موعد دراسي» تماماً");

    /* ── 6) العدُّ الكامل لا المقصوص ── */
    {
      const many = Array.from({ length: 60 }, (_, at) => row(-(at + 1), 701, String(600 + at), 101, "08:00", "09:15", String(300 + at)));
      const base = await captureScopeVersion(req, C, S, T, "قبل نشر: كثير", "publish");
      const wrote = await Repository.replaceScheduleScope(C, S, T, many as any);
      await recordVersionAfter(base, wrote as any[]);
      await Repository.deleteSchedule(Number(wrote[0].id));
      await Repository.replaceScheduleScope(C, S, T, (await live()).map((item: any) => ({ ...item, fstarttime: "10:00", fendtime: "11:15" })) as any);
      const refusal = await scopeOverwriteRefusal(req, C, S, T, base as any);
      check(Boolean(refusal) && refusal!.changes.length === 40 && refusal!.total === 60, "N1 الحوار يأخذ العددَ كاملاً (60) وإن قُصّت القائمة عند 40", refusal && { n: refusal.changes.length, total: refusal.total });
    }
  } catch (error) {
    check(false, "المشهد اكتمل بلا استثناء", String((error as Error)?.stack || error));
  }

  /* ── 7) restoreVersionRows: الأستاذ والأيام والوقت والقاعة والشعبة لا تُمسّ ── */
  {
    const version = [
      { id: 12, AdCourseId: "701", SCode: 501, AdInstructorId: "1080", fsunday: 1, ftuesday: 1, fstarttime: "9:00", fendtime: "10:15", AdRoomCode: "B1", AdRoomHall: "201", roomId: "r-201", companionRoomType: "مختبر", rev: 7, AdCollegeId: 99 },
      { id: "legacy-x", AdCourseId: 702, SCode: "502", AdInstructorId: 888, fmonday: true, fstarttime: "11:00", fendtime: "12:15", AdRoomCode: "", AdRoomHall: "" },
    ];
    const out = restoreVersionRows(version, C, S, T);
    check(out[0].AdInstructorId === 1080 && out[0].SCode === "501" && out[0].AdCourseId === 701, "R1 الأستاذ والشعبة والمقرر كما في النسخة");
    check(out[0].fsunday === true && out[0].ftuesday === true && out[0].fmonday === false && out[0].fdetail === "1,3", "R1 الأيام كما هي");
    check(out[0].fstarttime === "09:00" && out[0].fendtime === "10:15", "R1 الساعةُ القديمة «9:00» تُكتب «09:00» والوقتُ نفسه");
    check(out[0].AdRoomHall === "201" && out[0].roomId === "r-201" && out[0].companionRoomType === "مختبر", "R1 القاعة كما هي");
    check(out[0].rev === undefined && out[0].AdCollegeId === C && out[0].id === 12, "R1 النطاقُ يُفرض والمراجعةُ تبدأ من جديد");
    check(out[1].id < 0 && !Object.values(out[1]).some(value => value === undefined), "R1 المعرّفُ القديم يأخذ رقماً سالباً، ولا قيمَ undefined لـ Firestore");
  }

  /* ── 8) ملخّصُ الأثر ونوعُ النقطة ── */
  {
    const a = [row(1, 701, "501", 101, "08:00", "09:15", "101"), row(2, 701, "502", 102, "09:30", "10:45", "102"), row(3, 702, "501", 103, "11:00", "12:15", "103")];
    const b = [row(9, 701, "501", 101, "08:00", "09:15", "101"), row(8, 701, "502", 888, "09:30", "10:45", "102"), row(7, 703, "501", 104, "12:30", "13:45", "104")];
    const impact = restoreImpact(a, b);
    check(impact.edits === 1 && impact.removes === 1 && impact.restores === 1 && !impact.same, "I1 يُطابق بالمعنى لا بالمعرّف: تعديل وحذف وإعادة", impact);
    check(describeRestoreImpact(impact) === "يعدّل موعد واحد، ويحذف موعد واحد، ويعيد موعد واحد" || describeRestoreImpact(impact).startsWith("يعدّل "), "I1 سطرٌ واحد يُقرأ", describeRestoreImpact(impact));
    check(restoreImpact(a, a.map(item => ({ ...item, id: item.id + 100 }))).same, "I1 نسخةٌ بمعرّفات أخرى ومحتوى واحد: لا تغيير");
    check(describeRestoreImpact(restoreImpact([], [])) === "مطابقة للجدول الحالي — لن يتغيّر شيء", "I1 والمطابقةُ تُقال");
    const withCompanion = a.map((item, at) => (at === 0 ? { ...item, companionRoomId: "lab-7", companionRoomLabel: "مختبر 7" } : item));
    const companionOnly = restoreImpact(a, withCompanion);
    check(!companionOnly.same && companionOnly.edits === 1 && companionOnly.removes === 0 && companionOnly.restores === 0,
      "I2 نسخةٌ تختلف في القاعة المرافقة وحدها ليست «مطابقة»: تعديلٌ واحد، والزرّ لا يُعطَّل", companionOnly);
    check(!restoreImpact(withCompanion, a).same, "I2 وفي الاتجاه الآخر: إزالةُ القاعة المرافقة تعديل");
    check(!restoreImpact(a, a.map((item, at) => (at === 1 ? { ...item, buildingId: "bld-2" } : item))).same, "I2 والمبنى المعتمد كذلك");
    check(restoreImpact(withCompanion, withCompanion.map(item => ({ ...item, id: item.id + 50 }))).same, "I2 والمطابقةُ الحقيقية تبقى مطابقة");
    check(describeRestoreImpact({ edits: 40, removes: 2, restores: 0, same: false }) === "يعدّل 40 موعداً، ويحذف موعدين", "I1 العددُ بالعربية الصحيحة", describeRestoreImpact({ edits: 40, removes: 2, restores: 0, same: false }));
    check(safetyPointKind("قبل نشر: نسخة PDF المعتمدة — تكنولوجيا التعليم.pdf", "publish").kindLabel === "قبل الاستيراد", "K1 نشرُ ملف PDF: «قبل الاستيراد»");
    check(safetyPointKind("قبل التراجع عن القرار: قبل نشر: x.pdf", "undo").kind === "undo", "K1 «قبل التراجع»");
    check(safetyPointKind("قبل حذف موعد دراسي", "manual").kind === "delete", "K1 «قبل الحذف»");
    check(safetyPointKind("قبل نشر: بداية الفصل", "publish").kind === "publish", "K1 «قبل النشر»");
    check(safetyPointTitle("قبل التراجع عن القرار: قبل حذف موعد دراسي") === "تراجعٌ عن «قبل حذف موعد دراسي»", "K1 العنوانُ لا يكرّر النوع");
  }

  /* ── 9) الحرّاس في المصدر ── */
  {
    const repo = read("src/db/repository.ts");
    const replace = repo.slice(repo.indexOf("replaceScheduleScope: async"), repo.indexOf("// Campus mobility"));
    check(replace.includes("getSchedulesByScope({ collegeId, sectionId, termId }, { fresh: true })"), "G1 ما يُحذف عند الاستبدال يُقرأ من المخزَّن");
    const firestoreBranch = replace.slice(replace.indexOf("await firestoreDb.runTransaction"), replace.indexOf("const hydrated=hydrateSchedules"));
    check(firestoreBranch.includes("invalidateSchedules();"), "G1 والذاكرة تُمسح بعد الالتزام أيضاً");
    const versions = read("src/server/core/versions.ts");
    check((versions.match(/\{ fresh: true \}/g) || []).length >= 3, "G1 اللقطة والعدّ وقياس الاستبدال تقرأ الحيّ");
    const insight = read("src/server/routes/intelligenceInsightRoutes.ts");
    const undo = insight.slice(insight.indexOf('app.post("/api/intelligence/safety-net/:id/undo"'));
    check(undo.includes("restoreVersionRows(version.rows") && !undo.includes("safeDraftRows(version.rows"), "G1 التراجعُ يكتب صفوفَ النسخة لا مسودّةً منظَّفة");
    const drafts = read("src/server/routes/draftsRoutes.ts");
    check(drafts.includes("restoreVersionRows(version.rows") && !drafts.includes("safeDraftRows(version.rows"), "G1 وكذلك «استرجاع نسخة»");
    const css = read("src/styles/04-screens.css");
    check(/\.so-course\{display:grid;grid-template-columns:minmax\(0,1fr\)/.test(css) && !/\.so-chips\{[^}]*flex:none/.test(css), "G2 اسمُ المقرر في سطره والشعبُ تلتفّ تحته");
    const body = read("src/components/ScopeOverwriteBody.tsx");
    check(body.includes("total") && !body.includes("تغييراً ستُمحى</span>"), "G2 العددُ من الخادم كاملاً، والكلمةُ تتبعه");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
