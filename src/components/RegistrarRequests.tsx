/**
 * ── طلبُ التعديل للتسجيل: شريطُ التواريخ، وقائمةُ الشطب، والورقة المطبوعة ──────
 *
 * كلُّ فحصٍ محفوظ لملفّ التسجيل طلبٌ مؤرَّخ تحت «تغييرات الجدول». القسمُ يرى
 * تقدّمه («٥ من ٧ نُفّذت» ومن شطب ومتى)، والتسجيلُ يشطب كلَّ بندٍ نفّذه. والورقةُ
 * المطبوعة «طلب تعديل للتسجيل» صفحةٌ واحدة بثلاث فئات: عدّلوا، أضيفوا، احذفوا.
 *
 * لا يراه الأستاذ: الطريقُ يقرؤه صاحبُ الجدول (النموذج 7) والتسجيلُ المراجع وحدهما.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Circle, Clock3, FileText, MapPin, Printer, RotateCcw, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { isTheirs, REQUEST_ACTION_LABEL, theirFields, requestProgress, type RegistrarRequestDoc, type RegistrarRequestItem, type RequestProgress } from "../utils/registrarRequest";
import type { FieldDelta, RequestAction } from "../utils/registrarCheck";
import { showPwaPrintHelp } from "../utils/pwaPrintHelp";
import { clearPrintFit, fitPrintPages, packPrintLines } from "../utils/printFit";
import { isSafariPrint, stampPrintEngine } from "../utils/printEngine";
import { GhostButton, Notice, PrintLetterhead, PrintPortal, SecondaryButton, visualConfirm } from "./ui";

const call = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data?.error || "تعذّر تنفيذ العملية")), { status: response.status });
  return data;
};

export const requestDay = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long" });
};
export const requestStamp = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-KW-u-nu-latn", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
};

const FIELD_ICON: Record<string, React.ReactNode> = {
  days: <CalendarDays aria-hidden="true" />, time: <Clock3 aria-hidden="true" />, room: <MapPin aria-hidden="true" />,
  instructor: <UserRound aria-hidden="true" />, course: <BookOpen aria-hidden="true" />,
};
const isLatin = (field: FieldDelta["field"]) => field === "time" || field === "room" || field === "section";
const Value = ({ field, text }: { field: FieldDelta["field"]; text: string }) => isLatin(field) ? <bdi dir="ltr">{text}</bdi> : <>{text}</>;

/** شريطُ التقدّم: «٥ من ٧ نُفّذت». */
export function RequestProgressBar({ progress }: { progress: RequestProgress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="rrq-progress">
      <div className="rrq-bar" role="progressbar" aria-label="ما نُفّذ من الطلب" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
        <span style={{ inlineSize: `${pct}%` }} />
      </div>
      <p>
        <strong><bdi dir="ltr">{progress.done}</bdi> من <bdi dir="ltr">{progress.total}</bdi> نُفّذت</strong>
        {progress.confirmed ? <span className="rrq-tag" data-tone="ok">{countOf(progress.confirmed, AR.item)} تأكّدت من الملف</span> : null}
        {progress.reopened ? <span className="rrq-tag" data-tone="warn">{countOf(progress.reopened, AR.item)} عادت مفتوحة</span> : null}
      </p>
    </div>
  );
}

