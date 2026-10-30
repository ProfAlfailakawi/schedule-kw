/**
 * ── تنبيهاتُ الجوال: من يستحقها، ومتى، والمسارات ───────────────────────────
 *
 * قليلةٌ عن قصد. لا يُدفع إلى هاتفٍ إلا ما ينتظر صاحبَه هو:
 *
 *   الأستاذ (من كرته /r/:token، وكرتِ مرحلة التدريب نفسه):
 *     ✅ ثُبّت طلبه · ❌ تعذّر · 🔁 بدائل يختار منها · 💬 ردُّ القسم · 🎓 فُتح بابُ التدريب له.
 *     تنبيهٌ واحدٌ لكل كرت يستبدل سابقَه على الهاتف (الوسم نفسه)، ونصُّه حصيلةُ قرارات
 *     القسم في الدقائق العشر الأخيرة تُقرأ من الطلب لحظةَ الإرسال («✅ ثُبّت 3 مواعيد»).
 *   منسّقُ القسم في التطبيق (من يملك وارد الطلبات: الشاشة ٧ أو إدارة النظام):
 *     📥 طلباتٌ تنتظر التثبيت في نطاقه، وتنبيهٌ ثانٍ وحيد: 🤝 ردُّ أستاذٍ على مقترحه.
 *     تنبيهٌ فوري يستبدل سابقَه بوسم القسم، بالعدد كما هو لحظةَ الإرسال، وتهدئةٌ لكل
 *     قسمٍ ثلاثَ دقائق محفوظةٌ في قاعدة البيانات (pushCooldowns) لا في ذاكرة نسخةٍ بعينها.
 *
 * لا مؤقّتَ ولا عملَ بعد الرد: Cloud Run يخنق المعالج حين لا طلبَ يُخدم، فما يُترك
 * للخلفية قد يتأخر بلا حدّ أو يضيع. فالمسارُ ينتظر الخطاف (حتى ثانيتين ونصف) ثم يردّ.
 *
 * والاشتراكُ مربوطٌ بصاحبه: حسابٌ، أو كرتٌ برمزه. كرتٌ أُوقف أو انتهى لا يُدفع
 * إليه، وتُمحى اشتراكاتُه عند أوّل محاولة. وما ترفضه خدمةُ الدفع بـ 404/410 يُمحى.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { timingSafeEqual } from "crypto";
import { Repository } from "../db/repository";
import type { InstructorRequest, InstructorRequestItem } from "../types";
import { createDataContextKey } from "./dataContextCache";
import { createTtlMemo } from "./notificationCache";
import {
  createPushRateLimiter, createVapidKeyResolver, deviceLabel, pushSessionTag, pushSubscriptionId, pushTopic,
  readPushSubscription, sendWebPush,
  type PushFetch, type PushMessage, type PushSubscriptionRecord, type PushUrgency, type VapidKeys,
} from "./webPush";
import {
  adminRepliesMessage, adminRequestsMessage, adminTestMessage, cardTestMessage, messageMentionsRoom, roomTokensOf,
  taWindowMessage, teacherDigestMessage, teacherEventFor, type TeacherEvent,
} from "./pushMessages";
import { CARD_TOKEN_PATTERN, cardManifest } from "./pushCard";

export interface PushRouteDeps {
  requireAuth: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  /** كرتُ الأستاذ برمزه — null إن أُوقف أو انتهى أو طُوي بجولةٍ جديدة (resolveRequestLink). */
  resolveCard: (token: string) => Promise<{ token: string; instructorId: number } | null>;
  readEnv?: () => { publicKey?: string; privateKey?: string };
  /** للاختبار: خدمةُ دفعٍ وهمية وساعة. */
  fetchImpl?: PushFetch;
  now?: () => number;
}

export interface DeliveryReport { sent: number; failed: number; removed: number; limited: number }

