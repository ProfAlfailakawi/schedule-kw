/**
 * ── مستكشف المباني والقاعات ────────────────────────────────────────────────────
 *
 * قاعةٌ واحدةٌ على الشاشة بدل لوحةٍ من عشرات الصفوف: قائمةُ مبنى وقائمةُ قاعة (فيها بحثٌ يفهم الحاجة)،
 * ومفتاحٌ [قاعة | نظرة المبنى]. القاعةُ: رمزُها وحالتُها الآن ونسبةُ إشغالها وأقربُ فراغٍ (يفتح «موعد جديد» جاهزاً)،
 * وشريطٌ واحدٌ يفتح أسبوعَها بانزلاقٍ هادئ؛ والمقارنةُ بقاعتين إضافيتين كحدٍّ أقصى. نظرةُ المبنى: شريطُ حرارةٍ لكل قاعة.
 *
 * جدولُ الأسبوع نفسُه (السحبُ والتلوينُ والتراجع…) يرسمه Schedules.tsx ويصل هنا عبر renderWeek؛ هذا الملف
 * لا يعرف المواعيد ولا يكتب شيئاً: يقرأ نموذجاً جاهزاً ويستدعي ما يُعطاه.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, DoorOpen, Palette, Plus, X } from "lucide-react";
import RoomsDropdown, { type RxOption } from "./RoomsDropdown";
import RoomsOverview from "./RoomsOverview";
import { AR, countOf } from "../utils/arabicCount";
import { safeStorage } from "../utils/safeStorage";
import { NO_ROOM_KEY, clockText, nextFreeWindows, type RxBuilding, type RxDay, type RxRoom } from "../utils/roomsExplorerModel";
import { roomNowStatus, type RoomNowRow } from "../utils/roomNow";
import { parseRoomQuery, type RoomQuery } from "../utils/roomQuery";
import { roomFactsText, roomMatchesNeed } from "../utils/roomFacts";

const PREF_KEY = "rooms-explorer:v1";
const WEEKS_KEY = "rooms-explorer:weeks";
type View = "room" | "ov";

export interface RoomsExplorerProps {
  buildings: RxBuilding[];
  rooms: RxRoom[];
  days: RxDay[];
  windowStart: number;
  windowEnd: number;
  noRoomCount: number;
  readOnly: boolean;
  /** يقفز المستكشف إلى قاعةٍ بعينها (بعد نقلٍ إليها مثلاً). */
  goto: { key: string; n: number } | null;
  tools: React.ReactNode;
  /** سطرُ إرشادٍ هادئ فوق جدول الأسبوع (يُحذف في وضع التركيز وعلى الهاتف). */
  hint?: string;
  dragNote: React.ReactNode;
  info: React.ReactNode;
  renderWeek: (roomKeys: string[], includeNone: boolean) => React.ReactNode;
  onCreate: (room: RxRoom, dayIndex: number, from: number) => void;
  onNavigate: () => void;
}

const reduced = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** تركيب/فكّ تركيب محتوى الانزلاق: يبقى مركّباً حتى تنتهي حركة الطيّ. */
function useSlide(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), reduced() ? 0 : 420);
    return () => window.clearTimeout(timer);
  }, [open]);
  return { mounted, shown };
}

/** مجالاتُ القاعة كصفوفٍ بسيطة لمساعدَي roomNow/roomQuery. */
export const rowsOfRoom = (room: RxRoom, days: RxDay[]): Array<RoomNowRow & Record<string, any>> =>
  room.perDay.flatMap((list, index) => list.map(item => ({ fstarttime: clockText(item.from), fendtime: clockText(item.to), [days[index]?.key || ""]: true })));

/** نصُّ الحاجة المفهومة شريحةً: سعة · مختبر · يوم · وقت. */
export const needLabel = (need: RoomQuery, days: RxDay[]): string => [
  need.minCapacity ? `${countOf(need.minCapacity, AR.seat)} فأكثر` : "",
  need.lab ? "مختبر" : "",
  need.day ? days.find(day => day.key === need.day)?.label : "",
  need.from ? (need.to ? `${need.from}–${need.to}` : need.from) : "",
].filter(Boolean).join(" · ");

const Ring = ({ percent, label }: { percent: number; label: string }) => (
  <span className="rx-ring" style={{ ["--p" as any]: percent }} role="img" aria-label={label}>
    <span aria-hidden="true" dir="ltr">{percent}%</span>
  </span>
);

