/**
 * ── «وارد الأساتذة» بلغة «موعد جديد» (المالك 2026-10-30) ──────────────────────
 *
 *   S1 المطابقة: الفعلُ يتبع عددَ الأساتذة — «أستاذ واحد لم يفتح الرابط»، «أستاذان
 *      لم يفتحا»، «٣ أساتذة لم يفتحوا»؛ ومثلُها «فتح ولم يُجب» و«طلب تغييراً» و«قال».
 *   S2 الوقتُ والقاعة سطران: القاعةُ لا تلتصق بالوقت («901A01/10108:00 – 09:15»).
 *   S3 الوقتُ يوماً يوماً: أيامٌ تختلف نهاياتُها تُعرض كلٌّ بوقته، لا نهايةُ اليوم الأول للجميع.
 *   S4 «ثبّت الجاهز كله»: الجاهزُ وحده (تعديلٌ مرّ بالفحص الحيّ بلا موانع)، بمسار «ثبّت»
 *      نفسه (`decide`)، واحداً بعد واحد، يتوقّف عند أول تعذّر، بعد تأكيدٍ صريحٍ بالأسماء،
 *      وبلا مسارٍ جديدٍ في الخادم.
 *   S5 الهاتف: رأسٌ مختصر — المسطرةُ الزخرفية تغيب، وخريطةُ التكدّس تنطوي خلف زرّ.
 *   S6 ما يصل الأستاذ لا يذكر قاعةً ولا مبنى: النصُّ الإرشاديّ بلا قاعة، وتنبيهٌ هادئ.
 */
import fs from "fs";
import path from "path";
import { AR, countOf, nounFor } from "../src/utils/arabicCount";
import { groupsLabel, mentionsPlace, slotGroups } from "../src/components/InstructorInbox";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const inbox = read("src/components/InstructorInbox.tsx");
const css = read("src/styles/35-inbox-studio.css");
const polish = read("src/styles/35-visual-polish.css");
const index = read("src/index.css");

/* ── S1 ─────────────────────────────────────────────────────────────────── */
const silentLine = (n: number) => `${countOf(n, AR.instructor)} ${nounFor(n, AR.openedLinkVerb)} الرابط بعد`;
check(silentLine(1) === "أستاذ واحد لم يفتح الرابط بعد" && silentLine(2) === "أستاذان لم يفتحا الرابط بعد"
  && silentLine(3) === "3 أساتذة لم يفتحوا الرابط بعد" && silentLine(11) === "11 أستاذاً لم يفتحوا الرابط بعد",
  "S1 «أستاذ واحد لم يفتح» · «أستاذان لم يفتحا» · «3 أساتذة لم يفتحوا»");
check(nounFor(1, AR.openedQuietVerb) === "فتح ولم يُجب" && nounFor(2, AR.askedChangeVerb) === "طلبا تغييراً"
  && nounFor(5, AR.saidVerb) === "قالوا" && nounFor(1, AR.saidVerb) === "قال",
  "S1 «فتح ولم يُجب»، «طلبا تغييراً»، «قال/قالوا» بعددها");
check(inbox.includes("{countOf(silent.length, AR.instructor)} {nounFor(silent.length, AR.openedLinkVerb)} الرابط بعد")
  && inbox.includes("{nounFor(unchanged.length, AR.saidVerb)} «الجدول كما هو»")
  && !/لم يفتحوا الرابط|<span>فتحوا ولم يجيبوا<\/span>|<span>لم يفتحوا<\/span>|<span>طلبوا تغييراً<\/span>/.test(inbox),
  "S1 الوارد يمرّر أفعالَ العدد كلَّها بـ nounFor، ولا يبقى جمعٌ مكتوبٌ بيد");
check(!/count === 1 \? "موعد" : "مواعيد"/.test(inbox) && inbox.includes("countOf(count, AR.appointment)"),
  "S1 تلميحُ خليّة التكدّس بـ countOf لا بثنائيّة «موعد/مواعيد»");

/* ── S2 ─────────────────────────────────────────────────────────────────── */
check(!polish.includes(".request-table td small.request-room") && !inbox.includes("<table className=\"request-table\">"),
  "S2 لا قاعدةَ تجعل القاعةَ inline-flex بعد الوقت مباشرةً، ولا جدولَ قديم");
check(/className="request-slot is-before"[\s\S]{0,700}className="request-slot-time"[\s\S]{0,200}<small className="request-room"><DoorOpen/.test(inbox),
  "S2 «كان»: الوقتُ سطرٌ والقاعةُ سطرٌ بعده بأيقونتها");
