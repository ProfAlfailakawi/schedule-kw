/**
 * شارة الصحيفة «صحيفة 2026» على المقررات في كل البرنامج: مصدرٌ واحد (/api/plan-badges) يُجلب مرةً ويُشارَك.
 * القاعدة في الخادم: تظهر على مقررات الصحيفة الجديدة وحدها ما دامت لقسمها سابقةٌ جارية؛ بعد «انتهوا» تختفي، وتعود مع صحيفةٍ أحدث.
 */
import { useEffect, useState } from "react";
import { courseTagsOf, courseTagsText, type CourseTagFacts, type RequirementKind } from "./courseTags";

type Badges = Record<number, string>;
let current: Badges = {};
/** مقررات الخدمة: رقم المقرر ← أسماء الأقسام التي تطلبه صحائفها. */
let services: Record<number, string[]> = {};
/** نوعُ المتطلب لكل مقرر («متطلب كلية/جامعة»، «اختياري») — src/utils/courseTags.ts. */
let kinds: Record<number, RequirementKind> = {};
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
      kinds = (data && typeof data.kinds === "object" && data.kinds) || {};
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

/** نوعُ متطلب المقرر (أو null). يُقرأ مع usePlanBadges ليُعاد الرسم بعد الجلب. */
export const requirementKindOf = (courseId: unknown): RequirementKind | null => kinds[Number(courseId)] || null;

/**
 * حقائقُ وسوم المقرر من المصدر الواحد (/api/plan-badges): الصحيفة ونوعُ المتطلب. سجلّاتُ المقرر الواحد
 * (رمزٌ قصير وكامل) تُقرأ معاً: أوّلُ صحيفةٍ وأوّلُ نوع. والوصولُ يضيفه من يعرضه (CourseTags).
 */
export function courseTagFacts(courseIds: readonly unknown[], badges: Badges): CourseTagFacts {
  const ids = courseIds.map(Number).filter(Boolean);
  const kindId = ids.find(id => kinds[id]);
  const service = ids.some(id => serviceDepartmentsOf(id).length > 0);
  return {
    sheet: ids.map(id => badges[id]).find(Boolean) || "",
    /* مقرر الخدمة «متطلب كلية» ولو لم يصل نوعُه (خادمٌ أقدم). */
    kind: kindId ? kinds[kindId] : service ? "college" : null,
    service,
  };
}

/**
 * الوسومُ بجانب المقرر في قوائم اختيار المقرر (إضافة موعد وتعديله، والسريع، والتقارير): كلُّ ما ينطبق
 * بترتيبه الثابت — «صحيفة 2026 · متطلب كلية» (و«🔒 لم نصل بعد» إن مُرّر الوصول). لا يُغيَّر ما في القائمة ولا ترتيبه.
 */
export function courseOptionBadge(courseIds: number[], badges: Badges, extra: Pick<CourseTagFacts, "reachLocked" | "newSheet"> = {}): string | undefined {
  return courseTagsText(courseTagsOf({ ...courseTagFacts(courseIds, badges), reachLocked: extra.reachLocked, newSheet: sheetFallback(badges, extra.newSheet) }));
}

/**
 * «🆕 صحيفة جديدة» احتياطٌ فقط: حين لا تصل شاراتُ الصحيفة أصلاً (صلاحية، أو خادمٌ لم يُجب). ما دامت الشاراتُ
 * واصلةً فهي الحكم — فلا يحمل المقررُ نفسه «صحيفة 2026» في شاشةٍ و«🆕 صحيفة جديدة» في أخرى.
 */
export const sheetFallback = (badges: Badges, newSheet: boolean | undefined): boolean =>
  Boolean(newSheet) && !Object.keys(badges).length;
