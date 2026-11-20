/**
 * ── طلبُ التعديل للتسجيل: البنود، والشطب، والتحقق الذاتي ─────────────────────
 *
 * نتيجةُ «افحص جدول التسجيل» تُحفظ طلباً: بندٌ لكل شعبة، مفتاحُه الرقم المرجعي
 * (وإلا المقرر ورقم الشعبة)، في ثلاث فئات: عدّلوا، أضيفوا، احذفوا. يصل الطلبُ إلى
 * التسجيل داخل النظام، فيشطب موظّفُه كلَّ بندٍ نفّذه («نُفّذ») باسمه ووقته.
 *
 * والتحقق ذاتيّ: حين يرفع القسمُ ملفَّ التسجيل التالي ويفحصه، يُقابَل كلُّ بندٍ
 * مشطوب بالنتيجة الجديدة — فإن زال فرقُه صار «تأكّد»، وإن بقي عاد مفتوحاً
 * «شُطب ولم يظهر في الملف». دوالُّ نقيّة: لا كتابةَ ولا شبكة.
 *
 * لا رقمَ مدنيّاً ولا شيءَ من الجدول غير ما في البند.
 */
import type { FieldDelta, FindingGroup, FindingKind, RegistrarCheckResult, RegistrarCounts, RegistrarFinding, RequestAction } from "./registrarCheck";

export interface RequestActor { by: number; byName: string; at: string }

export interface RegistrarRequestItem {
  /** مفتاحٌ ثابت بين فحصين: الفعل + الرقم المرجعي (وإلا المقرر/الشعبة). */
  id: string;
  action: RequestAction;
  group: FindingGroup;
  kind: FindingKind;
  crn?: string;
  courseCode: string;
  courseName: string;
  section: string;
  pdfSection?: string;
  fields: FieldDelta[];
  reason?: string;
  /** شطبُ التسجيل: «نُفّذ» باسم من شطب ووقته. */
  done?: RequestActor;
  /** آخرُ شطبٍ لم يُثبته الملف (يبقى أثراً بعد إعادة الفتح). */
  lastDone?: RequestActor;
  /** confirmed: أثبته الملفُّ التالي. reopened: شُطب ولم يظهر في الملف. */
  state?: "confirmed" | "reopened";
  stateAt?: string;
}

export interface RegistrarRequestDoc {
  id: string;
  collegeId: number; sectionId: number; termId: number;
  /** جولةُ الاعتماد التي حُفظ فيها الطلب (لا قناةَ إرسالٍ جديدة: الطلب يتبع الجولة). */
  round: number;
  at: string; by: number; byName: string;
  fileName: string;
  counts: RegistrarCounts;
  /** إرسالُ الجدول الذي يُحتجّ به: جولتُه وتاريخُ توقيعه (ورقة «ملاحظات على ملف التسجيل»). */
  sent?: { round: number; at: string };
  /** ما يحتاج نظر القسم ولم يُدرج في الطلب. */
  reviewCount: number;
  items: RegistrarRequestItem[];
}

export const REGISTRAR_REQUEST_LIMIT = 400;

/** ما أرسلناه ولم يظهر في ملفهم (تقصيرُهم لا تعديلُنا بعد الإرسال): وحده يخرج لهم في «ملاحظات على ملف التسجيل». */
export const isTheirs = (item: Pick<RegistrarRequestItem, "group">) => item.group === "notApplied";

/** متابعةُ ملاحظاتهم: كم بقي منها مفتوحاً وكم تأكّد زوالُه في ملفٍّ لاحق. */
export function notesProgress(items: readonly RegistrarRequestItem[]): { total: number; confirmed: number; open: number } {
  const theirs = items.filter(isTheirs);
  const confirmed = theirs.filter(item => item.state === "confirmed").length;
  return { total: theirs.length, confirmed, open: theirs.length - confirmed };
}
export const REQUEST_ACTION_LABEL: Record<RequestAction, string> = { edit: "عدّلوا", add: "أضيفوا", delete: "احذفوا" };

const text = (value: unknown, max: number) => String(value ?? "").slice(0, max);

export function requestItemId(finding: Pick<RegistrarFinding, "crn" | "courseCode" | "section" | "pdfSection"> & { action: RequestAction }): string {
  const identity = finding.action === "add"
    ? `${finding.courseCode}/${finding.section}`
    : finding.crn ? `#${finding.crn}` : `${finding.courseCode}/${finding.action === "delete" ? finding.pdfSection || finding.section : finding.section}`;
  return `${finding.action}:${identity}`;
}

/** بنود الطلب من نتيجة فحص: بندٌ واحدٌ لكل شعبةٍ وفعل، وخاناتُ البطاقات المتعددة تُجمع فيه. */
export function buildRequestItems(result: Pick<RegistrarCheckResult, "findings">): RegistrarRequestItem[] {
  const items = new Map<string, RegistrarRequestItem>();
  for (const finding of result.findings) {
    if (!finding.action) continue;
    const id = requestItemId({ ...finding, action: finding.action });
    const fields = finding.fields.slice(0, 8).map(f => ({
      field: f.field, label: text(f.label, 20), ours: text(f.ours, 160), pdf: text(f.pdf, 160), ...(f.was ? { was: text(f.was, 160) } : {}),
    }));
    const found = items.get(id);
    if (found) {
      for (const f of fields) if (!found.fields.some(g => g.field === f.field)) found.fields.push(f);
      continue;
    }
    if (items.size >= REGISTRAR_REQUEST_LIMIT) break;
    items.set(id, {
      id, action: finding.action, group: finding.group, kind: finding.kind,
      ...(finding.crn ? { crn: text(finding.crn, 20) } : {}),
      courseCode: text(finding.courseCode, 20), courseName: text(finding.courseName, 120), section: text(finding.section, 12),
      ...(finding.pdfSection ? { pdfSection: text(finding.pdfSection, 12) } : {}),
      fields, ...(finding.reason ? { reason: text(finding.reason, 200) } : {}),
    });
  }
  const order: Record<RequestAction, number> = { edit: 0, add: 1, delete: 2 };
  return [...items.values()].sort((a, b) => order[a.action] - order[b.action]
    || a.courseCode.localeCompare(b.courseCode, "en", { numeric: true })
    || String(a.crn || a.section).localeCompare(String(b.crn || b.section), "en", { numeric: true }));
}

