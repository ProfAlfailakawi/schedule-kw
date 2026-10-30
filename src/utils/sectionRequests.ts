/**
 * ── «طلب شعبة»: الإرشاد ← لجنة الجدول ← التسجيل ─────────────────────────────
 *
 * الإرشادُ يجد مثلاً مئةَ طالبٍ يحتاجون شعبةً في «مقدمة…»، فيرسل طلباً واحداً: المقرر،
 * والحرم (الكلية)، والفترة المفضلة، والعدد وقائمة الطلبة. لجنةُ الجدول تفتح الشعبة
 * بأدوات الموعد القائمة وتربطها بالطلب، ثم يُعتمد الطلبةُ كلُّهم أو بعضُهم، فيصل الكشفُ
 * الإرشادَ «تم الاعتماد» والتسجيلَ ليسجّلهم ويعلّم من سُجّل.
 *
 * هذه الوحدة حسابٌ صرف يشترك فيه الخادمُ والواجهة: الحالةُ والخطُّ الزمني والانتقالات
 * ومن يفعل ماذا. لا تقرأ ولا تكتب؛ الخادمُ يمرّر الوثيقة ويحفظ الناتج ذرّياً
 * (Repository.updateFeatureDoc)، فلا يعتمد اثنان القائمةَ نفسها في اللحظة نفسها على نسختين.
 *
 * الاسمُ والرقمُ المدني لا يُحفظان مكشوفين: يُختمان كما تُختم هويةُ الطالب في طلبات «مساري»
 * (sealStudentIdentity)، ويُفتحان لمن يفتحهما كشفُ التسجيل اليوم وحده.
 */
import { AR, countOf } from "./arabicCount";

export type SectionRequestPeriod = "morning" | "evening" | "any";
export const SECTION_REQUEST_PERIODS: SectionRequestPeriod[] = ["morning", "evening", "any"];
export const PERIOD_LABEL: Record<SectionRequestPeriod, string> = { morning: "صباحية", evening: "مسائية", any: "أي فترة" };
export const PERIOD_ICON: Record<SectionRequestPeriod, string> = { morning: "☀️", evening: "🌙", any: "🕘" };

/** أقصى عدد طلبةٍ في الطلب الواحد، وأقصى عددٍ يُكتب. */
export const SECTION_REQUEST_MAX_STUDENTS = 400;
export const SECTION_REQUEST_MAX_COUNT = 1000;
export const SECTION_REQUEST_NOTE_MAX = 300;

export type SectionRequestSource = "masari" | "paste";

export interface SectionRequestStudent {
  /** معرّفٌ داخل الطلب («s1»…): به يُعتمد الطالب ويُسجَّل، فلا يتنقّل رقمُه المدني بين الشاشات. */
  id: string;
  source: SectionRequestSource;
  /** طلبُ «مساري» الذي جاء منه (باب الطالب D5)، إن جاء منه. */
  needId?: string;
  nameCipher?: string;
  civilCipher?: string;
  /** بصمةٌ لمنع تكرار الطالب في القائمة نفسها (لا تكشف أحداً). */
  key?: string;
  /** غيابُها: لم يُقرَّر بعد. */
  approved?: boolean;
  registered?: boolean;
  registeredAt?: string;
}

export interface SectionRequestLink {
  scheduleId: number;
  sectionCode: string;
  /** نصيبُها من عدد الطلب: العددُ مقسوماً على الشعب المربوطة كلها. */
  capacity?: number;
  /** ما كتبه الطلبُ نفسُه في رصيد مقاعد المرشد سعةً أساسية؛ غيابُه = سعةٌ كتبها المسؤول فلا تُمسّ. */
  appliedCapacity?: number;
  linkedAt: string;
  by: string;
}

export type SectionRequestEventKind = "sent" | "linked" | "unlinked" | "approved" | "registered" | "withdrawn" | "declined";

export interface SectionRequestEvent {
  kind: SectionRequestEventKind;
  at: string;
  /** الصفةُ والاسم كما في سجلّ التدقيق: «رئيس لجنة الجدول · د. منى». */
  by: string;
  detail?: string;
}

