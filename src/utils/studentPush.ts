/**
 * ── تذكيرٌ يصل وحده: متى يُرسَل لطالب «مساري» وما نصُّه ─────────────────────────
 *
 * ثلاثُ رسائل لا غير، وكلٌّ منها مرةً واحدة لكل طالبٍ في كل فصل (علامةُ «أُرسل» على ملفّه):
 *
 *   wishes-close    «الرغبات تُغلق اليوم»  ← آخرُ يومٍ للرغبات، صباحاً بتوقيت الكويت.
 *   round-tomorrow  «يبدأ تسجيلك غداً»     ← دورُه في «جدولي المقترح» يبدأ غداً (إن عُرف تاريخُه).
 *   plan-ready      «جدولك المقترح جاهز»   ← ظهر له جدولٌ مقترح في الفصل.
 *
 * لا اسمَ ولا رقمَ في أيٍّ منها: الجهازُ يعرف صاحبه. والقرارُ هنا دالةٌ نقيّة تُختبر بساعةٍ ثابتة؛ الإرسالُ
 * والعلاماتُ الذرّية في src/server/studentExtras.ts.
 */

export type StudentPushKind = "wishes-close" | "round-tomorrow" | "plan-ready";
export const STUDENT_PUSH_KINDS: readonly StudentPushKind[] = ["wishes-close", "round-tomorrow", "plan-ready"];

/** ساعاتُ الإرسال بتوقيت الكويت: لا يوقظ التذكيرُ أحداً ليلاً. */
export const PUSH_FROM_HOUR = 8;
export const PUSH_TO_HOUR = 21;
/** «صباحاً»: تذكيرُ إغلاق الرغبات لا يُرسل بعد الظهر (يصير خبراً قديماً). */
export const WISHES_MORNING_UNTIL = 12;

export interface StudentPushMessageText { title: string; body: string; url: string; tag: string }

export function studentPushMessage(kind: StudentPushKind): StudentPushMessageText {
  switch (kind) {
    case "wishes-close": return { title: "الرغبات تُغلق اليوم", body: "راجع رغباتك قبل نهاية اليوم.", url: "/me", tag: "masari-wishes-close" };
    case "round-tomorrow": return { title: "يبدأ تسجيلك غداً", body: "راجع جدولك المقترح الليلة.", url: "/me", tag: "masari-round-tomorrow" };
    case "plan-ready": return { title: "جدولك المقترح جاهز", body: "افتح مساري وراجع أسبوعك.", url: "/me", tag: "masari-plan-ready" };
  }
}

export function pushTestMessage(): StudentPushMessageText {
  return { title: "هكذا يصلك التذكير", body: "التنبيهات تعمل على هذا الجهاز.", url: "/me", tag: "masari-test" };
}

/** علامةُ «أُرسل»: نوعٌ واحد لفصلٍ واحد. */
export const pushMarkerKey = (termId: number, kind: StudentPushKind): string => `${Number(termId) || 0}:${kind}`;

export interface StudentPushFacts {
  /** الساعة بتوقيت الكويت (0…23). */
  hour: number;
  /** اليوم بتوقيت الكويت YYYY-MM-DD. */
  today: string;
  termId: number;
  /** مرحلةُ الباب اليوم (readStudentPhase): `wishes` وغيرها. */
  mode: string;
  /** آخرُ يومٍ للمرحلة الجارية (phase.until). */
  until: string;
  /** هل ظهر له جدولٌ مقترحٌ فيه مقرر؟ */
  planReady: boolean;
  /** يومُ بدء دوره في التسجيل، إن عُرف (YYYY-MM-DD). */
  roundStart: string;
  /** ما أُرسل له: مفتاحُ pushMarkerKey ← وقتُ الإرسال. */
  sent: Record<string, string> | undefined;
}

const addDay = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * أيُّ رسالةٍ تستحق الآن؟ واحدةٌ على الأكثر في كل مرور (الباقي في المرور التالي): لا يتلقّى الطالبُ ثلاثاً معاً.
 * الأولويةُ لما يفوت: إغلاقُ الرغبات، ثم بدءُ التسجيل غداً، ثم جاهزيةُ الجدول.
 */
export function studentPushDue(facts: StudentPushFacts): StudentPushKind | null {
  if (!(facts.hour >= PUSH_FROM_HOUR && facts.hour < PUSH_TO_HOUR) || !facts.termId) return null;
  const sent = facts.sent || {};
  const fresh = (kind: StudentPushKind) => !sent[pushMarkerKey(facts.termId, kind)];
  if (facts.mode === "wishes" && facts.until && facts.until === facts.today && facts.hour < WISHES_MORNING_UNTIL && fresh("wishes-close")) return "wishes-close";
  if (facts.roundStart && facts.roundStart === addDay(facts.today, 1) && fresh("round-tomorrow")) return "round-tomorrow";
  if (facts.planReady && fresh("plan-ready")) return "plan-ready";
  return null;
}
