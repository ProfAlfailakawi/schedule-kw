/**
 * ── لوحةُ المباني والقاعات: أجزاءٌ مُحفَظة لا تُرسَم إلا إذا تغيّرت ──────────────────────────
 *
 * كانت اللوحةُ شجرةً واحدةً داخل Schedules.tsx تُعاد كلُّها عند كل ضغطةٍ أو سحبٍ أو تسليح:
 * مئةُ قاعة × خمسة أيام × (٢٤ مربّعَ ساعة + ٢٤ خطّاً) ≈ ٢٤ ألف عنصر، تُقارَن عناصرُها في كل تصيير
 * وبطاقاتُها كلُّها (١٨٠٠ بطاقة على ألف موعد) تُبنى من جديد، بينما لم يتغيّر منها إلا مربّعٌ أو بطاقة.
 *
 * هنا ثلاثةُ أشياء، والمظهرُ (الأصنافُ وسماتُ data-*) كما كان حرفاً بحرف:
 *   1) `RoomsRoomBoundary`: قاعةٌ كاملةٌ تُعاد رسمُها حين تتغيّر «بصمتُها» وحدها، كما يفعل WeekCardBoundary للأسبوع.
 *      البصمةُ تحمل كلَّ ما يقرؤه الرسمُ ومعالجاتُه (المرئيَّ والسلوكيَّ)؛ ما نقص منها يُرى بطاقةً قديمة، فمن الشكّ يدخل فيها.
 *   2) `RoomsTrackGrid`: مربّعاتُ الساعات وخطوطُها لمسارِ يومٍ واحد — هي كتلةُ العناصر الكبرى. تُحفَظ بخصائص أوّلية
 *      ومعالجاتٍ ثابتةٍ (مرجعٌ لا يتبدّل)، فلا يلمسها السحبُ إلا في المسار الذي تغيّر فيه تظليلٌ.
 *   3) `objectId` و`buildRoomsSlotGeo`: هويةٌ رقميةٌ للكائنات تُدخَل في البصمة بلا تسلسلها، وهندسةُ المربّعات تُحسب مرةً لكل تغيّر
 *      في النافذة الزمنية لا مرةً لكل قاعة ويوم.
 */
import React from "react";

/** هويةٌ رقميةٌ ثابتةٌ لكائنٍ حيّ: تغيّرُ المرجع تغيّرٌ في الرقم، فتُدخَل في البصمة بدل تسلسل الكائن كلّه. */
const ids = new WeakMap<object, number>();
let nextObjectId = 1;
export function objectId(value: unknown): number {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return 0;
  const known = ids.get(value as object);
  if (known) return known;
  const made = nextObjectId++;
  ids.set(value as object, made);
  return made;
}

/** مربّعٌ واحدٌ على مسار اليوم: موضعُه وعرضُه وخطُّ ساعته، محسوبةً مرةً واحدة. */
export interface RoomsSlotGeo {
  slot: string;
  slotStyle: React.CSSProperties;
  lineClass: string;
  lineStyle: React.CSSProperties;
}

export function buildRoomsSlotGeo(
  timeSlots: readonly string[],
  mins: (clock: string) => number,
  pct: (minutes: number) => number,
  spanPct: (from: number, to: number) => number,
  slotMinutes: number,
  dayEndTime: string,
): RoomsSlotGeo[] {
  return timeSlots.map(slot => {
    const at = mins(slot);
    return {
      slot,
      slotStyle: { right: `${pct(at)}%`, width: `${spanPct(at, at + slotMinutes)}%` },
      lineClass: `rooms-hourline ${at % 60 === 0 ? "rooms-hourline-major" : "rooms-hourline-half"} ${slot === dayEndTime ? "rooms-hourline-terminal" : ""}`,
      lineStyle: { right: `${pct(at)}%` },
    };
  });
}

/** معالجاتُ المربّعات: مرجعٌ ثابتٌ تُحدَّث محتوياته كل تصيير، فلا تتقادم أيٌّ منها داخل عنصرٍ محفوظ. */
export interface RoomsSlotHandlers {
  down: (event: React.PointerEvent<HTMLElement>, at: { day: string; slot: string; roomCode: string; roomHall: string; trackKey: string }) => void;
  enter: (at: { day: string; slot: string; roomCode: string; roomHall: string; trackKey: string }) => void;
}

