import React, { useEffect, useId, useRef, useState } from "react";
import { SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START_TIME } from "../utils/scheduleTime";

/**
 * ── حقلُ الوقت بأرقامٍ إنجليزية ──────────────────────────────────────────────
 *
 * `<input type="time">` يرسمه المتصفحُ بأرقام الجهاز وبـ«ص/م»: على هاتفٍ عربيٍّ
 * يُكتب الوقتُ بأرقامٍ هندية، وفي الصفحة نفسها أرقامُ الجدول إنجليزية. هذا حقلٌ
 * نصيٌّ بالقيمة نفسها «HH:MM» (وهي ما يحفظه النظام)، يقبل ما تكتبه اللوحةُ العربية
 * ويحوّله: 930 ← 09:30، ويرفض ما خارج الدوام.
 *
 * يسدّ مكان <input type="time"> بلا تغييرٍ في موضع الاستعمال: القيمةُ نصٌّ
 * «HH:MM»، وonChange يتلقى كائناً فيه target.value، ولا يُستدعى إلا والقيمةُ
 * كاملةٌ سليمة (أو فارغةٌ حين يمسحها صاحبُها).
 */
const LATIN = (value: string) => value
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .replace(/\D/g, "");

/**
 * ── «ساعةٌ تفهمك» (فكرة المراجعة 2026-11-14) ───────────────────────────────────────
 * الدوام يبدأ 08:00، فساعةٌ مختصرة بين 1 و7 («2»، «130»، «7») لا تُقصد صباحاً: تُقرأ عصراً
 * (14:00، 13:30، 19:00) متى وقعت في الدوام. يُطبَّق على الاختصار وحده — «0730» بأربع خانات
 * وبصفرٍ صريح تبقى كما كُتبت فتُرفض بسببها.
 */
export function afternoonClock(digits: string, min = SCHEDULE_DAY_START_TIME, max = SCHEDULE_DAY_END_TIME): string {
  if (!/^\d{4}$/.test(digits)) return "";
  const hour = Number(digits.slice(0, 2)), minute = Number(digits.slice(2));
  if (hour < 1 || hour > 7 || minute > 59) return "";
  const clock = `${String(hour + 12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return clock >= min && clock <= max ? clock : "";
}

export function normalizeClock(raw: string, min = SCHEDULE_DAY_START_TIME, max = SCHEDULE_DAY_END_TIME): string {
  let digits = LATIN(raw);
  if (digits.length === 3) digits = `0${digits}`;
  if (digits.length !== 4) return "";
  const hour = Number(digits.slice(0, 2)), minute = Number(digits.slice(2));
  if (hour > 23 || minute > 59) return "";
  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return clock < min || clock > max ? "" : clock;
}

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "min" | "max" | "step"> & {
  value: string;
  min?: string;
  max?: string;
  step?: number;
  onChange: (event: { target: { value: string } }) => void;
  onOutOfRange?: (limit: "min" | "max", attempted: string, boundary: string) => void;
  /** بداياتٌ معتمدة تُعرض قائمةً عند الكتابة (سُلّم اللائحة للأيام المختارة، م.7/8). */
  suggestions?: readonly string[];
};

export function TimeField({ value, onChange, onOutOfRange, min = SCHEDULE_DAY_START_TIME, max = SCHEDULE_DAY_END_TIME, step: _step, className, onBlur, suggestions, ...rest }: Props) {
  const listId = `time-ladder-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hasList = Boolean(suggestions && suggestions.length);
  const [text, setText] = useState(value || "");
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  /* آخرُ قيمةٍ أبلغ بها الحقلُ نفسُه: ما خالفها جاء من خارجه (إدخالٌ متتابع يُفرغ البداية، اقتراحٌ، عجلة)
     فيُعرض فوراً ولو كان المؤشر في الحقل. كان الحقل المركَّز يُبقي «09:00» القديمة بعد «الشعبة التالية جاهزة»
     فلا تُكتب الساعة الجديدة (المراجعة 2026-11-14، البند 1). */
  const emitted = useRef(value || "");
  useEffect(() => {
    if (!focused.current || (value || "") !== emitted.current) { setText(value || ""); setBad(false); }
    emitted.current = value || "";
  }, [value]);
  const emit = (next: string) => { emitted.current = next; onChange({ target: { value: next } }); };

  /* الصفرُ الذي أضافه الحقل نفسه («3» ← «03») ليس صفراً كتبه صاحبه: «330» اختصارٌ يُقرأ 15:30، و«0330» الصريحة لا. */
  const padded = useRef(false);
  const handle = (raw: string) => {
    let digits = LATIN(raw).slice(0, 4);
    if (digits.length <= 1) padded.current = false;
    if (digits.length === 1 && Number(digits) > 2) { digits = `0${digits}`; padded.current = true; }
    const shown = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    setText(shown);
    if (!digits) { setBad(false); emit(""); return; }
    if (digits.length < 4) { setBad(false); return; }
    const clock = normalizeClock(digits, min, max) || (padded.current ? afternoonClock(digits, min, max) : "");
    setBad(!clock);
    if (clock) { if (clock !== `${digits.slice(0, 2)}:${digits.slice(2)}`) setText(clock); emit(clock); }
    else {
      const attempted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
      const hour = Number(digits.slice(0, 2)), minute = Number(digits.slice(2));
      if (hour <= 23 && minute <= 59) {
        if (attempted < min) onOutOfRange?.("min", attempted, min);
        else if (attempted > max) onOutOfRange?.("max", attempted, max);
      }
    }
  };

  /* ما لم يكتمل أربعَ خانات يُحسب عند الخروج من الحقل: «14» ← 14:00، و«9» ← 09:00، و«930» ← 09:30.
     لا يُحسب أثناء الكتابة لأن «14» قد تكون أولَ «1430». كان يُهمل فيعود الحقل إلى قيمته القديمة بلا كلمة. */
  const settle = () => {
    const digits = LATIN(text);
    if (!digits || digits.length === 4) { setText(value || ""); setBad(false); return; }
    const full = digits.length <= 2 ? `${digits.padStart(2, "0")}00` : `0${digits}`;
    const clock = normalizeClock(full, min, max) || afternoonClock(full, min, max);
    if (clock) { setText(clock); setBad(false); if (clock !== value) emit(clock); return; }
    setText(value || ""); setBad(false);
    const hour = Number(full.slice(0, 2)), minute = Number(full.slice(2));
    const attempted = `${full.slice(0, 2)}:${full.slice(2)}`;
    if (hour <= 23 && minute <= 59) {
      if (attempted < min) onOutOfRange?.("min", attempted, min);
      else if (attempted > max) onOutOfRange?.("max", attempted, max);
    }
  };

  return (
    <>
    <input
      {...rest}
      list={hasList ? listId : rest.list}
      type="text"
      inputMode="numeric"
      dir="ltr"
      maxLength={5}
      autoComplete="off"
      placeholder={rest.placeholder || "--:--"}
      className={["time-field", className].filter(Boolean).join(" ")}
      value={text}
      aria-invalid={bad || rest["aria-invalid"] || undefined}
      onFocus={e => { focused.current = true; rest.onFocus?.(e); }}
      onBlur={e => { focused.current = false; settle(); onBlur?.(e); }}
      onChange={e => handle(e.target.value)}
    />
    {hasList ? <datalist id={listId}>{suggestions!.map(time => <option key={time} value={time} />)}</datalist> : null}
    </>
  );
}

export default TimeField;
