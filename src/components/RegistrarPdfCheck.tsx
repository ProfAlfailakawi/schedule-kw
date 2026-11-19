/**
 * ── افحص جدول التسجيل ────────────────────────────────────────────────────────
 *
 * يعيد التسجيلُ الجدولَ بملف PDF ليراجعه القسم. يرفع القسمُ الملف هنا فيقول له
 * النظام في نظرةٍ واحدة: ما طابق، وما فيه خلل، وما عدّلناه بعد آخر إرسال ولم
 * يُنفَّذ، وما لا يستطيع الحكم فيه بيقين.
 *
 * قراءةٌ محضة: الملف يُقرأ في ذاكرة الخادم بالقارئ نفسه (readOnly=1)، وصفوفُه
 * تُقارَن بالجدول الحيّ ثم تُعرض. لا شيء يُكتب في الجدول ولا في أيّ سجلّ، ولا
 * زرَّ هنا يغيّر بيانات — فكلُّ زرٍّ موسومٌ بأنه لا يغيّر شيئاً.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Eye, FileSearch, FileText, Hourglass, Info, MapPin, RefreshCw, ScanLine, ShieldCheck, UploadCloud, X,
} from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { interruptedImportMessage } from "../utils/importStreamFailure";
import { slimPdfRow, type FieldDelta, type FindingGroup, type RegistrarCheckResult, type RegistrarFinding } from "../utils/registrarCheck";
import { SecondaryButton } from "./ui";
import CourseTags from "./CourseTags";

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
  | { kind: "done"; result: RegistrarCheckResult; notes: ReadNotes }
  | { kind: "failed"; message: string };

const MAX_BYTES = 24 * 1024 * 1024;

const GROUPS: Array<{ group: FindingGroup; title: string; hint: string; icon: React.ReactNode }> = [
  { group: "notCarried", title: "لم يُنفَّذ", hint: "عدّلتموه بعد آخر إرسال والملف ما زال على القديم", icon: <Hourglass aria-hidden="true" /> },
  { group: "mismatch", title: "فيه خلل", hint: "يخالف جدولكم أو غائبٌ عن أحد الطرفين", icon: <AlertTriangle aria-hidden="true" /> },
  { group: "review", title: "تحتاج نظرك", hint: "لا أحكم فيه بيقين، فلا أخمّن", icon: <Eye aria-hidden="true" /> },
  { group: "matched", title: "مطابق", hint: "كما في جدولكم تماماً", icon: <CheckCircle2 aria-hidden="true" /> },
];

const KIND_TITLE: Record<string, string> = {
  fields: "يخالف جدولكم",
  onlyPdf: "في الملف وليس عندكم",
  onlyOurs: "عندكم وغاب عن الملف",
  notChanged: "تعديلكم لم يظهر",
  notAdded: "أضفتموه ولم يظهر",
  notRemoved: "حذفتموه وما زال ظاهراً",
  ambiguous: "التباس في تحديد الشعبة",
  unreadable: "قراءةٌ غير مؤكدة",
  fuzzy: "مطابقةٌ تقريبية",
  noKey: "صفٌّ لم تُحسم هويته",
};

/* ── الحلقة: حصّةُ كل مجموعةٍ من الشعب ───────────────────────────────── */
function Ring({ counts, percent }: { counts: RegistrarCheckResult["counts"]; percent: number | null }) {
  const size = 132, stroke = 14, radius = (size - stroke) / 2, circumference = 2 * Math.PI * radius;
  const total = Math.max(counts.total, 1);
  const parts: Array<{ n: number; tone: string }> = [
    { n: counts.matched, tone: "ok" }, { n: counts.mismatch, tone: "bad" }, { n: counts.notCarried, tone: "wait" }, { n: counts.review, tone: "look" },
  ];
  let offset = 0;
  return (
    <div className="rpc-ring" role="img" aria-label={percent === null ? "لا نسبةَ للمطابقة" : `نسبة المطابقة ${percent} في المئة`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle className="rpc-ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        {parts.filter(part => part.n > 0).map(part => {
          const length = (part.n / total) * circumference;
          const node = (
            <circle
              key={part.tone} className={`rpc-ring-arc rpc-ring-${part.tone}`} cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
              strokeDasharray={`${Math.max(length - 2, 0.5)} ${circumference}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += length;
          return node;
        })}
      </svg>
      <div className="rpc-ring-label">
        <strong>{percent === null ? "—" : <bdi dir="ltr">{percent}%</bdi>}</strong>
        <span>مطابق</span>
      </div>
    </div>
  );
}

/* ── قيمةٌ بخطّها: الأوقات والرموز لاتينيةٌ معزولة في سياق RTL ───────── */
const Value = ({ field, text }: { field: FieldDelta["field"]; text: string }) =>
  field === "time" || field === "room" || field === "section" ? <bdi dir="ltr">{text}</bdi> : <>{text}</>;

function DeltaRow({ delta, group }: { key?: React.Key; delta: FieldDelta; group: FindingGroup }) {
  return (
    <li className="rpc-delta">
      <span className="rpc-delta-field">{delta.label}</span>
      <span className="rpc-delta-values">
        <span className="rpc-chip rpc-chip-ours"><small>{group === "notCarried" ? "عدّلتم إلى" : "عندكم"}</small><Value field={delta.field} text={delta.ours} /></span>
        <ArrowLeft className="rpc-delta-arrow" aria-label="مقابل" />
        <span className="rpc-chip rpc-chip-pdf"><small>{group === "notCarried" ? "الملف ما زال" : "الملف"}</small><Value field={delta.field} text={delta.pdf} /></span>
      </span>
    </li>
  );
}

function Card({ finding, onOpen }: { key?: React.Key; finding: RegistrarFinding; onOpen?: (id: number) => void }) {
  const title = KIND_TITLE[finding.kind] || "";
  const codeText = finding.courseCode || "—";
  return (
    <li className={`rpc-card rpc-card-${finding.group}`} data-kind={finding.kind}>
      <header>
        <span className="rpc-card-icon" aria-hidden="true">
          {finding.group === "notCarried" ? <Hourglass /> : finding.group === "mismatch" ? <AlertTriangle /> : finding.group === "review" ? <Eye /> : <CheckCircle2 />}
        </span>
        <div className="rpc-card-id">
          <strong><bdi dir="ltr">{codeText}</bdi> · {finding.courseName || "مقرر"} <CourseTags courseId={finding.courseId} />{finding.section ? <> · ش<bdi dir="ltr">{finding.section}</bdi></> : null}</strong>
          {title ? <small>{title}{finding.page ? <> · ص<bdi dir="ltr">{finding.page}</bdi></> : null}</small> : null}
        </div>
        {finding.scheduleId && onOpen ? (
          <SecondaryButton type="button" className="rpc-open" data-guide-ignore="يفتح الموعد في جدول القسم للقراءة — لا يغيّر شيئاً" onClick={() => onOpen(finding.scheduleId as number)}>
            <MapPin aria-hidden="true" /> افتح الموعد
          </SecondaryButton>
        ) : null}
      </header>
      {finding.fields.length ? <ul className="rpc-deltas">{finding.fields.map(delta => <DeltaRow key={delta.field} delta={delta} group={finding.group} />)}</ul> : null}
      {finding.reason ? <p className="rpc-reason"><Info aria-hidden="true" />{finding.reason}</p> : null}
    </li>
  );
}

export default function RegistrarPdfCheck({ collegeId, sectionId, termId, onOpenAppointment, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<FindingGroup | null>(null);
  const [matchedOpen, setMatchedOpen] = useState(false);
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

  const readFile = useCallback(async (file: File) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { setPhase({ kind: "failed", message: "الملف ليس PDF. ارفع ملف الجدول الذي أعاده التسجيل بصيغة PDF." }); return; }
    if (file.size > MAX_BYTES) { setPhase({ kind: "failed", message: "حجم الملف أكبر من الحد المسموح (24 ميغابايت)." }); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFilter(null); setMatchedOpen(false);
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

      const rows: any[] = Array.isArray(data.rows) ? data.rows : [];
      const notes: ReadNotes = {
        fileName: file.name, pages: Number(data.pages) || 0,
        scanned: rows.some(row => String(row?.sourceReadMode || "pdf-text") !== "pdf-text"),
        unreadable: [
          ...(data.legibility && data.legibility.readable === false && data.legibility.reason ? [String(data.legibility.reason)] : []),
          ...((Array.isArray(data.pageDiagnostics) ? data.pageDiagnostics : []).filter((page: any) => page?.suspicious).map((page: any) => `الصفحة ${page.page}: قراءتها مشكوكٌ فيها`)),
        ],
      };
      setPhase({ kind: "comparing", fileName: file.name });
      const compared = await fetch("/api/schedules/registrar-check", {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, rows: rows.map(slimPdfRow) }),
      });
      const body = await compared.json().catch(() => ({}));
      if (!compared.ok) throw new Error(String(body?.error || "تعذّر فحص الملف"));
      if (!rows.length && !notes.unreadable.length) notes.unreadable.push(String(data.message || "لم أتمكن من استخراج شعب من الملف"));
      setPhase({ kind: "done", result: body as RegistrarCheckResult, notes });
    } catch (error: any) {
      if (error?.name === "AbortError") return;
      setPhase({ kind: "failed", message: String(error?.message || "تعذّرت قراءة الملف") });
    }
  }, [collegeId, sectionId, termId]);

  const pick = (files: FileList | null) => { const file = files?.[0]; if (file) void readFile(file); };
  const reset = () => { abortRef.current?.abort(); setPhase({ kind: "idle" }); if (inputRef.current) inputRef.current.value = ""; };

  const skipped = useMemo(() => {
    if (phase.kind !== "done") return [] as Array<[string, number]>;
    const labels: Record<string, string> = { days: "الأيام", time: "الوقت", room: "القاعة", instructor: "الأستاذ" };
    return (Object.entries(phase.result.reading.notCompared || {}) as Array<[string, number]>).filter(([, n]) => n > 0).map(([key, n]) => [labels[key] || key, n] as [string, number]);
  }, [phase]);

  const grouped = useMemo(() => {
    if (phase.kind !== "done") return null;
    const by: Record<FindingGroup, RegistrarFinding[]> = { notCarried: [], mismatch: [], review: [], matched: [] };
    for (const finding of phase.result.findings) by[finding.group].push(finding);
    return by;
  }, [phase]);

  return (
    <section className="rpc" aria-labelledby="rpc-title" data-state={phase.kind}>
      <header className="rpc-head">
        <span className="rpc-head-icon" aria-hidden="true"><FileSearch /></span>
        <div>
          <h2 id="rpc-title">افحص جدول التسجيل</h2>
          <p><ShieldCheck aria-hidden="true" /> قراءةٌ فقط — لا يتغيّر شيءٌ في جدولكم</p>
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
            <small>يُقرأ في الذاكرة ولا يُحفظ</small>
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
        <div className="rpc-result" ref={resultRef} tabIndex={-1} aria-label="نتيجة فحص جدول التسجيل">
          <div className="rpc-summary">
            <Ring counts={phase.result.counts} percent={phase.result.percent} />
            <div className="rpc-summary-side">
              <p className="rpc-file"><FileText aria-hidden="true" /><bdi dir="auto">{phase.notes.fileName}</bdi><span>{phase.notes.pages ? countOf(phase.notes.pages, AR.page) : ""}</span></p>
              <div className="rpc-chips" role="group" aria-label="تصفية النتائج">
                {GROUPS.map(({ group, title, icon }) => {
                  const count = phase.result.counts[group];
                  return (
                    <button
                      key={group} type="button" className={`rpc-count rpc-count-${group}`} data-active={filter === group || undefined} aria-pressed={filter === group} disabled={!count}
                      data-guide-ignore="تصفية النتائج المعروضة — لا يغيّر شيئاً" onClick={() => setFilter(filter === group ? null : group)}
                    >
                      {icon}<b><bdi dir="ltr">{count}</bdi></b><span>{title}</span>
                    </button>
                  );
                })}
              </div>
              <p className="rpc-total">الشعب المقارَنة: <bdi dir="ltr">{phase.result.counts.total}</bdi></p>
            </div>
          </div>

          {phase.result.empty ? (
            <p className="rpc-alert" data-tone="warning" role="status">
              <AlertTriangle aria-hidden="true" />
              {phase.result.empty === "pdfEmpty" ? "لم أستطع قراءة أي شعبة من الملف، فلا مقارنة." : phase.result.empty === "liveEmpty" ? "لا مواعيد في جدولكم لهذا الفصل، فلا مقارنة." : "لا شعب في الملف ولا في جدولكم."}
            </p>
          ) : null}

          {(phase.notes.scanned || phase.notes.unreadable.length || phase.result.reading.uncertainRows || phase.result.reading.outOfScopeRows || !phase.result.baseline.available || skipped.length) ? (
            <ul className="rpc-notes" aria-label="ملاحظات القراءة">
              {phase.notes.scanned ? <li><ScanLine aria-hidden="true" />الملف صورةٌ ممسوحة؛ قُرئ بالتعرّف الضوئي، وما لم يُقرأ بيقين وُضع في «تحتاج نظرك».</li> : null}
              {phase.notes.unreadable.map(text => <li key={text}><AlertTriangle aria-hidden="true" />{text}</li>)}
              {phase.result.reading.uncertainRows ? <li><Eye aria-hidden="true" />{countOf(phase.result.reading.uncertainRows, AR.cell)} لم تُقرأ بيقين.</li> : null}
              {skipped.length ? <li><Info aria-hidden="true" />لم تُقارَن: {skipped.map(([label, n], index) => <React.Fragment key={label}>{index ? " · " : ""}{label} ({countOf(n, AR.section)})</React.Fragment>)} — لم يطبعها الملف أو لم تُقرأ.</li> : null}
              {phase.result.reading.outOfScopeRows ? <li><Info aria-hidden="true" />{countOf(phase.result.reading.outOfScopeRows, AR.row)} تخصّ موقعاً آخر من الفرع، فاستُبعدت.</li> : null}
              {!phase.result.baseline.available ? <li><Info aria-hidden="true" />لا نسخةَ أُرسلت من قبل، فلا حكمَ على «لم يُنفَّذ».</li> : null}
            </ul>
          ) : null}

          {!phase.result.empty && phase.result.counts.total > 0 && !phase.result.counts.mismatch && !phase.result.counts.notCarried && !phase.result.counts.review ? (
            <div className="rpc-allgood" role="status"><CheckCircle2 aria-hidden="true" /><strong>الجدول مطابق تماماً</strong><span>كل ما في الملف كما في جدولكم.</span></div>
          ) : null}

          {GROUPS.filter(({ group }) => grouped[group].length && (!filter || filter === group)).map(({ group, title, hint, icon }) => {
            const list = grouped[group];
            const collapsed = group === "matched" && !matchedOpen && !filter;
            return (
              <section key={group} className={`rpc-group rpc-group-${group}`} aria-labelledby={`rpc-g-${group}`}>
                <header>
                  <span className="rpc-group-icon" aria-hidden="true">{icon}</span>
                  <div><h3 id={`rpc-g-${group}`}>{title} <bdi dir="ltr">({new Set(list.map(item => item.ref)).size})</bdi></h3><small>{hint}</small></div>
                  {group === "matched" && !filter ? (
                    <button type="button" className="rpc-toggle" aria-expanded={matchedOpen} data-guide-ignore="طيّ قائمة المطابق وفتحها — عرضٌ لا فعل" onClick={() => setMatchedOpen(value => !value)}>
                      {matchedOpen ? "اطوِ" : "اعرض"} <ChevronDown aria-hidden="true" data-open={matchedOpen || undefined} />
                    </button>
                  ) : null}
                </header>
                {collapsed ? null : group === "matched" ? (
                  <ul className="rpc-matched">
                    {list.map(item => <li key={item.id}><bdi dir="ltr">{item.courseCode}</bdi><span>{item.courseName} <CourseTags courseId={item.courseId} /></span><em>ش<bdi dir="ltr">{item.section}</bdi></em></li>)}
                  </ul>
                ) : (
                  <ul className="rpc-cards">{list.map(item => <Card key={item.id} finding={item} onOpen={onOpenAppointment} />)}</ul>
                )}
              </section>
            );
          })}

          <footer className="rpc-foot">
            <SecondaryButton type="button" data-guide-ignore="يفتح اختيار ملفٍّ آخر للفحص — لا يغيّر شيئاً" onClick={reset}><RefreshCw aria-hidden="true" /> افحص ملفاً آخر</SecondaryButton>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
