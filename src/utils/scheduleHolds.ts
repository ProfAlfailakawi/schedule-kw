/**
 * ── حارسُ الزملاء في الواجهة: من يبني موعداً معي الآن، وأين نلتقي ─────────────────
 *
 * منذ الكراسي قد يعمل في القسم الواحد أكثرُ من عضوٍ في اللحظة نفسها. فالنموذجُ المفتوح
 * يُعلن ما يبنيه (حجزٌ ليّن لدقيقتين، src/server/scheduleHolds.ts)، ويقرأ ما يبنيه الزملاء،
 * ويقول للمنسّق قبل الحفظ: «زميلك يعمل الآن على القاعة نفسها في الوقت نفسه».
 *
 * ثلاثةُ قرارات يقوم عليها كلُّ ما هنا:
 *   ١) لا يمنع شيئاً. الحجزُ تنبيه، والحكمُ عند الحفظ كما كان (التعارضات على الخادم).
 *   ٢) لا يرمي خطأً إلى React أبداً. انقطاعُ الشبكة، أو خادمٌ قديم بلا هذه المسارات،
 *      أو حسابٌ بلا صلاحية — كلُّها نصٌّ في `error`، والنموذجُ يعمل كأن الحارس غير موجود.
 *   ٣) لا يعيد رسم المحرّر بلا سبب. القائمةُ تُستبدل حين يتغيّر محتواها فقط، وساعةُ الخادم
 *      تُقرأ مرةً وتثبت، فلا يتبدّل `expiresAt` مع كل سؤال.
 *
 * `holdClashes` نقيّة: يلتقي الحجزُ بالمسوّدة إذا تداخل الوقتُ في يومٍ مشترك (والحافّتان
 * المتلامستان لا تتداخلان) وكانت القاعةُ نفسها (المبنى والقاعة) أو الأستاذُ نفسه.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { DAY_FLAGS, DAY_LABELS } from "./naturalQuery";
import { isValidClock, normalizeClock } from "./scheduleTime";
import { toEnglishDigits } from "./digits";

export const HOLD_DAYS = DAY_FLAGS;
export type HoldDay = typeof DAY_FLAGS[number];
/** عمرُ الحجز على الخادم (SCHEDULE_HOLD_TTL_MS هناك). */
export const SCHEDULE_HOLD_TTL_MS = 120_000;
export const HOLD_DEBOUNCE_MS = 800;
export const HOLD_REFRESH_MS = 45_000;
export const HOLD_POLL_MS = 20_000;
const HOLDS_URL = "/api/schedule-holds";

/** ما يبنيه النموذجُ الآن. */
export interface HoldDraft {
  /** fsunday … fthursday؛ ما عداها يُهمل. */
  days: readonly string[];
  start: string;
  end: string;
  roomCode?: string;
  roomHall?: string;
  instructorId?: number;
  courseId?: number;
  sectionCode?: string;
}

/** حجزُ زميلٍ كما يصل من الخادم. `expiresAt` بساعة هذا المتصفّح (مصحَّحةً بفارق ساعة الخادم). */
export interface ScheduleHoldView {
  id: string;
  name: string;
  collegeId: number;
  sectionId: number;
  days: HoldDay[];
  start: string;
  end: string;
  roomCode: string;
  roomHall: string;
  instructorId: number;
  courseId: number;
  sectionCode: string;
  editId: number;
  expiresAt: number;
}

export type HoldClashReason = "room" | "instructor";
export interface HoldClash extends ScheduleHoldView {
  /** على ماذا نلتقي: القاعة، أو الأستاذ، أو كلاهما. */
  clashOn: HoldClashReason[];
  /** أيامُ المسوّدة التي يلتقي فيها الحجز. */
  sharedDays: HoldDay[];
}

export interface HoldClashOptions {
  /** أساتذةٌ ليسوا أشخاصاً («هيئة تدريسية»): لا يُقاس عليهم التقاء. */
  ignoreInstructorIds?: Iterable<number>;
}

interface NormalizedDraft {
  days: HoldDay[];
  start: string;
  end: string;
  roomCode: string;
  roomHall: string;
  instructorId: number;
  courseId: number;
  sectionCode: string;
}

