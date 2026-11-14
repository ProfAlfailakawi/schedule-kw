/**
 * ── «وضع الطيّار» في «رغبات الأساتذة» ─────────────────────────────────────────
 *
 *   P1 القائمة: البنودُ المنتظرة وحدها (لا «كما هو» ولا مخفيّ ولا مقرَّر)، الأقدمُ إرسالاً
 *      أولاً، وبنودُ الطلب الواحد بترتيبها، والطلبُ بلا تاريخٍ آخراً، ومرشّحُ الموقع يُحترم.
 *   P2 التنقّل: «التالي» يتخطّى ثم يعود في جولةٍ ثانية؛ ما قرّره زميلٌ يُتخطّى؛ «رجوع»
 *      للتخطّي وحده، ويُمحى بعد أيّ قرار؛ بندٌ تغيّرت هويّتُه لا يُقرَّر باسم غيره.
 *   P3 المفاتيح: F/Enter (لا على زر) ثبّت، B بديل، →/Space (لا على زر) التالي، Z رجوع،
 *      Escape يغلق الورقةَ أولاً ثم الوضع، ولا شيءَ في حقل كتابة ولا مع Ctrl/Meta/Alt،
 *      ويعمل الحرفُ واللوحةُ عربية (code).
 *   P4 الجاهزية مرآةُ صفّ الوارد: الممنوعُ ممنوع، والشقيقُ الذي يُفرغ الوقتَ يُرسل معه.
 *   P5 الشاشة: لا مسارَ ثانياً (decide نفسها، ورقةُ الرفض نفسها، لا fetch)، حوارٌ مشروط
 *      بحصر التركيز، مفاتيحُ مرئية، هاتفٌ بلمسٍ كبير، وحركةٌ تحترم التقليل؛ وتعديلُ
 *      الوارد صغير: استيرادٌ وعلَمٌ وزرٌّ وتركيب.
 */
import fs from "fs";
import path from "path";
import {
  buildPilotQueue, pilotAdvance, pilotCommand, pilotHandsOff, pilotJudge, pilotItemId, pilotLookup, pilotOpen,
  pilotSettledCount, pilotUndoSkip, startPilot, type PilotKey,
} from "../src/utils/inboxPilot";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const item = (extra: any = {}) => ({ action: "change", rowId: 1, itemId: "", ...extra });
const rows: any[] = [
  { id: "new", instructorName: "ب", submittedAt: "2026-11-10T08:00:00Z", AdCollegeId: 1, items: [item({ itemId: "n0", rowId: 10 })] },
  { id: "old", instructorName: "أ", submittedAt: "2026-11-01T08:00:00Z", AdCollegeId: 1, items: [
    item({ itemId: "o0", rowId: 20 }),
    item({ itemId: "o1", action: "keep", rowId: 21 }),
    item({ itemId: "o2", rowId: 22, decision: { state: "fixed" } }),
    item({ itemId: "o3", rowId: 23, hidden: true }),
    item({ itemId: "o4", action: "delete", rowId: 24 }),
  ] },
  { id: "undated", instructorName: "ج", AdCollegeId: 1, items: [item({ itemId: "u0", rowId: 30 })] },
  { id: "girls", instructorName: "د", submittedAt: "2026-10-01T08:00:00Z", AdCollegeId: 2, items: [item({ itemId: "g0", rowId: 40 })] },
];

/* P1 */
const all = buildPilotQueue(rows);
check(all.map(entry => entry.key).join(" ") === "girls:0 old:0 old:4 new:0 undated:0", "P1 الأقدمُ أولاً، وبنودُ الطلب بترتيبها، وبلا تاريخٍ آخراً");
check(!all.some(entry => ["old:1", "old:2", "old:3"].includes(entry.key)), "P1 لا «كما هو» ولا مقرَّر ولا مخفيّ");
const boys = buildPilotQueue(rows, (_item, row) => Number(row.AdCollegeId) === 1);
check(boys.length === 4 && !boys.some(entry => entry.requestId === "girls"), "P1 مرشّحُ الموقع يُحترم");
check(pilotItemId({ rowId: 7 } as any) === "row:7" && pilotItemId({ offeringRowIds: [3, 4] } as any) === "add:3,4" && pilotItemId({ itemId: "x" } as any) === "x", "P1 الهويّةُ كهويّة الوارد (requestItemId)");

