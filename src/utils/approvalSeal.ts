/**
 * ── ختم الاعتماد (FR-DSH-032 · FR-DSH-037) ──────────────────────────────────
 *
 * حين يعتمد التسجيل جدول القسم اعتماداً نهائياً يُختم ملصق «بصمة القسم» بختمٍ
 * ذهبي يبقى عليه ذلك الفصل، وتحتفل الشاشة مرةً واحدة: في «نبض القاعات» تضيء
 * نوافذ القاعات كلها معاً بغسلةٍ ذهبية، وفي الرئيسية يُضغط الختم على الشاشة.
 *
 * مصدر الحقيقة واحد: سجل اعتماد الجدول نفسه الذي يرويه «فيلم الفصل» —
 * `status === "accepted"` هو النهائي، وتاريخ الاعتماد من آخر جولةٍ قُبلت. لا
 * حالة جديدة ولا كتابة: الذاكرة الوحيدة «رأى هذا الحساب الاحتفال على هذا الجهاز»
 * في التخزين المحلي، والممنوع منه لا يُسقط شيئاً.
 *
 * هذا الملف حسابٌ خالص (ومعه قراءة التخزين المحلي وكتابته بحذر)، فيصلح للخادم
 * والشاشة معاً ولا يجرّ إلى حمولة الرئيسية شيئاً ثقيلاً.
 */

export interface ApprovalLike {
  status?: string;
  rounds?: Array<{ number?: number; acceptedAt?: string; amendment?: boolean }>;
}

/** الاعتماد النهائي كما يقرؤه فيلم الفصل: النهائي حالةُ «معتمد»، والتاريخ من آخر جولةٍ قُبلت. */
export function finalAcceptance(approval: ApprovalLike | null | undefined): { final: boolean; acceptedAt?: string; round?: number } {
  const final = approval?.status === "accepted";
  const accepted = [...(approval?.rounds || [])].reverse().find(round => round.acceptedAt);
  return { final, acceptedAt: accepted?.acceptedAt, round: accepted?.number };
}

/** ما يحمله الختم: الفصل وتاريخ الاعتماد (قد يغيب في سجلٍ قديم بلا تاريخ). */
export interface ApprovalSeal {
  termName: string;
  /** تاريخ الاعتماد كما في السجل (ISO)، أو `null` إن لم يُسجَّل. */
  acceptedAt: string | null;
  /** «16 نوفمبر 2026» بأرقامٍ لاتينية وبتوقيت الكويت، أو "" بلا تاريخ. */
  date: string;
}

/** «16 نوفمبر 2026»: يومٌ وشهرٌ وسنة، أرقامٌ لاتينية، بتوقيت الكويت. */
export function sealDateLabel(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuwait" }).format(date);
}

/** الختم من سجل الاعتماد، أو `null` ما لم يكن الاعتماد نهائياً. */
export function approvalSealFrom(approval: ApprovalLike | null | undefined, termName: string): ApprovalSeal | null {
  const { final, acceptedAt } = finalAcceptance(approval);
  if (!final) return null;
  return { termName: String(termName || ""), acceptedAt: acceptedAt || null, date: sealDateLabel(acceptedAt) };
}

/** السطر تحت الختم في لحظة الاحتفال. */
export function sealMomentLine(seal: Pick<ApprovalSeal, "date">): string {
  return seal.date ? `اعتُمد جدول القسم · ${seal.date}` : "اعتُمد جدول القسم";
}

/* ── مرةً واحدة: لكل حسابٍ على كل جهازٍ ولكل اعتماد ───────────────────────── */

/** مدة اللحظة كاملةً، ومدة الإطار الساكن لمن يفضّل حركةً أقل. */
export const SEAL_MOMENT_MS = 3200;
export const SEAL_STILL_MS = 1600;

const SEEN_KEY = "approval-seal-seen-v1";
const SEEN_CAP = 40;

/**
 * مفتاح الاعتماد الواحد: الحساب والقسم والفصل ولحظة الاعتماد. فإذا أُعيد الجدول
 * ثم اعتُمد من جديد (جولة تعديل) كان اعتماداً جديداً واحتفالاً جديداً.
 */
