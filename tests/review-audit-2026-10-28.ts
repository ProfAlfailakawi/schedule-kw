/**
 * ── مراجعة 2026-10-28: أربعُ ثغراتٍ صغيرة أُغلقت، وتُحرس هنا ──────────────────────
 *
 *  R1 رابطُ الطلب الشخصي لا يفتح جدولَ القسم من الواجهة (/api/public/schedule و/ics)،
 *     كما لا يفتحه من صفحة /s.
 *  R2 اسمُ القسم داخل <script> صفحة /s لا يغلق الوسم («</script>» يُكتب ‎\u003c/script>).
 *  R3 عضويةُ المنتدبين في الفصل تُختار من دليل القسم: رقمُ موظفٍ حرّ يُرفض (كان يُرفع
 *     بعدها بـ«نسخ الفصل» إلى الدليل الدائم فتُقرأ بياناته كاملةً ويُعدَّل سجلُّه).
 *  R4 الصندوقُ التجريبي المنتهي يُكنس ولو لم يعد صاحبه.
 *
 * خادمٌ حقيقيّ في وضع التجربة على منفذٍ حرّ (helpers/liveServer).
 */
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import { Repository } from "../src/db/repository";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

/* R4 — بلا خادم: صندوقان منتهيان وثالثٌ حيّ؛ الكنسُ يُبقي الحيَّ وحده. */
{
  const before = Repository.demoSandboxCount();
  Repository.createDemoSandbox("demo_review_old_a", 1);
  Repository.createDemoSandbox("demo_review_old_b", 1);
  Repository.createDemoSandbox("demo_review_live", 60_000);
  await new Promise(resolve => setTimeout(resolve, 10));
  const removed = Repository.sweepExpiredDemoSandboxes();
  check(removed >= 2 && Repository.demoSandboxCount() === before + 1, "R4 الصناديق المنتهية تُكنس ويبقى الحيّ", { before, removed, after: Repository.demoSandboxCount() });
  Repository.dropDemoSandbox("demo_review_live");
}