interface BlockProps {
  key?: string;
  room: RxRoom | null;
  noRoomCount: number;
  days: RxDay[];
  windowStart: number;
  windowEnd: number;
  now: Date;
  open: boolean;
  onToggle: () => void;
  renderWeek: RoomsExplorerProps["renderWeek"];
  onCreate: RoomsExplorerProps["onCreate"];
  tools?: React.ReactNode;
  hint?: string;
  prev?: (() => void) | null;
  next?: (() => void) | null;
  onRemove?: () => void;
  compact?: boolean;
}

function RoomBlock({ room, noRoomCount, days, windowStart, windowEnd, now, open, onToggle, renderWeek, onCreate, tools, hint, prev, next, onRemove, compact }: BlockProps) {
  const { mounted, shown } = useSlide(open);
  const [toolsOpen, setToolsOpen] = useState(false);
  const status = useMemo(() => {
    if (!room) return null;
    const result = roomNowStatus(rowsOfRoom(room, days), now);
    if (result.state === "none") return null;
    return { kind: result.state === "busy-soon" ? "soon" : result.state === "busy-until" ? "busy" : "free", text: result.text };
  }, [room, now, days]);
  const free = useMemo(() => room ? nextFreeWindows(room.perDay, windowStart, windowEnd, 50, 4) : [], [room, windowStart, windowEnd]);
  const lectures = room ? room.lectures : noRoomCount;
  const title = room ? room.label : "بلا قاعة";
  const onKey = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    /* RTL: السهم الأيمن هو «السابق» بصرياً. */
    if (event.key === "ArrowRight" && prev) { event.preventDefault(); prev(); }
    else if (event.key === "ArrowLeft" && next) { event.preventDefault(); next(); }
  };
  return (
    <section className={`rx-room ${compact ? "is-compact" : ""}`} aria-label={`القاعة ${title}`}>
      <header className="rx-hero" tabIndex={prev || next ? 0 : undefined} onKeyDown={onKey} aria-label={prev || next ? `القاعة ${title}، السهمان يتنقّلان بين قاعات المبنى` : undefined}>
        {prev !== undefined || next !== undefined ? (
          <button type="button" className="rx-nav" aria-label="القاعة السابقة" disabled={!prev} data-guide-ignore="تنقّلٌ إلى القاعة السابقة في المبنى" onClick={() => prev?.()}>
            <ChevronRight aria-hidden="true" />
          </button>
        ) : null}
        <div className="rx-hero-id">
          <span className="rx-code" dir="ltr">{title}</span>
          <small>{room ? room.building : "مواعيد لم تُسنَد لها قاعة"}</small>
        </div>
        {status ? <span className={`rx-status is-${status.kind}`} role="status">{status.text}</span> : null}
        <span className="rx-grow" />
        {room ? <Ring percent={room.occupancy} label={`إشغال الأسبوع ${room.occupancy}%`} /> : null}
        {prev !== undefined || next !== undefined ? (
          <button type="button" className="rx-nav" aria-label="القاعة التالية" disabled={!next} data-guide-ignore="تنقّلٌ إلى القاعة التالية في المبنى" onClick={() => next?.()}>
            <ChevronLeft aria-hidden="true" />
          </button>
        ) : null}
        {onRemove ? (
          <button type="button" className="rx-x" aria-label={`إزالة القاعة ${title} من المقارنة`} data-guide-ignore="إزالة قاعة من المقارنة" onClick={onRemove}>
            <X aria-hidden="true" />
          </button>
        ) : null}
      </header>
      {room ? (
        <div className="rx-free">
          <span>أقرب فراغ</span>
          {free.length ? free.map(window_ => (
            <button
              key={`${window_.dayIndex}-${window_.from}`}
              type="button"
              className="rx-chip"
              aria-label={`احجز القاعة ${title}، ${days[window_.dayIndex]?.label}، من ${clockText(window_.from)}`}
              title={`فراغٌ حتى ${clockText(window_.to)} — اضغط لإضافة موعدٍ جاهز`}
              data-guide-ignore="فتح «موعد جديد» مُعبّأً بالقاعة واليوم والساعة من أقرب فراغ"
              onClick={() => onCreate(room, window_.dayIndex, window_.from)}
            >
              <Plus aria-hidden="true" />{days[window_.dayIndex]?.label} <span dir="ltr">{clockText(window_.from)}</span>
            </button>
          )) : <em>لا فراغ يتّسع لمحاضرة هذا الأسبوع</em>}
        </div>
      ) : null}
      <button
        type="button"
        className="rx-weekbar"
        aria-expanded={open}
        data-guide-ignore="فتح أسبوع القاعة أو طيّه؛ عرضٌ فقط"
        onClick={onToggle}
      >
        <CalendarDays aria-hidden="true" />
        <b>{open ? "اطوِ أسبوع القاعة" : "افتح أسبوع القاعة"}</b>
        <small>{countOf(days.length, AR.day)} · {countOf(lectures, AR.lecture)}</small>
        <span className="rx-grow" />
        <ChevronDown className="rx-chev" aria-hidden="true" />
      </button>
      <div className={`rx-slide ${shown ? "is-open" : ""}`} aria-hidden={!open}>
        <div className="rx-slide-in" {...(!open ? { inert: "" as any } : {})}>
          {mounted ? (
            <div className="rx-week" data-tint={toolsOpen ? "on" : "off"}>
              {hint ? <p className="rx-hint">{hint}</p> : null}
              {tools ? (
                <div className="rx-tools">
                  <button type="button" className="rx-btn" aria-expanded={toolsOpen} data-guide-ignore="إظهار مفتاح الألوان والتصفية البصرية؛ عرضٌ فقط" onClick={() => setToolsOpen(current => !current)}>
                    <Palette aria-hidden="true" />ألوان وتصفية
                  </button>
                  {toolsOpen ? tools : null}
                </div>
              ) : null}
              {renderWeek([room ? room.key : NO_ROOM_KEY], !room)}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function RoomsExplorer(props: RoomsExplorerProps) {
  const { buildings, rooms, days, windowStart, windowEnd, noRoomCount, readOnly, goto, tools, hint, dragNote, info, renderWeek, onCreate, onNavigate } = props;
  const saved = useMemo(() => safeStorage.json<{ b?: string; r?: string; v?: string }>(PREF_KEY, {}), []);
  const [bKey, setBKey] = useState(saved.b || "");
  const [rKey, setRKey] = useState(saved.r || "");
  const [view, setView] = useState<View>(saved.v === "ov" ? "ov" : "room");
  const [extra, setExtra] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [dayIndex, setDayIndex] = useState(0);
  const [weeks, setWeeks] = useState<Record<string, boolean>>(() => safeStorage.json(WEEKS_KEY, {}, "session"));
  const [now, setNow] = useState(() => new Date());
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    /* نظرةُ المبنى تفتح على يوم اليوم (بتوقيت الكويت) إن كان يومَ تدريس. */
    const today = new Date(Date.now() + 3 * 3600_000).getUTCDay();
    if (today >= 0 && today < days.length) setDayIndex(today);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const building = buildings.find(item => item.key === bKey) || buildings[0] || null;
  const roomsOfBuilding = useMemo(() => building ? rooms.filter(room => room.buildingKey === building.key) : [], [rooms, building]);
  const noRoomChosen = rKey === NO_ROOM_KEY && noRoomCount > 0;
  const room = noRoomChosen ? null : roomsOfBuilding.find(item => item.key === rKey) || (building ? roomsOfBuilding[0] || null : null);
  const roomIndex = room ? roomsOfBuilding.findIndex(item => item.key === room.key) : -1;
  const hasNone = noRoomCount > 0;
  const showNone = noRoomChosen || (!room && hasNone);

  useEffect(() => {
    safeStorage.set(PREF_KEY, JSON.stringify({ b: building?.key || "", r: showNone ? NO_ROOM_KEY : room?.key || "", v: view }));
  }, [building?.key, room?.key, showNone, view]);
  useEffect(() => { safeStorage.set(WEEKS_KEY, JSON.stringify(weeks), "session"); }, [weeks]);

  const choose = useCallback((next: { b?: string; r?: string; v?: View }) => {
    if (next.b !== undefined) setBKey(next.b);
    if (next.r !== undefined) setRKey(next.r);
    if (next.v) setView(next.v);
    setExtra([]);
    onNavigate();
  }, [onNavigate]);

  useEffect(() => {
    if (!goto) return;
    const target = rooms.find(item => item.key === goto.key);
    if (!target) return;
    setBKey(target.buildingKey); setRKey(target.key); setView("room"); setExtra([]);
    setWeeks(current => ({ ...current, [target.key]: true }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goto?.n]);

  const stepRoom = (step: number) => {
    const target = roomsOfBuilding[roomIndex + step];
    if (target) choose({ r: target.key });
  };
  const prev = room && roomIndex > 0 ? () => stepRoom(-1) : null;
  const next = room && roomIndex >= 0 && roomIndex < roomsOfBuilding.length - 1 ? () => stepRoom(1) : null;

  /* ── البحث بالحاجة ── */
  const parsed = useMemo(() => parseRoomQuery(query), [query]);
  const need = parsed.day || parsed.from || parsed.minCapacity || parsed.lab ? { ...parsed, label: needLabel(parsed, days) } : null;
  const filtered = useMemo(() => {
    const text = (need ? parsed.rest : query).trim().toLowerCase();
    return roomsOfBuilding.filter(item => {
      if (need && !roomMatchesNeed(item, rowsOfRoom(item, days), parsed).match) return false;
      return !text || item.label.toLowerCase().includes(text);
    });
  }, [roomsOfBuilding, need, parsed, query, days]);

  const buildingOptions: RxOption[] = buildings.map(item => ({
    key: item.key,
    aria: `${item.label}، ${countOf(item.roomCount, AR.room)}، إشغال ${item.occupancy}%`,
    node: <><Ring percent={item.occupancy} label={`إشغال ${item.occupancy}%`} /><b dir="ltr">{item.label}</b><small>{countOf(item.roomCount, AR.room)}</small></>,
  }));
  const roomOptions: RxOption[] = [
    ...filtered.map(item => {
      const facts = roomFactsText(item);
      /* الحاجةُ تُبقي القاعةَ المجهولة السعة/النوع وتَسمها بهدوء بدل حذفها (القاعدة في roomFacts.ts). */
      const verdict = need ? roomMatchesNeed(item, [], parsed) : null;
      const unknown = verdict?.capacityUnknown ? "السعة غير مسجّلة" : verdict?.typeUnknown ? "النوع غير مسجّل" : "";
      return {
        key: item.key,
        aria: `قاعة ${item.label}${facts ? `، ${facts}` : ""}${unknown ? `، ${unknown}` : ""}، إشغال ${item.occupancy}%، ${countOf(item.lectures, AR.lecture)}`,
        node: <><i className={`rx-dot ${item.occupancy < 40 ? "is-free" : ""}`} aria-hidden="true" /><b dir="ltr">{item.label}</b>{facts || unknown ? <small className="rx-opt-facts">{[facts, unknown].filter(Boolean).join(" · ")}</small> : null}<small>{countOf(item.lectures, AR.lecture)} · <span dir="ltr">{item.occupancy}%</span></small></>,
      };
    }),
    ...(hasNone && !query ? [{ key: NO_ROOM_KEY, aria: `بلا قاعة، ${countOf(noRoomCount, AR.lecture)}`, node: <><i className="rx-dot" aria-hidden="true" /><b>بلا قاعة</b><small>{countOf(noRoomCount, AR.lecture)}</small></> }] : []),
  ];

  const toggleWeek = (key: string) => setWeeks(current => ({ ...current, [key]: !current[key] }));
  const extraRooms = extra.map(key => roomsOfBuilding.find(item => item.key === key)).filter(Boolean) as RxRoom[];
  const compareOptions: RxOption[] = roomsOfBuilding
    .filter(item => item.key !== room?.key && !extra.includes(item.key))
    .map(item => ({
      key: item.key,
      aria: `قاعة ${item.label}، إشغال ${item.occupancy}%`,
      node: <><i className={`rx-dot ${item.occupancy < 40 ? "is-free" : ""}`} aria-hidden="true" /><b dir="ltr">{item.label}</b><small dir="ltr">{item.occupancy}%</small></>,
    }));

  const onTouchStart = (event: React.TouchEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest(".rooms-main-scroll, .rooms-ruler-scroll, .rx-dd-panel, .rx-info, input")) { swipe.current = null; return; }
    const touch = event.touches[0];
    swipe.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = swipe.current; swipe.current = null;
    if (!start || !room || view !== "room") return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45 || Math.abs(dx) < Math.abs(dy) * 2) return;
    /* RTL: السحب نحو اليسار يكشف التالي. */
    if (dx < 0) next?.(); else prev?.();
  };

  if (!building && !hasNone) {
    return <p className="rooms-empty rx-empty">لا قاعات مسجلة في هذا النطاق بعد — أسنِد قاعة لأي محاضرة وستظهر هنا.</p>;
  }

  return (
    <div className="rx-root" data-guide-target="schedule.rooms.board" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="rx-pick">
        {building ? (
          <RoomsDropdown
            label="اختيار المبنى"
            button={<><Ring percent={building.occupancy} label={`إشغال المبنى ${building.occupancy}%`} /><span className="rx-dd-text"><b dir="ltr">{building.label}</b><small>{countOf(building.roomCount, AR.room)}</small></span></>}
            options={buildingOptions}
            selectedKey={building.key}
            onSelect={key => choose({ b: key, r: "", v: view })}
          />
        ) : null}
        <RoomsDropdown
          label="اختيار القاعة"
          button={<><DoorOpen aria-hidden="true" /><span className="rx-dd-text"><b dir="ltr">{showNone ? "بلا قاعة" : room?.label || "—"}</b><small>{room ? `${countOf(room.lectures, AR.lecture)} · ${room.occupancy}%` : countOf(noRoomCount, AR.lecture)}</small></span></>}
          options={roomOptions}
          selectedKey={showNone ? NO_ROOM_KEY : room?.key || null}
          onSelect={key => choose({ r: key, v: "room" })}
          search={{
            value: query, onChange: setQuery, label: "ابحث عن قاعة أو عن حاجة مثل «الأحد 10» أو «الاثنين مساءً»",
            placeholder: "قاعة، أو «الأحد 10»…",
            chip: need ? (
              <span className="rx-need">
                <b>{need.label}</b>
                <button type="button" aria-label={`مسح الشرط ${need.label}`} data-guide-ignore="مسح شرط الحاجة المفهوم من نص البحث" onClick={() => setQuery(parsed.rest)}><X aria-hidden="true" /></button>
              </span>
            ) : null,
          }}
          empty="لا قاعة مطابقة."
        />
        <span className="rx-grow" />
        <div className="rx-seg" role="group" aria-label="طريقة العرض">
          <button type="button" aria-pressed={view === "room"} data-guide-ignore="تبديل العرض بين قاعةٍ واحدة ونظرة المبنى" onClick={() => choose({ v: "room" })}>قاعة</button>
          <button type="button" aria-pressed={view === "ov"} disabled={!building} data-guide-ignore="تبديل العرض بين قاعةٍ واحدة ونظرة المبنى" onClick={() => choose({ v: "ov" })}>نظرة المبنى</button>
        </div>
      </div>
      {readOnly ? <p className="rx-note">على الهاتف يبقى عرض المباني والقاعات للقراءة فقط، والتعديل والإضافة متاحان من الكمبيوتر.</p> : null}
      {dragNote}
      {view === "ov" && building ? (
        <RoomsOverview
          rooms={roomsOfBuilding}
          days={days}
          dayIndex={dayIndex}
          onDay={setDayIndex}
          onOpenRoom={key => choose({ r: key, v: "room" })}
          windowStart={windowStart}
          windowEnd={windowEnd}
        />
      ) : (
        <>
          <RoomBlock
            key={showNone ? NO_ROOM_KEY : room?.key}
            room={showNone ? null : room}
            noRoomCount={noRoomCount}
            days={days} windowStart={windowStart} windowEnd={windowEnd} now={now}
            open={Boolean(weeks[showNone ? NO_ROOM_KEY : room?.key || ""])}
            onToggle={() => toggleWeek(showNone ? NO_ROOM_KEY : room?.key || "")}
            renderWeek={renderWeek} onCreate={onCreate} tools={tools} hint={hint}
            prev={showNone ? undefined : prev} next={showNone ? undefined : next}
          />
          {extraRooms.map(item => (
            <RoomBlock
              key={item.key} room={item} noRoomCount={noRoomCount} compact
              days={days} windowStart={windowStart} windowEnd={windowEnd} now={now}
              open={Boolean(weeks[item.key])} onToggle={() => toggleWeek(item.key)}
              renderWeek={renderWeek} onCreate={onCreate}
              onRemove={() => setExtra(current => current.filter(key => key !== item.key))}
            />
          ))}
          {room && extra.length < 2 && compareOptions.length ? (
            <div className="rx-compare">
              <RoomsDropdown
                label="قارن بقاعة أخرى"
                compact
                button={<><Plus aria-hidden="true" /><span>قارن بقاعة أخرى</span></>}
                options={compareOptions}
                selectedKey={null}
                onSelect={key => { setExtra(current => [...current, key].slice(0, 2)); setWeeks(current => ({ ...current, [key]: true })); }}
              />
              <small><Building2 aria-hidden="true" />{extra.length ? `${countOf(extra.length, AR.room)} للمقارنة` : "حتى قاعتين إضافيتين"}</small>
            </div>
          ) : null}
        </>
      )}
      {info}
    </div>
  );
}
