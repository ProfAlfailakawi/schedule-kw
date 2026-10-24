/**
 * ── مساري من شبكةٍ مشتركة: ألوف الطلبة خلف عنوانٍ واحد ──────────────────────
 *
 * شبكةُ الجامعة (ومشغّلُ الجوال خلف NAT) عنوانٌ واحدٌ لألوف الطلبة. كان حدُّ
 * الكتابة ستين في الدقيقة لكل عنوان، وحدُّ سؤال الهوية ٢٤٠ في عشر دقائق لكل
 * عنوان، فحُجب ٩٦٪ من ستمئة طالبٍ دخلوا من عنوانٍ واحدٍ في دقيقتين
 * (scripts/loadtest/student-door.mjs، 2026-10-24).
 *
 *   N1  مئاتُ الطلبة المختلفين من عنوانٍ واحد: كلُّهم يسألون ويُنشئون ويدخلون.
 *   N2  الحدُّ لكل طالبٍ باقٍ: طالبٌ واحدٌ يكرّر الكتابة يُوقَف هو وحده.
 *   N3  سقفُ العنوان باقٍ: من يدور على أرقامٍ مدنيةٍ كثيرة يُوقَف عند السقف.
 *   N4  عدّادُ الرغبات يقرأ القسمَ وحده، لا ملفاتِ الكلية كلّها.
 *   R1–R6  الطالبُ الراجع: أخطاءُ غيره على العنوان نفسه لا تحجبه، والتخمينُ يبقى موقوفاً.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { createAttemptLimiter } from "../src/server/publicAttemptLimiter";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const DAY = 86_400_000;

/* ── N4: المصدر ─────────────────────────────────────────────────────────── */
{
  const routes = fs.readFileSync(path.join(process.cwd(), "src/server/studentDoorRoutes.ts"), "utf8");
  const repo = fs.readFileSync(path.join(process.cwd(), "src/db/repository.ts"), "utf8");
  const count = routes.slice(routes.indexOf('"/api/public/me/wishes-count"'), routes.indexOf("/* ── حالاتي"));
  check(count.includes("Repository.getStudentProfilesBySection(sectionId)") && !count.includes("getStudentProfilesByCollege"), "N4 عدّاد الرغبات يقرأ ملفات القسم وحده");
  const bySection = repo.slice(repo.indexOf("getStudentProfilesBySection:"), repo.indexOf("getStudentProfilesByCollege:"));
  check(bySection.includes('.where("AdSectionId", "==", sectionId)') && bySection.includes('.select("AdSectionId", "AdCollegeId", "wishes")'), "N4 الاستعلام بالقسم، وبالحقول التي يحتاجها العدّاد وحدها");
  check(routes.includes('keyGenerator: studentWriteKey') && routes.includes('"STUDENT_DOOR_WRITES_PER_IP_PER_MINUTE", 1200'), "N1 حدّ الكتابة لكل طالب وفوقه سقفٌ لكل عنوان");
  check(!/studentWriteKey[\s\S]{0,400}return civil[^;]*;/.test(routes) && routes.includes("keyHash(civil)"), "N1 مفتاح الحدّ بصمةٌ لا الرقمُ المدني نفسه");
}


