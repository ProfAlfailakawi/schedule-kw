/**
 * ── أعدادُ مرشّحات الوارد تتبع ما يُعرض ─────────────────────────────────────
 *
 * كان عددُ «بانتظار قرارك» يُحسب من الوارد كلِّه ولا يرى البحثَ ولا الأستاذَ ولا القسمَ ولا «🎓 تدريب»:
 * فيقول «12» فوق بطاقتين. فالعددُ هنا يُحسب من البنود التي اجتازت المرشّحاتِ الأخرى كلَّها، وكلُّ مجموعةٍ
 * تعدّ نفسها دون مرشّحها هي (عددُ «إضافة» يُقرأ ومرشّحُ «النوع» على «تعديل» — كي يُعرف ما يُنتقل إليه).
 * والبحثُ بالاسم بمفتاح المطابقة العربي (الهمزات والتاء المربوطة والياء والتشكيل).
 */
import { arabicMatchKey } from "./arabicText";

export type InboxStateFilter = "pending" | "fixed" | "rejected" | "all";
export type InboxActionFilter = "all" | "change" | "add" | "delete";
export type InboxVerdictFilter = "all" | "clear" | "exception" | "conflict";

export interface FacetItem { state?: string; action: string; verdict?: string }
export interface FacetFilters { state: InboxStateFilter | string; action: InboxActionFilter | string; verdict: InboxVerdictFilter | string }

const stateOk = (item: FacetItem, state: string) =>
  state === "pending" ? !item.state : state === "fixed" ? item.state === "fixed" : state === "rejected" ? item.state === "rejected" : true;
const actionOk = (item: FacetItem, action: string) => action === "all" || item.action === action;
const verdictOk = (item: FacetItem, verdict: string) => verdict === "all" || (item.verdict || "clear") === verdict;

export function inboxFacetCounts(items: readonly FacetItem[], filters: FacetFilters) {
  const forState = items.filter(item => actionOk(item, filters.action) && verdictOk(item, filters.verdict));
  const forAction = items.filter(item => stateOk(item, filters.state) && verdictOk(item, filters.verdict));
  const forVerdict = items.filter(item => stateOk(item, filters.state) && actionOk(item, filters.action));
  return {
    pending: forState.filter(item => !item.state).length,
    fixed: forState.filter(item => item.state === "fixed").length,
    rejected: forState.filter(item => item.state === "rejected").length,
    all: forState.length,
    change: forAction.filter(item => item.action === "change").length,
    add: forAction.filter(item => item.action === "add").length,
    delete: forAction.filter(item => item.action === "delete").length,
    clear: forVerdict.filter(item => (item.verdict || "clear") === "clear").length,
    exception: forVerdict.filter(item => item.verdict === "exception").length,
    conflict: forVerdict.filter(item => item.verdict === "conflict").length,
  };
}

/** بحثُ الاسم: «احمد» تجد «أحمد»، و«فاطمه» تجد «فاطمة». */
export function nameMatches(name: string, needle: string): boolean {
  const key = arabicMatchKey(needle);
  return !key || arabicMatchKey(name).includes(key);
}

export type InboxSort = "name" | "oldest";

/** ترتيبُ البطاقات: أبجدياً (كما كان)، أو الأقدمُ إرسالاً أولاً — من ينتظر أطول يُرى أولاً. */
export function sortInboxRows<T extends { instructorName: string; submittedAt?: string }>(rows: readonly T[], sort: InboxSort, byName: (a: string, b: string) => number): T[] {
  const list = [...rows];
  if (sort === "oldest") {
    return list.sort((a, b) => {
      const at = Date.parse(String(a.submittedAt || "")), bt = Date.parse(String(b.submittedAt || ""));
      const av = Number.isFinite(at) ? at : Number.POSITIVE_INFINITY, bv = Number.isFinite(bt) ? bt : Number.POSITIVE_INFINITY;
      return av - bv || byName(a.instructorName, b.instructorName);
    });
  }
  return list.sort((a, b) => byName(a.instructorName, b.instructorName));
}