const DAY_SET = new Set<string>(DAY_FLAGS);
const minutes = (clock: string) => {
  const [hour, minute] = clock.split(":").map(Number);
  return hour * 60 + minute;
};
const positive = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : 0;
};
const shortText = (value: unknown) =>
  toEnglishDigits(String(value ?? "")).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
const roomPart = (value: unknown) => shortText(value).toLowerCase();
/** القاعةُ مبنىً وقاعة معاً؛ مبنىً بلا قاعة (القاعة بانتظار التحديد) ليس قاعة. */
const roomKey = (code: unknown, hall: unknown) => {
  const c = roomPart(code), h = roomPart(hall);
  return c && h ? `${c}/${h}` : "";
};
const orderedDays = (days: Iterable<unknown>): HoldDay[] => {
  const wanted = new Set<string>();
  for (const day of days) if (typeof day === "string" && DAY_SET.has(day)) wanted.add(day);
  return DAY_FLAGS.filter(day => wanted.has(day));
};

/** المسوّدةُ بشكلٍ واحد، أو null إن لم تكن موعداً بعد (بلا يوم، أو بلا وقتٍ صحيح). */
export function normalizeHoldDraft(draft: HoldDraft | null | undefined): NormalizedDraft | null {
  if (!draft || typeof draft !== "object") return null;
  const days = orderedDays(Array.isArray(draft.days) ? draft.days : []);
  const start = normalizeClock(toEnglishDigits(draft.start));
  const end = normalizeClock(toEnglishDigits(draft.end));
  if (!days.length || !isValidClock(start) || !isValidClock(end) || minutes(start) >= minutes(end)) return null;
  return {
    days, start, end,
    roomCode: shortText(draft.roomCode), roomHall: shortText(draft.roomHall),
    instructorId: positive(draft.instructorId), courseId: positive(draft.courseId),
    sectionCode: shortText(draft.sectionCode),
  };
}

/** مسوّدةُ نموذج «موعد جديد» كما يحملها المحرّر (fsunday…، fstarttime، AdRoomCode…). */
export function holdDraftFromForm(form: Record<string, unknown> | null | undefined): HoldDraft {
  const source = form || {};
  return {
    days: DAY_FLAGS.filter(day => Boolean(source[day])),
    start: String(source.fstarttime ?? ""),
    end: String(source.fendtime ?? ""),
    roomCode: String(source.AdRoomCode ?? ""),
    roomHall: String(source.AdRoomHall ?? ""),
    instructorId: Number(source.AdInstructorId || 0),
    courseId: Number(source.AdCourseId || 0),
    sectionCode: String(source.SCode ?? ""),
  };
}

/**
 * حجوزُ الزملاء التي تلتقي بمسوّدتي: وقتٌ متداخل في يومٍ مشترك، على القاعة نفسها أو
 * الأستاذ نفسه. الحافّتان المتلامستان (تنتهي إحداهما حيث تبدأ الأخرى) لا تتداخلان.
 */
export function holdClashes(draft: HoldDraft | null | undefined, holds: readonly ScheduleHoldView[] | null | undefined, options: HoldClashOptions = {}): HoldClash[] {
  const mine = normalizeHoldDraft(draft);
  if (!mine || !Array.isArray(holds) || !holds.length) return [];
  const ignore = new Set(Array.from(options.ignoreInstructorIds || [], Number));
  const myRoom = roomKey(mine.roomCode, mine.roomHall);
  const myTeacher = mine.instructorId && !ignore.has(mine.instructorId) ? mine.instructorId : 0;
  if (!myRoom && !myTeacher) return [];
  const from = minutes(mine.start), to = minutes(mine.end);
  const out: HoldClash[] = [];
  for (const hold of holds) {
    if (!hold || typeof hold !== "object") continue;
    const start = normalizeClock(hold.start), end = normalizeClock(hold.end);
    if (!isValidClock(start) || !isValidClock(end)) continue;
    if (!(from < minutes(end) && to > minutes(start))) continue;
    const theirs = new Set(Array.isArray(hold.days) ? hold.days : []);
    const sharedDays = mine.days.filter(day => theirs.has(day));
    if (!sharedDays.length) continue;
    const clashOn: HoldClashReason[] = [];
    if (myRoom && roomKey(hold.roomCode, hold.roomHall) === myRoom) clashOn.push("room");
    if (myTeacher && positive(hold.instructorId) === myTeacher) clashOn.push("instructor");
    if (clashOn.length) out.push({ ...hold, clashOn, sharedDays });
  }
  return out;
}

