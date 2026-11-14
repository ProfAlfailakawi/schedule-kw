/**
 * ── «مساري»: محاضرتك القادمة · تذكيرٌ يصل وحده · شارك مرشدك ──────────────────
 *
 * ثلاثُ ميزاتٍ للطالب في ملفٍّ واحد كي لا يتضخّم studentDoorRoutes.ts؛ تُسجَّل منه بسطرٍ واحد (registerStudentExtras)
 * وتأخذ منه أدواتِ الباب نفسَها (الجلسة وحدُّ الكتابة والكتالوج وملخّص الملف).
 *
 *   ١) محاضرتك القادمة: `GET extras` يحمل مواعيدَ الخطة «أ» من «جدولي المقترح» وحدَّي الفصل إن كان الفصلُ جارياً
 *      وللطالب جدولٌ؛ والحسابُ والعدّ التنازلي في المتصفح بدالةٍ نقيّة واحدة (utils/nextLecture).
 *   ٢) التنبيهات (Web Push): اشتراكاتُ أجهزته على **ملفّه** (مفتاحُه البصمة، لا الرقمُ المدني)، تسقط بتغيير الرمز وبالاستعادة
 *      وبحذف الملف. ثلاثُ رسائل لكلٍّ منها مرةٌ لكل طالبٍ في كل فصل (علامةٌ ذرّيةٌ تُكتب **قبل** الإرسال، فنسختان من
 *      الخادم لا تُرسلان رسالةً مرتين). مُرسِلٌ مجدول (scheduleStudentPush) بدفعاتٍ محدودة لا يعطّل الإقلاع.
 *      بلا مفاتيح VAPID لا شيء يُرمى: الواجهة تقول السبب والرسائلُ لا تُرسل.
 *   ٣) شارك مرشدك: رمزٌ لأربعٍ وعشرين ساعة (studentShare.ts)، وصفحةٌ عامة للقراءة فقط (studentSharePage.ts).
 *
 * لا يخرج من هنا رقمٌ مدنيٌّ ولا بصمةٌ في أيّ ردّ أو رسالة أو رابط.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { Repository } from "../db/repository";
import type { StudentProfile, StudentPushSub } from "../types";
import { pickDoorTerm, readStudentPhase } from "../utils/termStudentPhases";
import { kuwaitDateISO } from "../utils/approvalWorkflow";
import { calendarSpanForTerm } from "../utils/icalendar";
import { offeringBlocked } from "../utils/courseOffering";
import { DEFAULT_TERM_UNITS } from "../utils/studentProfile";
import { studentUnitFloorOf } from "../utils/studentUnitCap";
import {
  pushMarkerKey, pushTestMessage, studentPushDue, studentPushMessage, type StudentPushKind, type StudentPushMessageText,
} from "../utils/studentPush";
import { offeringStatesForTerm } from "./offeringStates";
import { ticketContext, universityUnitCap } from "./simulationData";
import { readCookie } from "./studentDoor";
import { SHOWCASE_COOKIE } from "./studentShowcase";
import { issueShare, readShareToken, shareQrSvg, shareState } from "./studentShare";
import { renderShareGone, renderSharePage, type ShareMeeting, type ShareSnapshot } from "./studentSharePage";
import {
  createPushRateLimiter, createVapidKeyResolver, deviceLabel, pushSubscriptionId, pushTopic, readPushSubscription, sendWebPush,
  type PushFetch, type VapidKeys,
} from "./webPush";

export interface StudentExtrasContext {
  requireDoor: RequestHandler;
  doorOf: (res: Response) => { fingerprint: string; profile: StudentProfile };
  writeLimit: RequestHandler[];
  identityKey: () => Promise<Buffer>;
  /** ملخّصُ الملف كما يراه صاحبُه (القسم والصحيفة والتقدّم) — يُنتقى منه فقط. */
  summaryOf: (profile: StudentProfile) => Promise<any>;
  sectionCatalog: (sectionId: number) => Promise<{ courses: Map<number, { code: string; name: string; credit: number }> }>;
  fail: (res: Response, status: number, error: string, code?: string, extra?: Record<string, unknown>) => void;
}

