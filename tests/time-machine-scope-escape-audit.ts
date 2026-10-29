/**
 * ── آلة الزمن: لا لوحةَ قسمٍ سابق بعد تبديل النطاق، وEscape للورقة العليا وحدها ──
 *
 * ١) بعد تبديل الكلية أو القسم كانت `useTimeMachineContext` تُبقي سياقَ القسم
 *    السابق حتى يصل الجديد، فتبقى منضدتُه و«اعتمد» فعّالتين تحت رأس القسم
 *    الجديد — وعلى اتصالٍ بطيء قد يُعتمد تغييرٌ على قسمٍ غير المقصود. السياقُ
 *    الآن يحمل مفتاحَ نطاقه، ولا يُعاد إلا لنطاقه.
 * ٢) داخل «أدوات البيانات» (حوارٌ يسمع Escape) كانت ورقةُ «قبل الاعتماد» تُغلق
 *    الحوارَ كله فتضيع سلّة المحاكاة: الحوار الأب سجّل مستمعه أولاً فسمع أولاً.
 *    الآن يجيب Escape أعلى حوارٍ مفتوح وحده.
 */
import fs from "node:fs";
import { contextForScope, timeMachineScopeKey } from "../src/utils/timeMachineScope";
import { listenForDialogDismiss, openDialogDismissCount } from "../src/components/ui";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra) : ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

console.log("١) السياق لنطاقه وحده");
{
  const oldKey = timeMachineScopeKey({ collegeId: 1, sectionId: 1, termId: 1 });
  const newKey = timeMachineScopeKey({ collegeId: 1, sectionId: 2, termId: 1 });
  const loaded = { key: oldKey, context: { scope: { sectionId: 1 } } };
  check(contextForScope(loaded, oldKey) === loaded.context, "السياق يُعاد لنطاقه (إعادة القراءة لا تُخفي اللوحة)");
  check(contextForScope(loaded, newKey) === null, "بعد تبديل القسم: لا سياقَ حتى يصل سياقُ القسم الجديد (انتظار، لا منضدة)");
  check(contextForScope(null, oldKey) === null, "لا سياق قبل أول قراءة");
  check(timeMachineScopeKey({ collegeId: 2, sectionId: 1 }) !== oldKey, "تبديل الكلية وحده يغيّر المفتاح");
  const hook = read("src/components/timeMachineShared.tsx");
  check(hook.includes("setLoaded({ key, context: body })") && hook.includes("context: contextForScope<LoadedContext>(loaded, key)"), "الخطّاف يحفظ مفتاح النطاق مع السياق ويُعيده عبر contextForScope");
  const page = read("src/components/TimeMachine.tsx");
  check(page.includes(": !context ? <Loading />"), "الصفحة تعرض الانتظار حين لا سياق للنطاق المختار");
}

console.log("٢) Escape لأعلى حوارٍ مفتوح");
{
  const target = new EventTarget() as any;
  const escape = () => {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "key", { value: "Escape" });
    target.dispatchEvent(event);
    return event;
  };
  const closed: string[] = [];
  const base = openDialogDismissCount();
  const stopParent = listenForDialogDismiss({ current: () => closed.push("data-tools") }, target);
  const stopChild = listenForDialogDismiss({ current: () => closed.push("confirm") }, target);
  check(openDialogDismissCount() === base + 2, "حواران مفتوحان مسجّلان");
  const first = escape();
  check(closed.join(",") === "confirm", "Escape الأول يغلق ورقة «قبل الاعتماد» وحدها، لا أدوات البيانات", closed);
  check(first.defaultPrevented, "والحدث يُستهلك");
  stopChild();
  escape();
  check(closed.join(",") === "confirm,data-tools", "بعد إغلاق الورقة يغلق Escape التالي الحوارَ الأب", closed);
  stopParent();
  check(openDialogDismissCount() === base, "لا يبقى مستمعٌ بعد الإغلاق");
  const other = new Event("keydown", { cancelable: true });
  Object.defineProperty(other, "key", { value: "Enter" });
  const stop = listenForDialogDismiss({ current: () => closed.push("wrong") }, target);
  target.dispatchEvent(other);
  stop();
  check(!closed.includes("wrong"), "مفتاحٌ غير Escape لا يغلق شيئاً");
  const transfer = read("src/components/ScheduleTransfer.tsx"), bench = read("src/components/ScenarioWorkbench.tsx");
  check(transfer.includes("useDialogDismiss(true, onClose)") && bench.includes("useDialogDismiss(true, onCancel)"), "الحواران المتداخلان كلاهما على الخطّاف نفسه");
}

console.log(`\ntime machine scope & escape: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
