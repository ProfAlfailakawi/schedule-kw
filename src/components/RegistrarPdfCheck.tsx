/**
 * ── افحص جدول التسجيل ────────────────────────────────────────────────────────
 *
 * يعيد التسجيلُ الجدولَ بملف PDF ليراجعه القسم. يرفع القسمُ الملف هنا فيرى
 * **الفروق وحدها**: ما أرسلناه ولم يُنفَّذ، وما عدّلناه بعد آخر إرسال، وما يخالف
 * جدولنا، وما لا يُحكم فيه بيقين. والمطابقُ سطرٌ واحد بعدده — لا الجدول كله.
 *
 * الفحصُ قراءةٌ محضة (readOnly=1 ثم المقارنة). وبعده خطوةٌ تلقائية واحدة تكتب: مطابقةُ رقم
 * الشعبة ومرجعيّها بما طبعه التسجيل (registrar-numbering، بنسخةٍ للتراجع)، ثم يُعاد الفحص.
 * وما سواها فعلان صريحان وحدهما:
 * «احفظ طلب التعديل» (يصير طلباً مؤرَّخاً تحت «تغييرات الجدول» يصل التسجيل)،
 * والتحققُ الذاتي من بنودٍ شطبها التسجيل قبلُ (يجري بعد الفحص بطريقٍ مستقلّ).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Clock3, Eye, FileSearch, FileText, Hourglass, Info, MapPin, RefreshCw, Save, ScanLine, Send, ShieldCheck, UploadCloud, UserRound, X,
} from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { interruptedImportMessage } from "../utils/importStreamFailure";
import { looksForeign, slimPdfRow, type FieldDelta, type FindingGroup, type RegistrarCheckResult, type RegistrarFinding } from "../utils/registrarCheck";
import { PrimaryButton, SecondaryButton } from "./ui";
import CourseTags from "./CourseTags";
import { NumberingReviewCards, numberingReviewCount, RegistrarNumberingLine, type NumberingOutcome } from "./RegistrarNumbering";

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  /** يفتح موعداً من جدول القسم (الجدول كامل مع تمييز الصف). */
  onOpenAppointment?: (scheduleId: number) => void;
  onClose: () => void;
}

interface ReadNotes {
  fileName: string;
  pages: number;
  scanned: boolean;
  unreadable: string[];
}

type Phase =
  | { kind: "idle" }
  | { kind: "reading"; pct: number; message: string; fileName: string }
  | { kind: "comparing"; fileName: string }
  | { kind: "done"; result: RegistrarCheckResult; notes: ReadNotes; rows: any[]; numbering: NumberingOutcome | null }
  | { kind: "failed"; message: string };

const MAX_BYTES = 24 * 1024 * 1024;

type DiffGroup = Exclude<FindingGroup, "matched">;
const GROUPS: Array<{ group: DiffGroup; title: string; hint: string; icon: React.ReactNode }> = [
  { group: "notApplied", title: "أرسلناه ولم يُنفَّذ", hint: "في ما أرسلتموه، وملفُّهم ما زال على القديم", icon: <Send aria-hidden="true" /> },
  { group: "notSent", title: "تعديل جديد لم يُرسل بعد", hint: "عدّلتموه بعد آخر إرسال، فلم يصلهم بعد", icon: <Hourglass aria-hidden="true" /> },
  { group: "mismatch", title: "يخالف جدولكم", hint: "في ملفهم بغير ما عندكم، أو على طرفٍ واحد", icon: <AlertTriangle aria-hidden="true" /> },
  { group: "review", title: "تحتاج نظرك", hint: "لا أحكم فيه بيقين، فلا أخمّن", icon: <Eye aria-hidden="true" /> },
];

