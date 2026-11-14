import React from "react";

/**
 * شريطان متراكبان للمانع: محاضرته (أو الحجز الآخر) فوق، وموعدك تحتها، وما تداخل بينهما مخطَّط بشرائط.
 * يقرأ حقول بطاقة التعارض الموجودة (lines/overlap/axis)؛ وإن لم تتوفر الأزمنة يرجع إلى النص وحده.
 */
export default function ConflictTimeline({ card, text }: { card: any; text: string }) {
  const lines: any[] = Array.isArray(card?.lines) ? card.lines.slice(0, 2) : [];
  if (lines.length < 2) return <span className="appt-inline-text">{text}</span>;
  const minutes = Number(card?.overlapMinutes) || 0;
  return (
    <div className="appt-tl" role="group" aria-label={text}>
      <div className="appt-tl-head">
        <span className="appt-tl-kind">{card.typeLabel}</span>
        {minutes > 0 ? <b className="appt-tl-overlap">تداخل <bdi dir="ltr">{minutes}</bdi> دقيقة</b> : null}
      </div>
      <div className="appt-tl-tracks" aria-hidden="true">
        {lines.map((line: any) => (
          <div key={line.label} className={`appt-tl-row is-${line.tone || "plain"}`}>
            <span className="appt-tl-label">{line.label}</span>
            <span className="appt-tl-track">
              <i className="appt-tl-bar" style={{ insetInlineStart: `${line.start}%`, inlineSize: `${line.width}%` }} />
              {card.overlap ? <i className="appt-tl-hatch" style={{ insetInlineStart: `${card.overlap.start}%`, inlineSize: `${card.overlap.width}%` }} /> : null}
            </span>
            <bdi className="appt-tl-range" dir="ltr">{line.range}</bdi>
          </div>
        ))}
      </div>
      <span className="sr-only">{text}</span>
    </div>
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
