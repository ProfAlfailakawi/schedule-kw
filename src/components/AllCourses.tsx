/**
 * ── 📚 كل المقررات ──
 * كل مقررات صحائف القسم — المطروح منها وغير المطروح — في لسانين: «الصحيفة الجديدة»
 * و«الصحيفة القديمة». لكل مقرر شعبُه ومقاعدُه ومتبقّيه (من كشف المتبقي المستورد للفصل،
 * وإلا من الرادار)، و«لم يسجّلوا» من الكشف نفسه، وزرّا
 * «− شعبة» و«+ شعبة» يُريان الأثر فوراً: المقاعد مقابل الطلب، ومن يبقى بلا مقعد،
 * ونصابُ الأستاذ، وضغطُ القاعة. لا يُكتب شيءٌ حتى «اعتمد» صريحٍ في منضدة السيناريو.
 * المحرّك هو محرّك محاكي الشعب نفسه (src/utils/timeMachine.ts عبر courseWhatIf.ts).
 * وعلى كل مقررٍ وسمُ «وصلنا ✓ / لم نصل بعد 🔒» وسلسلةُ متطلباته (src/utils/courseReach.ts)، و«افتحه للطرح».
 */
import React, { useMemo, useState } from "react";
import { FileSpreadsheet, FileUp, Minus, Plus, Radar, Search, Undo2, UserRoundCheck, UserX, X } from "lucide-react";
import { applyChanges, boardOf, type TmChange, type TmScenarioRecord } from "../utils/timeMachine";
import { addOneSection, courseSeatStats, DEMAND_WORD, netSectionDelta, removeOneSection, type CourseImpact, type CourseSeatStat } from "../utils/courseWhatIf";
import { inNewSheet, inOldSheet, SHEET_TAG_LABEL, type SheetTag } from "../utils/sheetTag";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import ScenarioWorkbench from "./ScenarioWorkbench";
import { ReachChain, ReachChip, ReachOpenButton, useCourseReach } from "./CourseReach";
import type { CourseReach } from "../utils/courseReach";
import { Ico, Loading, useTimeMachineContext, type LoadedContext } from "./timeMachineShared";
import { useCourseSheets, type SheetCourse } from "./useCourseSheets";
import "../styles/39-sections-courses.css";

type Sheet = "new" | "old" | "all";
type Show = "all" | "offered" | "missing" | "short";
const hours = (minutes: number) => Math.round(minutes / 6) / 10;

