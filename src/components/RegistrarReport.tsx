/**
 * ── «مطابقة التسجيل»: تقريرُ ما بين جدولنا وملفّ التسجيل، في مركز الاستعلام ─────
 *
 * كلُّ فحصٍ محفوظٍ لملفّ التسجيل (أدوات الجدول ← الملفات) تقريرٌ مؤرَّخ، تتراكم
 * تقاريرُه بتواريخها: القسم يقرأ ما بقي، والتسجيلُ يشطب ما نفّذه («نُفّذ»)، ويتحقّق
 * الملفُّ التالي بنفسه. القراءةُ بالرقم المرجعي كما اعتاد التسجيل، بثلاثة ألوان:
 * عدّلوا (كهرمانيّ)، أضيفوا (أخضر)، احذفوا (أحمر).
 *
 * لا يخزّن شيئاً بنفسه: المصدرُ مسارُ طلبات التعديل القائم، والطباعة هي ورقةُ
 * «طلب تعديل للتسجيل» نفسها. لا يراه الأستاذ.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CheckCircle2, CircleDashed, ClipboardCheck, FileSpreadsheet, FilePlus2, FilePenLine, FileX2, History, Printer, ScrollText, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { isTheirs, REQUEST_ACTION_LABEL, requestProgress, type LiveRequestView, type RegistrarRequestDoc, type RegistrarRequestItem } from "../utils/registrarRequest";
import type { RequestAction } from "../utils/registrarCheck";
import { downloadSheets, exportFileName, type ExportSheet } from "../utils/lensExport";
import { armRegistrarPrint, ItemLine, printRegistrarRequest, RequestSheet, requestDay, requestStamp } from "./RegistrarRequests";
import { EmptyState, GhostButton, MicroLoader, Notice, PrintPortal, SecondaryButton, visualConfirm } from "./ui";

const call = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data?.error || "تعذّر تنفيذ العملية")), { status: response.status });
  return data;
};

const ACTIONS: RequestAction[] = ["edit", "add", "delete"];
const ACTION_ICON: Record<RequestAction, React.ReactNode> = {
  edit: <FilePenLine aria-hidden="true" />, add: <FilePlus2 aria-hidden="true" />, delete: <FileX2 aria-hidden="true" />,
};
const ACTION_HINT: Record<RequestAction, string> = {
  edit: "شعبٌ عندهم يخالف ما عندنا",
  add: "شعبٌ عندنا ولا أثر لها عندهم",
  delete: "شعبٌ عندهم ولا أثر لها عندنا",
};

const monthOf = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-KW-u-nu-latn", { month: "long" });
};
const dayNumber = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : String(date.getDate());
};

function statusOf(item: RegistrarRequestItem): string {
  if (item.state === "confirmed") return "تأكّد من الملف";
  if (item.done) return "نُفّذ";
  if (item.state === "reopened") return "شُطب ولم يظهر في الملف";
  return "ينتظر التنفيذ";
}

function sheetOf(doc: RegistrarRequestDoc): ExportSheet {
  const field = (item: RegistrarRequestItem, key: string) => item.fields.find(f => f.field === key);
  return {
    name: "مطابقة التسجيل",
    rows: doc.items.map(item => ({
      "الإجراء": REQUEST_ACTION_LABEL[item.action],
      "الرقم المرجعي": item.crn || "",
      "رمز المقرر": item.courseCode,
      "المقرر": item.courseName,
      "شعبة التسجيل": item.pdfSection || "",
      "شعبتنا": item.section,
      "الأيام والوقت": [field(item, "days")?.ours, field(item, "time")?.ours].filter(Boolean).join(" · "),
      "القاعة": field(item, "room")?.ours || "",
      "الأستاذ": field(item, "instructor")?.ours || "",
      "الفرق": item.action === "edit" ? item.fields.map(f => `${f.label}: ${f.pdf} ← ${f.ours}`).join(" | ") : "",
      "الحالة": statusOf(item),
      "نفّذه": item.done?.byName || "",
      "وقت التنفيذ": item.done ? requestStamp(item.done.at) : "",
    })),
  };
}

/** حلقةُ تقدّمٍ صغيرة لبطاقة التاريخ. */
function Ring({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const r = 15, c = 2 * Math.PI * r;
  return (
    <svg className="rpr-ring" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r={r} className="rpr-ring-bg" />
      <circle cx="18" cy="18" r={r} className="rpr-ring-fg" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 18 18)" />
      <text x="18" y="21.5" textAnchor="middle">{total ? Math.round(pct * 100) : 0}</text>
    </svg>
  );
}

