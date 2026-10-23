/**
 * «منتدب» في النصّ: للأماكن التي لا تحمل مكوّناً (قوائم منسدلة، جُمل، عناوين، تقويم، Excel،
 * ونصوص الخادم). ملفٌّ خالصٌ بلا React ليُستورد من الخادم والواجهة معاً بلا جرّ مكوّنٍ إلى الخادم.
 */
export const VISITING_SUFFIX = " · منتدب";
export const withVisitingSuffix = (name: string, visiting: boolean) => (visiting ? `${name}${VISITING_SUFFIX}` : name);