export interface StudentExtrasOptions {
  /** للاختبار: مفاتيحُ VAPID (أو رفضٌ ليظهر السلوكُ بلا إعداد)، وخدمةُ دفعٍ وهمية، وساعة. */
  vapid?: () => Promise<VapidKeys>;
  fetchImpl?: PushFetch;
  now?: () => number;
}

/** أقصى أجهزةٍ لطالبٍ واحد: الأقدمُ يسقط. */
export const STUDENT_PUSH_MAX_DEVICES = 5;

const intFromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
};

/* ── المفاتيح: مفتاحا المشغّل إن ضُبطا، وإلا المشتقُّ من السرّ المشترك (كما للموظفين تماماً) ─────────────────── */
const defaultVapid = createVapidKeyResolver(
  () => ({ publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }),
  () => Repository.getSharedServerSecret(),
);
const pushOff = () => String(process.env.STUDENT_PUSH || "").toLowerCase() === "off";
const vapidOf = (options: StudentExtrasOptions) => (): Promise<VapidKeys> => (pushOff() ? Promise.reject(new Error("student push is off")) : (options.vapid || defaultVapid)());

/** يسقط ما لا يصحّ بعد تغيير الرمز أو الاستعادة: أجهزةُ التنبيه ورابطُ المشاركة. تبقى علاماتُ «أُرسل» فلا تتكرّر الرسائلُ بعد عودته. */
export function voidedStudentSecrets(current: StudentProfile): Pick<StudentProfile, "push" | "pushOn" | "share"> {
  return { pushOn: undefined, share: undefined, push: current.push ? { subs: [], sent: current.push.sent, offered: current.push.offered } : undefined };
}

/* ── مواعيدُ «جدولي المقترح» (الخطة «أ») ─────────────────────────────────────── */
export interface PlannedWeek { meetings: ShareMeeting[]; planReady: boolean; window: number; runId: string }

/**
 * الخطةُ «أ» من تذكرته بما يراه الطالبُ في «جدولي المقترح» نفسِه: شعبةٌ بجدولٍ موقَّعٍ لقسمها، ومقررٌ غيرُ موقوف
 * (القاعدةُ نفسها في اشتراك التقويم). null = لا جدولَ مقترحاً بعد.
 */
export async function plannedWeek(profile: StudentProfile, termId: number, catalog: Awaited<ReturnType<StudentExtrasContext["sectionCatalog"]>>): Promise<PlannedWeek | null> {
  if (!(profile.AdSectionId > 0)) return null;
  const [run, ticket] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, profile.fingerprint)]);
  if (!run || !ticket || ticket.runId !== run.runId) return null;
  const [context, states] = await Promise.all([ticketContext(termId), offeringStatesForTerm(termId)]);
  const planA = ticket.plans.find(plan => plan.label === "A") || ticket.plans[0];
  const meetings: ShareMeeting[] = [];
  for (const item of planA?.items || []) {
    const offering = context.offerings.get(item.offeringId);
    if (!offering?.slots.length || !context.signed.has(`${offering.collegeId}:${offering.sectionId}`) || offeringBlocked(states, Number(item.courseId))) continue;
    const course = catalog.courses.get(Number(item.courseId));
    for (const slot of offering.slots) {
      meetings.push({ courseId: Number(item.courseId), day: slot.day, start: slot.start, end: slot.end, name: course?.name || `مقرر ${item.courseId}`, code: course?.code || "", section: offering.code });
    }
  }
  return { meetings, planReady: (planA?.items || []).length > 0, window: Number(ticket.window) || 0, runId: String(run.runId) };
}

const addDay = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/* ── التسليم: لأجهزة هذا الملف وحدها ─────────────────────────────────────────── */
interface Delivery { sent: number; removed: number; failed: number; limited: number }

