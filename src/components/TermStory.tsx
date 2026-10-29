import React, { useState } from "react";
import { BookOpenText, CalendarDays, Check, Copy, CornerUpLeft, FileDiff, MessageSquareReply, OctagonAlert, Repeat, Send, ShieldCheck } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";

/**
 * ── قصة الفصل ───────────────────────────────────────────────────────────────
 *
 * صفحةُ القسم في دورة الاعتماد كانت تقول كل شيء متفرّقاً: عددَ ما تحرّك في
 * سطر، والجولاتِ في قائمةٍ مطويّة، والملاحظاتِ في جدولها. هذه البطاقة تجمع
 * الحكاية في نظرة: كم موعداً، وكم تحرّك، وكم جولةً احتاج، وكم ملاحظةً عولجت،
 * وهل بقي مانع — مع شريط الجولات أيقوناتٍ، وزرٍّ ينسخها جملةً جاهزةً للعميد.
 * كل رقمٍ هنا من تقرير التغييرات نفسه؛ لا طلبَ جديداً ولا حساباً آخر.
 */

export interface TermStoryRound {
  number: number;
  submittedAt?: string;
  returnedAt?: string;
  returnedNoteCount?: number;
  acceptedAt?: string;
  amendment?: boolean;
}

export default function TermStory({ scopeLine, statusLabel, rowCount, moved, rounds, notesDone, notesTotal, blockers }: {
  scopeLine: string;
  statusLabel: string;
  rowCount: number;
  moved: number;
  rounds: TermStoryRound[];
  notesDone: number;
  notesTotal: number;
  blockers: number;
}) {
  const [copied, setCopied] = useState(false);
  const roundCount = Math.max(1, rounds.length);
  const sentence = [
    `${scopeLine}:`,
    countOf(rowCount, AR.appointment),
    moved ? `تحرّك ${countOf(moved, AR.appointment)} منذ المراجعة` : "لم يتحرّك موعد منذ المراجعة",
    countOf(roundCount, AR.round),
    notesTotal ? `عولجت ${notesDone.toLocaleString("ar-KW-u-nu-latn")} من ${countOf(notesTotal, AR.note)}` : "بلا ملاحظات",
    blockers ? countOf(blockers, AR.approvalBlocker) : "بلا موانع",
    `الحالة: ${statusLabel}`,
  ].join(" · ").replace(": ·", ":");

  const copy = async () => {
    try { await navigator.clipboard.writeText(sentence); }
    catch {
      const field = document.createElement("textarea");
      field.value = sentence; document.body.appendChild(field); field.select();
      try { document.execCommand("copy"); } finally { field.remove(); }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const tiles = [
    { key: "rows", icon: <CalendarDays aria-hidden="true" />, value: rowCount, label: "موعداً" },
    { key: "moved", icon: <FileDiff aria-hidden="true" />, value: moved, label: "تحرّك" },
    { key: "rounds", icon: <Repeat aria-hidden="true" />, value: roundCount, label: roundCount === 1 ? "جولة" : "جولات" },
    { key: "notes", icon: <MessageSquareReply aria-hidden="true" />, value: notesTotal ? `${notesDone}/${notesTotal}` : "0", label: "ملاحظات عولجت" },
    { key: "blockers", icon: blockers ? <OctagonAlert aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />, value: blockers, label: blockers ? "موانع" : "بلا موانع", tone: blockers ? "danger" : "good" },
  ];

  return (
    <section className="term-story" aria-label={`قصة الفصل: ${sentence}`}>
      <header className="term-story-head">
        <span className="term-story-mark" aria-hidden="true"><BookOpenText /></span>
        <div><strong>قصة الفصل</strong><small>{scopeLine}</small></div>
        <button type="button" className="term-story-copy" data-guide-ignore="ينسخ ملخص الفصل جملةً واحدة للمشاركة — لا يغيّر شيئاً" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "نُسخت" : "انسخها للعميد"}
        </button>
      </header>
      <div className="term-story-tiles" aria-hidden="true">
        {tiles.map(tile => (
          <div key={tile.key} className="term-story-tile" data-tone={tile.tone}>
            {tile.icon}
            <b dir="ltr">{typeof tile.value === "number" ? tile.value.toLocaleString("ar-KW-u-nu-latn") : tile.value}</b>
            <span>{tile.label}</span>
          </div>
        ))}
      </div>
      {rounds.length ? (
        <ol className="term-story-rounds" aria-hidden="true">
          {rounds.map(round => (
            <li key={round.number}>
              <em>ج{round.number}</em>
              {round.submittedAt ? <i data-step="sent" title={round.amendment ? "فُتحت للتعديل" : "أُرسلت"}><Send /></i> : null}
              {round.returnedAt ? <i data-step="returned" title={`أُرجعت${round.returnedNoteCount ? ` بـ${countOf(round.returnedNoteCount, AR.note)}` : ""}`}><CornerUpLeft />{round.returnedNoteCount ? <small>{round.returnedNoteCount}</small> : null}</i> : null}
              {round.acceptedAt ? <i data-step="accepted" title="قُبلت"><ShieldCheck /></i> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
