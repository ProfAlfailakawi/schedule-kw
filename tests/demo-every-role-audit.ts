/**
 * ── كلُّ صفةٍ في التجربة تحكي قصةً كاملة ───────────────────────────────────────
 *
 * ملاحظة المالك (3): يُعرض النظامُ بالتبديل بين الصفات، فكلُّ صفةٍ تُفتح على بيتها ولا تجد صفراً: أرقامٌ
 * حقيقيةُ الشكل، وشيءٌ واحدٌ على الأقل ينتظر فعلها، وإنجازٌ قريب، وقائمةٌ غيرُ فارغة في كل شاشةٍ أساسية.
 * جولةٌ حيّة كشفت أن لوحة البداية تقرأ أحدثَ فصلٍ في القائمة (الثاني)، وكان بلا موعد: فكانت كلُّ صفةٍ
 * تُفتح على «0» وحملِ أسبوعٍ فارغ؛ وأن رصيد مقاعد المرشد بلا سعةٍ ولا إضافة؛ وأن لوحة القرار عند
 * العميدين صفرٌ لقسمين من ثلاثة.
 *
 * خادمٌ تجريبيٌّ حقيقي على منفذٍ حرّ، ودخولٌ (T0 < 6 ثوانٍ)، ثم كلُّ صفةٍ في مبدّل الصفات تُقرأ من واجهاتها:
 *   R1 البيت: لوحةُ البداية بمواعيد وحملِ أسبوعٍ غيرِ صفري — وللمرشدَين بيتُهما كشفُ التسجيل.
 *   R2 ما ينتظر الفعل: لكل صفةٍ بندٌ في جرسها، وما يخصّها (وارد التسجيل، طلبُ التمديد، الإرجاع، طلبات الأساتذة…).
 *   R3 إنجازٌ قريب: جدولٌ معتمد أو طالبٌ سُجّل.
 *   R4 الشاشات الأساسية غيرُ فارغة: كشف التسجيل، رصيد المقاعد، لوحة القرار، تغييرات الجدول، الرادار.
 */
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

const ADVISORS = new Set(["advisor", "advisorGeneral"]);
const DEANS = new Set(["dean", "viceDean"]);
const REGISTRAR_DESK = new Set(["registrarDean", "registrarHead", "collegeRegistrar"]);
const PERSONAL = new Set(["departmentHead", "committeeChair", "standard"]);

