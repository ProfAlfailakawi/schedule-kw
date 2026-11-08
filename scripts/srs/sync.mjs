#!/usr/bin/env node
/**
 * يحدّث لقطتي الوثيقة من الكود:
 *  - مسارات الخادم (docs/srs/endpoints.snapshot.json) بعد أن تُكتب متطلباتُ المسارات الجديدة؛
 *  - اللائحة كما تطبّقها src/utils/scheduleRegulations.ts (docs/srs/regulation.snapshot.json).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, SRS_DIR } from "./lib/common.mjs";
import { scanEndpoints, endpointSnapshot } from "./lib/facts.mjs";
const snap = endpointSnapshot(scanEndpoints());
fs.writeFileSync(path.join(SRS_DIR, "endpoints.snapshot.json"), JSON.stringify(snap, null, 1) + "\n");
console.log(`✓ لقطة المسارات: ${snap.count} مساراً.`);

/* اللائحة تُقرأ من شيفرة TypeScript نفسها، فتُشغَّل بـ tsx (من حزم المستودع). */
const tsx = path.join(ROOT, "node_modules/.bin/tsx");
const r = spawnSync(fs.existsSync(tsx) ? tsx : "npx", fs.existsSync(tsx) ? ["scripts/srs/regulation-snapshot.ts"] : ["tsx", "scripts/srs/regulation-snapshot.ts"], { cwd: ROOT, stdio: "inherit" });
if (r.status !== 0) { console.error("✗ تعذّر تحديث لقطة اللائحة"); process.exit(r.status || 1); }