/* P2 */
let live = rows.map(row => ({ ...row, items: [...row.items] }));
const open = (entry: any) => pilotOpen(live, entry);
let state = startPilot(boys, open);
check(state.at === 0 && state.order[0].key === "old:0", "P2 يبدأ بالأقدم");
state = pilotAdvance(state, "skipped", open);
check(state.order[state.at].key === "old:4" && state.lastSkip === 0, "P2 «التالي» يتخطّى ويحفظ موضعه للرجوع");
state = pilotUndoSkip(state, open);
check(state.at === 0 && state.lastSkip === null && !state.outcomes["old:0"], "P2 «رجوع» يعيد ما تُخطّي");
state = pilotAdvance(state, "skipped", open);
state = pilotAdvance(state, "fixed", open);
check(state.lastSkip === null, "P2 بعد القرار لا «رجوع» (المسارُ لا يعيد فتحَ ما قُرّر)");
check(pilotUndoSkip(state, open) === state, "P2 «رجوع» بلا تخطٍّ لا يفعل شيئاً");
/* زميلٌ قرّر «new:0» في الأثناء: يُتخطّى. */
live = live.map(row => row.id === "new" ? { ...row, items: [{ ...row.items[0], decision: { state: "rejected" } }] } : row);
check(state.order[state.at].key === "new:0" && !open(state.order[state.at]), "P2 البندُ الذي قرّره زميلٌ لم يعد مفتوحاً");
state = pilotAdvance(state, "skipped", open);
check(state.order[state.at].key === "undated:0", "P2 ويُتخطّى إلى ما بعده");
state = pilotAdvance(state, "rejected", open);
check(state.order[state.at].key === "old:0", "P2 جولةٌ ثانية على ما تُخطّي وما زال ينتظر");
state = pilotAdvance(state, "fixed", open);
check(state.at === -1, "P2 تنتهي القائمة حين لا يبقى ما ينتظر");
live = live.map(row => ({ ...row, items: row.items.map((entry: any) => ({ ...entry, decision: entry.decision || { state: "fixed" } })) }));
check(pilotSettledCount(state, open) === 4, "P2 شريطُ التقدّم يعدّ ما قُرّر هنا وفي مكانٍ آخر");
const reordered = [{ ...rows[1], items: [item({ itemId: "other", rowId: 99 })] }];
check(pilotLookup(reordered, all[1]) === null, "P2 بندٌ تغيّرت هويّتُه في موضعه لا يُعرض باسم غيره");

/* P3 */
const key = (over: Partial<PilotKey>): PilotKey => ({ key: "", target: "other", sheetOpen: false, ...over });
check(pilotCommand(key({ key: "f" })) === "fix" && pilotCommand(key({ key: "F" })) === "fix", "P3 F ثبّت");
check(pilotCommand(key({ key: "ب", code: "KeyF" })) === "fix", "P3 F واللوحةُ عربية");
check(pilotCommand(key({ key: "Enter" })) === "fix" && pilotCommand(key({ key: "Enter", target: "button" })) === null, "P3 Enter ثبّت إلا على زرٍّ آخر");
check(pilotCommand(key({ key: "b" })) === "alternative" && pilotCommand(key({ key: "لا", code: "KeyB" })) === "alternative", "P3 B بديل");
check(pilotCommand(key({ key: "ArrowRight" })) === "next" && pilotCommand(key({ key: " " })) === "next", "P3 → وSpace التالي");
check(pilotCommand(key({ key: " ", target: "button" })) === null, "P3 Space على زرٍّ للزرّ نفسه");
check(pilotCommand(key({ key: "z" })) === "undo", "P3 Z رجوع");
check(pilotCommand(key({ key: "Escape" })) === "exit" && pilotCommand(key({ key: "Escape", sheetOpen: true })) === "close-sheet", "P3 Escape يغلق الورقةَ أولاً ثم الوضع");
check(pilotCommand(key({ key: "f", sheetOpen: true })) === null && pilotCommand(key({ key: "f", target: "field" })) === null, "P3 لا أفعالَ والورقةُ مفتوحة أو في حقل كتابة");
check(pilotCommand(key({ key: "f", ctrlKey: true })) === null && pilotCommand(key({ key: "b", metaKey: true })) === null, "P3 لا أفعالَ مع Ctrl/Meta");