/** تهدئةُ القسم: تنبيهٌ واحد لكل قسمٍ ولكل نوع كل ثلاث دقائق — محفوظةٌ في قاعدة البيانات. */
export const ADMIN_COOLDOWN_MS = 3 * 60_000;
/** قراراتُ القسم التي يجمعها تنبيهُ الكرت الواحد. */
export const CARD_RECENT_MS = 10 * 60_000;
/** أقصى ما ينتظره المسارُ للخطاف قبل أن يردّ. */
export const HOOK_WAIT_MS = 2500;

type Audience = (collegeId: number, sectionId: number) => boolean;
/** حسابٌ فعّل التنبيهات، بالشكل الذي تقرؤه قواعدُ النطاق (isScopeAllowed) والصفة. */
export interface PushAccount { user: any; userId: number; scopes: Array<{ AdCollegeId: number; AdSectionId: number }>; permissions: number[] }
type AdminKind = "requests" | "replies";

const scopeKey = (collegeId: number, sectionId: number) => `${Number(collegeId) || 0}:${Number(sectionId) || 0}`;

/** موقعُ البند: كليةُ صفّه وقسمُه، لا كليةُ الرابط (requestItemScope في server.ts). */
function itemScope(request: InstructorRequest, item: InstructorRequestItem) {
  const snapshot = item.action === "add" ? item.after : item.before;
  return { collegeId: Number(snapshot?.collegeId || request.AdCollegeId || 0), sectionId: Number(snapshot?.sectionId || request.AdSectionId || 0) };
}

/**
 * ما ينتظر القسمَ في نطاقٍ ما، كما هو الآن: طلباتٌ فيها بندٌ لم يُقرَّر بعد، أو
 * (للردود) بندٌ آخرُ رسالةٍ فيه من الأستاذ. هو العددُ الذي يقوله التنبيه.
 */
export function awaitingInScope(requests: InstructorRequest[], kind: AdminKind, collegeId: number, sectionId: number): number {
  return requests.filter(request => request.status === "submitted" || request.status === "in-review").filter(request =>
    (request.items || []).some(item => {
      const where = itemScope(request, item);
      if (where.collegeId !== collegeId || where.sectionId !== sectionId) return false;
      if (kind === "requests") return item.action !== "keep" && !item.decision?.state;
      const last = (item.thread || []).at(-1);
      return last?.from === "instructor" && item.decision?.state !== "fixed";
    })).length;
}

