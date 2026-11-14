/**
 * ── كرت الأستاذ: الجولة الخامسة (الإصلاحات المتّفق عليها وأفكار المالك) ─────────────────────
 *
 *   ١  مسودةٌ قديمة لا تعود بعد الإرسال: تُنقل من تبويبٍ إلى آخر، وما قبل آخر إرسالٍ يُمحى، والإرسالُ يمحو الكلّ.
 *   ٢  «الحركة» بلا رمزٍ إنجليزي: كلُّ نوعِ حدثٍ يكتبه الكود له اسمٌ عربي، ولا تفصيلٌ آليّ («id|1»).
 *   ٣  المهلة بتقويم الكويت: اليومُ الأخير «يُغلق اليوم»، واستثناءُ الأستاذ الفرديّ هو موعدُه.
 *   ٤  «وصل ردّ من القسم» لما يغيّره القسمُ وحده، و«حدّث مع الإبقاء على تعديلي» يعيد المسودةَ فوق الجديد.
 *   ٥  dirty مشتقّ: «إلغاء التعديل» لا يترك «مغادرة الموقع؟».
 *   ٦  خطأُ كتابة الرقم المدني لا يأكل محاولة توقيع، و403 لبابٍ مغلق لا يعيد طلبَ الرقم.
 *   ٧  سقفٌ لحجوز التحرير، والأقدمُ يُفرج أولاً، وحدُّ معدّلٍ لإنشائها.
 *   ٨  لا «مانع/موانع» في نصٍّ يراه الأستاذ.
 *   ٩  لا قاعةَ ولا مبنى في الكرت.
 *   ١٠ المخالفاتُ صفٌّ لكل مقرّر بأيقونةٍ وعبارةٍ قصيرة.
 *   ١١ «مقترحة لك» تظهر كلما اختيرت الأيام.
 *   ١٢ إنفوجرافيك التخطيط من «تخطيط الشعب» وحده.
 *   وصغائر: «لاصق بمحاضرتي» بالعربية مع إعادة، الفحصُ المتعذّر محايدٌ بزرّ، أولُ فتحٍ يُعاد، البثُّ العائد يقرأ مرّة.
 */
import vm from "node:vm";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { TEACHER_CARD_LOGIC_JS, TEACHER_CARD_R5_CSS } from "../src/server/teacherCardLogic";
import { TEACHER_CARD_EXTRAS_JS } from "../src/server/teacherCardExtras";
import { PUBLIC_KIT_SCRIPT } from "../src/server/publicKit";
import { ARABIC_COUNT_SCRIPT } from "../src/utils/arabicCount";
import { instructorRequestPage } from "../src/server/pages/instructorRequestPage";
import { holdRequestReservation, DRAFT_HOLDS_PER_REQUEST, type RequestReservationProposal } from "../src/utils/instructorRequestReservations";
import { pinIssueShort } from "../src/utils/pinIssueShort";
import { teacherPlanFacts } from "../src/utils/teacherPlanFacts";
import type { InstructorRequest } from "../src/types";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const read = (file: string) => readFileSync(file, "utf8");
const logic: any = {};
vm.createContext(logic);
vm.runInContext(ARABIC_COUNT_SCRIPT + "\n" + TEACHER_CARD_LOGIC_JS, logic);
const html = instructorRequestPage("tok", "nonce");
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
const server = readServerSource();
const pageSrc = read("src/server/pages/instructorRequestPage.ts");
/* ما يراه الأستاذ: الصفحةُ المرسلة بلا تعليقات (السكربتُ والأنماطُ والنصوص). */
const shown = html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");

