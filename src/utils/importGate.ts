/**
 * ── حالة الاستيراد واحدة، ولا تقول «جاهز» قبل الأوان ──
 *
 * كانت كلُّ قطعةٍ في الشاشة تحكم وحدها: علامةُ الصفحة وبطاقةُ «جاهز للنشر» تقرآن ما وصل
 * حتى الآن، وفحصُ بقية الأقسام يصل بعدهما، فتنقلب العلامةُ الخضراء أحمر أمام المراجع.
 * فالحالةُ هنا تُحسب في موضعٍ واحد، بترتيبٍ واحد: ما دام فحصٌ جارياً فهي «يفحص»، وبعده
 * فقط تُعلن النتيجة. لا تعدّ الملاحظات أثناء الفحص حتى لا يتغيّر الرقم مرتين.
 */
export type ImportGateState =
  | { kind: "checking"; step: string }
  | { kind: "blocked"; count: number; first: string }
  | { kind: "baseline-failed" }
  | { kind: "unverified" }
  | { kind: "ready" };

export type ImportGateInput = {
  /** قراءة الملف أو القراءة الأدق جارية: نصّها كما يكتبه القارئ. */
  readingStep?: string;
  /** المقارنة بجدول الفصل مطلوبة ولم يصل الجدول بعد. */
  baselinePending?: boolean;
  baselineFailed?: boolean;
  preflight: "idle" | "pending" | "done" | "failed";
  issues: string[];
  /** بلا صفوف ولا أساس: لا شيء يُنشر، وليس هذا خطأً يُجاب عنه. */
  hasContent: boolean;
};

export const IMPORT_CHECK_STEP = "التعارض مع الأقسام الأخرى";
export const IMPORT_BASELINE_STEP = "جدول الفصل الحالي";

export function importGateState(input: ImportGateInput): ImportGateState {
  if (input.readingStep) return { kind: "checking", step: input.readingStep };
  if (input.baselinePending) return { kind: "checking", step: IMPORT_BASELINE_STEP };
  if (input.preflight === "pending") return { kind: "checking", step: IMPORT_CHECK_STEP };
  if (input.baselineFailed) return { kind: "baseline-failed" };
  if (input.issues.length) return { kind: "blocked", count: input.issues.length, first: input.issues[0] };
  if (!input.hasContent) return { kind: "blocked", count: 0, first: "الجدول فارغ." };
  return input.preflight === "failed" ? { kind: "unverified" } : { kind: "ready" };
}

/** ما دامت النتيجة لم تُعلن، لا تُرسم علامة نجاح في أي موضع. */
export const importGateSettled = (state: ImportGateState) => state.kind !== "checking" && state.kind !== "unverified";

/** توقيعُ ما يقرؤه فحص البوابة من كل صف، ودليلُه الذي يحكم به الحفظ: تغيّرٌ آخر لا يعيد الفحص. */
export const importRowsSignature = (rows: any[]) => JSON.stringify(rows.map(row => [
  row.AdCourseId, row.SCode, row.AdInstructorId, row.roomId || row.AdRoomHall, row.buildingId || row.AdRoomCode,
  row.fstarttime, row.fendtime, row.fsunday, row.fmonday, row.ftuesday, row.fwednesday, row.fthursday,
  /* وما يقرؤه الحفظ من الدليل: «تثبيت» يغيّر مصدر الأستاذ لا رقمه، فيزول الرفض ولا بد من إعادة الفحص. */
  row.importEvidence?.instructor?.source, row.importEvidence?.instructor?.method, Boolean(row.importEvidence?.section),
  row.sourceSectionText, row.locationStatus, row.companionRoomId,
]));