/** حجوزُ قسمٍ واحد (لشارة «زميلان يعملان الآن»). */
export function departmentHolds(holds: readonly ScheduleHoldView[] | null | undefined, collegeId?: number, sectionId?: number): ScheduleHoldView[] {
  const list = Array.isArray(holds) ? holds : [];
  const c = positive(collegeId), s = positive(sectionId);
  return list.filter(hold => (!c || positive(hold.collegeId) === c) && (!s || positive(hold.sectionId) === s));
}

/** أسماءُ الأيام: «الأحد، الثلاثاء». */
export function holdDayNames(days: readonly string[] | null | undefined): string {
  return orderedDays(days || []).map(day => DAY_LABELS[DAY_FLAGS.indexOf(day)]).join("، ");
}

/** «12/3» أو "". */
export function holdRoomLabel(hold: { roomCode?: string; roomHall?: string } | null | undefined): string {
  const code = shortText(hold?.roomCode), hall = shortText(hold?.roomHall);
  return code && hall ? `${code}/${hall}` : code || hall;
}

/** ما يصل من الخادم يُقرأ بحذر: حقولٌ معروفة فقط، ووقتٌ صحيح، وحجزٌ لم ينتهِ. */
function readHoldList(raw: unknown, serverNow: number): ScheduleHoldView[] {
  if (!Array.isArray(raw)) return [];
  const out: ScheduleHoldView[] = [];
  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const start = normalizeClock(row.start), end = normalizeClock(row.end);
    const days = orderedDays(Array.isArray(row.days) ? row.days : []);
    const expiresAt = Number(row.expiresAt);
    if (!isValidClock(start) || !isValidClock(end) || !days.length || !Number.isFinite(expiresAt)) continue;
    if (Number.isFinite(serverNow) && serverNow > 0 && expiresAt <= serverNow) continue;
    out.push({
      id: String(row.id ?? "").slice(0, 64),
      name: String(row.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "زميل",
      collegeId: positive(row.collegeId),
      sectionId: positive(row.sectionId),
      days, start, end,
      roomCode: shortText(row.roomCode), roomHall: shortText(row.roomHall),
      instructorId: positive(row.instructorId), courseId: positive(row.courseId),
      sectionCode: shortText(row.sectionCode), editId: positive(row.editId),
      expiresAt,
    });
  }
  return out;
}

/* ── الخطّاف ───────────────────────────────────────────────────────────────── */

export interface UseScheduleHoldsInput {
  /** النموذجُ مفتوح (والمحرّرُ يملك صلاحية التعديل). */
  enabled: boolean;
  termId: number;
  collegeId: number;
  sectionId: number;
  draft: HoldDraft | null | undefined;
  /** الموعدُ المفتوح للتعديل، أو null لموعدٍ جديد. */
  editId?: number | null;
  /** أساتذةٌ ليسوا أشخاصاً («هيئة تدريسية»). */
  ignoreInstructorIds?: Iterable<number>;
}

export interface ScheduleHoldsState {
  /** حجوزُ الزملاء الحيّة في الفصل، في الأقسام التي أراها. */
  holds: ScheduleHoldView[];
  /** ما يلتقي منها بمسوّدتي الآن. */
  clashes: HoldClash[];
  /** آخرُ تعذّر، أو "" — للعرض الهادئ إن شاء المحرّر، لا يُرمى أبداً. */
  error: string;
}

interface HoldPayload extends NormalizedDraft {
  termId: number;
  collegeId: number;
  sectionId: number;
  editId: number;
}

const EMPTY_HOLDS: ScheduleHoldView[] = [];
const JSON_HEADERS = { "Content-Type": "application/json" };
/* ردودٌ لا يُصلحها التكرار: طلبٌ مرفوض، أو بلا صلاحية، أو خادمٌ لا يعرف المسار بعد. */
const FINAL_STATUSES = new Set([400, 401, 403, 404, 405]);

