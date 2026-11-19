import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, Save } from "lucide-react";
import LocationPicker from "./LocationPicker";
import CompanionFacilityPicker from "./CompanionFacilityPicker";
import { PracticalMark } from "./PracticalMark";
import type { AdCourse, FSchedule } from "../types";
import { DAY_KEYS, DAY_NAMES, effectiveCourseHours, ladderStartsForDays, sectionWeeklyHours, type DayKey } from "../utils/scheduleRegulations";
import { allowedMeetingLengths } from "../utils/specialNature";
import { AR, countOf } from "../utils/arabicCount";

/**
 * ── «موعد» لمقررٍ بطبيعةٍ خاصة: الأيام ومدةُ كل يومٍ، ثم أين العملي ──────────────────────
 * مقدمةٌ في الأسنان بأربع ساعات: الأحد ساعة، الثلاثاء ساعة، الخميس ساعتان. من يُدخل الموعد يختار الأيام ومدةَ كل يوم
 * (من مدد اللائحة وحدها)، ثم يُلزَم بتحديد اللقاء العملي ومكانه؛ والحفظُ كلُّه ضغطةٌ واحدة تكتب لقاءات الشعبة معاً.
 * لا حكمَ هنا: الأرقامُ للعرض، والخادمُ (POST /api/schedules/special-section) هو الحَكَم، ويُسأل جافّاً قبل الحفظ ليُقال التعارضُ مبكراً.
 */

export interface SpecialMeeting {
  fsunday: boolean; fmonday: boolean; ftuesday: boolean; fwednesday: boolean; fthursday: boolean;
  fstarttime: string; fendtime: string; practical: boolean;
  buildingId?: string; roomId?: string; AdRoomCode?: string; AdRoomHall?: string; locationStatus?: string;
  companionRoomId?: string; companionRoomLabel?: string;
}
export type SpecialCheck = { ok: true; notes: string[] } | { ok: false; error: string };

type Place = Partial<Pick<FSchedule, "AdRoomCode" | "AdRoomHall" | "buildingId" | "roomId" | "locationStatus" | "companionRoomId" | "companionRoomLabel">>;
/** دورٌ واحد (نظري أو عملي): بدايةٌ ومكانٌ واحدان (م.7/9: وقتُ البداية ثابتٌ داخل الدور)، ولقاءاتٌ بمدّةٍ لكل يوم. */
interface Role { key: "t" | "p"; practical: boolean; days: DayKey[]; longest: number }