function createDelivery(options: StudentExtrasOptions) {
  const clock = options.now || Date.now;
  const limiter = createPushRateLimiter({ now: clock });
  const vapid = vapidOf(options);
  /** يرسل إلى أجهزة ملفٍّ بعينه؛ وما رفضته خدمةُ الدفع (404/410) يُمحى من الملف نفسه. */
  return async function deliver(fingerprint: string, subs: StudentPushSub[], message: StudentPushMessageText, opts: { urgency?: "normal" | "high"; topic?: string } = {}): Promise<Delivery> {
    const report: Delivery = { sent: 0, removed: 0, failed: 0, limited: 0 };
    if (!subs.length) return report;
    const keys = await vapid();
    const gone: string[] = [], delivered: string[] = [];
    await Promise.all(subs.slice(0, STUDENT_PUSH_MAX_DEVICES).map(async sub => {
      if (!limiter.take(sub.id)) { report.limited += 1; return; }
      const result = await sendWebPush(sub, { title: message.title, body: message.body, url: message.url, tag: message.tag, at: new Date(clock()).toISOString() },
        { vapid: keys, urgency: opts.urgency, topic: opts.topic, fetchImpl: options.fetchImpl, nowSeconds: Math.floor(clock() / 1000) });
      if (result.ok) { report.sent += 1; delivered.push(sub.id); return; }
      if (result.gone) { report.removed += 1; gone.push(sub.id); return; }
      report.failed += 1;
      console.warn(`[student-push] ${sub.id.slice(0, 8)} → ${result.status}${result.error ? ` ${result.error}` : ""}`);
    }));
    if (gone.length || delivered.length) {
      const at = new Date(clock()).toISOString();
      await Repository.updateStudentProfile(fingerprint, current => {
        if (!current?.push) return undefined;
        const subsNow = current.push.subs.filter(sub => !gone.includes(sub.id)).map(sub => (delivered.includes(sub.id) ? { ...sub, lastSentAt: at } : sub));
        return { ...current, pushOn: subsNow.length ? true : undefined, push: { ...current.push, subs: subsNow } };
      }).catch(error => console.warn("[student-push] cleanup:", error instanceof Error ? error.message : error));
    }
    return report;
  };
}

/* ── علامةُ «أُرسل»: ذرّية، تُكتب قبل الإرسال ─────────────────────────────────── */
async function claimMarker(fingerprint: string, key: string, at: string): Promise<boolean> {
  let claimed = false;
  await Repository.updateStudentProfile(fingerprint, current => {
    claimed = false;
    if (!current?.push?.subs.length || current.push.sent?.[key]) return undefined;
    claimed = true;
    return { ...current, push: { ...current.push, sent: { ...(current.push.sent || {}), [key]: at } } };
  });
  return claimed;
}

/* ── المُرسِل المجدول ──────────────────────────────────────────────────────── */
export interface PushTickReport { scanned: number; sent: number; skipped: number; removed: number; locked?: boolean; reason?: string }

const TICK_LOCK_MS = 50 * 60_000;
export const PUSH_TICK_MAX_PROFILES = 2000;
export const PUSH_TICK_PAGE = 200;

/**
 * مرورٌ واحد: يقرأ من فعّلوا التنبيهات صفحةً بعد صفحة (سقفٌ لكل مرور)، ويُرسل لمن استحقّ **رسالةً واحدة**.
 * آمنٌ مع أكثر من نسخة: قفلٌ في قاعدة البيانات يمنع المسحَ المكرّر، وإن تجاوزه مسحٌ مكرّرٌ فعلامةُ «أُرسل» الذرّية تُسقط الثانيَ.
 * لا يرمي أبداً.
 */