export interface SectionRequest {
  id: string;
  termId: number;
  /** الحرم: كلُّ حرمٍ في النظام كليةٌ قائمة بذاتها. */
  collegeId: number;
  /** قسمُ المقرر — لجنتُه تفتح الشعبة. */
  sectionId: number;
  /** قسمُ الإرشاد الذي أرسل الطلب. */
  fromSectionId: number;
  courseId: number;
  courseCode?: string;
  courseName?: string;
  period: SectionRequestPeriod;
  /** عددُ الطلبة المحتاجين (قد يزيد على القائمة المرفقة). */
  count: number;
  note?: string;
  students: SectionRequestStudent[];
  sections: SectionRequestLink[];
  /** طرفا الإغلاق: سحبه الإرشادُ، أو اعتذرت اللجنة. */
  closed?: "withdrawn" | "declined";
  closedNote?: string;
  approvedAt?: string;
  createdAt: string;
  createdBy: { userId: number; name: string; role: string };
  updatedAt: string;
  /** رقمُ الإصدار: يزيد مع كل انتقال، وتحمله كلُّ كتابة (src/utils/staleWrite.ts). */
  rev?: number;
  events: SectionRequestEvent[];
}

export type SectionRequestStage = "sent" | "opened" | "approved" | "registering" | "registered" | "withdrawn" | "declined";

export interface SectionRequestCounts {
  /** طلبةُ القائمة. */
  listed: number;
  approved: number;
  notApproved: number;
  undecided: number;
  registered: number;
}

export function countsOf(request: Pick<SectionRequest, "students">): SectionRequestCounts {
  const students = request.students || [];
  return {
    listed: students.length,
    approved: students.filter(row => row.approved === true).length,
    notApproved: students.filter(row => row.approved === false).length,
    undecided: students.filter(row => row.approved === undefined).length,
    registered: students.filter(row => row.approved === true && row.registered === true).length,
  };
}

/** أين وصل الطلب. مشتقٌّ دائماً من الوثيقة، لا حقلٌ يُكتب فيشيخ. */
export function stageOf(request: SectionRequest): SectionRequestStage {
  if (request.closed) return request.closed;
  const counts = countsOf(request);
  if (request.approvedAt) {
    if (counts.approved > 0 && counts.registered === counts.approved) return "registered";
    if (counts.registered > 0) return "registering";
    return "approved";
  }
  return (request.sections || []).length ? "opened" : "sent";
}

export const STAGE_LABEL: Record<SectionRequestStage, string> = {
  sent: "أُرسل", opened: "فُتحت الشعبة", approved: "تم الاعتماد", registering: "يُسجَّل", registered: "سُجّلوا", withdrawn: "سُحب", declined: "اعتذرت اللجنة",
};

export interface TimelineStep {
  key: "sent" | "opened" | "approved" | "registered";
  label: string;
  done: boolean;
  current: boolean;
  at?: string;
  detail?: string;
}

const lastAt = (request: SectionRequest, kind: SectionRequestEventKind) =>
  [...(request.events || [])].reverse().find(event => event.kind === kind)?.at;

/**
 * الخطُّ الزمني الواحد الذي يراه الجميع: أُرسل ← فُتحت الشعبة ← اعتُمد (ن من م) ← سُجّل (ن).
 * «اعتُمد» هو نفسه «أُحيل للتسجيل»: ما يُعتمد يصل التسجيلَ في اللحظة نفسها.
 */
export function timelineOf(request: SectionRequest): TimelineStep[] {
  const stage = stageOf(request);
  const counts = countsOf(request);
  const sections = request.sections || [];
  const opened = sections.length > 0;
  const approved = Boolean(request.approvedAt);
  const registeredAll = stage === "registered";
  const steps: TimelineStep[] = [
    { key: "sent", label: "أُرسل", done: true, current: stage === "sent", at: request.createdAt, detail: countOf(request.count, AR.student) },
    { key: "opened", label: "فُتحت الشعبة", done: opened, current: stage === "opened", at: opened ? sections[sections.length - 1].linkedAt : undefined,
      detail: opened ? sections.map(row => row.sectionCode).join("، ") : undefined },
    { key: "approved", label: "اعتُمد", done: approved, current: stage === "approved", at: request.approvedAt,
      detail: approved ? (counts.listed ? `${counts.approved} من ${counts.listed}` : countOf(request.count, AR.student)) : undefined },
    { key: "registered", label: "سُجّل", done: registeredAll, current: stage === "registering" || stage === "registered", at: counts.registered ? lastAt(request, "registered") : undefined,
      detail: counts.registered ? (registeredAll ? `الكل (${counts.registered})` : `${counts.registered} من ${counts.approved}`) : undefined },
  ];
  return steps;
}

/* ── من يفعل ماذا ─────────────────────────────────────────────────────────── */

