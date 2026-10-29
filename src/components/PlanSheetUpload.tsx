/**
 * ── رفع «الخطة الدراسية» (صحيفة التخرج) لقسم ──────────────────────────────────
 * PDF من SWRCAPP يُرفع مرةً واحدة: يُقبل لقسمه وكليته المختارين فقط، وتُطبَّق مقررات القسم وحدها
 * مباشرةً (برقم المقرر، وأسماؤها مصحَّحة، والسعة كما هي)، ثم يعتمد القسم الصحيفة من «اعتماد الصحيفة».
 * الرفضُ صندوقٌ أحمر قصير بأيقونات، بلا نصٍّ طويل.
 */
import React, { useRef, useState } from "react";
import { AR, countOf } from "../utils/arabicCount";
import DuplicateCoursesPanel from "./DuplicateCoursesPanel";
import SpellingTwinsMerge from "./SpellingTwinsMerge";
import ServiceCoursesPanel, { voteServiceCourses, type ServiceCourse } from "./ServiceCoursesPanel";
import { AlertTriangle, CheckCircle2, Download, GraduationCap, FileUp, FileX2, History, Link2, Loader2, PencilLine, Plus, SearchX, ShieldAlert, Trash2, UserPlus, X } from "lucide-react";

interface SectionOption { sectionId: number; label: string; sites: number }
interface Rejection {
  kind: string; message: string;
  mismatch?: { fields: Array<"college" | "department">; sheet: { college?: string; department?: string; departmentCode?: string }; chosen: { college?: string; department?: string; departmentCode?: string } };
}
interface Outcome {
  unlinked: number; prereqPrinted: number; prereqLinked: number;
  sites: number;
  renamed: { before: string; after: string } | null;
  recoded: { before: string; after: string } | null;
  planId: string; planName: string; planCreated: boolean; created: number; updated: number; linked: number; unchanged: number; rules: number;
}

/** قسمٌ لصحيفته لا وجود له، مع كليات النظام المطابقة لرقم كليته واسم كلية الصحيفة (إن لم توجد كليةٌ مطابقة). */
interface MissingDept { name: string; code: string; sheetCollege?: string; collegeCode?: string; colleges?: Array<{ id: number; name: string }> }
type BatchPhase = "read" | "upload" | "prereq" | "done";
interface ReportRow {
  file: string; status: "ok" | "skipped" | "rejected" | "unreadable"; reason?: string; detail?: string;
  program?: string; programName?: string; year?: number; era?: "new" | "old";
  tracks?: number; sites?: number; sections?: string[]; plan?: string; created?: number; updated?: number; linked?: number;
  nameFixes?: number; otherDepartments?: number; prereqLinked?: number; prereqPrinted?: number; renames?: unknown[]; unresolved?: string[]; addedOther?: number; foreignNotAdded?: string[]; differsOther?: string[]; noDepartment?: string[]; rollover?: boolean;
  /** ردّ الخادم كاملاً للمرور الأول (للمراجعة)، ومدة الطلب بالمللي ثانية، ورمز HTTP، وعدد المحاولات. */
  server?: unknown; ms?: number; http?: number; attempts?: number;
  /** قسمٌ للصحيفة لا وجود له بالنظام (يُعرض إنشاؤه بموافقة المسؤول)، وأقسامٌ أُنشئت لها. */
  missingDept?: MissingDept; createdSections?: Array<{ name: string; college: string; accounts?: Array<{ login: string; label: string; status: string }> }>;
}
/** ما يُحفظ في التقرير من ردّ الخادم لصحيفةٍ مقبولة. */
const pick = (data: any): Partial<ReportRow> => ({
  tracks: Number(data.tracks || 1), sites: Number(data.sites || 1), sections: Array.isArray(data.sections) ? data.sections : [String(data.sectionName || "")],
  plan: String(data.planName || ""), created: Number(data.created || 0), updated: Number(data.updated || 0), linked: Number(data.linked || 0),
  nameFixes: typeof data.nameFixes === "number" ? data.nameFixes : Array.isArray(data.nameFixes) ? data.nameFixes.length : 0,
  otherDepartments: Number(data.otherDepartments || 0), prereqLinked: Number(data.prereqLinked || 0), prereqPrinted: Number(data.prereqPrinted || 0),
  renames: Array.isArray(data.renames) ? data.renames : [], unresolved: Array.isArray(data.unresolved) ? data.unresolved : [],
  addedOther: Number(data.addedOther || 0), foreignNotAdded: Array.isArray(data.foreignNotAdded) ? data.foreignNotAdded : [], rollover: Boolean(data.rollover), createdSections: Array.isArray(data.createdSections) ? data.createdSections : [], differsOther: Array.isArray(data.differsOther) ? data.differsOther : [], noDepartment: Array.isArray(data.noDepartment) ? data.noDepartment : [],
});

/** رموز الأقسام المطبوعة في الصحف وغير الموجودة بالنظام، بعدد مقرراتها (للتقرير النهائي). */
const missingDepartments = (rows: ReportRow[]) => {
  const total = new Map<string, number>();
  for (const row of rows) for (const item of row.noDepartment || []) { const [code, count] = item.split("×"); total.set(code, Math.max(total.get(code) || 0, Number(count) || 0)); }
  return [...total].map(([code, courses]) => ({ code, courses })).sort((a, b) => a.code.localeCompare(b.code));
};