export interface RequestProgress { total: number; done: number; confirmed: number; reopened: number; open: number }
export function requestProgress(items: readonly RegistrarRequestItem[]): RequestProgress {
  const confirmed = items.filter(item => item.state === "confirmed").length;
  const done = items.filter(item => item.done || item.state === "confirmed").length;
  const reopened = items.filter(item => !item.done && item.state === "reopened").length;
  return { total: items.length, done, confirmed, reopened, open: items.length - done };
}

/** شطبُ بندٍ أو رفعُ شطبه. بندٌ غير موجود يُرجع null. */
export function tickRequestItem(items: readonly RegistrarRequestItem[], itemId: string, done: boolean, actor: RequestActor): RegistrarRequestItem[] | null {
  if (!items.some(item => item.id === itemId)) return null;
  return items.map(item => {
    if (item.id !== itemId) return item;
    const { done: _done, state: _state, stateAt: _stateAt, ...rest } = item;
    return done ? { ...rest, done: { by: actor.by, byName: text(actor.byName, 80), at: actor.at } } : rest;
  });
}

/**
 * التحقق الذاتي: كلُّ بندٍ لم يتأكّد بعد يُقابَل بنتيجة فحص ملفٍّ أحدث (الفحصُ للقسم وحده،
 * فلا ينتظر البندُ شطباً من أحد — قرار المالك 2026-11-20).
 *   - زال فرقُه (لا بندَ بمفتاحه، أو بقي بندُ تعديلٍ لكن بغير خاناته) ← «تأكّد».
 *   - بقي فرقُه: المفتوحُ يبقى مفتوحاً كما هو؛ والمشطوبُ (من طلباتٍ قديمة) يعود مفتوحاً
 *     «شُطب ولم يظهر في الملف»، ويبقى من شطبه أثراً.
 * ملفٌّ لم يُقرأ منه شيء لا يُثبت ولا ينفي: لا يتغيّر بند.
 */
export function verifyRequestItems(items: readonly RegistrarRequestItem[], result: Pick<RegistrarCheckResult, "findings" | "empty">, at: string): { items: RegistrarRequestItem[]; confirmed: number; reopened: number } {
  if (result.empty) return { items: [...items], confirmed: 0, reopened: 0 };
  const fresh = new Map(buildRequestItems(result).map(item => [item.id, item]));
  /* دليلٌ موجب لبندٍ لم يُشطب: شعبةٌ قُرئت وطابقت (تعديلٌ أو إضافة)، أو شعبةٌ لا يذكرها الملف إطلاقاً (حذف).
     غيابُ البند من «الفروق» وحده لا يكفي: حقلٌ لم يُقرأ يُسقط البندَ ولا يُثبت زوال فرقه. */
  const keysOf = (finding: Pick<RegistrarFinding, "crn" | "courseCode" | "section" | "pdfSection">) =>
    [finding.crn ? `#${finding.crn}` : "", `${finding.courseCode}/${finding.section}`, finding.pdfSection ? `${finding.courseCode}/${finding.pdfSection}` : ""].filter(Boolean);
  const matchedKeys = new Set<string>(), touchedKeys = new Set<string>();
  for (const finding of result.findings) for (const key of keysOf(finding)) { touchedKeys.add(key); if (finding.group === "matched") matchedKeys.add(key); }
  const itemKeys = (item: RegistrarRequestItem) => keysOf({ crn: item.crn, courseCode: item.courseCode, section: item.section, pdfSection: item.pdfSection });
  const positive = (item: RegistrarRequestItem) => item.action === "delete"
    ? itemKeys(item).every(key => !touchedKeys.has(key))
    : itemKeys(item).some(key => matchedKeys.has(key));
  let confirmed = 0, reopened = 0;
  const next = items.map(item => {
    if (item.state === "confirmed") return item;
    const still = fresh.get(item.id);
    if (!item.done) {
      if (positive(item)) { confirmed++; return { ...item, state: "confirmed" as const, stateAt: at }; }
      return item;
    }
    const reflected = !still || (item.action === "edit" && item.fields.length > 0 && !item.fields.some(f => still.fields.some(g => g.field === f.field)));
    if (reflected) { confirmed++; return { ...item, state: "confirmed" as const, stateAt: at }; }
    reopened++;
    const { done, ...rest } = item;
    return { ...rest, lastDone: done, state: "reopened" as const, stateAt: at };
  });
  return { items: next, confirmed, reopened };
}

/** ما يُعرض للتسجيل في الوارد: سطرٌ واحد لكل طلب. */
export function requestSummary(doc: RegistrarRequestDoc) {
  return { id: doc.id, collegeId: doc.collegeId, sectionId: doc.sectionId, round: doc.round, at: doc.at, fileName: doc.fileName, progress: requestProgress(doc.items) };
}