export interface SectionRequestActorFacts {
  role: string;
  power: boolean;
  /** صفةُ العرض الصرف: يقرأ بلا أسماء ولا أزرار. */
  viewerOnly: boolean;
  advisor: boolean;
  registrar: boolean;
  /** يملك شاشة الجدول (٧) ولا يقيّده دورُ اطّلاع. */
  schedules: boolean;
  /** يملك باب كشف التسجيل نفسه: الورشة (٧) أو تقرير القسم (١٤). بدونه لا يقرأ شيئاً ولو كان القسمُ في نطاقه. */
  sheet: boolean;
  /** نطاقُه يشمل قسمَ المقرر في هذا الحرم. */
  courseScope: boolean;
  /** نطاقُه يشمل قسمَ الإرشاد الذي أرسل. */
  fromScope: boolean;
}

export interface SectionRequestPowers {
  read: boolean;
  /** يرسل ويسحب: الإرشاد. */
  advising: boolean;
  /** يفتح الشعبة ويربطها ويعتذر ويعتمد: لجنة الجدول. */
  committee: boolean;
  /** يعتمد ويسجّل: التسجيل. */
  registration: boolean;
}

/** أذوناتُ باب كشف التسجيل (`/api/student-registration`): الورشة أو تقرير القسم. */
export const SECTION_REQUEST_SHEET_PERMISSIONS = [7, 14];

export function powersFor(facts: SectionRequestActorFacts): SectionRequestPowers {
  if (facts.power) return { read: true, advising: true, committee: true, registration: true };
  /* النطاقُ وحده لا يكفي: الأسماءُ في الطلب هي أسماءُ كشف التسجيل، فتُقرأ ببابه. */
  if (!facts.sheet) return { read: false, advising: false, committee: false, registration: false };
  const advising = facts.advisor && facts.fromScope;
  const committee = !facts.viewerOnly && facts.schedules && facts.courseScope && !facts.advisor && !facts.registrar;
  const registration = !facts.viewerOnly && facts.registrar && facts.courseScope;
  /* المرشدُ يرى طلبات قسمه وحده: لا يقرأ كشوفَ مرشدي الأقسام الأخرى لأنها عن مقررٍ في قسمه. */
  const read = advising || committee || registration || (!facts.advisor && facts.courseScope);
  return { read, advising, committee, registration };
}

/* ── الانتقالات: وثيقةٌ جديدة أو رفضٌ بسببه ───────────────────────────────── */

export type Transition = { next: SectionRequest } | { refuse: { status: number; error: string; code?: string } };

const refuse = (status: number, error: string): Transition => ({ refuse: { status, error } });
const withEvent = (request: SectionRequest, event: SectionRequestEvent, patch: Partial<SectionRequest>): SectionRequest => ({
  ...request, ...patch, updatedAt: event.at, events: [...(request.events || []), event].slice(-80),
});
const closedRefusal = (request: SectionRequest): Transition | null =>
  request.closed === "withdrawn" ? refuse(409, "سُحب هذا الطلب.") : request.closed === "declined" ? refuse(409, "اعتذرت اللجنة عن هذا الطلب.") : null;

export function linkSections(request: SectionRequest, links: Array<{ scheduleId: number; sectionCode: string; capacity?: number }>, by: string, at: string): Transition {
  const closed = closedRefusal(request); if (closed) return closed;
  if (request.approvedAt) return refuse(409, "اعتُمد الطلب؛ لا تُضاف إليه شعبةٌ بعد الاعتماد.");
  const have = new Set((request.sections || []).map(row => String(row.sectionCode)));
  const fresh = links.filter(link => Number(link.scheduleId) > 0 && String(link.sectionCode || "").trim() && !have.has(String(link.sectionCode)));
  if (!fresh.length) return refuse(409, "الشعبة مربوطةٌ بالطلب من قبل.");
  const sections = [...(request.sections || []), ...fresh.map(link => ({
    scheduleId: Number(link.scheduleId), sectionCode: String(link.sectionCode),
    ...(Number(link.capacity) > 0 ? { capacity: Math.trunc(Number(link.capacity)) } : {}), linkedAt: at, by,
  }))];
  return { next: withEvent(request, { kind: "linked", at, by, detail: fresh.map(link => link.sectionCode).join("، ") }, { sections }) };
}

export function unlinkSection(request: SectionRequest, sectionCode: string, by: string, at: string): Transition {
  const closed = closedRefusal(request); if (closed) return closed;
  if (request.approvedAt) return refuse(409, "اعتُمد الطلب؛ لا تُفكّ شعبتُه بعد الاعتماد.");
  const sections = (request.sections || []).filter(row => String(row.sectionCode) !== String(sectionCode));
  if (sections.length === (request.sections || []).length) return refuse(404, "هذه الشعبة ليست مربوطةً بالطلب.");
  return { next: withEvent(request, { kind: "unlinked", at, by, detail: String(sectionCode) }, { sections }) };
}

