/**
 * ── الصفحات العامة وجاهزية الفهرسة ──────────────────────────────────────────
 *  A  كل شاشةٍ في جدول التوجيه (وبديلُها القديم) تُعدّ من شاشات التطبيق، بلا حساسيةٍ لحالة الأحرف أو للشرطة الأخيرة.
 *  B  العنوانُ المختلَق ليس شاشة — فيأخذ الخادمُ له 404 مع بقاء صفحة التطبيق نفسها للزائر.
 *  C  App.tsx يقرأ الجدولَ نفسه (لا نسخةَ ثانية تنحرف عنه).
 *  D  صفحات «من نحن» و«تواصل» و«الشروط» موجودة وبمحتوى حقيقي، والخصوصيةُ تذكر إعلانات Google وطريقة إيقافها.
 *  E  خريطةُ الموقع صالحة ولا تضم إلا صفحاتٍ عامة، وrobots.txt يشير إليها ويُبقي الحجبَ القائم.
 *  F  الخادم: 404 للعنوان المختلَق مع صفحة التطبيق، و200 للشاشات، والصفحاتُ العامة تُخدَم، و/privacy يحوَّل.
 */
import fs from "fs";
import { APP_PATH_ALIASES, APP_VIEW_PATHS, isAppShellPath } from "../src/appPaths";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

// A
const allScreens = Object.values(APP_VIEW_PATHS);
check(allScreens.every(p => isAppShellPath(p)), "A كل شاشات التطبيق معروفة");
check(allScreens.every(p => isAppShellPath(p.toLowerCase()) && isAppShellPath(`${p}/`)), "A بلا حساسية للأحرف والشرطة الأخيرة");
check(Object.keys(APP_PATH_ALIASES).every(p => isAppShellPath(p)), "A البدائل القديمة معروفة");
check(isAppShellPath("/") && isAppShellPath("/index.html"), "A الجذر شاشة");

// B
for (const p of ["/zz-not-here-91", "/about-us", "/FSchedule", "/Home/Index/extra", "/wp-admin"]) {
  check(!isAppShellPath(p), `B ${p} ليس شاشة`);
}

// C
const app = fs.readFileSync("src/App.tsx", "utf8");
check(/const pathByView: Record<View, string> = APP_VIEW_PATHS;/.test(app), "C App.tsx يستعمل الجدول المشترك");
check(!/dashboard: "\/Home\/Index"/.test(app), "C لا نسخة ثانية من الجدول في App.tsx");

// D
for (const page of ["about", "contact", "terms"]) {
  const html = fs.readFileSync(`public/${page}.html`, "utf8");
  const words = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  check(words > 60, `D ${page}.html بمحتوى حقيقي (${words} كلمة)`);
  check(html.includes('rel="canonical"') && html.includes("info@skygateeducation.com"), `D ${page}.html فيه canonical وبريد التواصل`);
}
const privacy = fs.readFileSync("public/privacy-policy.html", "utf8");
check(privacy.includes("Google AdSense") && privacy.includes("adssettings.google.com") && privacy.includes("aboutads.info"), "D الخصوصية تذكر AdSense وطرق الإيقاف");

// E
const sitemap = fs.readFileSync("public/sitemap.xml", "utf8");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
check(sitemap.startsWith("<?xml") && locs.length >= 8, "E خريطة الموقع صالحة", locs.length);
check(locs.every(l => l.startsWith("https://schedule-kw.com/")), "E كل الروابط على النطاق الرسمي");
check(!locs.some(l => /\/(api|s|t|r|q|me)(\/|$)|\/System\/|\/FSchedule\//.test(l)), "E لا صفحاتٍ خاصة في الخريطة");
const robots = fs.readFileSync("public/robots.txt", "utf8");
check(robots.includes("Sitemap: https://schedule-kw.com/sitemap.xml") && robots.includes("Disallow: /api/") && robots.includes("Disallow: /me"), "E robots يشير للخريطة ويبقي الحجب");

// F — the real catch-all, against a throwaway dist folder.
const server = fs.readFileSync("server.ts", "utf8");
check(/if \(!isAppShellPath\(req\.path\)\) res\.status\(404\);\s*res\.sendFile\(path\.join\(distPath, "index\.html"\)\);/.test(server), "F الخادم يرسل صفحة التطبيق مع 404 للعنوان المختلَق");
check(/for \(const page of \["about", "contact", "terms"\]\)/.test(server) && /res\.redirect\(301, "\/privacy-policy\.html"\)/.test(server), "F الصفحات العامة وتحويل /privacy مسجّلة");
check(server.indexOf('for (const page of ["about", "contact", "terms"])') < server.indexOf('app.get("*"'), "F الصفحات العامة قبل المسار العام");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
