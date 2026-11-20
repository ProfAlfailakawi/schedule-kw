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
import { isTheirs, REQUEST_ACTION_LABEL, requestProgress, type RegistrarRequestDoc, type RegistrarRequestItem, type RequestProgress } from "../utils/registrarRequest";
import type { FieldDelta, RequestAction } from "../utils/registrarCheck";
import { showPwaPrintHelp } from "../utils/pwaPrintHelp";
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

/** يطبع «طلب تعديل للتسجيل» الموجودَ في الصفحة (PrintPortal) بصفحةٍ واحدة. */
export function printRegistrarRequest() {
  if (showPwaPrintHelp()) return;
  const root = document.documentElement;
  root.dataset.printKind = "registrar-request";
  const done = () => { delete root.dataset.printKind; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done, { once: true });
  window.setTimeout(() => { try { window.print(); } catch { done(); } }, 30);
  window.setTimeout(done, 4000);
}

const ACTIONS: RequestAction[] = ["edit", "add", "delete"];

/**
 * الورقة المطبوعة: بأسلوب بقية التقارير (ترويسةُ الكلية، شريطُ ملخّص، جداول، تذييل)، على ورقٍ طوليّ،
 * وبثلاثة ألوانٍ تحمل المعنى: كهرمانيّ عدّلوا، أخضر أضيفوا، أحمر احذفوا.
 */
export function RequestSheet({ doc, scopeLine, college, theirsOnly = false }: { doc: RegistrarRequestDoc; scopeLine: string; college?: string; theirsOnly?: boolean }) {
  /* «ملاحظات على ملف التسجيل»: ما أُرسل ولم يظهر في ملفهم وحده، فلا يُحمَّلون ما عدّلناه نحن بعد الإرسال. */
  const items = theirsOnly ? doc.items.filter(isTheirs) : doc.items;
  const by = (action: RequestAction) => items.filter(item => item.action === action);
  const value = (item: RegistrarRequestItem, field: string) => item.fields.find(f => f.field === field)?.ours || "—";
  const printedAt = new Date();
  const stamp = `${String(printedAt.getDate()).padStart(2, "0")}/${String(printedAt.getMonth() + 1).padStart(2, "0")}/${printedAt.getFullYear()}`;
  const groups: Array<{ action: RequestAction; title: string; note: string }> = [
    { action: "edit", title: "عدّلوا", note: "شعبٌ في ملفهم يخالف جدولنا" },
    { action: "add", title: "أضيفوا", note: "شعبٌ عندنا ولم تظهر في ملفهم" },
    { action: "delete", title: "احذفوا", note: "شعبٌ في ملفهم ليست في جدولنا" },
  ];
  return (
    <article className="rrq-sheet" dir="rtl">
      <PrintLetterhead title={theirsOnly ? "ملاحظات على ملف التسجيل" : "مطابقة التسجيل"} scope={scopeLine} college={college} footer={false} />
      <div className="rrq-meta">
        <span><i>التاريخ</i><b>{requestDay(doc.at)}</b></span>
        <span className="rrq-meta-file"><i>الملف</i><b><bdi dir="auto">{doc.fileName}</bdi></b></span>
        {doc.round ? <span><i>الجولة</i><b>{doc.round}</b></span> : null}
        <span className="rrq-meta-total"><i>المجموع</i><b>{items.length}</b></span>
        {groups.map(({ action, title }) => by(action).length ? <span key={action} className="rrq-meta-chip" data-action={action}><i>{title}</i><b>{by(action).length}</b></span> : null)}
      </div>
      {theirsOnly ? (
        <p className="rrq-proof">
          {doc.sent ? <>أُرسل الجدول في <b>الجولة {doc.sent.round}</b> بتاريخ <b>{requestDay(doc.sent.at)}</b>، وهذه البنود لم تظهر في ملفكم.</> : <>هذه البنود أُرسلت في الجدول ولم تظهر في ملفكم.</>}
        </p>
      ) : null}
      {by("edit").length ? (
        <section data-action="edit">
          <h2><b>{groups[0].title}</b><span>{groups[0].note}</span><em>{by("edit").length}</em></h2>
          <table className="rrq-t-edit">
            <thead><tr><th>الرقم المرجعي</th><th>المقرر</th><th>شعبتكم</th><th>ما عندكم ← المطلوب</th></tr></thead>
            <tbody>{by("edit").map(item => (
              <tr key={item.id}>
                <td><bdi dir="ltr">{item.crn || "—"}</bdi></td>
                <td><strong>{item.courseName}</strong><small><bdi dir="ltr">{item.courseCode}</bdi></small></td>
                <td><bdi dir="ltr">{item.pdfSection || item.section}</bdi></td>
                <td>{item.fields.map(f => <div key={f.field} className="rrq-delta"><i>{f.label}</i><s><Value field={f.field} text={f.pdf} /></s><span aria-hidden="true">←</span><b><Value field={f.field} text={f.ours} /></b></div>)}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ) : null}
      {by("add").length ? (
        <section data-action="add">
          <h2><b>{groups[1].title}</b><span>{groups[1].note}</span><em>{by("add").length}</em></h2>
          <table className="rrq-t-add">
            <thead><tr><th>المقرر والشعبة</th><th>الأيام والوقت</th><th>القاعة</th><th>الأستاذ</th></tr></thead>
            <tbody>{by("add").map(item => (
              <tr key={item.id}>
                <td><strong>{item.courseName}</strong><small><bdi dir="ltr">{item.courseCode}</bdi> · شعبة <bdi dir="ltr">{item.section}</bdi></small></td>
                <td>{value(item, "days")}<small><bdi dir="ltr">{value(item, "time")}</bdi></small></td>
                <td><bdi dir="ltr">{value(item, "room")}</bdi></td>
                <td>{value(item, "instructor")}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ) : null}
      {by("delete").length ? (
        <section data-action="delete">
          <h2><b>{groups[2].title}</b><span>{groups[2].note}</span><em>{by("delete").length}</em></h2>
          <table className="rrq-t-del">
            <thead><tr><th>الرقم المرجعي</th><th>المقرر</th><th>الشعبة</th></tr></thead>
            <tbody>{by("delete").map(item => (
              <tr key={item.id}><td><bdi dir="ltr">{item.crn || "—"}</bdi></td><td><strong>{item.courseName}</strong><small><bdi dir="ltr">{item.courseCode}</bdi></small></td><td><bdi dir="ltr">{item.pdfSection || item.section}</bdi></td></tr>
            ))}</tbody>
          </table>
        </section>
      ) : null}
      <footer className="rrq-foot">
        <span>{college || "الجدول الأكاديمي"}</span>
        <span>نظام الجدول الأكاديمي</span>
        <time dir="ltr">{stamp}</time>
      </footer>
    </article>
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