/**
 * الاعتماد: من في `approvedIds` معتمَد، ومن سواه «لم يُعتمد». يُعاد ما دام أحدٌ لم يُسجَّل
 * بعد؛ وبعد التسجيل لا يُنزع اعتمادُ من سُجّل.
 */
export function approveStudents(request: SectionRequest, approvedIds: string[], by: string, at: string): Transition {
  const closed = closedRefusal(request); if (closed) return closed;
  if (!(request.sections || []).length) return refuse(409, "اربط شعبةً بالطلب أولاً، ثم اعتمد الطلبة.");
  /* طلبٌ بعددٍ بلا قائمة: يُعتمد العددُ كلُّه، ولا يُسجَّل فيه أحدٌ بعينه. */
  if (!(request.students || []).length) {
    return { next: withEvent(request, { kind: "approved", at, by, detail: countOf(request.count, AR.student) }, { approvedAt: at }) };
  }
  const known = new Set((request.students || []).map(row => row.id));
  const wanted = new Set(approvedIds.map(String).filter(id => known.has(id)));
  if (!wanted.size) return refuse(400, "اختر طالباً واحداً على الأقل للاعتماد.");
  const lost = (request.students || []).find(row => row.registered && !wanted.has(row.id));
  if (lost) return refuse(409, "لا يُنزع اعتمادُ طالبٍ سُجّل. ألغِ تسجيله أولاً.");
  const students = (request.students || []).map(row => ({ ...row, approved: wanted.has(row.id) }));
  const detail = `${wanted.size} من ${students.length}`;
  return { next: withEvent(request, { kind: "approved", at, by, detail }, { students, approvedAt: at }) };
}

export function markRegistered(request: SectionRequest, ids: string[], registered: boolean, by: string, at: string): Transition {
  const closed = closedRefusal(request); if (closed) return closed;
  if (!request.approvedAt) return refuse(409, "لم يُعتمد الطلب بعد؛ التسجيلُ بعد الاعتماد.");
  const wanted = new Set(ids.map(String));
  const targets = (request.students || []).filter(row => wanted.has(row.id));
  if (!targets.length) return refuse(400, "اختر من تسجّله.");
  if (targets.some(row => row.approved !== true)) return refuse(409, "لا يُسجَّل إلا من اعتُمد.");
  const changed = targets.filter(row => Boolean(row.registered) !== registered);
  if (!changed.length) return refuse(409, registered ? "سُجّلوا من قبل." : "لم يُسجَّلوا بعد.");
  const students = (request.students || []).map(row => wanted.has(row.id)
    ? (registered ? { ...row, registered: true, registeredAt: at } : { ...row, registered: false, registeredAt: undefined })
    : row);
  return { next: withEvent(request, { kind: "registered", at, by, detail: registered ? `+${changed.length}` : `−${changed.length}` }, { students }) };
}

export function withdrawRequest(request: SectionRequest, by: string, at: string): Transition {
  const closed = closedRefusal(request); if (closed) return closed;
  if (request.approvedAt) return refuse(409, "اعتُمد الطلب؛ لا يُسحب بعد الاعتماد.");
  return { next: withEvent(request, { kind: "withdrawn", at, by }, { closed: "withdrawn" }) };
}

export function declineRequest(request: SectionRequest, note: string, by: string, at: string): Transition {
  const closed = closedRefusal(request); if (closed) return closed;
  if (request.approvedAt) return refuse(409, "اعتُمد الطلب؛ لا اعتذارَ بعد الاعتماد.");
  const text = String(note || "").replace(/\s+/g, " ").trim().slice(0, SECTION_REQUEST_NOTE_MAX);
  if (!text) return refuse(400, "اكتب سطراً بسبب الاعتذار؛ يصل الإرشاد.");
  return { next: withEvent(request, { kind: "declined", at, by, detail: text }, { closed: "declined", closedNote: text }) };
}

/* ── «الصق القائمة» ─────────────────────────────────────────────────────── */

const toLatinDigits = (text: string) => String(text || "")
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0));

/**
 * سطرٌ لكل طالب: الاسم، أو الرقم المدني، أو كلاهما بأي ترتيب وبأي فاصل (جدولٌ منسوخ من
 * Excel يصل بالفواصل والتبويب). الرقمُ المدني اثنا عشر رقماً؛ ما سواه من الأرقام يُهمل.
 */