export async function runStudentPushTick(options: StudentExtrasOptions & { maxProfiles?: number; lock?: boolean } = {}): Promise<PushTickReport> {
  const report: PushTickReport = { scanned: 0, sent: 0, skipped: 0, removed: 0 };
  try {
    const now = (options.now || Date.now)();
    const today = kuwaitDateISO(new Date(now));
    const hour = new Date(now + 3 * 3_600_000).getUTCHours();
    if (hour < 8 || hour >= 21) { report.reason = "quiet-hours"; return report; }
    try { await vapidOf(options)(); } catch { report.reason = "push-not-configured"; return report; }
    const term = pickDoorTerm((await Repository.getTerms()) as any, now, today);
    if (!term) { report.reason = "no-term"; return report; }
    if (options.lock !== false) {
      const won = await Repository.updateFeatureDoc<{ id: string; at: number }, boolean>("pushCooldowns", "student-push-tick", current =>
        current && now - Number(current.at || 0) < TICK_LOCK_MS ? { refuse: false } : { next: { id: "student-push-tick", at: now }, result: true });
      if (!won.ok) { report.locked = true; return report; }
    }
    const termId = Number(term.AdTermId);
    const reading = readStudentPhase(term.AdTermStudentPhases, today);
    const rounds = term.AdTermStudentPhases?.rounds || [];
    const roundTomorrow = rounds.some(round => round.start === addDay(today, 1));
    const planMode = reading.mode === "frozen" || reading.mode === "report";
    const run = planMode || roundTomorrow ? await Repository.getRegistrationRun(termId) : undefined;
    const deliver = createDelivery(options);
    const cap = Math.max(1, options.maxProfiles ?? PUSH_TICK_MAX_PROFILES);
    let after = "";
    while (report.scanned < cap) {
      const page = await Repository.listPushStudentProfiles(after, Math.min(PUSH_TICK_PAGE, cap - report.scanned));
      if (!page.length) break;
      after = page[page.length - 1].id;
      report.scanned += page.length;
      for (let at = 0; at < page.length; at += 6) {
        await Promise.all(page.slice(at, at + 6).map(async profile => {
          try {
            const sent = profile.push?.sent || {};
            const needPlan = Boolean(run) && planMode && !sent[pushMarkerKey(termId, "plan-ready")];
            const needRound = Boolean(run) && roundTomorrow && !sent[pushMarkerKey(termId, "round-tomorrow")];
            let planReady = false, roundStart = "";
            if (needPlan || needRound) {
              const ticket = await Repository.getRegistrationTicket(termId, profile.fingerprint);
              if (ticket && run && ticket.runId === run.runId) {
                planReady = needPlan && (ticket.plans.find(plan => plan.label === "A") || ticket.plans[0])?.items.length > 0;
                roundStart = needRound ? String(rounds[ticket.window - 1]?.start || "") : "";
              }
            }
            const kind = studentPushDue({ hour, today, termId, mode: reading.mode, until: reading.until || "", planReady, roundStart, sent });
            if (!kind) { report.skipped += 1; return; }
            if (!(await claimMarker(profile.fingerprint, pushMarkerKey(termId, kind), new Date(now).toISOString()))) { report.skipped += 1; return; }
            const result = await deliver(profile.fingerprint, profile.push?.subs || [], studentPushMessage(kind), { urgency: "normal", topic: pushTopic(`masari:${kind}`) });
            report.sent += result.sent; report.removed += result.removed;
          } catch (error) { console.warn("[student-push] profile:", error instanceof Error ? error.message : error); }
        }));
      }
      if (page.length < PUSH_TICK_PAGE) break;
    }
  } catch (error) {
    report.reason = "error";
    console.warn("[student-push] tick:", error instanceof Error ? error.message : error);
  }
  return report;
}

/** عند الإقلاع بعد دقيقتين ثم كل ساعة؛ لا يعطّل الإقلاع ولا يمنع الإغلاق. */
export function scheduleStudentPush(log: (message: string) => void = console.log): void {
  const tick = () => {
    runStudentPushTick()
      .then(report => { if (report.sent) log(`[student-push] أُرسل ${report.sent} تنبيهاً من ${report.scanned} ملفاً.`); })
      .catch(error => console.warn("[student-push] تعذّر المرور:", error instanceof Error ? error.message : error));
  };
  setTimeout(tick, 2 * 60_000).unref?.();
  setInterval(tick, 3_600_000).unref?.();
}

