/**
 * ── نوعُ إرسال بطاقة الأستاذ (E1) ────────────────────────────────────────────
 *
 * رابطُ الأستاذ يُرسل بإحدى ثلاث صفات، والصفةُ محفوظةٌ في طلبه نفسه:
 *   👁️ view — للعرض فقط: جدولُه وحالةُ طلباته، بلا أي أداة تعديل.
 *   ✏️ edit — طلب تعديل (الحالي، والافتراضي للروابط القديمة بلا حقل).
 *   🎓 ta   — مرحلة التدريب: البطاقة نفسها مقفلةً على الشعب الشاغرة.
 *
 * ── مصدرٌ واحد: `InstructorRequest.linkMode` ─────────────────────────────────
 * لا صفةَ على سجلّ الرابط (`ScheduleShareLink`)، ولا تُخمَّن من شيءٍ آخر. ويُقرأ الحقلُ
 * بـ`linkMode()` وحدها (غيابُه = «طلب تعديل»):
 *   - يكتبه النشر: ‎/api/instructor-requests/issue‎ (👁️/✏️ من «نشر ← كرت الأستاذ»، جماعياً
 *     أو فردياً) و‎/api/ta-phase/open‎ (🎓 بموجاته). لا يكتبه غيرُهما.
 *   - يحكم به الخادم على الكتابة: الإرسال و«لاصق بمحاضرتي» والحجز ونجمة الاهتمام.
 *     أمّا الردُّ على اقتراح القسم فمفتوحٌ في كل صفة: طلبٌ أُرسل يبقى حوارُه قائماً.
 *   - ترسم منه الصفحة (`data.mode`)، ويفلتر به الوارد: «لم يشاركوا» و«لم يفتحوا»
 *     و«🎓 تدريب» (src/utils/requestParticipation.ts).
 */
export type LinkMode = "view" | "edit" | "ta";

export const LINK_MODES: ReadonlyArray<{ id: LinkMode; icon: string; label: string; hint: string }> = [
  { id: "view", icon: "👁️", label: "للعرض فقط", hint: "جدوله وحالة طلباته · بلا تعديل" },
  { id: "edit", icon: "✏️", label: "طلب تعديل", hint: "يطلب تغيير موعد أو إضافة" },
  { id: "ta", icon: "🎓", label: "مرحلة التدريب", hint: "يختار من الشعب الشاغرة فقط" },
];

/** الحقلُ الغائب أو المجهول = طلب تعديل (سلوك الروابط القائمة كما هو). يُقرأ من الطلب وحده. */
export function linkMode(request: { linkMode?: unknown } | null | undefined): LinkMode {
  const mode = request?.linkMode;
  return mode === "view" || mode === "ta" ? mode : "edit";
}

export function parseLinkMode(value: unknown): LinkMode {
  return value === "view" || value === "ta" || value === "edit" ? value : "edit";
}

/**
 * صفةُ إصدار بطاقة الأستاذ: 👁️ أو ✏️ (الغائبُ = ✏️ كما كان كلُّ إصدارٍ قبلها).
 * و🎓 لا تُفتح من الإصدار — لها مسارُها بموجاته ومقرّراته المسموحة — فتُردّ (null).
 */
export function issueLinkMode(value: unknown): Exclude<LinkMode, "ta"> | null {
  if (value === "ta") return null;
  return value === "view" ? "view" : "edit";
}

/**
 * F3: بطاقةُ مرحلة التدريب القائمة تحكمها مرحلتُها (/api/ta-phase)، فلا يحوّلها نشرُ
 * بطاقة الأستاذ الجماعيُّ إلى تعديلٍ حرّ ولا إلى عرض، ولا يمدّ نافذتَها بموعد الأساتذة.
 * والاستثناءُ الفرديُّ قرارٌ صريحٌ لأستاذٍ بعينه، فيحكم.
 */
export const taPhaseOwns = (held: { linkMode?: unknown } | null | undefined, individual: boolean): boolean =>
  !individual && linkMode(held) === "ta";

/** هل يكتب صاحبُ الرابط طلبات تعديل حرّة (وقت/شعبة/قاعة جديدة)؟ */
export const modeAllowsFreeEdit = (mode: LinkMode) => mode === "edit";
/** هل يكتب شيئاً أصلاً؟ */
export const modeAllowsWrite = (mode: LinkMode) => mode !== "view";

export function linkModeLabel(mode: LinkMode): string {
  const row = LINK_MODES.find(entry => entry.id === mode)!;
  return `${row.icon} ${row.label}`;
}