const toMin = (value: string) => { const [h, m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const HOURS_WORD: Record<number, string> = { 1: "ساعة", 2: "ساعتان", 3: "3 ساعات", 4: "4 ساعات", 5: "5 ساعات" };
/** «110 دقيقة» لقاءٌ من فترتين تدريسيتين = ساعتان؛ وما لا يوافق سُلّم الخمسين+10 يُكتب بدقائقه (80). */
export const lengthLabel = (minutes: number) => {
  const periods = Math.round((minutes + 10) / 60);
  return periods * 60 - 10 === minutes && HOURS_WORD[periods] ? HOURS_WORD[periods] : countOf(minutes, AR.minute);
};
const flagsOf = (days: readonly DayKey[]) => Object.fromEntries(DAY_KEYS.map(day => [day, days.includes(day)])) as Pick<SpecialMeeting, DayKey>;
const hasRoom = (place: Place | undefined) => Boolean(place && ((place.buildingId && place.roomId) || place.locationStatus === "PENDING_ROOM"));

export default function SpecialSectionBuilder({ step = 3, course, scode, busy, onCheck, onSave, collegeId, sectionId, termId }: {
  key?: React.Key;
  /** رقمُ الخطوة في «موعد»؛ null خارجه (ورقة فتح الشعبة لطلب طالب). */
  step?: number | null;
  course: AdCourse;
  scode: string;
  busy: boolean;
  collegeId: number; sectionId: number; termId: number;
  onCheck: (meetings: SpecialMeeting[]) => Promise<SpecialCheck>;
  onSave: (meetings: SpecialMeeting[]) => Promise<void>;
}) {
  const hours = effectiveCourseHours(course);
  const [minutes, setMinutes] = useState<Partial<Record<DayKey, number>>>({});
  const [practicalDays, setPracticalDays] = useState<DayKey[]>([]);
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [places, setPlaces] = useState<Record<string, Place>>({});
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "ok" | "bad"; text: string; notes: string[] }>({ state: "idle", text: "", notes: [] });

  const chosen = DAY_KEYS.filter(day => Boolean(minutes[day]));
  const roles = useMemo<Role[]>(() => {
    const out: Role[] = [];
    for (const practical of [false, true]) {
      const days = chosen.filter(day => practicalDays.includes(day) === practical);
      if (days.length) out.push({ key: practical ? "p" : "t", practical, days, longest: Math.max(...days.map(day => Number(minutes[day]))) });
    }
    return out;
  }, [chosen.join("+"), practicalDays.join("+"), JSON.stringify(minutes)]);

  /** بدايةٌ مقترحة من سُلّم اللائحة: النظريُّ 8:00 والعمليُّ بعده بساعتين، ولا تُفرض. */
  const ladderOf = (role: Role) => ladderStartsForDays(role.days, 8 * 60, 20 * 60, role.longest);
  const startOf = (role: Role, index: number) => {
    const ladder = ladderOf(role);
    return starts[role.key] || (ladder.length ? ladder[Math.min(index * 2, ladder.length - 1)] : "08:00");
  };
  /** لقاءات الدور: الأيامُ بالمدّة نفسها صفٌّ واحد (أحد·ثلاثاء 50)، ومدةٌ أخرى صفٌّ آخر. */
  const meetings = useMemo<SpecialMeeting[]>(() => roles.flatMap((role, index) => {
    const start = startOf(role, index), place = places[role.key] || {};
    const byLength = new Map<number, DayKey[]>();
    role.days.forEach(day => byLength.set(Number(minutes[day]), [...(byLength.get(Number(minutes[day])) || []), day]));
    return [...byLength.entries()].sort((a, b) => DAY_KEYS.indexOf(a[1][0]) - DAY_KEYS.indexOf(b[1][0])).map(([length, days]) => ({
      ...flagsOf(days), fstarttime: start, fendtime: clock(Math.min(23 * 60 + 59, toMin(start) + length)), practical: role.practical,
      buildingId: place.buildingId, roomId: place.roomId, AdRoomCode: place.AdRoomCode || "", AdRoomHall: place.AdRoomHall || "", locationStatus: place.locationStatus,
      companionRoomId: place.companionRoomId || "", companionRoomLabel: place.companionRoomLabel || "",
    }));
  }), [roles, starts, places, JSON.stringify(minutes)]);

  const reading = useMemo(() => meetings.length && hours > 0 ? sectionWeeklyHours(meetings[0] as any, meetings.slice(1) as any, hours) : null, [meetings, hours]);
  const complete = Boolean(reading && !reading.under && !reading.over);
  const hasPractical = roles.some(role => role.practical);
  const needsCompanion = Boolean(String(course.CourseCompanionRoomType || "").trim());
  const roomsDone = roles.length > 0 && roles.every(role => hasRoom(places[role.key]) && (!needsCompanion || Boolean(places[role.key]?.companionRoomId)));
  const ready = complete && hasPractical && roomsDone;
  const taughtHours = reading ? Math.round(reading.total / 50 * 10) / 10 : 0;

  /* أولُ ما ينقص بالترتيب الذي يُملأ به: الأيام ← الساعات ← العملي ← الأماكن. */
  const missing = !chosen.length ? "اختر الأيام"
    : reading?.under ? `الساعات ${taughtHours} من ${hours}`
      : reading?.over ? `الساعات ${taughtHours} تزيد على ${hours}`
        : !hasPractical ? "حدّد اللقاء العملي"
          : !roomsDone ? "اختر القاعة لكل لقاء" : "";

  /* الفحصُ الجافّ: حين يكتمل الشكلُ يُسأل الخادم فيقول التعارضَ قبل الحفظ. آخرُ طلبٍ وحده يُقرأ. */
  const checker = useRef(onCheck); checker.current = onCheck;
  const sequence = useRef(0);
  const signature = JSON.stringify(meetings) + scode;
  useEffect(() => {
    const mine = ++sequence.current;
    if (!ready || !scode) { setCheck({ state: "idle", text: "", notes: [] }); return; }
    setCheck({ state: "checking", text: "", notes: [] });
    const timer = window.setTimeout(async () => {
      try {
        const result = await checker.current(meetings);
        if (mine !== sequence.current) return;
        setCheck(result.ok ? { state: "ok", text: "", notes: result.notes } : { state: "bad", text: result.error, notes: [] });
      } catch (issue: any) {
        if (mine === sequence.current) setCheck({ state: "bad", text: String(issue?.message || "تعذّر الفحص"), notes: [] });
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [signature, ready]);

  const toggleDay = (day: DayKey) => {
    if (minutes[day]) {
      setMinutes(current => { const next = { ...current }; delete next[day]; return next; });
      setPracticalDays(list => list.filter(item => item !== day));
    } else setMinutes(current => ({ ...current, [day]: allowedMeetingLengths(day)[0] || 50 }));
  };
  const togglePractical = (day: DayKey) => setPracticalDays(list => list.includes(day) ? list.filter(item => item !== day) : [...list, day]);
  const canSave = ready && !busy && check.state !== "bad" && check.state !== "checking";

  return (
    <section className="schedule-form-section appt-step is-time ssb-builder" aria-label="الأيام والوقت والمكان — مقرر بطبيعة خاصة" data-appt-step="time" data-special-nature="true">
      <header className="appt-step-head">
        {step != null ? <span className="appt-num">{step}</span> : null}
        <div className="appt-q">
          <strong>متى وأين؟ شعبةٌ نظريّها وعمليّها</strong>
          <small>اختر الأيام ومدة كل يوم، ثم حدّد اللقاء العملي ومكانه</small>
        </div>
      </header>
      <div className="ssb-chip-row"><span className="ssb-chip" title="الطبيعة الخاصة معلَّمة على المقرر في البيانات الأكاديمية"><FlaskConical aria-hidden="true" />مقرر نظري + عملي</span></div>

      <div className="ssb-days" role="group" aria-label="الأيام ومدة كل يوم">
        {DAY_KEYS.map((day, index) => {
          const on = Boolean(minutes[day]), isPractical = practicalDays.includes(day);
          return (
            <div key={day} className={`ssb-day${on ? " is-on" : ""}${on && isPractical ? " is-practical" : ""}`} data-day={day}>
              <button type="button" className="ssb-day-toggle" aria-pressed={on} onClick={() => toggleDay(day)}
                data-guide-ignore="يضيف هذا اليوم إلى الشعبة أو يزيله؛ لا يحفظ شيئاً">
                <b>{DAY_NAMES[index]}</b>
                <small>{on ? lengthLabel(Number(minutes[day])) : "اضغط للإضافة"}</small>
              </button>
              {on ? (
                <>
                  <select className="ssb-length" aria-label={`مدة لقاء ${DAY_NAMES[index]}`} value={Number(minutes[day])}
                    onChange={event => setMinutes(current => ({ ...current, [day]: Number(event.target.value) }))}>
                    {allowedMeetingLengths(day).map(length => <option key={length} value={length}>{lengthLabel(length)}</option>)}
                  </select>
                  <button type="button" className="ssb-lab-toggle" aria-pressed={isPractical} onClick={() => togglePractical(day)}
                    data-guide-ignore="يجعل لقاء هذا اليوم هو العملي من الشعبة؛ لا يحفظ شيئاً">
                    <FlaskConical aria-hidden="true" />{isPractical ? "عملي" : "نظري"}
                  </button>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className={`ssb-total${complete ? " is-complete" : reading?.over ? " is-over" : ""}`} role="status" aria-live="polite">
        <span className="ssb-total-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, hours > 0 ? taughtHours / hours * 100 : 0)}%` }} /></span>
        <span className="ssb-total-text">ساعات المقرر: <bdi dir="ltr">{taughtHours}/{hours}</bdi>{reading?.over ? " — تزيد على المعتمد" : ""}{complete ? <CheckCircle2 aria-hidden="true" /> : null}</span>
      </div>

      {complete && !hasPractical ? (
        <div className="ssb-ask" role="alert">
          <FlaskConical aria-hidden="true" />
          <div>
            <strong>أين اللقاء العملي؟</strong>
            <span>اكتملت الساعات؛ اختر اليوم أو الأيام العملية من هذه الشعبة:</span>
            <div className="ssb-ask-chips">
              {chosen.map(day => <button type="button" key={day} onClick={() => togglePractical(day)} data-guide-ignore="يجعل لقاء هذا اليوم هو العملي من الشعبة؛ لا يحفظ شيئاً">{DAY_NAMES[DAY_KEYS.indexOf(day)]} · {lengthLabel(Number(minutes[day]))}</button>)}
            </div>
          </div>
        </div>
      ) : null}

      {roles.map((role, index) => {
        const ladder = ladderOf(role), start = startOf(role, index);
        const dayText = role.days.map(day => `${DAY_NAMES[DAY_KEYS.indexOf(day)]} ${lengthLabel(Number(minutes[day]))}`).join(" · ");
        const name = role.practical ? "العملي" : "النظري";
        return (
          <div key={role.key} className={`ssb-group ${role.practical ? "is-practical" : "is-theory"}`} data-group={role.key}>
            <header>
              {role.practical ? <PracticalMark /> : <span className="ssb-theory-mark">نظري</span>}
              <strong>{dayText}</strong>
            </header>
            <label className="ssb-start">
              <span>بداية {name}</span>
              {ladder.length
                ? <select value={start} onChange={event => setStarts(current => ({ ...current, [role.key]: event.target.value }))} aria-label={`بداية اللقاءات ${name}ة`}>
                    {ladder.includes(start) ? null : <option value={start}>{start}</option>}
                    {ladder.map(time => <option key={time} value={time}>{time}</option>)}
                  </select>
                : <input type="time" value={start} onChange={event => setStarts(current => ({ ...current, [role.key]: event.target.value }))} aria-label={`بداية اللقاءات ${name}ة`} />}
            </label>
            <LocationPicker
              collegeId={collegeId} sectionId={sectionId} termId={termId} showDepartmentHistory={false}
              value={places[role.key] || {}}
              courseRoomType={String(course.CourseRoomType || "")}
              courseTeachingMode={role.practical ? "practical" : "theoretical"}
              seatsNeeded={Number(course.MaxStudent || 0)}
              onChange={patch => setPlaces(current => {
                const before = current[role.key] || {};
                /* المرفق المرافق يتبع المبنى: يُمحى إن تغيّر المبنى فعلاً (كما في النموذج المعتاد). */
                const moved = "buildingId" in patch && String(patch.buildingId || "") !== String(before.buildingId || "");
                return { ...current, [role.key]: { ...before, ...patch, ...(moved ? { companionRoomId: "", companionRoomLabel: "" } : {}) } };
              })}
            />
            {needsCompanion ? (
              <CompanionFacilityPicker
                course={course}
                form={{ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdCourseId: course.AdCourseId, ...(places[role.key] || {}), ...flagsOf(role.days),
                  fstarttime: start, fendtime: clock(Math.min(23 * 60 + 59, toMin(start) + role.longest)) }}
                onChange={patch => setPlaces(current => ({ ...current, [role.key]: { ...(current[role.key] || {}), ...patch } }))}
              />
            ) : null}
          </div>
        );
      })}

      <footer className="ssb-foot">
        <span className={`ssb-status is-${check.state === "bad" ? "bad" : ready && check.state === "ok" ? "ok" : "wait"}`} role="status" aria-live="polite">
          {check.state === "checking" ? <><Loader2 className="checks-spin" aria-hidden="true" />يفحص التعارضات…</>
            : check.state === "bad" ? <><AlertTriangle aria-hidden="true" />{check.text}</>
              : missing ? <>ناقص: {missing}</>
                : <><CheckCircle2 aria-hidden="true" />الشعبة {scode} جاهزة للحفظ{check.notes.length ? ` · ${countOf(check.notes.length, AR.note)} سيُسأل عنها` : ""}</>}
        </span>
        <button type="button" className="ssb-save" disabled={!canSave} onClick={() => void onSave(meetings)}
          data-guide-ignore="يحفظ لقاءات الشعبة كلها معاً: النظري والعملي ومكان كلٍّ منهما">
          {busy ? <Loader2 className="checks-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}احفظ الشعبة
        </button>
      </footer>
      {check.notes.length ? <ul className="ssb-notes">{check.notes.map(note => <li key={note}>{note}</li>)}</ul> : null}
    </section>
  );
}
