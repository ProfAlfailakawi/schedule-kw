/**
 * ── قبل إرسال كرت الأستاذ: ورقةُ «لم نصل بعد» ──────────────────────────────────
 *
 *  P1  تظهر الورقة فقط حين يكون في النطاق مقررٌ مقفل، وفقط في الصفتين اللتين يختار فيهما
 *      الأستاذ (✏️ و🎓)؛ 👁️ للعرض فقط يُرسل بلا فحص.
 *  P2  القاعدة نفسها التي يرسم بها الكرت: ما أغلقه المسؤول (🔒/🌱) لا يُعدّ، والمجموعات بالصحيفة.
 *  P3  الرأس بقفلٍ وعددٍ بـcountOf: «23 مقرراً من الصحيفة الجديدة مقفلة — لم نصل بعد إلى مستواها».
 *  P4  «افتحه للطرح» يقلب الصفَّ 🔓 في مكانه (والتوأم معه) وينقص العدد.
 *  P5  «أرسل كما هو» يرسل الإرسال الأصلي؛ وفشلُ القراءة يرسل كما كان ويُسجَّل.
 *  P6  سريع: ما قرأته اللوحة قبل قليل يُستعمل بلا طلبٍ جديد، و«افتحه للطرح» يُلصق على الذاكرة.
 *  P8  فحصٌ تأخّر حتى أُغلقت النافذة أو تغيّر النطاق يُهمل: لا ورقةَ ولا إرسالَ لنطاقٍ سابق،
 *      و«أرسل كما هو» و«افتحه للطرح» لا يعملان إلا للنطاق الذي حُسبت له الورقة.
 *  P7  الأسلاك في النشر: زرّ الإنشاء ومرحلة التدريب يمرّان بالبوّابة، و«راجع المقررات» يفتح اللوحة على التبويب.
 */
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  choosesCourses, forgetOfferingMemory, gateGenerations, gatePublish, lockedForPublish, markOpened, offeringScopeKey, prepublishGroups, prepublishHeadline,
  readOffering, recentOffering, rememberOffering, rememberReach, shortReason, type OfferingSnapshot,
} from "../src/utils/prepublishReach";
import { PrepublishReachBody } from "../src/components/PrepublishReachSheet";
import { emptyOfferingDoc } from "../src/utils/courseOffering";
import type { CourseReach } from "../src/utils/courseReach";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

const verdict = (courseId: number, state: CourseReach["state"], reason = ""): CourseReach =>
  ({ courseId, state, why: state === "locked" ? "prereq-missing" : "offered-before", missing: [], level: 300, reachedLevel: 100, reason, chain: [] });

/* الجديدة: 1 (وصلنا) · 2 و3 (مقفلان، توأم) · 4 (مقفل لكن المسؤول أغلقه 🔒) · القديمة: 5 (مقفل) · 6 (وصلنا) */
const snapshot = (overrides: Partial<OfferingSnapshot> = {}): OfferingSnapshot => {
  const doc = emptyOfferingDoc(1, 1, 1);
  doc.courses = { "4": { courseId: 4, state: "closed" } as any };
  return {
    doc,
    reach: {
      known: true,
      courses: {
        1: verdict(1, "reached"),
        2: verdict(2, "locked", "لم نصل بعد إلى هذا المستوى — المتطلب 210 لم يُطرح"),
        3: verdict(3, "locked", "لم نصل بعد — توأمه 310 لم يُفتح"),
        4: verdict(4, "locked", "لم نصل بعد إلى هذا المستوى — المتطلب 220 لم يُطرح"),
        5: verdict(5, "locked", "لم نصل بعد إلى هذا المستوى — المتطلب 101 لم يُطرح"),
        6: verdict(6, "reached"),
      },
      sheets: [{ kind: "new", courseIds: [1, 2, 3, 4] }, { kind: "old", courseIds: [5, 6] }],
    },
    courses: [
      { id: 1, name: "مدخل", code: "0109101", sections: 2 },
      { id: 2, name: "التصوير", code: "0109310", sections: 0 },
      { id: 3, name: "مختبر التصوير", code: "0109311", sections: 0 },
      { id: 4, name: "الإخراج", code: "0109320", sections: 0 },
      { id: 5, name: "الإعلام الرقمي", code: "0109247", sections: 0 },
      { id: 6, name: "الكتابة", code: "0109102", sections: 1 },
    ],
    ...overrides,
  };
};