let server: LiveServer | null = null;
try {
  server = await startDemoServer("demo-every-role");
  const BASE = server.base;
  const startedAt = Date.now();
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const loginMs = Date.now() - startedAt;
  check(login.status === 200 && loginMs < 6000, `T0 الدخول التجريبي أقلّ من ست ثوانٍ (${loginMs} ms)`, { status: login.status });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  const payload = await login.json() as any;
  await waitForDemoSeed(BASE, cookie);
  const call = async (url: string, init: RequestInit = {}): Promise<{ status: number; json: any }> => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(BASE + url, { ...init, headers: { cookie, ...(init.body ? { "content-type": "application/json" } : {}) } });
      if (response.status === 429 && attempt < 4) { await new Promise(r => setTimeout(r, 15_000)); continue; }
      let json: any = null; try { json = await response.json(); } catch { /* غير JSON */ }
      return { status: response.status, json };
    }
  };
  const get = async (url: string) => (await call(url)).json as any;

  const roles: string[] = (payload.demo?.roles || []).map((row: any) => String(row.role));
  check(roles.length >= 11 && ["dean", "registrarStaff", "advisor", "advisorGeneral", "collegeRegistrar"].every(role => roles.includes(role)),
    `مبدّلُ الصفات يعرض كلَّ الصفات (${roles.length})`);
  const q = (sectionId: number, termId = 1) => `collegeId=1&sectionId=${sectionId}&termId=${termId}`;

  for (const role of roles) {
    const switched = await call("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) });
    if (switched.status !== 200) { check(false, `تبديل الصفة «${role}»`, switched.status); continue; }
    const perms: number[] = switched.json.permissions || [];
    const sectionIds = [...new Set((switched.json.scopes || []).map((s: any) => Number(s.AdSectionId)).filter(Boolean))] as number[];
    const ownSection = sectionIds.includes(1) ? 1 : sectionIds[0] || 1;
    const bell = await get("/api/notifications");

    /* ── R1 البيت ── */
    if (ADVISORS.has(role)) {
      const reg = await call(`/api/student-registration?${q(ownSection)}`);
      const t = reg.json?.totals || {};
      check(reg.status === 200 && t.students > 0 && t.courses > 0, `R1 «${role}»: بيتُه كشفُ التسجيل بطلبةٍ ومقررات`, t);
      check(t.pendingCommittee + t.waiting > 0, `R2 «${role}»: حالاتٌ تنتظر (اللجنة أو التسجيل)`, t);
      check(t.registered > 0, `R3 «${role}»: طلبةٌ سُجّلوا`, t);
    } else {
      const dash = await get("/api/dashboard");
      const ws = dash?.workspace || {};
      const week = (ws.weekdayLoad || []).reduce((sum: number, day: any) => sum + Number(day.count || 0), 0);
      check(Number(ws.activeSchedules) > 0 && week > 0, `R1 «${role}»: لوحةُ البداية بمواعيد وحملِ أسبوعٍ غيرِ صفري (${ws.activeSchedules} · ${week})`, { term: dash?.latestTermName, mode: ws.mode });
      check(Number(dash?.metrics?.courses) > 0 && (dash?.history || []).length >= 2 && dash.history.every((h: any) => h.schedules > 0),
        `R1 «${role}»: وخطُّ الفصول بلا فصلٍ فارغ`, dash?.history);
      if (PERSONAL.has(role)) check(ws.mode === "personal" && Number(ws.activeSchedules) >= 2, `R1 «${role}»: لوحتُه الشخصية بمواعيده هو في الفصل القادم`, ws.mode);
    }

    /* ── R2 ما ينتظر الفعل ── */
    check((bell?.items || []).length > 0, `R2 «${role}»: في الجرس ما يستحق الانتباه (${(bell?.items || []).length})`);
    const inbox = await call("/api/approvals/inbox?termId=1");
    const inboxRows: any[] = inbox.json?.rows || [];
    if (REGISTRAR_DESK.has(role)) {
      check(inboxRows.some(row => row.status === "submitted"), `R2 «${role}»: في الوارد جدولٌ ينتظر قرار التسجيل`, inboxRows.map(row => row.status));
      check(inboxRows.some(row => row.status === "accepted"), `R3 «${role}»: وجدولٌ اعتُمد`, inboxRows.map(row => row.status));
    }
    if (role === "registrarStaff") {
      const reg = await get(`/api/student-registration?${q(ownSection)}`);
      check(Number(reg?.totals?.waiting) > 0 && Number(reg?.totals?.registered) > 0, "R2/R3 «registrarStaff»: حالاتٌ بانتظار التسجيل، وأخرى سُجّلت", reg?.totals);
    }
    if (role === "departmentHead" || role === "committeeChair") {
      const changes = await get(`/api/reports/schedule-changes?${q(1)}`);
      check(changes?.approval?.status === "returned" && Number(changes?.rowCount) > 0, `R2 «${role}»: جدولٌ أرجعه التسجيل بملاحظاتٍ ينتظر القسم`, changes?.approval?.status);
    }
    if (role === "committeeChair") {
      const requests = await get(`/api/instructor-requests?${q(1)}`);
      check((requests?.rows || []).length > 0, "R2 «committeeChair»: رغباتُ أساتذةٍ في الوارد", requests?.totals);
      /* «الإنذار المبكر» على لوحته يُقرأ معقولاً: كان «ناقص 254 شعبة» وتغطيةُ الطلب 8% — متبقٍّ لم يُقَس بسعة المقاعد الضيّقة. */
      const forecast = await get(`/api/forecast/term?${q(1)}`);
      check(forecast?.status === "ready" && Number(forecast?.coverage?.percent) >= 50 && Number(forecast?.shortCourses) > 0,
        `R4 «committeeChair»: الإنذارُ المبكر بتغطيةٍ معقولة ونقصٍ يُعالَج (${forecast?.coverage?.percent}% · ${forecast?.shortCourses})`, forecast?.highlights);
    }

    /* ── R3/R4 لوحة القرار عند العميدين: لكل قسمٍ في كليتهما تخطيطٌ تُقرأ منه الدرجات ── */
    if (DEANS.has(role)) {
      for (const sectionId of [1, 2, 3]) {
        const stats = await call(`/api/registration-stats?${q(sectionId)}`);
        const accepted = stats.json?.accepted || stats.json?.stats?.accepted || {};
        check(stats.status === 200 && Object.keys(accepted).length > 0, `R4 «${role}»: لوحةُ القرار تقرأ تخطيطاً للقسم ${sectionId}`, stats.status);
      }
      check(inboxRows.some(row => row.status === "accepted"), `R3 «${role}»: جدولٌ معتمد في كليته`, inboxRows.map(row => row.status));
      const upcoming = await get("/api/approvals/inbox?termId=2");
      check((upcoming?.rows || []).some((row: any) => row.status === "accepted"), `R3 «${role}»: وقسمٌ سبق فاعتُمد جدولُ فصله القادم`);
    }

    /* ── R4 «طلبات الشعب» (الإرشاد ← اللجنة ← التسجيل): طلبٌ في كل مرحلة، والمرسَلُ للتوّ بطلبة «مساري» ── */
    if (ADVISORS.has(role) || role === "committeeChair" || role === "registrarStaff") {
      const list = await call("/api/section-requests?termId=1");
      const rows: any[] = list.json?.rows || [];
      const stages = new Set(rows.map(row => row.stage));
      check(list.status === 200 && ["sent", "opened", "registering", "registered", "declined"].every(stage => stages.has(stage)),
        `R4 «${role}»: طلباتُ الشعب في كل مرحلة (${[...stages].join("، ")})`, list.status);
      const fresh = rows.find(row => row.stage === "sent");
      check(Boolean(fresh) && fresh.courseCode === "0109343" && fresh.period === "evening" && fresh.students.some((s: any) => s.source === "masari"),
        `R4 «${role}»: المرسَلُ للتوّ «تصميم وإنتاج الوسائط المتعددة» مسائيةً بطلبة «مساري»`, fresh && { c: fresh.courseCode, n: fresh.students?.length });
      const partial = rows.find(row => row.stage === "registering");
      check(partial?.counts?.approved === 6 && partial?.counts?.listed === 8 && partial?.counts?.registered === 3, `R4 «${role}»: اعتُمد 6 من 8 وسُجّل ثلاثة`, partial?.counts);
      check(Boolean(rows.find(row => row.stage === "declined")?.closedNote), `R4 «${role}»: والاعتذارُ بسببه`);
    }

    /* ── R4 «لم نصل بعد إلى هذا المستوى»: قصةٌ واضحة لا خمسة عشر قفلاً ── */
    if (role === "committeeChair") {
      const listOf = (body: any): any[] => Array.isArray(body) ? body : body?.rows || body?.courses || [];
      const codeOf = new Map(listOf(await get("/api/courses")).map((c: any) => [Number(c.AdCourseId), String(c.CourseCode)]));
      const idOf = (code: string) => [...codeOf].find(([, value]) => value === code)?.[0] || 0;
      const first = await get(`/api/course-reach?${q(1)}`), second = await get(`/api/course-reach?${q(1, 2)}`);
      const firstRows: any[] = listOf(await get(`/api/schedules?${q(1)}`));
      const lockedWithSections = [...new Set(firstRows.map(row => Number(row.AdCourseId)))].filter(id => first?.courses?.[id]?.state === "locked");
      check(lockedWithSections.length >= 3 && lockedWithSections.length <= 6, `R4 «لم نصل بعد»: ملاحظةُ المراجعة في الأول قصيرة (${lockedWithSections.length} مقررات مقفلة لها شعب)`, lockedWithSections.map(id => codeOf.get(id)));
      check(first?.courses?.[idOf("0109343")]?.overridden === true, "R4 «افتحه للطرح»: فتح القسمُ 343 في الأول");
      const target = second?.courses?.[idOf("0109453")];
      check(target?.state === "locked" && target?.why === "prereq-missing" && /المتطلب 346 لم يُطرح/.test(target?.reason || "")
        && (target?.chain || []).map((n: any) => `${n.code}:${n.state}`).join(">") === "323:ok>346:missing>453:target",
        "R4 السلسلة في الثاني: 323 طُرح ← 346 لم يُطرح ← 453 «المتطلب 346 لم يُطرح»", target?.chain);
      check(second?.courses?.[idOf("0109346")]?.state === "reached", "R4 و346 وصلناه في الثاني (متطلبه 323 طُرح في الأول)");
      check(second?.courses?.[idOf("0109410")]?.why === "coreq-locked", "R4 التوأم: 410 مقفلٌ لأن توأمه 459 لم يُفتح", second?.courses?.[idOf("0109410")]?.reason);
      check(first?.courses?.[idOf("0109324")]?.state === "reached" && first?.courses?.[idOf("0109324")]?.why === "prereqs-met",
        "R4 الصيفي فتح مقرراً: 324 وصلناه في الأول لأن متطلبه 314 طُرح في «الصيفي 2025/2026» وحده");
    }

    /* ── R4 رصيد مقاعد المرشد: لمن يملك الكشف ── */
    if (perms.includes(7) || perms.includes(14)) {
      const seats = await call(`/api/advisor-seats?${q(1)}`);
      const sections: any[] = seats.json?.sections || [];
      if (seats.status === 200) {
        check(sections.length > 0 && sections.every(row => row.state?.capacity > 0), `R4 «${role}»: رصيدُ المقاعد بسعةٍ أساسية لكل شعبة (${sections.length})`);
        check(sections.some(row => row.state?.advisorAdded > 0) && sections.some(row => row.state?.tone === "red") && (seats.json?.requests || []).length > 0,
          `R4 «${role}»: مقاعدُ أضافها المرشدان، وشعبةٌ امتلأت، وطلبُ استثناءٍ ينتظر (تحتاج شعبة)`, { n: seats.json?.nearFull?.length, r: seats.json?.requests?.length });
      }
    }
  }
} finally {
  await server?.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed || process.exitCode ? 1 : 0);
