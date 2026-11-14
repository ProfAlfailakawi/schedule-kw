/**
 * ── «نبض الكروت» ──────────────────────────────────────────────────────────────
 * أين وصل كلُّ أستاذٍ في بطاقته؟ مراحلُ لا تتداخل — كلُّ بطاقةٍ في مرحلةٍ واحدة:
 *
 *   unopened  لم يفتح الرابط بعد
 *   opened    فتح ولم يرسل
 *   sent      أرسل ولا شيءَ ينتظر قرارَ القسم (ثبّت جدولَه كما هو)
 *   awaiting  أرسل وفي طلبه بندٌ أو ملاحظةٌ ينتظر قرارَك
 *   complete  أرسل وقُرّر في كل بنوده
 *
 * رابطُ «العرض فقط» لا ينتظر جواباً فلا يُعدّ في أيّ مرحلة (المصدرُ الواحد: awaitsAnswer)، وكذلك المستبدَل والمُنشأ مكانَ
 * أستاذٍ وهميّ. دوالُّ خالصة يقرؤها الوارد والخادمُ معاً.
 */
import type { InstructorRequest, InstructorRequestItem } from "../types";
import { isUnchangedConfirmed } from "./instructorRequestConfirmation";
import { awaitsAnswer, isTaRequest } from "./requestParticipation";
import { followUpState } from "./cardRecipients";

export type PulseStage = "unopened" | "opened" | "sent" | "awaiting" | "complete";
export const PULSE_STAGES: readonly PulseStage[] = ["unopened", "opened", "sent", "awaiting", "complete"];

/** ما يلزم من الطلب لتحديد مرحلته — يقبل الصفَّ الخام أو صفَّ الوارد. */
export type PulseRow = Pick<InstructorRequest, "status" | "linkMode" | "submittedAt"> & {
  id?: string;
  items?: ReadonlyArray<Pick<InstructorRequestItem, "action"> & { decision?: { state?: string } | null; hidden?: boolean }>;
  note?: string;
  pinViolations?: unknown;
  linkOpenedAt?: unknown;
  timeline?: InstructorRequest["timeline"];
};

/** بنودٌ طلب الأستاذ فيها شيئاً (لا «أبقِ») وتخصّ القارئ (ليست مخفيّة). */
const askedItems = (row: PulseRow) => (row.items || []).filter(item => item.action !== "keep" && !item.hidden);

/** مرحلةُ بطاقةٍ واحدة، أو null إن لم تدخل العدّ (عرضٌ فقط، مستبدَلة). */
export function pulseStageOf(row: PulseRow): PulseStage | null {
  if (row.status === "superseded" || !awaitsAnswer(row)) return null;
  const state = followUpState(row as any);
  if (state === "sent") return "unopened";
  if (state === "opened") return "opened";
  const asked = askedItems(row);
  const undecided = asked.some(item => !item.decision?.state);
  if (undecided) return "awaiting";
  if (asked.length) return "complete";
  /* ملاحظةٌ عامة أو مخالفةٌ لائحية بلا بنود: تنتظر القسم ما دام الطلبُ لم يُسوَّ. */
  if ((row.note || row.pinViolations) && row.status !== "settled") return "awaiting";
  /* لا بنود: «ثبّت جدولي كما هو» لم يطلب شيئاً، أو طلبٌ سُوّي. */
  return isUnchangedConfirmed(row as any) ? "sent" : row.status === "settled" ? "complete" : "sent";
}

export interface CardPulse {
  total: number;
  counts: Record<PulseStage, number>;
  /** بطاقاتُ المرحلة (بمعرّفاتها) لتصفيةٍ أو تذكير. */
  ids: Record<PulseStage, string[]>;
  /** نسبةُ من ردّ (أرسل فما بعد) من كلّ من يُنتظر منه جواب؛ null بلا بطاقات. */
  repliedPercent: number | null;
}

export function cardPulse(rows: readonly PulseRow[]): CardPulse {
  const counts = Object.fromEntries(PULSE_STAGES.map(stage => [stage, 0])) as Record<PulseStage, number>;
  const ids = Object.fromEntries(PULSE_STAGES.map(stage => [stage, [] as string[]])) as Record<PulseStage, string[]>;
  let total = 0;
  for (const row of rows) {
    const stage = pulseStageOf(row);
    if (!stage) continue;
    total += 1;
    counts[stage] += 1;
    if (row.id) ids[stage].push(String(row.id));
  }
  const replied = counts.sent + counts.awaiting + counts.complete;
  return { total, counts, ids, repliedPercent: total ? Math.round((replied / total) * 100) : null };
}

