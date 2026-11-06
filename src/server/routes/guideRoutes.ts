/**
 * ── الدليلُ الذكي وقياسُ الواجهة ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository } from "../../db/repository";
import { type AuthenticatedRequest, requireAuth } from "../core/auth";
import { isScopeAllowed } from "../core/scope";

export function registerGuideRoutes(app: Express): void {

// --- SMART SCHEDULE WORKSPACE (additive; legacy schedule endpoints remain unchanged) ---

app.post("/api/telemetry/client", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const incoming = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 20) : [];
  if (!incoming.length) { res.json({ accepted: 0 }); return; }
  const safe = incoming.map((item:any) => {
    const collegeId = Number(item?.collegeId || item?.AdCollegeId || 0);
    const sectionId = Number(item?.sectionId || item?.AdSectionId || 0);
    const termId = Number(item?.termId || item?.AdTermId || 0);
    if (collegeId && sectionId && !isScopeAllowed(req, collegeId, sectionId)) return null;
    const kind = ["api","error","offline","sync","guide"].includes(String(item?.kind)) ? String(item.kind) : "error";
    return {
      SystemUserId: kind === "guide" ? 0 : Number(req.user.SystemUserId),
      userName: kind === "guide" ? "" : String(req.user.Name || req.user.SystemUserLogin || ""),
      AdCollegeId: collegeId || undefined,
      AdSectionId: sectionId || undefined,
      AdTermId: termId || undefined,
      kind: kind as any,
      name: String(item?.name || "unknown").startsWith("unanswered|") ? String(item.name).replace(/\d+/g, "#").slice(0, 140) : String(item?.name || "unknown").slice(0, 140),
      durationMs: Number.isFinite(Number(item?.durationMs)) ? Math.max(0, Math.min(120000, Math.round(Number(item.durationMs)))) : undefined,
      status: Number.isFinite(Number(item?.status)) ? Number(item.status) : undefined,
      ok: typeof item?.ok === "boolean" ? item.ok : undefined,
      message: String(item?.message || "").slice(0, 320) || undefined,
      timestamp: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.timestamp || "")) ? String(item.timestamp) : new Date().toISOString(),
      breadcrumbs: Array.isArray(item?.breadcrumbs) ? item.breadcrumbs.slice(-12).map((b:any)=>({ at:String(b?.at||"").slice(0,40), action:String(b?.action||"").slice(0,90) })) : undefined,
    };
  }).filter(Boolean) as any[];
  const accepted = await Repository.createClientTelemetry(safe);
  res.json({ accepted });
});
}