/** مخزنٌ مزيّف بواجهة localStorage. */
function fakeStorage(seed: Record<string, unknown> = {}) {
  const map = new Map<string, string>(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

/* ── ١ المسودة ─────────────────────────────────────────────────────────── */
{
  const BASE = "req-draft:TOK", now = Date.parse("2026-11-14T08:00:00Z");
  const monday = { at: now - 3600_000, items: [{ rowId: 5, action: "change", days: ["fmonday"], start: "10:00" }] };
  /* الزيارة ١: نقل المقرر A إلى الاثنين ثم غادر. الزيارة ٢ (تبويبٌ جديد): تستعيدها. */
  const st = fakeStorage({ [`${BASE}:tab1`]: monday });
  const took = logic.tcDraftTake(st, BASE, `${BASE}:tab2`, now, "");
  check(took && took.items[0].days[0] === "fmonday" && !st.map.has(`${BASE}:tab1`) && st.map.has(`${BASE}:tab2`),
    "١ تبويبٌ جديد يتبنّى أحدثَ مسودة وينقلها إليه (يُمحى مفتاحُها القديم) فلا تبقى نسختان", [...st.map.keys()]);
  /* ثم غيّرها إلى الثلاثاء ووقّع وأرسل: الإرسالُ يمحو مسوداتِ الرابط كلَّها. */
  st.setItem(`${BASE}:tab3`, JSON.stringify(monday));
  logic.tcDraftClearAll(st, BASE);
  check(st.map.size === 0, "١ الإرسالُ الناجح يمحو مسوداتِ الرابط كلَّها لا مسودةَ تبويبه وحده");
  /* الزيارة ٣: لا «استعدنا ما كتبتَه». */
  check(logic.tcDraftTake(st, BASE, `${BASE}:tab4`, now, "2026-11-14T07:30:00Z") === null, "١ الزيارةُ الثالثة لا تجد شيئاً تستعيده");
  /* وحتى لو بقيت مسودةٌ من تبويبٍ لم يُغلق: ما كُتب قبل آخر إرسالٍ لا يُستعاد، ويُمحى. */
  const stale = fakeStorage({ [`${BASE}:old`]: monday, [BASE]: { at: now - 7200_000, items: [] } });
  check(logic.tcDraftTake(stale, BASE, `${BASE}:new`, now, new Date(now - 60_000).toISOString()) === null && stale.map.size === 0,
    "١ مسودةٌ أقدمُ من آخر إرسالٍ للطلب تُمحى ولا تُستعاد", [...stale.map.keys()]);
  const fresh = fakeStorage({ [`${BASE}:mine`]: { ...monday, at: now - 1000 } });
  check(logic.tcDraftTake(fresh, BASE, `${BASE}:mine`, now, new Date(now - 60_000).toISOString())?.items?.length === 1,
    "١ ومسودةُ ما بعد الإرسال (تعديلٌ جديد لم يُرسل) تبقى");
  const old = fakeStorage({ [`${BASE}:x`]: { at: now - 15 * 864e5, items: [] } });
  check(logic.tcDraftTake(old, BASE, `${BASE}:y`, now, "") === null && old.map.size === 0, "١ ومسودةٌ أقدمُ من أسبوعين تُمحى");
  check(/dirty=false;clearAllDrafts\(\);/.test(script) && /if\(confirmedRequest\(r\)\)\{dirty=false;clearAllDrafts\(\);/.test(script)
    && /if\(confirmedRequest\(data\.request\)\|\|data\.request\.status==="settled"\)clearAllDrafts\(\);/.test(script),
    "١ الصفحةُ تمحو الكلَّ عند الإرسال وعند طلبٍ مثبَّت أو مغلق");
  check(/sub:String\(\(data&&data\.request&&data\.request\.submittedAt\)\|\|""\)/.test(script) && /rev:Number\(/.test(script),
    "١ والمسودةُ تحمل نسخةَ الطلب ولحظةَ آخر إرسالٍ بُنيت عليهما");
}

/* ── ٢ الحركة ──────────────────────────────────────────────────────────── */
{
  const types = read("src/types.ts");
  const union = /export type InstructorRequestEventKind =([\s\S]*?);/.exec(types)?.[1] || "";
  const declared = [...union.matchAll(/"([a-z-]+)"/g)].map(m => m[1]);
  /* وكلُّ نوعٍ يكتبه الكود فعلاً في خطّ الطلب: noteOnRequest(…, "kind") وأحداثُ الخطّ { kind: "…", at }. */
  const files: string[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = path.join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(name)) files.push(p); } };
  walk("src");
  const written = new Set<string>();
  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(/noteOnRequest\(([^;\n]{0,240})/g)) for (const k of m[1].matchAll(/"([a-z]+(?:-[a-z]+)+)"/g)) written.add(k[1]);
    for (const m of text.matchAll(/timeline[^\n]{0,220}?kind:\s*"([a-z-]+)"/g)) written.add(m[1]);
  }
  const all = [...new Set([...declared, ...written])].filter(kind => declared.includes(kind) || /^(study-proposal|schedule|item|link|alternative|department|instructor|proposal|submitted|received|settled|unchanged)/.test(kind));
  const missing = all.filter(kind => !logic.TC_EVENTS[kind]);
  check(declared.length >= 25 && missing.length === 0, `٢ كلُّ نوعِ حدثٍ في خطّ الطلب (${all.length}) له اسمٌ عربيّ وأيقونة`, missing);
  check(["schedule-replaced", "study-proposal-sent", "study-proposal-approved", "study-proposal-changes", "study-proposal-revised", "study-proposal-withdrawn", "study-proposal-committed", "study-proposal-commit-undone", "study-proposal-expired"].every(kind => written.has(kind) && /[؀-ۿ]/.test(logic.tcEventLabel(kind))),
    "٢ ومنها schedule-replaced وأحداثُ المقترح الدراسي التي تكتبها studyProposalRoutes وrepository");
  check(Object.values(logic.TC_EVENTS).every((e: any) => /[؀-ۿ]/.test(e[1]) && !/[A-Za-z]/.test(e[1]) && /^[a-zA-Z]+$/.test(e[0])),
    "٢ الأسماءُ عربيةٌ خالصة والأيقوناتُ رموزٌ من العدّة");
  check(logic.tcEventLabel("some-new-kind") === "تحديثٌ على طلبك", "٢ نوعٌ لا يُعرف يُقال بعبارةٍ عربية محايدة لا برمزه");
  check(logic.tcSafeDetail("p-123|1") === "" && logic.tcSafeDetail("2") === "" && logic.tcSafeDetail("department") === "قرار القسم" && logic.tcSafeDetail("room") === "لا تتوفّر قاعة في الوقت المطلوب"
    && logic.tcSafeDetail("استُبدل جدول القسم، وأُغلقت جولة الرغبات السابقة.").startsWith("استُبدل"),
    "٢ التفصيلُ الآليّ («id|1»، رقمٌ، رمزُ سبب) لا يُعرض، والعربيُّ يبقى");
  check(!/EVENTS\[e\.kind\]\|\|e\.kind/.test(script) && script.includes("tcEventLabel(e.kind)") && script.includes("esc(tcSafeDetail(e.detail))"),
    "٢ الصفحةُ لا تعرض e.kind ولا detail خاماً");
}

/* ── ٣ المهلة ─────────────────────────────────────────────────────────── */
{
  const close = "2026-11-17T20:59:59.000Z"; // 23:59:59 الكويت، الثلاثاء 17 نوفمبر
  const at = (iso: string) => logic.tcDeadline(close, Date.parse(iso));
  const count = (n: number) => logic.countOf(n, logic.AR.day);
  check(at("2026-11-17T04:00:00Z").left === 0 && logic.tcDeadlineText(at("2026-11-17T04:00:00Z"), count) === "يُغلق استقبال الطلبات اليوم",
    "٣ صباحُ اليوم الأخير (07:00 الكويت): «يُغلق اليوم» لا «باقٍ يوم واحد»");
  check(at("2026-11-17T20:30:00Z").left === 0, "٣ وقبل الإغلاق بدقائق ما زال «اليوم»");
  check(at("2026-11-16T21:30:00Z").left === 0, "٣ بعد منتصف الليل بتوقيت الكويت (21:30 بتوقيت غرينتش) صار اليومَ الأخير — التقويمُ تقويمُ الكويت لا الجهاز");
  check(at("2026-11-16T20:30:00Z").left === 1 && logic.tcDeadlineText(at("2026-11-16T20:30:00Z"), count) === "يُغلق استقبال الطلبات غداً", "٣ واليومُ قبله «غداً»");
  const three = at("2026-11-14T06:00:00Z");
  check(three.left === 3 && !three.urgent && logic.tcDeadlineText(three, count) === "باقٍ ٣ أيام على إغلاق الطلبات" || (three.left === 3 && /باقٍ .+ على إغلاق الطلبات/.test(logic.tcDeadlineText(three, count))),
    "٣ وقبله بثلاثة أيامٍ تقويمية «باقٍ ٣ أيام»", logic.tcDeadlineText(three, count));
  check(at("2026-11-17T21:00:01Z") === null, "٣ وبعد الإغلاق لا عدّاد");
  check(/الثلاثاء/.test(three.when) && /17/.test(three.when) && !/[٠-٩]/.test(three.when) && three.time === "",
    "٣ التاريخُ بتوقيت الكويت وأرقامٍ لاتينية كبقية الصفحة، بلا ساعةٍ لآخر اليوم", three);
  const own = logic.tcDeadline("2026-11-20T11:00:00.000Z", Date.parse("2026-11-20T05:00:00Z"));
  check(own.left === 0 && own.time === "14:00", "٣ موعدٌ فرديّ بساعةٍ بعينها يُقال بساعته (14:00 الكويت)", own);
  check(/export function teacherDeadline/.test(read("src/server/routes/publicRequestRoutes.ts")) && server.includes("deadline: teacherDeadline(request),")
    && script.includes("tcDeadline((data&&data.deadline)||(r.window&&r.window.closesAt)||\"\",Date.now())"),
    "٣ الخادمُ يرسل موعدَ الأستاذ نفسه (استثناؤه الفرديّ إن امتدّ) والعدّادُ يقرؤه");
}
{
  const { teacherDeadline } = await import("../src/server/routes/publicRequestRoutes");
  const now = Date.parse("2026-11-14T08:00:00Z");
  const window = { opensAt: "2026-11-01T00:00:00Z", closesAt: "2026-11-10T20:59:59Z" };
  const ext = { opensAt: "2026-11-13T00:00:00Z", closesAt: "2026-11-18T20:59:59Z", grantedAt: "", grantedBy: "", reason: "" };
  check(teacherDeadline({ window, individualException: ext } as any, now) === ext.closesAt && teacherDeadline({ window } as any, now) === window.closesAt
    && teacherDeadline({ window, individualException: { ...ext, revokedAt: "x" } } as any, now) === window.closesAt,
    "٣ teacherDeadline: الاستثناءُ الفرديّ المفتوح موعدُه، والملغى لا");
}

/* ── ٤ ردُّ القسم ─────────────────────────────────────────────────────── */
{
  const base = { status: "submitted", submittedAt: "t1", items: [{ itemId: "a1", rowId: 5, action: "change", before: { days: "الأحد", time: "08:00 – 08:50" }, decision: null, thread: [], negotiation: "awaiting", roomAvailable: true, verdict: "clear" }] };
  const roomFlip = JSON.parse(JSON.stringify(base)); roomFlip.items[0].roomAvailable = false; roomFlip.items[0].verdict = "conflict"; roomFlip.requestRevision = 9; roomFlip.timeline = [{ kind: "link-opened" }];
  check(logic.tcDeptSig(base) === logic.tcDeptSig(roomFlip), "٤ تبدّلُ توفّر القاعة (حجزُ زميل) ونسخةُ الطلب وفتحُ الرابط ليست «ردّاً من القسم»");
  const replied = JSON.parse(JSON.stringify(base)); replied.items[0].decision = { state: "rejected", note: "لا يناسب", alternatives: [{}] }; replied.items[0].negotiation = "proposed";
  check(logic.tcDeptSig(base) !== logic.tcDeptSig(replied) && JSON.stringify(logic.tcDeptChangedKeys(base, replied)) === JSON.stringify(["i:a1"]),
    "٤ أمّا قرارُ القسم على البند فردٌّ، ويُعرف بندُه");
  const threaded = JSON.parse(JSON.stringify(base)); threaded.items[0].thread = [{ from: "department", text: "؟" }];
  check(logic.tcDeptSig(base) !== logic.tcDeptSig(threaded), "٤ ورسالةُ القسم في الحوار ردّ");
  check(script.includes("if(syncDirty()){if(tcDeptSig(data.request)!==tcDeptSig(x.d.request)){if(!freshNote){freshNote=true;paint()}}else{data=x.d;paint()}return}"),
    "٤ تحت المسودة: الشريطُ لما يغيّره القسم، وما سواه يُقرأ بصمت فتتجدّد نسخةُ الطلب");
  check(script.includes('id="rebase">') && script.includes("حدّث مع الإبقاء على تعديلي") && !script.includes("احفظ تعديلك أو أرسله ثم حدّث الصفحة")
    && /function rebaseDraft\(\)\{if\(!data\)return;var draft=draftNow\(\),was=data\.request;/.test(script)
    && script.includes("var changed=tcDeptChangedKeys(was,x.d.request);lastFetch=Date.now();adoptCard(x.d);")
    && script.includes("var res=applyDraft(draft,changed);"),
    "٤ «حدّث مع الإبقاء على تعديلي» يقرأ الطلب من جديد ثم يعيد المسودةَ فوقه");
  check(script.includes("if(skip.indexOf(tcItemKey(it))>=0){if(out.kept.indexOf(courseOf(it))<0)out.kept.push(courseOf(it));return}")
    && script.includes("فأبقينا قراره بدل تعديلك"),
    "٤ وبندٌ قرّر فيه القسمُ بعد تعديله يبقى على قرار القسم، ويُقال ذلك في سطرٍ واحد");
  check(script.includes("else{sendingNow=false;rebaseDraft();done(\"تغيّر طلبك قبل لحظات، فحدّثناه وأبقينا تعديلك. وقّع مرة أخرى.\",x.status,x.d.code)}"),
    "٤ وإرسالٌ رُدّ بـ«تغيّر الطلب» يُحدَّث ويُعاد التعديلُ فوقه، فيمرّ التوقيعُ التالي");
}

/* ── ٥ dirty مشتقّ ─────────────────────────────────────────────────────── */
{
  check(!/dirty=true/.test(script), "٥ لا موضعَ يرفع dirty يدوياً");
  check(script.includes("function syncDirty(){dirty=!!(data&&data.windowOpen&&baseItems&&(JSON.stringify(payloadItems())!==JSON.stringify(baseItems)||String(noteNow())!==serverNote()));return dirty}")
    && script.includes('window.addEventListener("beforeunload",function(e){if(syncDirty()&&!skLeaving)') && /paint\.last=sig\}\n syncDirty\(\);/.test(script),
    "٥ dirty = ما سيُرسل يخالف ما حمّله الخادم، ويُحسب بعد كل رسمٍ وقبل «مغادرة الموقع؟»");
  check(script.includes("function saveDraft(){try{if(syncDirty())localStorage.setItem(DRAFT_KEY,JSON.stringify(draftNow()));else localStorage.removeItem(DRAFT_KEY)}catch(e){}}"),
    "٥ و«إلغاء التعديل» يمحو المسودةَ التي لم يبقَ فيها ما يخالف الخادم");
  /* behaviour: الإبقاءُ بلا لمسة يطابق ما حمّله الخادم حرفاً. */
  const box: any = { state: [], DAYS: [["fsunday", "الأحد"], ["ftuesday", "الثلاثاء"]] };
  vm.createContext(box);
  const grab = (name: string) => { const at = script.indexOf(`function ${name}(`); const ends = ["\nfunction ", "\n/*", "\nvar "].map(t => script.indexOf(t, at + 1)).filter(n => n > at); return script.slice(at, Math.min(...ends)); };
  vm.runInContext([grab("rawItem"), "function newKey(){return \"k\"}", grab("unchangedEdit"), grab("payloadItems"),
    "function sameAsBefore(it){return it.action===\"change\"&&it.days.join()===\"fsunday\"&&it.start===\"08:00\"}"].join("\n"), box);
  box.state = [{ itemId: "a1", rowId: 5, action: "keep", days: [], start: "", excuse: "" }];
  const base = JSON.stringify(box.payloadItems());
  box.state[0].action = "change"; box.state[0].days = ["fsunday"]; box.state[0].start = "08:00";
  const untouched = JSON.stringify(box.payloadItems());
  box.state[0].start = "10:00";
  const moved = JSON.stringify(box.payloadItems());
  box.state[0].action = "keep"; box.state[0].days = []; box.state[0].start = "";
  check(base === untouched && moved !== base && JSON.stringify(box.payloadItems()) === base,
    "٥ «تعديل» بلا لمسة و«إلغاء التعديل» يعودان إلى ما حمّله الخادم حرفاً، فلا يبقى dirty", { base, untouched });
}

/* ── ٦ التوقيع ─────────────────────────────────────────────────────────── */
{
  const core = read("src/server/core/instructorRequests.ts");
  const body = core.slice(core.indexOf("export async function verifyRequestSigner"), core.indexOf("export const taPhaseId"));
  check(body.indexOf("validateCivilId(civil)") > 0 && body.indexOf("validateCivilId(civil)") < body.indexOf("publicAttemptReserve("),
    "٦ صيغةُ الرقم تُفحص قبل حجز المحاولة");
  const { verifyRequestSigner } = await import("../src/server/core/instructorRequests");
  const { publicAttemptReserve } = await import("../src/server/core/shareLinks");
  const request = { id: "r5-typo", AdInstructorId: 1 } as any;
  const statuses: number[] = [];
  for (let k = 0; k < 14; k++) {
    let status = 0;
    const res: any = { status(code: number) { status = code; return this; }, json() { return this; } };
    await verifyRequestSigner(request, { body: { civil: "12345" }, ip: "10.9.9.9" } as any, res);
    statuses.push(status);
  }
  const left = publicAttemptReserve(`request:${request.id}`, "10.9.9.9");
  check(statuses.every(s => s === 400) && !!left, "٦ أربعَ عشرةَ مرةً برقمٍ ناقص: كلُّها 400 ولا تُستنفد المحاولات (لا 429)", statuses);
  if (left) left.release();
  check(/code: "civil-mismatch"/.test(body) && /code: "civil-format"/.test(body), "٦ وعدمُ المطابقة يحمل رمزه");
  check(PUBLIC_KIT_SCRIPT.includes('if(status===403&&(code==="civil-mismatch"||(!code&&/الرقم المدني/.test(msg)))){civil="";again=true;draw(msg)}return}'),
    "٦ ورقةُ التوقيع تعيد طلبَ الرقم حين خالف صاحبَ الرابط وحده، لا لبابٍ أُغلق");
  check(script.includes('done(x.d.error||"تعذّر الإرسال",x.status,x.d.code)') && script.includes('cb(x.d.error||"تعذّر إرسال الرد",x.status,x.d.code)'),
    "٦ والصفحةُ تمرّر رمزَ الخطأ إلى ورقة التوقيع");
}

/* ── ٧ حجوزُ التحرير ───────────────────────────────────────────────────── */
{
  const soon = (k: number) => new Date(Date.now() + 10 * 60_000 + k * 1000).toISOString();
  const request = { id: "req-cap", AdInstructorId: 70, AdTermId: 1, items: [], status: "sent" } as unknown as InstructorRequest;
  const slot = (h: number) => [{ day: "fsunday", start: `${String(h).padStart(2, "0")}:00`, end: `${String(h).padStart(2, "0")}:50` }] as any;
  const proposal = (itemId: string, h: number): RequestReservationProposal => ({ itemId, instructorId: 70, collegeId: 1, sectionId: 4, courseId: 10, slots: slot(h),
    rooms: [{ roomId: "room-a", room: "B1", hall: "101" }], offeringRowIds: [] });
  let ledger: any[] = [];
  for (let k = 0; k < 8; k++) ledger = holdRequestReservation(ledger, request, proposal(`draft:new:key${k}`, 8 + k), [], soon(k));
  const mine = ledger.filter(entry => entry.requestId === request.id);
  check(DRAFT_HOLDS_PER_REQUEST === 3 && mine.length === 3 && mine.map(e => e.itemId).join() === "draft:new:key5,draft:new:key6,draft:new:key7",
    "٧ ثمانيةُ مفاتيح جديدة من رابطٍ واحد تُبقي ثلاثةَ حجوزٍ فقط، الأحدثَ منها", mine.map(e => e.itemId));
  ledger = holdRequestReservation(ledger, request, proposal("draft:new:key7", 18), [], soon(20));
  check(ledger.filter(entry => entry.requestId === request.id).length === 3 && ledger.find(e => e.itemId === "draft:new:key7")?.slots[0].start === "18:00",
    "٧ وحجزُ البند نفسه يُستبدل ولا يُضاف");
  let two: any[] = [];
  for (let k = 0; k < 4; k++) two = holdRequestReservation(two, request, proposal(`draft:row:${k}`, 8 + k), [], soon(k), 2);
  check(two.length === 2, "٧ والسقفُ بعدد ما يُعدَّل وواحدٍ فوقه حين يقلّ عن ثلاثة");
  const other = { ...request, id: "req-other", AdInstructorId: 71 } as unknown as InstructorRequest;
  const mixed = holdRequestReservation(ledger, other, { ...proposal("draft:row:1", 15), instructorId: 71, rooms: [{ roomId: "room-z", room: "C", hall: "1" }] }, [], soon(30));
  check(mixed.filter(e => e.requestId === request.id).length === 3 && mixed.filter(e => e.requestId === "req-other").length === 1, "٧ وحجوزُ الزملاء لا تُحسب على سقف غيرهم");
  check(server.includes('app.post("/api/public/request/:token/hold", rateLimitCheckTimes, rateLimitHoldCreate, async')
    && /const rateLimitHoldCreate = rateLimit\(\{\s*windowMs: 60_000,\s*limit: 20,\s*keyGenerator: requestTokenKey,/.test(server)
    && server.includes("Math.min(DRAFT_HOLDS_PER_REQUEST, editing + 1)"),
    "٧ وإنشاءُ الحجوز محدودٌ لكل رابط (عشرون في الدقيقة) والسقفُ يُمرَّر إلى الدفتر");
}

/* ── ٨ لا «مانع» ───────────────────────────────────────────────────────── */
{
  /* قاموسُ العدّ المشترك (arabicCount) يحمل «مانع» اسماً معدوداً لشاشات القسم؛ لا يُعرض في الكرت ولا يُستدعى فيه. */
  const visible = shown.replace(/"(?:blocker|approvalBlocker|saveBlocker)":\{[^}]*\}/g, "");
  const words = [...visible.matchAll(/.{0,20}(مانع|موانع).{0,20}/g)].map(m => m[0]);
  check(!words.length && !/AR\.(?:blocker|approvalBlocker|saveBlocker)/.test(script), "٨ لا «مانع» ولا «موانع» في أيّ نصٍّ تحمله صفحةُ الأستاذ", words.slice(0, 4));
  check(script.includes('it.tone==="bad"?"الوقت غير متاح"') && script.includes('"راجع ما يحتاج تعديلاً"') && script.includes('it.note="نتحقّق من الوقت على جدولك…"'),
    "٨ بل «الوقت غير متاح» و«راجع ما يحتاج تعديلاً» و«نتحقّق من الوقت…»");
}

/* ── ٩ لا قاعةَ ولا مبنى ───────────────────────────────────────────────── */
{
  check(!/🏫|🏢/.test(shown), "٩ لا 🏫 ولا 🏢 في الصفحة");
  const allowed = shown.replace(/لا تتوفّر قاعةٌ? في (?:هذا الوقت|الوقت المطلوب)|لا قاعة في (?:هذا الوقت|الوقت المطلوب)|قاعة مناسبة تُحجز لك تلقائياً/g, "")
    .replace(/"room":\{[^}]*\}/g, "").replace(/"building":\{[^}]*\}/g, "");
  const leaks = [...allowed.matchAll(/.{0,24}(قاعة|القاعة|قاعات|مبنى|المبنى|مباني).{0,24}/g)].map(m => m[0]);
  check(!leaks.length, "٩ لا ذكرَ لقاعةٍ أو مبنى إلا حالةُ التوفّر", leaks.slice(0, 3));
  check(!/\.(?:room|roomCode|roomHall|roomId|building|buildingId|AdRoomCode|AdRoomHall|reservedRoom|roomPick)\b/.test(script.replace(/it\.roomOk|\.roomAvailable/g, "")),
    "٩ سكربتُ الكرت لا يقرأ حقلَ قاعةٍ أو مبنى (فلا يعتمد على تجريدها من الخادم)");
  check(logic.tcNoPlace("الوقت 10:00 ← 11:00 · القاعة 7/31 ← 8/22") === "الوقت 10:00 ← 11:00" && logic.tcNoPlace("انتقل إلى قاعة 901A01") === "انتقل إلى"
    && logic.tcNoPlace("لا تتوفّر قاعة في هذا الوقت") === "لا تتوفّر قاعة في هذا الوقت" && logic.tcNoPlace("مخالفة (م.7/8)") === "مخالفة (م.7/8)"
    && logic.tcNoPlace("مبنى A3 · الوقت 09:00") === "الوقت 09:00",
    "٩ وأيُّ رمز قاعةٍ أو مبنى في نصٍّ من الخادم يسقط في الصفحة، والجملةُ العامة ورقمُ المادة يبقيان");
  check(script.includes("it.note=tcNoPlace(result.headline||\"\")") && script.includes("esc(tcNoPlace(m.text))") && script.includes("esc(tcNoPlace(d.note))") && script.includes("esc(tcSafeDetail(e.detail))"),
    "٩ سطرُ الحكم وملاحظةُ القسم وحوارُه وتفاصيلُ الحركة تمرّ بها");
  check(script.includes('title="قاعة مناسبة تُحجز لك تلقائياً"') && script.includes("gi(\"door\")+'<b aria-hidden=\"true\">✓</b>"),
    "٩ والتوفّرُ أيقونةُ بابٍ و✓ «قاعة مناسبة تُحجز لك تلقائياً»");
}

