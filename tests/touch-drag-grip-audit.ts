/**
 * سحبُ البطاقة باللمس على اللوح: مقبضٌ ظاهر على المؤشّر الخشن، وتوقيتُ الضغط الطويل، ومنعُ تمرير الصفحة أثناء السحب فقط.
 * فحصٌ مصدريّ (CSS + خطّاف الفيزياء). التحقق الحيّ (CDP touch على 820×1180) في تقرير العامل W7b.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/styles/05-schedule.css", "utf8");
const hook = fs.readFileSync("src/components/SchedulePhysics/useSchedulePhysics.ts", "utf8");
let passed = 0;
const ok = (value: unknown, label: string) => { assert.ok(value, label); passed += 1; console.log(`  ok  ${label}`); };

const block = css.match(/@media \(pointer:coarse\) and \(min-width:700px\)\{[^@]*?week-drag-handle[\s\S]*?\n\}/);
ok(block, "مقبضُ السحب له قاعدةٌ خاصة بالمؤشّر الخشن من عرض 700px");
ok(block && /display:block/.test(block[0]) && /touch-action:none/.test(block[0]), "المقبض ظاهرٌ (display:block) وبـ touch-action:none");
ok(block && /week-strip-track[^{]*week-drag-handle/.test(block[0]), "يشمل شريطَ الأسبوع الكثيف أيضاً");
ok(/\n\.week-drag-handle\{display:none;touch-action:none\}/.test(css), "الأساس يبقى مخفياً للفأرة");
ok(/setTimeout\(\(\) => activate\(session\), 260\)/.test(hook), "الضغط الطويل 260ms");
ok(/addEventListener\("touchmove", blockTouchScroll, \{ passive: false \}\)/.test(hook) && /removeEventListener\("touchmove", blockTouchScroll/.test(hook), "منعُ تمرير اللمس يُضاف عند التفعيل ويُزال عند الانتهاء");
ok(/if \(session\.active\) finishReturn\("outside"\); else reset\(\)/.test(hook), "pointercancel قبل التفعيل لا يُرسل شيئاً (تمريرٌ حرّ)");
ok(/distance > 12 && session\.longPressTimer/.test(hook), "حركةٌ أكثر من 12px قبل الضغط الطويل تُلغي التسليح فيبقى التمرير");
console.log(`touch-drag-grip-audit: ${passed} passed`);
