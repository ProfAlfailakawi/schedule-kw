/**
 * ── «لماذا لا؟»: ما الذي يمنع هذا الموعد من الجلوس هنا؟ ─────────────────────────────
 *
 * حقلٌ نقيٌّ يقرأ كلَّ خانةٍ فارغة في الأسبوع لموعدٍ واحد («الموضوع») ويقول: خضراء (حرّة)،
 * أو عنبرية (ممكنة بملاحظة)، أو حمراء (يمنعها شيء) — ومعها كلُّ الأسباب، أولُها الأهمّ.
 *
 * لا محرّكَ ثانياً. الموانعُ الصلبة (الأستاذ، القاعة، ضيق اليوم) هي بالحرف ما يقرؤه السحب:
 * `buildCandidate` هو `buildPhysicsTargetCandidate` نفسُه، و`blockers` هو `localPhysicsBlockers`
 * (فهرس SchedulePhysics/blockerIndex)، ونهايةُ الشبكة هي `gridWindow.end`. فلا تُخالف الطبقةُ ما
 * يفعله إفلاتُ البطاقة؛ ويثبت ذلك tests/why-not-audit.ts على عيّنة خانات.
 *
 * الأسبابُ اللينة (نمط الساعات، حجز زميل، الخريجون، ساعات الدوام، القاعة الشاغرة) تُلوّن بالعنبري وتُقال
 * في النافذة، ولا تمنع — كما لا يمنعها السحب (الخادمُ وحده يمنع الحفظ).
 */
import type { FSchedule } from "../types";

export type WhyKind = "instructor" | "room" | "span" | "locked" | "hold" | "graduates" | "pattern" | "noRoom" | "hours";
export type WhyTier = "free" | "caution" | "blocked";

export interface WhyMeta { label: string; hard: boolean; icon: WhyKind }
/** ترتيبُ المفاتيح هو ترتيبُ الأهمية: الأيقونة المهيمنة أولُ سببٍ موجود. */
export const WHY_META: Record<WhyKind, WhyMeta> = {
  instructor: { label: "الأستاذ مشغول", hard: true, icon: "instructor" },
  room: { label: "القاعة محجوزة", hard: true, icon: "room" },
  span: { label: "لا يتّسع اليوم", hard: true, icon: "span" },
  locked: { label: "مقفل بالاعتماد", hard: true, icon: "locked" },
  hold: { label: "زميل يحجزها", hard: false, icon: "hold" },
  graduates: { label: "يزاحم الخريجين", hard: false, icon: "graduates" },
  pattern: { label: "يغيّر النمط", hard: false, icon: "pattern" },
  noRoom: { label: "لا قاعة شاغرة", hard: false, icon: "noRoom" },
  hours: { label: "خارج الدوام", hard: false, icon: "hours" },
};
export const WHY_ORDER = Object.keys(WHY_META) as WhyKind[];
export const WHY_TIER_LABEL: Record<WhyTier, string> = { free: "متاحة", caution: "بملاحظة", blocked: "ممنوعة" };

export interface WhyItem { kind: WhyKind; detail?: string }
export interface WhyCell { day: string; start: string; tier: WhyTier; free: boolean; reasons: WhyItem[]; dominant: WhyKind | null }

export interface WhyBlocker { type: "instructor" | "room"; message: string; detail: string }

export interface WhyNotInput {
  subject: FSchedule;
  days: ReadonlyArray<{ key: string; label: string }>;
  slots: readonly string[];
  /** نهايةُ الشبكة بالدقائق (gridWindow.end). */
  gridEnd: number;
  mins: (clock: string) => number;
  buildCandidate: (row: FSchedule, target: { day: string; start: string }) => FSchedule;
  blockers: (source: FSchedule, probe: FSchedule) => WhyBlocker[];
  /** نقلُ الموعد إلى هذا اليوم يحوّل إيقاعه (1-3-5 ⇄ 2-4). */
  patternSwitch?: (day: string) => boolean;
  /** ساعاتُ دوام القسم بالدقائق: ملاحظةٌ فقط. */
  hours?: { start: number; end: number } | null;
  /** يومُ الجامعة (08:00–20:00 افتراضاً). */
  universe?: { start: number; end: number };
  /** حجوزُ الزملاء الملتقية بهذا المرشّح. */
  holdClash?: (candidate: FSchedule) => Array<{ name: string; on: string[] }>;
  /** نبضُ الخريجين لهذه الخانة (من fit-grid)، أو null. */
  graduates?: (day: string, start: string) => { percent: number; blocked: number } | null;
  /** سببُ القفل (اعتمادٌ/تجميد) إن وُجد: كلُّ الخانات مقفلة. */
  locked?: string | null;
}