export function sealMomentKey(input: { viewer: number; collegeId: number; sectionId: number; termId: number; acceptedAt?: string | null }): string {
  return [Number(input.viewer) || 0, Number(input.collegeId) || 0, Number(input.sectionId) || 0, Number(input.termId) || 0, input.acceptedAt || "accepted"].join(":");
}

/** قائمة المفاتيح المرئية من نصّها المخزَّن؛ النص التالف قائمةٌ فارغة. */
export function parseSealSeen(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(item => typeof item === "string").slice(-SEEN_CAP) : [];
  } catch { return []; }
}

/** القائمة بعد إضافة مفتاح (بلا تكرار، والأقدم يسقط بعد الحدّ). */
export function withSealSeen(list: readonly string[], key: string): string[] {
  return [...list.filter(item => item !== key), key].slice(-SEEN_CAP);
}

/** هل يحين الاحتفال: لمن يحقّ له، بختمٍ قائم، لم يره من قبل، ولا مع الطباعة. */
export function sealMomentDue(input: { allowed: boolean; seal: ApprovalSeal | null | undefined; key: string; seen: readonly string[]; print?: boolean }): boolean {
  if (!input.allowed || !input.seal || input.print || !input.key) return false;
  return !input.seen.includes(input.key);
}

export type SealMomentMode = "none" | "full" | "still";
export function sealMomentMode(due: boolean, reducedMotion: boolean): SealMomentMode {
  if (!due) return "none";
  return reducedMotion ? "still" : "full";
}

/**
 * الرئيسية لا تكدّس لحظتين في تحميلٍ واحد: إن حان الختم وافتتاحية اليوم معاً
 * فاز الختم ذلك اليوم، وتُعدّ الافتتاحية مرئيةً اليوم فلا تعود بعده.
 */
export function homeMoment<O extends string>(input: { seal: SealMomentMode; opening: O | "none" }): { seal: SealMomentMode; opening: O | "none"; skipOpeningToday: boolean } {
  if (input.seal !== "none") return { seal: input.seal, opening: "none", skipOpeningToday: input.opening !== "none" };
  return { seal: "none", opening: input.opening, skipOpeningToday: false };
}

const store = (): Storage | null => { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } };

export function readSealSeen(): string[] {
  try { return parseSealSeen(store()?.getItem(SEEN_KEY)); } catch { return []; }
}
export function markSealSeen(key: string): void {
  try { const s = store(); if (s) s.setItem(SEEN_KEY, JSON.stringify(withSealSeen(parseSealSeen(s.getItem(SEEN_KEY)), key))); } catch { /* تصفّحٌ خاص */ }
}

/* ── رسم الختم: هندسةٌ حتمية تُكتب في SVG ─────────────────────────────────── */

const f1 = (value: number) => Math.round(value * 10) / 10;

/** حافة الختم المسنّنة: وردةٌ بأسنانٍ مستديرة حول دائرة. */
export function sealRosette(cx: number, cy: number, r: number, teeth = 36, depth = 0.055): string {
  const steps = teeth * 6;
  let d = "";
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const rr = r * (1 - depth / 2 + (depth / 2) * Math.cos(teeth * a));
    d += `${i ? "L" : "M"}${f1(cx + rr * Math.cos(a))} ${f1(cy + rr * Math.sin(a))}`;
  }
  return `${d}Z`;
}

/** قوسٌ يُكتب عليه نصٌّ قائماً: العلوي من اليسار فوق القلب إلى اليمين، والسفلي من اليسار تحته إلى اليمين. */
export function sealTextArc(cx: number, cy: number, r: number, side: "top" | "bottom"): string {
  return side === "top"
    ? `M${f1(cx - r)} ${f1(cy)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(cx + r)} ${f1(cy)}`
    : `M${f1(cx - r)} ${f1(cy)}A${f1(r)} ${f1(r)} 0 0 0 ${f1(cx + r)} ${f1(cy)}`;
}

/** موضع الختم على ملصق البصمة: الزاوية العليا اليسرى بين الرأس والحلقات، لا يغطّي حلقةً ولا رقماً. */
export const POSTER_SEAL = { cx: 150, cy: 358, r: 90, tilt: -9 } as const;
