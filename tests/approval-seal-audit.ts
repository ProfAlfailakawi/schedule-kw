/**
 * ختم الاعتماد (FR-DSH-032 · FR-DSH-037): الاعتماد النهائي من سجل الاعتماد نفسه الذي يرويه
 * «فيلم الفصل»؛ الختم على ملصق البصمة لكل فصلٍ معتمد وحده؛ لحظة الاحتفال مرةً واحدة لكل حسابٍ
 * على الجهاز ولكل اعتماد؛ والختم يفوز على افتتاحية اليوم إن حانا معاً؛ ولا كتابة جديدة.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  approvalSealFrom, finalAcceptance, homeMoment, parseSealSeen, sealDateLabel, sealMomentDue, sealMomentKey, sealMomentLine, sealMomentMode,
  sealRosette, sealTextArc, withSealSeen, POSTER_SEAL,
} from "../src/utils/approvalSeal";
import { deliveryFromApproval, deptFilm, buildFromRows } from "../src/utils/termFilm";
import { fingerprintGeometry, FINGERPRINT_VIEW } from "../src/utils/deptFingerprint";

const source = (path: string) => readFileSync(path, "utf8");

/* ── مصدر الحقيقة الواحد: «معتمد» وتاريخ آخر جولةٍ قُبلت ── */
const accepted = { status: "accepted", rounds: [{ number: 1, submittedAt: "2026-11-01T08:00:00Z", returnedAt: "2026-11-03T08:00:00Z" }, { number: 2, acceptedAt: "2026-11-16T09:30:00Z" }] };
assert.deepEqual(finalAcceptance(accepted), { final: true, acceptedAt: "2026-11-16T09:30:00Z", round: 2 });
assert.equal(finalAcceptance({ status: "submitted", rounds: [{ number: 1 }] }).final, false);
/* جولة تعديلٍ بعد قبولٍ سابق: الحالة «معاد» فلا نهائي، وإن بقي تاريخ القبول القديم في السجل. */
const amended = { status: "returned", rounds: [{ number: 2, acceptedAt: "2026-11-10T09:00:00Z" }, { number: 3, amendment: true, returnedAt: "2026-11-20T09:00:00Z" }] };
assert.equal(finalAcceptance(amended).final, false);
assert.equal(approvalSealFrom(amended, "الفصل الأول"), null, "المعاد بلا ختم");
assert.equal(approvalSealFrom(null, "الفصل الأول"), null);
assert.equal(approvalSealFrom({ status: "drafting" }, "x"), null);

const seal = approvalSealFrom(accepted, "الفصل الأول 2026/2027")!;
assert.equal(seal.termName, "الفصل الأول 2026/2027");
assert.equal(seal.acceptedAt, "2026-11-16T09:30:00Z");
assert.equal(seal.date, "16 نوفمبر 2026", "تاريخٌ بأرقامٍ لاتينية بتوقيت الكويت");
assert.ok(!/[٠-٩]/.test(seal.date), "لا أرقام عربية-هندية");
assert.equal(sealDateLabel("2026-11-15T22:30:00Z"), "16 نوفمبر 2026", "بعد منتصف الليل في الكويت يومٌ جديد");
assert.equal(sealDateLabel("bad"), "");
/* سجلٌ قديم «معتمد» بلا تاريخ: ختمٌ بلا تاريخ، لا تاريخٌ مخترع. */
assert.deepEqual(approvalSealFrom({ status: "accepted", rounds: [{ number: 1 }] }, "ث"), { termName: "ث", acceptedAt: null, date: "" });
assert.equal(sealMomentLine(seal), "اعتُمد جدول القسم · 16 نوفمبر 2026");
assert.equal(sealMomentLine({ date: "" }), "اعتُمد جدول القسم");

/* الفيلم والختم يقرآن المصدر نفسه: النهائي والتاريخ واحد. */
for (const approval of [accepted, amended, { status: "submitted", rounds: [{ number: 1, submittedAt: "2026-11-01T08:00:00Z" }] }]) {
  const delivery = deliveryFromApproval(approval);
  const own = finalAcceptance(approval);
  assert.equal(delivery.final, own.final);
  assert.equal(delivery.acceptedAt, own.acceptedAt);
  assert.equal(Boolean(approvalSealFrom(approval, "t")), delivery.final);
}
const filmOf = (approval: any) => deptFilm({
  termName: "الفصل الأول", sectionName: "تكنولوجيا التعليم", collegeName: "", build: buildFromRows([], new Set()), wishes: null, clash: null, students: 0,
  delivery: deliveryFromApproval(approval),
});
assert.deepEqual(filmOf(accepted).seal, { term: "الفصل الأول", date: "16 نوفمبر 2026" }, "ختام الفيلم النهائي يحمل الختم");
assert.equal(filmOf(amended).seal, null, "الفيلم «حتى الآن» بلا ختم");

