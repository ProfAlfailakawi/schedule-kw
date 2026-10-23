/**
 * جمالُ «مساري» المقيس: التباينُ بالحساب لا بالنظر، وحدُّ الخط، والوضعُ الداكن بالأسماء نفسها.
 * WCAG 2.1: نصٌّ عاديّ ٤٫٥ : ١، وكبيرٌ (≥ ١٨٫٦٦px عريضاً أو ≥ ٢٤px) ٣ : ١.
 */
import assert from "node:assert/strict";
import { PUBLIC_DARK_VARS, PUBLIC_LIGHT_VARS } from "../src/server/publicTheme";
import { STUDENT_HOME_CSS, studentHomePage } from "../src/server/studentHomePage";
import { STUDENT_MAP_CSS } from "../src/server/studentMapUi";

let passed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => { if (!ok) console.log("✗ " + label, extra ?? ""); assert.ok(ok, label); passed++; console.log("✓ " + label); };

const vars = (s: string) => Object.fromEntries(s.split(";").filter(p => p.startsWith("--")).map(p => { const i = p.indexOf(":"); return [p.slice(0, i), p.slice(i + 1)]; })) as Record<string, string>;
const light = { ...vars(PUBLIC_LIGHT_VARS), "--gold": "#85601f", "--gold-soft": "#f3ead9", "--ok": "#25684a", "--ok-soft": "#dfeee6", "--note-ink": "#6b4a14" };
const dark = { ...vars(PUBLIC_DARK_VARS), "--gold-soft": "#2c2415", "--ok": "#6fd0a0", "--ok-soft": "#14291f", "--note-ink": "#ecd9ae" };

