/**
 * ── مخالفةُ اللائحة كما يراها الأستاذ: أيقونةٌ وعبارةٌ قصيرة (ملاحظة المالك: «أيقونات وكلام قليل») ──
 *
 * سطرُ pinIssueLine كاملاً («مدة الموعد 75د لا توافق النمط المعتمد (اثنين·أربعاء · 110د): النهاية 11:20. (م.7/8)»)
 * صحيحٌ للقسم، ويبقى للأستاذ تحت الضغط. أما الصفُّ نفسُه فعبارةٌ من كلماتٍ قليلة بحسب القاعدة.
 * نقيّةٌ تقرؤها الصفحةُ والاختبار.
 */
import type { PinIssue } from "./pinViolations";

export interface PinShort { icon: string; short: string }

/** «مدة الموعد 75د … · 110د)» ← أقصر أو أطول من النمط؛ وإلا «المدة لا توافق النمط». */
function lengthWord(text: string): string {
  const own = /مدة الموعد\s*(\d+)\s*د/.exec(text);
  const want = /·\s*(\d+)\s*د\)/.exec(text);
  if (own && want) {
    const a = Number(own[1]), b = Number(want[1]);
    if (a < b) return "المدة أقصر من المقرر";
    if (a > b) return "المدة أطول من المقرر";
  }
  return "المدة لا توافق النمط";
}

export function pinIssueShort(issue: Pick<PinIssue, "rule" | "text">): PinShort {
  const text = String(issue.text || "");
  switch (issue.rule) {
    case "pattern": return { icon: "cal", short: "الأيام خارج النمط" };
    case "pattern-length": return { icon: "clock", short: lengthWord(text) };
    case "course-hours": return /تزيد/.test(text) ? { icon: "scale", short: "ساعات أكثر من المقرر" } : { icon: "scale", short: "ساعات أقل من المقرر" };
    case "start-ladder": return { icon: "sunrise", short: "البداية خارج السُّلّم" };
    case "fixed-start": return { icon: "lock", short: "وقت الشعبة الثابت" };
    case "consecutive-long":
    case "consecutive-one-hour": return { icon: "layers", short: "محاضرات متتالية كثيرة" };
    default: return { icon: "alert", short: "يحتاج تعديلاً" };
  }
}
