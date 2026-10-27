import React from "react";
import { Armchair, Check, CheckCircle2, Clock3, DoorOpen, MapPin, UsersRound } from "lucide-react";
import { formatScheduleTimeRange } from "../utils/scheduleTime";

export interface RoomSuggestion {
  room: string;
  hall: string;
  roomId?: string;
  buildingId?: string;
  start?: string;
  end?: string;
  score?: number;
  reasons?: string[];
}

function factsFor(reasons: string[] = []) {
  const facts: Array<{ text: string; icon: typeof CheckCircle2; tone: string }> = [];
  for (const reason of reasons) {
    let fact: (typeof facts)[number] | undefined;
    if (reason.startsWith("يلائم نوع المقرر")) fact = { text: "يناسب المقرر", icon: CheckCircle2, tone: "good" };
    else if (reason.includes("نوع القاعة") && reason.includes("مختلف")) fact = { text: "نوع مختلف", icon: DoorOpen, tone: "warn" };
    else if (reason.includes("السعة المسجلة مناسبة")) fact = { text: "سعة مناسبة", icon: UsersRound, tone: "good" };
    else if (reason.includes("السعة المسجلة أقل")) fact = { text: "سعة أقل", icon: UsersRound, tone: "warn" };
    else if (reason.includes("لا يترك فراغاً للأستاذ")) fact = { text: "دون فراغ", icon: Clock3, tone: "good" };
    else if (reason.startsWith("فراغ ")) fact = { text: reason.replace(" دقيقة", " د"), icon: Clock3, tone: "muted" };
    else if (reason.includes("بلا انتقال بين المباني")) fact = { text: "دون تنقّل", icon: MapPin, tone: "good" };
    else if (reason.startsWith("انتقال ")) fact = { text: reason.replace(" دقيقة", " د"), icon: MapPin, tone: "muted" };
    else if (reason.includes("داخل يوم القسم الحالي")) fact = { text: "ضمن يوم القسم", icon: CheckCircle2, tone: "good" };
    if (fact && !facts.some(item => item.text === fact!.text)) facts.push(fact);
    if (facts.length === 2) break;
  }
  return facts;
}

/** Shared infographic used by the full editor and the quick-create card. */
export default function RoomSuggestionCards({
  suggestions, onSelect, label = "قاعات متاحة لموعدك",
}: {
  suggestions: RoomSuggestion[];
  onSelect: (suggestion: RoomSuggestion) => void;
  label?: string;
}) {
  return <section className="room-suggestion-panel" aria-label={label}>
    <header><span className="room-suggestion-mark"><Armchair aria-hidden="true" /></span><div><b>{label}</b><small>اختر القاعة المناسبة · لن يُحفظ الموعد حتى تضغط حفظ</small></div><span className="room-suggestion-count">{suggestions.length}</span></header>
    <div className="room-suggest-list">
      {suggestions.map((slot, index) => {
        const facts = factsFor(slot.reasons);
        return <button type="button" key={slot.roomId || `${slot.room}-${slot.hall}-${index}`}
          data-guide-ignore="اختيار القاعة يملأ الموعد ولا يحفظه حتى يضغط المستخدم زر الحفظ"
          onClick={() => onSelect(slot)} title={(slot.reasons || []).join(" · ")}
          aria-label={`اختر القاعة ${slot.room}/${slot.hall}${slot.start && slot.end ? `، ${formatScheduleTimeRange(slot.start, slot.end)}` : ""}`}>
          <span className="room-suggest-card-icon" aria-hidden="true"><DoorOpen /></span>
          <span className="room-suggest-card-copy">
            <bdi dir="ltr">{slot.room}/{slot.hall}</bdi>
            {slot.start && slot.end ? <small className="room-suggestion-time"><Clock3 aria-hidden="true" /> <time dir="ltr">{formatScheduleTimeRange(slot.start, slot.end)}</time></small> : null}
            <span className="room-suggest-card-facts">
              {facts.length ? facts.map(fact => { const Icon = fact.icon; return <small className={`room-suggest-fact ${fact.tone}`} key={fact.text}><Icon aria-hidden="true" />{fact.text}</small>; }) : <small className="room-suggest-fact good"><CheckCircle2 aria-hidden="true" />متاحة</small>}
            </span>
          </span>
          <span className="room-suggest-card-action" aria-hidden="true"><Check /><small>اختيار</small></span>
        </button>;
      })}
    </div>
  </section>;
}
