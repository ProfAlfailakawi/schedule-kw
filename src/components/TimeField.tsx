import React, { useEffect, useId, useRef, useState } from "react";
import { clockErrorText, latinClockText, parseTypedClock, type ClockTypedError } from "../utils/clockInput";
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

  const [message, setMessage] = useState("");
  const clearBad = () => { setBad(false); setMessage(""); };
  const fail = (kind: ClockTypedError | "min" | "max", boundary = "") => { setBad(true); setMessage(clockErrorText(kind, boundary)); };

  /* يقرأ النصَّ المكتوب بقاعدة clockInput الواحدة، ثم يفحص نافذة الدوام. لا يكتب شيئاً. */
  const read = (raw: string): { clock: string; error: ClockTypedError | "min" | "max"; attempted: string } => {
    const typed = parseTypedClock(raw);
    if (typed.error) return { clock: "", error: typed.error, attempted: "" };
    if (typed.clock < min) return { clock: "", error: "min", attempted: typed.clock };
    if (typed.clock > max) return { clock: "", error: "max", attempted: typed.clock };
    return { clock: typed.clock, error: "", attempted: typed.clock };
  };

  /* يُعلن الخطأَ ويُبلغ المستدعي بالحدّ عند الخروج عن الدوام. */
  const reject = (result: { error: ClockTypedError | "min" | "max"; attempted: string }) => {
    fail(result.error, result.error === "min" ? min : result.error === "max" ? max : "");
    if (result.error === "min") onOutOfRange?.("min", result.attempted, min);
    else if (result.error === "max") onOutOfRange?.("max", result.attempted, max);
  };

  const handle = (raw: string) => {
    const typed = latinClockText(raw).slice(0, 5);
    setText(typed);
    if (!typed) { clearBad(); emit(""); return; }
    /* يُقرأ أثناء الكتابة ما اكتمل فقط: «HH:MM»، وأربعُ خانات، وثلاثٌ لا يكمّلها شيء («930»: 93 ليست ساعة). */
    const complete = /^\d{1,2}:\d{2}$/.test(typed) || /^\d{4}$/.test(typed) || (/^\d{3}$/.test(typed) && Number(typed.slice(0, 2)) > 23);
    if (!complete) { clearBad(); return; }
    const result = read(typed);
    if (result.clock) { clearBad(); if (result.clock !== typed) setText(result.clock); emit(result.clock); }
    else reject(result);
  };

  /* ما لم يكتمل يُحسب عند الخروج من الحقل أو عند Enter: «14» ← 14:00، و«9» ← 09:00، و«930» ← 09:30.
     لا يُحسب أثناء الكتابة لأن «14» قد تكون أولَ «1430». ما لا يصحّ يبقى مكتوباً مع رسالةٍ ظاهرة (لا يعود
     الحقل إلى قيمته القديمة بلا كلمة). يُعيد true إن كان الحقل سليماً (فارغاً أو مقروءاً). */
  const settle = (): boolean => {
    if (!LATIN(text)) { setText(value || ""); clearBad(); return true; }
    const result = read(text);
    if (result.clock) { setText(result.clock); clearBad(); if (result.clock !== value) emit(result.clock); return true; }
    reject(result);
    return false;
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
      aria-describedby={bad && message ? `${listId}-msg` : rest["aria-describedby"]}
      onBlur={e => { focused.current = false; settle(); onBlur?.(e); }}
      /* Enter يثبّت المكتوب قبل أن يقرأ النموذجُ حالتَه (النموذج <form onSubmit>): وإن لم يصحّ لا يُرسَل. */
      onKeyDown={e => { rest.onKeyDown?.(e); if (e.key === "Enter" && !e.defaultPrevented && !settle()) e.preventDefault(); }}
      onChange={e => handle(e.target.value)}
    />
    {bad && message ? <small id={`${listId}-msg`} className="time-field-msg" role="alert" style={{ display: "block", color: "var(--danger, #b42318)", fontSize: "11px", lineHeight: 1.4, marginTop: 2 }}>{message}</small> : null}
    {hasList ? <datalist id={listId}>{suggestions!.map(time => <option key={time} value={time} />)}</datalist> : null}
    </>
  );
}

export default TimeField;
