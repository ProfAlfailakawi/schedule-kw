/**
 * «منتدب» في النصّ: للأماكن التي لا تحمل مكوّناً (قوائم منسدلة، جُمل، عناوين، تقويم، Excel،
 * ونصوص الخادم). ملفٌّ خالصٌ بلا React ليُستورد من الخادم والواجهة معاً بلا جرّ مكوّنٍ إلى الخادم.
 */
export const VISITING_SUFFIX = " · منتدب";
export const withVisitingSuffix = (name: string, visiting: boolean) => (visiting ? `${name}${VISITING_SUFFIX}` : name);

/** وسمُ المتدرّب (مرحلة التدريب 🎓 — linkMode "ta") بعد «منتدب»، بالترتيب نفسه في الشارات (PersonChips). */
export const TRAINEE_LABEL = "🎓 تدريب";
export const TRAINEE_SUFFIX = ` · ${TRAINEE_LABEL}`;
/** الاسم ← «منتدب» ← «🎓 تدريب» نصّاً، لما لا يحمل مكوّناً (القوائم المنسدلة الأصلية). */
export const withPersonSuffix = (name: string, visiting: boolean, trainee = false) =>
  `${withVisitingSuffix(name, visiting)}${trainee ? TRAINEE_SUFFIX : ""}`;
