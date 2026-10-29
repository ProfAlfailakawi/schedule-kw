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
import { canAccessGuideFeature, featureById, featureIdForGuideIntentGoal, parseStructuredGuideIntent } from "../../guide/smartGuide";
import { type AuthenticatedRequest, isPowerUser, requireAuth, ROOT_ADMIN_USER_ID } from "../core/auth";
import { isScopeAllowed } from "../core/scope";

type GuideIntentPayload = {
  goal: string;
  entities: { selectedId?: number; course?: string; day?: string; time?: string; room?: string; instructor?: string; instructorId?: number };
  constraints: { keepInstructor?: boolean; keepRoom?: boolean; findAlternativeRoom?: boolean };
  requestedAction: "explain" | "navigate" | "prepare" | "simulate" | "execute" | "unknown";
  confidence: number;
  compound: boolean;
  source: "rules" | "ai";
  clarification?: string;
};

function deterministicGuideIntent(question: string): GuideIntentPayload {
  const parsed = parseStructuredGuideIntent(question);
  return {
    goal: parsed.goal,
    entities: { ...parsed.entities },
    constraints: { ...parsed.constraints },
    requestedAction: parsed.requestedAction,
    confidence: parsed.confidence,
    compound: parsed.compound,
    source: "rules",
    clarification: parsed.clarification,
  };
}

/**
 * One permission predicate for every guide path, including the optional server
 * intent fallback. The server resolves the same registry feature used by the
 * drawer/search/routines, so adminOnly/rootOnly cannot drift between clients
 * and the fallback endpoint after a permission change.
 */
function serverCanExposeGuideFeature(req: AuthenticatedRequest, id: string) {
  const feature = featureById(String(id || ""));
  if (!feature) return false;
  return canAccessGuideFeature(feature, {
    permissions: (req.permissions || []).map(Number),
    root: Number(req.user?.SystemUserId || 0) === ROOT_ADMIN_USER_ID,
    admin: isPowerUser(req),
  });
}