/* ── المسارات ────────────────────────────────────────────────────────────────── */
export function registerStudentExtras(app: Express, ctx: StudentExtrasContext, options: StudentExtrasOptions = {}): void {
  const clock = options.now || Date.now;
  const vapid = vapidOf(options);
  const deliver = createDelivery(options);
  const noStore = (res: Response) => { res.setHeader("Cache-Control", "no-store"); };

  const pushStatus = async (profile: StudentProfile) => {
    let publicKey = "";
    try { publicKey = (await vapid()).publicKey; } catch { /* بلا مفاتيح: يقول الخادمُ إنها غير مُفعَّلة */ }
    const ids = (profile.push?.subs || []).map(sub => sub.id);
    return {
      configured: Boolean(publicKey), publicKey, ids, count: ids.length,
      /* يُعرض عرضٌ واحد بعد إكمال الملف، ثم لا يُلحّ. */
      offerNow: Boolean(publicKey) && profile.AdSectionId > 0 && !ids.length && !profile.push?.offered,
    };
  };

  const nextCard = async (profile: StudentProfile) => {
    const term = pickDoorTerm((await Repository.getTerms()) as any, clock());
    if (!term) return null;
    const span = calendarSpanForTerm(term as any, 16);
    const today = kuwaitDateISO(new Date(clock()));
    if (span.source === "none" || !span.startDate || !span.endDate || today < span.startDate || today > span.endDate) return null;
    const week = await plannedWeek(profile, Number(term.AdTermId), await ctx.sectionCatalog(profile.AdSectionId));
    if (!week?.meetings.length) return null;
    return { window: { start: span.startDate, end: span.endDate }, termName: String(term.AdTermName || ""), meetings: week.meetings.map(m => ({ day: m.day, start: m.start, end: m.end, name: m.name, code: m.code, section: m.section })) };
  };

  const shareStatus = (profile: StudentProfile) => {
    const live = profile.share && Date.parse(profile.share.expiresAt) > clock();
    return { active: Boolean(live), expiresAt: live ? profile.share!.expiresAt : "" };
  };

  /** الثلاثةُ بطلبٍ واحد عند فتح الرئيسية؛ فشلُ جزءٍ لا يُسقط الباقي. */
  app.get("/api/public/me/extras", ctx.requireDoor, async (_req: Request, res: Response) => {
    const { profile } = ctx.doorOf(res);
    noStore(res);
    const settle = async <T,>(task: () => Promise<T>, empty: T): Promise<T> => { try { return await task(); } catch (error) { console.warn("[student-extras]", error instanceof Error ? error.message : error); return empty; } };
    const [push, next] = await Promise.all([
      settle(() => pushStatus(profile), { configured: false, publicKey: "", ids: [] as string[], count: 0, offerNow: false }),
      settle(() => nextCard(profile), null),
    ]);
    res.json({ push, share: shareStatus(profile), next });
  });

  /* ── التنبيهات ── */
  app.post("/api/public/me/push", ...ctx.writeLimit, ctx.requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = ctx.doorOf(res);
    noStore(res);
    try { await vapid(); } catch { ctx.fail(res, 503, "التنبيهات غير مُفعَّلة على هذا الخادم.", "push-off"); return; }
    const subscription = readPushSubscription(req.body?.subscription);
    if (!subscription) { ctx.fail(res, 400, "اشتراكٌ غير صالح من هذا المتصفح.", "bad-subscription"); return; }
    const sub: StudentPushSub = { id: pushSubscriptionId(subscription.endpoint), endpoint: subscription.endpoint, keys: subscription.keys, createdAt: new Date(clock()).toISOString(), ...(deviceLabel(req.headers["user-agent"]) ? { device: deviceLabel(req.headers["user-agent"]) } : {}) };
    /* ما صار حقيقةً قبل الاشتراك لا يُعاد خبراً: جاهزيةُ الجدول القائمة الآن علامةٌ مُرسَلة سلفاً (التذكير لما يتغيّر بعد ذلك). */
    const baseline: Record<string, string> = {};
    try {
      const term = pickDoorTerm((await Repository.getTerms()) as any, clock());
      const mode = term ? readStudentPhase(term.AdTermStudentPhases, kuwaitDateISO(new Date(clock()))).mode : "";
      if (term && (mode === "frozen" || mode === "report")) {
        const week = await plannedWeek(profile, Number(term.AdTermId), await ctx.sectionCatalog(profile.AdSectionId));
        if (week?.planReady) baseline[pushMarkerKey(Number(term.AdTermId), "plan-ready")] = "baseline";
      }
    } catch { /* الأساسُ تحسينٌ لا شرط */ }
    const saved = await Repository.updateStudentProfile(fingerprint, current => {
      if (!current) return undefined;
      const subs = [...(current.push?.subs || []).filter(item => item.id !== sub.id), sub].slice(-STUDENT_PUSH_MAX_DEVICES);
      const sent = { ...baseline, ...(current.push?.sent || {}) };
      return { ...current, pushOn: true, push: { ...current.push, subs, sent } };
    });
    if (!saved) { ctx.fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    res.json({ ok: true, id: sub.id, count: saved.push?.subs.length || 0 });
  });

  app.post("/api/public/me/push/off", ...ctx.writeLimit, ctx.requireDoor, async (req: Request, res: Response) => {
    const { fingerprint } = ctx.doorOf(res);
    noStore(res);
    /* بلا رابط: كلُّ أجهزته (زرُّ «أوقف التنبيهات» حين لا يعرف المتصفحُ اشتراكَه). */
    const endpoint = String(req.body?.endpoint || "");
    const id = endpoint ? pushSubscriptionId(endpoint) : "";
    const saved = await Repository.updateStudentProfile(fingerprint, current => {
      if (!current) return undefined;
      const subs = id ? (current.push?.subs || []).filter(item => item.id !== id) : [];
      return { ...current, pushOn: subs.length ? true : undefined, push: { ...current.push, subs } };
    });
    if (!saved) { ctx.fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    res.json({ ok: true, count: saved.push?.subs.length || 0 });
  });

  app.post("/api/public/me/push/test", ...ctx.writeLimit, ctx.requireDoor, async (_req: Request, res: Response) => {
    const { fingerprint, profile } = ctx.doorOf(res);
    noStore(res);
    const subs = profile.push?.subs || [];
    if (!subs.length) { ctx.fail(res, 409, "فعّل التنبيهات على هذا الجهاز أولاً.", "no-device"); return; }
    try {
      const report = await deliver(fingerprint, subs, pushTestMessage(), { urgency: "high" });
      if (!report.sent && report.limited) { ctx.fail(res, 429, "جرّبتَ للتو. انتظر دقيقة.", "limited"); return; }
      res.json({ ok: report.sent > 0, sent: report.sent, removed: report.removed });
    } catch (error) { console.warn("[student-push] test:", error instanceof Error ? error.message : error); ctx.fail(res, 503, "التنبيهات غير متاحة الآن. حاول بعد قليل.", "push-off"); }
  });

  /** «لاحقاً» على العرض الأول: لا يُعاد عليه. */
  app.post("/api/public/me/push/offered", ...ctx.writeLimit, ctx.requireDoor, async (_req: Request, res: Response) => {
    const { fingerprint } = ctx.doorOf(res);
    noStore(res);
    await Repository.updateStudentProfile(fingerprint, current => (current ? { ...current, push: { subs: [], ...current.push, offered: new Date(clock()).toISOString() } } : undefined));
    res.json({ ok: true });
  });

  /* ── شارك مرشدك ── */
  app.post("/api/public/me/share", ...ctx.writeLimit, ctx.requireDoor, async (req: Request, res: Response) => {
    const { fingerprint } = ctx.doorOf(res);
    noStore(res);
    const issued = issueShare(await ctx.identityKey(), fingerprint, clock());
    const saved = await Repository.updateStudentProfile(fingerprint, current => (current ? { ...current, share: { hash: issued.hash, createdAt: issued.createdAt, expiresAt: issued.expiresAt } } : undefined));
    if (!saved) { ctx.fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    const url = `${req.protocol}://${req.get("host")}/me/share/${issued.token}`;
    res.json({ ok: true, url, svg: shareQrSvg(url), expiresAt: issued.expiresAt });
  });

  app.post("/api/public/me/share/off", ...ctx.writeLimit, ctx.requireDoor, async (_req: Request, res: Response) => {
    const { fingerprint } = ctx.doorOf(res);
    noStore(res);
    const saved = await Repository.updateStudentProfile(fingerprint, current => (current ? { ...current, share: undefined } : undefined));
    if (!saved) { ctx.fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    res.json({ ok: true });
  });

  /* ── الصفحة العامة: للقراءة فقط، بلا تخزين ولا فهرسة ── */
  const sharePerMinute = intFromEnv("STUDENT_SHARE_PER_MINUTE", 60);
  const pageHeaders = (res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  };
  /* صندوقُ التجربة: من يعاين مشاركتَه من المتصفح نفسِه يُقرأ ملفُّه من صندوقه. */
  app.use("/me/share", (req: Request, res: Response, next) => {
    const id = readCookie(req.headers.cookie, SHOWCASE_COOKIE);
    if (!id || !id.startsWith("demo_stu_") || !Repository.runDemoSandbox(id, next)) next();
  });
  app.get("/me/share/:token", rateLimit({
    windowMs: 60_000, limit: sharePerMinute, standardHeaders: true, legacyHeaders: false,
    handler: (_req, res) => { pageHeaders(res); res.status(429).send(renderShareGone()); },
  }), async (req: Request, res: Response) => {
    pageHeaders(res);
    const gone = () => { res.status(404).send(renderShareGone()); };
    try {
      const read = readShareToken(await ctx.identityKey(), String(req.params.token || ""));
      const profile = read ? await Repository.getStudentProfile(read.fingerprint) : undefined;
      if (!read || !profile || shareState(profile.share, read.secret, clock()) !== "ok") { gone(); return; }
      const snapshot = await shareSnapshot(profile, ctx, clock);
      res.send(renderSharePage(snapshot));
    } catch (error) {
      console.warn("[student-share]", error instanceof Error ? error.message : error);
      gone();
    }
  });
}

/** ما تراه صفحةُ المرشد، حقلاً حقلاً: لا يمرّ شيءٌ لم يُسمَّ هنا. */
export async function shareSnapshot(profile: StudentProfile, ctx: Pick<StudentExtrasContext, "summaryOf" | "sectionCatalog">, clock: () => number = Date.now): Promise<ShareSnapshot> {
  const [summary, catalog, colleges, terms, cap] = await Promise.all([
    ctx.summaryOf(profile), ctx.sectionCatalog(profile.AdSectionId), Repository.getColleges(), Repository.getTerms(), universityUnitCap(),
  ]);
  const term = pickDoorTerm(terms as any, clock());
  const progress = summary.progress as { percent: number; passedUnits: number; remainingUnits: number; totalUnits: number } | null;
  const wishes = term && profile.wishes && Number(profile.wishes.termId) === Number(term.AdTermId) ? profile.wishes : null;
  const floor = studentUnitFloorOf(cap);
  const units = Math.max(floor, Math.min(cap, Math.round(Number(wishes?.targetUnits)) || DEFAULT_TERM_UNITS));
  const known = (id: number) => catalog.courses.get(Number(id));
  const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, "en");
  const pick = (ids: number[]) => [...new Set(ids.map(Number))].map(known).filter((c): c is NonNullable<typeof c> => Boolean(c)).map(c => ({ code: c.code, name: c.name })).sort(byCode);
  const week = term ? await plannedWeek(profile, Number(term.AdTermId), catalog).catch(() => null) : null;
  const remaining = progress?.remainingUnits || 0;
  return {
    college: String((colleges as any[]).find(row => Number(row.AdCollegeId) === profile.AdCollegeId)?.AdCollegeName || ""),
    section: String(summary.sectionName || ""),
    plan: String(summary.planName || ""),
    percent: progress && progress.totalUnits > 0 ? progress.percent : null,
    passedUnits: progress?.passedUnits || 0,
    remainingUnits: remaining,
    terms: remaining > 0 ? Math.ceil(remaining / units) : 0,
    unitsPerTerm: units,
    passed: pick(profile.passedCourseIds || []),
    termName: wishes && term ? String(term.AdTermName || "") : "",
    wishes: wishes ? pick(wishes.courseIds || []) : [],
    week: week && week.meetings.length ? week.meetings : null,
    expiresAt: profile.share?.expiresAt || "",
  };
}
