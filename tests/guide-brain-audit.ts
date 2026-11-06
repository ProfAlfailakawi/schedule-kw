/**
 * ── فهم المرشد ──
 * 160 سؤالاً كتبها طرفان لم يريا البنك: 90 منها استُعملت في الضبط، و70 حُفظت
 * للقياس. الحد الأدنى يمنع التراجع، ولا يدّعي دقة أعلى مما قيس.
 */
import fs from "node:fs";
import { GUIDE_FEATURES, allAllowedGuideFeatures, canAccessGuideFeature, featureById } from "../src/guide/smartGuide";
import { GUIDE_BANK } from "../src/guide/bank";
import { buildIndex, isLiveQuestion, maskUnknownWords, splitQuestion, understand, type Understood } from "../src/guide/brain/engine";
import { normalizeText, editDistance } from "../src/guide/brain/normalize";

let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) { failed += 1; console.error(`✗ ${label}`); } };
const index = buildIndex(GUIDE_FEATURES.map(f => ({ id: f.id, title: f.title, view: f.view, ask: (GUIDE_BANK[f.id]?.q || "").split("|") })));
const got = (x: Understood) => x.kind === "answer" ? x.id : x.kind === "live" ? "live" : "unsure";

for (const f of GUIDE_FEATURES) {
  const e = GUIDE_BANK[f.id];
  check(Boolean(e), `بنك: ${f.id}`);
  if (!e) continue;
  check(e.s.length >= 1 && e.s.length <= 4, `خطوات قصيرة: ${f.id}`);
  check(e.q.split("|").length >= 2, `صيغ كافية: ${f.id}`);
  check(!/شلون|وين|ابي|ليش|شنو/.test([...e.s, e.w || ""].join(" ")), `نص فصيح: ${f.id}`);
  check(!/كرسي/.test(e.s.join(" ")), `«فريق» لا «كرسي»: ${f.id}`);
}
check(normalizeText("أَلقاعـــة الإدارية ١٢") === "القاعه الاداريه 12", "التطبيع");
check(editDistance("تعارظ", "تعارض") === 1, "مسافة التحرير");
check(splitQuestion("كيف أنقل مقرر؟ وكيف اطبع التقرير").length === 2, "تقسيم المركب");
check(splitQuestion("تقرير الأساتذة والأقسام").length === 1, "العطف ليس سؤالين");
check(Boolean(isLiveQuestion("كم طالب مسجل الحين")), "سؤال حي");
check(maskUnknownWords(index, "شلون اطلع شهادة سارة").includes("سارة") === false, "طمس ما قد يكون اسماً");

// لا يظهر لدور ما لا يصل إليه، ولو كان أقرب جواب.
const teacher = { permissions: [7], root: false, admin: false };
const allowed = new Set(allAllowedGuideFeatures(teacher.permissions, false, false).map(f => f.id));
const backup = understand(index, "كيف آخذ نسخة احتياطية", allowed);
check(backup.every(x => got(x) !== "page.backup" && !(x.kind === "unsure" && x.closest.includes("page.backup"))), "الصلاحية تحجب الجواب");
for (const x of backup) if (x.kind === "answer") check(canAccessGuideFeature(featureById(x.id), teacher), "الجواب ضمن الصلاحية");

const questions = JSON.parse(fs.readFileSync("tests/fixtures/guide-questions.json", "utf8"));
const score = (rows: any[]) => rows.filter(c => {
  const u = understand(index, c.q, null);
  return c.parts ? c.parts.every((p: string[]) => u.some(x => p.includes(got(x)))) : c.expected.includes(got(u[0]));
}).length;
const ok = score(questions), rate = ok / questions.length;
check(questions.length >= 60, "60 سؤالاً على الأقل");
check(rate >= .9, `الدقة ${(rate * 100).toFixed(1)}٪ دون الحد 90٪`);
if (failed) { console.error(`فشل فهم المرشد: ${failed}`); process.exit(1); }
console.log(`فهم المرشد سليم: ${ok}/${questions.length} (${(rate * 100).toFixed(1)}٪) · ${GUIDE_FEATURES.length} ميزة في البنك.`);
