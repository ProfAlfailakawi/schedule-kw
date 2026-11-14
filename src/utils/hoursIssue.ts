/**
 * ── رسائل ساعات الشعبة: كاتبٌ واحد وقارئٌ واحد ─────────────────────────────────────
 *
 * الخادم يقول المانع جملةً عربية، والنموذج يقرأ منها الأرقام ليرسم «3/2 س» ويعرض «شعبة جديدة N».
 * كانت الجملة تُكتب في مكانين وتُقرأ بتعابير منسوخة في ثلاثة، وتعبيرُ «زائدة» يفترض «3 ساعات»
 * فيعمى عن «ساعتان» و«ساعة واحدة» و«12 ساعة» (العدد والمعدود) — فيختفي الرقم والزر بلا كلمة.
 * هنا تُبنى الجملة وتُقرأ، والاختبار (tests/hours-issue-audit.ts) يمرّ بكل عدد.
 */
import { AR, countOf } from "./arabicCount";

/** «ساعات هذا المقرر المعتمدة 3 ساعات أسبوعيًا، والمجموع بعد هذا الموعد يزيدها (4 ساعات تقريبًا).» */
export function overHoursMessage(hours: number, totalMinutes: number): string {
  return `ساعات هذا المقرر المعتمدة ${countOf(hours, AR.hour)} أسبوعيًا، والمجموع بعد هذا الموعد يزيدها (${countOf(Math.round(totalMinutes / 50), AR.hour)} تقريبًا). لا يُحفظ ما يزيد على الساعات المعتمدة`;
}

/** ذيلُ المانع حين يكون السببُ رقمَ الشعبة لا الموعد. */
export const freshSectionTail = (code: string) => ` — لشعبة جديدة: ${code}`;

/** العددُ من عبارة «ساعة واحدة / ساعتان / 3 ساعات / 12 ساعة». */
export function hourCountValue(phrase: string): number | null {
  const text = String(phrase || "").trim();
  const digits = /(\d+(?:\.\d+)?)/.exec(text);
  if (digits) return Number(digits[1]);
  if (/ساعتان|ساعتين/.test(text)) return 2;
  if (/ساعة واحدة|^ساعة$/.test(text)) return 1;
  return null;
}

export type HoursIssue =
  | { kind: "over"; hours: number; total: number }
  | { kind: "under"; got: number; need: number };

export function parseHoursIssue(text: string): HoursIssue | null {
  const value = String(text || "");
  const over = /ساعات هذا المقرر المعتمدة (.+?) أسبوعيًا، والمجموع بعد هذا الموعد يزيدها \((.+?) تقريبًا\)/.exec(value);
  if (over) {
    const hours = hourCountValue(over[1]), total = hourCountValue(over[2]);
    if (hours != null && total != null) return { kind: "over", hours, total };
  }
  const under = /ساعات الشعبة .+ أقل من ساعات المقرر · (\d+)\/(\d+) د/.exec(value);
  return under ? { kind: "under", got: Number(under[1]), need: Number(under[2]) } : null;
}

/** «لشعبة جديدة: 502» ← "502". */
export const freshSectionOf = (text: string) => /لشعبة جديدة: (\d+)/.exec(String(text || ""))?.[1] || "";