/* ── مرةً واحدة: لكل حسابٍ على الجهاز ولكل اعتماد ── */
const key = sealMomentKey({ viewer: 16, collegeId: 1, sectionId: 2, termId: 1, acceptedAt: seal.acceptedAt });
assert.equal(key, "16:1:2:1:2026-11-16T09:30:00Z");
assert.notEqual(key, sealMomentKey({ viewer: 15, collegeId: 1, sectionId: 2, termId: 1, acceptedAt: seal.acceptedAt }), "حسابٌ آخر احتفالٌ آخر");
assert.notEqual(key, sealMomentKey({ viewer: 16, collegeId: 1, sectionId: 2, termId: 1, acceptedAt: "2026-12-01T09:00:00Z" }), "اعتمادٌ جديد بعد جولة تعديل احتفالٌ جديد");
assert.equal(sealMomentKey({ viewer: 16, collegeId: 1, sectionId: 2, termId: 1 }), "16:1:2:1:accepted");

const due = (seen: string[], extra: Partial<Parameters<typeof sealMomentDue>[0]> = {}) => sealMomentDue({ allowed: true, seal, key, seen, ...extra });
assert.equal(due([]), true, "أول مرة: يحين");
let seen = withSealSeen([], key);
assert.equal(due(seen), false, "المرة الثانية: لا");
assert.deepEqual(withSealSeen(seen, key), [key], "بلا تكرار");
assert.equal(due([], { allowed: false }), false, "من لا يرى البصمة: لا");
assert.equal(due([], { seal: null }), false, "بلا اعتماد: لا");
assert.equal(due([], { print: true }), false, "ولا مع الطباعة");
assert.equal(due([], { key: "" }), false);
/* التخزين التالف أو الغريب قائمةٌ فارغة، لا عطل. */
assert.deepEqual(parseSealSeen("not json"), []);
assert.deepEqual(parseSealSeen('{"a":1}'), []);
assert.deepEqual(parseSealSeen(JSON.stringify(["a", 3, "b"])), ["a", "b"]);
assert.deepEqual(parseSealSeen(null), []);
/* الذاكرة محدودة: الأقدم يسقط. */
seen = [];
for (let n = 0; n < 60; n += 1) seen = withSealSeen(seen, `k${n}`);
assert.equal(seen.length, 40);
assert.equal(seen[0], "k20");

assert.equal(sealMomentMode(false, false), "none");
assert.equal(sealMomentMode(true, false), "full");
assert.equal(sealMomentMode(true, true), "still", "تقليل الحركة: الإطار الساكن");

/* ── الختم والافتتاحية: لا لحظتان في تحميلٍ واحد، والختم يفوز ذلك اليوم ── */
assert.deepEqual(homeMoment({ seal: "full", opening: "full" }), { seal: "full", opening: "none", skipOpeningToday: true });
assert.deepEqual(homeMoment({ seal: "still", opening: "still" }), { seal: "still", opening: "none", skipOpeningToday: true });
assert.deepEqual(homeMoment({ seal: "full", opening: "none" }), { seal: "full", opening: "none", skipOpeningToday: false });
assert.deepEqual(homeMoment({ seal: "none", opening: "full" }), { seal: "none", opening: "full", skipOpeningToday: false });
assert.deepEqual(homeMoment({ seal: "none", opening: "none" }), { seal: "none", opening: "none", skipOpeningToday: false });

/* ── رسم الختم: حتميّ، وفي زاويةٍ لا تغطّي حلقةً ولا يوماً ولا رقماً ── */
assert.equal(sealRosette(100, 100, 80), sealRosette(100, 100, 80));
assert.ok(/^M[\d. -]+(L[\d. -]+)+Z$/.test(sealRosette(100, 100, 80)));
assert.equal(sealTextArc(0, 0, 10, "top"), "M-10 0A10 10 0 0 1 10 0");
assert.equal(sealTextArc(0, 0, 10, "bottom"), "M-10 0A10 10 0 0 0 10 0");
{
  const V = FINGERPRINT_VIEW, S = POSTER_SEAL;
  const toCentre = Math.hypot(S.cx - V.cx, S.cy - V.cy);
  assert.ok(toCentre - S.r > V.outer + 19, "الختم خارج الحلقات وعلامات الساعات");
  assert.ok(S.cx - S.r > 38 && S.cy - S.r > 250, "داخل الإطار وتحت الرأس");
  assert.ok(S.cy + S.r < 1136, "فوق الأرقام الأربعة");
  const geo = fingerprintGeometry({ halls: [], hours: [[], [], [], [], []], span: { from: 480, to: 1200 } } as any);
  for (const label of geo.dayLabels) assert.ok(Math.hypot(label.x - S.cx, label.y - S.cy) > S.r + 40, `لا يغطّي اسم ${label.name}`);
}

