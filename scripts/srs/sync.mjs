#!/usr/bin/env node
/** يحدّث لقطة مسارات الخادم (docs/srs/endpoints.snapshot.json) بعد أن تُكتب متطلباتُ المسارات الجديدة. */
import fs from "node:fs";
import path from "node:path";
import { SRS_DIR } from "./lib/common.mjs";
import { scanEndpoints, endpointSnapshot } from "./lib/facts.mjs";
const snap = endpointSnapshot(scanEndpoints());
fs.writeFileSync(path.join(SRS_DIR, "endpoints.snapshot.json"), JSON.stringify(snap, null, 1) + "\n");
console.log(`✓ لقطة المسارات: ${snap.count} مساراً.`);
