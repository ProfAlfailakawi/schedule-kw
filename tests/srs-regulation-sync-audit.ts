/**
 * لقطةُ اللائحة في الوثيقة (docs/srs/regulation.snapshot.json) هي ما يطبّقه الكود الآن حرفاً:
 * تُعاد في الذاكرة من src/utils/scheduleRegulations.ts وتُقارن بالملف. فإن تغيّر طولٌ أو سُلّمٌ أو
 * نمطٌ أو سقفٌ أو شدّةُ بندٍ أو أثرُه على الاعتماد فشل هذا الاختبار حتى يُشغَّل npm run srs:sync.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SNAPSHOT_FILE, declaredRules, regulationSnapshot, snapshotText } from "../scripts/srs/regulation-snapshot";

const file = path.resolve(SNAPSHOT_FILE);
assert.ok(fs.existsSync(file), `لا ${SNAPSHOT_FILE} — شغّل npm run srs:sync`);
const onDisk = fs.readFileSync(file, "utf8");
const fresh = snapshotText();
if (onDisk !== fresh) {
  const a = JSON.parse(onDisk), b = JSON.parse(fresh);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  assert.fail(`لقطة اللائحة في الوثيقة تأخّرت عن الكود (${keys.join("، ")}). شغّل npm run srs:sync ثم راجع docs/srs/regulation.json.`);
}

/* اللقطةُ نفسها سليمة: كلُّ بندٍ يكتبه reviewSchedule موصوف، والمكتبةُ تغطي الساعات 1–5. */
const snap = regulationSnapshot();
assert.deepEqual(new Set(snap.findings.map(f => f.rule)), new Set(declaredRules()), "كل بند في reviewSchedule له مدخل في اللقطة");
assert.deepEqual(snap.library.map(g => g.hours), [1, 2, 3, 4, 5]);
for (const group of snap.library) for (const p of group.patterns) assert.equal(p.days.length, p.minutesPerDay.length, `${p.id}: يومٌ لكل طول`);
assert.equal(snap.days.length, 5);
for (const day of snap.days) assert.equal(day.firstStart, "08:00", `${day.key}: أول بداية`);

/* والسردُ يصف كل بند وكل نمطٍ في اللقطة، ولا يصف ما ليس فيها. */
const narrative = JSON.parse(fs.readFileSync(path.resolve("docs/srs/regulation.json"), "utf8"));
const described = new Set((narrative.checks?.review || []).map((c: { rule: string }) => c.rule));
assert.deepEqual(described, new Set(snap.findings.map(f => f.rule)), "docs/srs/regulation.json يصف بنود المراجعة كلها");
console.log(`✓ لقطة اللائحة مطابقة للكود: ${snap.library.reduce((n, g) => n + g.patterns.length, 0)} نمطاً، ${snap.findings.length} بنود، ${snap.days.length} أيام.`);
