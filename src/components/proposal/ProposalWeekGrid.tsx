/**
 * ── جدولُ الأستاذ الأسبوعي (العنصر الأساسي في المساحة) ───────────────────────
 *
 * يُرسَم من البيانات نفسها في الحالتين: «الحالي» و«المقترح». في «المقترح» يُرى
 * الفرقُ على الجدول نفسه: ما أُضيف وما نُقل (مع «كان …») وما سيخرج (شبحاً
 * مشطوباً) وما بقي على حاله (هادئاً)، والشعبُ الشاغرة المتوافقة (منقّطة بزرّ
 * «أسند»). كلُّ حالةٍ بحدٍّ ورمزٍ ولونٍ معاً — لا باللون وحده.
 *
 * التخطيط يتبع عرضَ المساحة لا عرضَ الشاشة: شبكةٌ أسبوعية بعمود وقتٍ ثابت ورأسٍ
 * ثابت حين تتسع، ويومٌ واحدٌ بخطٍّ زمني وتبويبات أيام حين تضيق (الجوال ونافذةٌ
 * نصفُ عرض). المحاضراتُ المتداخلة تُرسم جنباً إلى جنب لا فوق بعضها.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Building2, CircleDashed, Eye, EyeOff, Hourglass, Lock, LogOut, MoveHorizontal, Plus, Repeat2,
  Sparkles, Trash2, Undo2, UserRoundPlus, X,
} from "lucide-react";
import type { StudyProposalDayKey } from "../../types";
import {
  PROPOSAL_DAY_KEYS, PROPOSAL_DAY_NAMES, PROPOSAL_DAY_SHORT, proposalChangeSet,
  type GridItem, type ProposalChange, type ProposalChangeSet, type ProposalFinding, type VacancyFit,
} from "../../utils/studyProposal";
import { timeToMinutes } from "../../utils/scheduleIntelligence";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "../../utils/scheduleTime";
import { minutesCompact, num, timeRange } from "./proposalFormat";
import { AR, countOf } from "../../utils/arabicCount";
import { campusChips } from "../../utils/campusChip";

/** وسمُ الموقع الصغير على الموعد (بنين/بنات/الكلية) — لا يُرسم إن كانت مواعيده كلُّها في كليةٍ واحدة. */
function CampusChip({ item, chips }: { item: GridItem; chips: ReadonlyMap<string, string> }) {
  const label = !item.outside && item.collegeName ? chips.get(String(item.collegeName).replace(/\s+/g, " ").trim()) : undefined;
  if (!label) return null;
  return <span className="sp-ev-campus" data-twin={item.twin || undefined} title={[item.collegeName, item.sectionName].filter(Boolean).join(" — ")}>{label}</span>;
}

export type GridMode = "current" | "with";

const SLOT = 30;
const SLOT_PX = 44;
const SNAP = 10;
/** أضيقُ عرضٍ تُقرأ فيه خمسةُ أعمدة؛ دونه يومٌ واحدٌ بخطٍّ زمني. */
const WEEK_MIN_WIDTH = 620;

/** شعبةٌ شاغرة («هيئة تدريسية») تُعرض على الجدول متاحةً للإسناد. */
export interface VacancyItem { item: GridItem; facultyId: number; fit: VacancyFit | "checking"; note?: string }

type Glyph = { text: string; Icon: React.ComponentType<any>; kind: string };

const CHANGE_GLYPH: Record<ProposalChange["kind"], Glyph> = {
  added: { text: "مضاف", Icon: Plus, kind: "added" },
  moved: { text: "منقول", Icon: MoveHorizontal, kind: "moved" },
  replaced: { text: "بديل", Icon: Repeat2, kind: "replaced" },
  removed: { text: "يخرج", Icon: LogOut, kind: "out" },
};

/** وسمُ الموعد: التعارضُ أولاً، ثم نوعُ التغيير. */
export function tagFor(item: GridItem, marks: { blocker: ReadonlySet<string>; review: ReadonlySet<string> }, change?: ProposalChange): Glyph | null {
  if (marks.blocker.has(item.key)) return { text: "تعارض", Icon: AlertTriangle, kind: "conflict" };
  if (item.state === "draft") return { text: "قيد الإعداد", Icon: CircleDashed, kind: "draft" };
  if (item.state === "outside") return { text: "خارج القسم", Icon: Lock, kind: "outside" };
  if (item.state === "out") return item.outAction === "delete" ? { text: "سيُحذف", Icon: Trash2, kind: "out" } : (change && change.kind !== "removed" ? { text: "كان هنا", Icon: Undo2, kind: "out" } : CHANGE_GLYPH.removed);
  if (marks.review.has(item.key)) return { text: "للمراجعة", Icon: Sparkles, kind: "review" };
  if (change) return CHANGE_GLYPH[change.kind];
  if (item.state === "proposed") return CHANGE_GLYPH.added;
  if (item.state === "modified") return CHANGE_GLYPH.moved;
  return null;
}

