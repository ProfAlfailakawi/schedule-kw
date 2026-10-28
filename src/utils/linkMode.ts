/**
 * ── نوعُ إرسال بطاقة الأستاذ (E1) ────────────────────────────────────────────
 *
 * رابطُ الأستاذ يُرسل بإحدى ثلاث صفات، والصفةُ محفوظةٌ في طلبه نفسه
 * (`InstructorRequest.linkMode` — المصدرُ الواحد، يقرؤه «لم يشاركوا» و«تدريب» والكرت والخادم):
 *   👁️ view — للعرض فقط: جدولُه وحالةُ طلباته، بلا أي أداة تعديل.
 *   ✏️ edit — طلب تعديل (الحالي، والافتراضي للروابط القديمة بلا حقل).
 *   🎓 ta   — مرحلة التدريب: البطاقة نفسها مقفلةً على الشعب الشاغرة.
 *
 * مصدرٌ واحد: الخادم يحكم به على الكتابة، والواجهةُ ترسم منه، والوارد يفلتر به.
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

/** هل يكتب صاحبُ الرابط طلبات تعديل حرّة (وقت/شعبة/قاعة جديدة)؟ */
export const modeAllowsFreeEdit = (mode: LinkMode) => mode === "edit";
/** هل يكتب شيئاً أصلاً؟ */
export const modeAllowsWrite = (mode: LinkMode) => mode !== "view";

export function linkModeLabel(mode: LinkMode): string {
  const row = LINK_MODES.find(entry => entry.id === mode)!;
  return `${row.icon} ${row.label}`;
}
