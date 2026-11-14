/**
 * ── إضافات «مساري» على خادمٍ حقيقيّ ───────────────────────────────────────────
 *
 * من الباب إلى الباب: ملفٌّ حقيقيٌّ بجلسةٍ حقيقية ← اشتراكُ جهاز ← رابطُ مشاركة (يُفتح كأنّه من هاتف المرشد بلا كوكي)
 * ← تغييرُ الرمز يُسقط الاثنين ← حذفُ الملف يُسقط الرابط. وصفحةُ مساري تحمل البطاقات، وCSP يسمح بعاملنا وبصفحة المشاركة.
 */
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import { b64u } from "../src/server/webPush";

let passed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => { if (!ok) console.log("✗ " + label, extra === undefined ? "" : JSON.stringify(extra).slice(0, 300)); assert.ok(ok, label); passed++; console.log("✓ " + label); };

const W = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const civil = (seed: number) => {
  for (let n = seed; ; n += 1) {
    const body = "3050613" + String(n).padStart(4, "0");
    const sum = body.split("").reduce((s, d, i) => s + Number(d) * W[i], 0);
    const c = 11 - (sum % 11);
    if (c <= 9) return body.slice(0, 11) + c;
  }
};

let server: LiveServer | null = null;
try {
  server = await startDemoServer("student-extras");
  const BASE = server.base;
  let jar = "";
  const http = async (method: string, url: string, body?: unknown, cookie?: string) => {
    const res = await fetch(BASE + url, { method, headers: { "content-type": "application/json", ...((cookie ?? jar) ? { cookie: cookie ?? jar } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* صفحة */ }
    const cookies = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() as string[] : [];
    return { status: res.status, headers: res.headers, text, json, cookies };
  };
  const ID = civil(31), CODE = "135790", NEWCODE = "482615", NAME = "طالب تجريبي ثلاثي";
  const made = await http("POST", "/api/public/me/enter", { civil: ID, code: CODE, create: true, agree: true, name: NAME });
  check(made.status === 201, "إنشاءُ ملفٍّ حقيقي", made.json);
  jar = (made.cookies[0] || "").split(";")[0];

  /* اختيارُ قسمٍ من بيانات التجربة ليكتمل الملف */
  const girls = (await http("GET", "/api/public/me/catalog?track=girls")).json, boys = (await http("GET", "/api/public/me/catalog?track=boys")).json;
  const spec = [...(girls.specializations || []), ...(boys.specializations || [])][0];
  if (spec) {
    const plan = (await http("GET", `/api/public/me/plan?sectionId=${spec.id}`)).json;
    const planId = plan?.plans?.length ? plan.plans[0].id : undefined;
    const saved = await http("PUT", "/api/public/me/profile", { sectionId: spec.id, ...(planId ? { curriculumPlanId: planId } : {}), passedCourseIds: [] });
    check(saved.status === 200 && saved.json.setupDone, "ملفٌّ مكتمل بقسمٍ من بيانات التجربة", saved.json);
  }

  /* الحالة */
  const extras = await http("GET", "/api/public/me/extras");
  check(extras.status === 200 && extras.json.push.configured === true && extras.json.share.active === false && "next" in extras.json, "GET extras: التنبيهاتُ مفعَّلة، لا مشاركةَ، ولا محاضرة (لا جدول)", extras.json);
  check(extras.json.next === null, "بلا جدولٍ مقترحٍ وفصلٍ جارٍ: لا بطاقة محاضرة");
  check((await http("GET", "/api/public/me/extras", undefined, "")).status === 401, "بلا جلسة: ٤٠١");
  check(!extras.text.includes(ID), "الردُّ بلا رقمٍ مدني");

  /* اشتراك جهاز */
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/live-test-device", keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(randomBytes(16)) } };
  const sub = await http("POST", "/api/public/me/push", { subscription });
  check(sub.status === 200 && sub.json.count === 1 && !sub.text.includes(ID) && !sub.text.includes("fcm.googleapis.com"), "اشتراكُ جهازٍ بجلسةٍ حقيقية", sub.json);
  check((await http("GET", "/api/public/me/extras")).json.push.ids.length === 1, "الحالةُ ترى الجهاز");

  /* رابط المشاركة */
  const share = await http("POST", "/api/public/me/share", {});
  check(share.status === 200 && share.json.url.startsWith(BASE + "/me/share/") && share.json.svg.startsWith("<svg") && !share.text.includes(ID), "رابطُ مشاركة ورمزُ QR", share.json?.url);
  const link = share.json.url as string;
  const pageRes = await http("GET", new URL(link).pathname, undefined, "");
  check(pageRes.status === 200 && /للقراءة فقط · تنتهي المشاركة في/.test(pageRes.text), "الصفحةُ العامة تُفتح بلا كوكي (كهاتف المرشد)");
  check(!pageRes.text.includes(ID) && !pageRes.text.includes(NAME) && !/codeHash|nameCipher|civilCipher|fingerprint/i.test(pageRes.text), "ولا اسمَ ولا رقمَ مدنياً ولا حقلاً حسّاساً");
  check(pageRes.headers.get("cache-control") === "no-store" && /noindex/.test(pageRes.headers.get("x-robots-tag") || "") && (pageRes.headers.get("content-security-policy") || "").includes("default-src 'none'"), "no-store وnoindex وCSP صارمة (ترويسةُ الصفحة لا ترويسةُ الموقع العامة)");
  check(!/<script/i.test(pageRes.text), "بلا سكربت");
  check((await http("GET", `/me/share/${link.split("/me/share/")[1]}x`, undefined, "")).status === 404, "رمزٌ مبتور: ٤٠٤");
  const html = await http("GET", "/me", undefined, "");
  check(html.status === 200 && html.text.includes("extrasHook") && html.text.includes("gx-next") && html.text.includes("worker-src") === false, "صفحةُ مساري تحمل البطاقات");
  check((html.headers.get("content-security-policy") || "").includes("worker-src 'self'"), "وCSP صفحة مساري تسمح بعاملٍ من الموقع نفسه (عاملُ التنبيهات)");
  const worker = await http("GET", "/push-sw.js", undefined, "");
  check(worker.status === 200 && /javascript/.test(worker.headers.get("content-type") || "") && worker.text.includes("notificationclick"), "عاملُ التنبيهات يُخدم");

  /* تغيير الرمز يُسقط الاثنين */
  const changed = await http("POST", "/api/public/me/code", { oldCode: CODE, newCode: NEWCODE, remember: false });
  check(changed.status === 200, "تغييرُ الرمز", changed.json);
  jar = (changed.cookies[0] || "").split(";")[0] || jar;
  const afterChange = await http("GET", "/api/public/me/extras");
  check(afterChange.status === 200 && afterChange.json.push.ids.length === 0 && afterChange.json.share.active === false, "بعد تغيير الرمز: لا أجهزةَ ولا مشاركة", afterChange.json);
  check((await http("GET", new URL(link).pathname, undefined, "")).status === 404, "ورابطُ المرشد القديم لم يعد يعمل");

  /* مشاركةٌ جديدة ثم حذفُ الملف */
  const again = await http("POST", "/api/public/me/share", {});
  check((await http("GET", new URL(again.json.url).pathname, undefined, "")).status === 200, "مشاركةٌ جديدة بعد تغيير الرمز");
  const forget = await http("POST", "/api/public/me/forget", { code: NEWCODE });
  check(forget.status === 200, "حذفُ الملف", forget.json);
  check((await http("GET", new URL(again.json.url).pathname, undefined, "")).status === 404, "وبحذف الملف يسقط رابطُ المشاركة");
} finally { await server?.stop(); }

console.log(`\n${passed} فحصاً نجحت.`);
process.exit(0);