function createPushEngine(deps: PushRouteDeps) {
  const clock = deps.now || Date.now;
  const vapid = createVapidKeyResolver(
    deps.readEnv || (() => ({ publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY })),
    () => Repository.getSharedServerSecret(),
  );
  const limiter = createPushRateLimiter({ now: clock });
  const contextKey = createDataContextKey(() => Repository.currentDemoSessionId());
  const audienceMemo = createTtlMemo<Audience | null>({ ttlMs: 120_000, now: clock });
  const sectionNames = createTtlMemo<Map<string, string>>({ ttlMs: 10 * 60_000, now: clock });
  const accountMemo = createTtlMemo<PushAccount | null>({ ttlMs: 120_000, now: clock });

  const log = (label: string, error: unknown) => console.warn(`[push] ${label}:`, error instanceof Error ? error.message : error);

  /** يرسل إلى أجهزةٍ بعينها: حدُّ كل جهاز، ومحوُ ما انتهى، ولا شيءَ يُسقط غيره. */
  async function deliver(records: PushSubscriptionRecord[], message: PushMessage, options: { urgency?: PushUrgency; topic?: string } = {}): Promise<DeliveryReport> {
    const report: DeliveryReport = { sent: 0, failed: 0, removed: 0, limited: 0 };
    const unique = [...new Map(records.map(record => [record.id, record])).values()].slice(0, 50);
    if (!unique.length) return report;
    const keys: VapidKeys = await vapid();
    await Promise.all(unique.map(async record => {
      if (!limiter.take(record.id)) { report.limited += 1; return; }
      const result = await sendWebPush(record, message, { vapid: keys, urgency: options.urgency, topic: options.topic, fetchImpl: deps.fetchImpl, nowSeconds: Math.floor(clock() / 1000) });
      if (result.ok) { report.sent += 1; return; }
      if (result.gone) {
        report.removed += 1;
        await Repository.deletePushSubscription(record.id).catch(error => log("delete", error));
        return;
      }
      report.failed += 1;
      console.warn(`[push] ${record.id.slice(0, 8)} → ${result.status}${result.error ? ` ${result.error}` : ""}`);
    }));
    return report;
  }

  /** من يستحق تنبيهَ الطلبات من هذا الحساب: ما يستحق أن يراه في واردها. */
  function audienceOf(userId: number): Promise<Audience | null> {
    return audienceMemo.get(contextKey(`push-audience:${userId}`), async () => {
      const user = await Repository.getUserById(userId);
      if (!user || !user.IsActive || user.IsLocked || user.IsDeleted) return null;
      const [scopes, security] = await Promise.all([Repository.getUserAssigns(userId), Repository.getSecurityByUser(userId)]);
      const permissions = security.map(item => Number(item.FormNameId));
      const req = { user, userId, scopes, permissions };
      const power = deps.isPowerUser(req);
      if (!power && !permissions.includes(7)) return null;
      return (collegeId: number, sectionId: number) => power || deps.isScopeAllowed(req, collegeId, sectionId);
    });
  }

  async function placeOf(collegeId: number, sectionId: number): Promise<string> {
    const names = await sectionNames.get(contextKey("push-sections"), async () =>
      new Map((await Repository.getSections() as any[]).map(row => [scopeKey(row.AdCollegeId, row.AdSectionId), String(row.AdSectionName || "")])));
    return names.get(scopeKey(collegeId, sectionId)) || "";
  }

  /** تهدئةُ القسم في قاعدة البيانات (ذرّية): كلُّ النسخ ترى الوقتَ نفسه. */
  async function claimCooldown(key: string): Promise<boolean> {
    const now = clock();
    const claimed = await Repository.updateFeatureDoc<{ id: string; at: number }, boolean>("pushCooldowns", key, current =>
      current && now - Number(current.at || 0) < ADMIN_COOLDOWN_MS ? { refuse: false } : { next: { id: key, at: now }, result: true });
    return claimed.ok;
  }

  /* ── القسم: تنبيهٌ فوري بالعدد الحاضر، يستبدل سابقَه، بتهدئةٍ لكل قسم ─────── */
  async function noteForAdmins(kind: AdminKind, request: InstructorRequest, scopes: Array<{ collegeId: number; sectionId: number }>, accepted = false) {
    const wanted = [...new Map(scopes.filter(scope => scope.collegeId && scope.sectionId).map(scope => [scopeKey(scope.collegeId, scope.sectionId), scope])).values()];
    if (!wanted.length) return;
    const subscribed = await Repository.listPushSubscriptions({ ownerKind: "user" });
    const userIds = [...new Set(subscribed.map(record => Number(record.userId)).filter(Boolean))];
    if (!userIds.length) return;
    const audiences = await Promise.all(userIds.map(async userId => ({ userId, audience: await audienceOf(userId).catch(() => null) })));
    let termRequests: InstructorRequest[] | null = null;
    for (const scope of wanted) {
      const recipients = audiences.filter(entry => entry.audience?.(scope.collegeId, scope.sectionId)).map(entry => entry.userId);
      if (!recipients.length) continue;
      if (!(await claimCooldown(`${kind}:${scopeKey(scope.collegeId, scope.sectionId)}`))) continue;
      termRequests ||= await Repository.getInstructorRequests(0, 0, Number(request.AdTermId));
      const count = Math.max(1, awaitingInScope(termRequests, kind, scope.collegeId, scope.sectionId));
      const place = await placeOf(scope.collegeId, scope.sectionId);
      const base = kind === "replies" ? adminRepliesMessage(count, place, accepted) : adminRequestsMessage(count, place);
      const message = { ...base, tag: `${base.tag}-${scopeKey(scope.collegeId, scope.sectionId)}` };
      const records = subscribed.filter(record => recipients.includes(Number(record.userId)));
      await deliver(records, message, { urgency: "normal", topic: pushTopic(`inbox:${kind}:${scopeKey(scope.collegeId, scope.sectionId)}`) });
    }
  }

  /* ── كرتُ الأستاذ ───────────────────────────────────────────────────────── */
  /** اشتراكاتُ كرتٍ ما دام حيّاً؛ كرتٌ أُوقف تُمحى اشتراكاتُه ولا يُدفع إليه شيء. */
  async function liveCardRecords(token: string): Promise<PushSubscriptionRecord[]> {
    const records = await Repository.listPushSubscriptions({ cardToken: token, ownerKind: "card" });
    if (!records.length) return [];
    if (await deps.resolveCard(token)) return records;
    await Promise.all(records.map(record => Repository.deletePushSubscription(record.id).catch(error => log("delete", error))));
    return [];
  }
  /** تنبيهٌ واحدٌ للكرت يستبدل سابقَه: الردُّ وحده، أو حصيلةُ القرارات الأخيرة على الطلب. */
  async function noteForCard(request: InstructorRequest, indexes: number[], kind?: TeacherEvent["kind"]) {
    const token = String(request.linkId || "");
    if (!token) return;
    const records = await liveCardRecords(token);
    if (!records.length) return;
    const recent = (index: number) => {
      const at = Date.parse(String(request.items[index]?.decision?.decidedAt || ""));
      return indexes.includes(index) || (Number.isFinite(at) && clock() - at <= CARD_RECENT_MS && at <= clock() + 60_000);
    };
    const picked = kind === "reply" ? indexes : (request.items || []).map((_, index) => index).filter(recent);
    const events = picked.map(index => teacherEventFor(request, index, kind)).filter((event): event is TeacherEvent => Boolean(event));
    if (!events.length) return;
    const message = teacherDigestMessage(events, token);
    /* القاعدةُ لا تُترك للنصّ وحده: تنبيهٌ فيه أثرُ قاعةٍ لا يُرسل. */
    if (messageMentionsRoom(message, picked.flatMap(index => roomTokensOf(request.items[index])))) { log("card", "room token in teacher text — not sent"); return; }
    await deliver(records, message, { urgency: "high", topic: pushTopic(`card:${token}`) });
  }

  /** الحسابُ كما تحتاجه قاعدةُ نطاقٍ وصفة: المستخدمُ ونطاقاتُه وأذوناتُه (شكلُ الطلب الموثَّق). */
  function accountOf(userId: number): Promise<PushAccount | null> {
    return accountMemo.get(contextKey(`push-account:${userId}`), async () => {
      const user = await Repository.getUserById(userId);
      if (!user || !user.IsActive || user.IsLocked || user.IsDeleted) return null;
      const [scopes, security] = await Promise.all([Repository.getUserAssigns(userId), Repository.getSecurityByUser(userId)]);
      return { user, userId, scopes, permissions: security.map(item => Number(item.FormNameId)) };
    });
  }

  /**
   * تنبيهٌ لمن يختارهم صاحبُ الحدث بقاعدته (طلبُ شعبة: الإرشادُ، واللجنة، والتسجيل في نطاقهم).
   * يُسأل كلُّ حسابٍ فعّل التنبيهات مرّةً، ولا يصل من لا تنطبق عليه القاعدة.
   */
  async function noteForAccounts(pick: (account: PushAccount) => boolean, message: PushMessage, topicSeed: string) {
    const subscribed = await Repository.listPushSubscriptions({ ownerKind: "user" });
    const userIds = [...new Set(subscribed.map(record => Number(record.userId)).filter(Boolean))];
    if (!userIds.length) return;
    const chosen = new Set<number>();
    for (const userId of userIds) {
      const account = await accountOf(userId).catch(() => null);
      if (account && pick(account)) chosen.add(userId);
    }
    if (!chosen.size) return;
    await deliver(subscribed.filter(record => chosen.has(Number(record.userId))), message, { urgency: "normal", topic: pushTopic(topicSeed) });
  }

  return {
    vapid, deliver, audienceOf, liveCardRecords, limiter, noteForAccounts,
    requestSubmitted(request: InstructorRequest) {
      const scopes = [
        { collegeId: Number(request.AdCollegeId), sectionId: Number(request.AdSectionId) },
        ...(request.items || []).filter(item => item.action !== "keep").map(item => itemScope(request, item)),
      ];
      return noteForAdmins("requests", request, scopes);
    },
    teacherReplied(request: InstructorRequest, indexes: number[], accepted: boolean) {
      const items = indexes.map(index => request.items[index]).filter(Boolean);
      return noteForAdmins("replies", request, items.map(item => itemScope(request, item)), accepted);
    },
    requestDecided(request: InstructorRequest, index: number) { return noteForCard(request, [index]); },
    requestFixed(request: InstructorRequest, indexes: number[]) { return noteForCard(request, indexes, "fixed"); },
    departmentReplied(request: InstructorRequest, index: number) { return noteForCard(request, [index], "reply"); },
    /**
     * خروجٌ صريح من جلسة: الأجهزةُ التي فُعّلت منها لا تحمل بعده تنبيهاتِ من خرج
     * (جهازٌ مشترك). الصفحةُ تُلغي اشتراكها قبل الخروج (forgetPushDevice)، وهذا
     * يمسك ما لم تصل إليه: لسانٌ آخر، أو متصفّحٌ أُغلق قبل الإلغاء. انتهاءُ الجلسة
     * بالخمول ليس خروجاً: التنبيهُ يصل والتطبيقُ مغلق، وذاك غرضُه.
     */
    async signedOut(sessionId: string) {
      if (!sessionId) return 0;
      const records = await Repository.listPushSubscriptions({ session: pushSessionTag(sessionId), ownerKind: "user" });
      await Promise.all(records.map(record => Repository.deletePushSubscription(record.id)));
      return records.length;
    },
    async taWindowOpened(closesAt: string, sent: Array<{ instructorId: number; linkId: string }>) {
      await Promise.all(sent.map(async entry => {
        /* المدرّبُ اشترك من كرته السابق (أو من كرت التدريب نفسه إن أُعيد): يصله الخبرُ إلى كرته الجديد. */
        const records = await Repository.listPushSubscriptions({ instructorId: Number(entry.instructorId), ownerKind: "card" });
        const live: PushSubscriptionRecord[] = [];
        for (const token of new Set(records.map(record => String(record.cardToken || "")))) live.push(...await liveCardRecords(token));
        if (live.length) await deliver(live, taWindowMessage(entry.linkId, closesAt), { urgency: "high", topic: pushTopic(`ta:${entry.linkId}`) });
      }));
    },
  };
}

