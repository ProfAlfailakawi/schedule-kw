const BASE = process.env.BASE || "http://127.0.0.1:3471";
let cookie = "";
const call = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", cookie, ...(init.headers || {}) } });
  const set = r.headers.getSetCookie?.() || [];
  if (set.length) cookie = [cookie, ...set.map(s => s.split(";")[0])].filter(Boolean).join("; ");
  try { return await r.json(); } catch { return null; }
};
(async () => {
  await call("/api/auth/demo", { method: "POST", body: "{}" });
  for (let i = 0; i < 200; i++) { const s = await call("/api/demo/seed-status"); if (s?.status === "ready") break; await new Promise(r => setTimeout(r, 500)); }
  await call("/api/demo/role", { method: "POST", body: JSON.stringify({ role: "admin" }) });
  const badges = await call("/api/plan-badges?fresh=1");
  const offering = await call("/api/course-offering?collegeId=1&sectionId=1&termId=1");
  const reach = await call("/api/course-reach?collegeId=1&sectionId=1&termId=1");
  const status = await call("/api/plan-review/status");
  console.log("plans", JSON.stringify((status.sections || []).filter((s: any) => s.sectionId === 1).map((s: any) => s.plans?.map((p: any) => [p.id, p.status, p.name, p.track]))));
  console.log("reach sheets", JSON.stringify((reach?.sheets || []).map((s: any) => [s.kind, s.name, s.courseIds.length])));
  const courses = (offering?.courses || []) as any[];
  console.log("order", courses.map((c: any) => c.code).join(" "));
  const sides = offering?.sides || {};
  const mism = courses.filter((c: any) => Boolean(badges.badges?.[c.id]) !== (sides[c.id] === "new"));
  console.log("sides", JSON.stringify(Object.entries(sides).reduce((a: any, [k, v]) => { a[v as string] = (a[v as string] || 0) + 1; return a; }, {})), "mismatch", mism.map((c: any) => c.code + ":" + (badges.badges?.[c.id] || "-") + ":" + sides[c.id]).join(" "));
  const all = await call("/api/courses?sectionId=1&plans=1");
  console.log("courses?plans sides", (all || []).filter((c: any) => c.sheetSide !== undefined).length, "/", (all || []).length, "shared:", (all || []).filter((c: any) => c.sheetSide === "shared").map((c: any) => c.CourseCode).join(","));
  for (const c of [].sort.call([],(a, b) => String(a.code).localeCompare(String(b.code)))) {
    const r = reach?.courses?.[c.id];
    console.log(c.id, c.code, c.name, "| badge:", badges.badges?.[c.id] || "-", "| kind:", badges.kinds?.[c.id] || "-", "| sheets:", (r?.sheets || []).join(","), "| reach:", r?.state);
  }
})();
