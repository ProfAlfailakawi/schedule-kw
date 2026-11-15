/**
 * ── تسليمُ الدخول من Safari إلى التطبيق الرسمي ───────────────────────────────
 *  H1  بلا جلسة ← يعود إلى التطبيق بـerror=no-session؛ وChallenge فاسد ← bad-request.
 *  H2  بجلسة ← رمزٌ في schedulekw://handoff، والرمز يُبدَّل بجلسةٍ جديدة (كوكي HttpOnly) مرةً واحدة.
 *  H3  verifier خاطئ ← يُرفض ولا يُستهلك الرمز؛ وإعادة الاستعمال تُرفض؛ والمنتهي يُرفض.
 *  H4  من لم يغيّر كلمته الأولى لا تُسلَّم جلسته؛ وعضوُ الفريق تنتقل صفتُه (memberId).
 *  H5  الواجهة: الدعوة في Dashboard مرةً، وInstallApp تُخفى على أجهزة آبل، وSW لا يعترض المسار.
 */
import fs from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { Repository } from "../src/db/repository";
import { registerAppHandoffRoutes } from "../src/server/appHandoff";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const verifier = () => randomBytes(32).toString("base64url");
const challengeOf = (v: string) => createHash("sha256").update(v).digest("base64url");

async function main() {
  const app = express();
  registerAppHandoffRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = (path: string, cookie = "") => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
  const location = (res: Response) => res.headers.get("location") || "";
  const codeOf = (res: Response) => new URL(location(res).replace("schedulekw://", "http://x/")).searchParams.get("code") || "";

  const v1 = verifier();
  let res = await get(`/app-handoff/start?challenge=${challengeOf(v1)}`);
  check(res.status === 302 && location(res) === "schedulekw://handoff?error=no-session", "H1 بلا جلسة ← no-session", location(res));
  res = await get("/app-handoff/start?challenge=bad", "session_id=sess_x");
  check(location(res) === "schedulekw://handoff?error=bad-request", "H1 challenge فاسد ← bad-request");

  await Repository.createSession("sess_owner", 7, 60_000);
  res = await get(`/app-handoff/start?challenge=${challengeOf(v1)}`, "session_id=sess_owner");
  const code = codeOf(res);
  check(/^[A-Za-z0-9_-]{43}$/.test(code) && location(res).startsWith("schedulekw://handoff?code="), "H2 جلسة ← رمزٌ في مخطط التطبيق", location(res));

  res = await get(`/app-handoff/redeem?code=${code}&verifier=${verifier()}`);
  check(location(res) === "/?handoff=expired", "H3 verifier خاطئ يُرفض", location(res));
  res = await get(`/app-handoff/redeem?code=${code}&verifier=${v1}`);
  const cookie = res.headers.get("set-cookie") || "";
  const sid = /session_id=(sess_[a-f0-9]+)/.exec(cookie)?.[1] || "";
  check(res.status === 302 && location(res) === "/" && /HttpOnly/.test(cookie) && !!sid, "H2 يُبدَّل بجلسةٍ جديدة HttpOnly", { cookie, loc: location(res) });
  check(sid !== "sess_owner" && (await Repository.getSession(sid))?.userId === 7, "H2 الجلسة الجديدة لنفس الحساب وبمعرّفٍ جديد");
  res = await get(`/app-handoff/redeem?code=${code}&verifier=${v1}`);
  check(location(res) === "/?handoff=expired" && !res.headers.get("set-cookie"), "H3 إعادة الاستعمال تُرفض");

  const v2 = verifier();
  res = await get(`/app-handoff/start?challenge=${challengeOf(v2)}`, "session_id=sess_owner");
  const old = codeOf(res);
  await Repository.updateFeatureDoc<any, string>("appHandoffs", old, row => ({ next: { ...row, expiresAt: Date.now() - 1 }, result: "x" }));
  res = await get(`/app-handoff/redeem?code=${old}&verifier=${v2}`);
  check(location(res) === "/?handoff=expired", "H3 المنتهي يُرفض");

  await Repository.createSession("sess_fresh", 8, 60_000, { initialPassMark: "m1" });
  res = await get(`/app-handoff/start?challenge=${challengeOf(v1)}`, "session_id=sess_fresh");
  check(location(res) === "schedulekw://handoff?error=password-first", "H4 كلمةٌ أولى لم تُغيَّر ← password-first");

  await Repository.createSession("sess_member", 9, 60_000, { memberId: "m-42" });
  const v3 = verifier();
  res = await get(`/app-handoff/start?challenge=${challengeOf(v3)}`, "session_id=sess_member");
  res = await get(`/app-handoff/redeem?code=${codeOf(res)}&verifier=${v3}`);
  const msid = /session_id=(sess_[a-f0-9]+)/.exec(res.headers.get("set-cookie") || "")?.[1] || "";
  check((await Repository.getSession(msid))?.memberId === "m-42", "H4 عضو الفريق تنتقل صفتُه");
  server.close();

  const read = (f: string) => fs.readFileSync(f, "utf8");
  check(/<GetAppSheet\s*\/>/.test(read("src/components/Dashboard.tsx")), "H5 الدعوة في Dashboard");
  check(/isAppleBrowser\(\)\) return null/.test(read("src/components/InstallApp.tsx")), "H5 InstallApp تُخفى على آبل");
  check(/startsWith\("\/app-handoff\/"\)/.test(read("public/sw.js")), "H5 SW لا يعترض /app-handoff/");
  check(/<AppHandoffEntry\s*\/>/.test(read("src/components/Login.tsx")), "H5 «ادخل بحسابك» في الدخول");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
