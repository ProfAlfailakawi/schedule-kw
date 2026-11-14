/**
 * ── «وضع الطيّار» في «رغبات الأساتذة»: منطقُه الصافي ─────────────────────────
 *
 * ثلاثون بنداً بطاقةً بطاقة تأخذ وقتاً، لأن العينَ تبحث في كل مرّة عن البند التالي.
 * وضعُ الطيّار يعرض بنداً واحداً في كل مرّة، الأقدمَ أولاً، وثلاثةَ أفعال: «ثبّت»،
 * «بديل»، «التالي». وهذا الملف هو ما لا يحتاج شاشة: القائمةُ وترتيبُها، والتنقّلُ
 * فيها، وترجمةُ المفاتيح إلى أفعال، وجاهزيةُ البند كما يحسبها صفُّ الوارد نفسه.
 *
 * ولا يقرّر شيئاً بنفسه: التثبيتُ والرفضُ يمرّان بدالّة `decide` في الوارد
 * (المعاينة ثم /apply، أو /decide) بختم الإصدار وتجميد الفصل نفسيهما.
 */
import type { InstructorRequest, InstructorRequestItem } from "../types";

/** بندٌ في القائمة: مفتاحُه كمفتاح الوارد (`requestId:index`) وهويّتُه للتحقّق أنه هو نفسه بعد كل قراءة. */
export interface PilotEntry {
  key: string;
  requestId: string;
  index: number;
  itemId: string;
  submittedAt: string;
  instructorName: string;
}

export type PilotRow = InstructorRequest & { instructorName: string; sectionName?: string };

/** هويّةُ البند كما يرسلها الوارد مع كل قرار (`requestItemId` في InstructorInbox.tsx) — يقارنها الخادمُ بـ itemId. */
export const pilotItemId = (item: InstructorRequestItem) => String(item.itemId
  || (item.rowId != null ? `row:${item.rowId}` : `add:${(item.offeringRowIds || []).join(",")}`));

/** ما ينتظر قراراً: ليس «كما هو»، ولا مخفيّاً (بندٌ في قسمٍ آخر)، ولا مقرَّراً. */
export const pilotPending = (item: InstructorRequestItem | undefined): boolean =>
  Boolean(item) && item!.action !== "keep" && !(item as any).hidden && !item!.decision?.state;

/**
 * القائمة: كلُّ بندٍ ينتظر قراراً، الأقدمُ إرسالاً أولاً (من انتظر أطولَ يُجاب أولاً)،
 * وبنودُ الطلب الواحد بترتيبها فيه. وما قُرّر يُتخطّى من البداية.
 */
export function buildPilotQueue<R extends PilotRow>(rows: R[], include: (item: InstructorRequestItem, row: R) => boolean = () => true): PilotEntry[] {
  const entries: PilotEntry[] = [];
  for (const row of rows || []) {
    (row.items || []).forEach((item, index) => {
      if (!pilotPending(item) || !include(item, row)) return;
      entries.push({
        key: `${row.id}:${index}`, requestId: String(row.id), index, itemId: pilotItemId(item),
        submittedAt: String(row.submittedAt || ""), instructorName: String(row.instructorName || ""),
      });
    });
  }
  return entries.sort((a, b) => {
    /* طلبٌ بلا تاريخ إرسالٍ يأتي آخراً: لا يُعرف كم انتظر. */
    if (a.submittedAt !== b.submittedAt) {
      if (!a.submittedAt) return 1;
      if (!b.submittedAt) return -1;
      return a.submittedAt < b.submittedAt ? -1 : 1;
    }
    if (a.requestId !== b.requestId) return a.instructorName.localeCompare(b.instructorName, "ar") || (a.requestId < b.requestId ? -1 : 1);
    return a.index - b.index;
  });
}

/** البندُ في القراءة الأخيرة للوارد — إن بقي هو نفسه (الهويّةُ لم تتغيّر) وما زال ينتظر. */
export function pilotLookup<R extends PilotRow>(rows: R[], entry: PilotEntry): { row: R; item: InstructorRequestItem } | null {
  const row = (rows || []).find(candidate => String(candidate.id) === entry.requestId);
  const item = row?.items?.[entry.index];
  if (!row || !item || pilotItemId(item) !== entry.itemId) return null;
  return { row, item };
}

export const pilotOpen = <R extends PilotRow>(rows: R[], entry: PilotEntry) => pilotPending(pilotLookup(rows, entry)?.item);

/* ── التنقّل ──────────────────────────────────────────────────────────────── */

