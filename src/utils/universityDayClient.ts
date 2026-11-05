/**
 * الدوام الشامل في المتصفح: آخرُ قيمةٍ محفوظة تُطبَّق قبل أول رسم، ثم يُسأل الخادم.
 * فإن تغيّرت القيمة نادى `onChange`؛ والخادمُ يبقى الحكم عند الحفظ.
 */
import { applyUniversityDay, type UniversityDay } from "./scheduleTime";

const KEY = "universityDay:v1";

export function primeUniversityDay(): void {
  try { const saved = localStorage.getItem(KEY); if (saved) applyUniversityDay(JSON.parse(saved) as UniversityDay); } catch { /* ذاكرةٌ محجوبة: يبقى الافتراضي حتى يجيب الخادم */ }
}

export function adoptUniversityDay(day: UniversityDay): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(day)); } catch { /* لا شيء يضيع */ }
  return applyUniversityDay(day);
}

export async function syncUniversityDay(onChange: () => void): Promise<void> {
  try {
    const response = await fetch("/api/university-day", { cache: "no-store" });
    if (!response.ok) return;
    if (adoptUniversityDay(await response.json() as UniversityDay)) onChange();
  } catch { /* بلا شبكة: تبقى آخر قيمة، والخادمُ يرفض ما خرج عنها */ }
}