/* ── R1–R6: محدِّد أخطاء الرمز على عنوانٍ تقف خلفه شبكةُ جامعة ───────────────
   ساعةٌ كاملة بساعةٍ مزيّفة: يدخل الراجعون بمعدّلٍ ثابت، ونسبةٌ منهم تخطئ في رمزها. */
{
  const simulate = (rate: number, wrong: number, tweak: Record<string, unknown> = {}) => {
    let t = 0;
    const limiter = createAttemptLimiter({ maxFailures: 600, hardMaxFailures: 3000, creditSuccesses: true, windowMs: 600_000, capacity: 20_000, now: () => t, ...tweak });
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let goodBlocked = 0, goodOk = 0;
    for (let s = 0; s < 3600 * rate; s += 1) {
      t = Math.floor((s / rate) * 1000);
      const good = rnd() >= wrong;
      const attempt = limiter.reserve("nat");
      if (!attempt) { if (good) goodBlocked += 1; continue; }
      if (good) { attempt.release(); goodOk += 1; }
    }
    return { goodBlocked, goodOk };
  };
  for (const [rate, wrong] of [[5, 0.1], [5, 0.2], [8, 0.15], [15, 0.2]] as const) {
    const after = simulate(rate, wrong), before = simulate(rate, wrong, { creditSuccesses: false });
    check(after.goodBlocked === 0, `R1 ${rate} دخولٍ/ث وخطأ ${wrong * 100}٪ من عنوانٍ واحد: لا يُحجب صاحبُ رمزٍ صحيح`, after);
    if (rate >= 8 || wrong >= 0.2) check(before.goodBlocked > 0, `R1 (شاهد) المحدِّد القديم كان يحجبهم عند ${rate}/ث و${wrong * 100}٪`, before);
  }

  let t = 0;
  const strict = createAttemptLimiter({ maxFailures: 600, hardMaxFailures: 3000, creditSuccesses: true, windowMs: 600_000, capacity: 20_000, now: () => t });
  for (let i = 0; i < 600; i += 1) strict.fail("bot");
  check(strict.blocked("bot"), "R2 ستمئة تخمينٍ بلا نجاحٍ واحد: العنوان يُوقَف");
  const mixed = createAttemptLimiter({ maxFailures: 600, hardMaxFailures: 3000, creditSuccesses: true, windowMs: 600_000, capacity: 20_000, now: () => t });
  for (let i = 0; i < 3000; i += 1) { mixed.fail("bot"); if (i % 2) { const a = mixed.reserve("bot"); a?.release(); } }
  check(mixed.blocked("bot"), "R3 تخمينٌ وسط نجاحاتٍ مصطنعة يقف عند السقف المطلق");

  const free = createAttemptLimiter({ maxFailures: 600, hardMaxFailures: 3000, creditSuccesses: true, windowMs: 600_000, capacity: 20_000, now: () => t });
  for (let i = 0; i < 2000; i += 1) free.reserve("nat")?.release(false);
  check(!free.blocked("nat"), "R4 ألفا محاولةٍ لم تكن تخميناً (release(false)) لا تُحسب على العنوان");

  const small = createAttemptLimiter({ maxFailures: 3, windowMs: 600_000, capacity: 100, now: () => t });
  for (let i = 0; i < 3; i += 1) small.fail("guesser");
  for (let i = 0; i < 500; i += 1) small.fail(`other-${i}`);
  check(small.blocked("guesser"), "R5 امتلاءُ الخريطة لا يمسح أخطاءَ من يخمّن (كان يُفرَّغ كلُّها)");

  const old = createAttemptLimiter({ maxFailures: 2, now: () => t });
  old.fail("a"); old.fail("a");
  check(old.blocked("a"), "R6 الوضع الافتراضي بلا رصيدٍ كما كان (بقيّة الأبواب العامة)");

  const routes = fs.readFileSync(path.join(process.cwd(), "src/server/studentDoorRoutes.ts"), "utf8");
  const enter = routes.slice(routes.indexOf('"/api/public/me/enter"'), routes.indexOf('"/api/public/me/exit"'));
  check((enter.match(/notGuess\(\)/g) || []).length >= 7, "R2 مسار الدخول يُرجع المحاولة غير التخمينية (400/404/409/423) بلا رصيد");
  check(enter.includes("identityLimiter.fail(ip(req))"), "R2 سؤالُ الوجود عبر 404 يُعدّ في حدّ الهوية");
}

