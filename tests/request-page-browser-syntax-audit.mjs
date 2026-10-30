import fs from 'node:fs';
import vm from 'node:vm';
import { ARABIC_COUNT_SCRIPT } from '../src/utils/arabicCount.ts';
import { NEGOTIATION_LABEL } from '../src/utils/instructorRequestThread.ts';
import { PUBLIC_LIGHT_VARS, PUBLIC_THEME_COLOR } from '../src/server/publicTheme.ts';
import { PROPOSAL_ALERT_CSS, PROPOSAL_ALERT_SCRIPT } from '../src/server/studyProposalAlert.ts';
import { REQUEST_V3_CSS, REQUEST_V4_CSS } from '../src/server/requestPageStyles.ts';
import { DEMO_COPY_SCRIPT, PUBLIC_FONT_FACES, PUBLIC_KIT_CSS, PUBLIC_KIT_SCRIPT } from '../src/server/publicKit.ts';
import { PATTERN_LIBRARY_CSS, PATTERN_LIBRARY_ICON, patternLibraryHtml } from '../src/utils/patternLibraryView.ts';
import { REQUEST_REPLAY_SCRIPT } from '../src/server/requestReplayScript.ts';
import { REQUEST_DAY_AUTOFILL_SCRIPT } from '../src/server/requestDayAutofillScript.ts';
import { REQUEST_LENGTH_SCRIPT } from '../src/server/requestLengthScript.ts';
import { COURSE_COLOR_JS } from '../src/server/staffCardVisual.ts';
import { REQUEST_VISUAL_CSS, REQUEST_VISUAL_JS } from '../src/server/requestVisual.ts';
import { COURSE_TAGS_CSS, COURSE_TAGS_JS } from '../src/utils/courseTags.ts';
import { VOICE_INPUT_CSS, VOICE_INPUT_JS, VOICE_INPUT_LIMIT } from '../src/server/voiceInputScript.ts';
import { CALENDAR_LINKS_CLIENT_JS } from '../src/utils/calendarLinks.ts';
import { TEACHER_CARD_EXTRAS_CSS, TEACHER_CARD_EXTRAS_JS } from '../src/server/teacherCardExtras.ts';
import { PUSH_CARD_CSS, PUSH_CARD_JS, pushCardHead } from '../src/server/pushCard.ts';
import { readServerSource } from "./helpers/serverSource.mjs";

const server = readServerSource();
const start = server.indexOf('function instructorRequestPage');
const end = server.indexOf('app.post("/api/public/request/:token/check"', start);
if (start < 0 || end <= start) throw new Error('تعذر عزل صفحة طلب الأستاذ من المصدر');
let fn = server.slice(start, end);
fn = fn.replace(
  'function instructorRequestPage(token: string, nonce: string, demoHint = ""): string {',
  'function instructorRequestPage(token, nonce, demoHint = "") {'
);
const sandbox = { html: '', PATTERN_LIBRARY_CSS, PATTERN_LIBRARY_ICON, patternLibraryHtml, patternLibraryInput: () => ({ groups: [], shortMinutes: 50, longMinutes: 80, shortGap: 10, longGap: 15 }), DEMO_COPY_SCRIPT, REQUEST_DAY_AUTOFILL_SCRIPT, REQUEST_LENGTH_SCRIPT, ARABIC_COUNT_SCRIPT, NEGOTIATION_LABEL, PUBLIC_LIGHT_VARS, PUBLIC_THEME_COLOR, PROPOSAL_ALERT_CSS, PROPOSAL_ALERT_SCRIPT, REQUEST_V3_CSS, REQUEST_V4_CSS, PUBLIC_FONT_FACES, PUBLIC_KIT_CSS, PUBLIC_KIT_SCRIPT, REQUEST_REPLAY_SCRIPT, VOICE_INPUT_CSS, VOICE_INPUT_JS, VOICE_INPUT_LIMIT, COURSE_COLOR_JS, REQUEST_VISUAL_CSS, REQUEST_VISUAL_JS, COURSE_TAGS_CSS, COURSE_TAGS_JS, CALENDAR_LINKS_CLIENT_JS, TEACHER_CARD_EXTRAS_CSS, TEACHER_CARD_EXTRAS_JS, PUSH_CARD_CSS, PUSH_CARD_JS, pushCardHead };
vm.runInNewContext(`${fn}\nhtml=instructorRequestPage('browser-test-token','nonce123');`, sandbox, { timeout: 1000 });
const scripts = [...String(sandbox.html).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length !== 1) throw new Error(`توقعت سكربت متصفح واحداً في صفحة الأستاذ، ووجدت ${scripts.length}`);
new vm.Script(scripts[0], { filename: 'instructor-request-inline.js' });
console.log('✓ صفحة طلب الأستاذ المولدة تحمل JavaScript صالحاً للمتصفح');

/* اللغةُ لا تكشف اسماً غير معرَّف حتى يُستدعى: دالةٌ نُقلت إلى صفحة الطالب بالخطأ فصار
   «أرسل الطلب» في صفحة الأستاذ يرمي ReferenceError بصمت. فكلُّ مساعدٍ يستدعيه مسارُ
   الإرسال يجب أن يكون معرَّفاً داخل سكربت الصفحة نفسها. */
for (const name of ['courseTagsHtml', 'replacedWarn', 'requestedHtml', 'courseOf', 'actionName', 'postSubmit', 'focusItem', 'pathHtml', 'payloadItems', 'pendingList', 'planReplay', 'replayPrevious', 'loadPrevious', 'calendarHtml', 'verifyHtml', 'refresh', 'openLive', 'viNormalize', 'viJoin']) {
  if (!new RegExp(`function\\s+${name}\\s*\\(`).test(scripts[0])) throw new Error(`صفحة الأستاذ تستدعي ${name} ولا تعرّفها`);
}
console.log('✓ مساعدات مسار الإرسال معرَّفة داخل صفحة الأستاذ');
