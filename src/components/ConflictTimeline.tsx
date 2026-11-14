import React from "react";

/**
 * شريطان متراكبان للمانع: محاضرته (أو الحجز الآخر) فوق، وموعدك تحتها، وما تداخل بينهما مخطَّط بشرائط.
 * يقرأ حقول بطاقة التعارض الموجودة (lines/overlap/axis)؛ وإن لم تتوفر الأزمنة يرجع إلى النص وحده.
 */
export default function ConflictTimeline({ card, text }: { card: any; text: string }) {
  const lines: any[] = Array.isArray(card?.lines) ? card.lines.slice(0, 2) : [];
  if (lines.length < 2) return <span className="appt-inline-text">{text}</span>;
  const minutes = Number(card?.overlapMinutes) || 0;
  /* موضع صورة الخلفية بالنسبة المئوية: p = البداية ÷ (100 − العرض)؛ تُحسب هنا فيبقى CSS بلا حساب. */
  const at = (start: number, width: number) => `${Math.round(Math.min(100, Math.max(0, start / Math.max(1, 100 - width) * 100)) * 10) / 10}%`;
  const vars = (line: any) => ({
    "--bp": at(Number(line.start) || 0, Math.min(99, Number(line.width) || 0)), "--bw": `${Math.min(99, Number(line.width) || 0)}%`,
    "--op": card.overlap ? at(Number(card.overlap.start) || 0, Math.min(99, Number(card.overlap.width) || 0)) : "0%", "--ow": card.overlap ? `${Math.min(99, Number(card.overlap.width) || 0)}%` : "0%",
  }) as React.CSSProperties;
  /* أقلّ عناصر ممكنة: يرثها شريط المانع (role=alert بنصّه كاملاً) فلا مجموعة وسيطة، والمسار والزمن رسمان زائفان على الصف نفسه. */
  return (
    <>
      <div className="appt-tl-head">{card.typeLabel}{minutes > 0 ? <b className="appt-tl-overlap">تداخل {minutes} د</b> : null}</div>
      {lines.map((line: any) => (
        <div key={line.label} className={`appt-tl-row is-${line.tone || "plain"}`} aria-hidden="true" style={vars(line)} data-range={line.range}>{line.label}</div>
      ))}
    </>
  );
}

/** شريطٌ مجزَّأ للمدة: محاضراتٌ بينها فاصل 10 د (50 + 10 + 50). يحلّ محلّ شريحة الرقم المجرّدة ويبقى الرقم نصاً. */
export function DurationBar({ segments }: { segments: { kind: string; minutes: number }[] }) {
  if (segments.length < 2) return null;
  const total = segments.reduce((sum, item) => sum + item.minutes, 0) || 1;
  return (
    <span className="appt-seg" role="img" aria-label={segments.map(item => item.minutes).join(" + ") + " دقيقة"}>
      {segments.map((item, index) => <i key={index} className={`is-${item.kind}`} style={{ flexGrow: item.minutes / total * 100 }}><b dir="ltr">{item.minutes}</b></i>)}
    </span>
  );
}