/* ── الخادم: قراءةٌ فقط من سجل الاعتماد، بحارس البصمة نفسه ── */
const route = source("src/server/routes/deptFingerprintRoutes.ts");
assert.ok(/approvalSealFrom\(await Repository\.getScheduleApproval\(/.test(route), "الختم من سجل الاعتماد");
assert.ok(!/Repository\.(save|update|delete|upsert|set|add|create|write)[A-Z]/.test(route), "لا كتابة");
assert.ok(/seal: available \?/.test(route) && /viewer: Number\(req\.user\?\.SystemUserId/.test(route), "المختصر يحمل الختم ورقم الحساب");
const brief = route.slice(route.indexOf("if (brief)"));
assert.ok(route.indexOf("mayReadFingerprint(req)") < route.indexOf("if (brief)"), "المختصر خلف حارس البصمة");
assert.ok(!/CivilId|civilId|InstructorName/.test(brief + source("src/utils/approvalSeal.ts")), "لا رقم مدني ولا اسم أستاذ");

/* ── الشاشات ── */
const ui = source("src/components/ApprovalSeal.tsx");
assert.ok(!/className=/.test(ui.slice(ui.indexOf("export function SealMark"), ui.indexOf("export function SealBadge"))), "الختم بخصائص مكتوبة فيدخل الصورة المنزَّلة");
assert.ok(/"pointerdown", "keydown", "wheel", "touchstart"/.test(ui) && /beforeprint/.test(ui), "أي ضغطةٍ أو مفتاحٍ أو تمريرٍ أو طباعة تسحب اللحظة");
assert.ok(!/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(ui), "تقرأ فقط");
const css = source("src/styles/approval-seal.css");
assert.ok(/pointer-events:none/.test(css) && /@media print\{\.asm,\.hp-seal-moment\{display:none!important\}\}/.test(css), "لا تلتقط المؤشر ولا تُطبع");
assert.ok(/prefers-reduced-motion:reduce/.test(css), "تقليل الحركة");
const fp = source("src/components/DeptFingerprint.tsx");
assert.ok(/seal=\{beforeSeal\}/.test(fp) && /seal=\{\(tmOn \? shown\?\.seal : answer\?\.seal\) \|\| null\}/.test(fp), "في المقارنة لكل فصلٍ ختمه");
const dash = source("src/components/Dashboard.tsx");
assert.ok(/homeMoment\(\{seal:sealMode,opening:mode\}\)/.test(dash) && /skipOpeningToday\)writeOpeningSeen/.test(dash), "الرئيسية تحسم الختم قبل الافتتاحية");
assert.ok(/sealScopeKey=filmScope\?\.version==="dept"/.test(dash), "لأصحاب جدول القسم وحدهم");
const pulse = source("src/components/hallPulse/HallPulse.tsx");
assert.ok(/props\.context !== "dean" && props\.sectionId > 0/.test(pulse), "لا لحظة في نسخة العميد ولا في «كل الأقسام»");
assert.ok(/celebrate\(ms = 3000\)/.test(source("src/components/hallPulse/pulseScene.ts")));

/* ختمٌ يصل بعد مهلة الانتظار يظهر متأخراً ما لم تُعرض افتتاحيةٌ في التحميل نفسه. */
assert.ok(/const lateSealDone=useRef\(""\);/.test(dash), "أثرٌ للختم المتأخر");
assert.ok(/if\(!openingAsked\.current\|\|openingShown\.current\|\|sealMoment\|\|!sealRead\?\.seal\|\|opening!=="none"/.test(dash), "ولا يُكدَّس مع افتتاحيةٍ عُرضت في التحميل نفسه");
assert.ok(/\},\[sealRead,opening,sealScopeKey\]\);/.test(dash), "ويعيد النظر حين يصل الختم");
assert.ok(/openingShown\.current=true;writeOpeningSeen/.test(dash), "والافتتاحية المعروضة تُعلَّم");

console.log("approval-seal-audit: ok");