async function errorOf(response: Response): Promise<string> {
  try {
    const data = await response.clone().json();
    if (data && typeof data.error === "string" && data.error.trim()) return data.error.trim().slice(0, 200);
  } catch { /* ليس JSON */ }
  return response.status === 403 ? "حارسُ الزملاء خارج صلاحيتك." : "تعذّر الوصول إلى حارس الزملاء.";
}
const networkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  return /[\u0600-\u06ff]/.test(message) ? message.slice(0, 200) : "تعذّر الوصول إلى حارس الزملاء.";
};
const safely = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

export interface HoldEngine {
  start(): void;
  stop(): void;
  /** `payloadKey`: جسمُ الحجز نصّاً (holdPayloadKey)، أو "" لمسوّدةٍ لم تصر موعداً بعد. */
  configure(enabled: boolean, termId: number, payloadKey: string): void;
}
export interface HoldTiming { debounceMs: number; refreshMs: number; pollMs: number }

/**
 * المحرّكُ خارج React: مؤقّتاتٌ، وطلبٌ في الطريق، وآخرُ ما رُسم. لا يصل React منه
 * إلا قائمةٌ تغيّرت أو نصُّ تعذّرٍ تغيّر. يستعمله الخطّاف وحده؛ ويُصدَّر ليُختبر بساعةٍ أقصر.
 */