/* ── P1 + P5: البوّابة ── */
await (async () => {
  check(choosesCourses("edit") && choosesCourses("ta") && !choosesCourses("view"), "P1 الصفتان اللتان يختار فيهما الأستاذ: ✏️ و🎓 لا 👁️");

  const run = async (mode: "view" | "edit" | "ta", reader: () => Promise<OfferingSnapshot | null>) => {
    const log: string[] = []; let sent = 0, reads = 0, warned: unknown[] | null = null;
    const result = await gatePublish({ mode, read: async () => { reads++; return reader(); }, send: () => { sent++; }, warn: rows => { warned = rows; }, log: message => log.push(message) });
    return { result, sent, reads, warned: warned as unknown[] | null, log };
  };
  const view = await run("view", async () => snapshot());
  check(view.result === "sent" && view.sent === 1 && view.reads === 0 && !view.warned, "P1 👁️ للعرض فقط: يُرسل فوراً بلا فحصٍ ولا ورقة", view);
  const edit = await run("edit", async () => snapshot());
  check(edit.result === "warned" && edit.sent === 0 && edit.warned?.length === 3, "P1 ✏️ ومقررات مقفلة: الورقة تظهر ولا يُرسل شيء", edit);
  const ta = await run("ta", async () => snapshot());
  check(ta.result === "warned" && ta.sent === 0, "P1 🎓 مرحلة التدريب: الورقة نفسها", ta);
  const clean = await run("edit", async () => snapshot({ reach: { known: true, courses: { 1: verdict(1, "reached") }, sheets: [] } }));
  check(clean.result === "sent" && clean.sent === 1 && !clean.warned, "P1 لا مقفل: لا ورقة — يُرسل فوراً كما اليوم", clean);
  const unknown = await run("edit", async () => snapshot({ reach: null }));
  check(unknown.result === "sent" && unknown.sent === 1, "P1 لا حكم وصول (قسمٌ بلا صحيفة): يُرسل", unknown);
  const broken = await run("edit", async () => { throw new Error("offline"); });
  check(broken.result === "sent" && broken.sent === 1 && broken.log.length === 1 && !broken.warned, "P5 تعذّرت القراءة: يُرسل كما كان ويُسجَّل", broken);
  const empty = await run("ta", async () => null);
  check(empty.result === "sent" && empty.sent === 1, "P5 ردٌّ فارغ: يُرسل", empty);
})();

