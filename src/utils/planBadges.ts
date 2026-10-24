/**
 * شارة الصحيفة «صحيفة 2026» على المقررات في كل البرنامج: مصدرٌ واحد (/api/plan-badges) يُجلب مرةً ويُشارَك.
 * القاعدة في الخادم: تظهر على مقررات الصحيفة الجديدة وحدها ما دامت لقسمها سابقةٌ جارية؛ بعد «انتهوا» تختفي، وتعود مع صحيفةٍ أحدث.
 */
import { useEffect, useState } from "react";

type Badges = Record<number, string>;
let current: Badges = {};
/** مقررات الخدمة: رقم المقرر ← أسماء الأقسام التي تطلبه صحائفها. */
let services: Record<number, string[]> = {};
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<(badges: Badges) => void>();

async function load(fresh = false): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await fetch(`/api/plan-badges${fresh ? "?fresh=1" : ""}`, { credentials: "include" });
      if (!response.ok) return;
      const data = await response.json().catch(() => ({} as any));
      current = (data && typeof data.badges === "object" && data.badges) || {};
      services = (data && typeof data.services === "object" && data.services) || {};
      loaded = true;
      listeners.forEach(listener => listener(current));
    } catch { /* الشارة زينة: غيابُها لا يكسر شاشة */ }
    finally { inflight = null; }
  })();
  return inflight;
}

if (typeof window !== "undefined") {
  /* بعد تغيير صحائف (رفع، «انتهوا»، اعتماد) تُجلب الشارات من جديد بلا ذاكرة. */
  window.addEventListener("schedule:plan-review-updated", () => { void load(true); });
}

/** شارة مقرر (إن كان له)، وتُجلب مرةً عند أول استعمال. */
export function usePlanBadges(): Badges {
  const [badges, setBadges] = useState<Badges>(current);
  useEffect(() => {
    listeners.add(setBadges);
    if (!loaded) void load();
    else setBadges(current);
    return () => { listeners.delete(setBadges); };
  }, []);
  return badges;
}

export const planBadgeOf = (badges: Badges, courseId: unknown): string => badges[Number(courseId)] || "";

/** الأقسام التي تطلب المقرر خدمةً (فارغ إن لم يكن مقرر خدمة). يُقرأ مع usePlanBadges ليُعاد الرسم بعد الجلب. */
export const serviceDepartmentsOf = (courseId: unknown): string[] => services[Number(courseId)] || [];

/**
 * الشارةُ بجانب المقرر في قوائم اختيار المقرر (إضافة موعد وتعديله): شارةُ الصحيفة إن وُجدت، ومعها «متطلب كلية» لمقرر
 * تطلبه صحائفُ أقسامٍ أخرى. لا يُغيَّر ما يظهر في القائمة ولا ترتيبه: وسمٌ بجانب الاسم فقط.
 */
export function courseOptionBadge(courseIds: number[], badges: Badges): string | undefined {
  const plan = courseIds.map(id => badges[Number(id)]).find(Boolean) || "";
  const required = courseIds.some(id => serviceDepartmentsOf(id).length > 0) ? "متطلب كلية" : "";
  return [plan, required].filter(Boolean).join(" · ") || undefined;
}