check(/\.inbox-studio \.request-slot\{display:grid/.test(css) && /\.inbox-studio \.request-slot \.request-room\{display:flex/.test(css),
  "S2 البطاقةُ شبكةٌ أسطراً، والقاعةُ سطرٌ مستقلّ على كل الشاشات");

/* ── S3 ─────────────────────────────────────────────────────────────────── */
const mixed = slotGroups([
  { day: "fthursday", start: "11:00", end: "11:50" },
  { day: "fsunday", start: "11:00", end: "12:15" },
  { day: "ftuesday", start: "11:00", end: "12:15" },
]);
check(mixed.length === 2 && groupsLabel(mixed) === "ح·ث 11:00 – 12:15 · خ 11:00 – 11:50",
  `S3 أوقاتٌ تختلف بين الأيام تُعرض فرقاً: ${groupsLabel(mixed)}`);
check(slotGroups([{ day: "fmonday", start: "09:30", end: "10:45" }, { day: "fwednesday", start: "09:30", end: "10:45" }]).length === 1,
  "S3 والوقتُ الواحد يبقى سطراً واحداً");
check(/perDay \? <SlotTimes groups=\{afterGroups\} \/>/.test(inbox), "S3 «المطلوب» يعرض الفرقَ حين تختلف الأوقات");

/* ── S4 ─────────────────────────────────────────────────────────────────── */
check(/const bulkFit = !decided && !frozenScreen && item\.action === "change" && candidate !== null\s+&& !changedAfterSubmit && !dependsOn\.length && negotiation !== "proposed";/.test(inbox)
  && inbox.includes('ready: readiness === "ready" && !live.loading'),
  "S4 الجاهزُ للجملة: تعديلٌ غيرُ محسوم، مرّ بالفحص الحيّ، بلا موانع، لم يتغيّر بعد الإرسال، ولا ينتظر قسماً ولا بنداً ولا ردّاً");
check(inbox.includes('const ok = await now.decide(row, entry.index, "fixed", { after: [] });'),
  "S4 كلُّ بندٍ يُثبَّت بـ decide نفسها — زرّ «ثبّت» بمعاينته وخادمه");
const routes = [...new Set([...inbox.matchAll(/`\/api\/instructor-requests\/\$\{row\.id\}\/([a-z-]+)`/g)].map(match => match[1]))].sort();
check(routes.join(",") === "apply,decide,reply", `S4 لا مسارَ جديداً في الخادم (${routes.join("، ")})`);
check(/for \(const entry of list\) \{[\s\S]*?if \(!ok\) \{ stopAt\(entry\.key,[\s\S]*?return; \}/.test(inbox),
  "S4 واحداً بعد واحد، ويتوقّف عند أول تعذّر ويقول سببه");
check(/className="inbox-bulk-sheet" role="dialog" aria-modal="true"/.test(inbox) && inbox.includes('phase: "confirm"')
  && inbox.includes("<b>{entry.teacher}</b><span>{entry.course}</span>") && inbox.includes("يثبّت {num(Math.min(total, doneCount + 1))} من {num(total)}…"),
  "S4 خطوةُ تأكيدٍ بالعدد والأسماء (الأستاذ والمقرّر) في حوارٍ معلَن، وتقدّمٌ «يثبّت ٣ من ٧…»");
check(/\{bulkReady\.length && !frozen && stateFilter !== "absent"/.test(inbox) && inbox.includes("ثبّت الجاهز كله ({num(bulkReady.length)})"),
  "S4 الزرّ «ثبّت الجاهز كله (N)» لا يظهر بلا جاهز ولا في فصلٍ سابق");

/* ── S5 ─────────────────────────────────────────────────────────────────── */
const phone = css.slice(css.indexOf("@media (max-width:760px){"));
check(index.includes('@import "./styles/35-inbox-studio.css";'), "S5 الورقةُ مستوردة");
check(phone.includes(".inbox-studio>.page-heading::after{display:none}") && phone.includes(".inbox-studio>.page-heading h1{font-size:24px"),
  "S5 الهاتف: المسطرةُ الزخرفية تغيب، والعنوانُ أصغر");
check(phone.includes(".inbox-studio .glance-heat:not([data-open])>.glance-heat-body{display:none}") && /\.inbox-studio \.glance-heat-toggle\{display:none\}/.test(css)
  && inbox.includes('aria-controls="inbox-heat-body"'),
  "S5 خريطةُ التكدّس تنطوي خلف زرٍّ على الهاتف وحده، ومفتوحةٌ على الحاسوب");

/* ── S6 ─────────────────────────────────────────────────────────────────── */
check(mentionsPlace("القاعة 901A01/L01 محجوزة لمختبر") && mentionsPlace("المبنى ٧ مغلق") && mentionsPlace("S01 مشغولة"),
  "S6 رمزُ القاعة أو المبنى يُلتقط");
check(!mentionsPlace("الوقت 14:00/15:00 يتقاطع مع مقرّر آخر") && !mentionsPlace("لا تتوفّر قاعة مناسبة") && !mentionsPlace("مقرر 1234567"),
  "S6 والوقتُ ورمزُ المقرّر وذكرُ «قاعة» بلا رمز لا تُنبّه");
check(!/placeholder="[^"]*(?:القاعة|المبنى|\d[A-Za-z]\d)/.test(inbox) && (inbox.match(/<PlaceWarning text=\{/g) || []).length === 2,
  "S6 النصُّ الإرشاديّ بلا قاعة، والتنبيهُ تحت سطر الرفض وردّ الحوار");

console.log(`\nInbox studio audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
