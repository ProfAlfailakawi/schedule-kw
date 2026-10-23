/**
 * مكتبةُ الأنماط رسماً: كلُّ نمطٍ أسبوعٌ مصغَّر، عمودٌ لكل يوم وارتفاعُه بالدقائق.
 *
 * نصٌّ قليل وأيقونات: الأحد والثلاثاء والخميس بلونٍ (٥٠ دقيقة)، والاثنين والأربعاء بلونٍ آخر
 * (٨٠ دقيقة)، واللقاءُ الممتدّ عمودٌ طويل. تُولَّد هنا نصَّ HTML وCSS واحداً يستعمله مكانان:
 * صفحةُ الأستاذ العامة (بلا React) وشاشةُ الجدول، فلا يتفرّق الشكلُ بينهما.
 *
 * ما يُعرض هو مكتبةُ اللائحة كما هي (`patternLibraryByHours`)؛ وهو للعرض فقط ولا يمنع شيئاً.
 */
import type { DayKey, PatternLibraryEntry } from "./scheduleRegulations";

/** ما يُرسم: المكتبةُ كما هي وأرقامُ اليوم والفاصل (تأتي من `patternLibraryInput`). وحدةُ العرض بلا استيرادِ قيمٍ، فتُحمَّل في صفحات الخادم العامة واختباراتها. */
export interface PatternLibraryInput {
  groups: Array<{ hours: number; patterns: PatternLibraryEntry[] }>;
  shortMinutes: number; longMinutes: number; shortGap: number; longGap: number;
}

const DAY_KEYS: DayKey[] = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];

const DAY_INITIAL: Record<DayKey, string> = { fsunday: "ح", fmonday: "ن", ftuesday: "ث", fwednesday: "ر", fthursday: "خ" };
const DAY_FULL: Record<DayKey, string> = { fsunday: "الأحد", fmonday: "الاثنين", ftuesday: "الثلاثاء", fwednesday: "الأربعاء", fthursday: "الخميس" };
const LONG_DAYS: DayKey[] = ["fmonday", "fwednesday"];
const MAX_MINUTES = 300;
const HOUR_WORDS: Record<number, string> = { 1: "ساعة", 2: "ساعتان", 3: "ساعات", 4: "ساعات", 5: "ساعات" };

