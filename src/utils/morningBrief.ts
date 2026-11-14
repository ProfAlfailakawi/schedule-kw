/**
 * ── موجز الصباح ──────────────────────────────────────────────────────────────
 *
 * ما يحتاجه رئيس القسم أو العميد أول اليوم، في سطورٍ قليلة: ما الذي تحرّك في
 * مواعيد القسم منذ أمس، وما الذي يمنع الاعتماد الآن، وكم بقي على موعد التسليم.
 * يُبنى من قراءاتٍ قائمة (أثر النشاط، وتقرير التغييرات، وحال الاعتماد)، ويُعرض
 * مفتوحاً أوّلَ زيارةٍ في اليوم ثم مطويّاً، ويُطبع ورقةً واحدة.
 *
 * لا يُرسل شيء من تلقاء نفسه: الخادم لا يعمل بمؤقّت، فالموجز يُبنى ساعةَ يُفتح.
 */
import { AR, countOf } from "./arabicCount";

export interface BriefTrailEntry { at: string; who: string; kind: string; target: string; row?: number; c?: number; s?: number; t?: number }

export interface MorningBriefInput {
  now: Date;
  /** معرّفات مواعيد القسم المعروض الباقية في الجدول. */
  scopeRowIds: ReadonlySet<number>;
  /** القسم المعروض: حركةٌ تحمل كليتها وقسمها تُعدّ به، ولو حُذف موعدُها. */
  scope?: { collegeId: number; sectionId: number; termId: number };
  trail: ReadonlyArray<BriefTrailEntry>;
  kindLabel: (kind: string) => string;
  approval: { statusLabel: string; round: number } | null;
  deadline: { date?: string; daysLeft?: number } | null;
  blockers: number;
  regulationNotes: number;
  changes: { added: number; removed: number; changed: number } | null;
}

export interface MorningBrief {
  since: string;
  moves: Array<{ at: string; who: string; what: string; target: string }>;
  moveCount: number;
  people: number;
  lines: Array<{ tone: "good" | "warn" | "danger" | "info"; text: string }>;
  /** الأرقام نفسها للشاشة: أيقونةٌ ورقمٌ بدل جملة (الجمل للورقة المطبوعة). */
  stats: {
    moves: number;
    blockers: number;
    notes: number;
    added: number;
    removed: number;
    changed: number;
    /** الأيام الباقية على التسليم، أو null إن لا موعد؛ سالبٌ إن مضى. */
    daysLeft: number | null;
    approval: string;
    round: number;
  };
}

const DAY_MS = 86_400_000;

export function buildMorningBrief(input: MorningBriefInput): MorningBrief {
  const since = new Date(input.now.getTime() - DAY_MS).toISOString();
  const scope = input.scope;
  /* حركةٌ تحمل قسمها تُعدّ به (فالحذف يُعدّ ولو زال الموعد)؛ وحركةٌ قديمة بلا قسم تُعدّ إن بقي موعدُها في القسم. */
  const inScope = (entry: BriefTrailEntry) => scope && entry.c && entry.s
    ? Number(entry.c) === scope.collegeId && Number(entry.s) === scope.sectionId && (!entry.t || Number(entry.t) === scope.termId)
    : Boolean(entry.row && input.scopeRowIds.has(Number(entry.row)));
  const recent = input.trail
    .filter(entry => entry.at >= since && inScope(entry))
    .sort((a, b) => b.at.localeCompare(a.at));
  const lines: MorningBrief["lines"] = [];

  lines.push(recent.length
    ? { tone: "info", text: `${recent.length} ${recent.length === 1 ? "حركة" : recent.length === 2 ? "حركتان" : recent.length <= 10 ? "حركات" : "حركة"} على مواعيد القسم في آخر 24 ساعة، من ${new Set(recent.map(entry => entry.who)).size === 1 ? "شخص واحد" : countOf(new Set(recent.map(entry => entry.who)).size, AR.person)}.` }
    : { tone: "good", text: "لم يتحرّك شيء في مواعيد القسم منذ أمس." });

  if (input.blockers > 0) lines.push({ tone: "danger", text: `${input.blockers} ${input.blockers === 1 ? "مانع اعتماد" : input.blockers === 2 ? "مانعا اعتماد" : "موانع اعتماد"} قائمة (تعارض قاعة أو أستاذ أو موعد مكرّر).` });
  else lines.push({ tone: "good", text: "لا موانع اعتماد قائمة." });

  if (input.regulationNotes > 0) lines.push({ tone: "warn", text: `${input.regulationNotes} ${input.regulationNotes === 1 ? "ملاحظة لائحية" : "ملاحظات لائحية"} للمراجعة (لا تمنع الاعتماد).` });

  if (input.changes) {
    const { added, removed, changed } = input.changes;
    if (added + removed + changed) lines.push({ tone: "info", text: `منذ آخر مراجعة للتسجيل: أُضيف ${added}، وحُذف ${removed}، وعُدّل ${changed}.` });
  }

  if (input.approval) lines.push({ tone: "info", text: `حال الاعتماد: ${input.approval.statusLabel}${input.approval.round ? ` — الجولة ${input.approval.round}` : ""}.` });

  if (input.deadline && typeof input.deadline.daysLeft === "number") {
    const days = input.deadline.daysLeft;
    lines.push(days < 0
      ? { tone: "danger", text: `انقضى موعد التسليم منذ ${-days} ${-days === 1 ? "يوم" : "أيام"}.` }
      : { tone: days <= 7 ? "warn" : "info", text: days === 0 ? "موعد التسليم اليوم." : `بقي على موعد التسليم ${days} ${days === 1 ? "يوم" : days === 2 ? "يومان" : days <= 10 ? "أيام" : "يوماً"}${input.deadline.date ? ` (${input.deadline.date})` : ""}.` });
  }

  const delta = input.changes || { added: 0, removed: 0, changed: 0 };
  return {
    stats: {
      moves: recent.length,
      blockers: input.blockers,
      notes: input.regulationNotes,
      added: delta.added, removed: delta.removed, changed: delta.changed,
      daysLeft: input.deadline && typeof input.deadline.daysLeft === "number" ? input.deadline.daysLeft : null,
      approval: input.approval?.statusLabel || "",
      round: input.approval?.round || 0,
    },
    since,
    moves: recent.slice(0, 8).map(entry => ({ at: entry.at, who: entry.who, what: input.kindLabel(entry.kind), target: entry.target })),
    moveCount: recent.length,
    people: new Set(recent.map(entry => entry.who)).size,
    lines,
  };
}

/** يُفتح الموجز مرةً في اليوم لكل حساب، ثم يبقى مطويّاً حتى يُفتح باليد. */
export const briefSeenKey = (owner: number, now: Date) => `schedule-morning-brief-${owner}-${now.toISOString().slice(0, 10)}`;