type PushEngine = ReturnType<typeof createPushEngine>;
let engine: PushEngine | null = null;

/**
 * يُنتظر في المسار قبل الرد، بحدٍّ أقصى HOOK_WAIT_MS، ولا يرمي أبداً: الخطأُ يُكتب
 * في السجل وحده، وبطءُ خدمة الدفع لا يحبس ردَّ الأستاذ أو المنسّق أكثر من ثانيتين ونصف.
 */
function fire(label: string, task: (current: PushEngine) => unknown): Promise<void> {
  const current = engine;
  if (!current) return Promise.resolve();
  const report = (error: unknown) => console.warn(`[push] ${label}:`, error instanceof Error ? error.message : error);
  let work: Promise<void>;
  try { work = Promise.resolve(task(current)).then(() => undefined, report); }
  catch (error) { report(error); return Promise.resolve(); }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<void>(resolve => { timer = setTimeout(resolve, HOOK_WAIT_MS); });
  return Promise.race([work, bound]).finally(() => clearTimeout(timer));
}

/**
 * خطافاتُ الأحداث في server.ts: سطرٌ واحد لكلٍّ، يُنتظر (بحدّ) ولا يرمي.
 * قبل registerPushRoutes (أو في اختبارٍ لا يسجّلها) لا تفعل شيئاً.
 */