/* ── P8: فحصٌ متأخر لنطاقٍ سابق ── */
await (async () => {
  const generations = gateGenerations();
  let release: (value: OfferingSnapshot) => void = () => undefined;
  const slow = () => new Promise<OfferingSnapshot>(resolve => { release = resolve; });
  /* ضغطة إرسالٍ بقراءةٍ بطيئة، ثم أُغلقت النافذة (أو تغيّر القسم/الفصل) قبل أن تعود. */
  let sent = 0, warned = 0;
  const ticket = generations.begin();
  const pending = gatePublish({ mode: "edit", read: slow, isCurrent: () => generations.isCurrent(ticket), send: () => { sent++; }, warn: () => { warned++; } });
  generations.invalidate();
  release(snapshot());
  check(await pending === "stale" && sent === 0 && warned === 0, "P8 فحصٌ لنطاقٍ سابق: لا ورقةَ ولا إرسال", { sent, warned });
  /* وفحصٌ متأخرٌ بلا مقفلات لا يُرسل للنطاق السابق أيضاً. */
  const ticket2 = generations.begin();
  const pending2 = gatePublish({ mode: "ta", read: slow, isCurrent: () => generations.isCurrent(ticket2), send: () => { sent++; }, warn: () => { warned++; } });
  generations.begin();
  release(snapshot({ reach: null }));
  check(await pending2 === "stale" && sent === 0, "P8 فحصٌ أحدثُ منه يُبطله: لا إرسالَ مزدوج");
  const ticket3 = generations.begin();
  check(await gatePublish({ mode: "edit", read: async () => snapshot(), isCurrent: () => generations.isCurrent(ticket3), send: () => { sent++; }, warn: () => { warned++; } }) === "warned" && warned === 1, "P8 الفحصُ الحالي يعمل كما هو");

  const publish = read("src/components/SchedulePublish.tsx");
  check(/useEffect\(\(\) => \{\s*reachGenerations\.invalidate\(\);\s*setReachGate\(null\);/.test(publish) && publish.includes("}, [open, reachScope, kind, sendMode, reachGenerations]);"),
    "P8 الإغلاق وتغيّر النطاق/النوع/الصفة يُبطل الفحص ويُسقط الورقة");
  check(publish.includes("isCurrent: current,") && publish.includes("warn: rows => setReachGate({ rows, proceed, scope })"), "P8 الورقة تحمل نطاقها والفحص يُسأل عن جيله");
  check(publish.includes("if (gate && gate.scope === reachScope) void gate.proceed();"), "P8 «أرسل كما هو» لا يرسل إلا لنطاق الورقة");
  check(publish.includes("if (!reachGate || reachGate.scope !== reachScope) return null;") && publish.includes("collegeId: gateCollege, sectionId: gateSection, termId: gateTerm"), "P8 «افتحه للطرح» يكتب في نطاق الورقة وحده");
})();

/* ── P2: القاعدة نفسها والمجموعات ── */
{
  const rows = lockedForPublish(snapshot());
  check(rows.map(row => row.courseId).join() === "2,3,5", "P2 المقفل المختار فقط: ما أغلقه المسؤول (🔒) لا يُعدّ، وما وصلناه لا يُعدّ", rows);
  check(rows.find(row => row.courseId === 2)?.sheet === "new" && rows.find(row => row.courseId === 5)?.sheet === "old", "P2 كلُّ مقررٍ في مجموعة صحيفته");
  check(rows.find(row => row.courseId === 2)?.reason === "المتطلب 210 لم يُطرح" && shortReason("لم نصل بعد — توأمه 310 لم يُفتح") === "توأمه 310 لم يُفتح", "P2 سطرُ السبب بلا «لم نصل بعد» المكرّرة");
  check(prepublishGroups(rows).map(group => `${group.sheet}:${group.locked}`).join() === "new:2,old:1", "P2 المجموعات: الجديدة أولاً ثم القديمة");
  const single = lockedForPublish(snapshot({ reach: { ...snapshot().reach!, sheets: [{ kind: "only", courseIds: [1, 2, 3, 4, 5, 6] }] } }));
  check(single.every(row => row.sheet === "only") && prepublishGroups(single).length === 1, "P2 صحيفةٌ واحدة: مجموعةٌ واحدة بلا تبويب");
  const limitedFull = snapshot();
  limitedFull.doc!.courses = { "2": { courseId: 2, state: "limited", maxSections: 0 } as any };
  check(!lockedForPublish(limitedFull).some(row => row.courseId === 2), "P2 شعبٌ محدودة اكتملت: غير قابلٍ للاختيار أصلاً فلا يُعدّ");
}

/* ── P3: الرأس والعدد ── */
{
  const many = Array.from({ length: 23 }, (_, index) => ({ courseId: index + 1, code: String(100 + index), name: "م", sheet: "new" as const, reason: "", opened: false }));
  const head = prepublishHeadline(many);
  check(head.icon === "🔒" && head.text === "23 مقرراً من الصحيفة الجديدة مقفلة — لم نصل بعد إلى مستواها" && head.locked === 23, "P3 الرأس: قفلٌ و«23 مقرراً من الصحيفة الجديدة مقفلة»", head);
  check(prepublishHeadline(many.slice(0, 1)).text.startsWith("مقرر واحد من الصحيفة الجديدة مقفل"), "P3 المفرد: «مقرر واحد … مقفل»");
  check(prepublishHeadline(many.slice(0, 2)).text.startsWith("مقرران من الصحيفة الجديدة مقفلان"), "P3 المثنى: «مقرران … مقفلان»");
  const mixed = prepublishHeadline(lockedForPublish(snapshot()));
  check(mixed.text === "3 مقررات مقفلة — لم نصل بعد إلى مستواها", "P3 الصحيفتان معاً: عددٌ واحد في الرأس والتفصيل في المجموعات", mixed);
  const page = read("src/utils/prepublishReach.ts");
  check(page.includes("countOf(left.length, AR.course)"), "P3 العدد بـcountOf/AR");
}

/* ── P4: «افتحه للطرح» يقلب الصف في مكانه ── */
{
  const rows = lockedForPublish(snapshot());
  const after = snapshot().reach!;
  after.courses[2] = { ...after.courses[2], state: "reached", why: "override", overridden: true };
  after.courses[3] = { ...after.courses[3], state: "reached", why: "prereqs-met" };
  const flipped = markOpened(rows, after);
  check(flipped.map(row => `${row.courseId}:${row.opened ? "🔓" : "🔒"}`).join() === "2:🔓,3:🔓,5:🔒", "P4 الصفُّ 🔓 في مكانه، والتوأم معه، والترتيب نفسه", flipped);
  check(prepublishHeadline(flipped).locked === 1 && prepublishGroups(flipped)[0].locked === 0, "P4 العدد ينقص في الرأس والمجموعة");
  check(prepublishHeadline(markOpened(flipped, { ...after, courses: { ...after.courses, 5: { ...after.courses[5], state: "reached" } } })).icon === "🔓", "P4 كلها فُتحت: 🔓 في الرأس");
  check(markOpened(flipped, null).every((row, index) => row.opened === flipped[index].opened), "P4 حكمٌ غائب لا يقلب شيئاً");

  const html = renderToStaticMarkup(<PrepublishReachBody rows={flipped} onOpen={() => undefined} onSend={() => undefined} onReview={() => undefined} />);
  check(html.includes('data-course="2" data-opened="1"') && html.includes("مفتوح"), "P4 الرسم: الصفُّ المفتوح 🔓 بوسم «مفتوح»");
  check((html.match(/افتحه للطرح/g) || []).length === 1, "P4 الرسم: «افتحه للطرح» على ما بقي مقفلاً وحده");
  check(html.includes("الصحيفة الجديدة") && html.includes("الصحيفة القديمة") && html.includes('data-ppr-count="1"'), "P4 الرسم: مجموعتا الصحيفة والعدد الباقي");
  const fresh = renderToStaticMarkup(<PrepublishReachBody rows={rows} onOpen={() => undefined} onSend={() => undefined} onReview={() => undefined} />);
  check(fresh.includes("أرسل كما هو") && fresh.includes("راجع المقررات") && fresh.includes("<bdi class=\"ppr-code\">0109310</bdi>"), "P4 الرسم: الإجراءان والرمز", fresh.slice(0, 400));
  check(renderToStaticMarkup(<PrepublishReachBody rows={markOpened(flipped, { ...after, courses: { ...after.courses, 5: { ...after.courses[5], state: "reached" } } })} onOpen={() => undefined} onSend={() => undefined} onReview={() => undefined} />).includes(">أرسل<"), "P4 لا مقفل باقٍ: «أرسل»");
  const sheet = read("src/components/PrepublishReachSheet.tsx");
  check(sheet.includes("setRows(current => markOpened(current, reach))") && sheet.includes("onOpenCourse(courseId)"), "P4 الورقة تحدّث قائمتها من ردّ الخادم");
}

/* ── P6: الذاكرة القصيرة ── */
await (async () => {
  forgetOfferingMemory();
  const key = offeringScopeKey(1, 1, 1);
  let calls = 0;
  const fake = (async () => { calls++; return { ok: true, status: 200, json: async () => snapshot() }; }) as unknown as typeof fetch;
  await readOffering(1, 1, 1, fake);
  await readOffering(1, 1, 1, fake);
  check(calls === 1, "P6 القراءة الثانية من الذاكرة بلا طلب", calls);
  rememberOffering(key, snapshot(), Date.now() - 31_000);
  check(recentOffering(key) === null, "P6 الذاكرة قصيرة (30 ث)");
  rememberOffering(key, snapshot());
  const opened = { ...snapshot().reach!, courses: { ...snapshot().reach!.courses, 2: verdict(2, "reached") } };
  rememberReach(key, opened);
  check(recentOffering(key)?.reach === opened, "P6 «افتحه للطرح» يُلصق على الذاكرة فلا تعود الورقة به مقفلاً");
  const failing = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
  forgetOfferingMemory();
  check(await readOffering(1, 1, 1, failing).then(() => false, () => true), "P6 فشل الخادم يرمي (فتُرسل البوّابة كما كان)");
  const panel = read("src/components/CourseOfferingPanel.tsx");
  check(panel.includes("rememberOffering(scopeKey") && panel.includes("rememberReach(scopeKey, reach)") && panel.includes("onOfferingChange("), "P6 اللوحة تكتب ما قرأته في الذاكرة وتسمع «افتحه للطرح» من الورقة");
})();

/* ── P7: الأسلاك في النشر ── */
{
  const publish = read("src/components/SchedulePublish.tsx");
  const ta = read("src/components/TAPhasePanel.tsx");
  check(publish.includes("onClick={() => void guardSend(create)}") || publish.includes("onClick={() => void guardSend(picking ? sendPicked : create)}"), "P7 «إنشاء الرابط» (والإرسالُ لأساتذة محددين) يمرّ بالبوّابة");
  check(publish.includes("confirmSend={proceed => void guardSend(proceed)}") && ta.includes("confirmSend ? confirmSend(open) : void open()"), "P7 «فتح مرحلة التدريب» يمرّ بالبوّابة");
  check(/if \(kind !== "staff"\) \{ await proceed\(\); return; \}/.test(publish), "P7 جدول القسم والاستبيان لا يُفحصان");
  check(publish.includes("mode: sendMode") && publish.includes("read: () => readOffering(collegeId, sectionId, termId)"), "P7 الفحص بصفة الإرسال ونطاق النشر نفسه");
  check(publish.includes("onSend={sendFromGate}") && publish.includes("const gate = reachGate;\n    setReachGate(null);"), "P7 «أرسل كما هو» يرسل الإرسال الأصلي نفسه");
  check(publish.includes("setOfferingOpen(true)") && publish.includes("setOfferingFocus({ tab, nonce: Date.now() })") && publish.includes("focusTab={offeringFocus}"), "P7 «راجع المقررات» يفتح لوحة حالة الطرح على التبويب");
  check(read("src/components/CourseOfferingPanel.tsx").includes("if (focusTab) setTab(focusTab.tab)"), "P7 اللوحة تنتقل إلى التبويب المطلوب");
}

console.log(`\n${passed} ✓ · ${failed} ✗`);
if (failed) process.exit(1);
