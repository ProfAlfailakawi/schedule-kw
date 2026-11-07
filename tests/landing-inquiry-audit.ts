/**
 * ── طلبُ الاستعراض من صفحة الهبوط لا يضيع (FR-ENG-027) ────────────────────────
 *
 *   L1  التحقّق: الحقول المطلوبة، و`notes` مقبولٌ مع `message`، وما زاد طوله يُرفض
 *   L2  المسار الحقيقي: طلبٌ صحيح يُحفظ (201)، والمكرّر لا يُنشئ ثانياً، والخاطئ 400، والكبير 413
 *   L3  الفشل: تعذّرُ الحفظ أو توقّفُ القاعدة يُجاب بغير 2xx، ولا استثناءَ له في server.ts
 *   L4  الحد: السادسُ من العنوان نفسه في عشر دقائق 429
 *   L5  الصفحة: تعرض الفشل على غير 2xx وعلى انقطاع الشبكة، والنجاحَ على 2xx وحده
 *   L6  الإدارة: إشعارٌ في الجرس لإدارة النظام وحدها، لا لصفةٍ أكاديمية ولا للصندوق التجريبي
 */
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import http from "http";
import type { AddressInfo } from "net";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "landing-inquiry-audit-"));
process.env.SCHEDULE_PRIVATE_DIR = dir;
process.env.DATA_MODE = "demo";
process.env.NODE_ENV = "development";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};

const { cleanInquiry, createLandingInquiryHandler, canSeeLandingInquiries, landingInquiryNotifications, INQUIRY_LIMITS, INQUIRY_BODY_LIMIT, INQUIRY_ERRORS } = await import("../src/server/landingInquiry");
const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase();
const express = (await import("express")).default;

/* ── L1 ── */
const good = { institution: "كلية التربية الأساسية", name: "د. أحمد", email: "A@Paaet.edu.kw", phone: "email-only", notes: "قسمان\r\nوعشرون شعبة" };
const c1 = cleanInquiry(good);
check(!c1.error && c1.inquiry!.email === "a@paaet.edu.kw" && c1.inquiry!.notes === "قسمان\nوعشرون شعبة" && !("phone" in c1.inquiry!), "التحقّق: `notes` تُقبل، والبريد يُطبَّع، و«email-only» ليس هاتفاً", c1);
const c2 = cleanInquiry({ ...good, notes: undefined, message: "رسالةٌ قديمة" });
check(c2.inquiry?.notes === "رسالةٌ قديمة", "التحقّق: `message` (الاسم القديم) يُقبل أيضاً", c2);
check(cleanInquiry({ ...good, institution: "" }).error === INQUIRY_ERRORS.institution && cleanInquiry({ ...good, name: " " }).error === INQUIRY_ERRORS.name && cleanInquiry({ ...good, email: "bad" }).error === INQUIRY_ERRORS.email, "التحقّق: الجهة والاسم والبريد الصحيح مطلوبة");
check(cleanInquiry({ ...good, notes: "x".repeat(INQUIRY_LIMITS.notes + 1) }).error === INQUIRY_ERRORS.tooLong && cleanInquiry({ ...good, name: "x".repeat(INQUIRY_LIMITS.name + 1) }).error === INQUIRY_ERRORS.tooLong, "التحقّق: ما زاد على الحد يُرفض ولا يُقصّ");
check(cleanInquiry({ ...good, institution: { $gt: "" } }).error === INQUIRY_ERRORS.institution, "التحقّق: كائنٌ مكان نصّ يُرفض");

/* ── L2–L4: خادمٌ صغير بالمسار نفسه وبالترتيب نفسه للمحلّلات ── */
let down = false, breakStore = false;
const app = express();
app.set("trust proxy", true);
app.use("/api/landing/inquiry", express.json({ limit: INQUIRY_BODY_LIMIT }));
app.use(express.json({ limit: "1mb" }));
app.post("/api/landing/inquiry", createLandingInquiryHandler({
  create: entry => { if (breakStore) throw new Error("firestore unavailable"); return Repository.createLandingInquiry(entry); },
  list: () => Repository.listLandingInquiries(),
  databaseDown: () => down,
}));
app.use((error: any, _req: any, res: any, _next: any) => res.status(error?.type === "entity.too.large" ? 413 : 500).json({ error: "x" }));
const server = http.createServer(app);
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = async (body: unknown, ip = "10.0.0.1") => {
  const res = await fetch(`${base}/api/landing/inquiry`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) as any };
};