export function ItemLine({ item, canTick, busy, onTick }: { key?: React.Key; item: RegistrarRequestItem; canTick: boolean; busy: boolean; onTick: (item: RegistrarRequestItem, done: boolean) => void }) {
  const closed = Boolean(item.done) || item.state === "confirmed";
  const who = item.done || (item.state === "confirmed" ? undefined : item.lastDone);
  return (
    <li className="rrq-item" data-state={item.state === "confirmed" ? "confirmed" : item.done ? "done" : item.state === "reopened" ? "reopened" : "open"}>
      <div className="rrq-item-id">
        {item.crn ? <span className="crn-chip" dir="ltr" title="الرقم المرجعي">{item.crn}</span> : <span className="rrq-new">بلا رقم</span>}
        <strong><bdi dir="ltr">{item.courseCode}</bdi> {item.courseName}</strong>
        <small>ش<bdi dir="ltr">{item.pdfSection || item.section}</bdi></small>
      </div>
      {item.action === "edit" && item.fields.length ? (
        <ul className="rrq-fields">
          {item.fields.map(f => (
            <li key={f.field}>
              <span className="rrq-field-icon" title={f.label}>{FIELD_ICON[f.field]}</span>
              <span className="rrq-was"><Value field={f.field} text={f.pdf} /></span>
              <ArrowLeft className="rrq-arrow" aria-label="إلى" />
              <span className="rrq-want"><Value field={f.field} text={f.ours} /></span>
            </li>
          ))}
        </ul>
      ) : item.action === "add" ? (
        <p className="rrq-add-line">{item.fields.filter(f => f.ours && f.ours !== "—").map((f, i) => <React.Fragment key={f.field}>{i ? " · " : ""}<Value field={f.field} text={f.ours} /></React.Fragment>)}</p>
      ) : null}
      <div className="rrq-item-state">
        {item.state === "confirmed" ? <span className="rrq-tag" data-tone="ok"><ShieldCheck aria-hidden="true" /> تأكّد من الملف</span>
          : item.state === "reopened" && !item.done ? <span className="rrq-tag" data-tone="warn"><RotateCcw aria-hidden="true" /> شُطب ولم يظهر في الملف</span> : null}
        {who ? <small>{item.done ? "نُفّذ" : "شُطب"}: {who.byName || "التسجيل"} · {requestStamp(who.at)}</small> : null}
        {canTick ? (
          <button
            type="button" className="rrq-tick" aria-pressed={closed} disabled={busy || item.state === "confirmed"}
            data-guide-ignore="شطب بندٍ «نُفّذ» في طلب التعديل أو رفعُ شطبه — فعلُ التسجيل المسجّل باسمه"
            onClick={() => onTick(item, !item.done)}
          >
            {closed ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />} {closed ? "نُفّذ" : "علّم «نُفّذ»"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * يطبع ورقة المطابقة الموجودةَ في الصفحة (PrintPortal) كما يطبع «مركز الاستعلام» تقاريره: سماتُ المحرّك
 * (التدوير في Safari، وهندسة A4 في Chromium)، ثم ملءُ كل صفحةٍ إلى حدود A4 (fitPrintPages)، وأمرُ الطباعة
 * في اللمسة نفسها، ولا تُرفع السمات إلا بعد الطباعة فعلاً.
 */
export function printRegistrarRequest() {
  if (showPwaPrintHelp()) return;
  const root = document.documentElement;
  const scope = document.getElementById("app-print-root") || document;
  root.dataset.printKind = "registrar-request";
  const unstamp = stampPrintEngine(root);
  fitPrintPages(scope);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    delete root.dataset.printKind;
    unstamp();
    clearPrintFit(scope);
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done, { once: true });
  let invoked = false;
  if (isSafariPrint() && typeof document.execCommand === "function") { try { invoked = document.execCommand("print"); } catch { invoked = false; } }
  if (!invoked) { try { window.print(); } catch { done(); } }
}

const ACTIONS: RequestAction[] = ["edit", "add", "delete"];

/**
 * الورقة المطبوعة: بأسلوب بقية التقارير (ترويسةُ الكلية، شريطُ ملخّص، جداول، تذييل)، على ورقٍ طوليّ،
 * وبثلاثة ألوانٍ تحمل المعنى: كهرمانيّ عدّلوا، أخضر أضيفوا، أحمر احذفوا.
 */
/** سجلُّ الفحوص على الورقة: كلُّ فحصٍ محفوظ بتاريخه، وما زال عن الذي قبله وما بقي وما جدّ. */
function checkTrail(history: readonly RegistrarRequestDoc[], theirsOnly: boolean) {
  const pick = (d: RegistrarRequestDoc) => (theirsOnly ? d.items.filter(isTheirs) : d.items).map(item => item.id);
  const ordered = [...history].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return ordered.map((d, index) => {
    const now = new Set(pick(d));
    const before = index ? new Set(pick(ordered[index - 1])) : null;
    let gone = 0, kept = 0, fresh = 0;
    if (before) { for (const id of before) (now.has(id) ? kept++ : gone++); for (const id of now) if (!before.has(id)) fresh++; }
    return { id: d.id, at: d.at, fileName: d.fileName, total: now.size, first: !before, gone, kept, fresh };
  });
}

export function RequestSheet({ doc, scopeLine, college, theirsOnly = false, history = [] }: { doc: RegistrarRequestDoc; scopeLine: string; college?: string; theirsOnly?: boolean; history?: readonly RegistrarRequestDoc[] }) {
  /* «ملاحظات على ملف التسجيل»: ما أُرسل ولم يظهر في ملفهم وحده، فلا يُحمَّلون ما عدّلناه نحن بعد الإرسال. */
  /* البندُ المتكرّر: أولُ فحصٍ ظهر فيه، فيُرى أنه باقٍ منذ ذلك اليوم. */
  const firstSeen = new Map<string, string>();
  for (const d of [...history].filter(d => String(d.at) <= String(doc.at)).sort((a, b) => String(a.at).localeCompare(String(b.at))))
    for (const item of d.items) if (!firstSeen.has(item.id)) firstSeen.set(item.id, d.at);
  const since = (item: RegistrarRequestItem) => { const at = firstSeen.get(item.id); return at && at < doc.at ? <em className="rrq-since">باقٍ منذ {requestDay(at)}</em> : null; };
  const trail = checkTrail(history.length ? history : [doc], theirsOnly);
  const items = (theirsOnly
    ? doc.items.filter(isTheirs).map(item => item.action === "edit" ? { ...item, fields: theirFields(item) } : item)
    : doc.items);
  const by = (action: RequestAction) => items.filter(item => item.action === action);
  const value = (item: RegistrarRequestItem, field: string) => item.fields.find(f => f.field === field)?.ours || "—";
  const printedAt = new Date();
  const stamp = `${String(printedAt.getDate()).padStart(2, "0")}/${String(printedAt.getMonth() + 1).padStart(2, "0")}/${printedAt.getFullYear()}`;
  const groups: Array<{ action: RequestAction; title: string; note: string }> = [
    { action: "edit", title: "عدّلوا", note: "شعبٌ في ملفهم يخالف جدولنا" },
    { action: "add", title: "أضيفوا", note: "شعبٌ عندنا ولم تظهر في ملفهم" },
    { action: "delete", title: "احذفوا", note: "شعبٌ في ملفهم ليست في جدولنا" },
  ];
  /* ── الصفحات: كما تُصفَّح بقية التقارير (صفحاتٌ صريحة، لكل صفحةٍ ترويستُها وتذييلُها) ──
     البنودُ تُحزَم بكلفة ارتفاعها (بندُ تعديلٍ بحقولٍ كثيرة أطول)، والصفحةُ الأولى تحمل الملخّص وسجلَّ الفحوص. */
  type Line = { item: RegistrarRequestItem; action: RequestAction };
  const lines: Line[] = groups.flatMap(({ action }) => by(action).map(item => ({ item, action })));
  const cost = (line: Line) => 1 + Math.max(0, (line.action === "edit" ? line.item.fields.length : 1) - 1) * 0.55;
  const firstBudget = Math.max(3, 8 - (trail.length > 1 ? Math.min(4, 1 + trail.length * 0.6) : 0) - (theirsOnly ? 0.8 : 0));
  const pages = lines.length ? packPrintLines(lines, cost, firstBudget, 10) : [[] as Line[]];
  const groupOf = (action: RequestAction) => groups.find(g => g.action === action)!;
  const editRow = (item: RegistrarRequestItem) => (
    <tr key={item.id}>
      <td><bdi dir="ltr">{item.crn || "—"}</bdi></td>
      <td><strong>{item.courseName}</strong><small><bdi dir="ltr">{item.courseCode}</bdi></small>{since(item)}</td>
      <td><bdi dir="ltr">{item.pdfSection || item.section}</bdi></td>
      <td>{item.fields.map(f => <div key={f.field} className="rrq-delta"><i>{f.label}</i><s><Value field={f.field} text={f.pdf} /></s><span aria-hidden="true">←</span><b><Value field={f.field} text={f.ours} /></b></div>)}</td>
    </tr>
  );
  const addRow = (item: RegistrarRequestItem) => (
    <tr key={item.id}>
      <td><strong>{item.courseName}</strong><small><bdi dir="ltr">{item.courseCode}</bdi> · شعبة <bdi dir="ltr">{item.section}</bdi></small>{since(item)}</td>
      <td>{value(item, "days")}<small><bdi dir="ltr">{value(item, "time")}</bdi></small></td>
      <td><bdi dir="ltr">{value(item, "room")}</bdi></td>
      <td>{value(item, "instructor")}</td>
    </tr>
  );
  const delRow = (item: RegistrarRequestItem) => (
    <tr key={item.id}><td><bdi dir="ltr">{item.crn || "—"}</bdi></td><td><strong>{item.courseName}</strong><small><bdi dir="ltr">{item.courseCode}</bdi></small>{since(item)}</td><td><bdi dir="ltr">{item.pdfSection || item.section}</bdi></td></tr>
  );
  const head: Record<RequestAction, React.ReactNode> = {
    edit: <tr><th>الرقم المرجعي</th><th>المقرر</th><th>شعبتكم</th><th>ما عندكم ← المطلوب</th></tr>,
    add: <tr><th>المقرر والشعبة</th><th>الأيام والوقت</th><th>القاعة</th><th>الأستاذ</th></tr>,
    delete: <tr><th>الرقم المرجعي</th><th>المقرر</th><th>الشعبة</th></tr>,
  };
  const rowOf = { edit: editRow, add: addRow, delete: delRow } as const;
  const tableClass = { edit: "rrq-t-edit", add: "rrq-t-add", delete: "rrq-t-del" } as const;
  return (
    <div className="print-report print-wide print-query-report print-registrar-report rrq-sheet" dir="rtl">
      {pages.map((pageLines, pageIndex) => {
        /* البنودُ على الصفحة مجموعاتٍ متصلة، ومجموعةٌ تبدأ في صفحةٍ سابقة تُكمَل بعنوانها «(تابع)». */
        const runs: Array<{ action: RequestAction; rows: RegistrarRequestItem[]; continued: boolean }> = [];
        pageLines.forEach((line, index) => {
          const last = runs[runs.length - 1];
          if (last && last.action === line.action) last.rows.push(line.item);
          else runs.push({ action: line.action, rows: [line.item], continued: index === 0 && pageIndex > 0 && pages[pageIndex - 1].some(l => l.action === line.action) });
        });
        return (
          <section className="print-explicit-page" key={`rrq-page-${pageIndex + 1}`}>
            <PrintLetterhead title={theirsOnly ? "ملاحظات على ملف التسجيل" : "مطابقة التسجيل"} scope={scopeLine} college={college} footer={false} />
            {pageIndex === 0 ? (
              <>
                <div className="print-query-summaryline rrq-meta">
                  <span><i>التاريخ</i> <b>{requestDay(doc.at)}</b></span>
                  <span className="rrq-meta-file"><i>الملف</i> <b><bdi dir="auto">{doc.fileName}</bdi></b></span>
                  {doc.round ? <span><i>الجولة</i> <b>{doc.round}</b></span> : null}
                  <span className="rrq-meta-total"><i>المجموع</i> <b>{items.length}</b></span>
                  {groups.map(({ action, title }) => by(action).length ? <span key={action} className="rrq-meta-chip" data-action={action}><i>{title}</i> <b>{by(action).length}</b></span> : null)}
                </div>
                {theirsOnly ? (
                  <p className="rrq-proof">
                    {doc.sent ? <>أُرسل الجدول في <b>الجولة {doc.sent.round}</b> بتاريخ <b>{requestDay(doc.sent.at)}</b>، وهذه البنود لم تظهر في ملفكم.</> : <>هذه البنود أُرسلت في الجدول ولم تظهر في ملفكم.</>}
                  </p>
                ) : null}
                {trail.length > 1 ? (
                  <section className="rrq-trail">
                    <h3>سجلّ الفحوص</h3>
                    <table>
                      <thead><tr><th>التاريخ</th><th>الملف</th><th>البنود</th><th>عن الفحص السابق</th></tr></thead>
                      <tbody>{trail.map(row => (
                        <tr key={row.id} data-current={row.id === doc.id ? "" : undefined}>
                          <td>{requestDay(row.at)}{row.id === doc.id ? <small>هذا التقرير</small> : null}</td>
                          <td><bdi dir="auto">{row.fileName}</bdi></td>
                          <td><b>{row.total}</b></td>
                          <td>{row.first ? "أول فحص" : <><span data-tone="ok">زالت {row.gone}</span> · <span data-tone="warn">بقيت {row.kept}</span> · <span data-tone="new">جديدة {row.fresh}</span></>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </section>
                ) : null}
              </>
            ) : null}
            {!lines.length ? <p className="print-empty">لا فروق في هذا الفحص.</p> : null}
            {runs.map(run => {
              const g = groupOf(run.action);
              return (
                <section key={`${pageIndex}-${run.action}`} className="rrq-group" data-action={run.action}>
                  <h2><b>{g.title}{run.continued ? " (تابع)" : ""}</b><span>{g.note}</span><em>{by(run.action).length}</em></h2>
                  <table className={tableClass[run.action]}>
                    <thead>{head[run.action]}</thead>
                    <tbody>{run.rows.map(item => rowOf[run.action](item))}</tbody>
                  </table>
                </section>
              );
            })}
            <footer className="print-explicit-page-meta">
              <span>{college || "الجدول الأكاديمي"}</span>
              <bdi dir="ltr">{pageIndex + 1} / {pages.length}</bdi>
              <time dir="ltr">{stamp}</time>
            </footer>
          </section>
        );
      })}
    </div>
  );
}

/**
 * طلباتُ قسمٍ واحد تحت «تغييرات الجدول»: شريطُ تواريخ، وكلُّ تاريخٍ يفتح طلبه.
 * لا يظهر شيءٌ إن لم يُحفظ طلب، أو لم يكن للقارئ أن يراه.
 */
export default function RegistrarRequests({ collegeId, sectionId, termId, scopeLine, canDelete, focusLatest = false }: {
  collegeId: number; sectionId: number; termId: number; scopeLine: string;
  /** القسم (النموذج 7) يحذف طلبه؛ التسجيلُ لا. */
  canDelete: boolean;
  /** فُتح من بطاقة الوارد: يُفتح أحدثُ طلب. */
  focusLatest?: boolean;
}) {
  const [docs, setDocs] = useState<RegistrarRequestDoc[] | null>(null);
  const [canTick, setCanTick] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await call(`/api/schedules/registrar-requests?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      const list: RegistrarRequestDoc[] = Array.isArray(data.requests) ? data.requests : [];
      setDocs(list); setCanTick(Boolean(data.canTick));
      if (focusLatest && list[0]) setOpenId(current => current || list[0].id);
    } catch { setDocs([]); }
  }, [collegeId, sectionId, termId, focusLatest]);
  useEffect(() => { setDocs(null); setOpenId(null); void load(); }, [load]);

  const open = useMemo(() => docs?.find(doc => doc.id === openId) || null, [docs, openId]);
  if (!docs?.length) return null;

  const replace = (next: RegistrarRequestDoc) => setDocs(list => (list || []).map(doc => doc.id === next.id ? next : doc));
  const tick = async (item: RegistrarRequestItem, done: boolean) => {
    if (!open) return;
    setBusy(true); setError(null);
    try {
      const data = await call(`/api/schedules/registrar-requests/${encodeURIComponent(open.id)}/tick`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, done }),
      });
      if (data.request) replace(data.request);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!open) return;
    const ok = await visualConfirm({ title: "حذف طلب التعديل", message: `يُحذف طلب ${requestDay(open.at)} (${countOf(open.items.length, AR.item)}) ولا يعود يظهر للتسجيل.`, confirmLabel: "احذف الطلب", tone: "danger", safeCancel: true });
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      await call(`/api/schedules/registrar-requests/${encodeURIComponent(open.id)}`, { method: "DELETE" });
      setDocs(list => (list || []).filter(doc => doc.id !== open.id)); setOpenId(null);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const printIt = printRegistrarRequest;

  return (
    <section className="rrq" aria-labelledby="rrq-title">
      <header className="rrq-head">
        <FileText aria-hidden="true" />
        <h3 id="rrq-title">طلبات التعديل للتسجيل</h3>
      </header>
      <div className="rrq-strip" role="tablist" aria-label="طلبات التعديل بتواريخها">
        {docs.map(doc => {
          const progress = requestProgress(doc.items);
          return (
            <button
              key={doc.id} type="button" role="tab" className="rrq-chip" aria-selected={doc.id === openId}
              data-complete={progress.total > 0 && progress.done === progress.total ? "" : undefined}
              data-guide-ignore="يفتح طلب التعديل المحفوظ بتاريخه — قراءةٌ لا فعل"
              onClick={() => setOpenId(doc.id === openId ? null : doc.id)}
            >
              <span className="rrq-chip-day">{requestDay(doc.at)}</span>
              <span className="rrq-chip-count">{countOf(doc.items.length, AR.item)}</span>
              <span className="rrq-chip-meter" aria-hidden="true"><span style={{ inlineSize: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></span>
            </button>
          );
        })}
      </div>
      {error ? <Notice type="error">{error}</Notice> : null}
      {open ? (
        <div className="rrq-open" role="tabpanel" aria-label={`طلب ${requestDay(open.at)}`}>
          <div className="rrq-open-head">
            <p><bdi dir="auto">{open.fileName}</bdi> · {open.byName ? `حفظه ${open.byName}` : ""}{open.round ? ` · الجولة ${open.round}` : ""}</p>
            <div className="rrq-actions">
              <SecondaryButton type="button" data-guide-ignore="يطبع «طلب تعديل للتسجيل» صفحةً واحدة — قراءةٌ لا تغيّر شيئاً" onClick={printIt}><Printer aria-hidden="true" /> اطبع الطلب</SecondaryButton>
              {canDelete ? <GhostButton type="button" disabled={busy} data-guide-ignore="يحذف طلب التعديل المحفوظ بعد التأكيد" onClick={() => void remove()}><Trash2 aria-hidden="true" /> احذف</GhostButton> : null}
            </div>
          </div>
          <RequestProgressBar progress={requestProgress(open.items)} />
          {ACTIONS.map(action => {
            const list = open.items.filter(item => item.action === action);
            if (!list.length) return null;
            return (
              <section key={action} className="rrq-group" data-action={action}>
                <h4>{REQUEST_ACTION_LABEL[action]} <bdi dir="ltr">({list.length})</bdi></h4>
                <ul>{list.map(item => <ItemLine key={item.id} item={item} canTick={canTick} busy={busy} onTick={(it, done) => void tick(it, done)} />)}</ul>
              </section>
            );
          })}
          {open.reviewCount ? <p className="rrq-note">{countOf(open.reviewCount, AR.section)} احتاجت نظر القسم فلم تُدرج في الطلب.</p> : null}
          <PrintPortal className="registrar-request-print-host"><RequestSheet doc={open} scopeLine={scopeLine} /></PrintPortal>
        </div>
      ) : null}
    </section>
  );
}

/** وارد التسجيل: بطاقةٌ لكل قسمٍ أرسل طلب تعديل في جولته الجارية. */
export function RegistrarRequestInbox({ termId, nameOf, onOpen }: {
  termId: number;
  nameOf: (collegeId: number, sectionId: number) => { collegeName?: string; sectionName?: string };
  onOpen: (collegeId: number, sectionId: number) => void;
}) {
  const [rows, setRows] = useState<Array<{ id: string; collegeId: number; sectionId: number; at: string; progress: RequestProgress }>>([]);
  useEffect(() => {
    let alive = true;
    call(`/api/schedules/registrar-requests/inbox?termId=${termId}`).then(data => { if (alive) setRows(Array.isArray(data.requests) ? data.requests : []); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [termId]);
  if (!rows.length) return null;
  return (
    <section className="rrq-inbox" aria-label="طلبات التعديل من الأقسام">
      <h3><FileText aria-hidden="true" /> طلبات التعديل من الأقسام</h3>
      <ul>
        {rows.map(row => {
          const names = nameOf(row.collegeId, row.sectionId);
          const pct = row.progress.total ? (row.progress.done / row.progress.total) * 100 : 0;
          return (
            <li key={row.id}>
              <button type="button" className="rrq-inbox-card" data-guide-ignore="يفتح طلب تعديل القسم وقائمة الشطب — تنقّلٌ لا فعل" onClick={() => onOpen(row.collegeId, row.sectionId)}>
                <strong>{names.sectionName || `قسم ${row.sectionId}`}</strong>
                <span>طلب تعديل · {requestDay(row.at)} · {countOf(row.progress.total, AR.item)}</span>
                <span className="rrq-chip-meter" aria-hidden="true"><span style={{ inlineSize: `${pct}%` }} /></span>
                <small><bdi dir="ltr">{row.progress.done}</bdi> من <bdi dir="ltr">{row.progress.total}</bdi> نُفّذت</small>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
