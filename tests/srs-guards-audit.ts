/**
 * حارسا الوثيقة باقيان (قرار المالك 2026-11-08: «كل شيء أوتو»):
 *   ١) ملفا PDF الأقدم من المحتوى يوقفان الدمج، لا تنبيهٌ فقط.
 *   ٢) طلب الدمج الذي يغيّر كود البرنامج يغيّر الوثيقة أو يصرّح «[srs: بلا تغيير]».
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string) => { if (ok) { passed++; console.log(`✓ ${name}`); } else { failed++; console.log(`✗ ${name}`); } };
const read = (f: string) => fs.readFileSync(f, "utf8");

const checker = read("scripts/srs/check.mjs");
check(/if \(mf\.hash !== model\.hash\) problems\.push\(/.test(checker) && !/mf\.hash !== model\.hash\) warnings\.push/.test(checker), "G1 ملفا PDF الأقدم من المحتوى يوقفان الدمج");

const ci = read(".github/workflows/ci.yml");
check(/fetch-depth: 2/.test(ci) && /if: github\.event_name == 'pull_request'\s*\n\s*run: node scripts\/srs\/pr-guard\.mjs HEAD\^1/.test(ci), "G2 حارس طلب الدمج يعمل في CI على كل طلب");

const guard = read("scripts/srs/pr-guard.mjs");
check(/\[srs:\\s\*\(بلا تغيير\|no change\)\\s\*\\\]/.test(guard), "G3 التصريح المقبول «[srs: بلا تغيير]» أو «[srs: no change]»");

/* التجربة على الشجرة الحالية: لا فرق عن نفسها، فلا تغيير في كود البرنامج. */
const out = execFileSync("node", ["scripts/srs/pr-guard.mjs", "HEAD", "HEAD"], { encoding: "utf8" });
check(/لا تغيير في كود البرنامج/.test(out), "G4 الحارس يعمل ويقرأ الفرق");

console.log(`\nsrs guards audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