export const dayKeysOf = (row: Partial<FSchedule>, days: ReadonlyArray<{ key: string }>) =>
  days.filter(day => Boolean((row as any)[day.key])).map(day => day.key);

const UNIVERSE = { start: 8 * 60, end: 20 * 60 };

/** حكمُ خانةٍ واحدة. الأسبابُ الصلبة الثلاثة الأولى هي حكمُ السحب بعينه. */
export function whyNotCell(input: WhyNotInput, day: string, start: string): WhyCell {
  const { subject } = input;
  const reasons: WhyItem[] = [];
  const candidate = input.buildCandidate(subject, { day, start });
  const from = input.mins(start);
  const to = Math.max(input.mins(candidate.fendtime), from + 1);
  if (to > input.gridEnd) reasons.push({ kind: "span" });
  for (const blocker of input.blockers(subject, candidate)) {
    const kind: WhyKind = blocker.type === "instructor" ? "instructor" : "room";
    if (!reasons.some(item => item.kind === kind)) reasons.push({ kind, detail: blocker.detail });
  }
  if (input.locked) reasons.push({ kind: "locked", detail: input.locked });
  const holds = input.holdClash?.(candidate) || [];
  if (holds.length) reasons.push({ kind: "hold", detail: holds[0].name });
  const grad = input.graduates?.(day, start);
  if (grad && grad.blocked > 0 && grad.percent < 60) reasons.push({ kind: "graduates", detail: `${grad.percent}%` });
  if (input.patternSwitch?.(day)) reasons.push({ kind: "pattern" });
  const uni = input.universe || UNIVERSE;
  const dept = input.hours;
  if (from < uni.start || to > uni.end) reasons.push({ kind: "hours", detail: "يوم الجامعة" });
  else if (dept && (from < dept.start || to > dept.end)) reasons.push({ kind: "hours", detail: "دوام القسم" });
  reasons.sort((a, b) => WHY_ORDER.indexOf(a.kind) - WHY_ORDER.indexOf(b.kind));
  const hard = reasons.some(item => WHY_META[item.kind].hard);
  return {
    day, start, reasons, dominant: reasons[0]?.kind || null,
    free: !hard, tier: hard ? "blocked" : reasons.length ? "caution" : "free",
  };
}

/** الحقلُ كاملاً: مفتاحُ الخانة `${day}:${start}`. خاناتُ الموعد نفسه (موضعُه الحالي) لا تُقرأ. */
export function whyNotField(input: WhyNotInput): Map<string, WhyCell> {
  const field = new Map<string, WhyCell>();
  const own = new Set(dayKeysOf(input.subject, input.days));
  for (const day of input.days) {
    for (const slot of input.slots) {
      if (own.has(day.key) && slot === input.subject.fstarttime) continue;
      field.set(`${day.key}:${slot}`, whyNotCell(input, day.key, slot));
    }
  }
  return field;
}

/** ما في الحقل من كل سبب (للمفتاح التصفوي)، والخانات الحرّة. */
export function whyNotCensus(field: ReadonlyMap<string, WhyCell>) {
  const reasons = new Map<WhyKind, number>();
  let free = 0;
  for (const cell of field.values()) {
    if (cell.tier === "free") free += 1;
    for (const item of cell.reasons) reasons.set(item.kind, (reasons.get(item.kind) || 0) + 1);
  }
  return { free, reasons, total: field.size };
}

/** ما يُقرأ بصوتٍ عالٍ لخانة. */
export const whyNotSpeech = (cell: WhyCell, dayLabel: string) =>
  `${dayLabel} ${cell.start} — ${cell.tier === "free" ? "متاحة" : cell.reasons.map(item => WHY_META[item.kind].label).join("، ")}`;