/* ── «ذكّر الباقين»: من يقع عليه التذكير، ولماذا يُستثنى غيرُه ─────────────────────────────── */
/** لا تذكيرٌ ثانٍ لأستاذٍ ذُكِّر قبل أقلّ من هذه المدة (ست ساعات): الحدُّ يحمي صندوقه من الإلحاح. */
export const REMIND_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type RemindSkip = "view" | "ta" | "excluded" | "answered" | "closed" | "recent";
export const REMIND_SKIP_LABEL: Record<RemindSkip, string> = {
  view: "رابطُ عرضٍ فقط",
  ta: "مرحلة التدريب",
  excluded: "منتدب أو متدرّب",
  answered: "أرسل أو تغيّرت حالته",
  closed: "انتهت نافذة طلبه",
  recent: "ذُكِّر قبل قليل",
};

export interface RemindCandidate {
  AdInstructorId: number;
  status: InstructorRequest["status"];
  linkMode?: InstructorRequest["linkMode"];
  submittedAt?: string;
  linkOpenedAt?: unknown;
  remindedAt?: readonly string[];
  window?: InstructorRequest["window"];
  individualException?: InstructorRequest["individualException"];
}

export interface RemindPlan<T> { targets: T[]; skipped: Array<{ row: T; reason: RemindSkip }>; }

/**
 * يحكم الخادمُ بمن يُذكَّر لحظةَ الضغط — وهذه قاعدتُه:
 *   ✏️ طلبُ تعديلٍ وحده (لا العرض ولا التدريب)، لم يُرسل بعد (لم يفتح أو فتح)، ليس منتدباً ولا متدرّباً مستبعَداً،
 *   نافذتُه مفتوحة — الموعدُ العام أو استثناؤه الفردي المؤقّت (windowOpen) — ولم يُذكَّر خلال المدة.
 * والأولويةُ في سبب الاستبعاد من الأعمّ إلى الأخصّ.
 */
export function planReminders<T extends RemindCandidate>(
  rows: readonly T[],
  options: { now?: number; windowOpen: (row: T) => boolean; excluded?: ReadonlySet<number> | ReadonlyMap<number, unknown>; cooldownMs?: number },
): RemindPlan<T> {
  const now = options.now ?? Date.now();
  const cooldown = options.cooldownMs ?? REMIND_COOLDOWN_MS;
  const targets: T[] = [];
  const skipped: Array<{ row: T; reason: RemindSkip }> = [];
  for (const row of rows) {
    const reason: RemindSkip | null =
      row.linkMode === "view" ? "view"
      : isTaRequest(row) ? "ta"
      : options.excluded?.has(Number(row.AdInstructorId)) ? "excluded"
      : row.submittedAt || row.status !== "sent" ? "answered"
      : !options.windowOpen(row) ? "closed"
      : (row.remindedAt || []).some(at => now - Date.parse(at) < cooldown && now >= Date.parse(at)) ? "recent"
      : null;
    if (reason) skipped.push({ row, reason }); else targets.push(row);
  }
  return { targets, skipped };
}

/** عدُّ الاستبعاد بحسب السبب (لجملة «تُخطّي …»). */
export function skipTally<T>(skipped: ReadonlyArray<{ row: T; reason: RemindSkip }>): Array<{ reason: RemindSkip; count: number }> {
  const tally = new Map<RemindSkip, number>();
  for (const entry of skipped) tally.set(entry.reason, (tally.get(entry.reason) || 0) + 1);
  return [...tally].map(([reason, count]) => ({ reason, count }));
}

/* ── حدٌّ على الإرسال نفسه: لا يضغط أحدٌ «ذكّر الباقين» أكثر من ست مرّات في الساعة ─────────────── */
export const REMIND_BURST_MAX = 6;
export const REMIND_BURST_WINDOW_MS = 60 * 60 * 1000;

/** يقرّر إن كان للمرسِل ضغطةٌ أخرى؛ ويعيد السجلَّ بعد تنظيف ما خرج من النافذة (لا يضيف الضغطةَ الجديدة). */
export function remindBurst(history: readonly number[], now: number, max = REMIND_BURST_MAX, windowMs = REMIND_BURST_WINDOW_MS): { allowed: boolean; recent: number[]; retryAfterMs: number } {
  const recent = history.filter(at => now - at < windowMs && at <= now);
  const allowed = recent.length < max;
  return { allowed, recent, retryAfterMs: allowed ? 0 : Math.max(0, windowMs - (now - Math.min(...recent))) };
}
