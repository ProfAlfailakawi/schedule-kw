import React, { useEffect, useMemo, useState } from "react";
import { hidesCollege, hidesSection, scopeShape } from "../utils/scopeShape";
import { resolveScopeSelection, singleDepartmentOf, type ScopeAssignmentLike } from "../utils/scopeContext";
import { BookOpen, Building2, DoorOpen, GraduationCap, Trash2, Users } from "lucide-react";
import { sortByName, byArabic } from "../utils/sorting";
import CurriculumPlans from "./CurriculumPlans";
import CourseTags from "./CourseTags";
import { AR, countOf } from "../utils/arabicCount";
import CourseRoomTypeBadge from "./CourseRoomTypeBadge";
import { departmentFamilyKey, sectionLabels } from "../utils/sectionLabel";
import { decimalText, numericText } from "../utils/digits";
import type { AdSection } from "../types";
import type { CurriculumPlan } from "../types";
import { sheetTagOf } from "../utils/sheetTag";
import { byCourseNumber } from "../utils/sheetMembership";
import { authorityCourseCode, authorityDepartmentKeys } from "../utils/authorityAcademicCodes";
import {
  AddButton,
  EmbeddedAction,
  EmptyState,
  Field,
  FormActions,
  ListToolbar,
  MetaPill,
  Notice,
  PageTitle,
  PrimaryButton,
  RecordCard,
  RecordDeck,
  SecondaryButton,
  SkeletonDeck,
  Surface,
  CatalogFormDrawer,
  visualConfirm,
} from "./ui";

type Mode = "index" | "create" | "edit";
type PlanFilter = "all" | "new" | "old" | "service";
const DUPLICATE_COURSE_CODE = "تم تسجيل الرقم الأكاديمي للمقرر هذا من قبل";
const TEACHING_MODE_LABEL: Record<string, string> = {
  theoretical: "نظري", applied: "تطبيقي", practical: "عملي",
  field_training: "التدريب الميداني",
};
const teachingModeBadge = (course: any) => {
  const label = TEACHING_MODE_LABEL[String(course?.CourseTeachingMode || "")];
  return label ? <span className="course-teaching-mode-badge" title="طبيعة التدريس"><GraduationCap aria-hidden="true"/>{label}</span> : null;
};
const teachingModeValue = (course: any) => {
  const value = String(course?.CourseTeachingMode || "").trim();
  return TEACHING_MODE_LABEL[value] || value || "غير محدد";
};
/** Which generation a course belongs to, from the live plans the server tagged it with. */
const planTagOf = (course: any): { key: "new" | "old" | "shared" | "service"; label: string } | null => {
  const plans: Array<{ status: string; name: string }> = Array.isArray(course?.curriculum) ? course.curriculum : [];
  /* جهةُ المقرر من عضوية الصحيفة الواحدة (الخادم) حين يرسلها — المصدرُ نفسه الذي يكتب وسم «صحيفة 2026». */
  const side = sheetTagOf(course);
  if (course?.sheetSide !== undefined) {
    if (side === "shared") return { key: "shared", label: "مشترك بين الصحيفتين" };
    if (side === "new") return { key: "new", label: plans.find(plan => plan.status === "active")?.name || "الصحيفة الجديدة" };
    if (side === "old") return { key: "old", label: plans.find(plan => plan.status === "transition")?.name || "الصحيفة السابقة" };
    return side === "service" ? { key: "service", label: "متطلب كلية" } : null;
  }
  if (!plans.length) return serviceOf(course).length ? { key: "service", label: "متطلب كلية" } : null;
  const isNew = plans.some(plan => plan.status === "active"), isOld = plans.some(plan => plan.status === "transition");
  if (isNew && isOld) return { key: "shared", label: "مشترك بين الصحيفتين" };
  if (isNew) return { key: "new", label: plans.find(plan => plan.status === "active")?.name || "الصحيفة الجديدة" };
  return { key: "old", label: plans.find(plan => plan.status === "transition")?.name || "الصحيفة السابقة" };
};
/** Departments whose live sheets require this course although it is in none of its own department's sheets. */
const serviceOf = (course: any): string[] => Array.isArray(course?.serviceFor) ? course.serviceFor : [];
type CurriculumTarget = {
  loading: boolean;
  bootstrap: boolean;
  plan: CurriculumPlan | null;
  error: string | null;
};

/** `embedded` means the academic console already supplies the page identity. */
/** السعةُ حسب طبيعة المقرر: قسمٌ واحد باسمه في كل الحُرُم — معاينةٌ أولاً ثم تطبيق. لمدير النظام وحده. */
const CAPACITY_MODE_ROWS = [["theoretical", "نظري", "50"], ["practical", "عملي", "20"], ["field_training", "تدريب ميداني", "15"]] as const;
/* «الرقم الأكاديمي» تسميةٌ واحدة في القائمة والتفاصيل والنموذج، وقيمته رقم الهيئة بسبع خانات (قاعدة المالك: authorityCourseCode). */
const COURSE_NUMBER_LABEL = "الرقم الأكاديمي";
function CapacityByMode({ sections, onDone }: { sections: any[]; onDone: () => void }) {
  const names = useMemo(() => [...new Set(sections.map(item => String(item.AdSectionName || "")).filter(Boolean))].sort(byArabic), [sections]);
  const [sectionName, setSectionName] = useState("");
  const [caps, setCaps] = useState<Record<string, string>>({ theoretical: "50", practical: "20", field_training: "15" });
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (apply: boolean) => {
    /* التطبيق يُرسل ما عُرضت معاينتُه حرفاً، لا ما في الخانات الآن: ما لم يُعاين لا يُكتب. */
    const inputs = apply && plan?.request ? plan.request : { sectionName, caps };
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/courses/capacity-by-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...inputs, apply }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage({ ok: false, text: body.error || "تعذّر الحساب." }); return; }
      setPlan(apply ? null : { ...body, request: inputs });
      if (apply) { setMessage({ ok: true, text: `تم تعديل ${countOf(body.written, AR.course)}.` }); onDone(); }
    } catch { setMessage({ ok: false, text: "تعذّر الاتصال." }); } finally { setBusy(false); }
  };
  const changing = plan ? Object.values<any>(plan.byMode).reduce((sum, row) => sum + row.changing, 0) : 0;
  return <details className="capacity-by-mode">
    <summary data-guide-ignore="فتح أداة السعة حسب طبيعة المقرر"><GraduationCap aria-hidden="true" />السعة حسب طبيعة المقرر</summary>
    <div className="capacity-by-mode-body">
      <select aria-label="القسم العلمي" value={sectionName} disabled={busy} data-guide-ignore="اختيار القسم الذي تُضبط سعات مقرراته" onChange={event => { setSectionName(event.target.value); setPlan(null); setMessage(null); }}>
        <option value="">اختر القسم (كل حُرُمه)</option>
        {names.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      <div className="capacity-by-mode-caps">
        {CAPACITY_MODE_ROWS.map(([key, label]) => <label key={key}><span>{label}</span>
          <input type="number" inputMode="numeric" min={1} max={200} value={caps[key]} disabled={busy} data-guide-ignore="سعة هذه الطبيعة" onChange={event => { setCaps(current => ({ ...current, [key]: event.target.value })); setPlan(null); }} /></label>)}
      </div>
      <button type="button" className="capacity-by-mode-go" disabled={busy || !sectionName} data-guide-ignore="معاينة الأثر دون كتابة شيء" onClick={() => void run(false)}>معاينة</button>
      {plan ? <div className="capacity-by-mode-plan" role="status">
        <p>{plan.branches.map((row: any) => `${row.college} (${row.courses})`).join(" · ")}</p>
        <ul>{CAPACITY_MODE_ROWS.map(([key, label]) => plan.byMode[key] ? <li key={key}><b>{label}</b> → {plan.caps[key]} · يتغيّر {plan.byMode[key].changing} من {plan.byMode[key].total}</li> : null)}</ul>
        {plan.untouched ? <small>المقررات بلا طبيعة نظري أو عملي أو ميداني ({plan.untouched}) تبقى كما هي.</small> : null}
        <button type="button" className="capacity-by-mode-go" data-tone="apply" disabled={busy || !changing} data-guide-ignore="تطبيق السعات على كل مقررات القسم في كل الحُرُم" onClick={() => void run(true)}>{changing ? `تطبيق على ${changing}` : "لا شيء يتغيّر"}</button>
      </div> : null}
      {message ? <p className="capacity-by-mode-msg" data-ok={message.ok ? "1" : "0"} role="status">{message.text}</p> : null}
    </div>
  </details>;
}