export function createHoldEngine(
  setHolds: (list: ScheduleHoldView[]) => void,
  setError: (message: string) => void,
  timing: Partial<HoldTiming> = {},
): HoldEngine {
  const DEBOUNCE = timing.debounceMs ?? HOLD_DEBOUNCE_MS;
  const REFRESH = timing.refreshMs ?? HOLD_REFRESH_MS;
  const POLL = timing.pollMs ?? HOLD_POLL_MS;
  let alive = false, enabled = false, termId = 0;
  let payloadKey = "", payload: HoldPayload | null = null;
  let held = false, epoch = 0, releasedAt = 0;
  /* الإعلانُ والرفعُ يمضيان في طابورٍ واحد، واحداً بعد واحد: فلا يسبق رفعٌ إعلاناً ما زال
     في الطريق فيحييه الإعلانُ بعده، ولا يصل إعلانٌ قديم بعد جديد. القراءةُ خارج الطابور. */
  let queue: Promise<void> = Promise.resolve();
  let busy = 0, postQueued = false;
  let deniedKey = "", pollDenied = false;
  let actTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pollAbort: AbortController | null = null;
  let shownKey = "[]", shownError = "";
  /* تعذّرُ الإعلان يبقى ما بقيت المسوّدةُ نفسها، وتعذّرُ القراءة ما بقيت القراءةُ تتعذّر:
     قراءةٌ ناجحة لا تمحو «خارج صلاحيتك» عن إعلانٍ مرفوض. */
  let postError = "", pollError = "";
  let skew = 0, skewKnown = false;

  const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
  const stopTimer = (timer: ReturnType<typeof setTimeout> | null) => { if (timer) clearTimeout(timer); return null; };
  const report = () => {
    const message = postError || pollError;
    if (message === shownError) return;
    shownError = message;
    if (alive) safely(() => setError(message), undefined);
  };
  const show = (list: ScheduleHoldView[]) => {
    const key = JSON.stringify(list);
    if (key === shownKey) return;
    shownKey = key;
    if (alive) safely(() => setHolds(list.length ? list : EMPTY_HOLDS), undefined);
  };

  const enqueue = (task: () => Promise<void>) => {
    busy += 1;
    queue = queue.then(task).catch(() => undefined).then(() => { busy = Math.max(0, busy - 1); });
  };
  const sendRelease = (): Promise<void> => {
    try {
      return fetch(HOLDS_URL, { method: "DELETE", credentials: "include", keepalive: true }).then(() => undefined, () => undefined);
    } catch {
      return Promise.resolve(); /* الحجزُ ينتهي وحده بعد دقيقتين */
    }
  };
  /**
   * يرفع الحجز الآن (keepalive: يصل ولو كانت الصفحةُ تُغلق)، ومرةً ثانية في الطابور بعد
   * ما في الطريق — فإعلانٌ وصل الخادمَ بعد الرفع الأول لا يبقى حيّاً.
   */
  const release = () => {
    actTimer = stopTimer(actTimer);
    refreshTimer = stopTimer(refreshTimer);
    releasedAt = ++epoch;
    if (postError) { postError = ""; report(); }
    if (!held && !busy) return;
    const inFlight = busy > 0;
    held = false;
    void sendRelease();
    if (inFlight) enqueue(sendRelease);
  };

  async function poll(): Promise<void> {
    if (!alive || !enabled || !termId || pollDenied || hidden()) return;
    pollAbort?.abort();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    pollAbort = controller;
    const asked = termId;
    try {
      const response = await fetch(`${HOLDS_URL}?termId=${asked}`, { credentials: "include", cache: "no-store", signal: controller?.signal });
      if (!alive || controller?.signal.aborted || asked !== termId) return;
      if (!response.ok) {
        if (FINAL_STATUSES.has(response.status)) pollDenied = true;
        pollError = await errorOf(response);
        report();
        return;
      }
      const data: any = await response.json().catch(() => null);
      if (!alive || controller?.signal.aborted || asked !== termId || !enabled) return;
      const serverNow = Number(data?.now);
      if (Number.isFinite(serverNow) && serverNow > 0) {
        /* فارقُ الساعتين يثبت ما لم يتغيّر بأكثر من ثلاث ثوانٍ، فلا يرتجف العدّاد مع كل سؤال. */
        const measured = serverNow - Date.now();
        if (!skewKnown || Math.abs(measured - skew) > 3_000) { skew = measured; skewKnown = true; }
      }
      show(readHoldList(data?.holds, serverNow).map(hold => ({ ...hold, expiresAt: hold.expiresAt - skew })));
      pollError = "";
      report();
    } catch (error) {
      if (controller?.signal.aborted) return;
      pollError = networkError(error);
      report();
    } finally {
      if (pollAbort === controller) pollAbort = null;
    }
  }

  /** يُعلن المسوّدةَ الحاضرة — ما تكون عليه حين يحين دورُها في الطابور، لا حين طُلب. */
  function sendHold(): void {
    actTimer = stopTimer(actTimer);
    refreshTimer = stopTimer(refreshTimer);
    if (!alive || !enabled || !payload || hidden() || postQueued) return;
    postQueued = true;
    enqueue(async () => {
      postQueued = false;
      if (!alive || !enabled || !payload || hidden()) return;
      const key = payloadKey;
      if (deniedKey === key) { void poll(); return; }
      const mine = ++epoch;
      try {
        const response = await fetch(HOLDS_URL, { method: "POST", headers: JSON_HEADERS, credentials: "include", body: key });
        if (response.ok) {
          /* رُفع الحجزُ وهذا في الطريق: الرفعُ الثاني في الطابور بعده يمحوه. */
          if (releasedAt < mine) held = true;
          postError = "";
        } else {
          if (FINAL_STATUSES.has(response.status)) deniedKey = key;
          postError = await errorOf(response);
        }
      } catch (error) {
        postError = networkError(error);
      }
      report();
      if (alive && enabled && payloadKey === key && deniedKey !== key && !hidden() && releasedAt < mine) {
        refreshTimer = stopTimer(refreshTimer);
        refreshTimer = setTimeout(sendHold, REFRESH);
      }
      void poll();
    });
  }

  const restartPolling = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    pollAbort?.abort();
    pollAbort = null;
    show([]);
    if (!alive || !enabled || !termId) return;
    void poll();
    pollTimer = setInterval(() => { void poll(); }, POLL);
  };

  const onVisibility = () => {
    if (!alive) return;
    if (hidden()) { release(); return; }
    if (!enabled) return;
    if (payload) sendHold();
    else void poll();
  };
  const onPageHide = () => { if (alive) release(); };

  return {
    start() {
      if (alive) return;
      alive = true;
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
      if (typeof window !== "undefined") window.addEventListener("pagehide", onPageHide);
    },
    stop() {
      if (!alive) return;
      release();
      alive = false;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      if (typeof window !== "undefined") window.removeEventListener("pagehide", onPageHide);
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      pollAbort?.abort();
      pollAbort = null;
      /* بدايةٌ جديدة (StrictMode، أو فتحٌ ثانٍ) ترى كلَّ شيءٍ متغيّراً فتبدأ من أوله،
         وأولُ ما تعرضه يُكتب في الحالة ولو طابق ما قبل التوقف. */
      enabled = false; termId = 0; payloadKey = ""; payload = null;
      deniedKey = ""; pollDenied = false; postError = ""; pollError = ""; shownKey = "\u0000"; shownError = "\u0000";
    },
    configure(nextEnabled, nextTerm, nextKey) {
      if (!alive) return;
      const switched = nextEnabled !== enabled || nextTerm !== termId;
      const changed = nextKey !== payloadKey;
      enabled = nextEnabled;
      termId = nextTerm;
      payloadKey = nextKey;
      payload = nextKey ? safely(() => JSON.parse(nextKey) as HoldPayload, null) : null;
      if (switched) { pollDenied = false; pollError = ""; report(); restartPolling(); }
      if (!enabled) { release(); return; }
      if (!payload) { release(); return; }
      if (!changed && !switched && (held || busy)) return;
      /* المسوّدةُ تغيّرت: يُعلن الجديدُ بعد أن يهدأ التحرير، ويُقرأ الزملاءُ بعده. */
      actTimer = stopTimer(actTimer);
      actTimer = setTimeout(sendHold, DEBOUNCE);
    },
  };
}

