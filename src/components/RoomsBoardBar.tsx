/**
 * ── شريط لوحة المباني والقاعات (الكمبيوتر) ─────────────────────────────────────
 *
 * فوق اللوحة التي تعرض كل القاعات معاً: بحثٌ يفهم الحاجة («٤٠ مقعداً الأحد ١٠»)، ثم المباني أزراراً ظاهرةً
 * بشريطِ إشغالٍ تحت كلٍّ منها، ثم القاعات شرائح. عرضٌ فقط: لا يعرف المواعيد ولا يكتب شيئاً؛ يستدعي ما يُعطاه.
 * القاعاتُ التي لا تناسب الحاجة تخفت في اللوحة (أو تُطوى بزرٍّ واحد)، ولا يُحذف منها شيء.
 */
import React from "react";
import { Building2, EyeOff, MapPin, Search, Sparkles, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";

export interface BoardBuilding { key: string; label: string; occupancy: number; roomCount: number }
export interface BoardRoom { key: string; label: string; fits: boolean }

interface Props {
  buildings: BoardBuilding[];
  chosenBuildings: Set<string>;
  onBuilding: (key: string | null) => void;
  rooms: BoardRoom[];
  chosenRooms: Set<string>;
  onRoom: (key: string | null) => void;
  query: string;
  onQuery: (value: string) => void;
  /** نصُّ الحاجة المفهومة («٤٠ مقعداً فأكثر · الأحد · ١٠:٠٠») أو فارغ. */
  needText: string;
  /** عددُ القاعات المناسبة من المعروضة، حين تكون هناك حاجة. */
  fitCount: number | null;
  hideUnfit: boolean;
  onHideUnfit: (value: boolean) => void;
  readOnly: boolean;
}

const scrollInto = (event: React.MouseEvent<HTMLElement>) => {
  const node = event.currentTarget;
  requestAnimationFrame(() => node.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "center" }));
};

export default function RoomsBoardBar(props: Props) {
  const { buildings, chosenBuildings, onBuilding, rooms, chosenRooms, onRoom, query, onQuery, needText, fitCount, hideUnfit, onHideUnfit, readOnly } = props;
  return (
    <div className="rb-bar">
      {!readOnly ? (
        <div className="rb-search">
          <label className="rb-field">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={event => onQuery(event.target.value)}
              placeholder="ابحث عن قاعة، أو اكتب حاجتك: ٤٠ مقعداً الأحد ١٠"
              aria-label="ابحث عن قاعة بالرمز، أو اكتب حاجتك مثل «٤٠ مقعداً الأحد ١٠» أو «مختبر الاثنين مساءً»"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? (
              <button type="button" className="rb-clear" aria-label="امسح البحث" data-guide-ignore="مسح نص البحث فقط" onClick={() => onQuery("")}><X aria-hidden="true" /></button>
            ) : null}
          </label>
          {needText ? (
            <div className="rb-need" aria-live="polite">
              <Sparkles aria-hidden="true" />
              <span>فهمتُ: <b>{needText}</b></span>
              {fitCount != null ? <em>{fitCount ? `${countOf(fitCount, AR.room)} مناسبة` : "لا قاعة مناسبة"}</em> : null}
              <button
                type="button"
                className={`rb-toggle ${hideUnfit ? "on" : ""}`}
                aria-pressed={hideUnfit}
                data-guide-ignore="طيّ القاعات غير المناسبة عرضٌ فقط"
                onClick={() => onHideUnfit(!hideUnfit)}
              >
                <EyeOff aria-hidden="true" />أخفِ غير المناسبة
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {buildings.length > 0 ? (
        <div className="rb-group">
          <div className="rb-label"><Building2 aria-hidden="true" /><strong>المباني</strong><small>{chosenBuildings.size ? `${countOf(chosenBuildings.size, AR.building)} من ${buildings.length}` : "الكل"}</small></div>
          <div className="rooms-picker rb-picker" role="group" aria-label="اختيار مبنى واحد أو عدة مبانٍ">
            <button
              type="button"
              className={`rb-building ${chosenBuildings.size ? "" : "on"}`}
              aria-pressed={chosenBuildings.size === 0}
              data-guide-ignore="مرشح بصري للمباني داخل لوحة القاعات؛ لا يغير بيانات الجدول"
              onClick={event => { onBuilding(null); scrollInto(event); }}
            >
              <b>كل المباني</b><small>{countOf(buildings.reduce((sum, item) => sum + item.roomCount, 0), AR.room)}</small>
            </button>
            {buildings.map(item => (
              <button
                type="button"
                key={item.key}
                className={`rb-building ${chosenBuildings.has(item.key) ? "on" : ""}`}
                style={{ ["--occ" as any]: item.occupancy }}
                aria-pressed={chosenBuildings.has(item.key)}
                aria-label={`${item.label}، ${countOf(item.roomCount, AR.room)}، إشغال ${item.occupancy}%`}
                data-guide-ignore="مرشح بصري لمبنى داخل لوحة القاعات؛ لا يغير بيانات الجدول"
                title={`${chosenBuildings.has(item.key) ? "إخفاء" : "إظهار"} ${item.label} — إشغال ${item.occupancy}%`}
                onClick={event => { onBuilding(item.key); scrollInto(event); }}
              >
                <b dir="ltr">{item.label}</b>
                <small>{countOf(item.roomCount, AR.room)} · <span dir="ltr">{item.occupancy}%</span></small>
                <i className="rb-occ" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {rooms.length > 1 ? (
        <div className="rb-group">
          <div className="rb-label"><MapPin aria-hidden="true" /><strong>القاعات</strong><small>{chosenRooms.size ? `اخترت ${chosenRooms.size} من ${rooms.length}` : `${rooms.length} ظاهرة`}</small></div>
          <div className="rooms-picker rb-picker" role="group" aria-label="اختيار قاعة واحدة أو عدة قاعات">
            <button
              type="button"
              className={`rooms-chip ${chosenRooms.size ? "" : "on"}`}
              aria-pressed={chosenRooms.size === 0}
              data-guide-ignore="مرشح بصري للقاعات داخل لوحة القاعات؛ لا يغير بيانات الجدول"
              onClick={event => { onRoom(null); scrollInto(event); }}
            >
              كل القاعات
            </button>
            {rooms.map(room => (
              <button
                type="button"
                key={room.key}
                className={`rooms-chip ${chosenRooms.has(room.key) ? "on" : ""} ${needText && !room.fits ? "rb-unfit" : ""}`}
                aria-pressed={chosenRooms.has(room.key)}
                data-guide-ignore="مرشح بصري لقاعة داخل لوحة القاعات؛ لا يغير بيانات الجدول"
                onClick={event => { onRoom(room.key); scrollInto(event); }}
              >
                <span dir="ltr">{room.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
