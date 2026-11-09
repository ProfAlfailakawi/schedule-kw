/**
 * ── حدود أعداد الطلبة في الشعبة (قرار 1913/2016، م.8 و م.9) ──────────────────────────
 *
 * م.8 جدولٌ لكل طبيعة مقرر: الأدنى والأقصى لأعداد الطلبة في الشعبة.
 *
 *   نظري             ٢٠ — ٦٠
 *   تطبيقي           ١٥ — ٤٠
 *   عملي             ١٥ — ٢٥
 *   تدريب ميداني     ١٥ — ٦٠ في التخصصات النظرية، و١٥ — ٢٥ في التخصصات العلمية
 *
 * ما يُفحص هنا هو **سعة الشعبة** المسجّلة في المقرر (MaxStudent): السعةُ لكل شعبة لا للمقرر كلّه.
 * أما الحدُّ الأدنى في اللائحة فهو لعدد المسجّلين فعلاً في الشعبة، وهذا العددُ ليس في جدول
 * المواعيد؛ فلا تُقاس عليه هنا إلا السعة، ولا يُحكم بما لا يُعرف.
 *
 * م.9 تُخرج من الحدّين: المقرر أحادي الطرح اللازم للتخرج، وما فيه طلبة متوقع تخرجهم، وما تتطلب
 * طبيعتُه عدداً أقل، وما قلّ المقبولون في تخصصه، وتخصصٌ علميٌّ أُوقف القبول فيه. وهذه كلّها
 * وقائعُ لا يعرفها الجدول، فيسجّلها **مدير النظام استثناءً على المقرر لعائلة القسم**، بسببٍ من هذه
 * الأسباب، ولا يمرّ مقررٌ خارج الحدّين بغير ذلك.
 *
 * والقاعدةُ تحكم ما كان له طبيعةُ تدريسٍ مسجّلة وسعةٌ مدخلة؛ مقررٌ بلا طبيعة أو بلا سعة لا يُحكم عليه.
 */
export type CapacityMode = "theoretical" | "applied" | "practical" | "field_training";
export type CapacitySpecialization = "theoretical" | "scientific";

/** الحدّان من م.8: [الأدنى، الأقصى]. التدريب الميداني يتبع نوع التخصص. */
export const CAPACITY_LIMITS: Record<Exclude<CapacityMode, "field_training">, [number, number]> & {
  field_training: Record<CapacitySpecialization, [number, number]>;
} = {
  theoretical: [20, 60],
  applied: [15, 40],
  practical: [15, 25],
  field_training: { theoretical: [15, 60], scientific: [15, 25] },
};

/** أسباب الاستثناء بنصّ م.9 (أ — هـ). */
export const CAPACITY_EXCEPTION_REASONS = {
  "single-offering": "مقرر أحادي الطرح لازم لمتطلبات التخرج (م.9/أ)",
  graduating: "مقرر فيه طلبة متوقع تخرجهم (م.9/ب)",
  nature: "طبيعة المقرر وأهدافه تتطلب عدداً أقل من الطلبة (م.9/ج)",
  "low-admission": "قلّة المقبولين في التخصص عن الحدّ الأدنى (م.9/د)",
  "admission-stopped": "مقرر في تخصص علمي أُوقف القبول فيه (م.9/هـ)",
} as const;
export type CapacityExceptionReason = keyof typeof CAPACITY_EXCEPTION_REASONS;
export const isCapacityExceptionReason = (value: unknown): value is CapacityExceptionReason =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(CAPACITY_EXCEPTION_REASONS, value);

export interface CapacityException { reason: CapacityExceptionReason; note?: string; by?: string; at?: string }
/** وثيقةٌ واحدة للجامعة: لكل عائلة قسم نوعُ تخصصها واستثناءاتُ مقرراتها (برمز المقرر). */
export interface CapacityRules {
  families: Record<string, { specialization?: CapacitySpecialization; courses?: Record<string, CapacityException> }>;
}
export const CAPACITY_RULES_DOC = { collection: "regulationExceptions", id: "capacity" } as const;

const normalizeCourseKey = (code: unknown) => String(code ?? "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();
export const capacityCourseKey = normalizeCourseKey;

/** حدّا الطبيعة، أو null لما لا حدَّ له (غير مصنَّف). */
export function capacityRange(mode: unknown, specialization: CapacitySpecialization = "theoretical"): [number, number] | null {
  if (mode === "field_training") return CAPACITY_LIMITS.field_training[specialization];
  if (mode === "theoretical" || mode === "applied" || mode === "practical") return CAPACITY_LIMITS[mode];
  return null;
}

export const CAPACITY_MODE_NAME: Record<CapacityMode, string> = {
  theoretical: "نظري", applied: "تطبيقي", practical: "عملي", field_training: "تدريب ميداني",
};

/** ما تقوله القاعدةُ لسعةٍ واحدة، أو null إن كانت ضمن الحدّين أو لا يُحكم عليها. */
export function capacityLimitProblem(input: { mode: unknown; capacity: unknown; specialization?: CapacitySpecialization }): string | null {
  const range = capacityRange(input.mode, input.specialization);
  const capacity = Number(input.capacity);
  if (!range || !Number.isFinite(capacity) || capacity <= 0) return null;
  if (capacity > range[1]) return `سعة الشعبة ${capacity} تتجاوز الحدّ الأقصى ${range[1]} لمقررٍ ${CAPACITY_MODE_NAME[input.mode as CapacityMode]} (م.8).`;
  if (capacity < range[0]) return `سعة الشعبة ${capacity} دون الحدّ الأدنى ${range[0]} لمقررٍ ${CAPACITY_MODE_NAME[input.mode as CapacityMode]} (م.8).`;
  return null;
}

/** ما تعرفه القاعدةُ عن عائلةٍ واحدة: نوعُ تخصصها (النظري إن غاب) والمقرراتُ المستثناة. */
export function capacityContextFor(rules: CapacityRules | null | undefined, familyKey: string): { specialization: CapacitySpecialization; excused: ReadonlySet<string> } {
  const family = rules?.families?.[familyKey];
  return {
    specialization: family?.specialization === "scientific" ? "scientific" : "theoretical",
    excused: new Set(Object.keys(family?.courses || {}).map(normalizeCourseKey)),
  };
}
