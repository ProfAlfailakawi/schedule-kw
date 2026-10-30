/**
 * وجهُ الزميل: حرفُه الأول ولونُه الثابت — واحدٌ في التنبيه وشارة الحضور وقائمتها، لكل الفرق.
 * ستُّ درجاتٍ للأشخاص كما في حضور اللوح (05-schedule.css › data-presence): لا أحمر — الأحمرُ للتعارض.
 */
const HUES = [200, 262, 38, 96, 288, 178];

export const hueOf = (seed: string) => {
  let hash = 0;
  for (const ch of String(seed || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[hash % HUES.length];
};

/** الحرفُ الأول من الاسم بعد اللقب: «د. منى» و«أ.د. منى» ← «م». */
export const initialOf = (name: string) => {
  const bare = String(name || "").replace(/^(?:\s*[أاإدم]\s*\.)+\s*/u, "").trim();
  return Array.from(bare || String(name || "؟"))[0] || "؟";
};