/* ── N1–N3: خادمٌ حقيقي ببياناتٍ مزروعة ────────────────────────────────── */
{
  const PORT = 3400 + Math.floor(Math.random() * 400);
  const BASE = `http://127.0.0.1:${PORT}`;
  const IP_CEILING = 320;
  const W = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const civil = (seed: number) => {
    for (let n = seed; ; n += 1) {
      const body = "29901" + String(n).padStart(6, "0");
      const sum = body.split("").reduce((s, d, i) => s + Number(d) * W[i], 0);
      const c = 11 - (sum % 11);
      if (c <= 9) return { value: body + c, next: n + 1 };
    }
  };
  const civils: string[] = [];
  for (let n = 1; civils.length < 400;) { const made = civil(n); civils.push(made.value); n = made.next; }

  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-door-nat-"));
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [],
    terms: [{ AdTermId: 1, AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 14, AdTermClosed: false, AdTermSubmissionDeadline: add(today, -8),
      AdTermStudentPhases: { wishesOpen: add(today, -3), wishesClose: add(today, 10), rounds: [{ id: "r1", name: "مبكر", start: add(today, 16), end: add(today, 22) }], requestsClose: add(today, 60) } }],
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "EDU", AdCollegeName: "كلية التربية الأساسية — بنين" }],
    sections: [{ AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "ISL", AdSectionName: "قسم التربية الإسلامية" }],
    instructors: [], courses: [], curriculumPlans: [], curriculumPlanCourses: [], courseTransitions: [], schedules: [], rooms: [], studentNeeds: [], studentProfiles: [],
  }), { mode: 0o600 });

  const http = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(BASE + url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    return { status: res.status, json };
  };
  const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };
  let child: ChildProcess | null = null;
  try {
    child = spawn("npx", ["tsx", "server.ts"], {
      env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT), SCHEDULE_PRIVATE_DIR: dir, STUDENT_DOOR_WRITES_PER_IP_PER_MINUTE: String(IP_CEILING) },
      stdio: "ignore", detached: true,
    });
    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) { ready = await up(); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
    if (!ready) throw new Error("الخادم لم يبدأ");

    /* N1: ٣٠٠ سؤال هوية (فوق حدّ ٢٤٠ القديم) و٢٥٠ ملفاً جديداً (فوق ستين القديمة) من عنوانٍ واحد. */
    const asked = await Promise.all(civils.slice(0, 300).map(value => http("POST", "/api/public/me/identity", { civil: value })));
    check(asked.every(r => r.status === 200), "N1 ثلاثمئة طالبٍ يسألون عن ملفّهم من عنوانٍ واحد: لا حجب", asked.filter(r => r.status !== 200).slice(0, 2));
    const made: Array<{ status: number }> = [];
    for (let at = 0; at < 250; at += 25) {
      made.push(...await Promise.all(civils.slice(at, at + 25).map(value => http("POST", "/api/public/me/enter", { civil: value, code: "135790", create: true, agree: true, name: "طالب شبكة مشتركة" }))));
    }
    check(made.every(r => r.status === 201), "N1 مئتان وخمسون طالباً يُنشئون ملفّاتهم من عنوانٍ واحدٍ في دقيقة: كلُّهم يدخلون", made.filter(r => r.status !== 201).slice(0, 2));

    /* N2: طالبٌ واحدٌ يكرّر الدخول برمزٍ خاطئ: يُقفل ملفُّه (٤٢٣)، ثم يقف عند حدّه الشخصي (٤٢٩). */
    const one = civils[0];
    const repeated: number[] = [];
    for (let i = 0; i < 61; i += 1) repeated.push((await http("POST", "/api/public/me/enter", { civil: one, code: "246801" })).status);
    check(repeated.slice(0, 5).every(s => s === 401) && repeated[5] === 423, "N2 خمسة أخطاءٍ على الملف ثم قفلٌ عليه هو", repeated.slice(0, 8));
    check(repeated.includes(429), "N2 تكرارُ طالبٍ واحد يقف عند حدّه الشخصي (ستون في الدقيقة)", repeated.slice(-3));
    const other = await http("POST", "/api/public/me/enter", { civil: civils[1], code: "135790" });
    check(other.status === 200, "N2 وزميلُه على العنوان نفسه يدخل في اللحظة نفسها", other);

    /* N3: من يدور على أرقامٍ كثيرة يقف عند سقف العنوان (هنا ٣٢٠ لتقصير الاختبار؛ الافتراضي ١٢٠٠). */
    const flood: Array<{ status: number; json: any }> = [];
    for (const value of civils.slice(250, 400)) flood.push(await http("POST", "/api/public/me/reset", { civil: value }));
    const capped = flood.filter(r => r.status === 429);
    check(capped.length > 0 && capped.every(r => String(r.json.error || "").includes("هذه الشبكة")), "N3 سقفُ العنوان يوقف الدوران على أرقامٍ كثيرة برسالةٍ تسمّي الشبكة", { capped: capped.length });
  } catch (error) {
    check(false, `N1–N3: ${error instanceof Error ? error.message : error}`);
  } finally {
    if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); } }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
