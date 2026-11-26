/**
 * ── البصمة والنبض عالمٌ واحد: عقد الرابط بينهما ─────────────────────────────
 *
 * «بصمة القسم» ترسم كل قاعةٍ حلقة، و«نبض القاعات» يرسمها غرفةً في مبنى. هذا
 * الملف هو الجسر الوحيد بينهما، فلا يكتب أحدهما رابط الآخر بيده:
 *
 *   من البصمة إلى النبض (قوسٌ أو حلقة):
 *     /FSchedule/Index?view=pulse&college=…&section=…&term=…&hall=<مفتاح>&day=<0-4>&at=HH:MM
 *   ومن النبض إلى البصمة (لوحة القاعة):
 *     /FSchedule/Fingerprint?college=…&section=…&term=…&hall=<مفتاح>
 *
 * مفتاح القاعة هو مفتاح سجلّ المواقع نفسه (roomKeyOf): «id:<رقم القاعة>» للقاعة
 * المسجّلة، و«legacy:<المبنى>|<القاعة>» للقاعة النصّية القديمة. البصمة تعرفه من
 * الخادم (deptFingerprintRoutes)، والنبض يشتقّه من قاعته بالدالة نفسها هنا، فتُعرف
 * القاعة الواحدة بمفتاحٍ واحد في الشاشتين.
 *
 * الرابط لا يفتح شيئاً لا يراه صاحبه: الشاشة التي يصل إليها تحرسها بوابتها
 * المعتادة، والنطاق يُعرض على نطاق القارئ قبل أن يُستعمل (resolveSharedScope).
 * حسابٌ خالص إلا سطري الانتقال في آخره.
 */
import { roomKeyOf } from "./locationRegistry";

export const PULSE_FOCUS_DAYS = 5;

export interface PulseFocus {
  collegeId: number;
  sectionId: number;
  termId: number;
  /** مفتاح القاعة كما في سجلّ المواقع (roomKeyOf). */
  hall: string;
  /** 0 الأحد … 4 الخميس. */
  day: number;
  /** الدقيقة من منتصف الليل. */
  at: number;
}

const whole = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