export function AllCoursesBody({ context, reload, onImportStats }: { context: LoadedContext; reload: () => void; onImportStats?: () => void }) {
  const sheets = useCourseSheets(Number(context.scope.sectionId));
  const reach = useCourseReach(Number(context.scope.collegeId), Number(context.scope.sectionId), Number(context.scope.termId));
  const [changes, setChanges] = useState<TmChange[]>([]);
  const [scenario, setScenario] = useState<TmScenarioRecord | null>(null);
  const [impacts, setImpacts] = useState<Record<number, CourseImpact | { none: "add" | "remove" }>>({});
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [query, setQuery] = useState("");

  const base = useMemo(() => boardOf(context), [context]);
  const board = useMemo(() => applyChanges(base, changes), [base, changes]);

  /* مقرراتُ الصحائف: كلُّ مقررٍ في صحيفةٍ حيّة؛ وقسمٌ بلا صحائف: مقرراتُه التشغيلية كلّها. */
  const catalogue = useMemo(() => {
    const operational = new Map(context.courses.map(course => [Number(course.AdCourseId), course] as const));
    const tagged = (sheets.courses || []).filter(course => operational.has(Number(course.AdCourseId)));
    const list: Array<{ course: SheetCourse; tag: SheetTag }> = sheets.hasPlans
      ? tagged.map(course => ({ course, tag: sheets.tags.get(Number(course.AdCourseId)) ?? null })).filter(item => inNewSheet(item.tag) || inOldSheet(item.tag))
      : [...operational.values()].map(course => ({ course: course as SheetCourse, tag: null }));
    return list.sort((a, b) => String(a.course.CourseCode).localeCompare(String(b.course.CourseCode), "ar", { numeric: true }));
  }, [context.courses, sheets]);
  const ids = useMemo(() => catalogue.map(item => Number(item.course.AdCourseId)), [catalogue]);
  const statsNow = useMemo(() => courseSeatStats(base, context, ids), [base, context, ids]);
  const statsAfter = useMemo(() => courseSeatStats(board, context, ids), [board, context, ids]);

  const counts = { new: catalogue.filter(item => inNewSheet(item.tag)).length, old: catalogue.filter(item => inOldSheet(item.tag)).length };
  const activeSheet: Sheet = !sheets.hasPlans ? "all" : sheet ?? (counts.new ? "new" : "old");
  const text = query.trim().toLowerCase();
  const shown = catalogue.filter(({ course, tag }) => {
    if (activeSheet === "new" && !inNewSheet(tag)) return false;
    if (activeSheet === "old" && !inOldSheet(tag)) return false;
    if (text && !`${course.CourseCode} ${course.CourseName}`.toLowerCase().includes(text)) return false;
    const stat = statsAfter.get(Number(course.AdCourseId));
    if (show === "offered") return Boolean(stat?.sections);
    if (show === "missing") return !stat?.sections;
    if (show === "short") return Boolean(stat?.withoutSeat);
    return true;
  });
  const scoped = catalogue.filter(({ tag }) => activeSheet === "all" || (activeSheet === "new" ? inNewSheet(tag) : inOldSheet(tag)));
  const sum = (pick: (stat: CourseSeatStat) => number | null) => scoped.reduce((n, { course }) => n + Number(pick(statsAfter.get(Number(course.AdCourseId))!) || 0), 0);
  /* إجماليُّ الطلبة من كشف المتبقي للقسم في هذا الفصل؛ والرادار بديلٌ حين لا كشف. */
  const report = context.registration || null;
  /* الإجماليُّ من مصدرٍ واحد: الكشف إن وُجد، وإلا الرادار — لا يُجمع رقمُ كشفٍ إلى رقم رادار. */
  const primary: CourseSeatStat["demandSource"] = report?.remaining ? "remaining" : report?.unregistered ? "unregistered" : context.demand ? "radar" : null;
  const fromPrimary = (pick: (stat: CourseSeatStat) => number | null) => (stat: CourseSeatStat) => (stat.demandSource === primary ? pick(stat) : 0);
  const totals = {
    courses: scoped.length,
    offered: scoped.filter(({ course }) => statsAfter.get(Number(course.AdCourseId))?.sections).length,
    sections: sum(stat => stat.sections),
    seats: sum(stat => stat.seats),
    demand: primary ? sum(fromPrimary(stat => stat.demand)) : null,
    unregistered: primary === "remaining" && report?.unregistered ? sum(stat => stat.unregistered) : null,
    withoutSeat: primary ? sum(fromPrimary(stat => stat.withoutSeat)) : null,
  };
  const demandLabel = DEMAND_WORD[primary || "remaining"];
  const importedOn = report?.importedAt ? new Date(report.importedAt).toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "short" }) : "";

  const act = (courseId: number, kind: "add" | "remove") => {
    const impact = kind === "add" ? addOneSection(board, courseId, context) : removeOneSection(board, courseId, context);
    if (!impact) { setImpacts(current => ({ ...current, [courseId]: { none: kind } })); return; }
    setChanges(list => [...list, impact.change]);
    setImpacts(current => ({ ...current, [courseId]: impact }));
  };
  const undo = (change: TmChange) => {
    setChanges(list => list.filter(item => item.id !== change.id));
    setImpacts(current => {
      const next: typeof current = {};
      for (const [key, value] of Object.entries(current) as Array<[string, CourseImpact | { none: "add" | "remove" }]>) {
        if (!("change" in value) || value.change.id !== change.id) next[Number(key)] = value;
      }
      return next;
    });
  };

  if (sheets.courses === null) return <Loading />;
  return (
    <div className="ac">
      <ul className="tm-kpis ac-kpis" aria-label="ملخص المقررات">
        <li><Ico n="sections" className="tm-kpi-ico" /><b>{totals.offered}<small>/{totals.courses}</small></b><small>{nounFor(totals.courses, AR.course)} مطروحة</small></li>
        <li><Ico n="sections" className="tm-kpi-ico" /><b>{totals.sections}</b><small>{nounFor(totals.sections, AR.section)}</small></li>
        <li><Ico n="seats" className="tm-kpi-ico" /><b>{totals.seats}</b><small>{nounFor(totals.seats, AR.seat)}</small></li>
        <li className="ac-kpi-demand" data-ac-total="demand"><Ico n="students" className="tm-kpi-ico" /><b>{totals.demand ?? "—"}</b><small>{demandLabel}</small></li>
        <li className={totals.withoutSeat ? "is-warn" : ""} data-ac-total="without-seat"><UserX aria-hidden="true" className="tm-ico tm-kpi-ico" /><b>{totals.withoutSeat ?? "—"}</b><small>بلا مقعد</small></li>
      </ul>

      {/* مصدرُ أرقام الطلبة في سطرٍ واحد: الكشف المستورد، أو دعوةٌ لاستيراده. */}
      {report ? (
        <p className="ac-source" data-ac-source="report">
          <FileSpreadsheet aria-hidden="true" />
          <span>كشف المتبقي{report.fileName ? <> · <bdi>{report.fileName}</bdi></> : null}{importedOn ? ` · ${importedOn}` : ""}</span>
          {totals.unregistered !== null ? <em><UserRoundCheck aria-hidden="true" />{totals.unregistered} لم يسجّلوا</em> : null}
          {context.demand ? <em><Radar aria-hidden="true" />الرادار متاح</em> : null}
        </p>
      ) : (
        <p className="ac-source is-missing" data-ac-source="missing" role="status">
          <FileSpreadsheet aria-hidden="true" />
          <span>لا كشف تسجيل لهذا الفصل{context.demand ? " · الأرقام من الرادار" : ""}</span>
          {onImportStats ? <button type="button" onClick={onImportStats} data-guide-ignore="انتقالٌ إلى «تخطيط الشعب» لاستيراد كشف المتبقي"><FileUp aria-hidden="true" />استورد الكشف</button> : null}
        </p>
      )}

      {sheets.hasPlans ? (
        <div className="ac-sheets" role="tablist" aria-label="الصحيفة">
          <button type="button" role="tab" aria-selected={activeSheet === "new"} className={activeSheet === "new" ? "on" : ""} onClick={() => setSheet("new")} data-guide-ignore="لسانٌ داخل «كل المقررات»؛ عرضٌ فقط">
            <span aria-hidden="true">🆕</span>الصحيفة الجديدة<em>{counts.new}</em></button>
          <button type="button" role="tab" aria-selected={activeSheet === "old"} className={activeSheet === "old" ? "on" : ""} onClick={() => setSheet("old")} data-guide-ignore="لسانٌ داخل «كل المقررات»؛ عرضٌ فقط">
            <span aria-hidden="true">📘</span>الصحيفة القديمة<em>{counts.old}</em></button>
        </div>
      ) : <p className="tm-note">لا صحائف للقسم بعد: هذه مقرراته الحالية كلّها.</p>}

      <div className="tm-filters">
        <label className="tm-search"><Search aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="مقرر أو رمز…" aria-label="بحث في المقررات" data-guide-ignore="بحثٌ داخل «كل المقررات»؛ لا يكتب" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="مسح" data-guide-ignore="مسح البحث"><X /></button> : null}</label>
        <div className="tm-chips" role="group" aria-label="عرض">
          {([["all", "الكل"], ["offered", "مطروحة"], ["missing", "غير مطروحة"], ["short", "عجز مقاعد"]] as Array<[Show, string]>).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={show === value} className={show === value ? "on" : ""} onClick={() => setShow(value)} data-guide-ignore="تصفية «كل المقررات»؛ عرضٌ فقط">{label}</button>
          ))}
        </div>
        <span className="tm-count">{shown.length}/{scoped.length}</span>
      </div>

      <div className="ac-list">
        {shown.map(({ course, tag }) => {
          const id = Number(course.AdCourseId);
          const now = statsNow.get(id)!, after = statsAfter.get(id)!;
          const delta = netSectionDelta(base, board, context, id);
          const impact = impacts[id];
          return <CourseCard key={id} code={String(course.CourseCode || "")} name={String(course.CourseName || "")} tag={tag} now={now} after={after} delta={delta}
            impact={impact && "change" in impact ? impact : null} none={impact && "none" in impact ? impact.none : null}
            reach={reach.data?.courses?.[id] || null} reachBusy={reach.busy === id} onReach={open => void reach.setOpen(id, open)}
            onAdd={() => act(id, "add")} onRemove={() => act(id, "remove")} onUndo={change => undo(change)} />;
        })}
        {!shown.length ? <p className="tm-note">لا مقررات بهذا الوصف</p> : null}
      </div>

      <h3 className="tm-basket-title"><Ico n="basket" />سلة التغييرات {changes.length ? <span>{changes.length}</span> : null}</h3>
      {changes.length ? (
        <ul className="tm-basket">
          {changes.map(change => <li key={change.id}><span>{change.label}</span><button type="button" onClick={() => undo(change)} aria-label="أزل من السلة" data-guide-ignore="إزالة تغييرٍ افتراضي من السلة"><X /></button></li>)}
        </ul>
      ) : <p className="tm-note">اضغط «− شعبة» أو «+ شعبة» على أي مقرر لترى أثره فوراً؛ لا يُكتب شيء قبل «اعتمد».</p>}
      {changes.length ? <ScenarioWorkbench context={context} changes={changes} mode="sections" scenario={scenario} onScenario={setScenario}
        defaultName="كل المقررات" onDiscard={() => { setChanges([]); setScenario(null); setImpacts({}); }} onApplied={reload} /> : null}
    </div>
  );
}

