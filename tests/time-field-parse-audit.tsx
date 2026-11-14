/**
 * ── حقلُ الوقت: القراءةُ الصحيحة بلا ردٍّ صامت (تدقيق 2026-11-14، البند 1) ─────────────────
 * القاعدة الواحدة في src/utils/clockInput.ts: بلا فاصل (1–2 خانة = ساعة، 3 = H MM، 4 = HH MM)، وبفاصل ما قبله ساعة وما بعده
 * دقائق، وخانةُ دقائقٍ واحدة بعد الفاصل مرفوضةٌ برسالة («14:5» قد تعني 14:05 أو 14:50)، والساعات 1–7 بلا صفرٍ صريح عصراً.
 * الحقل: يُظهر خطأً مرئياً (لا يعود للقيمة القديمة)، وEnter يثبّت المكتوب قبل أن يقرأ النموذجُ حالتَه.
 */
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afternoonHour, clockErrorText, clockWithPeriod, latinClockText, parseTypedClock } from "../src/utils/clockInput";
import { TimeField, normalizeClock } from "../src/components/TimeField";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
};
const clock = (raw: string) => parseTypedClock(raw).clock;
const error = (raw: string) => parseTypedClock(raw).error;

/* ما كان صحيحاً يبقى */
check(clock("14") === "14:00" && clock("9") === "09:00" && clock("930") === "09:30" && clock("1430") === "14:30", "K1 «14»→14:00، «9»→09:00، «930»→09:30، «1430»");
check(clock("١٤") === "14:00" && clock("٩٣٠") === "09:30" && clock("٨:٣٠") === "08:30" && clock("۸:۳۰") === "08:30", "K2 الأرقام العربية والفارسية");
check(clock("8.30") === "08:30" && clock("8٫30") === "08:30" && clock("8:30") === "08:30", "K3 «8.30» والفاصلة العربية");

/* الأخطاء التي كشفها التدقيق: لا ساعةً غير التي كُتبت */
check(clock("145") === "13:45", "F1 «145» = 1:45 عصراً (13:45) لا 14:5");
check(clock("14:5") === "" && error("14:5") === "minute-digit", "F2 «14:5» غامضة: رسالةٌ لا 13:45", parseTypedClock("14:5"));
check(clock("12:3") === "" && error("12:3") === "minute-digit", "F3 «12:3» لا تصير 13:23");
check(clock("10:5") === "" && error("10:5") === "minute-digit", "F4 «10:5» لا تصير 13:05");
check(clock("14:05") === "14:05" && clock("14:50") === "14:50" && clock("12:30") === "12:30" && clock("10:50") === "10:50", "F5 دقيقتان بعد الفاصل كما كُتبتا");
check(error("8:5") === "minute-digit" && error("9:5") === "minute-digit" && error("95") === "invalid" && error("24") === "invalid" && error("25") === "invalid", "F6 «8:5» «9:5» «95» «24» «25» تُرفض بسببٍ (لا ردٌّ صامت)");
check(error("14:60") === "invalid" && error("24:00") === "invalid" && error("1:99") === "invalid", "F7 دقائق/ساعات خارج المدى");
check(error("abc") === "empty" && error("") === "empty" && error("1:2:3") === "format" && error("12345") === "format", "F8 ما ليس ساعة", [error("abc"), error("1:2:3"), error("12345")]);
check(clock("14:") === "14:00", "F9 «14:» = 14:00");

/* 1–7 عصراً بلا صفرٍ صريح، 8–12 كما كُتبت، 13–23 كما كُتبت */
check(["1", "2", "3", "4", "5", "6", "7"].map(clock).join() === "13:00,14:00,15:00,16:00,17:00,18:00,19:00", "A1 الساعات 1–7 عصراً");
check(["8", "9", "10", "11", "12"].map(clock).join() === "08:00,09:00,10:00,11:00,12:00", "A2 الساعات 8–12 كما كُتبت");
check(["13", "15", "19", "20", "23"].map(clock).join() === "13:00,15:00,19:00,20:00,23:00", "A3 الساعات 13–23 كما كُتبت");
check(clock("07:30") === "07:30" && clock("0730") === "07:30" && clock("0200") === "02:00", "A4 الصفرُ الصريح يبقى صباحاً كما كُتب");
check(clock("7:30") === "19:30" && clock("730") === "19:30" && clock("2:15") === "14:15", "A5 «7:30» و«730» عصراً");
check(afternoonHour(7) === 19 && afternoonHour(8) === 8 && afternoonHour(7, true) === 7 && afternoonHour(12) === 12, "A6 afternoonHour الواحدة");
check(clockWithPeriod(9, 0, "pm") === "21:00" && clockWithPeriod(12, 0, "am") === "00:00" && clockWithPeriod(12, 0, "pm") === "12:00" && clockWithPeriod(7, 0, "") === "19:00" && clockWithPeriod(8, 0, "") === "08:00", "A7 الفترة المنطوقة");
check(latinClockText("٨٫٣٠ ص") === "8:30", "A8 التطبيع");
check(clockErrorText("minute-digit").length > 0 && clockErrorText("min", "08:00").includes("08:00") && clockErrorText("max", "20:00").includes("20:00"), "A9 رسائل الخطأ بالعربية");
check(normalizeClock("1400") === "14:00" && normalizeClock("0730") === "", "A10 normalizeClock القديمة سليمة");

/* المكوّن */
const html = renderToStaticMarkup(<TimeField value="09:00" onChange={() => undefined} />);
check(/value="09:00"/.test(html) && /type="text"/.test(html) && !/role="alert"/.test(html), "C1 يرسم القيمةَ بلا رسالة خطأ ابتداءً", html);
const src = fs.readFileSync("src/components/TimeField.tsx", "utf8");
check(/parseTypedClock\(raw\)/.test(src) && /clockErrorText/.test(src), "C2 الحقل يقرأ بالقاعدة المشتركة");
check(/onKeyDown=\{[^}]*key === "Enter"[^}]*settle\(\)[^}]*preventDefault\(\)/.test(src.replace(/\n/g, " ")), "C3 Enter يثبّت المكتوب (settle) ويمنع الإرسال إن لم يصحّ");
check(/role="alert"/.test(src) && /aria-describedby/.test(src) && /setMessage\(clockErrorText/.test(src), "C4 رسالةٌ مرئية (role=alert) عند الخطأ");
check(!/setText\(value \|\| ""\); setBad\(false\);\s*\n\s*const hour/.test(src), "C5 لا ردَّ صامتاً إلى القيمة القديمة بعد خطأ");
const settleBody = src.slice(src.indexOf("const settle"), src.indexOf("return (", src.indexOf("const settle")));
check(/reject\(result\);\s*return false/.test(settleBody), "C6 settle يُعلن الخطأ ويُعيد false", settleBody.slice(0, 300));

console.log(`\ntime-field-parse audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
