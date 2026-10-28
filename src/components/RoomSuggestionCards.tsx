import React from "react";
import {
  Armchair, ArrowLeftRight, Ban, Building2, CalendarX2, Check, CheckCircle2, Clock3, DoorOpen, Footprints,
  Hourglass, MapPin, MonitorPlay, Repeat2, Star, UserRound, UserRoundCheck, UsersRound,
} from "lucide-react";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import type { SuggestionEmptyReason } from "../utils/suggestionEngine";

export interface RoomSuggestion {
  room: string;
  hall: string;
  roomId?: string;
  buildingId?: string;
  start?: string;
  end?: string;
  score?: number;
  reasons?: string[];
  companionRoomId?: string;
  companionRoomLabel?: string;
}

/** شعبة «هيئة تدريسية» تشغل القاعة في الوقت نفسه بالضبط (🔄 قابلة للاستبدال). */
export interface ReplaceableSection {
  rowId: number;
  room: string;
  hall: string;
  start: string;
  end: string;
  courseId: number;
  courseName?: string;
  scode?: string;
  sameCourse: boolean;
}

type Fact = { text: string; icon: typeof CheckCircle2; tone: "good" | "warn" | "muted" };

function factsFor(reasons: string[] = []): Fact[] {
  const facts: Fact[] = [];
  for (const reason of reasons) {
    let fact: Fact | undefined;
    if (reason.startsWith("يلائم نوع المقرر")) fact = { text: "يناسب المقرر", icon: CheckCircle2, tone: "good" };
    else if (reason.includes("نوع القاعة") && reason.includes("مختلف")) fact = { text: "نوع مختلف", icon: DoorOpen, tone: "warn" };
    else if (reason.includes("السعة المسجلة مناسبة")) fact = { text: "سعة مناسبة", icon: UsersRound, tone: "good" };
    else if (reason.includes("السعة المسجلة أقل")) fact = { text: "سعة أقل", icon: UsersRound, tone: "warn" };
    else if (reason.includes("لا يترك فراغاً للأستاذ")) fact = { text: "دون فراغ", icon: Hourglass, tone: "good" };
    else if (reason.startsWith("فراغ ")) fact = { text: reason.replace("فراغ ", "").replace(" دقيقة", "د").replace(" دقائق", "د"), icon: Hourglass, tone: "muted" };
    else if (reason.includes("بلا انتقال بين المباني")) fact = { text: "دون تنقّل", icon: Footprints, tone: "good" };
    else if (reason.startsWith("انتقال ")) fact = { text: reason.replace("انتقال ", "").replace(" دقيقة", "د").replace(" دقائق", "د"), icon: Footprints, tone: "muted" };
    else if (reason.includes("داخل يوم القسم الحالي")) fact = { text: "ضمن يوم القسم", icon: MapPin, tone: "good" };
    if (fact && !facts.some(item => item.text === fact!.text)) facts.push(fact);
    if (facts.length === 3) break;
  }
  return facts;
}

/** رمزٌ وكلمة واحدة حين لا يبقى اقتراح — لا صمت يبدو عطلاً. */
const EMPTY_FACE: Record<SuggestionEmptyReason, { icon: typeof Ban; word: string }> = {
  halls: { icon: Building2, word: "لا قاعات للقسم" },
  teacher: { icon: UserRound, word: "الأستاذ مشغول" },
  rooms: { icon: DoorOpen, word: "القاعات محجوزة" },
  travel: { icon: Footprints, word: "لا وقت للانتقال" },
  facility: { icon: MonitorPlay, word: "المرفق محجوز" },
  borrow: { icon: ArrowLeftRight, word: "خارج الاستعارة" },
  hours: { icon: Hourglass, word: "تجاوز الساعات" },
  conflict: { icon: Ban, word: "تعارض" },
  days: { icon: CalendarX2, word: "اختر الأيام" },
};

export function SuggestionEmpty({ reason, note }: { reason?: SuggestionEmptyReason | string; note?: string }) {
  const face = EMPTY_FACE[(reason as SuggestionEmptyReason) || "rooms"] || EMPTY_FACE.rooms;
  const Icon = face.icon;
  /* الملاحظة الطويلة من الخادم (مثل تجاوز الساعات) تبقى في التلميح؛ الظاهر كلمة. */
  return <p className="suggestion-empty" role="status" title={note || face.word}>
    <span className="suggestion-empty-icon" aria-hidden="true"><Icon /></span>
    <b>{face.word}</b>
  </p>;
}

/**
 * بطاقات الاقتراح الموحّدة — المحرر الكامل، و«موعد جديد» السريع، و«اقترح بديلاً آمناً».
 * رمز القاعة كبير، شريحة وقت، أيقونات (مرفق/سعة/فراغ/تنقّل)، شارة «الأنسب» على الأولى، وضغطة واحدة تختار.
 */
