/**
 * ── «بدّل القاعتين»: بطاقةٌ بصرية بجانب مقترحات القاعة ───────────────────────
 * موعدٌ في قاعةٍ لا تلائمه، وقاعتُه الملائمة يشغلها موعدٌ آخر يلائمه غيرُها. لكل شعبةٍ مسارٌ واحد:
 * المقرر والشعبة، ثم القاعة قبل ← بعد، وشريطُ المقاعد مقابل سعة القاعة، وشارةُ نوعها — رموزٌ وأرقامٌ لا جمل.
 * ضغطةٌ واحدة تنفّذ النقلين (بتأكيد وتراجع). لا يُنفَّذ شيءٌ تلقائياً، ولا قاعةَ دون سعة المقرر.
 * الشعبةُ الأخرى من قسم المستخدم دائماً (الخادم لا يقترح تحريك شعبةٍ من قسمٍ آخر)، فلا يُكشف هنا غيرُ ما يملكه.
 * لا تظهر البطاقة بلا اقتراح.
 */
import React from "react";
import CourseTags from "./CourseTags";
import { ArrowLeft, ArrowLeftRight, BookOpen, Check, DoorOpen, FlaskConical, Hammer, Loader2, Presentation, ShieldCheck, Star, TriangleAlert, Undo2, UsersRound, Wrench } from "lucide-react";
import type { RoomSwap, RoomSwapHall, RoomSwapReason } from "../utils/appointmentRoomSwap";

/** رمزُ المقرر من نوع القاعة التي يلائمها: ورشة/مختبر/تدريس — بلا نصٍّ إضافي. */
export function swapTypeIcon(type: string | undefined) {
  const value = String(type || "");
  if (/ورش|مشغل/.test(value)) return Hammer;
  if (/مختبر|معمل/.test(value)) return FlaskConical;
  if (/حاسب|عملي|تطبيق/.test(value)) return Wrench;
  if (/مدرج|محاضر/.test(value)) return Presentation;
  return BookOpen;
}

const REASON: Record<RoomSwapReason, { icon: typeof DoorOpen; text: string }> = {
  type: { icon: DoorOpen, text: "نوع القاعة" },
  capacity: { icon: UsersRound, text: "السعة" },
};

const code = (hall: RoomSwapHall | null) => (hall ? `${hall.room}/${hall.hall}` : "—");

/** شريطُ المقاعد مقابل السعة: أخضر إن كفت، وبلا شريطٍ إن لم يكن للمقرر مقاعد. */
export function CapacityBar({ seats, capacity }: { seats: number; capacity: number | null | undefined }) {
  const cap = Number(capacity || 0);
  if (!(seats > 0) || !(cap > 0)) return null;
  const pct = Math.max(6, Math.min(100, Math.round((seats / cap) * 100)));
  const fits = seats <= cap;
  return (
    <span className={`swap-cap ${fits ? "is-ok" : "is-bad"}`} role="img" aria-label={`المقاعد ${seats} من سعة ${cap}`} title={`المقاعد ${seats} · السعة ${cap}`}>
      <UsersRound aria-hidden="true" />
      <span className="swap-cap-track" aria-hidden="true"><i style={{ inlineSize: `${pct}%` }} /></span>
      <bdi dir="ltr">{seats}/{cap}</bdi>
    </span>
  );
}

function RoomChip({ hall, tone }: { hall: RoomSwapHall | null; tone: "from" | "to" }) {
  return (
    <span className={`swap-room is-${tone}`}>
      {tone === "to" ? <Check aria-hidden="true" /> : <DoorOpen aria-hidden="true" />}
      <bdi dir="ltr">{code(hall)}</bdi>
    </span>
  );
}