const svg = (inner: string) => `<svg class="plib-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
export const PATTERN_LIBRARY_ICON = svg('<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>');
const CLOCK = svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');

const nf = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

export function patternLibraryHtml(input: PatternLibraryInput): string {
  const groups = input.groups.map(group => {
    const cards = group.patterns.map(pattern => {
      const label = `${pattern.days.map(day => DAY_FULL[day]).join("، ")} — ${pattern.minutesPerDay.map(nf).join(" + ")} دقيقة`;
      const week = DAY_KEYS.map(day => {
        const at = pattern.days.indexOf(day);
        if (at < 0) return `<span class="plib-d"><i class="plib-bar is-off"></i><u>${DAY_INITIAL[day]}</u></span>`;
        const minutes = pattern.minutesPerDay[at];
        const height = Math.max(22, Math.round((minutes / MAX_MINUTES) * 100));
        return `<span class="plib-d"><i class="plib-bar ${LONG_DAYS.includes(day) ? "is-long" : "is-short"}" style="height:${height}%"><em>${nf(minutes)}</em></i><u>${DAY_INITIAL[day]}</u></span>`;
      }).join("");
      return `<figure class="plib-pat" role="img" aria-label="${label}" title="${label}"><div class="plib-week">${week}</div><figcaption><b>${nf(pattern.weeklyMinutes)}</b><small>د</small></figcaption></figure>`;
    }).join("");
    return `<div class="plib-group"><h4><b>${nf(group.hours)}</b><small>${HOUR_WORDS[group.hours] || "ساعات"}</small></h4><div class="plib-row">${cards}</div></div>`;
  }).join("");
  return `<section class="plib-sheet" dir="rtl" aria-label="مكتبة الأنماط">`
    + `<header class="plib-head"><span class="plib-mark">${PATTERN_LIBRARY_ICON}</span><div><b>مكتبة الأنماط</b><small>كيف تتوزّع ساعات المقرّر في الأسبوع</small></div></header>`
    + `<div class="plib-key"><span class="is-short"><i></i>${nf(input.shortMinutes)}د<small>ح ث خ</small><em>${CLOCK}${nf(input.shortGap)}د</em></span>`
    + `<span class="is-long"><i></i>${nf(input.longMinutes)}د<small>ن ر</small><em>${CLOCK}${nf(input.longGap)}د</em></span></div>`
    + groups
    + `</section>`;
}

export const PATTERN_LIBRARY_CSS = `
.plib-sheet{--pl-a:var(--accent,#1f6b5c);--pl-b:var(--amber,var(--warn,#a8730a));--pl-ink:var(--ink,#131817);--pl-mut:var(--muted,#5b6660);--pl-line:var(--line,#e3e6e0);--pl-soft:var(--soft,var(--surface-2,#f1f3ee));--pl-card:var(--card,var(--surface,#fff));display:grid;gap:12px;color:var(--pl-ink);font-size:13px;line-height:1.5}
.plib-sheet *{box-sizing:border-box}
.plib-head{display:flex;align-items:center;gap:10px}
.plib-head b{display:block;font-size:15px;line-height:1.3}
.plib-head small{display:block;color:var(--pl-mut);font-size:11.5px}
.plib-mark{flex:none;display:grid;place-items:center;inline-size:34px;block-size:34px;border-radius:11px;background:var(--pl-soft);color:var(--pl-a)}
.plib-i{inline-size:18px;block-size:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.plib-key{display:flex;flex-wrap:wrap;gap:8px}
.plib-key>span{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--pl-line);border-radius:999px;background:var(--pl-card);font-weight:700;font-size:12px}
.plib-key i{inline-size:10px;block-size:10px;border-radius:3px;background:var(--pl-a)}
.plib-key .is-long i{background:var(--pl-b)}
.plib-key small{color:var(--pl-mut);font-weight:600;letter-spacing:.06em}
.plib-key em{display:inline-flex;align-items:center;gap:3px;font-style:normal;color:var(--pl-mut);font-weight:600;font-size:11px}
.plib-key em .plib-i{inline-size:12px;block-size:12px}
.plib-group{display:grid;gap:7px}
.plib-group h4{display:flex;align-items:baseline;gap:5px;margin:0;font-weight:700}
.plib-group h4 b{display:grid;place-items:center;inline-size:26px;block-size:26px;border-radius:9px;background:var(--pl-soft);font-size:14px}
.plib-group h4 small{color:var(--pl-mut);font-size:11.5px;font-weight:600}
.plib-row{display:flex;flex-wrap:wrap;gap:8px}
.plib-pat{margin:0;flex:1 1 104px;max-inline-size:138px;padding:9px 8px 7px;border:1px solid var(--pl-line);border-radius:14px;background:var(--pl-card)}
.plib-week{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;block-size:92px;padding-block-start:14px;align-items:end}
.plib-d{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;block-size:100%;gap:3px;min-inline-size:0}
.plib-bar{position:relative;display:block;inline-size:100%;max-inline-size:20px;border-radius:6px 6px 3px 3px;background:var(--pl-a);margin-block-start:auto}
.plib-bar.is-long{background:var(--pl-b)}
.plib-bar.is-off{block-size:4px;background:var(--pl-line);border-radius:3px}
.plib-bar em{position:absolute;inset-inline:-4px;inset-block-start:-14px;text-align:center;font-style:normal;font-size:9.5px;font-weight:700;color:var(--pl-mut);font-variant-numeric:tabular-nums}
.plib-d u{text-decoration:none;font-size:10px;font-weight:700;color:var(--pl-mut);line-height:1}
.plib-pat figcaption{display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-block-start:7px;color:var(--pl-ink)}
.plib-pat figcaption b{font-size:13px;font-variant-numeric:tabular-nums}
.plib-pat figcaption small{color:var(--pl-mut);font-size:10.5px}
`;