/** م.9: استثناءُ السعة لمقررٍ في عائلة قسم، ونوعُ تخصص العائلة (للتدريب الميداني). لمدير النظام وحده. */
function CapacityExceptions({ sections, courses, numberOf }: { sections: any[]; courses: any[]; numberOf: (course: any) => string }) {
  const names = useMemo(() => [...new Set(sections.map(item => String(item.AdSectionName || "")).filter(Boolean))].sort(byArabic), [sections]);
  const [sectionName, setSectionName] = useState("");
  const [data, setData] = useState<{ rules: any; reasons: Record<string, string> } | null>(null);
  const [courseCode, setCourseCode] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = async () => {
    try { const response = await fetch("/api/admin/capacity-exceptions", { credentials: "include" }); if (response.ok) setData(await response.json()); } catch { /* تبقى القائمة كما هي */ }
  };
  const key = departmentFamilyKey(sectionName);
  const familyIds = useMemo(() => new Set(sections.filter(item => key && departmentFamilyKey(item.AdSectionName) === key).map(item => Number(item.AdSectionId))), [sections, key]);
  const familyCourses = useMemo(() => {
    const seen = new Set<string>();
    return courses.filter(course => familyIds.has(Number(course.AdSectionId))).filter(course => { const code = String(course.CourseCode || ""); if (!code || seen.has(code)) return false; seen.add(code); return true; })
      .sort((a, b) => String(a.CourseCode).localeCompare(String(b.CourseCode)));
  }, [courses, familyIds]);
  const family = data?.rules?.families?.[key] || {};
  const entries: Array<[string, any]> = Object.entries(family.courses || {});
  /* يعيد true عند النجاح وحده: النموذج لا يُفرَّغ بعد رفضٍ فيضيع ما كُتب. */
  const send = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/capacity-exceptions", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionName, ...body }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage({ ok: false, text: result.error || "تعذّر الحفظ." }); return false; }
      setData(current => ({ reasons: current?.reasons || {}, rules: result.rules }));
      setMessage({ ok: true, text: "تم الحفظ." });
      return true;
    } catch { setMessage({ ok: false, text: "تعذّر الاتصال." }); return false; } finally { setBusy(false); }
  };
  return <details className="capacity-by-mode" onToggle={event => { if ((event.currentTarget as HTMLDetailsElement).open && !data) void load(); }}>
    <summary data-guide-ignore="فتح استثناءات حدود السعة (م.9)"><Users aria-hidden="true" />استثناءات حدود السعة · م.9</summary>
    <div className="capacity-by-mode-body">
      <select aria-label="القسم العلمي" value={sectionName} disabled={busy} data-guide-ignore="اختيار القسم الذي تُسجَّل له الاستثناءات" onChange={event => { setSectionName(event.target.value); setMessage(null); setCourseCode(""); }}>
        <option value="">اختر القسم (كل حُرُمه)</option>
        {names.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      {key ? <>
        <label className="capacity-exc-row"><span>نوع تخصص القسم (للتدريب الميداني)</span>
          <select aria-label="نوع التخصص" value={family.specialization === "scientific" ? "scientific" : "theoretical"} disabled={busy} data-guide-ignore="نوع التخصص: نظري أو علمي، يحدد أقصى سعة للتدريب الميداني" onChange={event => void send({ specialization: event.target.value })}>
            <option value="theoretical">نظري (ميداني حتى 60)</option><option value="scientific">علمي (ميداني حتى 25)</option>
          </select></label>
        {entries.length ? <ul className="capacity-exc-list">{entries.map(([code, item]) => <li key={code}>
          <b dir="ltr">{code}</b><span>{data?.reasons?.[item.reason] || item.reason}{item.note ? ` — ${item.note}` : ""}</span>
          <button type="button" disabled={busy} data-guide-ignore="إلغاء استثناء هذا المقرر" aria-label={`إلغاء استثناء ${code}`} onClick={() => void send({ courseCode: code, remove: true })}>إلغاء</button></li>)}</ul> : <p className="capacity-by-mode-msg">لا استثناءات مسجّلة لهذا القسم.</p>}
        <select aria-label="المقرر" value={courseCode} disabled={busy} data-guide-ignore="اختيار المقرر المستثنى" onChange={event => setCourseCode(event.target.value)}>
          <option value="">اختر المقرر</option>
          {familyCourses.map(course => <option key={course.AdCourseId} value={course.CourseCode}>{numberOf(course)} · {course.CourseName}</option>)}
        </select>
        <select aria-label="سبب الاستثناء" value={reason} disabled={busy} data-guide-ignore="سبب الاستثناء من م.9" onChange={event => setReason(event.target.value)}>
          <option value="">اختر السبب</option>
          {Object.entries(data?.reasons || {}).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <input type="text" maxLength={300} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة الاستثناء" value={note} disabled={busy} data-guide-ignore="ملاحظة قصيرة على الاستثناء" onChange={event => setNote(event.target.value)} />
        <button type="button" className="capacity-by-mode-go" data-tone="apply" disabled={busy || !courseCode || !reason} data-guide-ignore="تسجيل استثناء السعة لهذا المقرر" onClick={() => void send({ courseCode, reason, note }).then(ok => { if (ok) { setCourseCode(""); setReason(""); setNote(""); } })}>تسجيل الاستثناء</button>
      </> : null}
      {message ? <p className="capacity-by-mode-msg" data-ok={message.ok ? "1" : "0"} role="status">{message.text}</p> : null}
    </div>
  </details>;
}

/** `rootAdmin`: أدوات السعة للمدير الرئيسي وحده كما يقصرها الخادم (requireRootAdmin).
 *  `openPlansFor` / `onPlansOpened`: طلبٌ من تبويبٍ آخر (الأقسام) بفتح الصحائف الأكاديمية على قسم. */
export default function Courses({ embedded = false, actionSlot = null, scopes = [], isAdmin = true, rootAdmin = false, onCount, openPlansFor = null, onPlansOpened }: { embedded?: boolean; actionSlot?: HTMLElement | null; scopes?: ScopeAssignmentLike[]; isAdmin?: boolean; rootAdmin?: boolean; onCount?: (count: number) => void; openPlansFor?: number | null; onPlansOpened?: () => void }) {
  const shape = scopeShape(scopes, isAdmin);
  const [items, setItems] = useState<any[]>([]),
    [loaded, setLoaded] = useState(false),
    [scopedRead, setScopedRead] = useState(false),
    [loadFailed, setLoadFailed] = useState(false),
    [errorCode, setErrorCode] = useState<{ code: string; sectionId: number } | null>(null),
    [initial, setInitial] = useState(""),
    /* الصحائف فُتحت من نموذج إنشاءٍ مفتوح: يعود النموذج بما كُتب فيه عند إغلاقها. */
    [resumeCreate, setResumeCreate] = useState(false),
    [colleges, setColleges] = useState<any[]>([]),
    [sections, setSections] = useState<any[]>([]),
    [listCollege, setListCollege] = useState(0),
    [listSection, setListSection] = useState(0),
    [listPlan, setListPlan] = useState<PlanFilter>("all"),
    [bootstrapOk, setBootstrapOk] = useState(false),
    /* A course started from the plans drawer returns there once saved. */
    [returnToPlans, setReturnToPlans] = useState(false),
    [mode, setMode] = useState<Mode>("index"),
    [editId, setEditId] = useState<number | null>(null),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [collegeId, setCollegeId] = useState(""),
    [sectionId, setSectionId] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [credit, setCredit] = useState(""),
    [hours, setHours] = useState(""),
    [capacity, setCapacity] = useState(""),
    [courseRoomType, setCourseRoomType] = useState(""),
    [courseTeachingMode, setCourseTeachingMode] = useState(""),
    [courseCompanionRoomType, setCourseCompanionRoomType] = useState(""),
    [roomTypeOptions, setRoomTypeOptions] = useState<string[]>(["تدريسية", "مختبر", "مختبر حاسوب"]),
    [query, setQuery] = useState(""),
    [error, setError] = useState<string | null>(null),
    [receipt, setReceipt] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [visibleLimit, setVisibleLimit] = useState(160),
    [curriculumOpen, setCurriculumOpen] = useState(false),
    [curriculumSectionId, setCurriculumSectionId] = useState(0),
    [curriculumProbe, setCurriculumProbe] = useState(0),
    [curriculumTarget, setCurriculumTarget] = useState<CurriculumTarget | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      let correction: any = null;
      try { correction = JSON.parse(sessionStorage.getItem("schedule-reference-course-action") || "null"); } catch { sessionStorage.removeItem("schedule-reference-course-action"); /* discard malformed local intent */ }
      const correctionSection = correction && Number(correction.sectionId) > 0 ? Number(correction.sectionId) : 0;
      const courseUrl = correctionSection
        ? `/api/courses?sectionId=${correctionSection}&plans=1`
        : "/api/courses?operational=1&plans=1";
      const [a, b, c] = await Promise.all([
        fetch(courseUrl),
        fetch("/api/colleges"),
        fetch("/api/sections"),
      ]);
      if (!a.ok || !b.ok || !c.ok) throw 0;
      const data = await a.json();
      setItems(data);
      setColleges(sortByName(await b.json(), (row:any)=>row.AdCollegeName));
      setSections(sortByName(await c.json(), (row:any)=>row.AdSectionName));
      /* قائمةٌ قُرئت لقسمٍ واحد (طلب تصحيح) تقول ذلك في مرشّحها، ولا تُعلن عدداً للجامعة كلها. */
      if (correctionSection) setListSection(correctionSection);
      setScopedRead(Boolean(correctionSection));
      setLoaded(true);
      setLoadFailed(false);
      setSelectedId((v) =>
        v && data.some((x: any) => x.AdCourseId === v)
          ? v
          : data[0]?.AdCourseId || null,
      );
    } catch {
      setLoadFailed(true);
      setError("فشل تحميل بيانات المقررات الدراسية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  /* عددُ شريط التبويبات = القائمة نفسها بعد كل تحميلٍ وإنشاءٍ وحذف (لا عدّ الكتالوج الخام). */
  useEffect(() => { if (loaded && !scopedRead) onCount?.(items.length); }, [items, loaded, scopedRead]);

  useEffect(() => {
    if (!sectionId) return;
    let alive = true;
    fetch(`/api/location-room-types?collegeId=${Number(collegeId || 0)}&sectionId=${Number(sectionId)}`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => { if (alive && Array.isArray(data.types)) setRoomTypeOptions(data.types); })
      .catch(() => { if (alive) setRoomTypeOptions(["تدريسية", "مختبر", "مختبر حاسوب"]); });
    return () => { alive = false; };
  }, [collegeId, sectionId]);

  /*
   * Reading the legacy catalogue before curriculum setup remains intentionally
   * permissive: every current course is operational. Creating is different.
   * A newly entered course must have one explicit academic destination, so the
   * editor resolves the active plan first and refuses to write while the section
   * is still in the virtual/bootstrap state. That makes it impossible to seed
   * the new curriculum into the old transition catalogue by accident.
   */
  useEffect(() => {
    if (mode !== "create" || !sectionId) {
      setCurriculumTarget(null);
      return;
    }
    let alive = true;
    setCurriculumTarget({ loading: true, bootstrap: false, plan: null, error: null });
    void fetch(`/api/curriculum/sections/${Number(sectionId)}`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "تعذر التحقق من الصحيفة الحالية");
        if (!alive) return;
        const active = (Array.isArray(body?.plans) ? body.plans : [])
          .find((plan: CurriculumPlan) => plan.status === "active" && !plan.virtual && !plan.track) || null;
        setCurriculumTarget({
          loading: false,
          bootstrap: Boolean(body?.bootstrap),
          plan: active,
          error: null,
        });
      })
      .catch(reason => {
        if (!alive) return;
        setCurriculumTarget({
          loading: false,
          bootstrap: false,
          plan: null,
          error: String(reason?.message || "تعذر التحقق من الصحيفة الحالية"),
        });
      });
    return () => { alive = false; };
  }, [mode, sectionId, curriculumProbe]);

  const sectionOptions = useMemo(
      () =>
        sortByName(sections.filter(
          (s) => !collegeId || s.AdCollegeId === Number(collegeId),
        ), (s: AdSection) => s.AdSectionName),
      [sections, collegeId],
    ),
    suggestions = useMemo(
      () =>
        Array.from(
          new Set<string>(
            items.map((x) => String(x.CourseName || "").trim()).filter(Boolean),
          ),
        ).sort(byArabic),
      [items],
    );

  const reset = () => {
      setEditId(null);
      const preset = resolveScopeSelection(scopes, 0, isAdmin);
      setCollegeId(preset.defaultCollegeId ? String(preset.defaultCollegeId) : "");
      setSectionId(preset.defaultSectionId ? String(preset.defaultSectionId) : "");
      setCode("");
      setName("");
      setCredit("");
      setHours("");
      setCapacity("");
      setCourseRoomType("");
      setCourseTeachingMode("");setCourseCompanionRoomType("");
      setError(null);
      setErrorCode(null);
      setCurriculumTarget(null);
      setBootstrapOk(false);
    },
    back = () => {
      setMode("index");
      setError(null);
      setErrorCode(null);
    },
    cancelEditor = () => {
      back();
      if (returnToPlans) { setReturnToPlans(false); setCurriculumOpen(true); }
    },
    create = () => {
      reset();
      setReceipt(null);
      setResumeCreate(false);
      setCaptureNext(true);
      setMode("create");
    },
    /* Started from the plans drawer: the department is already chosen. */
    createIn = (preset: { collegeId: number; sectionId: number }) => {
      create();
      setCollegeId(String(preset.collegeId));
      setSectionId(String(preset.sectionId));
    },
    edit = (x: any) => {
      setEditId(x.AdCourseId);
      setCollegeId(String(x.AdCollegeId));
      setSectionId(String(x.AdSectionId));
      setCode(String(x.CourseCode || ""));
      setName(x.CourseName || "");
      setCredit(String(x.CourseCredit ?? ""));
      setHours(String(x.CourseHours ?? ""));
      setCapacity(String(x.MaxStudent ?? ""));
      setCourseRoomType(String(x.CourseRoomType || ""));
      setCourseTeachingMode(String(x.CourseTeachingMode || ""));
    setCourseCompanionRoomType(String(x.CourseCompanionRoomType || ""));
      setError(null);
      setErrorCode(null);
      setCurriculumTarget(null);
      setCaptureNext(true);
      setMode("edit");
    };
  /* ما في النموذج لحظة فتحه: يُقارن به ما فيه الآن، فلا يُغلق نموذجٌ معدَّل بنقرةٍ خارجه دون سؤال. */
  const [captureNext, setCaptureNext] = useState(false);
  const snapshot = JSON.stringify([collegeId, sectionId, code, name, credit, hours, capacity, courseRoomType, courseTeachingMode, courseCompanionRoomType]);
  useEffect(() => {
    if (!captureNext) return;
    setInitial(snapshot);
    setCaptureNext(false);
  }, [captureNext, snapshot]);
  const dirty = mode !== "index" && !captureNext && snapshot !== initial;

  useEffect(() => {
    let intent: any = null;
    try { intent = JSON.parse(sessionStorage.getItem("schedule-reference-course-action") || "null"); } catch { return; }
    if (!intent) return;
    /* طلبٌ لا يُنفَّذ بعد اكتمال القراءة (قسمٌ أو مقررٌ لم يعد موجوداً، أو نوعٌ مجهول) يُمسح
       ويُعاد تحميل القائمة كاملة — وإلا بقيت كل قراءةٍ لاحقة محصورةً في قسمه والمرشّح يقول «كل الأقسام». */
    const drop = () => {
      sessionStorage.removeItem("schedule-reference-course-action");
      setListSection(0);
      void load();
    };
    if (!["edit", "create"].includes(intent.kind)) { if (loaded) drop(); return; }
    const section = sections.find((row: any) => Number(row.AdSectionId) === Number(intent.sectionId));
    const college = colleges.find((row: any) => Number(row.AdCollegeId) === Number(intent.collegeId));
    if (!section || !college) { if (loaded) drop(); return; }
    if (intent.kind === "edit") {
      const existing = items.find(row => Number(row.AdCourseId) === Number(intent.courseId));
      if (!existing) { if (loaded) drop(); return; }
      sessionStorage.removeItem("schedule-reference-course-action");
      setListSection(Number(intent.sectionId));
      setSelectedId(Number(existing.AdCourseId));
      edit(existing);
      return;
    }
    sessionStorage.removeItem("schedule-reference-course-action");
    reset();
    setReceipt(null);
    setCollegeId(String(intent.collegeId));
    setSectionId(String(intent.sectionId));
    setCode(String(intent.code || ""));
    setName(String(intent.name || ""));
    setCredit(String(intent.credit ?? ""));
    setHours(String(intent.hours ?? ""));
    setCapacity("");
    setCourseRoomType("");
      setCourseTeachingMode("");setCourseCompanionRoomType("");
    /* ما جاء مملوءاً من شاشةٍ أخرى عملٌ لا يُرمى بنقرةٍ خارج النموذج: يُعدّ غير محفوظ منذ البداية. */
    setInitial("");
    setResumeCreate(false);
    setMode("create");
  }, [items, sections, colleges, loaded]);

  const numeric = (v: string, setter: (x: string) => void) => {
      setter(numericText(v));
      setError(null);
    },
    decimal = (v: string, setter: (x: string) => void) => {
      setter(decimalText(v));
      setError(null);
    },
    /* الرمزُ نفسه في القسم نفسه: يُنبَّه عند مغادرة الحقل ويُمنع الحفظ به (والخادم يمنعه أيضاً). */
    duplicateCourseCode = () =>
      Boolean(
        code &&
          sectionId &&
          items.some(
            (x) =>
              x.AdSectionId === Number(sectionId) &&
              String(x.CourseCode || "") === code &&
              x.AdCourseId !== editId,
          ),
      ),
    validateCourseCode = () => {
      if (duplicateCourseCode()) setError(DUPLICATE_COURSE_CODE);
    };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setErrorCode(null);
    if (!collegeId || !sectionId || !code || !name.trim() || !credit || !hours) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    if (duplicateCourseCode()) {
      setError(DUPLICATE_COURSE_CODE);
      return;
    }
    if (mode === "create") {
      if (curriculumTarget?.loading) {
        setError("انتظر لحظة حتى يكتمل التحقق من الصحيفة الأكاديمية الحالية");
        return;
      }
      if (!curriculumTarget?.plan && !(curriculumTarget?.bootstrap && bootstrapOk)) {
        setError("اختر أولاً: ابدأ الصحيفة الجديدة لهذا القسم، أو أكّد إضافة المقرر إلى صحيفته الحالية الوحيدة.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const targetPlan = mode === "create" ? curriculumTarget?.plan || null : null;
      const savedCode = code;
      const savedName = name.trim();
      const r = await fetch(
          mode === "edit" ? `/api/courses/${editId}` : "/api/courses",
          {
            method: mode === "edit" ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              AdCollegeId: Number(collegeId),
              AdSectionId: Number(sectionId),
              CourseCode: code,
              CourseName: name.trim(),
              CourseCredit: Number(credit),
              CourseHours: Number(hours),
              MaxStudent: Number(capacity || 0),
              CourseRoomType: courseRoomType,
              CourseTeachingMode: courseTeachingMode,
              CourseCompanionRoomType: courseCompanionRoomType,
            }),
          },
        ),
        d = await r.json();
      if (!r.ok) {
        setError(d.error || "فشل حفظ بيانات المقررات الدراسية");
        if (d?.code === "curriculum-linked") setErrorCode({ code: d.code, sectionId: Number(d.sectionId || sectionId) });
        return;
      }
      if (d && Number(d.AdCourseId)) {
        /* The saved record carries no plan tag; the plan it just joined is known. */
        const saved = targetPlan ? { ...d, curriculum: [{ id: targetPlan.id, name: targetPlan.name, status: "active" }] } : d;
        setItems(current => {
          const exists = current.some(item => Number(item.AdCourseId) === Number(saved.AdCourseId));
          return exists
            ? current.map(item => (Number(item.AdCourseId) === Number(saved.AdCourseId) ? { ...item, ...saved } : item))
            : sortByName([...current, saved], (row: any) => row.CourseName);
        });
        setSelectedId(Number(d.AdCourseId));
      } else {
        await load();
      }
      if (mode === "edit" && (d?.roomTypeEvaluated || d?.teachingModeEvaluated)) {
        const roomCopies = (Number(d.roomTypeSynced) || 0) + (Number(d.roomTypeAligned) || 0);
        const modeCopies = (Number(d.teachingModeSynced) || 0) + (Number(d.teachingModeAligned) || 0);
        const skipped = Math.max(Array.isArray(d.roomTypeSkipped) ? d.roomTypeSkipped.length : 0, Array.isArray(d.teachingModeSkipped) ? d.teachingModeSkipped.length : 0);
        if (Number(d.roomTypeSynced) > 0 || Number(d.teachingModeSynced) > 0) await load();
        const lines: string[] = [];
        if (d.roomTypeEvaluated && (roomCopies || d.roomTypeSkipped?.length)) lines.push(`${courseRoomType ? `نوع القاعة «${courseRoomType}»` : "أُزيل نوع القاعة"} · ${countOf(roomCopies + 1, AR.site)}`);
        if (d.teachingModeEvaluated && (modeCopies || d.teachingModeSkipped?.length)) lines.push(`${courseTeachingMode ? `طبيعة التدريس «${TEACHING_MODE_LABEL[courseTeachingMode] || courseTeachingMode}»` : "أُزيلت طبيعة التدريس"} · ${countOf(modeCopies + 1, AR.site)}`);
        if (lines.length) setReceipt(lines.join(" · ") + (skipped ? ` · تعذّر ${countOf(skipped, AR.site)}` : ""));
      }
      if (mode === "create" && targetPlan) {
        setReceipt(`تمت إضافة ${savedCode} — ${savedName} إلى ${targetPlan.name} بنجاح.`);
      }
      back();
      if (returnToPlans) { setReturnToPlans(false); setCurriculumOpen(true); }
    } catch {
      setError("تعذّر الاتصال بالخادم، تحقّق من الشبكة وحاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (course: any) => {
    if (submitting) return;
    const id = Number(course.AdCourseId);
    const label = `${courseNumberOf(course)} — ${course.CourseName}`;
    if (!(await visualConfirm({ title: `حذف «${course.CourseName}»`, message: `سيُحذف المقرر ${label} من النظام. لا يُحذف إن كان مرتبطاً بصحيفة أكاديمية أو له أي موعد في الجدول في أي فصل.`, confirmLabel: "حذف", tone: "danger", compact: true }))) return;
    setSubmitting(true);
    setError(null);
    setErrorCode(null);
    try {
      const r = await fetch(`/api/courses/${id}`, { method: "DELETE" }),
        d = await r.json();
      if (!r.ok) {
        setError(d.error || "فشل حذف بيانات المقررات الدراسية");
        if (d?.code === "curriculum-linked") setErrorCode({ code: d.code, sectionId: Number(d.sectionId || course.AdSectionId) });
        return;
      }
      setSelectedId(null);
      setItems(current => current.filter(item => Number(item.AdCourseId) !== Number(id)));
    } catch {
      setError("تعذّر الاتصال بالخادم، تحقّق من الشبكة وحاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => setVisibleLimit(160), [query]);
  const coll = (id: number) => colleges.find((c) => c.AdCollegeId === id)?.AdCollegeName || "",
    sec = (id: number) => sections.find((s) => s.AdSectionId === id)?.AdSectionName || "";
  /* رقم الهيئة بسبع خانات (الكلية ٢ + القسم ٢ + المقرر ٣) — لا الرمز المخزَّن ولا معرّف النظام. */
  const departmentKeys = useMemo(() => authorityDepartmentKeys(sections, colleges), [sections, colleges]);
  const courseNumberOf = (course: any) => authorityCourseCode(course?.CourseCode, departmentKeys.get(Number(course?.AdSectionId))) || "—";

  const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      let list = items;
      if (listCollege) list = list.filter((x) => x.AdCollegeId === listCollege);
      if (listSection) list = list.filter((x) => x.AdSectionId === listSection);
      if (listPlan !== "all") list = list.filter((x) => {
        const tag = planTagOf(x);
        if (listPlan === "service") return serviceOf(x).length > 0;
        // A service course is current teaching load whichever sheet the filter names.
        return tag && (tag.key === "shared" || tag.key === "service" || tag.key === listPlan);
      });
      const base = q
        ? list.filter((x) =>
            [x.CourseCode, courseNumberOf(x), x.CourseName, coll(x.AdCollegeId), sec(x.AdSectionId)].some((v) =>
              String(v || "").toLowerCase().includes(q),
            ),
          )
        : list;
      /* برقم المقرر تصاعدياً (src/utils/sheetMembership.ts) — الترتيبُ نفسه في كل قائمة مقررات. */
      return [...base].sort(byCourseNumber((x: any) => x.CourseCode, (x: any) => x.CourseName));
    }, [items, colleges, sections, departmentKeys, query, listCollege, listSection, listPlan]),
    selected = filtered.find((x) => x.AdCourseId === selectedId) || filtered[0] || null,
    activeId = selected?.AdCourseId ?? null;

  const openCurriculum = (preferredSectionId = 0) => {
    const sid = preferredSectionId || listSection || Number(selected?.AdSectionId || 0);
    /* من نموذج إنشاءٍ مفتوح: الحقول تبقى في الحالة (لا reset)، ويعود النموذج بها عند إغلاق الصحائف. */
    setResumeCreate(mode === "create");
    setCurriculumSectionId(sid);
    setMode("index");
    setError(null);
    setErrorCode(null);
    setCurriculumOpen(true);
  };
  const closeCurriculum = () => {
    setCurriculumOpen(false);
    setCurriculumProbe(value => value + 1);
    if (resumeCreate) { setResumeCreate(false); setMode("create"); }
  };
  /* طلبٌ من تبويب الأقسام: تُفتح الصحائف على القسم المطلوب بعد أن تصل الأقسام. */
  useEffect(() => {
    if (!openPlansFor || !sections.length) return;
    openCurriculum(Number(openPlansFor));
    onPlansOpened?.();
  }, [openPlansFor, sections.length]);
  const createBlocked = mode === "create" && Boolean(sectionId) && Boolean(
    curriculumTarget?.loading || curriculumTarget?.error || (!curriculumTarget?.plan && !(curriculumTarget?.bootstrap && bootstrapOk)),
  );
  const listSections = useMemo(() => sections.filter((s) => !listCollege || s.AdCollegeId === listCollege), [sections, listCollege]),
    listSectionLabel = useMemo(() => sectionLabels(listSections, colleges), [listSections, colleges]);
  const hasPlans = useMemo(() => items.some(item => planTagOf(item)), [items]);
  /* رفضٌ سببه الصحيفة (حذفُ مقررٍ مرتبط، أو هويةٌ مجمّدة) يأتي ومعه بابُها. */
  const plansAction = errorCode?.code === "curriculum-linked" ? (
    <SecondaryButton type="button" data-guide-ignore="يفتح الصحائف الأكاديمية لقسم المقرر؛ لا يغيّر شيئاً" onClick={() => { setResumeCreate(false); openCurriculum(errorCode.sectionId); }}>
      <GraduationCap aria-hidden="true" /> فتح الصحائف الأكاديمية
    </SecondaryButton>
  ) : undefined;

  const editorDrawer = mode !== "index" ? (
    <CatalogFormDrawer onClose={cancelEditor} dirty={dirty} label={mode === "create" ? "إنشاء مقرر جديد" : "تعديل بيانات المقرر"}>
      <PageTitle
        eyebrow="البيانات الأكاديمية"
        subtitle={mode === "create" ? "المقرر الجديد يرتبط بالصحيفة الحالية تلقائياً" : "مرتبط بالكلية والقسم"}
      >
        {mode === "create" ? "تسجيل مقرر دراسي جديد" : "تعديل بيانات المقرر"}
      </PageTitle>
      {error ? <Notice action={plansAction}>{error}</Notice> : null}
      <Surface className="form-card smart-form">
        <div className="form-intro">
          <span><BookOpen /></span>
          <div>
            <strong>بطاقة المقرر</strong>
            <p>{mode === "create" ? "اختر القسم أولاً لعرض الصحيفة التي سيُسجّل فيها المقرر" : "كل ما يلزم المقرر"}</p>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {!hidesCollege(shape) ? <Field label="الكلية" required>
              <select
                value={collegeId}
                onChange={(e) => {
                  setCollegeId(e.target.value);
                  setSectionId(String(resolveScopeSelection(scopes, Number(e.target.value), isAdmin).defaultSectionId || ""));
                  setCurriculumTarget(null);
                }}
                aria-label="الكلية"
                autoFocus
                required
              >
                <option value="">اختر ...</option>
                {colleges.map((c) => <option key={c.AdCollegeId} value={c.AdCollegeId}>{c.AdCollegeName}</option>)}
              </select>
            </Field> : null}
            {!hidesSection(shape) && singleDepartmentOf(scopes, Number(collegeId), isAdmin) === null ? <Field label="القسم العلمي" required>
              <select
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setCurriculumTarget(null);
                }}
                disabled={!collegeId}
                aria-label="القسم العلمي"
                required
              >
                <option value="">اختر ...</option>
                {sectionOptions.map((s) => <option key={s.AdSectionId} value={s.AdSectionId}>{s.AdSectionName}</option>)}
              </select>
            </Field> : null}

            {mode === "create" && sectionId ? (
              <div style={{ gridColumn: "1 / -1" }}>
                {curriculumTarget?.loading ? (
                  <Notice type="info" inline>يجري التحقق من الصحيفة الأكاديمية الحالية لهذا القسم…</Notice>
                ) : curriculumTarget?.plan ? (
                  <Notice type="success" inline>
                    <strong>الصحيفة المستهدفة: {curriculumTarget.plan.name}{curriculumTarget.plan.code ? ` · ${curriculumTarget.plan.code}` : ""}</strong>
                    <br />
                    سيتم ربط هذا المقرر تلقائياً بهذه الصحيفة عند الحفظ، ولن يُضاف إلى الصحيفة الانتقالية.
                  </Notice>
                ) : curriculumTarget?.error ? (
                  <Notice
                    type="block"
                    inline
                    action={
                      <SecondaryButton
                        type="button"
                        data-guide-ignore="إعادة محاولة قراءة الصحيفة بعد تعذر التحقق؛ لا تنفذ تغييراً أكاديمياً"
                        onClick={() => setCurriculumProbe(value => value + 1)}
                      >
                        إعادة التحقق
                      </SecondaryButton>
                    }
                  >
                    تعذر التحقق من الصحيفة الحالية. أوقفنا الحفظ حتى نتأكد من وجهة المقرر بدلاً من تسجيله في صحيفة غير صحيحة.
                  </Notice>
                ) : curriculumTarget?.bootstrap ? (
                  <Notice
                    type={bootstrapOk ? "info" : "warning"}
                    inline
                    action={
                      <SecondaryButton
                        type="button"
                        data-guide-ignore="إدارة أكاديمية متخصصة للصحائف؛ لا تغيّر الجدول مباشرة"
                        onClick={() => openCurriculum(Number(sectionId))}
                      >
                        <GraduationCap /> بدء الصحيفة الجديدة
                      </SecondaryButton>
                    }
                  >
                    <strong>لهذا القسم صحيفة واحدة حتى الآن.</strong>
                    <br />
                    إن كان المقرر من الصحيفة الجديدة فابدأها أولاً، حتى لا يختلط بمقررات الطلبة الحاليين.
                    <label className="course-bootstrap-ok">
                      <input type="checkbox" checked={bootstrapOk} onChange={e => setBootstrapOk(e.target.checked)} />
                      <span>المقرر من صحيفة القسم الحالية — أضفه إليها</span>
                    </label>
                  </Notice>
                ) : (
                  <Notice type="warning" inline>لا توجد صحيفة حالية فعّالة لهذا القسم.</Notice>
                )}
              </div>
            ) : null}

            <Field label={COURSE_NUMBER_LABEL} required hint={code && sectionId && courseNumberOf({ CourseCode: code, AdSectionId: Number(sectionId) }) !== code ? `يُعرض ويُطبع: ${courseNumberOf({ CourseCode: code, AdSectionId: Number(sectionId) })}` : undefined}>
              <input
                inputMode="numeric"
                dir="ltr"
                value={code}
                onChange={(e) => numeric(e.target.value, setCode)}
                onBlur={validateCourseCode}
                aria-label={COURSE_NUMBER_LABEL}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="المقرر الدراسي" required>
              <input
                list="course-name-suggestions"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="اسم المقرر الدراسي"
                autoComplete="off"
                required
              />
              <datalist id="course-name-suggestions">
                {suggestions.map((x) => <option key={x} value={x} />)}
              </datalist>
            </Field>
            <Field label="الوحدات" required>
              <input inputMode="numeric" value={credit} onChange={(e) => numeric(e.target.value, setCredit)} aria-label="الوحدات" required />
            </Field>
            <Field label="الساعات" required>
              <input inputMode="decimal" value={hours} onChange={(e) => decimal(e.target.value, setHours)} aria-label="الساعات" required />
            </Field>
            <Field label="السعة">
              <input inputMode="numeric" value={capacity} onChange={(e) => numeric(e.target.value, setCapacity)} aria-label="السعة القصوى للطلبة" />
            </Field>
            <Field label="نوع القاعة المناسب (اختياري)">
              <select value={courseRoomType} onChange={event => setCourseRoomType(event.target.value)} aria-label="نوع القاعة المناسب للمقرر">
                <option value="">بلا تفضيل</option>
                {courseRoomType&&!roomTypeOptions.includes(courseRoomType)?<option value={courseRoomType}>{courseRoomType}</option>:null}
                {roomTypeOptions.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="مرفق مرافق إلزامي (اختياري)">
              <select aria-label="نوع المرفق المرافق المطلوب" value={courseCompanionRoomType} onChange={event=>setCourseCompanionRoomType(event.target.value)}>
                <option value="">لا يحتاج مرفقًا مرافقًا</option>
                {courseCompanionRoomType&&!roomTypeOptions.includes(courseCompanionRoomType)?<option value={courseCompanionRoomType}>{courseCompanionRoomType}</option>:null}
                {roomTypeOptions.map(type=><option key={type} value={type}>{type}</option>)}
              </select>
              <small>إذا حُدد، يجب حجز مرفق من هذا النوع مع كل موعد طوال مدته.</small>
            </Field>
            <Field label="طبيعة التدريس (للمراجعة اللائحية)">
              <select value={courseTeachingMode} onChange={event => setCourseTeachingMode(event.target.value)} aria-label="طبيعة تدريس المقرر">
                <option value="">غير محددة</option>
                {courseTeachingMode === "mixed" ? <option value="mixed">mixed</option> : null}
                <option value="theoretical">نظري</option>
                <option value="applied">تطبيقي</option>
                <option value="practical">عملي</option>
                <option value="field_training">التدريب الميداني</option>
              </select>
            </Field>
          </div>
          <FormActions
            onBack={cancelEditor}
            loading={loading || submitting || Boolean(curriculumTarget?.loading && mode === "create")}
            submitDisabled={createBlocked}
            submitLabel={mode === "create" ? (curriculumTarget?.plan ? `إنشاء في ${curriculumTarget.plan.name}` : "إنشاء المقرر") : "حفظ التعديلات"}
          />
        </form>
      </Surface>
    </CatalogFormDrawer>
  ) : null;

  /* الصحائف الأكاديمية بابٌ دائم في رأس الشاشة: إليها تحيل رسائل الحذف والتجميد وشاشة الأقسام. */
  const headActions = (
    <div className="course-head-actions">
      <SecondaryButton data-guide-ignore="يفتح الصحائف الأكاديمية للقسم المختار؛ لا يغيّر شيئاً بنفسه" onClick={() => openCurriculum()}>
        <GraduationCap aria-hidden="true" /> الصحائف الأكاديمية
      </SecondaryButton>
      <AddButton onClick={create}>إنشاء مقرر</AddButton>
    </div>
  );
  return (
    <div className={`content-stack library-page catalog-inspector-page visual-minimal ${embedded ? "embedded-catalog" : ""}`}>
      {embedded ? (
        <EmbeddedAction slot={actionSlot}>
          {headActions}
        </EmbeddedAction>
      ) : (
        <PageTitle
          eyebrow="المكتبة الأكاديمية"
          subtitle="المكتبة والتفاصيل في لوحة واحدة"
          action={headActions}
        >
          المقررات الدراسية
        </PageTitle>
      )}
      {receipt ? <Notice type="success" onDismiss={() => setReceipt(null)}>{receipt}</Notice> : null}
      {error && mode === "index" ? (
        <Notice action={loadFailed ? <SecondaryButton data-guide-ignore="يعيد قراءة القائمة بعد تعذّرها؛ لا يكتب شيئاً" onClick={() => { setError(null); void load(); }}>إعادة المحاولة</SecondaryButton> : plansAction}>{error}</Notice>
      ) : null}
      {/* أدوات السعة للمدير الرئيسي وحده — كما يقصرها الخادم؛ وبعد التطبيق تُعاد القائمة لا الصفحة كلها. */}
      {rootAdmin ? <CapacityByMode sections={sections} onDone={() => void load()} /> : null}
      {rootAdmin ? <CapacityExceptions sections={sections} courses={items} numberOf={courseNumberOf} /> : null}
      <div className="catalog-workspace" aria-busy={loading}>
        <Surface className="catalog-master">
          <h2 className="sr-only">قائمة المقررات الدراسية</h2>
          <ListToolbar value={query} onChange={setQuery} count={filtered.length} placeholder="الرقم الأكاديمي، اسم المقرر، الكلية أو القسم">
            {!hidesCollege(shape) ? <select
              className="list-filter"
              value={listCollege}
              onChange={(e) => { setListCollege(Number(e.target.value)); setListSection(0); }}
              aria-label="تصفية بالكلية"
            >
              <option value={0}>كل الكليات</option>
              {colleges.map((c) => <option key={c.AdCollegeId} value={c.AdCollegeId}>{c.AdCollegeName}</option>)}
            </select> : null}
            {!hidesSection(shape) ? <select
              className="list-filter"
              value={listSection}
              onChange={(e) => setListSection(Number(e.target.value))}
              aria-label="تصفية بالقسم"
            >
              <option value={0}>كل الأقسام</option>
              {listSections.map((s) => <option key={s.AdSectionId} value={s.AdSectionId}>{listSectionLabel.get(s.AdSectionId) || s.AdSectionName}</option>)}
            </select> : null}
            {hasPlans ? (
              <select
                className="list-filter"
                value={listPlan}
                onChange={(e) => setListPlan(e.target.value as PlanFilter)}
                aria-label="تصفية بالصحيفة"
              >
                <option value="all">كل الصحائف</option>
                <option value="new">الصحيفة الجديدة</option>
                <option value="old">الصحيفة السابقة</option>
                <option value="service">متطلب كلية</option>
              </select>
            ) : null}
          </ListToolbar>
          {loading ? (
            <SkeletonDeck count={6} />
          ) : filtered.length ? (
            <RecordDeck className="course-deck">
              {filtered.slice(0, visibleLimit).map((x) => (
                <RecordCard
                  key={x.AdCourseId}
                  onClick={() => setSelectedId(x.AdCourseId)}
                  className={activeId === x.AdCourseId ? "selected" : ""}
                  icon={<BookOpen />}
                  title={<span className="course-room-type-line"><span>{x.CourseName}<CourseTags courseId={x.AdCourseId} /></span>{teachingModeBadge(x)}<CourseRoomTypeBadge type={x.CourseRoomType}/></span>}
                  subtitle={<span className="record-path"><Building2 />{sec(x.AdSectionId)} <i className="record-path-dot" aria-hidden="true" /> {coll(x.AdCollegeId)}</span>}
                  meta={<><MetaPill label={COURSE_NUMBER_LABEL} value={courseNumberOf(x)} dir="ltr" /><MetaPill label="الوحدات" value={x.CourseCredit} /><MetaPill label="الساعات" value={x.CourseHours} /></>}
                />
              ))}
            </RecordDeck>
          ) : (
            <EmptyState
              title={loadFailed ? "تعذّر تحميل المقررات" : "لا توجد مقررات مطابقة"}
              detail={loadFailed ? "لم تصل القائمة من الخادم؛ هذا لا يعني أنها فارغة." : "جرّب رقماً آخر أو امسح عبارة البحث."}
              action={loadFailed ? <SecondaryButton data-guide-ignore="يعيد قراءة القائمة بعد تعذّرها؛ لا يكتب شيئاً" onClick={() => { setError(null); void load(); }}>إعادة المحاولة</SecondaryButton> : query ? <SecondaryButton data-guide-ignore="يمسح نص البحث في القائمة؛ لا يكتب شيئاً" onClick={() => setQuery("")}>مسح البحث</SecondaryButton> : undefined}
            />
          )}
          {filtered.length > visibleLimit ? (
            <div className="catalog-more">
              <SecondaryButton onClick={() => setVisibleLimit((v) => v + 160)}>
                عرض المزيد · {" "}{(filtered.length - visibleLimit).toLocaleString("ar-KW-u-nu-latn")} متبقٍ
              </SecondaryButton>
            </div>
          ) : null}
        </Surface>
        <aside className="academic-inspector" aria-label="تفاصيل المقرر المحدد" aria-live="polite">
          {selected ? (
            <>
              <div className="academic-inspector-icon"><BookOpen /></div>
              <span className="surface-kicker">تفاصيل المقرر</span>
              <h2 className="course-room-type-line"><span>{selected.CourseName}<CourseTags courseId={selected.AdCourseId} /></span>{teachingModeBadge(selected)}<CourseRoomTypeBadge type={selected.CourseRoomType}/></h2>
              <p>{sec(selected.AdSectionId)} · {coll(selected.AdCollegeId)}</p>
              {serviceOf(selected).length ? <p className="course-service-for">متطلب في صحائف: {serviceOf(selected).join("، ")}</p> : null}
              <div className="inspector-facts inspector-facts-pairs">
                <article><span>الوحدات</span><b>{selected.CourseCredit}</b></article>
                <article><span>الساعات</span><b>{selected.CourseHours}</b></article>
                <article><span>السعة</span><b>{selected.MaxStudent || 0}</b></article>
                <article><span>{COURSE_NUMBER_LABEL}</span><b dir="ltr">{courseNumberOf(selected)}</b></article>
                <article className="course-detail-fact"><small><DoorOpen aria-hidden="true"/>نوع القاعة</small><b>{String(selected.CourseRoomType || "").trim() || "غير محدد"}</b></article>
                <article className="course-detail-fact"><small><GraduationCap aria-hidden="true"/>طبيعة التدريس</small><b>{teachingModeValue(selected)}</b></article>{selected.CourseCompanionRoomType?<article className="course-detail-fact"><small><DoorOpen aria-hidden="true"/>مرفق مرافق إلزامي</small><b>{selected.CourseCompanionRoomType}</b></article>:null}
              </div>
              <div className="inspector-actions">
                <PrimaryButton onClick={() => edit(selected)}>تعديل</PrimaryButton>
                <SecondaryButton
                  data-guide-ignore="إجراء حذف حساس داخل شاشة الإدارة ويستخدم تأكيد الشاشة نفسه"
                  className="danger-action"
                  onClick={() => remove(selected)}
                >
                  <Trash2 /> حذف
                </SecondaryButton>
              </div>
            </>
          ) : (
            <div className="master-empty"><BookOpen /><strong>اختر مقرراً</strong><span>التفاصيل ستظهر هنا.</span></div>
          )}
        </aside>
      </div>
      {editorDrawer}
      {curriculumOpen ? (
        <CurriculumPlans
          sections={sections}
          colleges={colleges}
          collegeId={listCollege}
          initialSectionId={curriculumSectionId || listSection || Number(selected?.AdSectionId || 0)}
          onClose={closeCurriculum}
          onChanged={() => { void load(); setCurriculumProbe(value => value + 1); }}
          onCreateCourse={(sid) => {
            const section = sections.find((row: any) => Number(row.AdSectionId) === Number(sid));
            setCurriculumOpen(false);
            setResumeCreate(false);
            createIn({ collegeId: Number(section?.AdCollegeId || 0), sectionId: Number(sid) });
            setCurriculumSectionId(Number(sid));
            setReturnToPlans(true);
          }}
        />
      ) : null}
    </div>
  );
}