/* P4 */
const twin: any = { id: "t", submittedAt: "2026-11-01", items: [
  item({ rowId: 5, verdict: "clear", reasons: [] }),
  item({ action: "delete", rowId: 6 }),
] };
const sibling = pilotJudge(twin, 0, true, { loading: false, issues: [{ severity: "high", message: "تعارض أستاذ", otherId: 6 }] });
check(!sibling.blocked && sibling.after.join() === "1" && sibling.readiness === "review", "P4 التعارضُ مع شقيقٍ يُفرغ الوقت ليس مانعاً، ويُرسل معه");
const hard = pilotJudge(twin, 0, true, { loading: false, issues: [{ severity: "high", message: "القاعة مشغولة", otherId: 77 }] });
check(hard.blocked && hard.readiness === "blocked", "P4 تعارضٌ حيٌّ يمنع الحفظ يمنع التثبيت");
check(pilotJudge(twin, 0, false, { loading: false, issues: [] }).blocked, "P4 موعدٌ لم يعد في الجدول لا يُثبَّت");
check(pilotJudge(twin, 0, true, { loading: true, issues: null }).readiness === "checking", "P4 ينتظر الفحصَ الحيّ");
const judged: any = { id: "j", submittedAt: "2026-11-01", items: [item({ verdict: "conflict", reasons: [{ source: "regulation", text: "مخالفة المادة ٥", blocking: true }] })] };
const verdict = pilotJudge(judged, 0, true, { loading: false, issues: [] });
check(verdict.blocked && verdict.changedAfterSubmit && verdict.issues[0]?.text === "مخالفة المادة ٥", "P4 الحكمُ المحفوظ (لائحة/تعارض) يُقرأ ويمنع");
check(pilotHandsOff(item({ action: "add", rowId: undefined }) as any) && !pilotHandsOff(item({ action: "add", offeringRowIds: [1] }) as any), "P4 الإضافةُ تُسلَّم لبطاقتها السريعة");

/* P5 */
const pilot = read("src/components/inbox/InboxPilot.tsx");
const inbox = read("src/components/InstructorInbox.tsx");
const css = read("src/styles/57-inbox-pilot.css");
check(!/\bfetch\(|\/api\//.test(pilot), "P5 لا نداءَ خادمٍ في الوضع: كلُّ فعلٍ عبر دوالّ الوارد");
check(/onDecide\(row, entry\.index, "fixed"/.test(pilot) && /onDecide\(row, entry\.index, "rejected"/.test(pilot), "P5 «ثبّت» و«بديل» عبر decide نفسها");
check(/<RejectSheet item=\{item\}/.test(pilot), "P5 «بديل» ورقةُ الرفض نفسُها ببدائلها المحسوبة");
check(/rowErrors\[entry\.key\]/.test(pilot) && /if \(ok\) \{ setSheet\(false\)/.test(pilot), "P5 الخطأ يبقى على البطاقة، والورقةُ لا تُغلق قبل الحفظ");
check(!/reopen-fixed|cancel-scheduled/.test(pilot.replace(/\/\*[\s\S]*?\*\//g, "")), "P5 لا «تراجع» عن قرار (المسارُ لا يدعمه)");
check(/role="dialog"/.test(pilot) && /aria-modal="true"/.test(pilot) && /event\.key === "Tab"/.test(pilot), "P5 حوارٌ مشروط بحصر التركيز");
check(/<kbd[^>]*>F<\/kbd>/.test(pilot) && /<kbd[^>]*>B<\/kbd>/.test(pilot) && /inbox-pilot-keys/.test(pilot), "P5 المفاتيحُ مرئية على الأزرار وفي سطرها");
check(/role="progressbar"/.test(pilot) && /من \$\{num\(total\)\}/.test(pilot), "P5 «٧ من ٣٠» وشريطُ التقدّم");
check(/prefers-reduced-motion:reduce/.test(css) && /max-width:560px/.test(css) && /min-block-size:56px/.test(css), "P5 الهاتفُ بلمسٍ كبير والحركةُ تحترم التقليل");
check(!/#[0-9a-f]{3,6}\b(?![^{]*var\()/i.test(css.replace(/var\([^)]*\)/g, "").replace(/color-mix\([^)]*\)/g, "")), "P5 الألوانُ من رموز التصميم");
check(read("src/index.css").includes('@import "./styles/57-inbox-pilot.css";'), "P5 ورقةُ الأنماط مسجّلة");
check(/import InboxPilot, \{ InboxPilotLauncher \} from "\.\/inbox\/InboxPilot";/.test(inbox), "P5 الوارد: استيرادٌ واحد");
check((inbox.match(/const \[pilotOpen, setPilotOpen\] = useState\(false\);/g) || []).length === 1, "P5 الوارد: علَمٌ واحد");
check(/counts\.pending && !frozen[^\n]*\n\s*<InboxPilotLauncher count=\{counts\.pending\}/.test(inbox), "P5 الزرّ لمن يقرّر وحين ينتظر شيء");
check(/onDecide=\{decide\}/.test(inbox) && /candidateOf=\{proposedRow\}/.test(inbox) && /useLiveCheck=\{useLiveCheck\}/.test(inbox) && /RejectSheet=\{RejectSheet\}/.test(inbox), "P5 التركيبُ يمرّر دوالّ الوارد نفسها");
check(/data-guide-ignore="يفتح «وضع الطيّار»/.test(pilot) && /data-guide-target="requests\.action\.fix"/.test(pilot) && /data-guide-target="requests\.action\.reject"/.test(pilot), "P5 المرشد: أهدافُ «ثبّت/رفض» نفسها، والدخولُ موثّق");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