export const pushHooks = {
  /** أرسل الأستاذُ طلبه (لا تأكيدَ «بلا تعديل»): 📥 لمنسّقي نطاقه. */
  requestSubmitted: (request: InstructorRequest) => fire("submitted", current => current.requestSubmitted(request)),
  /** ردّ الأستاذُ على مقترح القسم: 🤝/💬 لمنسّقي نطاق البند. */
  teacherReplied: (request: InstructorRequest, indexes: number[], accepted: boolean) => fire("teacher reply", current => current.teacherReplied(request, indexes, accepted)),
  /** قرارُ القسم على بند (ثُبّت أو رُفض، ومع البدائل): إلى كرت الأستاذ. */
  requestDecided: (request: InstructorRequest, index: number) => fire("decided", current => current.requestDecided(request, index)),
  /** تثبيتٌ ذرّيّ لسلسلةٍ من البنود: تنبيهٌ واحدٌ بها كلها. */
  requestFixed: (request: InstructorRequest, indexes: number[]) => fire("fixed", current => current.requestFixed(request, indexes)),
  /** ردُّ القسم أو اقتراحُه في حوار البند. */
  departmentReplied: (request: InstructorRequest, index: number) => fire("department reply", current => current.departmentReplied(request, index)),
  /** 🎓 موجةُ مرحلة التدريب أُرسلت: لكل مدرّبٍ إلى كرته الجديد. */
  taWindowOpened: (closesAt: string, sent: Array<{ instructorId: number; linkId: string }>) => fire("ta window", current => current.taWindowOpened(closesAt, sent)),
  /** 📨 طلبُ شعبة (src/server/sectionRequestsRoutes.ts): لمن تختارهم قاعدةُ الطرف بنطاقه وصفته. */
  toAccounts: (pick: (account: PushAccount) => boolean, message: PushMessage, topicSeed: string) => fire("section request", current => current.noteForAccounts(pick, message, topicSeed)),
  /** تسجيلُ خروجٍ صريح: تُسقط اشتراكاتُ الأجهزة التي فُعّلت من تلك الجلسة. */
  signedOut: (sessionId: string) => fire("signed out", current => current.signedOut(sessionId)),
};

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export function registerPushRoutes(app: Express, deps: PushRouteDeps): PushEngine {
  const current = createPushEngine(deps);
  engine = current;
  const clockIso = () => new Date((deps.now || Date.now)()).toISOString();
  const unavailable = (res: Response) => res.status(503).json({ error: "التنبيهات غير متاحة الآن. حاول بعد قليل." });
  const saveRecord = async (subscription: NonNullable<ReturnType<typeof readPushSubscription>>, owner: Partial<PushSubscriptionRecord>, req: Request) => {
    const id = pushSubscriptionId(subscription.endpoint);
    const previous = await Repository.getPushSubscription(id);
    const sameOwner = previous && previous.ownerKind === owner.ownerKind && previous.userId === owner.userId && previous.cardToken === owner.cardToken;
    const at = clockIso();
    return Repository.savePushSubscription({
      id, endpoint: subscription.endpoint, keys: subscription.keys,
      ownerKind: owner.ownerKind as "user" | "card",
      ...(owner.userId ? { userId: owner.userId } : {}),
      ...(owner.cardToken ? { cardToken: owner.cardToken, instructorId: owner.instructorId } : {}),
      createdAt: sameOwner ? previous!.createdAt : at, updatedAt: at,
      device: deviceLabel(req.headers["user-agent"]) || undefined,
      ...(owner.session ? { session: owner.session } : {}),
    });
  };

  /* ── المفتاحُ العام: applicationServerKey في المتصفّح ─────────────────────── */
  app.get("/api/public/push/key", async (_req: Request, res: Response) => {
    try { res.setHeader("Cache-Control", "no-cache"); res.json({ publicKey: (await current.vapid()).publicKey }); }
    catch (error) { console.warn("[push] key:", error instanceof Error ? error.message : error); unavailable(res); }
  });

  /* ── التطبيق: صاحبُ الحساب وأجهزتُه ─────────────────────────────────────── */
  app.get("/api/push/status", deps.requireAuth, async (req: any, res: Response) => {
    const userId = Number(req.user?.SystemUserId || 0);
    const [keys, records, audience] = await Promise.all([
      current.vapid().catch(() => null), Repository.listPushSubscriptions({ userId, ownerKind: "user" }), current.audienceOf(userId).catch(() => null),
    ]);
    res.setHeader("Cache-Control", "no-store");
    const cookie = /(?:^|;\s*)session_id=([^;]+)/.exec(String(req.headers.cookie || ""))?.[1];
    const tag = cookie ? pushSessionTag(cookie) : "";
    res.json({ enabled: Boolean(keys), publicKey: keys?.publicKey || "", audience: Boolean(audience), ids: records.map(record => record.id),
      /* أجهزةٌ مربوطةٌ بهذه الجلسة؛ وما سواها تربطه البطاقةُ بها مرّةً عند فتحها. */
      bound: records.filter(record => tag && record.session === tag).map(record => record.id) });
  });

  app.post("/api/push/subscribe", deps.requireAuth, async (req: any, res: Response) => {
    const subscription = readPushSubscription(req.body?.subscription);
    if (!subscription) { res.status(400).json({ error: "اشتراكٌ غير صالح من هذا المتصفح." }); return; }
    const userId = Number(req.user?.SystemUserId || 0);
    const cookie = /(?:^|;\s*)session_id=([^;]+)/.exec(String(req.headers.cookie || ""))?.[1];
    const saved = await saveRecord(subscription, { ownerKind: "user", userId, ...(cookie ? { session: pushSessionTag(cookie) } : {}) }, req);
    res.locals.auditEntity = "تنبيهات الجوال";
    res.locals.auditChanges = `تفعيل التنبيهات على جهاز${saved.device ? ` (${saved.device})` : ""}`;
    res.json({ ok: true, id: saved.id });
  });

  app.post("/api/push/unsubscribe", deps.requireAuth, async (req: any, res: Response) => {
    const id = pushSubscriptionId(String(req.body?.endpoint || ""));
    const record = await Repository.getPushSubscription(id);
    if (record && record.ownerKind === "user" && Number(record.userId) === Number(req.user?.SystemUserId)) await Repository.deletePushSubscription(id);
    res.locals.auditEntity = "تنبيهات الجوال";
    res.locals.auditChanges = "إيقاف التنبيهات على جهاز";
    res.json({ ok: true });
  });

  app.post("/api/push/test", deps.requireAuth, async (req: any, res: Response) => {
    const records = await Repository.listPushSubscriptions({ userId: Number(req.user?.SystemUserId || 0), ownerKind: "user" });
    if (!records.length) { res.status(409).json({ error: "فعّل التنبيهات على هذا الجهاز أولاً." }); return; }
    try {
      const report = await current.deliver(records, adminTestMessage(), { urgency: "high" });
      res.locals.auditEntity = "تنبيهات الجوال";
      res.locals.auditChanges = "تجربة التنبيهات";
      if (!report.sent && report.limited) { res.status(429).json({ error: "جرّبتَ للتو. انتظر دقيقة.", ...report }); return; }
      res.json({ ok: report.sent > 0, ...report });
    } catch (error) { console.warn("[push] test:", error instanceof Error ? error.message : error); unavailable(res); }
  });

  /**
   * المتصفّحُ يجدّد اشتراكَه أحياناً (pushsubscriptionchange) والتطبيقُ مغلق والجلسةُ
   * منتهية. فيُثبت العاملُ ملكيتَه بالاشتراك القديم نفسه — رابطُه وسرُّه معاً، ولا
   * يعرفهما إلا المتصفّحُ وهذا الخادم — فينتقل السجلُّ إلى الجديد بصاحبه نفسه.
   */
  app.post("/api/public/push/rotate", async (req: Request, res: Response) => {
    const next = readPushSubscription(req.body?.subscription);
    const oldEndpoint = String(req.body?.old?.endpoint || "");
    const oldAuth = String(req.body?.old?.auth || "");
    const previous = oldEndpoint ? await Repository.getPushSubscription(pushSubscriptionId(oldEndpoint)) : null;
    if (!next || !previous || previous.endpoint !== oldEndpoint || !sameSecret(previous.keys.auth, oldAuth)) { res.status(404).json({ error: "لا اشتراك." }); return; }
    if (previous.ownerKind === "card" && !(await deps.resolveCard(String(previous.cardToken || "")))) {
      await Repository.deletePushSubscription(previous.id);
      res.status(410).json({ error: "أُوقفت هذه البطاقة." });
      return;
    }
    await saveRecord(next, previous, req);
    if (pushSubscriptionId(next.endpoint) !== previous.id) await Repository.deletePushSubscription(previous.id);
    res.json({ ok: true });
  });

  /* ── كرتُ الأستاذ: رمزُه هو المفتاح ─────────────────────────────────────── */
  const cardOf = async (req: Request, res: Response) => {
    const token = String(req.params.token || "");
    const card = CARD_TOKEN_PATTERN.test(token) ? await deps.resolveCard(token) : null;
    if (!card) res.status(404).json({ error: "الرابط غير موجود أو تم إيقافه" });
    return card;
  };

  app.get("/api/public/request/:token/push", async (req: Request, res: Response) => {
    const card = await cardOf(req, res);
    if (!card) return;
    const [keys, records] = await Promise.all([current.vapid().catch(() => null), Repository.listPushSubscriptions({ cardToken: card.token, ownerKind: "card" })]);
    res.setHeader("Cache-Control", "no-store");
    res.json({ enabled: Boolean(keys), publicKey: keys?.publicKey || "", ids: records.map(record => record.id) });
  });

  app.post("/api/public/request/:token/push", async (req: Request, res: Response) => {
    const card = await cardOf(req, res);
    if (!card) return;
    const subscription = readPushSubscription(req.body?.subscription);
    if (!subscription) { res.status(400).json({ error: "اشتراكٌ غير صالح من هذا المتصفح." }); return; }
    const saved = await saveRecord(subscription, { ownerKind: "card", cardToken: card.token, instructorId: Number(card.instructorId) }, req);
    res.json({ ok: true, id: saved.id });
  });

  app.post("/api/public/request/:token/push/off", async (req: Request, res: Response) => {
    const card = await cardOf(req, res);
    if (!card) return;
    const id = pushSubscriptionId(String(req.body?.endpoint || ""));
    const record = await Repository.getPushSubscription(id);
    if (record && record.ownerKind === "card" && record.cardToken === card.token) await Repository.deletePushSubscription(id);
    res.json({ ok: true });
  });

  app.post("/api/public/request/:token/push/test", async (req: Request, res: Response) => {
    const card = await cardOf(req, res);
    if (!card) return;
    const records = await Repository.listPushSubscriptions({ cardToken: card.token, ownerKind: "card" });
    if (!records.length) { res.status(409).json({ error: "فعّل التنبيهات على هذا الجهاز أولاً." }); return; }
    try {
      const report = await current.deliver(records, cardTestMessage(card.token), { urgency: "high" });
      if (!report.sent && report.limited) { res.status(429).json({ error: "جرّبتَ للتو. انتظر دقيقة.", ...report }); return; }
      res.json({ ok: report.sent > 0, ...report });
    } catch (error) { console.warn("[push] card test:", error instanceof Error ? error.message : error); unavailable(res); }
  });

  /* ── «بطاقتي» على الشاشة الرئيسية: تطبيقٌ صغير بدايتُه الكرتُ نفسه ─────────── */
  app.get("/r/:token/manifest.webmanifest", (req: Request, res: Response) => {
    const token = String(req.params.token || "");
    if (!CARD_TOKEN_PATTERN.test(token)) { res.status(404).type("text/plain; charset=utf-8").send("Not found"); return; }
    res.setHeader("Cache-Control", "no-cache");
    res.type("application/manifest+json; charset=utf-8").send(JSON.stringify(cardManifest(token)));
  });

  return current;
}