export default function RoomSuggestionCards({
  suggestions, onSelect, label = "قاعات متاحة لموعدك", variant = "room", replaceable = [], onReplaceable, replaceBusy = false,
}: {
  suggestions: RoomSuggestion[];
  onSelect: (suggestion: RoomSuggestion) => void;
  label?: string;
  /** room: الوقت ثابت والقاعة هي السؤال · slot: الوقت والقاعة معاً. */
  variant?: "room" | "slot";
  replaceable?: ReplaceableSection[];
  onReplaceable?: (section: ReplaceableSection) => void;
  replaceBusy?: boolean;
}) {
  const assignable = onReplaceable ? replaceable.filter(item => item.sameCourse) : [];
  return <section className={`room-suggestion-panel room-suggestion-panel--${variant}`} aria-label={label}>
    <header>
      <span className="room-suggestion-mark"><Armchair aria-hidden="true" /></span>
      <div><b>{label}</b><small>ضغطة تختار · الحفظ بيدك</small></div>
      <span className="room-suggestion-count">{suggestions.length}</span>
    </header>
    {suggestions.length ? <div className="room-suggest-list">
      {suggestions.map((slot, index) => {
        const facts = factsFor(slot.reasons);
        const best = index === 0 && suggestions.length > 1;
        const timed = Boolean(slot.start && slot.end);
        return <button type="button" key={slot.roomId ? `${slot.roomId}-${slot.start || ""}` : `${slot.room}-${slot.hall}-${index}`}
          className={best ? "is-best" : ""}
          data-guide-ignore="اختيار القاعة يملأ الموعد ولا يحفظه حتى يضغط المستخدم زر الحفظ"
          onClick={() => onSelect(slot)} title={(slot.reasons || []).join(" · ")}
          aria-label={`اختر القاعة ${slot.room}/${slot.hall}${timed ? `، ${formatScheduleTimeRange(slot.start!, slot.end!)}` : ""}`}>
          <span className="room-suggest-card-icon" aria-hidden="true">{variant === "slot" ? <b className="room-suggest-rank">{index + 1}</b> : <DoorOpen />}</span>
          <span className="room-suggest-card-copy">
            <span className="room-suggest-card-title">
              <bdi dir="ltr" className="room-suggest-code">{slot.room}/{slot.hall}</bdi>
              {best ? <em className="room-suggest-best"><Star aria-hidden="true" />الأنسب</em> : null}
            </span>
            {timed ? <small className="room-suggestion-time"><Clock3 aria-hidden="true" /><time dir="ltr">{formatScheduleTimeRange(slot.start!, slot.end!)}</time></small> : null}
            <span className="room-suggest-card-facts">
              {slot.companionRoomLabel ? <small className="room-suggest-fact good" title={`المرفق المرافق: ${slot.companionRoomLabel}`}><MonitorPlay aria-hidden="true" /><bdi dir="ltr">{slot.companionRoomLabel.split(" / ").pop()}</bdi></small> : null}
              {facts.length ? facts.map(fact => { const Icon = fact.icon; return <small className={`room-suggest-fact ${fact.tone}`} key={fact.text}><Icon aria-hidden="true" />{fact.text}</small>; }) : <small className="room-suggest-fact good"><CheckCircle2 aria-hidden="true" />متاحة</small>}
            </span>
          </span>
          <span className="room-suggest-card-action" aria-hidden="true"><Check /><small>اختيار</small></span>
        </button>;
      })}
    </div> : null}
    {assignable.length ? <div className="room-replaceable" role="group" aria-label="قابلة للاستبدال">
      <p className="room-replaceable-head"><Repeat2 aria-hidden="true" /><b>قابلة للاستبدال</b><small>شعبة «هيئة تدريسية» في الوقت نفسه</small></p>
      {assignable.map(item => <div className="room-replaceable-card" key={item.rowId}>
        <span className="room-replaceable-swap" aria-hidden="true">
          <span className="is-before"><UserRound /><small>هيئة</small></span>
          <ArrowLeftRight />
          <span className="is-after"><UserRoundCheck /><small>الأستاذ</small></span>
        </span>
        <span className="room-replaceable-copy">
          <bdi dir="ltr" className="room-suggest-code">{item.room}/{item.hall}</bdi>
          <small>{item.courseName || "المقرر نفسه"}{item.scode ? ` · شعبة ${item.scode}` : ""} · <time dir="ltr">{formatScheduleTimeRange(item.start, item.end)}</time></small>
        </span>
        <button type="button" className="room-replaceable-assign" disabled={replaceBusy}
          data-guide-ignore="يسند الأستاذ المختار إلى شعبة «هيئة تدريسية» القائمة للمقرر نفسه بدل إنشاء موعد جديد؛ يُسجَّل ويمكن التراجع عنه"
          onClick={() => onReplaceable?.(item)} title="إسناد الأستاذ لهذه الشعبة بدل موعد جديد (يمكن التراجع)">
          <Star aria-hidden="true" /><UserRoundCheck aria-hidden="true" /><span>إسناد</span>
        </button>
      </div>)}
    </div> : null}
  </section>;
}