/** جسمُ الحجز كما يُرسل (نصّاً ثابتاً لمحتوى واحد)، أو "" إن لم تصر المسوّدةُ موعداً بعد. */
export function holdPayloadKey(input: Pick<UseScheduleHoldsInput, "termId" | "collegeId" | "sectionId" | "draft" | "editId">): string {
  const termId = positive(input?.termId), collegeId = positive(input?.collegeId), sectionId = positive(input?.sectionId);
  const normalized = safely(() => normalizeHoldDraft(input?.draft), null);
  if (!termId || !collegeId || !sectionId || !normalized) return "";
  return JSON.stringify({ termId, collegeId, sectionId, ...normalized, editId: positive(input?.editId) } satisfies HoldPayload);
}

/**
 * يُعلن ما يبنيه النموذجُ ويقرأ ما يبنيه الزملاء:
 *   • مسوّدةٌ فيها يومٌ ووقتُ بداية ونهاية ← حجزٌ بعد 800 ملّي ثانية من آخر تغيير، يتجدّد كل 45 ثانية؛
 *   • إغلاقُ النموذج، أو مغادرةُ الصفحة، أو إخفاؤها ← رفعُ الحجز (keepalive)، والعودةُ تعيده؛
 *   • حجوزُ الزملاء تُقرأ كل 20 ثانية، وبعد كل إعلان.
 */
export function useScheduleHolds(input: UseScheduleHoldsInput): ScheduleHoldsState {
  const enabled = Boolean(input?.enabled);
  const termId = positive(input?.termId);
  const draft = input?.draft;
  const normalized = safely(() => normalizeHoldDraft(draft), null);
  const draftKey = normalized ? JSON.stringify(normalized) : "";
  const payloadKey = enabled ? holdPayloadKey(input) : "";
  const ignoreList = safely(() => [...new Set(Array.from(input?.ignoreInstructorIds || [], Number))].filter(positive).sort((a, b) => a - b), [] as number[]);
  const ignoreKey = ignoreList.join(",");

  const [holds, setHolds] = useState<ScheduleHoldView[]>(EMPTY_HOLDS);
  const [error, setError] = useState("");
  const engine = useRef<HoldEngine | null>(null);
  if (!engine.current) engine.current = createHoldEngine(setHolds, setError);

  useEffect(() => {
    const current = engine.current!;
    safely(() => current.start(), undefined);
    return () => { safely(() => current.stop(), undefined); };
  }, []);
  useEffect(() => {
    safely(() => engine.current!.configure(enabled, termId, payloadKey), undefined);
  }, [enabled, termId, payloadKey]);

  const clashes = useMemo(
    () => safely(() => (enabled ? holdClashes(draft, holds, { ignoreInstructorIds: ignoreList }) : []), [] as HoldClash[]),
    // المحتوى لا الهوية: المحرّرُ يبني المسوّدة كائناً جديداً في كل رسم.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, holds, draftKey, ignoreKey],
  );
  const visible = enabled ? holds : EMPTY_HOLDS;
  return useMemo(() => ({ holds: visible, clashes, error }), [visible, clashes, error]);
}