async function requestGuideAIIntent(payload:{question:string;context:any;allowedFeatureIds:string[];fallback:any}) {
  const customEndpoint = String(process.env.GUIDE_AI_ENDPOINT || "").trim();
  const openAIKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!customEndpoint && !openAIKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    if (customEndpoint) {
      const response = await fetch(customEndpoint, {
        method:"POST",
        headers:{"Content-Type":"application/json",...(process.env.GUIDE_AI_BEARER_TOKEN?{Authorization:`Bearer ${process.env.GUIDE_AI_BEARER_TOKEN}`}:{})},
        signal:controller.signal,
        body:JSON.stringify({
          model:String(process.env.GUIDE_AI_MODEL || "").trim() || undefined,
          task:"استخرج نية استخدام SCHEDULE فقط. أعد JSON منظمًا دون تنفيذ أي إجراء. للميزات العامة استخدم goal بصيغة feature:<allowedFeatureId> فقط من القائمة المسموحة. اجعل أي clarification باللغة العربية الفصحى.",
          question:payload.question, context:payload.context, allowedFeatureIds:payload.allowedFeatureIds,
          schema:{goal:"string",entities:"object",constraints:"object",requestedAction:"explain|navigate|prepare|simulate|execute|unknown",confidence:"0..1",clarification:"Arabic Fusha optional"},
        }),
      });
      if (!response.ok) return null;
      const data:any = await response.json().catch(()=>null);
      return data?.intent || data || null;
    }

    const base = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, "");
    const model = String(process.env.OPENAI_GUIDE_MODEL || process.env.GUIDE_AI_MODEL || "gpt-5-mini").trim();
    const system = [
      "أنت محلل نية لمرشد استخدام نظام جامعي اسمه SCHEDULE.",
      "افهم العربية الفصحى واللهجة الكويتية، لكن لا تكتب أي رد عامي.",
      "لا تنفذ شيئًا ولا تخترع صلاحيات أو ميزات غير موجودة.",
      "أعد كائن JSON فقط بالمفاتيح: goal, entities, constraints, requestedAction, confidence, compound, clarification.",
      "requestedAction واحد من explain,navigate,prepare,simulate,execute,unknown.",
      "للأهداف غير الأربعة المتخصصة استخدم goal بصيغة feature:<id>، ويجب أن يكون id موجودًا حرفيًا في allowedFeatureIds.",
      "confidence رقم بين 0 و1. إذا لم تكن متأكدًا استخدم clarification فصيحة ومختصرة.",
    ].join("\n");
    const userPayload = JSON.stringify({ question:payload.question, context:payload.context, allowedFeatureIds:payload.allowedFeatureIds, deterministicHint:payload.fallback });
    const response = await fetch(`${base}/responses`, {
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${openAIKey}`},
      signal:controller.signal,
      body:JSON.stringify({ model, input:[{role:"system",content:[{type:"input_text",text:system}]},{role:"user",content:[{type:"input_text",text:userPayload}]}], max_output_tokens:450 }),
    });
    if (!response.ok) return null;
    const data:any = await response.json().catch(()=>null);
    const outputText = String(data?.output_text || (Array.isArray(data?.output) ? data.output.flatMap((item:any)=>Array.isArray(item?.content)?item.content:[]).map((part:any)=>part?.text||part?.output_text||"").join("") : "") || "").trim();
    if (!outputText) return null;
    const clean = outputText.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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
      name: String(item?.name || "unknown").slice(0, 140),
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

app.post("/api/guide/intent", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const question = String(req.body?.question || "").trim().slice(0, 420);
  if (!question) { res.status(400).json({ error: "اكتب ما تريد إنجازه أولًا." }); return; }
  const clientAllowed = Array.isArray(req.body?.allowedFeatureIds) ? req.body.allowedFeatureIds.map((id:any) => String(id)).slice(0, 100) : [];
  const allowedFeatureIds = clientAllowed.filter(id => serverCanExposeGuideFeature(req, id));
  const context = req.body?.context && typeof req.body.context === "object" ? {
    view: String(req.body.context.view || "").slice(0, 60),
    currentFeatureId: String(req.body.context.currentFeatureId || "").slice(0, 100),
    selected: req.body.context.selected ? { id: Number(req.body.context.selected.id || 0), course: String(req.body.context.selected.course || "").slice(0, 100) } : null,
    currentTask: req.body.context.currentTask ? { title: String(req.body.context.currentTask.title || "").slice(0, 120), featureId: String(req.body.context.currentTask.featureId || "").slice(0, 100) } : null,
    currentError: String(req.body.context.currentError || "").slice(0, 220),
  } : {};
  let intent = deterministicGuideIntent(question);
  if (intent.confidence < .72 || intent.compound) {
    const candidate:any = await requestGuideAIIntent({ question, context, allowedFeatureIds, fallback:intent });
    const allowedActions = new Set(["explain","navigate","prepare","simulate","execute","unknown"]);
    if (candidate && typeof candidate === "object" && Number(candidate.confidence) >= Number(intent.confidence)) {
      const requestedAction = allowedActions.has(String(candidate.requestedAction || "")) ? String(candidate.requestedAction) : intent.requestedAction;
      intent = {
        ...intent,
        ...candidate,
        requestedAction: requestedAction as any,
        entities: { ...intent.entities, ...(candidate.entities || {}) },
        constraints: { ...intent.constraints, ...(candidate.constraints || {}) },
        confidence: Math.max(0, Math.min(1, Number(candidate.confidence || 0))),
        compound: Boolean(candidate.compound ?? intent.compound),
        source: "ai",
        clarification: String(candidate.clarification || intent.clarification || "").slice(0, 220) || undefined,
      };
    }
  }
  const proposedFeature = featureIdForGuideIntentGoal(intent.goal);
  if (intent.goal !== "unknown" && !proposedFeature) {
    intent = { ...intent, goal:"unknown", requestedAction:"explain", confidence:.35, clarification:"لم أتمكن من ربط الطلب بميزة معروفة في SCHEDULE. حدّد ما تريد الوصول إليه وسأقترح الأقرب.", source:intent.source };
  } else if (proposedFeature && !allowedFeatureIds.includes(proposedFeature)) {
    intent = { ...intent, goal:"unknown", requestedAction:"explain", confidence:.35, clarification:"هذه العملية غير متاحة ضمن صلاحياتك الحالية.", source:intent.source };
  }
  res.json({ intent, minimalContext:true, rawHistorySent:false });
});
}