/** مسارُ شعبةٍ واحدة: من تكون، وقاعتها قبل ← بعد، وسعةُ القاعة الجديدة ونوعها. */
export function SwapLane({ name, section, courseId, from, to, seats, bad, reasons = [] }: {
  name: string;
  section?: string;
  courseId?: number;
  from: RoomSwapHall | null;
  to: RoomSwapHall;
  seats: number;
  /** قاعتُها الحالية لا تلائمها (تُلوَّن «قبل» بالتنبيه). */
  bad?: boolean;
  reasons?: RoomSwapReason[];
}) {
  const Icon = swapTypeIcon(to.roomType);
  return (
    <div className="swap-lane">
      <span className="swap-who">
        <span className="swap-ico" aria-hidden="true"><Icon /></span>
        <b title={name}>{name}</b>
        {courseId ? <CourseTags courseId={courseId} /> : null}
        {section ? <small className="swap-sec" dir="ltr">{section}</small> : null}
      </span>
      <span className="swap-flow">
        <span className={`swap-from${bad ? " is-bad" : ""}`}>
          <RoomChip hall={from} tone="from" />
          {bad ? reasons.map(reason => { const R = REASON[reason].icon; return <span className="swap-why" key={reason} role="img" aria-label={REASON[reason].text} title={REASON[reason].text}><R aria-hidden="true" /></span>; }) : null}
          {bad && !reasons.length ? <span className="swap-why" role="img" aria-label="لا تلائمه" title="لا تلائمه"><TriangleAlert aria-hidden="true" /></span> : null}
        </span>
        <ArrowLeft aria-hidden="true" className="swap-arrow" />
        <RoomChip hall={to} tone="to" />
      </span>
      <span className="swap-meta">
        <CapacityBar seats={seats} capacity={to.capacity} />
        {to.roomType ? <span className="swap-type" title={to.roomType}><Icon aria-hidden="true" /><span>{to.roomType}</span></span> : null}
      </span>
    </div>
  );
}

/** الشعبتان معاً: موعدك والشعبةُ الأخرى (تُستعمل في البطاقة وفي حوار التأكيد). */
export function RoomSwapLanes({ swap, mineLabel = "موعدك" }: { swap: RoomSwap; mineLabel?: string }) {
  const give = swap.direction === "give";
  return (
    <div className="swap-lanes">
      <SwapLane name={mineLabel} from={swap.mine.from} to={swap.mine.to} seats={swap.mine.seats} bad={give} reasons={give ? swap.reasons : []} />
      <SwapLane name={swap.other.courseName || "شعبة أخرى"} courseId={swap.other.courseId} section={swap.other.scode ? `ش${swap.other.scode}` : ""}
        from={swap.other.from} to={swap.other.to} seats={swap.other.seats} bad reasons={give ? [] : swap.reasons} />
    </div>
  );
}

/** جسمُ حوار التأكيد: المسارانِ ورموزُ الضمانات الثلاث (فحصٌ كامل · أخذُ القاعة عند الحفظ · تراجع). */
export function RoomSwapConfirmBody({ swap, mineLabel }: { swap: RoomSwap; mineLabel?: string }) {
  return (
    <div className="swap-confirm">
      <RoomSwapLanes swap={swap} mineLabel={mineLabel} />
      <ul className="swap-assure" aria-label="ضمانات التبديل">
        <li><ShieldCheck aria-hidden="true" /><span>فحصٌ كامل</span></li>
        <li><ArrowLeftRight aria-hidden="true" /><span>موعدك يأخذ قاعته عند الحفظ</span></li>
        <li><Undo2 aria-hidden="true" /><span>يمكن التراجع</span></li>
      </ul>
    </div>
  );
}

export default function RoomSwapCard({ swaps, busy = false, mineLabel = "موعدك", onApply }: {
  swaps: RoomSwap[];
  busy?: boolean;
  /** اسمُ مقرر موعدك كما يُعرض في المسار الأول. */
  mineLabel?: string;
  onApply: (swap: RoomSwap) => void;
}) {
  if (!swaps.length) return null;
  return <section className="room-swap" aria-label="بدّل القاعتين">
    <header className="room-swap-head">
      <span className="room-swap-mark" aria-hidden="true"><ArrowLeftRight /></span>
      <b>بدّل القاعتين</b>
      <small role="img" aria-label="بتأكيد وتراجع" title="بتأكيد وتراجع"><ShieldCheck aria-hidden="true" /><Undo2 aria-hidden="true" /></small>
    </header>
    <div className="room-swap-list">
      {swaps.map((swap, index) => (
        <article className={`room-swap-card${index === 0 && swaps.length > 1 ? " is-best" : ""}`} key={swap.id} data-room-swap={swap.id}>
          <RoomSwapLanes swap={swap} mineLabel={mineLabel} />
          <button type="button" className="room-swap-apply" disabled={busy}
            data-guide-ignore="ينقل شعبةً أخرى من القسم إلى قاعتها الملائمة ويأخذ موعدك قاعتها؛ بتأكيدٍ ثم يُسجَّل ويمكن التراجع عنه"
            onClick={() => onApply(swap)} aria-label={`بدّل القاعتين: ${code(swap.mine.to)} لموعدك و${code(swap.other.to)} للشعبة الأخرى`}>
            {busy ? <Loader2 aria-hidden="true" className="checks-spin" /> : index === 0 ? <Star aria-hidden="true" /> : <ArrowLeftRight aria-hidden="true" />}
            <span>بدّل</span>
          </button>
        </article>
      ))}
    </div>
  </section>;
}