const SHORT: Record<string, { icon: typeof FileX2; title: string; hint: string }> = {
  unreadable: { icon: FileX2, title: "الملف غير مقروء", hint: "ارفع PDF «الخطة الدراسية» من SWRCAPP" },
  unverified: { icon: ShieldAlert, title: "القراءة لا تطابق حسابها", hint: "أرسل الملف لفحصه" },
  order: { icon: SearchX, title: "لا صحيفة سابقة للقسم", hint: "ارفع القديمة قبل الجديدة" },
  previous: { icon: History, title: "للقسم سابقة جارية", hint: "اضغط «انتهوا» لها ثم ارفع الأحدث" },
  empty: { icon: SearchX, title: "لا مقررات لهذا القسم", hint: "في الصحيفة" },
};

export default function PlanSheetUpload({ targets, sectionId, onDone, tools }: { targets: SectionOption[]; sectionId: number; onDone: (sectionId: number, planId: string) => void; tools?: React.ReactNode }) {
  const [chosen, setChosen] = useState(targets.find(item => item.sectionId === sectionId)?.sectionId || targets[0]?.sectionId || 0);
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [batch, setBatch] = useState<{ phase: BatchPhase; done: number; total: number; ok: number; skipped: number; failed: number; prereqLinked: number; prereqPrinted: number; rows: ReportRow[] } | null>(null);

  const [serviceWinners, setServiceWinners] = useState<ServiceCourse[]>([]);
  const [reconcile, setReconcile] = useState<{ updated: number; ambiguous: string[] } | null>(null);
  /* عملٌ طويل (فحص/حذف/إنشاء/اعتماد): يُرى أنه شغّال لا عالق، ولا يُضغط زرٌّ ثانٍ أثناءه. */
  const [working, setWorking] = useState("");
  const run = async (label: string, job: () => Promise<void>) => { if (working) return; setWorking(label); try { await job(); } finally { setWorking(""); } };
  const workingNote = working ? <small className="pr-working" role="status" aria-live="polite"><Loader2 aria-hidden="true" className="spin" size={14} /> {working}… قد يطول، لا تغلق الصفحة</small> : null;
  /* المقررات الدخيلة (بقايا الإضافة القديمة): معاينة ثم حذفُ ما يختاره المسؤول. */
  type ForeignCourse = { id: number; code: string; name: string; ownerSection: string; kind?: "copy" | "name" | "orphan" };
  const [foreign, setForeign] = useState<{ sections: Array<{ sectionId: number; section: string; courses: ForeignCourse[] }>; total: number } | null>(null);
  const [foreignOff, setForeignOff] = useState<Set<number>>(new Set());
  const [foreignMsg, setForeignMsg] = useState("");
  const scanForeign = async () => {
    setForeignMsg("");
    try {
      const response = await fetch("/api/plan-review/sheet/foreign", { credentials: "include" });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(data.error || "تعذّر الفحص");
      setForeign({ sections: data.sections || [], total: Number(data.total || 0) });
      /* النسخةُ برقمها واسمها والمطابَقة بالاسم تُختار سلفاً؛ «بلا نسخة» تُترك لك (أو «حدّد الكل» للوحدة القديمة). */
      setForeignOff(new Set<number>((data.sections || []).flatMap((row: { courses: ForeignCourse[] }) => row.courses.filter(course => course.kind === "orphan").map(course => course.id))));
    } catch (e: any) { setForeignMsg(String(e?.message || "تعذّر الفحص")); }
  };
  const deleteForeign = async () => {
    const ids = (foreign?.sections || []).flatMap(row => row.courses.map(course => course.id)).filter(id => !foreignOff.has(id));
    if (!ids.length || !window.confirm(`حذف ${countOf(ids.length, AR.course)} دخيلاً نهائياً؟`)) return;
    try {
      const response = await fetch("/api/plan-review/sheet/foreign/delete", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(data.error || "تعذّر الحذف");
      setForeignMsg(`حُذف ${countOf(Number(data.deleted || 0), AR.course)}`);
      await scanForeign();
    } catch (e: any) { setForeignMsg(String(e?.message || "تعذّر الحذف")); }
  };
  /* حسابات الأقسام الموجودة الناقصة: معاينةٌ ثم إنشاءُ ما يختاره المسؤول. */
  type AccountsRow = { sectionId: number; college: string; section: string; existing: Array<{ label: string; login: string }>; missing: Array<{ role: string; label: string; login: string }> };
  const [accounts, setAccounts] = useState<{ rows: AccountsRow[]; total: number } | null>(null);
  const [accountsOn, setAccountsOn] = useState<Set<number>>(new Set());
  const [accountsMsg, setAccountsMsg] = useState("");
  const previewAccounts = async () => {
    setAccountsMsg(""); setAccountsOn(new Set());
    try {
      const response = await fetch("/api/plan-review/section-accounts", { credentials: "include" });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(data.error || "تعذّرت المعاينة");
      setAccounts({ rows: data.rows || [], total: Number(data.total || 0) });
    } catch (e: any) { setAccountsMsg(String(e?.message || "تعذّرت المعاينة")); }
  };
  const createAccounts = async () => {
    const ids = [...accountsOn];
    if (!ids.length) return;
    const count = (accounts?.rows || []).filter(row => accountsOn.has(row.sectionId)).reduce((sum, row) => sum + row.missing.length, 0);
    if (!window.confirm(`إنشاء ${countOf(count, AR.account)} فعّالة بكلمة السر الافتراضية؟`)) return;
    try {
      const response = await fetch("/api/plan-review/section-accounts", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ sectionIds: ids }) });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(data.error || "تعذّر الإنشاء");
      setAccountsMsg(`أُنشئ ${countOf(Number(data.created || 0), AR.account)}${data.failed?.length ? ` · تعثّر ${data.failed.length}` : ""}`);
      await previewAccounts();
    } catch (e: any) { setAccountsMsg(String(e?.message || "تعذّر الإنشاء")); }
  };
  /* اعتماد كل الصحائف: معاينةٌ بالجاهز وما فيه حاجز، ثم اعتماد الجاهز. */
  type ApprovalItem = { planId: string; plan: string; section: string; updatedAt?: string; reason?: string };
  const [approval, setApproval] = useState<{ ready: ApprovalItem[]; blocked: ApprovalItem[] } | null>(null);
  const [approvalMsg, setApprovalMsg] = useState("");
  const previewApproval = async () => {
    setApprovalMsg("");
    try {
      const response = await fetch("/api/plan-review/approve-all", { credentials: "include" });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(data.error || "تعذّرت المعاينة");
      setApproval({ ready: data.ready || [], blocked: data.blocked || [] });
    } catch (e: any) { setApprovalMsg(String(e?.message || "تعذّرت المعاينة")); }
  };
  const approveAll = async () => {
    if (!approval?.ready.length || !window.confirm(`اعتماد ${countOf(approval.ready.length, AR.sheet)} جاهزة؟`)) return;
    try {
      const response = await fetch("/api/plan-review/approve-all", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: approval.ready.map(item => ({ planId: item.planId, updatedAt: item.updatedAt })) }) });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(data.error || "تعذّر الاعتماد");
      setApprovalMsg(`اعتُمدت ${countOf(Number(data.approved || 0), AR.sheet)}${data.stale ? ` · تغيّرت ${data.stale} أثناء الاعتماد (أعد المعاينة)` : ""}`);
      await previewApproval();
    } catch (e: any) { setApprovalMsg(String(e?.message || "تعذّر الاعتماد")); }
  };
  const [pending, setPending] = useState<Array<{ file: File; dept: MissingDept }>>([]);
  const lastFile = useRef<File | null>(null);
  const batchFiles = useRef<File[]>([]);
  const snapshot = useRef<unknown>(null);
  const upload = async (file: File | undefined, force = false) => {
    if (!file || !chosen) return;
    lastFile.current = file;
    setBusy(true); setRejection(null); setError(""); setOutcome(null); setBatch(null); setReconcile(null);
    try {
      const response = await fetch(`/api/plan-review/sheet/import?sectionId=${chosen}${force ? "&force=1" : ""}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: await file.arrayBuffer() });
      const data = await response.json().catch(() => ({} as any));
      if (response.status === 422 && data.rejection) { setRejection(data.rejection as Rejection); return; }
      if (!response.ok) throw new Error(data.error || "تعذّر رفع الصحيفة");
      setOutcome(data as Outcome);
      onDone(Number(data.sectionId || chosen), String(data.planId || ""));
    } catch (e: any) { setError(e.message || "تعذّر رفع الصحيفة"); }
    finally { setBusy(false); }
  };

  /* رفعُ كل الملفات (جديدة وقديمة) دفعةً واحدة: تُقرأ ترويستُها أولاً، وتُوجَّه كل صحيفة إلى قسمها، ثم يُراجَع ما رُبط.
     ما عُرف قسمه وما رُفض وما تُرك (قديمةٌ أقدمُ من أحدث لبرنامجها) كلُّه في تقريرٍ يُنزَّل للمراجعة. */
  const uploadAll = async (files: File[], qsOf?: (file: File) => string, merge?: ReportRow[]) => {
    if (!files.length) return;
    /* إعادةُ قسمٍ واحد: تبقى الملفات مرتَّبةً كصفوف الدفعة الأصلية فلا يُعاد ملفٌ غير ملفِّه. */
    const previousFiles = batchFiles.current;
    batchFiles.current = merge ? merge.map((old, index) => files.find(file => file.name === old.file) || previousFiles[index]) : files;
    snapshot.current = null;
    setBusy(true); setRejection(null); setError(""); setOutcome(null); setReconcile(null);
    const state = { phase: "read" as BatchPhase, done: 0, total: files.length, ok: 0, skipped: 0, failed: 0, prereqLinked: 0, prereqPrinted: 0 };
    const rows: ReportRow[] = files.map(file => ({ file: file.name, status: "rejected" }));
    /* إعادةُ قسمٍ واحد: تُدمج نتيجتُه في تقرير الدفعة الأصلية فلا يضيع ما قبله. */
    const publish = () => {
      const shown = (merge ? merge.map(old => rows.find(row => row.file === old.file) || old) : rows).map(row => ({ ...row }));
      /* عدّادات الدفعة المدموجة تُحسب من صفوفها لا من الجزء المُعاد وحده. */
      const totals = merge ? { ok: shown.filter(row => row.status === "ok").length, skipped: shown.filter(row => row.status === "skipped").length, failed: shown.filter(row => row.status === "rejected" || row.status === "unreadable").length, prereqLinked: shown.reduce((sum, row) => sum + (row.status === "ok" ? row.prereqLinked || 0 : 0), 0), prereqPrinted: shown.reduce((sum, row) => sum + (row.status === "ok" ? row.prereqPrinted || 0 : 0), 0) } : {};
      setBatch({ ...state, ...totals, rows: shown });
    };
    publish();
    /* انقطاعٌ عابر (شبكة، 5xx، 429) لا يُسقط الملف: ثلاث محاولات بانتظارٍ متزايد، وآخر خطأٍ يُسجَّل في التقرير. */
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const post = async (path: string, file: File) => {
      let last = "";
      const body = await file.arrayBuffer().catch((e: any) => { last = `قراءة الملف: ${e?.name || ""} ${e?.message || ""}`.trim(); return null; });
      if (!body) throw new Error(last || "تعذّرت قراءة الملف من الجهاز");
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt) await wait(1500 * attempt);
        try {
          const response = await fetch(path, { method: "POST", credentials: "include", headers: { "content-type": "application/octet-stream" }, body });
          if ([429, 502, 503, 504].includes(response.status) && attempt < 2) { last = `HTTP ${response.status}`; continue; }
          return { response, data: await response.json().catch(() => ({} as any)), attempts: attempt + 1 };
        } catch (e: any) { last = `${e?.name || "خطأ"}: ${e?.message || ""}`.trim(); }
      }
      throw new Error(last || "انقطع الاتصال");
    };
    /* 1) القراءة */
    const infos: Array<{ index: number; program: string; department: string; year: number; isNew: boolean } | null> = [];
    const othersOf: Array<Array<[string, string, number, number]>> = [];
    for (let index = 0; index < files.length; index += 1) {
      try {
        const { response, data } = await post("/api/plan-review/sheet/scan", files[index]);
        if (response.ok && data.readable) {
          infos.push({ index, program: data.program, department: data.department, year: Number(data.year) || 0, isNew: Boolean(data.isNew) });
          if (data.isNew && Array.isArray(data.others)) othersOf.push(data.others);
          Object.assign(rows[index], { program: data.program, programName: data.programName, year: data.year, era: data.isNew ? "new" : "old" });
        } else { infos.push(null); rows[index] = { ...rows[index], status: "unreadable", reason: "الملف غير مقروء" }; state.failed += 1; }
      } catch (e: any) { infos.push(null); rows[index] = { ...rows[index], status: "unreadable", reason: "تعذّر الرفع", detail: String(e?.message || e) }; state.failed += 1; }
      state.done += 1; publish();
    }
    /* 2) القديمة المتكررة لبرنامجٍ واحد: الأحدث وحدها */
    const readable = infos.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const latestOld = new Map<string, number>();
    for (const item of readable) if (!item.isNew) latestOld.set(`${item.program}|${item.department}`, Math.max(latestOld.get(`${item.program}|${item.department}`) || 0, item.year));
    const queue = readable.filter(item => {
      if (item.isNew || item.year >= (latestOld.get(`${item.program}|${item.department}`) || 0)) return true;
      rows[item.index] = { ...rows[item.index], status: "skipped", reason: `أقدم من صحيفة ${latestOld.get(`${item.program}|${item.department}`)} لنفس البرنامج` };
      state.skipped += 1; return false;
    }).sort((x, y) => Number(y.isNew) - Number(x.isNew));
    /* 3) الرفع: الجديدة أولاً */
    state.phase = "upload"; state.done = 0; state.total = queue.length; publish();
    let last = { sectionId: 0, planId: "" };
    const accepted: number[] = [];
    for (const item of queue) {
      try {
        const began = performance.now();
        const { response, data, attempts } = await post(`/api/plan-review/sheet/import${qsOf?.(files[item.index]) || ""}`, files[item.index]);
        const timing = { ms: Math.round(performance.now() - began), http: response.status, attempts };
        if (response.ok) { accepted.push(item.index); state.ok += 1; last = { sectionId: Number(data.sectionId || 0), planId: String(data.planId || "") }; rows[item.index] = { ...rows[item.index], status: "ok", ...pick(data), ...timing, server: data }; }
        else { state.failed += 1; rows[item.index] = { ...rows[item.index], status: "rejected", reason: data.rejection?.kind === "department" ? "لا قسم بهذا الاسم أو الرمز" : (SHORT[data.rejection?.kind]?.title || data.error || "تعذّر"), detail: data.rejection?.message || `HTTP ${response.status}`, ...(data.rejection?.missing ? { missingDept: { name: String(data.rejection.departmentName || "").replace(/^قسم\s+/, ""), code: String(data.rejection.code || ""), sheetCollege: String(data.rejection.sheetCollege || ""), collegeCode: String(data.rejection.collegeCode || ""), colleges: Array.isArray(data.rejection.colleges) ? data.rejection.colleges : [] } } : {}), ...timing, server: data }; }
      } catch (e: any) { state.failed += 1; rows[item.index] = { ...rows[item.index], status: "rejected", reason: "تعذّر الرفع", detail: String(e?.message || e) }; }
      state.done += 1; publish();
    }
    /* مقررات الأقسام التي لا صحيفة لها (الخدمية): الأشيع بين الصحائف الجديدة، ولا أغلبية = تُذكر ولا تُمسّ */
    const { winners, ambiguous } = voteServiceCourses(othersOf);
    setServiceWinners(winners);
    /* تصحيح مقررات الأقسام الخدمية معطَّل مؤقتاً: يربطها بالقسم من رمزه، ورموز بعض الأقسام لا تطابق الصحائف. */
    const reconciled = 0;
    setReconcile({ updated: reconciled, ambiguous: ambiguous.sort() });
    /* 4) مرورٌ ثانٍ على ما قُبل: مسبقٌ لمقرر قسمٍ رُفع بعده يُربط الآن */
    state.phase = "prereq"; state.done = 0; state.total = accepted.length; publish();
    for (const index of accepted) {
      try { const { response, data } = await post(`/api/plan-review/sheet/import${qsOf?.(files[index]) || ""}`, files[index]); if (response.ok) { const again = pick(data); rows[index] = { ...rows[index], prereqLinked: again.prereqLinked, prereqPrinted: again.prereqPrinted, unresolved: again.unresolved, differsOther: again.differsOther, noDepartment: again.noDepartment }; } } catch { /* المرور الأول كفى */ }
      state.done += 1; publish();
    }
    for (const index of accepted) { state.prereqLinked += rows[index].prereqLinked || 0; state.prereqPrinted += rows[index].prereqPrinted || 0; }
    /* لقطةُ حال النظام بعد الرفع تُرفق بالتقرير: ما في كل قسمٍ من مقرراتٍ وصحائف. */
    try { const response = await fetch("/api/plan-review/sheet/audit", { credentials: "include" }); snapshot.current = response.ok ? await response.json() : { error: `HTTP ${response.status}` }; } catch (e: any) { snapshot.current = { error: String(e?.message || e) }; }
    state.phase = "done"; publish();
    const stillMissing = rows.map((row, index) => (row.missingDept && files[index] ? { file: files[index], dept: row.missingDept } : null)).filter((item): item is { file: File; dept: MissingDept } => Boolean(item));
    setPending(current => (merge ? [...current.filter(item => !files.includes(item.file)), ...stillMissing] : stillMissing));
    setBusy(false);
    if (state.ok && last.sectionId) onDone(last.sectionId, last.planId);
  };

  /* تقريرُ الدفعة (ملفٌ يُنزَّل) للمراجعة: لكل ملفٍ ما دخل وأين وما رُفض ولماذا. */
  const downloadReport = () => {
    if (!batch) return;
    const text = JSON.stringify({ generatedAt: new Date().toISOString(), summary: { ok: batch.ok, skipped: batch.skipped, failed: batch.failed, prereqLinked: batch.prereqLinked, prereqPrinted: batch.prereqPrinted, missingDepartments: missingDepartments(batch.rows), client: { userAgent: navigator.userAgent, online: navigator.onLine, page: location.origin }, otherDepartmentCoursesCorrected: reconcile?.updated || 0, otherDepartmentCoursesNoMajority: reconcile?.ambiguous || [] }, files: batch.rows, system: snapshot.current }, null, 1);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "تقرير-رفع-الصحف.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ملفاتٌ سقطت بانقطاعٍ عابر (لا برفضٍ من النظام): تُعاد وحدها. */
  const transientFailed = () => (batch?.rows || []).map((row, index) => (row.status === "unreadable" || (row.status === "rejected" && row.reason === "تعذّر الرفع") ? batchFiles.current[index] : null)).filter((file): file is File => Boolean(file));

  /* صحائفُ قسمٍ لا وجود له: لكل قسمٍ موافقةٌ منفصلة، ثم تُعاد صحائفه وحدها بإنشائه. */
  const missingFiles = () => pending;
  const missingDepts = (): MissingDept[] => {
    const seen = new Map<string, MissingDept>();
    for (const item of pending) if (!seen.has(item.dept.name)) seen.set(item.dept.name, item.dept);
    return [...seen.values()];
  };
  type Compare = { sheetCourses: number; systemCourses: number; sameNumber: number; sameNumberAndName: number; sameNameOtherNumber: number; similar: boolean; differ: Array<{ number: string; sheet: string; system: string }>; sheetOnly: number; systemOnly: Array<{ number: string; name: string }> } | { error: string };
  const [compared, setCompared] = useState<Record<string, Compare>>({});
  /* هل مقررات القسم المختار تشبه صحيفة القسم الناقص؟ قراءةٌ فحسب قبل المطابقة. */
  const compareWith = async (deptName: string, sectionId: number) => {
    const item = missingFiles().find(entry => entry.dept.name === deptName);
    if (!item) return;
    try {
      const response = await fetch(`/api/plan-review/sheet/compare?sectionId=${sectionId}`, { method: "POST", credentials: "include", headers: { "content-type": "application/octet-stream" }, body: await item.file.arrayBuffer() });
      const data = await response.json().catch(() => ({}));
      setCompared(current => ({ ...current, [deptName]: response.ok ? data : { error: String(data.error || "تعذّرت المقارنة") } }));
    } catch (e: any) { setCompared(current => ({ ...current, [deptName]: { error: String(e?.message || "تعذّرت المقارنة") } })); }
  };
  const [choices, setChoices] = useState<Record<string, string>>({});
  /* لكل قسمٍ ناقص اختيار: إنشاؤه، أو مطابقته بقسمٍ موجود (يُصحَّح اسمه ورمزه من الصحيفة) ثم تُعاد صحائفه وحدها. */
  /* لكل قسمٍ ناقص قرارُه وزرُّه: إنشاؤه في كليةٍ يختارها، أو إنشاء كليته إن لم توجد، أو مطابقته بقسمٍ موجود. لا شيء «للجميع». */
  const choiceOf = (dept: MissingDept) => choices[dept.name] ?? ((dept.colleges?.length || 0) === 1 ? `c:${dept.colleges?.[0].id}` : (dept.colleges?.length || 0) === 0 ? "college" : "");
  const applyOne = (dept: MissingDept) => {
    const choice = choiceOf(dept), items = pending.filter(item => item.dept.name === dept.name);
    if (!choice || !items.length || busy) return;
    const qs = choice === "college" ? "?createCollege=1" : choice.startsWith("c:") ? `?createMissing=1&collegeId=${Number(choice.slice(2))}` : `?sectionId=${Number(choice)}&force=1`;
    void uploadAll(items.map(item => item.file), () => qs, batch?.rows);
  };

  const short = rejection ? SHORT[rejection.kind] : undefined;
  return (
    <section className="pr-import pr-sheet">
      <div className="pr-import-head">
        <div><b>رفع الخطة الدراسية</b><small>ملف PDF أو أكثر من SWRCAPP · كلُّ صحيفة تذهب إلى قسمها</small></div>
        <div className="pr-import-actions">
          <label className={`btn btn-primary${busy ? " is-busy" : ""}`} data-guide-ignore="رفع كل الصحائف دفعة واحدة داخل شاشة مراجعة الصحيفة">
            <FileUp aria-hidden="true" size={16} /> {busy ? "جارٍ القراءة…" : "ارفع الصحائف"}
            <input type="file" accept="application/pdf,.pdf" multiple hidden disabled={busy} aria-label="كل الخطط الدراسية PDF دفعة واحدة" onChange={e => { void uploadAll([...(e.target.files || [])].slice(0, 120)); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      {error ? <p className="section-plan-warning" role="alert"><AlertTriangle aria-hidden="true" /> {error}</p> : null}
      {rejection ? (
        <div className="section-plan-reject" role="alert" aria-label={rejection.message}>
          <div className="section-plan-reject-head">
            <AlertTriangle aria-hidden="true" />
            <strong>رُفضت الصحيفة</strong>
            <span className="section-plan-reject-tag">لم يُكتب شيء</span>
            <button type="button" className="student-qr-close" onClick={() => setRejection(null)} aria-label="إغلاق رسالة الرفض" data-guide-ignore="إغلاق رسالة الرفض داخل شاشة مراجعة الصحيفة"><X aria-hidden="true" /></button>
          </div>
          {rejection.kind === "department" ? <p className="section-plan-reject-short" aria-hidden="true"><GraduationCap /> <b>القسم لا يطابق الصحيفة</b> <span>· اسماً ورمزاً</span></p>
            : short ? <p className="section-plan-reject-short" aria-hidden="true"><short.icon /> <b>{short.title}</b> <span>· {short.hint}</span></p>
              : <p className="section-plan-reject-short">{rejection.message}</p>}
          {rejection.kind === "department" && lastFile.current ? (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void upload(lastFile.current || undefined, true)} data-guide-ignore="رفع الصحيفة على القسم المختار صراحةً رغم اختلاف اسمه ورمزه داخل شاشة مراجعة الصحيفة">
              <FileUp aria-hidden="true" size={16} /> ارفعها على هذا القسم رغم الاختلاف
            </button>
          ) : null}
        </div>
      ) : null}
      {batch ? (
        <div className="pr-sheet-result" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span title="دخلت"><Plus aria-hidden="true" /> {batch.ok}</span>
          <span title="لم تدخل"><X aria-hidden="true" /> {batch.failed}</span>
          {batch.skipped ? <span title="قديمةٌ أقدمُ من أحدث لبرنامجها: تُركت"><History aria-hidden="true" /> {batch.skipped}</span> : null}
          {batch.phase === "done" && batch.prereqPrinted ? <span title="مسبقات مربوطة من المطبوعة؛ الباقي نصيحةُ PEN أو مقرراتُ أقسامٍ لم تُرفع صحائفها"><Link2 aria-hidden="true" /> {batch.prereqLinked}/{batch.prereqPrinted}</span> : null}
          <small>{batch.phase === "done" ? "تم" : `${batch.phase === "read" ? "قراءة" : batch.phase === "upload" ? "رفع" : "المسبقات"} · ${batch.done} / ${batch.total}`}</small>
          {batch.phase === "done" && !busy && transientFailed().length ? <button type="button" className="btn btn-secondary" onClick={() => { const again = transientFailed(); void uploadAll(again); }} data-guide-ignore="إعادة رفع الملفات التي انقطع رفعها داخل شاشة مراجعة الصحيفة"><History aria-hidden="true" size={16} /> أعد {transientFailed().length} فاشلة</button> : null}
          {batch.phase === "done" ? <button type="button" className="btn btn-secondary" onClick={downloadReport} data-guide-ignore="تنزيل تقرير رفع الصحائف للمراجعة داخل شاشة مراجعة الصحيفة"><Download aria-hidden="true" size={16} /> تقرير المراجعة</button> : null}
          {batch.rows.some(row => row.status !== "ok" && row.status !== "skipped") ? <ul>{batch.rows.filter(row => row.status !== "ok" && row.status !== "skipped").map((row, index) => <li key={index}><b>{row.file.replace(/\.pdf$/i, "")}</b> · {row.reason}</li>)}</ul> : null}
        </div>
      ) : null}
      {batch?.phase === "done" && !busy && missingFiles().length ? (
        <div className="pr-sheet-result pr-sheet-missing" role="group" aria-label="أقسامٌ ناقصة">
          <ul>
            {missingDepts().map(dept => (
              <li key={dept.name}>
                <b>{dept.name}</b> <small>رمز {dept.code}{dept.sheetCollege ? ` · ${dept.sheetCollege}` : ""}</small>
                <select aria-label={`قرار قسم ${dept.name}`} value={choiceOf(dept)} onChange={e => setChoices(current => ({ ...current, [dept.name]: e.target.value }))}>
                  {(dept.colleges?.length || 0) > 1 ? <option value="">اختر…</option> : null}
                  {(dept.colleges || []).map(college => <option key={college.id} value={`c:${college.id}`}>إنشاء القسم في {college.name}</option>)}
                  {!(dept.colleges?.length) ? <option value="college">إنشاء كلية «{dept.sheetCollege || dept.collegeCode}» ثم القسم</option> : null}
                  {targets.map(item => <option key={item.sectionId} value={item.sectionId}>هو {item.label}</option>)}
                </select>
                {choiceOf(dept) && /^\d+$/.test(choiceOf(dept)) ? <button type="button" className="btn btn-secondary" onClick={() => void compareWith(dept.name, Number(choiceOf(dept)))} data-guide-ignore="مقارنة مقررات القسم المختار بصحيفة القسم الناقص قبل المطابقة داخل شاشة مراجعة الصحيفة"><SearchX aria-hidden="true" size={16} /> قارن مقرراته</button> : null}
                <button type="button" className="btn btn-primary" disabled={!choiceOf(dept)} onClick={() => applyOne(dept)} data-guide-ignore="تنفيذ قرار هذا القسم وحده (إنشاؤه أو إنشاء كليته أو مطابقته) ثم رفع صحائفه داخل شاشة مراجعة الصحيفة"><Plus aria-hidden="true" size={16} /> نفّذ</button>
                {compared[dept.name] ? ("error" in compared[dept.name] ? <small role="alert">{(compared[dept.name] as { error: string }).error}</small> : (() => { const c = compared[dept.name] as Exclude<Compare, { error: string }>; return (
                  <small className="pr-compare" role="status">
                    <b>{c.similar ? "يتشابهان" : "مختلفان"}</b> · الصحيفة {countOf(c.sheetCourses, AR.course)}، والقسم {countOf(c.systemCourses, AR.course)} · نفس الرقم {c.sameNumber} (منها نفس الاسم {c.sameNumberAndName}) · نفس الاسم برقمٍ آخر {c.sameNameOtherNumber} · ناقص في القسم {c.sheetOnly}
                    {c.differ.length ? <ul>{c.differ.map(row => <li key={row.number}>{row.number}: «{row.sheet}» ↔ «{row.system}»</li>)}</ul> : null}
                  </small>); })()) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {workingNote}
      {/* أدواتُ ترتيب البيانات بعد الرفع (الدخيلة، الحسابات، المكررة، الخدمية، إنهاء السابقة): تُستعمل مرةً كل حين، فتبقى مطويّة. */}
      <details className="pr-tools">
        <summary>أدوات الصيانة</summary>
      <div className="pr-sheet-result pr-sheet-single" role="group" aria-label="رفع صحيفة على قسم محدد">
        <select aria-label="قسم الصحيفة" value={chosen} disabled={busy} onChange={e => { setChosen(Number(e.target.value)); setRejection(null); setOutcome(null); }}>
          {targets.map(item => <option key={item.sectionId} value={item.sectionId}>{item.label}{item.sites > 1 ? ` (${countOf(item.sites, AR.site)})` : ""}</option>)}
        </select>
        <label className={`btn btn-primary${busy ? " is-busy" : ""}`}>
          <FileUp aria-hidden="true" size={16} /> {busy ? "جارٍ القراءة…" : "ارفع الصحيفة"}
          <input type="file" accept="application/pdf,.pdf" hidden disabled={busy || !chosen} aria-label="الخطة الدراسية PDF" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      <div className="pr-sheet-result pr-sheet-foreign" role="group" aria-label="المقررات الدخيلة">
        <button type="button" className="btn btn-secondary" disabled={Boolean(working)} onClick={() => void run("جارٍ فحص المقررات الدخيلة", scanForeign)} data-guide-ignore="فحص المقررات الدخيلة (نسخٌ لمقررات أقسامٍ أخرى بلا صحيفةٍ ولا جدول) داخل شاشة مراجعة الصحيفة"><SearchX aria-hidden="true" size={16} /> افحص المقررات الدخيلة</button>
        {foreignMsg ? <small role="status">{foreignMsg}</small> : null}
        {foreign ? (foreign.total ? (
          <>
            <ul>
              {foreign.sections.map(row => (
                <li key={row.sectionId}><b>{row.section}</b> <small>{countOf(row.courses.length, AR.course)}</small>
                  <button type="button" className="btn btn-secondary" onClick={() => setForeignOff(current => { const next = new Set(current); const all = row.courses.every(course => !next.has(course.id)); for (const course of row.courses) { if (all) next.add(course.id); else next.delete(course.id); } return next; })} data-guide-ignore="تحديد كل مقررات هذا القسم أو إلغاء تحديدها داخل شاشة مراجعة الصحيفة">حدّد الكل / ألغِ</button>
                  <ul>{row.courses.map(course => (
                    <li key={course.id}><label><input type="checkbox" checked={!foreignOff.has(course.id)} onChange={() => setForeignOff(current => { const next = new Set(current); if (next.has(course.id)) next.delete(course.id); else next.add(course.id); return next; })} data-guide-ignore="اختيار مقررٍ دخيلٍ للحذف داخل شاشة مراجعة الصحيفة" /> {course.code} {course.name} <small>{course.kind === "orphan" ? "← بلا نسخة في قسمٍ آخر (من وحدةٍ قديمة)" : course.kind === "name" ? `← بالاسم فقط في ${course.ownerSection}` : `← أصله في ${course.ownerSection}`}</small></label></li>
                  ))}</ul>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-primary" disabled={Boolean(working)} onClick={() => void run("جارٍ حذف المقررات المختارة", deleteForeign)} data-guide-ignore="حذف المقررات الدخيلة المختارة نهائياً داخل شاشة مراجعة الصحيفة"><Trash2 aria-hidden="true" size={16} /> احذف المختار</button>
          </>
        ) : <small role="status">لا مقررات دخيلة</small>) : null}
      </div>
      <div className="pr-sheet-result pr-sheet-accounts" role="group" aria-label="حسابات الأقسام">
        <button type="button" className="btn btn-secondary" disabled={Boolean(working)} onClick={() => void run("جارٍ معاينة الحسابات", previewAccounts)} data-guide-ignore="معاينة الأقسام التي ينقصها حساب رئيس قسم أو رئيس جدول أو مرشد داخل شاشة مراجعة الصحيفة"><UserPlus aria-hidden="true" size={16} /> معاينة حسابات الأقسام الناقصة</button>
        {accountsMsg ? <small role="status">{accountsMsg}</small> : null}
        {accounts ? (accounts.rows.length ? (
          <>
            <ul>
              {accounts.rows.map(row => (
                <li key={row.sectionId}>
                  <label><input type="checkbox" checked={accountsOn.has(row.sectionId)} onChange={() => setAccountsOn(current => { const next = new Set(current); if (next.has(row.sectionId)) next.delete(row.sectionId); else next.add(row.sectionId); return next; })} data-guide-ignore="اختيار قسمٍ لإنشاء حساباته الناقصة داخل شاشة مراجعة الصحيفة" /> <b>{row.section}</b> <small>{row.college}</small></label>
                  <small>ناقص: {row.missing.map(item => `${item.label} ← ${item.login}`).join(" · ")}{row.existing.length ? ` — موجود: ${row.existing.map(item => item.label).join("، ")}` : ""}</small>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-secondary" onClick={() => setAccountsOn(current => current.size === accounts.rows.length ? new Set() : new Set(accounts.rows.map(row => row.sectionId)))} data-guide-ignore="تحديد كل الأقسام أو إلغاء التحديد داخل شاشة مراجعة الصحيفة">حدّد الكل / ألغِ</button>
            <button type="button" className="btn btn-primary" disabled={!accountsOn.size || Boolean(working)} onClick={() => void run("جارٍ إنشاء الحسابات", createAccounts)} data-guide-ignore="إنشاء الحسابات الناقصة للأقسام المحدّدة بكلمة السر الافتراضية داخل شاشة مراجعة الصحيفة"><Plus aria-hidden="true" size={16} /> أنشئ المحدّد</button>
          </>
        ) : <small role="status">كل الأقسام لها حساباتها</small>) : null}
      </div>
      <DuplicateCoursesPanel />
      <SpellingTwinsMerge />
      <ServiceCoursesPanel targets={targets} winners={serviceWinners} onWinners={setServiceWinners} />
        {tools}
      </details>
      <div className="pr-sheet-result pr-sheet-approval" role="group" aria-label="اعتماد الصحائف">
        <button type="button" className="btn btn-secondary" disabled={Boolean(working)} onClick={() => void run("جارٍ معاينة الاعتماد", previewApproval)} data-guide-ignore="معاينة الصحائف الجاهزة للاعتماد وما فيه حاجز داخل شاشة مراجعة الصحيفة"><CheckCircle2 aria-hidden="true" size={16} /> معاينة اعتماد كل الصحف</button>
        {approvalMsg ? <small role="status">{approvalMsg}</small> : null}
        {approval ? (
          <>
            <small role="status">جاهزة: {approval.ready.length} · فيها حاجز: {approval.blocked.length}</small>
            {approval.blocked.length ? <ul>{approval.blocked.map(item => <li key={item.planId}><b>{item.section}</b> <small>{item.plan} — {item.reason}</small></li>)}</ul> : null}
            <button type="button" className="btn btn-primary" disabled={!approval.ready.length || Boolean(working)} onClick={() => void run("جارٍ اعتماد الصحائف", approveAll)} data-guide-ignore="اعتماد كل الصحائف الجاهزة التي لا حاجز فيها داخل شاشة مراجعة الصحيفة"><CheckCircle2 aria-hidden="true" size={16} /> اعتمد الجاهزة ({approval.ready.length})</button>
          </>
        ) : null}
      </div>
      {outcome ? (
        <div className="pr-sheet-result" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span title="مقررات جديدة"><Plus aria-hidden="true" /> {outcome.created}</span>
          <span title="مقررات صُحّحت"><PencilLine aria-hidden="true" /> {outcome.updated}</span>
          <span title="رُبطت بالصحيفة"><Link2 aria-hidden="true" /> {outcome.linked}</span>
          <span title={outcome.prereqLinked < outcome.prereqPrinted ? "مسبقات مربوطة من المطبوعة؛ الباقي نصيحةُ PEN أو مقررُ قسمٍ لم تُرفع صحيفته بعد (يُربط عند الرفع التالي)" : "كل المسبقات المطبوعة مربوطة"}><Link2 aria-hidden="true" /> {outcome.prereqLinked}/{outcome.prereqPrinted}</span>
          <small>{outcome.planName} · بانتظار اعتماد القسم{outcome.sites > 1 ? ` · ${countOf(outcome.sites, AR.site)}` : ""}</small>
        </div>
      ) : null}
    </section>
  );
}