const KIND_TITLE: Record<string, string> = {
  fields: "", onlyPdf: "في ملفهم وليست عندكم", onlyOurs: "عندكم وغابت عن ملفهم", misplaced: "ظهرت بخطأ",
  notChanged: "", notAdded: "إضافةٌ لم تظهر", notRemoved: "حذفٌ لم يُنفَّذ",
  ambiguous: "التباس", unreadable: "قراءةٌ غير مؤكدة", fuzzy: "مطابقةٌ تقريبية", noKey: "صفٌّ لم تُحسم هويته", crnChanged: "رقمٌ مرجعيّ جديد",
};

const FIELD_ICON: Record<string, React.ReactNode> = {
  days: <CalendarDays aria-hidden="true" />, time: <Clock3 aria-hidden="true" />, room: <MapPin aria-hidden="true" />,
  instructor: <UserRound aria-hidden="true" />, course: <BookOpen aria-hidden="true" />,
};

/* ── قيمةٌ بخطّها: الأوقات والرموز لاتينيةٌ معزولة في سياق RTL ───────── */
const Value = ({ field, text }: { field: FieldDelta["field"]; text: string }) =>
  field === "time" || field === "room" || field === "section" ? <bdi dir="ltr">{text}</bdi> : <>{text}</>;

/** خانةٌ واحدة: عندهم ← المطلوب، بأيقونتها. */
function DeltaRow({ delta }: { key?: React.Key; delta: FieldDelta }) {
  return (
    <li className="rpc-delta">
      <span className="rpc-delta-field" title={delta.label}>{FIELD_ICON[delta.field] || null}<span>{delta.label}</span></span>
      <span className="rpc-delta-values">
        {/* شعبةٌ على طرفٍ واحد: الطرفُ الفارغ لا يُرسم، فتبقى القيمةُ وحدها. */}
        {delta.pdf !== "—" ? <span className={`rpc-chip ${delta.ours === "—" ? "rpc-chip-only" : "rpc-chip-pdf"}`}><small>عندهم</small><Value field={delta.field} text={delta.pdf} /></span> : null}
        {delta.pdf !== "—" && delta.ours !== "—" ? <ArrowLeft className="rpc-delta-arrow" aria-label="المطلوب" /> : null}
        {delta.ours !== "—" ? <span className="rpc-chip rpc-chip-ours"><small>المطلوب</small><Value field={delta.field} text={delta.ours} /></span> : null}
      </span>
    </li>
  );
}

function Card({ finding, onOpen }: { key?: React.Key; finding: RegistrarFinding; onOpen?: (id: number) => void }) {
  const title = KIND_TITLE[finding.kind] || "";
  return (
    <li className={`rpc-card rpc-card-${finding.group}`} data-kind={finding.kind}>
      <header>
        <div className="rpc-card-id">
          <strong>
            {finding.crn ? <span className="crn-chip" dir="ltr" title="الرقم المرجعي">{finding.crn}</span> : null}
            <bdi dir="ltr">{finding.courseCode || "—"}</bdi> {finding.courseName || "مقرر"} <CourseTags courseId={finding.courseId} />
          </strong>
          <small>
            {title ? <b>{title}</b> : null}
            {finding.section ? <span>ش<bdi dir="ltr">{finding.section}</bdi>{finding.pdfSection ? <> · عندهم <bdi dir="ltr">{finding.pdfSection}</bdi></> : null}</span> : null}
            {finding.page ? <span>ص<bdi dir="ltr">{finding.page}</bdi></span> : null}
          </small>
        </div>
        {finding.scheduleId && onOpen ? (
          <SecondaryButton type="button" className="rpc-open" aria-label="افتح الموعد في جدول القسم" data-guide-ignore="يفتح الموعد في جدول القسم للقراءة — لا يغيّر شيئاً" onClick={() => onOpen(finding.scheduleId as number)}>
            <MapPin aria-hidden="true" /> الموعد
          </SecondaryButton>
        ) : null}
      </header>
      {finding.fields.length ? <ul className="rpc-deltas">{finding.fields.map(delta => <DeltaRow key={delta.field} delta={delta} />)}</ul> : null}
      {finding.reason ? <p className="rpc-reason"><Info aria-hidden="true" />{finding.reason}</p> : null}
    </li>
  );
}