const rgb = (hex: string): [number, number, number] => { const h = hex.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]; };
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex: string) => { const [r, g, b] = rgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* ١. الأسماء نفسها في النهاري والداكن، فلا قاعدةَ تبقى بلا لونٍ في أحدهما */
const keysL = Object.keys(vars(PUBLIC_LIGHT_VARS)).sort().join(), keysD = Object.keys(vars(PUBLIC_DARK_VARS)).sort().join();
check(STUDENT_HOME_CSS.includes("--gold:#85601f"), "الذهبي في الصفحة هو الذي يُقاس هنا");
check(keysL === keysD, "الداكن يعرّف الرموز نفسها التي يعرّفها النهاري", { keysL, keysD });
check(/@media \(prefers-color-scheme:dark\)\{:root\{color-scheme:dark/.test(STUDENT_HOME_CSS), "الصفحة تتبع نظام الجهاز في الوضع الداكن");
const html = studentHomePage("n");
check(/theme-color" content="#0f1513" media="\(prefers-color-scheme: dark\)"/.test(html), "شريط المتصفح يتبدّل مع الوضع");

/* ٢. تباينُ كل زوجِ نصٍّ وخلفيته في الوضعين */
const pairs: Array<[string, string, string, number]> = [
  ["--ink", "--card", "النص الأساسي على البطاقة", 4.5], ["--ink", "--bg", "النص الأساسي على الصفحة", 4.5],
  ["--muted", "--card", "النص الثانوي على البطاقة", 4.5], ["--muted", "--bg", "النص الثانوي على الصفحة", 4.5], ["--muted", "--soft", "النص الثانوي على الرمادي", 4.5],
  ["--dim", "--card", "النص الباهت على البطاقة", 4.5],
  ["--accent", "--card", "الأخضر نصاً على البطاقة", 4.5], ["--accent", "--accent-soft", "الأخضر على خلفيته الخفيفة", 4.5],
  ["--on-accent", "--accent", "نص الزر على الأخضر", 4.5],
  ["--bad", "--bad-soft", "الخطأ على خلفيته", 4.5], ["--on-accent", "--bad", "نص الزر الأحمر", 4.5],
  ["--gold", "--gold-soft", "الذهبي على خلفيته", 4.5], ["--note-ink", "--gold-soft", "نص التنبيه", 4.5],
  ["--ok", "--ok-soft", "الأخضر الداكن على خلفيته", 4.5], ["--on-accent", "--ok", "نص زر «سجّلت»", 4.5],
  ["--brass", "--bg", "ذهبيّ الشارة على الصفحة", 3],
];
for (const [name, theme] of [["النهاري", light], ["الداكن", dark]] as const) {
  for (const [fg, bg, what, min] of pairs) {
    const r = ratio(theme[fg], theme[bg]);
    check(r >= min, `${name}: ${what} ${r.toFixed(2)} ≥ ${min}`, { fg: theme[fg], bg: theme[bg] });
  }
}

/* ٣. النصُّ الأبيض الشفاف فوق بطاقتَي «أين أنا» الخضراوين: يُقاس عند أفتح نقطةٍ فعليةٍ في تدرّج كلٍّ منهما */
const blend = (alpha: number, bgHex: string) => { const [r, g, b] = rgb(bgHex); const m = (c: number) => Math.round(255 * alpha + c * (1 - alpha)); return "#" + [m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, "0")).join(""); };
const css = STUDENT_HOME_CSS + STUDENT_MAP_CSS;
const lightestStop = (rule: RegExp) => {
  const body = css.match(rule)?.[0] || "";
  const stops = [...(body.match(/background:[^;}]*/)?.[0] || "").matchAll(/#[0-9a-fA-F]{6}\b/g)].map(x => x[0]);
  assert.ok(stops.length >= 2, "تُستخرج نقاط التدرّج من القاعدة: " + rule);
  return stops.sort((a, b) => lum(b) - lum(a))[0];
};
const heroStop = lightestStop(/\.hero\{[^}]*\}/), mapStop = lightestStop(/\.km-hero\{[^}]*\}/);
check(ratio("#ffffff", heroStop) >= 4.5 && ratio("#ffffff", mapStop) >= 4.5, `الأبيض الكامل يبلغ ٤٫٥ عند أفتح نقطتين (${heroStop} · ${mapStop})`);
const alphas = [...css.matchAll(/(?<![-\w])color:rgba\(255,255,255,(\.?\d+(?:\.\d+)?)\)/g)].map(m => Number(m[1]));
check(alphas.length > 0 && alphas.every(a => ratio(blend(a, heroStop), heroStop) >= 4.5), "كل نصٍّ أبيض شفاف فوق بطاقة الصفحة الخضراء يبلغ ٤٫٥ : ١ عند أفتح نقطة", alphas);
const opac = [...STUDENT_MAP_CSS.matchAll(/\.km-(?:ring span|who small|who span|stats small)\{[^}]*?opacity:(\.\d+)/g)].map(m => Number(m[1])).filter(a => a < 0.95);
check(opac.length > 0 && opac.every(a => ratio(blend(a, mapStop), mapStop) >= 4.5), "شفافية نصوص بطاقة الخريطة الخضراء تبلغ ٤٫٥ : ١ عند أفتح نقطةٍ فعلية في تدرّجها", opac);

/* ٤. حدُّ الخط: لا نصَّ تحت ١٢px إلا شبكة الأسبوع (١١px لضيق خلاياها) — يشمل `font-size` والاختصار `font:` */
const small: string[] = [];
for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const sel = m[1].trim();
  const sizes = [...m[2].matchAll(/(?<![-\w])font-size:(\d+(?:\.\d+)?)px/g)].map(f => Number(f[1]))
    .concat([...m[2].matchAll(/(?<![-\w])font:[^;]*?(\d+(?:\.\d+)?)px/g)].map(f => Number(f[1])));
  for (const px of sizes) if (px < 11 || (px < 12 && !/\.wk-/.test(sel))) small.push(`${sel.slice(-40)} ${px}px`);
}
check(small.length === 0, "لا خطَّ أصغر من ١٢px خارج شبكة الأسبوع، ولا أصغر من ١١px فيها (يشمل اختصار font)", small);

/* ٤ب. الشريطُ السفلي في الخريطة على سطحٍ داكنٍ ثابتٍ في الوضعين: لا `--ink` (يصير فاتحاً ليلاً) تحت نصٍّ أبيض */
const kbar = css.match(/\.kbar\{position:fixed[^}]*\}/)?.[0] || "";
check(/background:var\(--bar\)/.test(kbar) && !/background:var\(--ink\)/.test(kbar), "شريط التخطيط على --bar لا --ink");
check(ratio("#ffffff", "#131817") >= 4.5 && ratio("#ffffff", "#0a0f0d") >= 4.5, "النص الأبيض على --bar في الوضعين");

/* ٥. لا لونَ أبيضَ ثابتاً فوق تعبئةٍ يتبدّل لونُها مع الوضع */
const solid = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(m => /background:var\(--(accent|ok|bad)\)/.test(m[2]) && /(?<![-\w])color:#fff/.test(m[2])).map(m => m[1].trim().slice(-50));
check(solid.length === 0, "النص فوق تعبئة الأخضر/الأحمر يستعمل --on-accent لا الأبيض الثابت", solid);

console.log(`\n${passed} passed, 0 failed`);