interface RoomsTrackGridProps {
  geo: readonly RoomsSlotGeo[];
  day: string;
  dayLabel: string;
  /** «القاعة» أو «بلا قاعة»: النصُّ بعد «·» في السمة والتلميح. */
  placeLabel: string;
  roomCode: string;
  roomHall: string;
  /** القيمةُ المكتوبة في data-physics-room («code|hall»). */
  roomAttr: string;
  trackKey: string;
  /** صنفُ تظليل كل مربّعٍ مفصولةً بـ\u0001؛ فارغٌ حين لا سحبَ ولا اقتراح. */
  slotClassSig: string;
  handlers: React.MutableRefObject<RoomsSlotHandlers>;
}

export const RoomsTrackGrid = React.memo(function RoomsTrackGrid(props: RoomsTrackGridProps) {
  const { geo, day, dayLabel, placeLabel, roomCode, roomHall, roomAttr, trackKey, slotClassSig, handlers } = props;
  const classes = slotClassSig ? slotClassSig.split("\u0001") : null;
  return (
    <>
      {geo.map((item, index) => (
        <i
          key={`slot-${item.slot}`}
          className={`rooms-slot ${classes ? classes[index] || "" : ""}`}
          data-physics-slot="true"
          data-physics-day={day}
          data-physics-start={item.slot}
          data-physics-label={`${dayLabel} · ${placeLabel}`}
          data-physics-room={roomAttr}
          style={item.slotStyle}
          role="button"
          tabIndex={-1}
          title={`إضافة موعد · ${dayLabel} ${item.slot} · ${placeLabel}`}
          onPointerDown={(e) => handlers.current.down(e, { day, slot: item.slot, roomCode, roomHall, trackKey })}
          onPointerEnter={() => handlers.current.enter({ day, slot: item.slot, roomCode, roomHall, trackKey })}
        />
      ))}
      {geo.map(item => <i key={item.slot} className={item.lineClass} style={item.lineStyle} />)}
    </>
  );
});

/** قاعةٌ كاملةٌ: `draw` يرسمها، و`sig` وحده يقرّر إن كان الرسمُ يُعاد (المقارنةُ لا تنظر إلى غيره). */
export const RoomsRoomBoundary = React.memo(
  function RoomsRoomBoundary({ draw }: { sig: string; draw: () => React.ReactElement }) {
    return draw();
  },
  (previous, next) => previous.sig === next.sig,
);

/** ما يقرؤه خطُّ «الآن»: تُحدَّث محتوياتُه كل تصيير للوحة، فلا تُعاد القاعاتُ المئةُ كلَّ دقيقةٍ لتحريك خطٍّ واحد. */
export interface RoomsNowSource { minutes: number; start: number; end: number; pct: (minutes: number) => number; clock: (minutes: number) => string }

/**
 * خطُّ «الآن» في مسار اليوم الحاليّ: يقرأ الدقيقةَ من مرجعٍ ويفحصه كل ثوانٍ، فيتحرّك وحده.
 * كانت الدقيقةُ في بصمة كل قاعة، فتُعاد اللوحةُ كلُّها مع كل دقيقةٍ تمرّ (ثوانيَ من الجمود على ألف موعد).
 * `stamp` هندسةُ اللوحة لحظةَ الرسم: يتغيّر بتغيّر النافذة الزمنية فيُعاد رسمُ الخطّ مع قاعته.
 */
export const RoomsNowLine = React.memo(function RoomsNowLine({ source }: { source: React.MutableRefObject<RoomsNowSource>; stamp: string }) {
  const [, tick] = React.useState(0);
  const stampOf = (now: RoomsNowSource) => `${now.minutes}|${now.start}|${now.end}|${now.pct(now.start + 60)}`;
  const shown = React.useRef("");
  React.useEffect(() => {
    const id = window.setInterval(() => { if (stampOf(source.current) !== shown.current) tick(count => count + 1); }, 5000);
    return () => window.clearInterval(id);
  }, [source]);
  const now = source.current;
  shown.current = stampOf(now);
  if (now.minutes < now.start || now.minutes > now.end) return null;
  const label = now.clock(now.minutes);
  return <i className="rooms-now" style={{ right: `${now.pct(now.minutes)}%` }} title={`الآن · ${label}`}><b dir="ltr">{label}</b></i>;
});