const shortSlot = (item: Pick<GridItem, "days" | "start">) =>
  `${PROPOSAL_DAY_KEYS.filter(day => item.days.includes(day)).map(day => PROPOSAL_DAY_SHORT[day]).join("·")} ${String(item.start).slice(0, 5)}`;

/** أقصرُ ما يقول «من أين/إلى أين»: ما تغيّر وحده (الأيام أو الوقت أو القاعة). */
function hintOf(change: ProposalChange, side: "before" | "after"): string {
  const it = change[side];
  if (!it) return "";
  if (change.kind === "replaced" && side === "before") return it.courseName;
  const bits: string[] = [];
  if (change.fields.includes("days") || !change.fields.length) bits.push(PROPOSAL_DAY_KEYS.filter(day => it.days.includes(day)).map(day => PROPOSAL_DAY_SHORT[day]).join("·"));
  if (change.fields.includes("time")) bits.push(String(it.start).slice(0, 5));
  if (!bits.length && change.fields.includes("place")) bits.push(it.place);
  return bits.join(" ") || shortSlot(it);
}

interface Laid { item: GridItem; day: StudyProposalDayKey; top: number; height: number; lane: number; lanes: number; vacancy?: VacancyItem }

function layout(entries: ReadonlyArray<{ item: GridItem; vacancy?: VacancyItem }>, winStart: number): Map<StudyProposalDayKey, Laid[]> {
  const out = new Map<StudyProposalDayKey, Laid[]>();
  for (const day of PROPOSAL_DAY_KEYS) {
    const list = entries
      .filter(entry => entry.item.days.includes(day))
      .map(entry => ({ ...entry, s: timeToMinutes(entry.item.start), e: Math.max(timeToMinutes(entry.item.end), timeToMinutes(entry.item.start) + 10) }))
      .sort((a, b) => a.s - b.s || a.e - b.e);
    const placed: Laid[] = [];
    let cluster: Array<{ laid: Laid; e: number }> = [];
    let clusterEnd = -1;
    const flush = () => {
      const lanes = Math.max(1, ...cluster.map(c => c.laid.lane + 1));
      cluster.forEach(c => { c.laid.lanes = lanes; });
      cluster = [];
    };
    for (const entry of list) {
      if (cluster.length && entry.s >= clusterEnd) { flush(); clusterEnd = -1; }
      const used = new Set(cluster.filter(c => c.e > entry.s).map(c => c.laid.lane));
      let lane = 0;
      while (used.has(lane)) lane += 1;
      const laid: Laid = {
        item: entry.item, vacancy: entry.vacancy, day, lane, lanes: 1,
        top: ((entry.s - winStart) / SLOT) * SLOT_PX,
        height: Math.max(30, ((entry.e - entry.s) / SLOT) * SLOT_PX - 4),
      };
      cluster.push({ laid, e: entry.e });
      clusterEnd = Math.max(clusterEnd, entry.e);
      placed.push(laid);
    }
    flush();
    out.set(day, placed);
  }
  return out;
}

export function windowFor(items: readonly GridItem[]) {
  let start = SCHEDULE_DAY_START, end = 16 * 60;
  for (const item of items) {
    start = Math.min(start, Math.floor(timeToMinutes(item.start) / 60) * 60);
    end = Math.max(end, Math.ceil(timeToMinutes(item.end) / 60) * 60);
  }
  start = Math.max(SCHEDULE_DAY_START, start);
  end = Math.min(SCHEDULE_DAY_END, Math.max(end, 16 * 60));
  return { start, end };
}

export interface WeekGridProps {
  mode: GridMode;
  onMode: (mode: GridMode) => void;
  showGhosts: boolean;
  onShowGhosts: (value: boolean) => void;
  currentItems: GridItem[];
  afterItems: GridItem[];
  ghosts: GridItem[];
  draft: GridItem | null;
  marks: { blocker: ReadonlySet<string>; review: ReadonlySet<string> };
  focusKeys: ReadonlySet<string>;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** سحبٌ (أو نقرٌ) على فراغ: اليوم وحدّا الوقت ومكانُ المؤشّر لتُفتح البطاقة عنده. */
  onPaint: (day: StudyProposalDayKey, start: number, end: number, x: number, y: number) => void;
  /** إضافةٌ إلى يومٍ بعينه من عرض اليوم الواحد حيث لا سحب. */
  onAddDay?: (day: StudyProposalDayKey) => void;
  /** عرضٌ للقراءة فقط (معاينة الإرسال والتثبيت): لا سحب ولا إضافة ولا إسناد. */
  readOnly?: boolean;
  checking: boolean;
  /** نتائج الفحص المتعلقة بالعنصر المختار. */
  findingsFor: (key: string) => ProposalFinding[];
  actionsFor: (item: GridItem) => Array<{ label: string; Icon: React.ComponentType<any>; run: () => void; tone?: "danger" }>;
  empty?: React.ReactNode;
  /** «grid» يُخفي ما لا يلزم المعاينة (الشواغر)؛ والتخطيط يتبع العرض دائماً. */
  variant?: "auto" | "grid" | "agenda";
  /** ما تغيّر (يُحسب من الجدولين إن لم يُمرَّر). */
  changes?: ProposalChangeSet;
  /** الشعب الشاغرة المتوافقة: تُرسم منقّطةً بزرّ «أسند». */
  vacancies?: VacancyItem[];
  showVacancies?: boolean;
  onShowVacancies?: (value: boolean) => void;
  onAssign?: (facultyId: number) => void;
}

