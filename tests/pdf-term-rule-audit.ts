/**
 * رفع PDF المعتمد: الفصل المختار لا يقبل إلا الفصل نفسه من السنة السابقة.
 * الثاني 2026/2027 ← الثاني 2025/2026 فقط، وكل ما عداه يُرفض.
 */
import fs from "fs";
import { acceptedPdfSourceLabel, pdfTermAccepted } from "../src/utils/pdfTermRule";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const T = "الفصل الثاني 2026/2027";
const src = (season: "first" | "second" | "summer", a: number) => ({ season, years: [a, a + 1] });

check(pdfTermAccepted(src("second", 2025), T), "الثاني 2025/2026 يُقبل");
check(!pdfTermAccepted(src("second", 2026), T), "الثاني 2026/2027 (الفصل نفسه) يُرفض");
check(pdfTermAccepted(src("first", 2026), T), "الأول 2026/2027 (فصل سنته نفسها) يُقبل في الثاني");
check(!pdfTermAccepted(src("first", 2025), T), "الأول 2025/2026 يُرفض");
check(!pdfTermAccepted(src("summer", 2025), T), "الصيفي 2025/2026 يُرفض");
check(!pdfTermAccepted(src("second", 2024), T), "الثاني 2024/2025 (أقدم) يُرفض");
check(!pdfTermAccepted(src("summer", 2026), T), "الصيفي 2026/2027 يُرفض");
check(!pdfTermAccepted(src("first", 2026), "الفصل الصيفي 2026/2027"), "الصيفي لا يقبل الأول 2026/2027");
check(!pdfTermAccepted(src("second", 2026), "الفصل الصيفي 2026/2027"), "الصيفي لا يقبل الثاني 2026/2027");
check(!pdfTermAccepted(src("first", 2026), "الفصل الأول 2026/2027"), "الأول لا يقبل نفسه");
check(!pdfTermAccepted(src("second", 2027), T), "الثاني 2027/2028 (لاحق) يُرفض");
check(!pdfTermAccepted(src("first", 2027), T), "الأول 2027/2028 (لاحق) يُرفض");
check(pdfTermAccepted(src("first", 2025), "الفصل الأول 2026/2027"), "الأول 2026/2027 يقبل الأول 2025/2026");
check(pdfTermAccepted(src("summer", 2025), "الفصل الصيفي 2026/2027"), "الصيفي 2026/2027 يقبل الصيفي 2025/2026");
check(!pdfTermAccepted(src("second", 2025), "فصل غير مقروء"), "اسم فصل غير مقروء: لا شيء يُقبل");
check(acceptedPdfSourceLabel(T) === "الفصل الثاني 2025/2026 أو الفصل الأول 2026/2027", `نص الفصل المطلوب في الرفض (${acceptedPdfSourceLabel(T)})`);

const server = fs.readFileSync("server.ts", "utf8");
check(!server.includes("sourceIsEarlier"), "الخادم لا يسمح بالفصل الأقدم عموماً");
check((server.match(/pdfTermAccepted\(/g) || []).length === 2, "المسار الرئيسي والاحتياطي يطبّقان القاعدة نفسها");

const ui = fs.readFileSync("src/components/ScheduleTransfer.tsx", "utf8");
check(server.includes("acceptedTerm:acceptedPdfSourceLabel(targetName)"), "الخادم يرسل الفصل المقبول مع رمز الرفض");
check(ui.includes('problem?.code!=="PDF_TERM_MISMATCH"') && ui.includes("transfer-term-card"), "الواجهة تعرض رفض الفصل بطاقةً مصوّرة");

console.log(`\nPDF term rule audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