try {
  const r1 = await post(good);
  const stored = await Repository.listLandingInquiries();
  check(r1.status === 201 && r1.data?.success === true && stored.some(row => row.id === r1.data.id && row.status === "new" && row.notes === "قسمان\nوعشرون شعبة"), "الحفظ: طلبٌ صحيح يُحفظ «جديداً» بملاحظاته ويُجاب 201", { r1, stored });
  const r2 = await post(good);
  check(r2.status === 200 && r2.data?.id === r1.data.id && (await Repository.listLandingInquiries()).length === stored.length, "الحفظ: الضغط المكرّر خلال ساعة لا يُنشئ طلباً ثانياً", r2);
  const r3 = await post({ ...good, email: "x@y.org", notes: undefined, message: "من الاسم القديم" }, "10.0.0.2");
  check(r3.status === 201 && (await Repository.listLandingInquiries()).some(row => row.id === r3.data.id && row.notes === "من الاسم القديم"), "الحفظ: `message` يُحفظ ملاحظةً", r3);
  const r4 = await post({ ...good, email: "nope" }, "10.0.0.3");
  check(r4.status === 400 && r4.data?.success === false, "الرفض: بريدٌ غير صحيح 400", r4);
  const r5 = await post({ ...good, notes: "x".repeat(INQUIRY_LIMITS.notes + 5) }, "10.0.0.3");
  check(r5.status === 400 && r5.data?.error === INQUIRY_ERRORS.tooLong, "الرفض: ملاحظاتٌ أطول من الحد 400", r5);
  const r6 = await post({ ...good, notes: "x".repeat(40_000) }, "10.0.0.4");
  check(r6.status === 413, "الرفض: جسمٌ أكبر من حدّ المسار 413", r6.status);

  /* ── L3 ── */
  breakStore = true;
  const f1 = await post({ ...good, email: "fail@paaet.edu.kw" }, "10.0.0.5");
  breakStore = false;
  check(f1.status === 503 && f1.data?.success === false, "الفشل: تعذّرُ الحفظ يُجاب 503 لا «تم»", f1);
  down = true;
  const f2 = await post({ ...good, email: "down@paaet.edu.kw" }, "10.0.0.6");
  down = false;
  check(f2.status === 503 && f2.data?.success === false, "الفشل: القاعدة متوقّفة 503", f2);
  const serverSrc = fs.readFileSync("server.ts", "utf8");
  check(!serverSrc.includes('req.path === "/landing/inquiry"') && /createLandingInquiryHandler\(\{[\s\S]*?Repository\.createLandingInquiry/.test(serverSrc), "الفشل: لا استثناءَ للمسار حين تتوقّف القاعدة، والمسارُ يحفظ عبر Repository");
  check(!/console\.log\([^)]*email/.test(fs.readFileSync("src/server/landingInquiry.ts", "utf8")), "الخصوصية: السجلّ لا يكتب البريد");

  /* ── L4 ── */
  const codes: number[] = [];
  for (let i = 0; i < 6; i++) codes.push((await post({ ...good, email: `r${i}@paaet.edu.kw` }, "10.0.0.9")).status);
  check(codes.slice(0, 5).every(c => c === 201) && codes[5] === 429, "الحد: خمسةٌ تمرّ والسادس 429", codes);
} finally {
  server.close();
}

/* ── L5: نصُّ الصفحة يُشغَّل بجوابٍ مزيّف ── */
const html = fs.readFileSync("public/landing/index.html", "utf8");
const fnSrc = html.slice(html.indexOf("async function handleInquiry(e)"), html.indexOf("// ── Dynamic Scroll-Triggered Infographic Animations"));
check(fnSrc.length > 200 && fnSrc.includes("res.ok"), "الصفحة: الدالة تفحص res.ok");
async function runPage(fetchImpl: () => Promise<any>) {
  const classes = new Set<string>();
  const box = { textContent: "", classList: { add: (...c: string[]) => c.forEach(x => classes.add(x)), remove: (...c: string[]) => c.forEach(x => classes.delete(x)) } };
  const btn = { disabled: false, textContent: "", insertAdjacentHTML: () => {} };
  let reset = 0;
  const form = { institution: { value: "ك" }, name: { value: "ن" }, email: { value: "a@b.co" }, notes: { value: "م" }, reset: () => { reset++; } };
  const ctx: any = { document: { getElementById: (id: string) => ({ "submit-btn": btn, feedback: box, "inquiry-form": form } as any)[id] }, fetch: fetchImpl, LX: { mail: "" }, JSON };
  vm.createContext(ctx);
  vm.runInContext(`${fnSrc}\nthis.handleInquiry = handleInquiry;`, ctx);
  await ctx.handleInquiry({ preventDefault() {} });
  return { text: box.textContent, error: classes.has("is-error"), active: classes.has("active"), reset };
}
const jsonRes = (status: number, body: any) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const p503 = await runPage(jsonRes(503, { error: "الخدمة متوقفة" }));
check(p503.error && p503.active && p503.text.includes("لم يُرسل") && !p503.text.includes("وصل طلبكم") && p503.reset === 0, "الصفحة: 503 تعرض «لم يُرسل» ولا تمحو النموذج", p503);
const pNet = await runPage(async () => { throw new TypeError("Failed to fetch"); });
check(pNet.error && pNet.text.includes("لم يُرسل") && pNet.text.includes("تعذّر الاتصال"), "الصفحة: انقطاع الشبكة يعرض الفشل", pNet);
const pHtml = await runPage(async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError("html"); } }));
check(pHtml.error && pHtml.text.includes("لم يُرسل"), "الصفحة: جوابٌ ليس JSON يعرض الفشل", pHtml);
const pOk = await runPage(jsonRes(201, { success: true, message: "وصل طلبكم وحُفظ" }));
check(!pOk.error && pOk.active && pOk.text === "وصل طلبكم وحُفظ" && pOk.reset === 1, "الصفحة: النجاح على 2xx وحده، ويُمحى النموذج", pOk);
check(!/catch \(err\) \{\s*box\.textContent = 'تم/.test(html), "الصفحة: لا «تم الإرسال» في مسار الخطأ");

/* ── L6 ── */
const rows = await Repository.listLandingInquiries();
const notes = landingInquiryNotifications(rows);
check(notes.length === rows.length && notes.every(n => n.id.startsWith("landing-inquiry:") && n.tone === "action") && notes.some(n => n.title.includes("كلية التربية الأساسية") && n.detail.includes("a@paaet.edu.kw")), "الإدارة: إشعارٌ لكل طلبٍ جديد فيه الجهة والبريد", notes[0]);
check(landingInquiryNotifications([{ ...rows[0], status: "contacted" }, { ...rows[0], id: "old", createdAt: "2020-01-01T00:00:00Z" }]).length === 0, "الإدارة: ما تمّ التواصل معه أو مضى عليه شهر لا يظهر");
const who = (o: Partial<Parameters<typeof canSeeLandingInquiries>[0]>) => canSeeLandingInquiries({ isRootAdmin: false, isAdminUser: false, academicRole: false, demoRequest: false, ...o });
check(who({ isRootAdmin: true }) && who({ isAdminUser: true }) && !who({ isAdminUser: true, academicRole: true }) && !who({}) && !who({ isRootAdmin: true, demoRequest: true }), "الإدارة: الحساب الرئيسي ومدير النظام يريان، والصفة الأكاديمية والصندوق التجريبي لا", null);
Repository.createDemoSandbox("demo_landing_audit", 60_000);
const inSandbox = await new Promise<{ demo: boolean; id: string; seen: number }>(resolve => {
  const ran = Repository.runDemoSandbox("demo_landing_audit", () => {
    void (async () => {
      const row = await Repository.createLandingInquiry({ institution: "جهة من جلسة تجريبية", name: "زائر", email: "demo@visitor.org" });
      resolve({ demo: Repository.isDemoRequest(), id: row.id, seen: (await Repository.listLandingInquiries()).length });
    })();
  });
  if (!ran) resolve({ demo: false, id: "", seen: -1 });
});
const baseRows = await Repository.listLandingInquiries();
check(inSandbox.demo && baseRows.some(row => row.id === inSandbox.id) && inSandbox.seen === baseRows.length, "الإدارة: طلبُ زائرٍ بجلسةٍ تجريبية يُحفظ في المخزن الحقيقي لا في صندوقه", { inSandbox, all: baseRows.length });
const bell = fs.readFileSync("src/server/routes/notificationsRoutes.ts", "utf8");
check(/canSeeLandingInquiries\(\{[\s\S]*?ROOT_ADMIN_USER_ID[\s\S]*?Repository\.isDemoRequest\(\)[\s\S]*?landingInquiryNotifications\(await Repository\.listLandingInquiries\(\)\)/.test(bell), "الإدارة: الجرس يضيف الطلبات بالبوّابة نفسها");

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
