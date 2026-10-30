/**
 * الصفحاتُ العامة (بطاقة الأستاذ، رابط الطلب، الاستبيانان، حالة الطالب) تُكتب
 * سكربتاتُها داخل قوالب نصّية في الخادم؛ علامةُ اقتباسٍ ناقصةٌ واحدة تُبقي
 * الصفحةَ على «يفتح…» إلى الأبد ولا يراها مترجمُ TypeScript. هنا تُقرأ كلُّ
 * دالّة صفحةٍ بمحلّل TypeScript نفسه، وتُبنى، ويُفحص كلُّ سكربتٍ فيها.
 */
import fs from "fs";
import vm from "vm";
import path from "path";
import ts from "typescript";
import { ARABIC_COUNT_SCRIPT } from "../src/utils/arabicCount";
import { NEGOTIATION_LABEL } from "../src/utils/instructorRequestThread";
import { PUBLIC_LIGHT_VARS, PUBLIC_THEME_COLOR } from "../src/server/publicTheme";
import { PROPOSAL_ALERT_CSS, PROPOSAL_ALERT_SCRIPT } from "../src/server/studyProposalAlert";
import { REQUEST_V3_CSS, REQUEST_V4_CSS } from "../src/server/requestPageStyles";
import { PATTERN_LIBRARY_CSS, PATTERN_LIBRARY_ICON, patternLibraryHtml } from "../src/utils/patternLibraryView";
import { patternLibraryInput } from "../src/utils/patternLibraryInput";
import { COURSE_COLOR_JS, STAFF_CARD_VISUAL_CSS, STAFF_CARD_VISUAL_JS } from "../src/server/staffCardVisual";
import { REQUEST_VISUAL_CSS, REQUEST_VISUAL_JS } from "../src/server/requestVisual";
import { COURSE_TAGS_CSS, COURSE_TAGS_JS } from "../src/utils/courseTags";
import { DEMO_COPY_SCRIPT, PUBLIC_FONT_FACES, PUBLIC_KIT_CSS, PUBLIC_KIT_SCRIPT } from "../src/server/publicKit";
import { REQUEST_REPLAY_SCRIPT } from "../src/server/requestReplayScript";
import { REQUEST_DAY_AUTOFILL_SCRIPT } from "../src/server/requestDayAutofillScript";
import { REQUEST_LENGTH_SCRIPT } from "../src/server/requestLengthScript";
import { VOICE_INPUT_CSS, VOICE_INPUT_JS, VOICE_INPUT_LIMIT } from "../src/server/voiceInputScript";
import { AR } from "../src/utils/arabicCount";
import { CALENDAR_LINKS_CLIENT_JS } from "../src/utils/calendarLinks";
import { TEACHER_CARD_EXTRAS_CSS, TEACHER_CARD_EXTRAS_JS } from "../src/server/teacherCardExtras";
import { PUSH_CARD_CSS, PUSH_CARD_JS, pushCardHead } from "../src/server/pushCard";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const file = path.join(process.cwd(), "server.ts");
const source = ts.createSourceFile(file, readServerSource(), ts.ScriptTarget.ES2022, true);

const PAGES = ["staffCardPage", "surveyPage", "studentCaseSurveyPage", "instructorRequestPage", "studentCaseStatusPage", "studentSchedulePage"];
const found = new Map<string, ts.FunctionDeclaration>();
source.forEachChild(node => {
  if (ts.isFunctionDeclaration(node) && node.name && PAGES.includes(node.name.text)) found.set(node.name.text, node);
});

for (const name of PAGES) {
  const node = found.get(name);
  if (!node) { check(false, `${name}: موجودة`); continue; }
  const js = ts.transpileModule(node.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const args = node.parameters.map(() => JSON.stringify("x")).join(",");
  const sandbox: any = { out: "", AR, ARABIC_COUNT_SCRIPT, NEGOTIATION_LABEL, PUBLIC_LIGHT_VARS, PUBLIC_THEME_COLOR, PROPOSAL_ALERT_CSS, PROPOSAL_ALERT_SCRIPT, COURSE_COLOR_JS, STAFF_CARD_VISUAL_CSS, STAFF_CARD_VISUAL_JS, REQUEST_VISUAL_CSS, REQUEST_VISUAL_JS, COURSE_TAGS_CSS, COURSE_TAGS_JS, REQUEST_V3_CSS, REQUEST_V4_CSS, PATTERN_LIBRARY_CSS, PATTERN_LIBRARY_ICON, patternLibraryHtml, patternLibraryInput, PUBLIC_FONT_FACES, PUBLIC_KIT_CSS, PUBLIC_KIT_SCRIPT, DEMO_COPY_SCRIPT, REQUEST_REPLAY_SCRIPT, REQUEST_DAY_AUTOFILL_SCRIPT, REQUEST_LENGTH_SCRIPT, VOICE_INPUT_CSS, VOICE_INPUT_JS, VOICE_INPUT_LIMIT, CALENDAR_LINKS_CLIENT_JS, TEACHER_CARD_EXTRAS_CSS, TEACHER_CARD_EXTRAS_JS, PUSH_CARD_CSS, PUSH_CARD_JS, pushCardHead };
  try {
    vm.runInNewContext(`${js}\nout = ${name}(${args});`, sandbox);
  } catch (error: any) {
    check(false, `${name}: تُبنى الصفحة — ${error?.message}`);
    continue;
  }
  const html = String(sandbox.out || "");
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script[^>]*>/gi)].map(m => m[1]).filter(code => code.trim());
  const errors: string[] = [];
  for (const code of scripts) {
    try { new vm.Script(code); } catch (error: any) { errors.push(String(error?.message)); }
  }
  check(scripts.length > 0 && !errors.length, `${name}: ${scripts.length} سكربت، كلُّها سليمة الصياغة${errors.length ? ` — ${errors[0]}` : ""}`);
}

console.log(`\nPublic pages syntax audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