export default function RegistrarReport({ collegeId, sectionId, termId, scopeLine, college, canDelete, civilOf }: {
  collegeId: number; sectionId: number; termId: number; scopeLine: string;
  /** اسمُ الكلية في ترويسة الورقة المطبوعة. */
  college?: string;
  /** الرقمُ المدني لأستاذٍ بمعرّفه بصلاحية القارئ (فارغٌ لمن لا يحقّ له)، يُطبع بجانب اسمه. */
  civilOf?: (instructorId: number) => string | undefined;
  /** صاحبُ الجدول (النموذج 7) يحذف تقريره؛ التسجيلُ لا. */
  canDelete: boolean;
}) {
  const [docs, setDocs] = useState<RegistrarRequestDoc[] | null>(null);
  const [canTick, setCanTick] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [only, setOnly] = useState<RequestAction | "all">("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!collegeId || !sectionId || !termId) { setDocs([]); return; }
    try {
      const data = await call(`/api/schedules/registrar-requests?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      const list: RegistrarRequestDoc[] = Array.isArray(data.requests) ? data.requests : [];
      setDocs(list); setCanTick(Boolean(data.canTick));
      setOpenId(current => (current && list.some(doc => doc.id === current)) ? current : (list[0]?.id || null));
    } catch (e: any) { setDocs([]); setError(e?.message || "تعذّرت قراءة التقارير"); }
  }, [collegeId, sectionId, termId]);
  useEffect(() => { setDocs(null); setOpenId(null); setError(null); void load(); }, [load]);

  const index = useMemo(() => (docs || []).findIndex(doc => doc.id === openId), [docs, openId]);
  const saved = index >= 0 ? docs![index] : null;
  const previous = index >= 0 ? docs![index + 1] || null : null;

  /* ── آخرُ تقريرٍ يُقرأ على جدولنا الآن: ملفُّ التسجيل نفسه، وجدولُنا لحظة الفتح ── */
  const latestId = docs?.[0]?.id || null;
  const [live, setLive] = useState<{ id: string; view: LiveRequestView | null } | null>(null);
  const [view, setView] = useState<"now" | "saved">("now");
  useEffect(() => {
    if (!latestId) { setLive(null); return; }
    let alive = true;
    setLive(null);
    call(`/api/schedules/registrar-requests/${encodeURIComponent(latestId)}/live`)
      .then(data => { if (alive) setLive({ id: latestId, view: data?.live || null }); })
      .catch(() => { if (alive) setLive({ id: latestId, view: null }); });
    return () => { alive = false; };
  }, [latestId, docs?.[0]?.at]);
  const liveView = live && saved && live.id === saved.id ? live.view : null;
  const liveLoading = Boolean(saved && saved.id === latestId && (!live || live.id !== saved.id));
  const showingNow = Boolean(liveView && view === "now");
  const open: RegistrarRequestDoc | null = saved && showingNow && liveView
    ? { ...saved, items: liveView.items, counts: liveView.counts, reviewCount: liveView.reviewCount }
    : saved;
  /* طباعةٌ من قائمة المتصفّح (مشاركة ← طباعة في iPhone) لا تمرّ بزرّ «طباعة»: تأخذ الورقةُ سماتها هنا،
     وإلا خرجت بلا تدويرٍ عموداً ضيقاً بعرض الشاشة ومعها أوراقٌ أخرى. */
  const hasSheet = Boolean(open);
  useEffect(() => {
    if (!hasSheet) return;
    const onBefore = () => { if (!document.documentElement.dataset.printKind) armRegistrarPrint(); };
    window.addEventListener("beforeprint", onBefore);
    return () => window.removeEventListener("beforeprint", onBefore);
  }, [hasSheet]);
  /* الرقمُ المدني: ما أرسله الخادمُ مع القراءة الحيّة (لمن يقرأ فحوص القسم) أولاً — وصلاحيةُ القارئ في الدليل الذي يحمّله الاستعلام بعده. */
  const civilFor = useMemo(() => {
    const served = showingNow ? liveView?.civils : undefined;
    if (served) return (id: number) => served[String(id)] || "";
    return civilOf;
  }, [showingNow, liveView, civilOf]);
  const sinceCount = useMemo(() => showingNow ? (open?.items || []).filter(item => item.since).length : 0, [showingNow, open]);

  const progress = useMemo(() => open ? requestProgress(open.items) : null, [open]);
  /* ورقةُ «ملاحظات على ملف التسجيل»: الورقةُ نفسها بتقصيرهم وحده؛ تُرسم ثم تُطبع ثم تعود إلى الورقة الكاملة. */
  const [notesMode, setNotesMode] = useState(false);
  const printNotes = () => {
    setNotesMode(true);
    const back = () => { setNotesMode(false); window.removeEventListener("afterprint", back); };
    window.addEventListener("afterprint", back);
    window.setTimeout(printRegistrarRequest, 80);
    window.setTimeout(back, 5000);
  };
  const byAction = useMemo(() => {
    const out: Record<RequestAction, number> = { edit: 0, add: 0, delete: 0 };
    for (const item of open?.items || []) out[item.action]++;
    return out;
  }, [open]);
  /* ما بين التقرير وسابقه، بمفتاح البند: ما زال، وما استجدّ. */
  const drift = useMemo(() => {
    if (!open || !previous) return null;
    const before = new Set(previous.items.map(item => item.id)), now = new Set(open.items.map(item => item.id));
    return { gone: previous.items.filter(item => !now.has(item.id)).length, fresh: open.items.filter(item => !before.has(item.id)).length, kept: open.items.filter(item => before.has(item.id)).length };
  }, [open, previous]);

  if (docs === null) return <MicroLoader label="يقرأ تقارير المطابقة…" />;
  if (!sectionId) return <EmptyState title="اختر القسم" detail="تقارير مطابقة التسجيل تُقرأ لقسمٍ واحد." />;
  if (!docs.length) {
    return (
      <section className="rpr">
        {error ? <Notice type="error">{error}</Notice> : null}
        <EmptyState
          title="لا تقرير مطابقة بعد"
          detail="ارفع ملف التسجيل من «أدوات الجدول ← الملفات ← افحص جدول التسجيل» ثم اضغط «احفظ طلب التعديل»؛ يظهر هنا بتاريخه."
        />
      </section>
    );
  }

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
    const open = saved;
    if (!open) return;
    const ok = await visualConfirm({ title: "حذف تقرير المطابقة", message: `يُحذف تقرير ${requestDay(open.at)} (${countOf(open.items.length, AR.item)}) ولا يعود يظهر للتسجيل.`, confirmLabel: "احذف التقرير", tone: "danger", safeCancel: true });
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      await call(`/api/schedules/registrar-requests/${encodeURIComponent(open.id)}`, { method: "DELETE" });
      const rest = (docs || []).filter(doc => doc.id !== open.id);
      setDocs(rest); setOpenId(rest[0]?.id || null);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const exportIt = async () => {
    if (!open) return;
    setBusy(true);
    try { await downloadSheets(exportFileName(["مطابقة التسجيل", scopeLine, requestDay(open.at)]), [sheetOf(open)]); }
    catch { setError("تعذّر إنشاء ملف Excel."); } finally { setBusy(false); }
  };

  const total = open?.items.length || 0;
  const shown = (action: RequestAction) => (open?.items || []).filter(item => item.action === action && (!pendingOnly || !(item.done || item.state === "confirmed")));

  return (
    <section className="rpr" aria-label="تقرير مطابقة التسجيل">
      {/* ── أرشيف التقارير بتواريخها ── */}
      <div className="rpr-archive">
        <h3><History aria-hidden="true" /> تقارير المطابقة <small dir="ltr">{docs.length}</small></h3>
        <div className="rpr-timeline" role="tablist" aria-label="تقارير مطابقة التسجيل بتواريخها">
          {docs.map(doc => {
            const p = requestProgress(doc.items);
            const counts = { edit: 0, add: 0, delete: 0 } as Record<RequestAction, number>;
            for (const item of doc.items) counts[item.action]++;
            return (
              <button
                key={doc.id} type="button" role="tab" className="rpr-date" aria-selected={doc.id === openId}
                data-complete={p.total > 0 && p.done === p.total ? "" : undefined}
                data-guide-ignore="يفتح تقرير مطابقة التسجيل المحفوظ بتاريخه — قراءةٌ لا فعل"
                onClick={() => setOpenId(doc.id)}
              >
                <span className="rpr-date-cal"><b>{dayNumber(doc.at)}</b><i>{monthOf(doc.at)}</i></span>
                <span className="rpr-date-body">
                  <span className="rpr-dots" aria-hidden="true">{ACTIONS.map(a => counts[a] ? <em key={a} data-action={a}>{counts[a]}</em> : null)}</span>
                  <small><bdi dir="auto">{doc.fileName}</bdi></small>
                </span>
                <Ring done={p.done} total={p.total} />
              </button>
            );
          })}
        </div>
      </div>

      {error ? <Notice type="error">{error}</Notice> : null}

      {open && progress ? (
        <div className="rpr-open" role="tabpanel" aria-label={`تقرير ${requestDay(open.at)}`}>
          {/* ── الرأس والإجراءات ── */}
          <header className="rpr-hero">
            <span className="rpr-hero-icon"><ClipboardCheck aria-hidden="true" /></span>
            <div>
              <h2>مطابقة التسجيل · {requestDay(open.at)}</h2>
              <p>{scopeLine}</p>
              <p><bdi dir="auto">{open.fileName}</bdi>{open.byName ? ` · حفظه ${open.byName}` : ""}{open.round ? ` · الجولة ${open.round}` : ""}</p>
            </div>
            <div className="rpr-actions">
              <SecondaryButton type="button" data-guide-ignore="يطبع تقرير المطابقة صفحةً واحدة — قراءةٌ لا تغيّر شيئاً" onClick={printRegistrarRequest}><Printer aria-hidden="true" /> طباعة</SecondaryButton>
              {open.items.some(isTheirs) ? <SecondaryButton type="button" data-guide-ignore="يطبع ورقة «ملاحظات على ملف التسجيل» للتسجيل: ما أُرسل ولم يظهر في ملفهم وحده — قراءةٌ لا تغيّر شيئاً" onClick={printNotes}><ScrollText aria-hidden="true" /> ملاحظاتهم للتسجيل</SecondaryButton> : null}
              <SecondaryButton type="button" disabled={busy} data-guide-ignore="ينزّل تقرير المطابقة ملف Excel — قراءةٌ لا تغيّر شيئاً" onClick={() => void exportIt()}><FileSpreadsheet aria-hidden="true" /> Excel</SecondaryButton>
              {canDelete ? <GhostButton type="button" disabled={busy} data-guide-ignore="يحذف تقرير المطابقة المحفوظ بعد التأكيد" onClick={() => void remove()}><Trash2 aria-hidden="true" /> احذف</GhostButton> : null}
            </div>
          </header>

          {/* ── على جدولكم الآن، أو كما حُفظ ── */}
          {saved && saved.id === latestId ? (
            <div className="rpr-live" data-state={liveLoading ? "loading" : liveView ? "live" : "saved"} role="status">
              <span className="rpr-live-dot" aria-hidden="true" />
              <p>
                <span>{liveLoading ? "يحسب التقرير على جدولكم الآن…"
                  : liveView && showingNow ? <>محسوبٌ على جدولكم <b>الآن</b>، مقابل ملف التسجيل المرفوع في {requestDay(saved.at)}.</>
                  : liveView ? <>كما حُفظ يوم الفحص، {requestDay(saved.at)}.</>
                  : <>كما حُفظ في {requestDay(saved.at)}. ليُحسب على جدولكم الآن متى فُتح، ارفع ملف التسجيل مرةً واحدة واحفظه.</>}</span>
                {liveView && showingNow && (sinceCount || liveView.gone) ? (
                  <small>
                    منذ الفحص: {sinceCount ? <b data-tone="new">{countOf(sinceCount, AR.change)} في جدولنا</b> : null}
                    {sinceCount && liveView.gone ? " · " : null}
                    {liveView.gone ? <b data-tone="ok">زال {countOf(liveView.gone, AR.item)}</b> : null}
                  </small>
                ) : null}
              </p>
              {liveView ? (
                <div className="rpr-live-switch" role="radiogroup" aria-label="طريقة عرض التقرير">
                  <button type="button" role="radio" aria-checked={view === "now"} data-guide-ignore="يعرض التقرير محسوباً على الجدول الآن — عرضٌ لا فعل" onClick={() => setView("now")}>الآن</button>
                  <button type="button" role="radio" aria-checked={view === "saved"} data-guide-ignore="يعرض التقرير كما حُفظ يوم الفحص — عرضٌ لا فعل" onClick={() => setView("saved")}>يوم الفحص</button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── المؤشرات ── */}
          <div className="rpr-kpis">
            <div className="rpr-kpi" data-tone="total"><ArrowLeftRight aria-hidden="true" /><b>{total}</b><span>المجموع</span></div>
            <div className="rpr-kpi" data-tone="done"><CheckCircle2 aria-hidden="true" /><b>{progress.done}</b><span>نُفّذت</span></div>
            <div className="rpr-kpi" data-tone="open"><CircleDashed aria-hidden="true" /><b>{progress.open}</b><span>تنتظر</span></div>
            <div className="rpr-kpi" data-tone="sure"><ShieldCheck aria-hidden="true" /><b>{progress.confirmed}</b><span>تأكّدت من الملف</span></div>
          </div>

          {/* ── الأنواع بألوانها: كهرمانيّ وأخضر وأحمر (وهي مرشّحٌ للعرض) ── */}
          <div className="rpr-legend">
            {ACTIONS.map(a => (
              <button
                key={a} type="button" data-action={a} aria-pressed={only === a} disabled={!byAction[a]}
                data-guide-ignore="يقصر العرض على نوعٍ واحد من الفروق — عرضٌ لا فعل"
                onClick={() => setOnly(current => current === a ? "all" : a)}
              >{ACTION_ICON[a]}<b>{REQUEST_ACTION_LABEL[a]}</b><small>{byAction[a]}</small></button>
            ))}
            <label className="rpr-switch">
              <input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} />
              <span>الباقي فقط</span>
            </label>
          </div>

          {/* ── ما تغيّر عن التقرير السابق ── */}
          {drift && !showingNow ? (
            <p className="rpr-drift">
              <Sparkles aria-hidden="true" />
              عن تقرير {requestDay(previous!.at)}: <b data-tone="ok">{drift.gone} زالت</b> · <b data-tone="warn">{drift.kept} بقيت</b> · <b data-tone="new">{drift.fresh} جديدة</b>
            </p>
          ) : null}

          {/* ── الفروق بألوانها ── */}
          {ACTIONS.filter(a => only === "all" || only === a).map(action => {
            const list = shown(action);
            if (!byAction[action]) return null;
            return (
              <section key={action} className="rpr-group" data-action={action}>
                <header>
                  <span className="rpr-group-icon">{ACTION_ICON[action]}</span>
                  <h4>{REQUEST_ACTION_LABEL[action]} <bdi dir="ltr">({byAction[action]})</bdi></h4>
                  <small>{ACTION_HINT[action]}</small>
                </header>
                {list.length
                  ? <ul>{list.map(item => <ItemLine key={item.id} item={item} canTick={canTick && !showingNow} busy={busy} onTick={(it, done) => void tick(it, done)} />)}</ul>
                  : <p className="rpr-clear"><CheckCircle2 aria-hidden="true" /> نُفّذ كلُّ ما في هذا النوع.</p>}
              </section>
            );
          })}
          {open.reviewCount ? <p className="rpr-note">{countOf(open.reviewCount, AR.section)} احتاجت نظر القسم فلم تُدرج في التقرير.</p> : null}
          <PrintPortal className="registrar-request-print-host"><RequestSheet doc={open} scopeLine={scopeLine} college={college} theirsOnly={notesMode} history={docs || []} asOf={showingNow ? liveView?.at : undefined} civilOf={civilFor} /></PrintPortal>
        </div>
      ) : null}
    </section>
  );
}