function CourseCard({ code, name, tag, now, after, delta, impact, none, onAdd, onRemove, onUndo, reach, reachBusy, onReach }: {
  key?: number; code: string; name: string; tag: SheetTag; now: CourseSeatStat; after: CourseSeatStat; delta: number;
  impact: CourseImpact | null; none: "add" | "remove" | null; onAdd: () => void; onRemove: () => void; onUndo: (change: TmChange) => void;
  reach: CourseReach | null; reachBusy: boolean; onReach: (open: boolean) => void;
}) {
  const demand = after.demand;
  const scale = Math.max(1, after.seats, now.seats, demand || 0);
  const tone = !after.sections ? (demand ? "is-short" : "is-missing") : after.withoutSeat ? "is-short" : demand !== null && after.seats >= demand ? "is-ok" : "";
  const demandWord = DEMAND_WORD[after.demandSource || "remaining"];
  const fill = demand ? Math.min(100, Math.round((after.seats / demand) * 100)) : null;
  return (
    <article className={`ac-course ${tone} ${delta ? "is-changed" : ""}`}>
      <header className="ac-head">
        <span className="ac-code"><b>{code}</b>{delta ? <em dir="ltr" className={delta > 0 ? "up" : "down"}>{delta > 0 ? `+${delta}` : `−${-delta}`}</em> : null}</span>
        <span className="ac-name">{name}</span>
        {tag && tag !== "service" ? <span className={`ac-tag ac-tag-${tag}`}>{tag === "new" ? "🆕 " : ""}{SHEET_TAG_LABEL[tag]}</span> : null}
        <ReachChip reach={reach} />
      </header>
      {reach && (reach.state === "locked" || reach.overridden) ? (
        <div className="ac-reach" title={reach.reason || undefined}>
          <ReachChain reach={reach} />
          <ReachOpenButton reach={reach} busy={reachBusy} onToggle={onReach}
            data-guide-ignore="يفتح المقرر للطرح رغم «لم نصل بعد» (أو يعيده للقاعدة) — يُحفظ في حالة الطرح ويظهر في بطاقة الأستاذ" />
        </div>
      ) : null}
      <div className="ac-facts">
        <span className="ac-fact" title="الشعب"><Ico n="sections" /><b>{after.sections}</b><small>{after.sections ? nounFor(after.sections, AR.section) : "غير مطروح"}</small></span>
        <span className="ac-fact" title="المقاعد ذات السعة المعروفة"><Ico n="seats" /><b>{after.seats}</b><small>{after.unknownSections ? `+ ${after.unknownSections} غير محددة` : nounFor(after.seats, AR.seat)}</small></span>
        <span className="ac-fact" title={after.demandSource === "radar" ? "الطلب من رادار التسجيل" : after.demandSource === "unregistered" ? "من كشف عمادة التسجيل: لم يسجّلوا المقرر بعد" : "المتبقي من كشف عمادة التسجيل: من لم يجتز المقرر بعد"}><Ico n="students" /><b>{demand ?? "—"}</b><small>{demandWord}</small></span>
        <span className={`ac-fact ${after.withoutSeat ? "is-bad" : ""}`} title="طلبة بلا مقعد"><UserX aria-hidden="true" className="tm-ico tm-ico-remove" /><b>{after.withoutSeat ?? "—"}</b><small>بلا مقعد</small></span>
      </div>
      <div className="ac-bar" role="img" aria-label={`المقاعد ${after.seats}${demand !== null ? ` مقابل ${demandWord} ${demand}` : ""}`}>
        <i className="ac-bar-seats" style={{ width: `${Math.min(100, after.seats / scale * 100)}%` }} />
        {demand !== null ? <i className="ac-bar-demand" style={{ insetInlineStart: `${Math.min(100, demand / scale * 100)}%` }} /> : null}
      </div>
      {fill !== null || (after.unregistered !== null && after.demandSource === "remaining") || (after.wanted !== null && after.demandSource !== "radar") ? (
        <div className="ac-legend">
          {fill !== null ? <span className={fill >= 100 ? "is-ok" : "is-short"}><i className="ac-dot" aria-hidden="true" />{fill}٪ من {demandWord}</span> : null}
          {after.unregistered !== null && after.demandSource === "remaining" ? <span title="من كشف عمادة التسجيل: لم يسجّلوا المقرر بعد"><UserRoundCheck aria-hidden="true" />{after.unregistered} لم يسجّلوا</span> : null}
          {after.wanted !== null && after.demandSource !== "radar" ? <span title="الطلب من رادار التسجيل"><Radar aria-hidden="true" />{after.wanted} رادار</span> : null}
        </div>
      ) : null}
      <div className="ac-actions">
        <button type="button" className="ac-btn" onClick={onRemove} disabled={!after.sections} data-guide-ignore="«− شعبة» افتراضي؛ لا يكتب حتى الاعتماد"><Minus aria-hidden="true" />شعبة</button>
        <button type="button" className="ac-btn is-add" onClick={onAdd} data-guide-ignore="«+ شعبة» افتراضي؛ لا يكتب حتى الاعتماد"><Plus aria-hidden="true" />شعبة</button>
      </div>
      {none ? <p className="tm-note ac-none" role="status">{none === "add" ? "لا موضع خالٍ بلا تعارض لشعبةٍ جديدة" : "لا شعبة لتُحذف"}</p> : null}
      {impact ? <ImpactStrip impact={impact} onUndo={() => onUndo(impact.change)} /> : null}
    </article>
  );
}

