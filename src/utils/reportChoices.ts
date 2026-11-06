/**
 * ── خيارات التقريرين المركّبين في مركز الاستعلامات ───────────────────────────
 *
 * «التقرير الشامل» و«تقرير تغييرات الجدول» هما وحدهما اللذان تحت كلٍّ منهما
 * أكثر من ورقة. كانت الأوراق موزّعةً بين زرّ وأيقونة وقائمة، فصارت قائمةً واحدة:
 * سطرٌ لكل ورقة، واختيارٌ واحد ظاهر، وزرّ طباعة واحد.
 *
 * هذا الملف يقرّر أيّ الأوراق تُعرض فقط؛ ولا يمسّ الورقة نفسها.
 * tests/report-choices-audit.ts يحرس أن ورقةً لا تضيع.
 */

export type ComprehensiveChoiceId = "site" | "site-appendix" | "branches";
export type AuthorityChoiceId = "site" | "branches" | "site-civil" | "branches-civil";

export interface ReportChoice<Id extends string = string> {
  id: Id;
  /** سطرٌ واحد في القائمة. */
  label: string;
  /** ما تحمله هذه الورقة: يظهر تحت القائمة للخيار النشط وحده. */
  note: string;
}

interface ChoiceContext {
  collegeName: string;
  /** أسماء مواقع الفرع؛ فارغةٌ أو واحدٌ لقسمٍ في موقعٍ واحد. */
  branchLabels: readonly string[];
}

const siteNote = (collegeName: string) => collegeName || "—";

export function comprehensiveChoices({ collegeName, branchLabels }: ChoiceContext): ReportChoice<ComprehensiveChoiceId>[] {
  const choices: ReportChoice<ComprehensiveChoiceId>[] = [
    { id: "site", label: "هذا الموقع", note: siteNote(collegeName) },
    { id: "site-appendix", label: "مع ملحق التغييرات", note: "وثيقة واحدة تُحفظ في الملف" },
  ];
  if (branchLabels.length > 1) choices.push({ id: "branches", label: "كل الفروع", note: branchLabels.join(" · ") });
  return choices;
}

export function authorityChoices({ collegeName, branchLabels }: ChoiceContext): ReportChoice<AuthorityChoiceId>[] {
  const branches = branchLabels.length > 1;
  const sites = branchLabels.join(" · ");
  const choices: ReportChoice<AuthorityChoiceId>[] = [{ id: "site", label: "هذا الموقع", note: siteNote(collegeName) }];
  if (branches) choices.push({ id: "branches", label: "كل الفروع", note: sites });
  choices.push({ id: "site-civil", label: "هذا الموقع مع الرقم المدني", note: `${siteNote(collegeName)} · الرقم المدني بعد اسم المدرس` });
  if (branches) choices.push({ id: "branches-civil", label: "كل الفروع مع الرقم المدني", note: `${sites} · الرقم المدني بعد اسم المدرس` });
  return choices;
}

/** الخيار المحفوظ إن بقي متاحاً، وإلا الأول: تغيّر القسم قد يُسقط «كل الفروع». */
export function activeChoice<Id extends string>(choices: readonly ReportChoice<Id>[], savedId: Id | null): ReportChoice<Id> {
  return choices.find(choice => choice.id === savedId) || choices[0];
}