let server: LiveServer | null = null;
try {
  server = await startDemoServer("review-audit");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(BASE + url, { ...init, headers: { cookie, ...(init.body ? { "content-type": "application/json" } : {}) } });
    const text = await response.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* ليس JSON */ }
    return { status: response.status, json, text };
  };

  const sections: any[] = (await call("/api/sections")).json || [];
  const terms: any[] = (await call("/api/terms")).json || [];
  /* رابطُ طلبٍ بذره العرض، ونطاقُه (الكلية والقسم والفصل). */
  let requestLink: any = null, scope: { collegeId: number; sectionId: number; termId: number } | null = null;
  for (const section of sections) {
    for (const term of terms) {
      const q = `collegeId=${section.AdCollegeId}&sectionId=${section.AdSectionId}&termId=${term.AdTermId}`;
      const links: any[] = (await call(`/api/share?${q}`)).json || [];
      const found = Array.isArray(links) ? links.find(link => link.kind === "request") : null;
      if (found) { requestLink = found; scope = { collegeId: Number(section.AdCollegeId), sectionId: Number(section.AdSectionId), termId: Number(term.AdTermId) }; break; }
    }
    if (requestLink) break;
  }
  check(Boolean(requestLink && scope), "R0 العرضُ فيه رابطُ طلبٍ شخصي", { sections: sections.length, terms: terms.length });
  if (requestLink && scope) {
    const created = await call("/api/share", { method: "POST", body: JSON.stringify({ ...scope, days: 30, showInstructors: false, kind: "department" }) });
    const deptId = created.json?.id || created.json?.link?.id;
    check(created.status < 300 && Boolean(deptId), "R0 رابطُ قسمٍ جديد", { status: created.status, body: created.text.slice(0, 200) });

    /* R1 */
    const reqSchedule = await fetch(`${BASE}/api/public/schedule/${encodeURIComponent(requestLink.id)}`);
    const reqIcs = await fetch(`${BASE}/api/public/ics/${encodeURIComponent(requestLink.id)}`);
    check(reqSchedule.status === 404 && reqIcs.status === 404, "R1 رابطُ الطلب لا يفتح جدولَ القسم ولا تقويمَه", { schedule: reqSchedule.status, ics: reqIcs.status });
    const deptSchedule = await fetch(`${BASE}/api/public/schedule/${encodeURIComponent(deptId)}`);
    const deptIcs = await fetch(`${BASE}/api/public/ics/${encodeURIComponent(deptId)}`);
    check(deptSchedule.status === 200 && deptIcs.status === 200, "R1 رابطُ القسم يبقى يفتح جدولَه وتقويمَه", { schedule: deptSchedule.status, ics: deptIcs.status });

    /* R2 */
    const section = sections.find(row => Number(row.AdSectionId) === scope!.sectionId);
    const hostile = `${section.AdSectionName}</script><b id="r2">`;
    const renamed = await call(`/api/sections/${section.AdSectionId}`, { method: "PUT", body: JSON.stringify({ AdCollegeId: section.AdCollegeId, AdSectionCode: section.AdSectionCode, AdSectionName: hostile }) });
    check(renamed.status === 200, "R2 إعادةُ تسمية القسم (للفحص)", { status: renamed.status, body: renamed.text.slice(0, 200) });
    const page = await (await fetch(`${BASE}/s/${encodeURIComponent(deptId)}`)).text();
    const scripts = page.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || [];
    const calendarScript = scripts.find(chunk => chunk.includes("calLinks(")) || "";
    check(calendarScript.includes("\\u003c/script>") && !page.includes('</script><b id="r2">'), "R2 اسمُ القسم لا يغلق وسمَ السكربت في صفحة /s", { found: calendarScript.slice(-200) });
    await call(`/api/sections/${section.AdSectionId}`, { method: "PUT", body: JSON.stringify({ AdCollegeId: section.AdCollegeId, AdSectionCode: section.AdSectionCode, AdSectionName: section.AdSectionName }) });

    /* R3 */
    const q = `collegeId=${scope.collegeId}&sectionId=${scope.sectionId}&termId=${scope.termId}`;
    const roster: number[] = (await call(`/api/visiting-roster?${q}`)).json?.instructorIds || [];
    const directory: number[] = (await call(`/api/department-delegates?collegeId=${scope.collegeId}&sectionId=${scope.sectionId}`)).json?.instructorIds || [];
    const known = new Set([...roster, ...directory].map(Number));
    const everyone: any[] = (await call("/api/instructors")).json || [];
    const stranger = everyone.map(person => Number(person.AdInstructorId)).find(id => id && !known.has(id));
    check(Boolean(stranger), "R3 في الجامعة من ليس في دليل القسم", { everyone: everyone.length });
    const farTerm = 999_999;
    const forged = await call("/api/visiting-roster", { method: "PUT", body: JSON.stringify({ collegeId: scope.collegeId, sectionId: scope.sectionId, termId: farTerm, instructorIds: [stranger] }) });
    check(forged.status === 400, "R3 رقمُ موظفٍ من خارج دليل القسم لا يدخل الفصل", { status: forged.status });
    const copied = await call("/api/visiting-roster/copy", { method: "POST", body: JSON.stringify({ collegeId: scope.collegeId, sectionId: scope.sectionId, fromTermId: farTerm, toTermId: scope.termId, instructorIds: [stranger] }) });
    const directoryAfter: number[] = (await call(`/api/department-delegates?collegeId=${scope.collegeId}&sectionId=${scope.sectionId}`)).json?.instructorIds || [];
    check(!directoryAfter.map(Number).includes(Number(stranger)), "R3 ولا يُرفع بـ«نسخ الفصل» إلى دليل القسم", { copy: copied.json });
    const same = await call("/api/visiting-roster", { method: "PUT", body: JSON.stringify({ ...scope, instructorIds: roster }) });
    check(same.status === 200, "R3 حفظُ الفصل بمن فيه يبقى يعمل", { status: same.status, body: same.text.slice(0, 200) });
    if (directory.length) {
      const fromDirectory = await call("/api/visiting-roster", { method: "PUT", body: JSON.stringify({ ...scope, instructorIds: [...new Set([...roster, directory[0]])] }) });
      check(fromDirectory.status === 200, "R3 وإضافةُ منتدبٍ من دليل القسم تبقى تعمل", { status: fromDirectory.status });
      await call("/api/visiting-roster", { method: "PUT", body: JSON.stringify({ ...scope, instructorIds: roster }) });
    }
  }
} catch (error) {
  failed++;
  console.error(error);
} finally {
  await server?.stop();
}

console.log(`review-audit-2026-10-28: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
