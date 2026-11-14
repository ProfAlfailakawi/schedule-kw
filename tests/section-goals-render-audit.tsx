/** بطاقات أهداف «نزّل الشعب»: الرسم، الوصول، الأرقام اللاتينية، والربط بالأنماط والحركة المخفّضة. */
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const store = new Map<string, string>();
(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) } };
let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => { if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); } };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  const { GoalCards } = await import("../src/components/SectionBuild");
  const m = (over: any = {}) => ({ placed: 6, pending: 0, notPlaced: 0, needed: 6, reasons: [], rooms: 4, buildings: 2, teacherSpread: 2, gapMinutes: 60, clashes: 0, wishes: null, ...over });
  const goals = [
    { goal: "balanced", metrics: m() }, { goal: "teachers", metrics: m({ teacherSpread: 0 }) },
    { goal: "students", metrics: m({ gapMinutes: 0 }) }, { goal: "rooms", metrics: m({ rooms: 2, buildings: 1, notPlaced: 1, placed: 5, reasons: [{ reason: "لا وقت", count: 1 }] }) },
  ] as any;
  const html = renderToStaticMarkup(<GoalCards goals={goals} value="teachers" onPick={() => {}} />);
  check((html.match(/role="radio"/g) || []).length === 4 && html.includes('role="radiogroup"'), "أربع بطاقات في مجموعة اختيار");
  check((html.match(/aria-checked="true"/g) || []).length === 1 && /is-on[^>]*>/.test(html), "واحدةٌ فقط محدّدة");
  for (const title of ["متوازن", "راحة الأساتذة", "الطلبة أولاً", "قاعات أقل"]) check(html.includes(title), `العنوان «${title}»`);
  check((html.match(/aria-label="الأفضل"/g) || []).length >= 3, "نجمةٌ لأفضل قيمةٍ في كل مقياس");
  check(html.includes("is-bad") && html.includes("لا وقت"), "ما لم يُبنَ يظهر بأيقونةٍ وسببٍ في العنوان");
  check(/--p:83%/.test(html) && /--p:100%/.test(html), "حلقة النسبة من الموضوع/المطلوب");
  check(!/[٠-٩۰-۹]/.test(html), "أرقامٌ لاتينية فقط");
  check(html.includes("data-guide-ignore"), "الأزرار موسومةٌ للدليل");
  check(text(html).length < 260, "نصٌّ قليل", text(html).length);
  const same = renderToStaticMarkup(<GoalCards goals={goals.map((g: any) => ({ ...g, metrics: m() }))} value="balanced" onPick={() => {}} />);
  check(same.includes("sbg-same") && !same.includes("sbg-star"), "تطابق الأهداف: علامة «يساوي» بلا نجوم");
  const css = fs.readFileSync("src/styles/69-section-goals.css", "utf8");
  check(fs.readFileSync("src/index.css", "utf8").includes("69-section-goals.css") && css.includes("prefers-reduced-motion") && css.includes("max-width:560px") && /min-block-size:44px/.test(css), "CSS مسجّل ويحترم الحركة المخفّضة والجوال وهدف اللمس 44");
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
