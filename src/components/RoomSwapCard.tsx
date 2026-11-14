/**
 * ── «بدّل القاعتين»: بطاقةٌ هادئة بجانب مقترحات القاعة ───────────────────────
 * موعدٌ في قاعةٍ لا تلائمه، وقاعتُه الملائمة يشغلها موعدٌ آخر يلائمه غيرُها: صفّان بأيقونتيهما
 * (مقرر ← قاعة)، وسببٌ بكلمة (نوع/سعة)، وضغطةٌ واحدة تنفّذ النقلين معاً (بتأكيد وتراجع).
 * لا يُنفَّذ شيءٌ تلقائياً، ولا قاعةَ دون سعة المقرر. لا تظهر البطاقة بلا اقتراح.
 */
import React from "react";
import CourseTags from "./CourseTags";
import { ArrowLeft, ArrowLeftRight, BookOpen, DoorOpen, FlaskConical, Hammer, Loader2, Presentation, Star, UserRound, UsersRound, Wrench } from "lucide-react";
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

export default function RoomSwapCard({ swaps, busy = false, mineLabel = "موعدك", onApply }: {
  swaps: RoomSwap[];
  busy?: boolean;
  /** اسمُ مقرر موعدك كما يُعرض في الصفّ الأول. */
  mineLabel?: string;
  onApply: (swap: RoomSwap) => void;
}) {
  if (!swaps.length) return null;
  return <section className="room-swap" aria-label="بدّل القاعتين">
    <header className="room-swap-head">
      <span className="room-swap-mark" aria-hidden="true"><ArrowLeftRight /></span>
      <b>بدّل القاعتين</b>
      <small>بتأكيد وتراجع</small>
    </header>
    <div className="room-swap-list">
      {swaps.map((swap, index) => {
        const MineIcon = swapTypeIcon(swap.mine.to.roomType);
        const OtherIcon = swapTypeIcon(swap.other.to.roomType);
        return <article className={`room-swap-card${index === 0 && swaps.length > 1 ? " is-best" : ""}`} key={swap.id} data-room-swap={swap.id}>
          <div className="room-swap-rows">
            <p className="room-swap-row is-mine">
              <span className="room-swap-who"><MineIcon aria-hidden="true" /><b title={mineLabel}>{mineLabel}</b></span>
              <span className="room-swap-move">
                <bdi dir="ltr" className="room-suggest-code is-from">{code(swap.mine.from)}</bdi>
                <ArrowLeft aria-hidden="true" className="room-swap-arrow" />
                <bdi dir="ltr" className="room-suggest-code is-to">{code(swap.mine.to)}</bdi>
              </span>
            </p>
            <p className="room-swap-row">
              <span className="room-swap-who"><OtherIcon aria-hidden="true" /><b title={swap.other.courseName}>{swap.other.courseName || "شعبة أخرى"}</b><CourseTags courseId={swap.other.courseId} /><small>ش{swap.other.scode}</small></span>
              <span className="room-swap-move">
                <bdi dir="ltr" className="room-suggest-code is-from">{code(swap.other.from)}</bdi>
                <ArrowLeft aria-hidden="true" className="room-swap-arrow" />
                <bdi dir="ltr" className="room-suggest-code is-to">{code(swap.other.to)}</bdi>
              </span>
            </p>
            <span className="room-swap-facts">
              {swap.reasons.map(reason => { const Icon = REASON[reason].icon; return <small className="room-suggest-fact warn" key={reason}><Icon aria-hidden="true" />{REASON[reason].text}</small>; })}
              <small className="room-suggest-fact good"><UsersRound aria-hidden="true" />السعة تكفي</small>
            </span>
          </div>
          <button type="button" className="room-swap-apply" disabled={busy}
            data-guide-ignore="ينقل شعبةً أخرى من القسم إلى قاعتها الملائمة ويأخذ موعدك قاعتها؛ بتأكيدٍ ثم يُسجَّل ويمكن التراجع عنه"
            onClick={() => onApply(swap)} aria-label={`بدّل القاعتين: ${code(swap.mine.to)} لموعدك و${code(swap.other.to)} للشعبة الأخرى`}>
            {busy ? <Loader2 aria-hidden="true" className="checks-spin" /> : index === 0 ? <Star aria-hidden="true" /> : <ArrowLeftRight aria-hidden="true" />}
            <span>بدّل</span>
          </button>
        </article>;
      })}
    </div>
  </section>;
}