/* ── ١٠ المخالفاتُ مجمّعة ─────────────────────────────────────────────── */
{
  const line = "التصميم التعليمي: مدة الموعد 75د لا توافق النمط المعتمد (اثنين·أربعاء · 110د): النهاية 11:20. (م.7/8)";
  const blocks = [
    { itemIndex: 2, text: line, course: "التصميم التعليمي", ...pinIssueShort({ rule: "pattern-length", text: "مدة الموعد 75د لا توافق النمط المعتمد (اثنين·أربعاء · 110د): النهاية 11:20." }) },
    { itemIndex: 3, text: line, course: "التصميم التعليمي", ...pinIssueShort({ rule: "pattern-length", text: "مدة الموعد 75د لا توافق النمط المعتمد (اثنين·أربعاء · 110د): النهاية 11:20." }) },
    { itemIndex: 3, text: "التصميم التعليمي: ساعات الشعبة 01 تزيد على ساعات المقرر · 300/240 د", course: "التصميم التعليمي", ...pinIssueShort({ rule: "course-hours", text: "ساعات الشعبة 01 تزيد على ساعات المقرر · 300/240 د" }) },
    { itemIndex: 5, text: "الإحصاء: 3 محاضرات طويلة متتالية للعضو يوم الأحد، والحد شعبتان. (م.6/2)", course: "الإحصاء", ...pinIssueShort({ rule: "consecutive-long", text: "" }) },
  ];
  const groups = logic.tcPinGroups(blocks);
  check(groups.length === 2 && groups[0].course === "التصميم التعليمي" && groups[0].itemIndex === 2 && groups[0].marks.length === 2 && groups[0].texts.length === 2,
    "١٠ سبعُ شرائط تصير صفّاً لكل مقرّر: «التصميم التعليمي» مرّة، بعلامتين، و«عدّل» واحدٌ إلى أول موعد", groups);
  check(groups[0].marks[0].t === "المدة أقصر من المقرر" && groups[0].marks[0].ic === "clock" && groups[0].marks[1].t === "ساعات أكثر من المقرر",
    "١٠ العبارةُ قصيرة بأيقونة: «المدة أقصر من المقرر»", groups[0].marks);
  check(!groups[0].texts[0].startsWith("التصميم التعليمي") && groups[0].texts[0].includes("(م.7/8)"), "١٠ والتفصيلُ كاملاً تحت الضغط بلا تكرار اسم المقرر");
  check(pinIssueShort({ rule: "pattern-length", text: "مدة الموعد 130د لا توافق النمط المعتمد (اثنين·أربعاء · 110د): النهاية 11:20." }).short === "المدة أطول من المقرر"
    && pinIssueShort({ rule: "pattern", text: "" }).short === "الأيام خارج النمط" && pinIssueShort({ rule: "start-ladder", text: "" }).icon === "sunrise",
    "١٠ ولكل قاعدةٍ عبارتُها");
  check(script.includes("tcPinGroups(pinList).map(function(p){return '<li><details class=\"pin-g\"><summary>") && script.includes("data-pin-edit=\"'+Number(p.itemIndex)+'\">'+gi(\"pen\")+'عدّل</button>'")
    && server.includes("rule: issue.rule, course: name, ...pinIssueShort(issue)"),
    "١٠ الصفحةُ ترسمها صفوفاً بتفصيلٍ مطويّ، والخادمُ يرسل العبارةَ والأيقونةَ واسمَ المقرر");
}