export default function ProposalWeekGrid(props: WeekGridProps) {
  const { mode, onMode, showGhosts, onShowGhosts, currentItems, afterItems, ghosts, draft, marks, focusKeys, selectedKey, onSelect, onPaint, checking } = props;
  const variant = props.variant ?? "auto";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < WEEK_MIN_WIDTH + 40);
  const rootRef = useRef<HTMLElement>(null);
  /* الإبراز (selectedKey) يأتي من أي مكان؛ أما بطاقة التفاصيل فلا تُفتح إلا بنقرٍ على الموعد نفسه. */
  const [detailKey, setDetailKey] = useState<string | null>(null);
  useEffect(() => { if (!selectedKey) setDetailKey(null); }, [selectedKey]);
  const pick = (key: string) => { const next = selectedKey === key && detailKey === key ? null : key; onSelect(next); setDetailKey(next); };

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => setNarrow(entries[0].contentRect.width < WEEK_MIN_WIDTH));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const dayView = variant === "agenda" || narrow;

  const changes = useMemo(() => props.changes ?? proposalChangeSet(afterItems, ghosts), [props.changes, afterItems, ghosts]);
  /* جدولُه الكامل قد يجمع البنين والبنات وكلياتٍ أخرى: لكل موعدٍ وسمُ موقعه الصغير. */
  const chips = useMemo(() => campusChips([...currentItems, ...afterItems, ...ghosts].map(item => (item.outside ? "" : item.collegeName || ""))), [currentItems, afterItems, ghosts]);
  const withMode = mode === "with";
  const showVac = withMode && !props.readOnly && variant !== "grid" && Boolean(props.showVacancies) && Boolean(props.vacancies?.length);
  const vacancies = useMemo(() => (showVac ? (props.vacancies || []).filter(v => v.fit === "ready" || v.fit === "review" || v.fit === "checking") : []), [showVac, props.vacancies]);

  const base = withMode ? afterItems : currentItems;
  const ghostList = withMode && showGhosts ? ghosts : [];
  const all = useMemo(() => [...base, ...ghostList, ...(draft ? [draft] : []), ...vacancies.map(v => v.item)], [base, ghostList, draft, vacancies]);
  const win = useMemo(() => windowFor(all), [all]);
  /* الموضعُ القديم (سيخرج) والمحاضرةُ الجاري إعدادها طبقتان فوق الجدول لا تأخذان حارة. */
  const laid = useMemo(() => layout([...base.map(item => ({ item })), ...vacancies.map(v => ({ item: v.item, vacancy: v }))], win.start), [base, vacancies, win.start]);
  const overlays = useMemo(() => layout([...ghostList, ...(draft ? [draft] : [])].map(item => ({ item })), win.start), [ghostList, draft, win.start]);
  const selectedVacancy = vacancies.find(v => v.item.key === detailKey) || null;
  const selected = all.find(item => item.key === detailKey) || null;
  const rows = Math.ceil((win.end - win.start) / SLOT);
  const hours: number[] = [];
  for (let m = win.start; m < win.end; m += 60) hours.push(m);

  const changeOf = (item: GridItem) => (withMode ? changes.byKey.get(item.key) : undefined);
  const dayStats = useMemo(() => Object.fromEntries(PROPOSAL_DAY_KEYS.map(day => {
    const on = (item: GridItem) => item.days.includes(day);
    return [day, {
      count: base.filter(on).length,
      changed: withMode ? changes.all.filter(c => (c.after && on(c.after)) || (c.before && on(c.before))).length : 0,
      conflict: base.some(item => on(item) && marks.blocker.has(item.key)),
      open: vacancies.filter(v => on(v.item)).length,
    }];
  })) as Record<StudyProposalDayKey, { count: number; changed: number; conflict: boolean; open: number }>, [base, changes, withMode, marks, vacancies]);

  /* السحب على فراغٍ يرسم المدّة ثم يفتح البطاقة عند المؤشّر؛ والنقرُ وحده يعطي محاضرةً من خمسين دقيقة. */
  const [paint, setPaint] = useState<{ day: StudyProposalDayKey; from: number; to: number } | null>(null);
  const stroke = useRef<{ day: StudyProposalDayKey; anchor: number; rect: DOMRect; from: number; to: number } | null>(null);
  const minutesAt = (rect: DOMRect, clientY: number) => {
    const raw = win.start + (((clientY - rect.top) / SLOT_PX) * SLOT);
    return Math.max(SCHEDULE_DAY_START, Math.min(SCHEDULE_DAY_END, Math.round(raw / SNAP) * SNAP));
  };
  const beginPaint = (day: StudyProposalDayKey, event: React.PointerEvent<HTMLDivElement>) => {
    if (props.readOnly || event.target !== event.currentTarget || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = minutesAt(rect, event.clientY);
    stroke.current = { day, anchor, rect, from: anchor, to: anchor + 50 };
    setPaint({ day, from: anchor, to: anchor + 50 });
    const move = (e: PointerEvent) => {
      const s = stroke.current; if (!s) return;
      const m = minutesAt(s.rect, e.clientY);
      s.from = Math.min(s.anchor, m); s.to = Math.max(s.anchor, m);
      if (s.to - s.from < 30) s.to = s.from + 50;
      setPaint({ day: s.day, from: s.from, to: Math.min(SCHEDULE_DAY_END, s.to) });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
      const s = stroke.current; stroke.current = null; setPaint(null);
      if (s) onPaint(s.day, s.from, Math.min(SCHEDULE_DAY_END, s.to), e.clientX, e.clientY);
    };
    const cancel = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); stroke.current = null; setPaint(null); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
  };

  const labelOf = (item: GridItem, tag: Glyph | null, day?: StudyProposalDayKey) =>
    `${item.outside ? "التزام خارج القسم" : `${item.courseName}${item.SCode ? ` شعبة ${item.SCode}` : ""}`}، ${day ? PROPOSAL_DAY_NAMES[day] : ""} ${timeRange(item.start, item.end)}${tag ? `، ${tag.text}` : ""}`;

  /** سطرُ «كان/صار» تحت الموعد المنقول أو المستبدَل، وفوق موضعه القديم. */
  const fromLine = (item: GridItem, change?: ProposalChange) => {
    if (!change) return null;
    if (item.state === "out" && change.after) return <span className="sp-ev-from" title={shortSlot(change.after)}><ArrowLeft aria-hidden="true" /><bdi>{hintOf(change, "after")}</bdi></span>;
    if (item.state !== "out" && change.before) return <span className="sp-ev-from" title={shortSlot(change.before)}><Undo2 aria-hidden="true" /><bdi>{hintOf(change, "before")}</bdi></span>;
    return null;
  };

  const eventCard = (entry: Laid, overlay = false) => {
    const { item, vacancy } = entry;
    const change = changeOf(item);
    const tag = vacancy ? { text: vacancy.fit === "review" ? "شاغرة · للمراجعة" : "شاغرة", Icon: UserRoundPlus, kind: "vacant" } : tagFor(item, marks, change);
    const width = overlay ? 100 : 100 / entry.lanes;
    const compact = entry.height < 64 || (!overlay && entry.lanes > 2);
    const tiny = entry.height < 44;
    const style: React.CSSProperties = {
      insetBlockStart: entry.top, blockSize: entry.height,
      insetInlineStart: overlay ? 0 : `calc(${entry.lane * width}% + 2px)`, inlineSize: `calc(${width}% - 4px)`,
    };
    const dim = withMode && !vacancy && item.state === "current" && changes.all.length > 0;
    const card = (
      <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها"
        key={vacancy ? undefined : `${item.key}-${entry.day}`} type="button" className="sp-ev"
        data-state={vacancy ? "vacant" : item.state} data-change={change?.kind} data-fit={vacancy?.fit}
        data-conflict={marks.blocker.has(item.key) || undefined} data-review={marks.review.has(item.key) || undefined}
        data-selected={selectedKey === item.key || undefined} data-focus={focusKeys.has(item.key) || undefined} data-dim={dim || undefined}
        data-compact={compact || undefined} data-tiny={tiny || undefined} data-lanes={!overlay && entry.lanes > 1 ? entry.lanes : undefined}
        data-checking={checking && (item.state === "proposed" || item.state === "modified") || undefined} data-overlay={overlay || undefined}
        style={vacancy ? undefined : style}
        aria-pressed={selectedKey === item.key}
        aria-label={labelOf(item, tag, entry.day)}
        onClick={event => { event.stopPropagation(); pick(item.key); }}
      >
        <span className="sp-ev-top">
          {tag ? <span className="sp-glyph" data-kind={tag.kind} aria-hidden="true"><tag.Icon /></span> : null}
          <span className="sp-ev-title">{item.outside ? "التزام خارج القسم" : item.courseName || "موعد"}</span>
        </span>
        {!tiny && !item.outside ? (
          <span className="sp-ev-meta">{item.SCode ? <bdi className="sp-sec">{item.SCode}</bdi> : null}<bdi className="sp-time">{!overlay && entry.lanes > 1 ? String(item.start).slice(0, 5) : timeRange(item.start, item.end)}</bdi><CampusChip item={item} chips={chips} /></span>
        ) : null}
        {!tiny ? fromLine(item, change) : null}
        {!compact && !vacancy && item.place && !item.outside && item.state !== "out" ? <span className="sp-ev-place"><Building2 aria-hidden="true" />{item.place}</span> : null}
      </button>
    );
    if (!vacancy) return card;
    return (
      <div key={`${item.key}-${entry.day}`} className="sp-ev-wrap" style={style} data-fit={vacancy.fit}>
        {card}
        {props.onAssign && vacancy.fit !== "checking" ? (
          <button type="button" className="sp-ev-assign" data-round="true" onClick={event => { event.stopPropagation(); props.onAssign!(vacancy.facultyId); }}
            aria-label={`أسند ${item.courseName}، الشعبة ${item.SCode}، لهذا الأستاذ`} title="أسند لهذا الأستاذ" data-guide-ignore="يضيف إسناد الشعبة الشاغرة إلى المسودة — لا يكتب في الجدول">
            <Plus aria-hidden="true" /><span>أسند</span>
          </button>
        ) : null}
      </div>
    );
  };

  const legend = (
    <ul className="sp-legend" aria-label="دليل الألوان والرموز">
      <li data-kind="current"><i aria-hidden="true" />قائم</li>
      <li data-kind="added"><i aria-hidden="true"><Plus /></i>مضاف</li>
      <li data-kind="moved"><i aria-hidden="true"><MoveHorizontal /></i>منقول</li>
      <li data-kind="out"><i aria-hidden="true"><LogOut /></i>يخرج</li>
      <li data-kind="conflict"><i aria-hidden="true"><AlertTriangle /></i>تعارض</li>
      {showVac ? <li data-kind="vacant"><i aria-hidden="true"><UserRoundPlus /></i>شاغرة</li> : null}
    </ul>
  );

  const selectedChange = selected ? changeOf(selected) : undefined;
  const detail = selected ? (
    <aside className="sp-detail" role="region" aria-label="تفاصيل الموعد المحدد">
      <header>
        <div>
          <strong>{selected.outside ? "التزام خارج القسم" : selected.courseName}<CampusChip item={selected} chips={chips} /></strong>
          {!selected.outside && <small>{[selected.courseCode, selected.SCode ? `شعبة ${selected.SCode}` : ""].filter(Boolean).join(" · ")}</small>}
        </div>
        <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-icon-btn" onClick={() => { onSelect(null); setDetailKey(null); }} aria-label="إغلاق التفاصيل"><X aria-hidden="true" /></button>
      </header>
      {(() => {
        const tag = selectedVacancy ? { text: "شاغرة — هيئة تدريسية", Icon: UserRoundPlus, kind: "vacant" } : tagFor(selected, marks, selectedChange);
        return tag ? <span className="sp-tag" data-kind={tag.kind}><tag.Icon aria-hidden="true" />{tag.text}</span> : null;
      })()}
      {selectedChange?.before && selectedChange?.after ? (
        <div className="sp-compare-mini" aria-label="قبل وبعد">
          <SlotPill item={selectedChange.before} tone="before" fields={selectedChange.fields} />
          <ArrowLeft className="sp-compare-arrow" aria-hidden="true" />
          <SlotPill item={selectedChange.after} tone="after" fields={selectedChange.fields} />
        </div>
      ) : (
        <dl>
          <div><dt>الأيام</dt><dd>{selected.days.map(day => PROPOSAL_DAY_NAMES[day]).join("، ")}</dd></div>
          <div><dt>الوقت</dt><dd className="sp-time">{timeRange(selected.start, selected.end)}</dd></div>
          {!selected.outside && <div><dt>المكان</dt><dd>{selected.place || "—"}</dd></div>}
          {selected.collegeName && <div><dt>القسم</dt><dd>{[selected.collegeName, selected.sectionName].filter(Boolean).join(" · ")}</dd></div>}
        </dl>
      )}
      {selected.twin ? <p className="sp-detail-finding" data-kind="info"><Lock aria-hidden="true" /><span>موعده المسجّل بسجلٍّ آخر في سجلّ الأساتذة — يُرى هنا ضمن جدوله الكامل، ويُعدَّل من طلبه في موقعه.</span></p> : null}
      {selectedVacancy?.note ? <p className="sp-detail-finding" data-kind="review"><Sparkles aria-hidden="true" /><span>{selectedVacancy.note}</span></p> : null}
      {props.findingsFor(selected.key).map(finding => (
        <p key={finding.id} className="sp-detail-finding" data-kind={finding.kind}>
          <AlertTriangle aria-hidden="true" /><span><b>{finding.title}</b> {finding.detail}</span>
        </p>
      ))}
      <footer>
        {selectedVacancy && props.onAssign && selectedVacancy.fit !== "checking" ? (
          <button type="button" className="sp-chip-btn" data-primary onClick={() => { props.onAssign!(selectedVacancy.facultyId); onSelect(null); setDetailKey(null); }}
            data-guide-ignore="يضيف إسناد الشعبة الشاغرة إلى المسودة — لا يكتب في الجدول"><UserRoundPlus aria-hidden="true" />أسند لهذا الأستاذ</button>
        ) : null}
        {!selectedVacancy ? props.actionsFor(selected).map(action => (
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" key={action.label} type="button" className="sp-chip-btn" data-tone={action.tone} onClick={() => { setDetailKey(null); action.run(); }}><action.Icon aria-hidden="true" />{action.label}</button>
        )) : null}
      </footer>
    </aside>
  ) : null;

  const changeCount = withMode ? changes.all.length : 0;
  return (
    <section className="sp-week" ref={rootRef} aria-label="الجدول الأسبوعي للأستاذ" data-checking={checking || undefined} data-view={dayView ? "day" : "week"}>
      <div className="sp-week-bar">
        <div className="sp-seg" role="group" aria-label="عرض الجدول">
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" aria-pressed={mode === "current"} onClick={() => onMode("current")}>الحالي</button>
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" aria-pressed={withMode} onClick={() => onMode("with")}>
            المقترح{changeCount > 0 ? <span className="sp-count" aria-label={countOf(changeCount, AR.change)}>{num(changeCount)}</span> : null}
          </button>
        </div>
        {withMode && ghosts.length ? (
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-toggle" aria-pressed={showGhosts} onClick={() => onShowGhosts(!showGhosts)} title="إظهار ما سيخرج أو يتغيّر">
            {showGhosts ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}<span>الأصل</span>
          </button>
        ) : null}
        {withMode && !props.readOnly && variant !== "grid" && props.onShowVacancies && props.vacancies?.length ? (
          <button data-guide-ignore="يُظهر الشعب الشاغرة المتوافقة على الجدول — لا يكتب شيئاً" type="button" className="sp-toggle" data-kind="vacant" aria-pressed={Boolean(props.showVacancies)} onClick={() => props.onShowVacancies!(!props.showVacancies)} title="الشعب الشاغرة المتوافقة">
            <UserRoundPlus aria-hidden="true" /><span>شاغرة</span><span className="sp-count" data-tone="good">{num((props.vacancies || []).filter(v => v.fit === "ready" || v.fit === "review").length)}</span>
          </button>
        ) : null}
        <span className="sp-week-spacer" />
        {legend}
      </div>

      <div className="sp-week-body">
        {!all.length && props.empty ? <div className="sp-week-empty">{props.empty}</div> : null}
        {!dayView ? (
          <div className="sp-wk-scroll">
            <div className="sp-wk" role="group" aria-label="شبكة أيام الأسبوع" style={{ ["--sp-slot" as any]: `${SLOT_PX}px`, ["--sp-body-h" as any]: `${rows * SLOT_PX}px` }}>
              <span className="sp-wk-corner" aria-hidden="true" />
              {PROPOSAL_DAY_KEYS.map(day => {
                const stat = dayStats[day];
                return (
                  <span key={day} className="sp-wk-day" data-has={stat.count > 0 || undefined}>
                    <b>{PROPOSAL_DAY_NAMES[day]}</b>
                    <span className="sp-wk-day-stats">
                      <small className="sp-num">{stat.count ? num(stat.count) : "—"}</small>
                      {stat.changed ? <i className="sp-dot" data-tone={stat.conflict ? "bad" : "change"} title={countOf(stat.changed, AR.change)} /> : stat.conflict ? <i className="sp-dot" data-tone="bad" /> : null}
                      {stat.open ? <i className="sp-dot" data-tone="vacant" title="شاغرة متوافقة" /> : null}
                    </span>
                  </span>
                );
              })}
              <div className="sp-wk-hours" aria-hidden="true">
                {hours.map(m => <span key={m} style={{ insetBlockStart: ((m - win.start) / SLOT) * SLOT_PX }}>{String(Math.floor(m / 60)).padStart(2, "0")}:00</span>)}
              </div>
              {PROPOSAL_DAY_KEYS.map(day => (
                <div key={day} className="sp-col" data-day={day} data-readonly={props.readOnly || undefined} onPointerDown={event => beginPaint(day, event)} role="presentation">
                  {paint && paint.day === day ? <div className="sp-paint" aria-hidden="true" style={{ insetBlockStart: ((paint.from - win.start) / SLOT) * SLOT_PX, blockSize: ((paint.to - paint.from) / SLOT) * SLOT_PX }}><span>{String(Math.floor(paint.from / 60)).padStart(2, "0")}:{String(paint.from % 60).padStart(2, "0")} – {String(Math.floor(paint.to / 60)).padStart(2, "0")}:{String(paint.to % 60).padStart(2, "0")}</span></div> : null}
                  {(overlays.get(day) || []).map(entry => eventCard(entry, true))}
                  {(laid.get(day) || []).map(entry => eventCard(entry))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <DayView
            entries={[...base.map(item => ({ item })), ...ghostList.map(item => ({ item })), ...(draft ? [{ item: draft }] : []), ...vacancies.map(v => ({ item: v.item, vacancy: v }))]}
            stats={dayStats} marks={marks} changeOf={changeOf} chips={chips} selectedKey={detailKey} focusKeys={focusKeys} dimUnchanged={withMode && changes.all.length > 0}
            onSelect={key => pick(key)} onAddDay={props.readOnly ? undefined : props.onAddDay} onAssign={props.onAssign} preferDay={changes.all[0]?.after?.days[0] || changes.all[0]?.before?.days[0]}
          />
        )}
        {detail}
      </div>
    </section>
  );
}

function SlotPill({ item, tone, fields }: { item: GridItem; tone: "before" | "after"; fields: readonly string[] }) {
  return (
    <span className="sp-slot" data-tone={tone}>
      <b data-changed={fields.includes("days") || undefined}>{PROPOSAL_DAY_KEYS.filter(day => item.days.includes(day)).map(day => PROPOSAL_DAY_SHORT[day]).join(" · ")}</b>
      <bdi className="sp-time" data-changed={fields.includes("time") || undefined}>{timeRange(item.start, item.end)}</bdi>
      {item.place ? <small data-changed={fields.includes("place") || undefined}><Building2 aria-hidden="true" />{item.place}</small> : null}
    </span>
  );
}
export { SlotPill };

/** يومٌ واحدٌ بخطٍّ زمني: للجوال وللنافذة الضيّقة. الفراغاتُ بين المحاضرات تُرى ولا تُحسب في الرأس. */
function DayView({ entries, stats, marks, changeOf, chips, selectedKey, focusKeys, dimUnchanged, onSelect, onAddDay, onAssign, preferDay }: {
  entries: Array<{ item: GridItem; vacancy?: VacancyItem }>;
  chips: ReadonlyMap<string, string>;
  stats: Record<StudyProposalDayKey, { count: number; changed: number; conflict: boolean; open: number }>;
  marks: { blocker: ReadonlySet<string>; review: ReadonlySet<string> };
  changeOf: (item: GridItem) => ProposalChange | undefined;
  selectedKey: string | null; focusKeys: ReadonlySet<string>; dimUnchanged: boolean;
  onSelect: (key: string) => void;
  onAddDay?: (day: StudyProposalDayKey) => void;
  onAssign?: (facultyId: number) => void;
  preferDay?: StudyProposalDayKey;
}) {
  const firstBusy = PROPOSAL_DAY_KEYS.find(day => stats[day].changed) || preferDay || PROPOSAL_DAY_KEYS.find(day => stats[day].count) || "fsunday";
  const [active, setActive] = useState<StudyProposalDayKey>(firstBusy);
  const touched = useRef(false);
  useEffect(() => { if (!touched.current) setActive(firstBusy); }, [firstBusy]);
  const list = entries
    .filter(entry => entry.item.days.includes(active))
    .sort((a, b) => timeToMinutes(a.item.start) - timeToMinutes(b.item.start) || (a.item.state === "out" ? -1 : 0));
  const rows: React.ReactNode[] = [];
  let lastEnd: number | null = null;
  list.forEach((entry, index) => {
    const { item, vacancy } = entry;
    const s = timeToMinutes(item.start), e = timeToMinutes(item.end);
    const counts = item.state !== "out" && !vacancy && item.state !== "draft";
    if (counts && lastEnd !== null && s - lastEnd >= 30) {
      rows.push(<li key={`gap-${index}`} className="sp-tl-gap" aria-label={`فراغ ${minutesCompact(s - lastEnd)}`}><Hourglass aria-hidden="true" /><span>{minutesCompact(s - lastEnd)}</span></li>);
    }
    if (counts) lastEnd = Math.max(lastEnd ?? 0, e);
    const change = changeOf(item);
    const tag = vacancy ? { text: vacancy.fit === "review" ? "شاغرة · للمراجعة" : "شاغرة", Icon: UserRoundPlus, kind: "vacant" } : tagFor(item, marks, change);
    rows.push(
      <li key={`${item.key}-${active}`} className="sp-tl-row" data-state={vacancy ? "vacant" : item.state}>
        <span className="sp-tl-time" aria-hidden="true"><b className="sp-time">{String(item.start).slice(0, 5)}</b><small className="sp-time">{String(item.end).slice(0, 5)}</small></span>
        <div className="sp-tl-card">
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-ev sp-ev-flow"
            data-state={vacancy ? "vacant" : item.state} data-change={change?.kind} data-fit={vacancy?.fit}
            data-conflict={marks.blocker.has(item.key) || undefined} data-review={marks.review.has(item.key) || undefined}
            data-selected={selectedKey === item.key || undefined} data-focus={focusKeys.has(item.key) || undefined}
            data-dim={dimUnchanged && !vacancy && item.state === "current" || undefined}
            aria-pressed={selectedKey === item.key} onClick={() => onSelect(item.key)}
            aria-label={`${item.outside ? "التزام خارج القسم" : item.courseName}${item.SCode ? ` شعبة ${item.SCode}` : ""}، ${timeRange(item.start, item.end)}${tag ? `، ${tag.text}` : ""}`}>
            <span className="sp-ev-top">
              {tag ? <span className="sp-glyph" data-kind={tag.kind} aria-hidden="true"><tag.Icon /></span> : null}
              <span className="sp-ev-title">{item.outside ? "التزام خارج القسم" : item.courseName || "موعد"}</span>
              {tag ? <span className="sp-tag" data-kind={tag.kind}>{tag.text}</span> : null}
            </span>
            {!item.outside ? (
              <span className="sp-ev-meta">
                {item.SCode ? <bdi className="sp-sec">{item.SCode}</bdi> : null}
                <bdi className="sp-time">{timeRange(item.start, item.end)}</bdi>
                <CampusChip item={item} chips={chips} />
                {item.place && item.state !== "out" ? <span className="sp-ev-place"><Building2 aria-hidden="true" />{item.place}</span> : null}
              </span>
            ) : null}
            {change?.before && item.state !== "out" ? <span className="sp-ev-from"><Undo2 aria-hidden="true" /><bdi>{change.kind === "replaced" ? change.before.courseName : shortSlot(change.before)}</bdi></span> : null}
            {change?.after && item.state === "out" ? <span className="sp-ev-from"><ArrowLeft aria-hidden="true" /><bdi>{shortSlot(change.after)}</bdi></span> : null}
          </button>
          {vacancy && onAssign && vacancy.fit !== "checking" ? (
            <button type="button" className="sp-ev-assign" onClick={() => onAssign(vacancy.facultyId)} aria-label={`أسند ${item.courseName}، الشعبة ${item.SCode}، لهذا الأستاذ`}
              data-guide-ignore="يضيف إسناد الشعبة الشاغرة إلى المسودة — لا يكتب في الجدول"><Plus aria-hidden="true" /><span>أسند</span></button>
          ) : null}
        </div>
      </li>,
    );
  });
  return (
    <div className="sp-dayview">
      <div className="sp-day-tabs" role="tablist" aria-label="أيام الأسبوع">
        {PROPOSAL_DAY_KEYS.map(day => {
          const stat = stats[day];
          return (
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" key={day} type="button" role="tab" aria-selected={active === day}
              onClick={() => { touched.current = true; setActive(day); }} aria-label={`${PROPOSAL_DAY_NAMES[day]}: ${countOf(stat.count, AR.lecture)}${stat.changed ? `، ${countOf(stat.changed, AR.change)}` : ""}`}>
              <b>{PROPOSAL_DAY_SHORT[day]}</b>
              <span className="sp-day-tab-n sp-num">{stat.count ? num(stat.count) : "—"}</span>
              <span className="sp-day-tab-dots" aria-hidden="true">
                {stat.changed ? <i className="sp-dot" data-tone={stat.conflict ? "bad" : "change"} /> : stat.conflict ? <i className="sp-dot" data-tone="bad" /> : null}
                {stat.open ? <i className="sp-dot" data-tone="vacant" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <section className="sp-tl" role="tabpanel" aria-label={PROPOSAL_DAY_NAMES[active]}>
        {rows.length ? <ol>{rows}</ol> : <p className="sp-tl-empty"><CircleDashed aria-hidden="true" />لا محاضرات</p>}
        {onAddDay ? (
          <button type="button" className="sp-tl-add" onClick={() => onAddDay(active)} aria-label={`إضافة موعد يوم ${PROPOSAL_DAY_NAMES[active]}`} data-guide-ignore="يفتح بطاقة إضافة لهذا اليوم — لا يكتب في الجدول">
            <Plus aria-hidden="true" />إضافة · {PROPOSAL_DAY_NAMES[active]}
          </button>
        ) : null}
      </section>
    </div>
  );
}
