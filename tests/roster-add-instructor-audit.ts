/**
 * «أستاذ جديد» من أدوات الجدول ولوحة «موعد» (المالك 2026-11-14) — رحلةٌ حيّة على صندوق الديمو:
 *   A1 /api/section-roster/ranks بإذن القسم، وبلا جلسة لا يُقرأ؛
 *   A2 إضافةٌ بسياق القسم مع الدرجة: تُنشئ الأستاذ وتضمّه إلى دليل القسم وتكتب درجتَه، فتظهر ساعاتُه في «الأساتذة»؛
 *   A3 «مدرب» عند الإضافة: يظهر في مجموعة المدربين بتصنيف ta؛
 *   A4 درجةٌ غير موجودة تُرفض قبل الإنشاء: لا أستاذ ولا رقمَ مسجَّل؛
 *   A5 بلا نطاق لا تُكتب الدرجة (الأدمن وحده يعدّلها من شاشته)؛
 *   A6 المتقاعد يُخفى بتأكيدٍ ويبقى في السجل، والمتفرّغ يرجع بإزالة الحالة؛
 *   A7 الواجهة: النموذجُ الواحد في المكانين، والبطاقةُ تحمل الاستثناء والحالة.
 */
import { spawn, type ChildProcess } from "child_process";
import fs from "node:fs";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { validateCivilId } from "../src/utils/civilId";

const PORT = Number(process.env.ROSTER_ADD_PORT || 4200 + Math.floor(Math.random() * 300));
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};
async function http(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, cookie: set ? set.split(";")[0] : undefined };
}
let child: ChildProcess | null = null;
const stop = () => { if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } } };
/* رقمٌ مدني صالح الاختبار (المجموع الاختباري): يُبحث عن أول رقمٍ صالح فما بعد البذرة، وكلُّ نداءٍ يتجاوز ما سبقه. */
let civilCursor = 900000000 + (Date.now() % 90000000);
const civilNext = () => {
  for (let tries = 0; tries < 100000; tries++, civilCursor++) {
    const candidate = `2${String(civilCursor).padStart(11, "0")}`;
    if (validateCivilId(candidate).isValid) { civilCursor++; return candidate; }
  }
  throw new Error("لا رقمَ صالح");
};
const SCOPE = "collegeId=1&sectionId=1&termId=1";

function staticChecks() {
  const form = fs.readFileSync("src/components/NewInstructorForm.tsx", "utf8");
  const roster = fs.readFileSync("src/components/DepartmentRoster.tsx", "utf8");
  const picker = fs.readFileSync("src/components/InstructorPicker.tsx", "utf8");
  check(roster.includes("<NewInstructorForm") && picker.includes("<NewInstructorForm"), "A7 النموذجُ نفسُه في أدوات الجدول وفي «موعد» — بلا نسخةٍ ثانية");
  check(form.includes('"/api/instructors"') && form.includes("load: { rankId }") && form.includes('AdInstructorCategory: "ta"'), "A7 الاسمُ ثم الدرجة، وخيارُ «مدرب»، من طلبٍ واحد للخادم");
  check(/ExceptionBadge/.test(roster) && /toggleStatus\(person, "retired"\)/.test(roster) && /toggleStatus\(person, "sabbatical"\)/.test(roster), "A7 بطاقةُ العضو تحمل الاستثناءَ والتقاعدَ والتفرّغ");
  check(roster.includes("إلغاء ${word}") && roster.includes("visualConfirm"), "A6 تغييرُ الحالة يمرّ بتأكيد، وإلغاؤها يُعيد الأستاذ");
  /* A8 الدرجةُ لازمةٌ للجميع: النموذجُ لا يقبل بلا درجة، ومحرّرُ القسم بلا «بلا درجة»، ولوحةُ استكمال القائمين */
  check(form.includes("اختر الدرجة العلمية من النصاب.") && form.includes("required") && !form.includes("(اختياري)</option>"), "A8 النموذجُ يُلزم باختيار الدرجة من النصاب");
  check(roster.includes("requireRank={roster.ranks.length > 0}") && roster.includes("استكمال الدرجات العلمية") && roster.includes("saveRanks"), "A8 محرّرُ القسم بلا «بلا درجة»، ولوحةُ «استكمال الدرجات» لمن لا درجةَ له");
  check(/!person\.assignment\?\.rankId/.test(roster) && roster.includes('AdInstructorStatus !== "retired"'), "A8 من بلا درجة يُعدّ غيرَ المتقاعدين وحدهم");
}

