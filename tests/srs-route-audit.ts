/**
 * مسار وثيقة المتطلبات (src/server/srsDoc.ts): المفتاح في الرابط، والمجلد باسم SHA-256 للمفتاح،
 * وما عدا ذلك 404 بلا تلميح، والتخمين يُحجب، والصفحة لا تُفهرَس ولا تُخزَّن.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { registerSrsDocRoutes } from "../src/server/srsDoc";

const key = crypto.randomBytes(32).toString("base64url");
const base = fs.mkdtempSync(path.join(os.tmpdir(), "srs-route-"));
const folder = crypto.createHash("sha256").update(key).digest("hex");
fs.mkdirSync(path.join(base, folder));
fs.writeFileSync(path.join(base, folder, "index.html"), "<!doctype html><title>SRS</title>ok");
fs.writeFileSync(path.join(base, folder, "SRS-ar.pdf"), "%PDF-1.4 test");

/* بلا بناء: المسار مسجَّلٌ (جدول المسارات ثابت في كل بيئة) لكنه يردّ 404 لكل مفتاح. */
const empty = express();
assert.equal(registerSrsDocRoutes(empty, path.join(base, "missing")), 0);
const emptyServer = empty.listen(0);
try {
  const r = await fetch(`http://127.0.0.1:${(emptyServer.address() as { port: number }).port}/srs/${key}/`);
  assert.equal(r.status, 404, "بلا بناء كل مفتاح 404");
} finally { emptyServer.close(); }

const app = express();
assert.equal(registerSrsDocRoutes(app, base), 1);
const server = app.listen(0);
const port = (server.address() as { port: number }).port;
const url = (p: string) => `http://127.0.0.1:${port}${p}`;

try {
  const ok = await fetch(url(`/srs/${key}/`));
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /ok$/);
  assert.match(ok.headers.get("cache-control") || "", /no-store/);
  assert.match(ok.headers.get("x-robots-tag") || "", /noindex/);
  assert.equal(ok.headers.get("referrer-policy"), "no-referrer");
  assert.match(ok.headers.get("content-security-policy") || "", /default-src 'none'/);

  const pdf = await fetch(url(`/srs/${key}/SRS-ar.pdf`));
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type") || "", /pdf/);

  const noSlash = await fetch(url(`/srs/${key}`), { redirect: "manual" });
  assert.equal(noSlash.status, 302);
  assert.equal(noSlash.headers.get("location"), `/srs/${key}/`);

  assert.equal((await fetch(url(`/srs/${key}/`), { method: "POST" })).status, 405);
  assert.equal((await fetch(url(`/srs/${key}/../../etc/passwd`))).status, 404);
  assert.equal((await fetch(url(`/srs/${key}/nothing.html`))).status, 404);
  assert.equal((await fetch(url(`/srs/short/`))).status, 404);

  /* عشرة أخطاء ثم يُحجب العنوان حتى لو جاء بالمفتاح الصحيح. */
  let blockedAt = 0;
  for (let i = 1; i <= 15; i++) {
    const r = await fetch(url(`/srs/${crypto.randomBytes(32).toString("base64url")}/`));
    if (r.status === 429) { blockedAt = i; break; }
    assert.equal(r.status, 404);
  }
  assert.ok(blockedAt > 0 && blockedAt <= 12, `التخمين يجب أن يُحجب (حُجب عند ${blockedAt})`);
  assert.equal((await fetch(url(`/srs/${key}/`))).status, 429);
  console.log("✓ مسار وثيقة المتطلبات: المفتاح الصحيح يُقدَّم، والخطأ 404، والتخمين يُحجب، ولا فهرسة ولا تخزين.");
} finally {
  server.close();
  fs.rmSync(base, { recursive: true, force: true });
}