export const focusClock = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(Math.round(minute % 60)).padStart(2, "0")}`;

function parseClock(value: string | null): number | null {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]), m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** مفتاح قاعةٍ مقبول: «id:…» أو «legacy:…|…» بطولٍ معقول، لا أي نصٍّ يمرّ في الرابط. */
export function validHallKey(value: unknown): string {
  const key = String(value ?? "").trim();
  if (key.length > 160) return "";
  return /^id:[^\s|]+$/.test(key) || /^legacy:[^|]+\|[^|]+$/.test(key) ? key : "";
}

/** رابط النبض عند قاعةٍ ويومٍ وساعة. */
export function pulseFocusHref(focus: PulseFocus): string {
  const query = new URLSearchParams({
    view: "pulse",
    college: String(whole(focus.collegeId)), section: String(whole(focus.sectionId)), term: String(whole(focus.termId)),
    hall: validHallKey(focus.hall),
    day: String(Math.max(0, Math.min(PULSE_FOCUS_DAYS - 1, Math.trunc(focus.day) || 0))),
    at: focusClock(Math.max(0, Math.min(24 * 60 - 1, Math.round(focus.at)))),
  });
  return `/FSchedule/Index?${query.toString()}`;
}

/** يقرأ الرابط؛ وأيّ نقصٍ فيه (نطاقٌ أو قاعةٌ أو يومٌ أو ساعة) = لا طلب. */
export function parsePulseFocus(search: string): PulseFocus | null {
  const params = new URLSearchParams(search || "");
  if (params.get("view") !== "pulse") return null;
  const collegeId = whole(params.get("college")), sectionId = whole(params.get("section")), termId = whole(params.get("term"));
  const hall = validHallKey(params.get("hall"));
  const dayText = params.get("day");
  const day = dayText != null && /^\d$/.test(dayText) ? Number(dayText) : -1;
  const at = parseClock(params.get("at"));
  if (!collegeId || !sectionId || !termId || !hall || day < 0 || day >= PULSE_FOCUS_DAYS || at == null) return null;
  return { collegeId, sectionId, termId, hall, day, at };
}

/** رابط البصمة مبرزاً حلقة قاعة. */
export function fingerprintFocusHref(scope: { collegeId: number; sectionId: number; termId: number }, hall: string): string {
  const query = new URLSearchParams({ college: String(whole(scope.collegeId)), section: String(whole(scope.sectionId)), term: String(whole(scope.termId)) });
  const key = validHallKey(hall);
  if (key) query.set("hall", key);
  return `/FSchedule/Fingerprint?${query.toString()}`;
}

/** القاعة المطلوب إبرازها في البصمة من رابطها، أو فارغ. */
export function fingerprintFocusHall(search: string): string {
  return validHallKey(new URLSearchParams(search || "").get("hall"));
}

/* ── مفتاح القاعة في الشاشتين ─────────────────────────────────────────────── */

export interface PulseHallIdentity { key: string; roomId?: string; buildingCode: string; code: string }

/** مفتاح سجلّ المواقع لقاعةٍ من قاعات النبض: هو ما تحمله البصمة لحلقتها. */
export function registryKeyOfPulseHall(hall: PulseHallIdentity): string {
  return roomKeyOf(hall.roomId || "", hall.buildingCode, hall.code);
}

/**
 * قاعة النبض التي يعنيها مفتاح البصمة: بالمعرّف أولاً، ثم بالرمز النصّي (قاعةٌ قديمة
 * بلا معرّف، أو قاعةٌ مسجّلة جاءت البصمة بها نصّاً). null = ليست في هذا النطاق.
 */
export function resolvePulseHall(key: string, halls: readonly PulseHallIdentity[]): string | null {
  const wanted = validHallKey(key);
  if (!wanted) return null;
  for (const hall of halls) if (registryKeyOfPulseHall(hall) === wanted) return hall.key;
  if (wanted.startsWith("legacy:")) {
    for (const hall of halls) if (roomKeyOf("", hall.buildingCode, hall.code) === wanted) return hall.key;
  }
  return null;
}

/** حلقة البصمة التي يعنيها مفتاح النبض: رقمها في قائمة القاعات، أو null. */
export function resolveFingerprintRing(key: string, halls: ReadonlyArray<{ key?: string }>): number | null {
  const wanted = validHallKey(key);
  if (!wanted) return null;
  const index = halls.findIndex(hall => hall.key === wanted);
  return index >= 0 ? index : null;
}

/* ── أيّ موعدٍ تفتح عليه الحلقة ─────────────────────────────────────────────── */

/**
 * الحلقة (لا قوسٌ بعينه) تفتح النبض على أقرب محاضرةٍ فيها من الآن في دورة
 * الأسبوع: الجارية إن وُجدت، وإلا التالية، وإلا أولى الأسبوع.
 */
export function ringFocusSlot<T extends { day: number; start: number; end: number }>(slots: readonly T[], now: { day: number; minute: number }): T | null {
  if (!slots.length) return null;
  const week = 5 * 24 * 60;
  const nowAt = Math.max(0, Math.min(4, now.day)) * 24 * 60 + now.minute;
  let best: T | null = null, bestGap = Infinity;
  for (const slot of slots) {
    const startAt = slot.day * 24 * 60 + slot.start, endAt = slot.day * 24 * 60 + slot.end;
    const gap = nowAt >= startAt && nowAt < endAt ? -1 : (startAt - nowAt + week) % week;
    if (gap < bestGap) { best = slot; bestGap = gap; }
  }
  return best;
}

/* ── الانتقال ─────────────────────────────────────────────────────────────── */

/**
 * يأخذ طلب الفتح من عنوان الصفحة مرةً واحدة (رابطٌ منسوخ أو انتقالٌ داخلي)،
 * ثم ينظّف العنوان فلا يعود الطلب مع تحديث الصفحة.
 */
export function takePulseFocus(): PulseFocus | null {
  if (typeof window === "undefined") return null;
  const focus = parsePulseFocus(window.location.search);
  if (focus) {
    try { window.history.replaceState(window.history.state, "", window.location.pathname); } catch { /* لا شيء */ }
  }
  return focus;
}

/** انتقالٌ داخل التطبيق إلى عنوانٍ بعينه: يُكتب في التاريخ، ويقرأ التطبيق شاشته منه. */
export function openInApp(href: string): void {
  try {
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch { window.location.assign(href); }
}