async function main() {
  staticChecks();
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 1000)); }
  const login = await http("POST", "/api/auth/demo", {});
  const cookie = login.cookie!;
  await waitForDemoSeed(BASE, cookie);
  await http("POST", "/api/demo/role", { role: "admin" }, cookie);
  const A = (method: string, path: string, body?: unknown) => http(method, path, body, cookie);

  /* تجهيز: درجةٌ واحدة على الأقل في الإعداد. */
  let ranks = await A("GET", "/api/section-roster/ranks");
  if (!ranks.json.ranks?.length) {
    await A("PUT", "/api/admin/teaching-load", { enabled: true, ranks: [{ id: "r-prof", name: "أستاذ", minHours: 9, maxHours: 12, overtimeHours: 3 }], assignments: {} });
    ranks = await A("GET", "/api/section-roster/ranks");
  }
  const rank = ranks.json.ranks?.[0];
  check(ranks.status === 200 && rank?.id && Number.isFinite(rank.minHours), "A1 الدرجاتُ تُقرأ بإذن القسم", ranks.json);
  check((await http("GET", "/api/section-roster/ranks")).status !== 200, "A1 وبلا جلسة لا تُقرأ");

  /* A2 */
  const civil1 = civilNext();
  const created = await A("POST", "/api/instructors", { AdInstructorCivil: civil1, AdInstructorName: "د. إضافة اختبار", collegeId: 1, sectionId: 1, load: { rankId: rank.id } });
  check(created.status === 201 && created.json.AdInstructorId, "A2 الإضافةُ بسياق القسم تُنشئ الأستاذ", created.json);
  const roster = async () => ((await A("GET", `/api/section-roster?${SCOPE}`)).json.people || []) as any[];
  const mine = (await roster()).find(p => p.id === created.json.AdInstructorId);
  check(mine && mine.rankName === rank.name, "A2 يظهر في «الأساتذة» بدرجته (ومنها ساعاتُه)", mine);
  check(mine && mine.min === rank.minHours && mine.max === rank.maxHours, "A2 حدودُ نصابه من الدرجة", mine);

  /* A3 */
  const civil2 = civilNext();
  /* A2b الدرجةُ لازمةٌ للجميع حتى المدرب (قرار المالك 2026-11-14): بلا درجة 400 ولا يُنشأ أحد. */
  const noRank = await A("POST", "/api/instructors", { AdInstructorCivil: civil2, AdInstructorName: "بلا درجة", collegeId: 1, sectionId: 1 });
  check(noRank.status === 400 && noRank.json.code === "rank-required", "A2b بلا درجة تُرفض الإضافةُ بسياق القسم", noRank.json);
  const noRankTa = await A("POST", "/api/instructors", { AdInstructorCivil: civil2, AdInstructorName: "مدرب بلا درجة", collegeId: 1, sectionId: 1, AdInstructorCategory: "ta" });
  check(noRankTa.status === 400 && noRankTa.json.code === "rank-required", "A2b والمدربُ كذلك: لا استثناء", noRankTa.json);
  const ta = await A("POST", "/api/instructors", { AdInstructorCivil: civil2, AdInstructorName: "مدرب إضافة اختبار", collegeId: 1, sectionId: 1, AdInstructorCategory: "ta", load: { rankId: rank.id } });
  const taRow = (await roster()).find(p => p.id === ta.json.AdInstructorId);
  check(ta.status === 201 && taRow?.AdInstructorCategory === "ta", "A3 «مدرب»: يظهر بتصنيف ta (قائمة المدربين)", taRow);

  /* A4 */
  const civil3 = civilNext();
  const bad = await A("POST", "/api/instructors", { AdInstructorCivil: civil3, AdInstructorName: "لن يُنشأ", collegeId: 1, sectionId: 1, load: { rankId: "لا-توجد" } });
  check(bad.status === 400, "A4 درجةٌ غير موجودة تُرفض", bad.json);
  const retry = await A("POST", "/api/instructors", { AdInstructorCivil: civil3, AdInstructorName: "بعد الرفض", collegeId: 1, sectionId: 1, load: { rankId: rank.id } });
  check(retry.status === 201, "A4 والرقمُ لم يُسجَّل بالرفض: يُقبل بعد التصحيح", retry.json);

  /* A4b رقمٌ مدني لأستاذٍ موجود (المراجِع المستقل): يُضمّ ويُكتب له الدرجةُ إن لم تكن له درجة، ولا تُستبدل قائمة؛ والردُّ يقول ما طُبّق */
  const civilLoose = civilNext();
  const looseUnranked = await A("POST", "/api/instructors", { AdInstructorCivil: civilLoose, AdInstructorName: "قائم بلا درجة" });
  check(looseUnranked.status === 201, "A4b تجهيز: سجلٌّ قائم بلا درجة (إضافةٌ بلا سياق قسم)", looseUnranked.json);
  const noPick = await A("POST", "/api/instructors", { AdInstructorCivil: civilLoose, AdInstructorName: "قائم بلا درجة", collegeId: 1, sectionId: 1 });
  check(noPick.status === 400 && noPick.json.code === "rank-required", "A4b ضمُّه إلى القسم بلا درجة يُرفض ما دامت له لا درجةَ", noPick.json);
  const again = await A("POST", "/api/instructors", { AdInstructorCivil: civilLoose, AdInstructorName: "قائم بلا درجة", collegeId: 1, sectionId: 1, load: { rankId: rank.id } });
  check(again.status === 200 && again.json.existing === true && again.json.loadApplied === true, "A4b وبدرجةٍ يُضمّ وتُكتب الدرجةُ ويقول الردُّ ذلك", again.json);
  const rosterAfter = (await roster()).find(p => p.id === looseUnranked.json.AdInstructorId);
  check(rosterAfter?.rankName === rank.name, "A4b والدرجةُ تظهر في «الأساتذة»", rosterAfter);
  const other = ranks.json.ranks?.[1];
  const third = await A("POST", "/api/instructors", { AdInstructorCivil: civilLoose, AdInstructorName: "قائم بلا درجة", collegeId: 1, sectionId: 1, load: { rankId: (other || rank).id }, AdInstructorCategory: "ta" });
  check(third.status === 200 && third.json.existing === true && third.json.loadApplied === false, "A4b ودرجةٌ قائمة لا تُستبدل، والردُّ يقول إنها لم تُطبَّق", third.json);
  check((await roster()).find(p => p.id === looseUnranked.json.AdInstructorId)?.AdInstructorCategory !== "ta", "A4b و«مدرب» لا يُطبَّق على سجلٍّ قائم");
  const withRank = await A("POST", "/api/instructors", { AdInstructorCivil: civilLoose, AdInstructorName: "قائم بلا درجة", collegeId: 1, sectionId: 1 });
  check(withRank.status === 200 && withRank.json.existing === true, "A4b ومن له درجةٌ يُضمّ إلى قسمٍ آخر دون إعادة اختيارها", withRank.json);

  /* A5 */
  const civil4 = civilNext();
  const loose = await A("POST", "/api/instructors", { AdInstructorCivil: civil4, AdInstructorName: "بلا نطاق", load: { rankId: rank.id } });
  check(loose.status === 201, "A5 إضافةٌ بلا نطاق تنجح (الأدمن)", loose.json);
  const ids = new Set((await roster()).map(p => p.id));
  check(!ids.has(loose.json.AdInstructorId), "A5 ولا تُضمّ إلى القسم", [...ids]);
  const cfg = await A("GET", "/api/admin/teaching-load");
  const assigned = cfg.json?.config?.assignments || cfg.json?.assignments || {};
  check(assigned[String(created.json.AdInstructorId)]?.rankId === rank.id, "A5 (ضابط) درجةُ الأستاذ المضموم مكتوبةٌ في الإعداد", Object.keys(assigned).slice(0, 5));
  check(!assigned[String(loose.json.AdInstructorId)], "A5 ولا تُكتب لها درجةٌ بلا نطاق", assigned[String(loose.json.AdInstructorId)]);

  /* A5b الدرجةُ لا تُمحى من أدوات الجدول: تُغيَّر إلى أخرى من النصاب لا إلى «بلا درجة» */
  const clear = await A("PUT", `/api/section-roster/${created.json.AdInstructorId}`, { collegeId: 1, sectionId: 1, termId: 1, load: {} });
  check(clear.status === 400 && clear.json.code === "rank-required", "A5b محوُ الدرجة يُرفض", clear.json);
  const changeRank = await A("PUT", `/api/section-roster/${created.json.AdInstructorId}`, { collegeId: 1, sectionId: 1, termId: 1, load: { rankId: (ranks.json.ranks?.[1] || rank).id } });
  check(changeRank.status === 200, "A5b وتغييرُها إلى أخرى من النصاب مقبول", changeRank.json);
  const badRank = await A("PUT", `/api/section-roster/${created.json.AdInstructorId}`, { collegeId: 1, sectionId: 1, termId: 1, load: { rankId: "لا-توجد" } });
  check(badRank.status === 400, "A5b ولا تُقبل درجةٌ خارج النصاب", badRank.json);

  /* A6 */
  const retire = await A("PUT", `/api/section-roster/${created.json.AdInstructorId}`, { collegeId: 1, sectionId: 1, termId: 1, status: "retired" });
  const afterRetire = (await roster()).find(p => p.id === created.json.AdInstructorId);
  check(retire.status === 200 && afterRetire?.AdInstructorStatus === "retired", "A6 التقاعد يُسجَّل ويبقى في السجل", afterRetire);
  const sab = await A("PUT", `/api/section-roster/${created.json.AdInstructorId}`, { collegeId: 1, sectionId: 1, termId: 1, status: "sabbatical" });
  const back = await A("PUT", `/api/section-roster/${created.json.AdInstructorId}`, { collegeId: 1, sectionId: 1, termId: 1, status: null });
  const afterBack = (await roster()).find(p => p.id === created.json.AdInstructorId);
  check(sab.status === 200 && back.status === 200 && afterBack?.AdInstructorStatus === null, "A6 المتفرّغ يرجع بإزالة الحالة", afterBack);
}

main().catch(error => { failed++; console.error(error); }).finally(() => {
  stop();
  console.log(`\nRoster add-instructor audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