export default function RegistrarPdfCheck({ collegeId, sectionId, termId, onOpenAppointment, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<DiffGroup | null>(null);
  const [saving, setSaving] = useState<"idle" | "busy" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [verified, setVerified] = useState<{ confirmed: number; reopened: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const scopeRef = useRef(`${collegeId}:${sectionId}:${termId}`);

  /* تبدّل القسم أو الفصل يُسقط ما قُرئ: لا نتيجةُ قسمٍ فوق قسمٍ آخر. */
  useEffect(() => {
    const scope = `${collegeId}:${sectionId}:${termId}`;
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    abortRef.current?.abort();
    setPhase({ kind: "idle" });
  }, [collegeId, sectionId, termId]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { if (phase.kind === "done") resultRef.current?.focus({ preventScroll: false }); }, [phase.kind]);

  /* المقارنةُ وحدها: تُعاد بعد اعتماد ترقيم التسجيل أو التراجع عنه، بالصفوف المقروءة نفسها. */
  const compare = useCallback(async (rows: any[], signal?: AbortSignal): Promise<RegistrarCheckResult> => {
    const compared = await fetch("/api/schedules/registrar-check", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, rows }) });
    const body = await compared.json().catch(() => ({}));
    if (!compared.ok) throw new Error(String(body?.error || "تعذّر فحص الملف"));
    return body as RegistrarCheckResult;
  }, [collegeId, sectionId, termId]);
  /* مطابقة ترقيم التسجيل: خطوةٌ تلقائية بعد فحصٍ ناجح (تكتب رقم الشعبة والمرجعي وحدهما، بنسخةٍ للتراجع).
     تعذّرُها لا يُسقط الفحص: تبقى الفروق كما هي. */
  const align = useCallback(async (rows: any[], signal?: AbortSignal): Promise<NumberingOutcome | null> => {
    try {
      const response = await fetch("/api/schedules/registrar-numbering", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, rows }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return null;
      return { changed: Number(body.changed) || 0, undoVersionId: body.undoVersionId, locked: body.locked, skipped: Array.isArray(body.skipped) ? body.skipped : [], collisions: Array.isArray(body.collisions) ? body.collisions : [] };
    } catch (error: any) { if (error?.name === "AbortError") throw error; return null; }
  }, [collegeId, sectionId, termId]);
  /* بعد التراجع عن المطابقة: يُعاد الفحص وحده، بلا مطابقةٍ جديدة. */
  const undone = useCallback(async () => {
    if (phase.kind !== "done") return;
    const { rows, notes, numbering } = phase;
    try { const result = await compare(rows); setSaving("idle"); setPhase({ kind: "done", result, notes, rows, numbering: numbering ? { ...numbering, undone: true } : null }); }
    catch (error: any) { setPhase({ kind: "failed", message: String(error?.message || "تعذّر فحص الملف") }); }
  }, [phase, compare]);

  const readFile = useCallback(async (file: File) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { setPhase({ kind: "failed", message: "الملف ليس PDF. ارفع ملف الجدول الذي أعاده التسجيل بصيغة PDF." }); return; }
    if (file.size > MAX_BYTES) { setPhase({ kind: "failed", message: "حجم الملف أكبر من الحد المسموح (24 ميغابايت)." }); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFilter(null); setSaving("idle"); setSaveError(null); setVerified(null);
    setPhase({ kind: "reading", pct: 4, message: "يجهّز الملف للقراءة", fileName: file.name });
    try {
      const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId), readOnly: "1" });
      const response = await fetch(`/api/intelligence/pdf-import?${query}`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/octet-stream", Accept: "application/x-ndjson", "x-file-name": encodeURIComponent(file.name) },
        body: await file.arrayBuffer(),
      }).catch((error: any) => { if (error?.name === "AbortError") throw error; throw new Error(interruptedImportMessage(0)); });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "", data: any = null, failure: any = null;
      if (reader) for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut = buffer.indexOf("\n");
        while (cut >= 0) {
          const line = buffer.slice(0, cut).trim(); buffer = buffer.slice(cut + 1); cut = buffer.indexOf("\n");
          if (!line) continue;
          let event: any; try { event = JSON.parse(line); } catch { continue; }
          if (event.type === "progress") {
            const total = Math.max(Number(event.pages) || 0, 1), page = Math.max(0, Number(event.page) || 0), step = String(event.phase || "");
            const pct = step === "match" ? 97 : step === "rescue" ? Math.min(95, 84 + Math.round((page / total) * 11))
              : step === "read" ? Math.min(84, 16 + Math.round((page / total) * 68)) : step === "orient" ? 15 : step === "render" ? Math.min(14, 4 + Math.round((page / total) * 10)) : 4;
            setPhase({ kind: "reading", pct, message: String(event.message || "يقرأ الجدول من الملف"), fileName: file.name });
          } else if (event.type === "done") data = event.result;
          else if (event.type === "error") failure = event;
        }
      }
      if (failure) throw new Error(String(failure.error || "تعذّرت قراءة الملف"));
      if (!data) {
        const rest = buffer.trim();
        if (rest) { try { const tail = JSON.parse(rest); data = tail.result || tail; } catch { /* لا ذيل JSON */ } }
      }
      if (data?.error && !data.rows) throw new Error(String(data.error));
      if (!data) throw new Error(interruptedImportMessage(response.status));

      const rows: any[] = (Array.isArray(data.rows) ? data.rows : []).map(slimPdfRow);
      const notes: ReadNotes = {
        fileName: file.name, pages: Number(data.pages) || 0,
        scanned: rows.some(row => String(row?.sourceReadMode || "pdf-text") !== "pdf-text"),
        unreadable: [
          ...(data.legibility && data.legibility.readable === false && data.legibility.reason ? [String(data.legibility.reason)] : []),
          ...((Array.isArray(data.pageDiagnostics) ? data.pageDiagnostics : []).filter((page: any) => page?.suspicious).map((page: any) => `الصفحة ${page.page}: قراءتها مشكوكٌ فيها`)),
        ],
      };
      setPhase({ kind: "comparing", fileName: file.name });
      const payload = JSON.stringify({ collegeId, sectionId, termId, rows });
      if (!rows.length && !notes.unreadable.length) notes.unreadable.push(String(data.message || "لم أتمكن من استخراج شعب من الملف"));
      let result = await compare(rows, controller.signal);
      const numbering = rows.length && !result.empty && !looksForeign(result) ? await align(rows, controller.signal) : null;
      /* الفروقُ تُعرض بالأرقام بعد المطابقة. */
      if (numbering?.changed) result = await compare(rows, controller.signal);
      setPhase({ kind: "done", result, notes, rows, numbering });
      /* التحقق الذاتي: بنودٌ شطبها التسجيل في طلبٍ سابق تُقابَل بهذا الملف («تأكّد» أو تعود مفتوحة). */
      if (rows.length) {
        fetch("/api/schedules/registrar-requests/verify", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: payload })
          .then(res => (res.ok ? res.json() : null)).then(out => { if (out && (out.confirmed || out.reopened)) setVerified({ confirmed: Number(out.confirmed) || 0, reopened: Number(out.reopened) || 0 }); })
          .catch(() => { /* التحقق إضافة: تعذّرُه لا يُسقط الفحص */ });
      }
    } catch (error: any) {
      if (error?.name === "AbortError") return;
      setPhase({ kind: "failed", message: String(error?.message || "تعذّرت قراءة الملف") });
    }
  }, [collegeId, sectionId, termId, compare, align]);

  const pick = (files: FileList | null) => { const file = files?.[0]; if (file) void readFile(file); };
  const reset = () => { abortRef.current?.abort(); setPhase({ kind: "idle" }); setSaving("idle"); setSaveError(null); setVerified(null); if (inputRef.current) inputRef.current.value = ""; };

  const save = async () => {
    if (phase.kind !== "done") return;
    setSaving("busy"); setSaveError(null);
    try {
      const response = await fetch("/api/schedules/registrar-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, fileName: phase.notes.fileName, rows: phase.rows }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || "تعذّر حفظ الطلب"));
      setSaving("saved");
    } catch (error: any) { setSaving("idle"); setSaveError(String(error?.message || "تعذّر حفظ الطلب")); }
  };

  const skipped = useMemo(() => {
    if (phase.kind !== "done") return [] as Array<[string, number]>;
    const labels: Record<string, string> = { days: "الأيام", time: "الوقت", room: "القاعة", instructor: "الأستاذ" };
    return (Object.entries(phase.result.reading.notCompared || {}) as Array<[string, number]>).filter(([, n]) => n > 0).map(([key, n]) => [labels[key] || key, n] as [string, number]);
  }, [phase]);

  const grouped = useMemo(() => {
    if (phase.kind !== "done") return null;
    const by: Record<DiffGroup, RegistrarFinding[]> = { notApplied: [], notSent: [], mismatch: [], review: [] };
    for (const finding of phase.result.findings) if (finding.group !== "matched") by[finding.group].push(finding);
    return by;
  }, [phase]);
  const actionable = phase.kind === "done" ? phase.result.findings.some(item => item.action) : false;
  /* «تحتاج نظرك» يضمّ ما لم تُطابَق أرقامه مع التسجيل. */
  const numberingReview = phase.kind === "done" ? numberingReviewCount(phase.numbering) : 0;
  const countOfGroup = (group: DiffGroup) => (phase.kind === "done" ? phase.result.counts[group] + (group === "review" ? numberingReview : 0) : 0);
  const diffCount = phase.kind === "done" ? phase.result.counts.total - phase.result.counts.matched : 0;

  return (
    <section className="rpc" aria-labelledby="rpc-title" data-state={phase.kind}>
      <header className="rpc-head">
        <span className="rpc-head-icon" aria-hidden="true"><FileSearch /></span>
        <div>
          <h2 id="rpc-title">افحص جدول التسجيل</h2>
          <p><ShieldCheck aria-hidden="true" /> يقارن ولا يغيّر شيئاً إلا أرقام الشعب لتطابق التسجيل (مع تراجع)</p>
        </div>
        <button type="button" className="rpc-close" aria-label="إغلاق الفحص" data-guide-ignore="يغلق لوحة الفحص — لا يغيّر شيئاً" onClick={() => { abortRef.current?.abort(); onClose(); }}><X aria-hidden="true" /></button>
      </header>

      {phase.kind === "idle" || phase.kind === "failed" ? (
        <>
          {phase.kind === "failed" ? <p className="rpc-alert" data-tone="error" role="alert"><AlertTriangle aria-hidden="true" />{phase.message}</p> : null}
          <div
            className="rpc-drop" data-over={dragging || undefined}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files); }}
          >
            <UploadCloud aria-hidden="true" />
            <strong>اسحب هنا ملف PDF الذي أعاده التسجيل</strong>
            <span>أو</span>
            <label className="btn btn-primary rpc-pick">
              <FileText aria-hidden="true" /> اختر الملف
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => pick(event.target.files)} />
            </label>
            <small>يُقرأ في الذاكرة ولا يُحفظ الملف</small>
          </div>
        </>
      ) : null}

      {phase.kind === "reading" || phase.kind === "comparing" ? (
        <div className="rpc-progress" role="status" aria-live="polite">
          <div className="rpc-progress-file"><FileText aria-hidden="true" /><bdi dir="auto">{phase.fileName}</bdi></div>
          <div className="rpc-bar" role="progressbar" aria-label="تقدّم قراءة الملف" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.kind === "reading" ? phase.pct : 99}>
            <span style={{ inlineSize: `${phase.kind === "reading" ? phase.pct : 99}%` }} />
          </div>
          <p>{phase.kind === "reading" ? phase.message : "يقارن بجدولكم وبآخر ما أُرسل"}</p>
          <SecondaryButton type="button" data-guide-ignore="يوقف قراءة الملف — لا يغيّر شيئاً" onClick={reset}>إيقاف</SecondaryButton>
        </div>
      ) : null}

      {phase.kind === "done" && grouped ? (
        <div className="rpc-result" ref={resultRef} tabIndex={-1} aria-label="فروق جدول التسجيل">
          <div className="rpc-summary">
            <p className="rpc-file"><FileText aria-hidden="true" /><bdi dir="auto">{phase.notes.fileName}</bdi><span>{phase.notes.pages ? countOf(phase.notes.pages, AR.page) : ""}</span></p>
            <p className="rpc-headline">
              {diffCount ? <strong>{countOf(diffCount, AR.difference)}</strong> : <strong>لا فروق</strong>}
              <span className="rpc-matched-line"><CheckCircle2 aria-hidden="true" />{countOf(phase.result.counts.matched, AR.section)} مطابقة من <bdi dir="ltr">{phase.result.counts.total}</bdi></span>
            </p>
            <div className="rpc-chips" role="group" aria-label="تصفية الفروق">
              {GROUPS.map(({ group, title, icon }) => {
                const count = countOfGroup(group);
                if (!count) return null;
                return (
                  <button
                    key={group} type="button" className={`rpc-count rpc-count-${group}`} data-active={filter === group || undefined} aria-pressed={filter === group}
                    data-guide-ignore="تصفية الفروق المعروضة — لا يغيّر شيئاً" onClick={() => setFilter(filter === group ? null : group)}
                  >
                    {icon}<b><bdi dir="ltr">{count}</bdi></b><span>{title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {looksForeign(phase.result) ? (
            <p className="rpc-alert" data-tone="error" role="alert">
              <AlertTriangle aria-hidden="true" />
              الملف لا يطابق أي شعبة في جدولكم؛ تأكّد أنه ملف قسمكم وفصلكم.
            </p>
          ) : null}

          {phase.result.empty ? (
            <p className="rpc-alert" data-tone="warning" role="status">
              <AlertTriangle aria-hidden="true" />
              {phase.result.empty === "pdfEmpty" ? "لم أستطع قراءة أي شعبة من الملف، فلا مقارنة." : phase.result.empty === "liveEmpty" ? "لا مواعيد في جدولكم لهذا الفصل، فلا مقارنة." : "لا شعب في الملف ولا في جدولكم."}
            </p>
          ) : null}

          {verified ? (
            <p className="rpc-alert" data-tone={verified.reopened ? "warning" : "ok"} role="status">
              <ShieldCheck aria-hidden="true" />
              {verified.confirmed ? `${countOf(verified.confirmed, AR.item)} شطبها التسجيل وتأكّدت من هذا الملف.` : ""}
              {verified.confirmed && verified.reopened ? " " : ""}
              {verified.reopened ? `${countOf(verified.reopened, AR.item)} شُطبت ولم تظهر في الملف، فعادت مفتوحة.` : ""}
            </p>
          ) : null}

          {(phase.notes.scanned || phase.notes.unreadable.length || phase.result.reading.uncertainRows || phase.result.reading.outOfScopeRows || !phase.result.baseline.available || skipped.length) ? (
            <ul className="rpc-notes" aria-label="ملاحظات القراءة">
              {phase.notes.scanned ? <li><ScanLine aria-hidden="true" />الملف صورةٌ ممسوحة؛ ما لم يُقرأ بيقين وُضع في «تحتاج نظرك».</li> : null}
              {phase.notes.unreadable.map(text => <li key={text}><AlertTriangle aria-hidden="true" />{text}</li>)}
              {phase.result.reading.uncertainRows ? <li><Eye aria-hidden="true" />{countOf(phase.result.reading.uncertainRows, AR.cell)} لم تُقرأ بيقين.</li> : null}
              {skipped.length ? <li><Info aria-hidden="true" />لم تُقارَن: {skipped.map(([label, n], index) => <React.Fragment key={label}>{index ? " · " : ""}{label} ({countOf(n, AR.section)})</React.Fragment>)} — لم يطبعها الملف.</li> : null}
              {phase.result.reading.outOfScopeRows ? <li><Info aria-hidden="true" />{countOf(phase.result.reading.outOfScopeRows, AR.row)} تخصّ موقعاً آخر من الفرع، فاستُبعدت.</li> : null}
              {!phase.result.baseline.available ? <li><Info aria-hidden="true" />لا نسخةَ أُرسلت من قبل، فلا حكمَ على «لم يُنفَّذ» و«لم يُرسل بعد».</li> : null}
            </ul>
          ) : null}

          {!phase.result.empty && phase.result.counts.total > 0 && !diffCount ? (
            <div className="rpc-allgood" role="status"><CheckCircle2 aria-hidden="true" /><strong>الجدول مطابق تماماً</strong><span>كل ما في ملفهم كما في جدولكم.</span></div>
          ) : null}

          {phase.numbering ? <RegistrarNumberingLine outcome={phase.numbering} onUndone={() => void undone()} /> : null}

          {GROUPS.filter(({ group }) => countOfGroup(group) && (!filter || filter === group)).map(({ group, title, hint, icon }) => (
            <section key={group} className={`rpc-group rpc-group-${group}`} aria-labelledby={`rpc-g-${group}`}>
              <header>
                <span className="rpc-group-icon" aria-hidden="true">{icon}</span>
                <div><h3 id={`rpc-g-${group}`}>{title} <bdi dir="ltr">({countOfGroup(group)})</bdi></h3><small>{hint}</small></div>
              </header>
              <ul className="rpc-cards">
                {grouped[group].map(item => <Card key={item.id} finding={item} onOpen={onOpenAppointment} />)}
                {group === "review" && phase.numbering ? <NumberingReviewCards outcome={phase.numbering} /> : null}
              </ul>
            </section>
          ))}

          {saveError ? <p className="rpc-alert" data-tone="error" role="alert"><AlertTriangle aria-hidden="true" />{saveError}</p> : null}
          {saving === "saved" ? <p className="rpc-alert" data-tone="ok" role="status"><CheckCircle2 aria-hidden="true" />حُفظ الطلب في «تغييرات الجدول»، ويراه التسجيل في وارده.</p> : null}
          <footer className="rpc-foot">
            {actionable && !phase.result.empty && !looksForeign(phase.result) ? (
              <PrimaryButton type="button" disabled={saving !== "idle"} data-guide-ignore="يحفظ طلب التعديل للتسجيل تحت «تغييرات الجدول» — فعلٌ صريح لصاحب الجدول، والفحص نفسه لا يكتب" onClick={() => void save()}>
                <Save aria-hidden="true" /> {saving === "saved" ? "حُفظ الطلب" : saving === "busy" ? "يحفظ…" : "احفظ طلب التعديل"}
              </PrimaryButton>
            ) : null}
            <SecondaryButton type="button" data-guide-ignore="يفتح اختيار ملفٍّ آخر للفحص — لا يغيّر شيئاً" onClick={reset}><RefreshCw aria-hidden="true" /> افحص ملفاً آخر</SecondaryButton>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
