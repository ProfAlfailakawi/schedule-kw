/**
 * ── «البداية حسب اللائحة» بجانب حقل البداية (المالك 2026-11-14) ────────────────────
 *  L1  الاثنين 12:00 ← 12:30 (الأقرب)، و9:00 ← 9:30، و10:00 ← 9:30؛ والأحد 9:30 ← 9:00 (التعادل للأبكر).
 *  L2  البداية على السُّلّم، أو بلا بداية، أو أيام مختلطة، أو بلا أيام: لا شيء.
 *  L3  لا تُقترح بدايةٌ لا يتّسع بعدها اللقاء قبل نهاية اليوم.
 *  L4  ساكن: يظهر في نموذج الموعد والإضافة السريعة (والعجلة مطويّة) ومساحة المقترح، وضغطُه يمرّ بطريق
 *      الكتابة نفسه، ولا يمنع الحفظ (role="status"، لا disabled ولا required).
 */
import fs from "node:fs";
import { ladderSuggestionFor } from "../src/components/LadderStartHint";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name} ${detail}`); }
};
const eq = (name: string, got: unknown, want: unknown) => check(name, got === want, `got ${String(got)} want ${String(want)}`);

console.log("L1 الأقرب على السُّلّم");
eq("الاثنين 12:00 ← 12:30", ladderSuggestionFor(["fmonday", "fwednesday"], "12:00", 80), "12:30");
eq("الاثنين 09:00 ← 09:30", ladderSuggestionFor(["fmonday", "fwednesday"], "09:00", 80), "09:30");
eq("الاثنين 10:00 ← 09:30", ladderSuggestionFor(["fmonday", "fwednesday"], "10:00", 80), "09:30");
eq("الأحد 09:30 ← 09:00 (التعادل للأبكر)", ladderSuggestionFor(["fsunday", "ftuesday", "fthursday"], "09:30", 50), "09:00");

console.log("L2 لا تنبيه");
eq("على السُّلّم", ladderSuggestionFor(["fmonday", "fwednesday"], "12:30", 80), null);
eq("بلا بداية", ladderSuggestionFor(["fmonday"], "", 80), null);
eq("أيام مختلطة", ladderSuggestionFor(["fsunday", "fmonday"], "12:00", 50), null);
eq("بلا أيام", ladderSuggestionFor([], "12:00", 50), null);

console.log("L3 يتّسع قبل نهاية اليوم");
const late = ladderSuggestionFor(["fmonday", "fwednesday"], "23:50", 80);
check("لا بدايةَ بعدها لا يتّسع اللقاء", late === null || Number(late.split(":")[0]) * 60 + Number(late.split(":")[1]) + 80 <= 24 * 60, String(late));

console.log("L4 ساكن");
const hint = fs.readFileSync("src/components/LadderStartHint.tsx", "utf8");
check("تنبيهٌ لا يمنع", hint.includes('role="status"') && !/disabled|required/.test(hint));
const schedules = fs.readFileSync("src/components/Schedules.tsx", "utf8");
check("نموذج الموعد: الضغطُ يمرّ بطريق الكتابة نفسه", schedules.includes("onChange={(e) => applyFormStart(e.target.value)}") && /<LadderStartHint[^>]*onPick=\{applyFormStart\}/.test(schedules));
const quick = fs.readFileSync("src/components/QuickCreatePopover.tsx", "utf8");
const quickAt = quick.indexOf("<LadderStartHint");
check("الإضافة السريعة: خارج العجلة فيظهر وهي مطويّة", quickAt > 0 && quickAt < quick.indexOf("{timeOpen ? ("));
const proposal = fs.readFileSync("src/components/proposal/ProposalOpForm.tsx", "utf8");
check("مساحة المقترح", proposal.includes("<LadderStartHint"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