export type PilotOutcome = "fixed" | "rejected" | "skipped";
export interface PilotState {
  order: PilotEntry[];
  /** موضعُ البند المعروض، أو -1 حين تنتهي القائمة. */
  at: number;
  outcomes: Record<string, PilotOutcome>;
  /** موضعُ آخر تخطٍّ — «رجوع» يعيده. يُمحى بعد أيّ قرار: القرارُ لا يُتراجع عنه من هنا. */
  lastSkip: number | null;
}

/**
 * البندُ التالي بعد `from`: أولاً ما لم يُتخطَّ بعدُ إلى آخر القائمة، ثم — إن لم يبقَ —
 * جولةٌ ثانية على ما تُخطّي وما زال ينتظر. وما قرّره أحدٌ (هنا أو زميلٌ) لا يعود.
 */
export function pilotNext(state: Pick<PilotState, "order" | "outcomes">, open: (entry: PilotEntry) => boolean, from: number): number {
  const { order, outcomes } = state;
  const live = (at: number) => open(order[at]) && outcomes[order[at].key] !== "fixed" && outcomes[order[at].key] !== "rejected";
  for (let at = from + 1; at < order.length; at++) if (live(at) && outcomes[order[at].key] !== "skipped") return at;
  for (let at = 0; at < order.length; at++) if (at !== from && live(at) && outcomes[order[at].key] !== "skipped") return at;
  for (let at = 0; at < order.length; at++) if (at !== from && live(at)) return at;
  return -1;
}

export function startPilot(order: PilotEntry[], open: (entry: PilotEntry) => boolean): PilotState {
  const base = { order, outcomes: {} as Record<string, PilotOutcome> };
  return { ...base, at: order.length && open(order[0]) ? 0 : pilotNext(base, open, -1), lastSkip: null };
}

/** فعلٌ على البند المعروض ثم الانتقالُ إلى ما بعده. */
export function pilotAdvance(state: PilotState, outcome: PilotOutcome, open: (entry: PilotEntry) => boolean): PilotState {
  if (state.at < 0) return state;
  const entry = state.order[state.at];
  const outcomes = { ...state.outcomes, [entry.key]: outcome };
  const at = pilotNext({ order: state.order, outcomes }, open, state.at);
  return { ...state, outcomes, at, lastSkip: outcome === "skipped" ? state.at : null };
}

/** «رجوع»: يعيد آخرَ بندٍ تُخطّي — ولا شيءَ غيره (التثبيتُ والرفضُ لا يتراجع عنهما مسارُ الوارد). */
export function pilotUndoSkip(state: PilotState, open: (entry: PilotEntry) => boolean): PilotState {
  if (state.lastSkip == null) return state;
  const entry = state.order[state.lastSkip];
  if (!entry || !open(entry)) return { ...state, lastSkip: null };
  const outcomes = { ...state.outcomes };
  delete outcomes[entry.key];
  return { ...state, outcomes, at: state.lastSkip, lastSkip: null };
}

/** ما انتهى أمرُه من القائمة (قُرّر هنا أو في مكانٍ آخر) — مقياسُ شريط التقدّم. */
export const pilotSettledCount = (state: PilotState, open: (entry: PilotEntry) => boolean) =>
  state.order.filter(entry => !open(entry)).length;

/* ── المفاتيح ─────────────────────────────────────────────────────────────── */

export type PilotCommand = "fix" | "alternative" | "next" | "undo" | "exit" | "close-sheet";
export type PilotKeyTarget = "button" | "field" | "other";
export interface PilotKey {
  key: string;
  code?: string;
  ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean;
  /** أين التركيز: زرٌّ آخر (Enter/Space له هو)، أو حقلُ كتابة (المفاتيحُ حروفٌ تُكتب). */
  target: PilotKeyTarget;
  /** ورقةُ «بديل» مفتوحة: لا يُقرأ فيها إلا Escape (يغلقها هي لا الوضع). */
  sheetOpen: boolean;
}

/**
 * المفتاحُ → الفعل. F (أو Enter حين لا يكون التركيز على زرٍّ آخر) «ثبّت»، B «بديل»،
 * → أو Space (لا على زر) «التالي»، Z «رجوع» عن التخطّي، Escape خروج. ويُقرأ الحرفُ
 * من موضعه في اللوحة (`code`) أيضاً، فيعمل واللوحةُ عربية.
 */
