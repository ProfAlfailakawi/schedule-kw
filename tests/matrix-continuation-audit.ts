/** القاعات × الأوقات: نصُّ المحاضرة يُطبع في أول خانةٍ من تتابعها، وما بعدها تتمّة صامتة. */
import fs from "node:fs";
import { continuationIds } from "../src/utils/matrixRuns";

let failed = 0;
const check = (ok: unknown, label: string) => { if (ok) console.log(`\x1b[32m✓ ${label}\x1b[0m`); else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const cell = (...ids: number[]) => ({ rows: ids.map(id => ({ id })) });
const cont = (cells: any[]) => continuationIds(cells).map(set => [...set].sort().join(","));

check(JSON.stringify(cont([cell(1), cell(1), cell(1)])) === JSON.stringify(["", "1", "1"]), "محاضرة ممتدة: النص في الأولى فقط");
check(JSON.stringify(cont([cell(1), cell(2)])) === JSON.stringify(["", ""]), "محاضرتان متتاليتان مختلفتان: النصان ظاهران");
check(JSON.stringify(cont([cell(1), cell()])) === JSON.stringify(["", ""]), "خانة فارغة بعد المحاضرة لا تُنشئ تتمّة");
check(JSON.stringify(cont([cell(1), cell(), cell(1)])) === JSON.stringify(["", "", ""]), "الفراغ يقطع التتابع فيبدأ النص من جديد");
check(JSON.stringify(cont([cell(1), cell(1, 2), cell(2)])) === JSON.stringify(["", "1", "2"]), "خانة مختلطة: تتمّة الأولى وبداية الثانية");
check(JSON.stringify(cont([cell(1)])) === JSON.stringify([""]), "أول عمود معروض يطبع النص دائماً");
check(JSON.stringify(cont([cell(3), cell(3)]).map(Boolean)) === JSON.stringify([false, true]), "المعرّف نفسه فقط يُعدّ التتابع (الشعبة الأخرى صفٌّ آخر)");

const source = fs.readFileSync("src/components/Reports.tsx", "utf8");
check(source.includes("continuationIds(line.cells)") && source.includes("matrix-slot is-continued"), "شبكة القاعات تستعمل المساعد");
const css = fs.readFileSync("src/styles/06-intelligence.css", "utf8");
check(css.includes(".matrix-table td.is-continued"), "نمط التتمّة موجود");
if (failed) process.exit(1);
