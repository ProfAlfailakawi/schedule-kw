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
export interface BriefTrailEntry { at: string; who: string; kind: string; target: string; row?: number }

export interface MorningBriefInput {
  now: Date;
  /** معرّفات مواعيد القسم المعروض: الحركةُ على غيرها لا تدخل الموجز. */
  scopeRowIds: ReadonlySet<number>;
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
}

const DAY_MS = 86_400_000;

export function buildMorningBrief(input: MorningBriefInput): MorningBrief {
  const since = new Date(input.now.getTime() - DAY_MS).toISOString();
  const recent = input.trail
    .filter(entry => entry.at >= since && entry.row && input.scopeRowIds.has(Number(entry.row)))
    .sort((a, b) => b.at.localeCompare(a.at));
  const lines: MorningBrief["lines"] = [];

  lines.push(recent.length
    ? { tone: "info", text: `${recent.length} ${recent.length === 1 ? "حركة" : recent.length === 2 ? "حركتان" : recent.length <= 10 ? "حركات" : "حركة"} على مواعيد القسم في آخر ٢٤ ساعة، من ${new Set(recent.map(entry => entry.who)).size === 1 ? "شخص واحد" : `${new Set(recent.map(entry => entry.who)).size} أشخاص`}.` }
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

  return {
    since,
    moves: recent.slice(0, 8).map(entry => ({ at: entry.at, who: entry.who, what: input.kindLabel(entry.kind), target: entry.target })),
    moveCount: recent.length,
    people: new Set(recent.map(entry => entry.who)).size,
    lines,
  };
}

/** يُفتح الموجز مرةً في اليوم لكل حساب، ثم يبقى مطويّاً حتى يُفتح باليد. */
export const briefSeenKey = (owner: number, now: Date) => `schedule-morning-brief-${owner}-${now.toISOString().slice(0, 10)}`;