export function pilotCommand(event: PilotKey): PilotCommand | null {
  if (event.key === "Escape") return event.sheetOpen ? "close-sheet" : "exit";
  if (event.sheetOpen || event.target === "field") return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const letter = String(event.key || "").toLowerCase();
  if (letter === "f" || event.code === "KeyF") return "fix";
  if (letter === "b" || event.code === "KeyB") return "alternative";
  if (letter === "z" || event.code === "KeyZ") return "undo";
  if (event.key === "Enter") return event.target === "button" ? null : "fix";
  if (event.key === "ArrowRight") return "next";
  if (event.key === " " || event.key === "Spacebar") return event.target === "button" ? null : "next";
  return null;
}

/* ── جاهزيةُ البند: قراءةُ صفّ الوارد نفسها ──────────────────────────────────
 * مرآةٌ لما يحسبه `RequestRow` في InstructorInbox.tsx من الحكم المحفوظ والفحص الحيّ:
 * ما منعه أحدُهما مُنع، والبندُ الشقيقُ الذي يُفرغ الوقتَ يُرسل معه (after)، وما
 * ينتظر قسماً آخر ينتظر. ولا فحصَ جديد: الخادمُ يعيد الفحصَ كلَّه في المعاينة. */

export interface PilotLiveIssue { severity: "high" | "medium" | "low"; message: string; detail?: string; otherId?: number; type?: string }
export type PilotReadiness = "ready" | "review" | "blocked" | "checking" | "waiting";
export interface PilotJudgement {
  readiness: PilotReadiness;
  blocked: boolean;
  /** بنودُ الطلب نفسه التي تُثبَّت معه ذرّياً (تُفرغ وقته). */
  after: number[];
  waitsElsewhere: boolean;
  /** ما يُقرأ: الحكمُ المحفوظ ثم الفحصُ الحيّ بلا تكرار. */
  issues: Array<{ text: string; detail?: string; severity: "high" | "medium" | "low" }>;
  /** وصل جاهزاً ثم تحرّك الجدول (C7). */
  changedAfterSubmit: boolean;
}

export function pilotJudge(row: PilotRow, index: number, hasCurrent: boolean, live: { loading: boolean; issues: PilotLiveIssue[] | null }): PilotJudgement {
  const item = row.items[index];
  const reasons = item.reasons || [];
  const seen = new Set(reasons.map(reason => reason.text));
  const siblings = new Map<number, { index: number; elsewhere: boolean }>();
  (row.items || []).forEach((other, at) => {
    if (at === index || other.decision?.state || other.rowId == null) return;
    if (other.action !== "change" && other.action !== "delete") return;
    siblings.set(Number(other.rowId), { index: at, elsewhere: Boolean((other as any).hidden) });
  });
  const checked = item.action !== "delete" ? (live.issues || []) : [];
  const allLive = checked.filter(issue => !seen.has(issue.message));
  const depends = [...new Map(allLive.filter(issue => issue.otherId && siblings.has(issue.otherId))
    .map(issue => [issue.otherId!, siblings.get(issue.otherId!)!] as const)).values()];
  const waitsElsewhere = depends.some(entry => entry.elsewhere);
  const judgedSources = new Set(reasons.filter(reason => reason.blocking).map(reason => reason.source as string));
  const liveIssues = allLive.filter(issue => !(issue.otherId && siblings.has(issue.otherId)) && !(issue.type && judgedSources.has(issue.type)));
  const highLive = liveIssues.some(issue => issue.severity === "high");
  const blockingReason = reasons.some(reason => reason.blocking);
  const blocked = waitsElsewhere || item.verdict === "conflict" || blockingReason || highLive || (item.action === "change" && !hasCurrent);
  const readiness: PilotReadiness = item.action === "delete" ? "ready"
    : waitsElsewhere && !highLive && !blockingReason ? "waiting"
    : blocked ? "blocked"
    : live.loading && !live.issues ? "checking"
    : (reasons.length || liveIssues.length || depends.length) ? "review" : "ready";
  return {
    readiness, blocked, waitsElsewhere,
    after: depends.filter(entry => !entry.elsewhere).map(entry => entry.index),
    issues: item.action === "delete" ? [] : [
      ...reasons.map(reason => ({ text: reason.text, severity: reason.blocking ? "high" as const : "medium" as const })),
      ...liveIssues.map(issue => ({ text: issue.message, detail: issue.detail, severity: issue.severity })),
    ],
    changedAfterSubmit: Boolean(row.submittedAt) && item.verdict === "conflict" && item.action !== "delete",
  };
}

/** الإضافةُ تُثبَّت ببطاقتها السريعة في الوارد (قاعةٌ وشعبةٌ يختارهما القسم): «ثبّت» هنا يسلّمها إليها. */
export const pilotHandsOff = (item: InstructorRequestItem) => item.action === "add" && !item.offeringRowIds?.length;