/* ── ١١ مقترحة لك ──────────────────────────────────────────────────────── */
{
  check(script.includes("function bestTimes(it,i)") && !script.includes("out.length>=3?out.slice(0,3):[]") && script.includes("return out.slice(0,3)}")
    && script.includes("if(!out.length&&(it.alts||[]).length)out=it.alts.slice(0,3)"),
    "١١ تظهر حتى ثلاثةُ أوقاتٍ متاحة ولو قلّت، وإلا أقربُ ما اقترحه الخادمُ بأيامه");
  check(script.includes("if(!it.days.length)return '<p class=\"best-wait\">") && script.includes("best-load"),
    "١١ وقبل اختيار الأيام سطرٌ يدلّ، وأثناء القراءة هيكلٌ هادئ — فلا تغيب");
  check(/var BEST_WHY=\{students:\["users",[^}]+after:\["arL",[^}]+morning:\["sunrise",/.test(script) && script.includes("skPills(ds)+'<b class=\"bp-t\">'+ltr(b.t+(end?\" – \"+end:\"\"))"),
    "١١ بطاقةٌ: الأيامُ حبوباً والوقتُ كاملاً كبيراً وسببٌ بأيقونة (بعد محاضرتك، صباحاً، أقل تعارضاً لطلبتك)");
  check(script.includes("!(openCards[i]||cardShown[i])"), "١١ والبندُ المفتوح من نفسه تُقرأ أوقاتُه أيضاً");
  check(/\.best-row \.best-c\{[^}]*min-block-size:104px/.test(TEACHER_CARD_R5_CSS) && /\.best-row \.best-c small\{[^}]*font-size:12px/.test(TEACHER_CARD_R5_CSS),
    "١١ البطاقاتُ ≥44px ونصُّها ≥12px");
}

/* ── ١٢ التخطيط ─────────────────────────────────────────────────────────── */
{
  const sections = new Map<number, Set<string>>([[10, new Set(["01", "02"])], [11, new Set(["01"])], [99, new Set(["01"])]]);
  const readings = new Map([["1:4", { accepted: { "10": 3, "99": 4 }, remaining: { "10": 120, "11": 45 }, sections }]]);
  const facts = teacherPlanFacts([{ collegeId: 1, sectionId: 4, courseId: 10 }, { collegeId: 1, sectionId: 4, courseId: 11 }, { collegeId: 1, sectionId: 4, courseId: 12 }, { collegeId: 2, sectionId: 4, courseId: 10 }], readings);
  check(JSON.stringify(facts) === JSON.stringify({ "1:4:10": { planned: 3, existing: 2, students: 120 }, "1:4:11": { existing: 1, students: 45 } }),
    "١٢ لكل مقرّرٍ من مقرّرات الكرت: المخطَّطُ والقائمُ والمتوقَّع، وما لا تخطيطَ له لا شيء، ولا مقرّرَ خارج الكرت", facts);
  check(Object.values(facts).every(f => Object.keys(f).every(k => ["planned", "existing", "students"].includes(k)) && Object.values(f).every(v => typeof v === "number")),
    "١٢ أرقامٌ مجمَّعة وحدها: لا اسمَ ولا هويّة");
  const route = read("src/server/routes/publicRequestRoutes.ts");
  const fn = route.slice(route.indexOf("async function teacherPlanningFor"), route.indexOf("export function teacherDeadline"));
  check(fn.includes("Date.now() - cached.at < 5 * 60_000") && fn.includes("Repository.getRegistrationStats(") && fn.includes('stats?.remainingSource?.column === "notPassed"')
    && fn.includes("(request.items || []).map(") && !/getStudentNeeds|getStudentProfiles|masari|surveyActive|readStudentDemand/i.test(fn),
    "١٢ القراءةُ خفيفة من «تخطيط الشعب» وحده (لا رغبات مساري ولا استبيان)، لمقرّرات الأستاذ، وتُحفظ خمس دقائق");
  check(script.includes("var h=planHtml(it)+decisionBox(it,i,open)+threadBox(it,i);") && script.includes("خطة القسم") && script.includes('<span class="pf-dots" aria-hidden="true">'),
    "١٢ وتُرسم في تفصيل كل موعد: نقاطُ الشعب وأيقونةُ الطلبة، بكلماتٍ قليلة");
}

/* ── صغائر ─────────────────────────────────────────────────────────────── */
{
  check(TEACHER_CARD_EXTRAS_JS.includes('tcStick[i]={error:e&&e.server?e.message:"تعذّر الاتصال الآن"}') && TEACHER_CARD_EXTRAS_JS.includes("data-stick-retry")
    && !TEACHER_CARD_EXTRAS_JS.includes("tcStick[i]={error:e.message}"),
    "«لاصق بمحاضرتي» عند انقطاع الشبكة: عربيةٌ وزرُّ «أعد المحاولة» لا «Failed to fetch»");
  check(script.includes('it.tone="retry";it.note="تعذّر الفحص — أعد المحاولة"') && script.includes('data-recheck="1">') && script.includes('host.querySelectorAll("[data-recheck]")')
    && /var badN=state\.filter\(function\(it\)\{return !unchangedEdit\(it\)&&!incompleteItem\(it\)&&it\.tone==="bad"\}\)/.test(script),
    "تعذّرُ الفحص حالةٌ محايدة بزرّ إعادة، لا تُخفي شريطَ الإرسال");
  check(script.includes('id="loadAgain"') && script.includes("function loadCard(){") && script.includes("loadCard();\n"), "أولُ فتحٍ متعذّر يُعاد بزرّ");
  check(script.includes('live.addEventListener("ready",function(){liveBack=2000;if(liveSeen)refresh();liveReady=true;liveSeen=true});') && !/function closeLive\(\)\{[^}]*liveSeen=false/.test(script),
    "البثُّ العائد بعد انقطاع يقرأ مرّةً ما فاته");
  /* الخطوطُ والأهداف. */
  check(/\.hd \.hd-k,\.chip,[^{]*\.st,[^{]*\{font-size:12px\}/.test(TEACHER_CARD_R5_CSS) && /\.wb span\{font-size:11px\}/.test(TEACHER_CARD_R5_CSS),
    "الخطوطُ ≥12px (وتسمياتُ شبكة الأسبوع 11px)");
  check(/\.fn-go\{[^}]*min-block-size:44px/.test(TEACHER_CARD_R5_CSS) && /\.fn-x\{[^}]*block-size:44px/.test(TEACHER_CARD_R5_CSS) && /\.pin-blocks \.act\{[^}]*min-block-size:44px/.test(TEACHER_CARD_R5_CSS)
    && /\.v-retry\{[^}]*min-block-size:44px/.test(TEACHER_CARD_R5_CSS) && /min-height:44px/.test(TEACHER_CARD_EXTRAS_JS + read("src/server/teacherCardExtras.ts")),
    "وكلُّ ما يُضغط مما مُسّ ≥44px");
  check(!/prefers-color-scheme:\s*dark/.test(pageSrc + TEACHER_CARD_R5_CSS) && /<meta name="color-scheme" content="light">/.test(html), "والكرتُ فاتحٌ دائماً");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
