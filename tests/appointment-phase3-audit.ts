/**
 * إعادة تصميم محرّر الموعد، الجزء الثاني (W9): مؤشرات «تغيّر» في التعديل · انطواء الخطوة الحقيقي ·
 * شريط المدة من اللائحة · بطاقة المانع الكثيفة · أسبوع الأستاذ كسطح إدخال هادئ. ساكنٌ ووحدات خالصة، بلا متصفح.
 */
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lectureSegments, segmentsLabel, LECTURE_MINUTES, LECTURE_GAP_MINUTES } from "../src/utils/lectureSegments";
import { SHORT_DAY_GAP_MINUTES, SHORT_LECTURE_MINUTES } from "../src/utils/scheduleRegulations";
import ConflictTimeline from "../src/components/ConflictTimeline";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
};
const read = (f: string) => fs.readFileSync(f, "utf8");
const editor = read("src/components/Schedules.tsx"), mini = read("src/components/TeacherMiniWeek.tsx"), css = read("src/styles/70-appointment-redesign.css"), seg = read("src/utils/lectureSegments.ts");

/* A — مؤشرات التغيّر في وضع التعديل */
check(/studioWasMark\(studioTimeWas, "time"\)/.test(editor) && /studioWasMark\(studioRoomWas, "room"\)/.test(editor), "A1 عنوانا خطوتَي الوقت والمكان يحملان مؤشر «تغيّر»");
check(/كان: \$\{\[studioChanged\.days/.test(editor) && /aria-label=\{`تغيّر — \$\{was\}`\}/.test(editor) && /studioOriginal\.fstarttime && studioOriginal\.fendtime/.test(editor), "A2 «كان: …» من الصف المحفوظ نصاً مقروءاً بالقارئ");
check(/studioChanged\?\.course \? "المقرر — تغيّر"/.test(editor) && /studioChanged\?\.teacher \? "الأستاذ — تغيّر"/.test(editor), "A3 ملخّصا المقرر والأستاذ المتغيّران يُنطقان «تغيّر»");
check(/\.appt-was\{/.test(css) && /\.appt-was::before/.test(css), "A4 تنسيق النقطة النحاسية");

/* C — الانطواء الحقيقي */
check(/studioFold = \(key: string, expanded: boolean, done: boolean/.test(editor) && /inert=\{expanded \|\| !done\}/.test(editor) && /inert=\{!expanded\}/.test(editor), "C1 الملخّص والجسم كلاهما مُركَّب والمطويّ inert");
check(/studioFold\("course"/.test(editor) && /studioFold\("teacher"/.test(editor), "C2 المقرر والأستاذ يستعملان الانطواء");
check(/grid-template-rows:0fr/.test(css) && /grid-template-rows:1fr/.test(css) && /grid-template-rows \.4s ease,opacity \.4s ease/.test(css) && /visibility:hidden/.test(css), "C3 انزلاق 0fr↔1fr بمدة .4ث وإخفاء بعد الانتقال");
check(/prefers-reduced-motion:reduce\)\{\.appt-fold-sum,\.appt-fold-body,\.appt-fold-sum>\*,\.appt-fold-body>\*\{transition:none/.test(css), "C4 بلا حركة مع تقليل الحركة");
check(/aria-hidden=\{expanded \|\| !done\}/.test(editor) && /aria-expanded=\{studioScopeExpanded\}/.test(editor), "C5 الإخفاء عن قارئ الشاشة للمطويّ");

/* D — شريط المدة من اللائحة */
check(LECTURE_MINUTES === SHORT_LECTURE_MINUTES && LECTURE_GAP_MINUTES === SHORT_DAY_GAP_MINUTES && /from "\.\/scheduleRegulations"/.test(seg), "D1 المحاضرة والفاصل من scheduleRegulations لا رقمان مكرَّران");
check(segmentsLabel(lectureSegments(170)) === `${SHORT_LECTURE_MINUTES} + ${SHORT_DAY_GAP_MINUTES} + ${SHORT_LECTURE_MINUTES} + ${SHORT_DAY_GAP_MINUTES} + ${SHORT_LECTURE_MINUTES}`, "D2 170د على إيقاع اللائحة");
check(segmentsLabel(lectureSegments(190, { lecture: 60, gap: 5 })) === "60 + 5 + 60 + 5 + 60" && segmentsLabel(lectureSegments(110, { lecture: 40, gap: 15 })) === "110", "D3 لائحةٌ معدَّلة تغيّر المقاطع (ولا تطابق فمقطعٌ واحد)");
check(segmentsLabel(lectureSegments(290)) === "50 + 10 + 50 + 10 + 50 + 10 + 50 + 10 + 50" && lectureSegments(0).length === 0, "D4 كتلة الخمس ساعات (290) وحدّها الأعلى");

/* E — بطاقة المانع الكثيفة */
const card = { typeLabel: "تعارض أستاذ", overlapMinutes: 45, overlap: { start: 40, width: 30 }, lines: [{ label: "محاضرته", tone: "plain", start: 10, width: 60, range: "08:00 – 09:15" }, { label: "المقرر الحالي", tone: "current", start: 40, width: 40, range: "08:30 – 09:20" }] };
const html = renderToStaticMarkup(React.createElement(ConflictTimeline, { card, text: "تعارض أستاذ" }));
const count = (html.match(/<[a-z]+/g) || []).length;
check(count <= 4 && !/sr-only|<svg|<span|appt-tl-bar|appt-tl-hatch|role="group"/.test(html) && (html.match(/appt-tl-row/g) || []).length === 2 && /data-range="08:00 – 09:15"/.test(html) && /تداخل 45 د/.test(html), "E1 صفٌّ لمحاضرته وصفٌّ لموعدك والتداخل حبّةٌ في الرأس؛ البطاقة 4 عناصر لا أكثر (الرأس والحبّة والصفّان، والمسار والزمن رسمان زائفان)", { count, html });
check(/ChainSolveButton onOpen=\{\(\) => setChainOpen\(true\)\}/.test(editor) && /chainOffered\(editorVerdict\)/.test(editor) && /appt-inline-actions\$\{[^}]*" is-pair"/.test(editor), "E2 «حلّ بسلسلة» بجانب «بديل» في بطاقة المانع نفسها، في صفٍّ واحد من زرّين");
check(!/<X aria-hidden="true" className="appt-inline-mark" \/>\s*\n\s*<ConflictTimeline/.test(editor), "E3 بلا أيقونة × زائدة قبل البطاقة");

/* B — أسبوع الأستاذ */
check(/whyNotCell\(input/.test(mini) && /from "\.\.\/utils\/whyNot"/.test(mini) && /spotCrowds\(target, lectures\)/.test(mini), "B1 أسباب الخانة من القارئ الواحد whyNot (لا منطق مكرَّر)");
check(/is-tier-\$\{tier\}/.test(mini) && /WHY_META\[why\.dominant\]\.icon/.test(mini) && !/mini-week-target-time|mini-week-target-fit"/.test(mini), "B2 خانات أيقونية بلا نص، بثلاث طبقات لون وأيقونة سببٍ مهيمنة");
check(/data-best=\{isBest/.test(mini) && /data-usual=\{isUsual/.test(mini) && /data-link=\{isLinked/.test(mini) && /usual = null/.test(mini) && /\[data-best\]::before/.test(css) && /\[data-link\]::after/.test(css) && /\[data-usual\]\{background-image/.test(css), "B3 علامات هادئة بلا عناصر DOM: ★ أفضل وقت · نقطة المعتاد · رابط الالتصاق (رسومٌ زائفة)");
check(/className="mini-week-info"[^>]*aria-expanded=\{infoOpen\}/.test(mini) && /hidden=\{!infoOpen\}/.test(mini), "B4 المفتاح مطويٌّ خلف أيقونة معلومات واحدة");
check(/arrowNav/.test(mini) && /ArrowDown/.test(mini) && /aria-label=\{`ضع الموعد/.test(mini) && /reasonWords/.test(mini), "B5 الأسهم تنقل بين الخانات، والاسم المنطوق فيه كلمات السبب");
check(/mini-week-close/.test(mini) && /mini-week-stick is-before/.test(mini) && /mini-week-stick is-after/.test(mini) && /onClick=\{\(\) => pick\(target\)\}/.test(mini), "B6 كل ما سبق باقٍ: إغلاق · قبلها/بعدها · ضع الموعد بالمسار نفسه");
check(/usual=\{courseNature/.test(editor) && /onPick=\{pickFromMiniWeek\}/.test(editor), "B7 «المعتاد» يمرَّر من تاريخ المقرر ومسار الاختيار هو pickFromMiniWeek");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