function ImpactStrip({ impact, onUndo }: { impact: CourseImpact; onUndo: () => void }) {
  const b = impact.before, a = impact.after;
  const arrow = (x: React.ReactNode, y: React.ReactNode) => <b><bdi>{x}</bdi> ← <bdi>{y}</bdi></b>;
  const worse = (before: number | null, after: number | null) => before !== null && after !== null && after > before;
  return (
    <section className={`ac-impact is-${impact.kind}`} aria-label="الأثر">
      <header><span><Ico n={impact.kind === "add" ? "add" : "remove"} />{impact.kind === "add" ? "+ شعبة" : "− شعبة"} · {impact.what}</span>
        <button type="button" onClick={onUndo} aria-label="تراجع" title="تراجع" data-guide-ignore="تراجعٌ عن تغييرٍ افتراضي"><Undo2 /></button></header>
      <div className="ac-impact-grid">
        <div className={`tm-impact-tile ${a.seats < b.seats ? "is-bad" : a.seats > b.seats ? "is-good" : ""}`}><Ico n="seats" className="tm-tile-ico" />{arrow(b.seats, a.seats)}<small>المقاعد{a.demand !== null ? ` · ${DEMAND_WORD[a.demandSource || "remaining"]} ${a.demand}` : ""}</small></div>
        <div className={`tm-impact-tile ${worse(b.withoutSeat, a.withoutSeat) ? "is-bad" : a.withoutSeat !== null && b.withoutSeat !== null && a.withoutSeat < b.withoutSeat ? "is-good" : ""}`}><Ico n="students" className="tm-tile-ico" />{arrow(b.withoutSeat ?? "—", a.withoutSeat ?? "—")}<small>بلا مقعد</small></div>
        {impact.teacher ? (
          <div className={`tm-impact-tile ${impact.teacher.limit && impact.teacher.after > impact.teacher.limit ? "is-bad" : ""}`}><Ico n="teachers" className="tm-tile-ico" />{arrow(impact.teacher.before, impact.teacher.after)}
            <small>نصاب {impact.teacher.name}{impact.teacher.limit ? ` / ${impact.teacher.limit}` : ""}</small>
            {impact.teacher.limit ? <meter min={0} max={impact.teacher.limit} value={impact.teacher.after} aria-label="النصاب بعد" /> : null}</div>
        ) : <div className="tm-impact-tile"><Ico n="vacant" className="tm-tile-ico" /><b>—</b><small>هيئة تدريسية · يُسند لاحقاً</small></div>}
        {impact.room ? (
          <div className={`tm-impact-tile ${impact.room.after > impact.room.before ? "is-warn" : ""}`}><Ico n="rooms" className="tm-tile-ico" />{arrow(hours(impact.room.before), hours(impact.room.after))}
            <small>س/أسبوع · <bdi dir="ltr" className="ac-nowrap">{impact.room.label.replace(/-/g, "\u2011")}</bdi></small></div>
        ) : null}
      </div>
      {impact.newBlocking ? <p className="tm-note ac-warn" role="alert">{countOf(impact.newBlocking, AR.conflict)} جديد</p> : null}
    </section>
  );
}

/** «كل المقررات» مستقلاً: يقرأ نطاقه بنفسه. */
export default function AllCourses({ collegeId, sectionId, termId, onImportStats }: { collegeId?: number; sectionId?: number; termId?: number; onImportStats?: () => void }) {
  const { context, error, reload } = useTimeMachineContext({ collegeId, sectionId, termId });
  if (error) return <p className="tm-note" role="alert">{error}</p>;
  if (!context) return <Loading />;
  return <AllCoursesBody context={context} reload={reload} onImportStats={onImportStats} />;
}