export function parsePastedStudents(text: string): Array<{ name: string; civil: string }> {
  const out: Array<{ name: string; civil: string }> = [];
  const seen = new Set<string>();
  for (const raw of toLatinDigits(text).split(/\r?\n/)) {
    const line = raw.replace(/[\t,;|،؛]+/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const civil = (line.match(/(?<!\d)\d{12}(?!\d)/) || [""])[0];
    const name = line.replace(/\d+/g, " ").replace(/[^\p{L}\s'.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!civil && name.length < 3) continue;
    const key = civil || name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, civil });
    if (out.length >= SECTION_REQUEST_MAX_STUDENTS) break;
  }
  return out;
}

/**
 * توزيعُ عدد الطلب على شعبه المربوطة كلها، كلما رُبطت شعبةٌ أو فُكّت — فلا يتعلّق الناتجُ بترتيب الضغط
 * (١٠٠ ثم ٥٠ بدل ٥٠/٥٠). ويُفرَّق بين ما كتبه الطلبُ في رصيد مقاعد المرشد (يُعاد توزيعه) وما كتبه المسؤول
 * (يبقى كما هو): سعةٌ مكتوبةٌ تساوي ما كتبه الطلبُ آخرَ مرة هي سعتُه، وما سواها قرارُ المسؤول.
 *
 * `current`: السعاتُ الأساسية المكتوبة الآن بمفتاح الشعبة. `removed`: شعبٌ فُكّت للتوّ.
 * الناتج: الشعبُ بنصيبها وما كُتب منها، و`writes` (رقمٌ يُكتب، أو null يُمحى ما كتبه الطلب).
 */
export function planCapacities(
  sections: SectionRequestLink[], count: number, current: Record<string, number>, keyOf: (sectionCode: string) => string,
  removed: SectionRequestLink[] = [], max = 200,
): { sections: SectionRequestLink[]; writes: Record<string, number | null> } {
  const writes: Record<string, number | null> = {};
  for (const gone of removed) {
    const key = keyOf(gone.sectionCode);
    if (gone.appliedCapacity !== undefined && Number(current[key]) === gone.appliedCapacity) writes[key] = null;
  }
  const share = capacityShare(count, sections.length);
  const next = sections.map(section => {
    const key = keyOf(section.sectionCode);
    const existing = Number(current[key]) || 0;
    const ours = section.appliedCapacity !== undefined && existing === section.appliedCapacity;
    if (!existing || ours) {
      /* الرصيدُ يقبل حتى ٢٠٠ للشعبة (normalizeQuotaConfig)؛ ما يُكتب هو ما يُقرأ غداً. */
      const written = Math.min(share, max);
      writes[key] = written;
      return { ...section, capacity: share, appliedCapacity: written };
    }
    const { appliedCapacity: _drop, ...rest } = section;
    return { ...rest, capacity: share };
  });
  return { sections: next, writes };
}

/** فترةُ موعدٍ من بدايته: قبل الثانية ظهراً صباحية، وما بعدها مسائية. */
export function periodOfStart(start: string): Exclude<SectionRequestPeriod, "any"> {
  const [h, m] = String(start || "0:0").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0) < 14 * 60 ? "morning" : "evening";
}

/** هل يوافق الموعدُ الفترةَ المفضلة؟ «أي فترة» توافق كلَّ موعد. */
export function matchesPeriod(period: SectionRequestPeriod, start: string): boolean {
  return period === "any" || periodOfStart(start) === period;
}

/** السعةُ المقترحة لكل شعبة: العدد مقسوماً على الشعب المربوطة، مقرّباً إلى الأعلى. */
export function capacityShare(count: number, sections: number): number {
  const n = Math.max(1, Math.trunc(sections) || 1);
  return Math.max(1, Math.ceil(Math.max(0, Number(count) || 0) / n));
}

/**
 * ما يكتبه التسجيلُ من قائمة الاختيار: من صار مسجَّلاً، ومن نُزع تسجيلُه. اختيارٌ فارغ بعد «سُجّلوا كلهم»
 * خطأً ينزع التسجيل عن الجميع — هو التصحيح، لا اختيارٌ ناقص.
 */
export function registrationChanges(registeredIds: string[], pickedIds: string[]): { add: string[]; drop: string[] } {
  const before = new Set(registeredIds.map(String)), picked = new Set(pickedIds.map(String));
  return { add: [...picked].filter(id => !before.has(id)), drop: [...before].filter(id => !picked.has(id)) };
}
