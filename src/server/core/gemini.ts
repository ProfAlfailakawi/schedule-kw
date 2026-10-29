/**
 * ── طبقةُ النموذج اللغوي: نيّةُ الدليل وطلبُ الجدولة ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { AR, countOf } from "../../utils/arabicCount";
import { extractJsonObject, GEMINI_SCHEDULE_FUNCTION_NAMES, sanitizeGeminiScheduleCalls } from "../../utils/geminiScheduleLayer";

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function geminiOutputText(data: any) {
  return String((data?.candidates || [])
    .flatMap((candidate: any) => candidate?.content?.parts || [])
    .map((part: any) => part?.text || "")
    .filter(Boolean)
    .join("\n") || "").trim();
}

function geminiFunctionCalls(data: any) {
  return (data?.candidates || [])
    .flatMap((candidate: any) => candidate?.content?.parts || [])
    .map((part: any) => part?.functionCall)
    .filter(Boolean)
    .map((call: any) => ({ name: call.name, args: call.args || {} }));
}

export async function requestGeminiScheduleLayer(parts: GeminiPart[], options: { json?: boolean; tools?: boolean } = {}) {
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || "").trim();
  if (!key) return null;
  const model = String(process.env.GEMINI_SCHEDULE_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash").trim();
  const controller = new AbortController();
  /* Reading a multi-page scan is not a chat turn: even a one-line prompt costs
     ~20s on this model, so an 18s budget aborted every real import. Function
     calls stay short; a document read is given the time a document needs. */
  const budgetMs = options.tools ? 45_000 : 180_000;
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const functionDeclarations = GEMINI_SCHEDULE_FUNCTION_NAMES.map(name => ({
      name,
      description: {
        check_conflicts: "Check whether a proposed timetable change collides with rooms, instructors, duplicate sections, hall-barter windows, or student cohorts.",
        find_rooms: "Find eligible rooms or room availability for a day/time request.",
        check_instructors: "Resolve instructor availability or instructor-specific scheduling questions.",
        check_regulations: "Evaluate institutional and department scheduling regulations for a proposed scenario.",
        simulate_schedule: "Preview a schedule scenario and return before/after effects without writing anything.",
      }[name],
      parameters: { type: "OBJECT", properties: { query: { type: "STRING" }, code: { type: "STRING" }, dayIndex: { type: "NUMBER" }, time: { type: "STRING" }, rowId: { type: "NUMBER" }, room: { type: "STRING" } } },
    }));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: [
          "You are only a comprehension layer for an academic timetable system.",
          "Never decide the final schedule and never ask to save, publish, apply, update, delete, or commit.",
          "Return structured JSON or safe function calls only. The deterministic server validators are the sole authority before anything can be stored.",
        ].join("\n") }] },
        contents: [{ role: "user", parts }],
        ...(options.tools ? { tools: [{ functionDeclarations }], toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: GEMINI_SCHEDULE_FUNCTION_NAMES } } } : {}),
        /* Transcription is not a reasoning problem. Left to think at length the
           model spent 11.8s on a single row where 1.8s produced the same JSON,
           which is what turned a page read into a three-minute wait. */
        ...(options.json
          ? { generationConfig: { responseMimeType: "application/json", temperature: 0.1, thinkingConfig: { thinkingLevel: "low" } } }
          : { generationConfig: { temperature: 0.1, thinkingConfig: { thinkingLevel: "low" } } }),
      }),
    });
    /* A silent null told the reviewer only "Gemini غير مهيأ", which hid a wrong
       model name, an expired key, and a timeout behind one sentence. The reason
       is logged for the operator and returned so the screen can name it. */
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      let message = detail;
      try { message = JSON.parse(detail)?.error?.message || detail; } catch { /* plain text */ }
      console.error(`Gemini ${model} رفض الطلب: HTTP ${response.status} — ${String(message).slice(0, 300)}`);
      return { failed: true, status: response.status, reason: String(message).slice(0, 300) };
    }
    const data = await response.json().catch(() => null);
    if (!data) return null;
    const calls = sanitizeGeminiScheduleCalls(geminiFunctionCalls(data));
    if (calls.length) return { calls, raw: data };
    const text = geminiOutputText(data);
    return { json: extractJsonObject(text), text, raw: data };
  } catch (error: any) {
    const aborted = error?.name === "AbortError";
    console.error(`Gemini ${model} فشل: ${aborted ? `تجاوز المهلة ${budgetMs}ms` : String(error?.message || error).slice(0, 200)}`);
    return { failed: true, status: 0, reason: aborted ? `تجاوز المهلة (${countOf(Math.round(budgetMs / 1000), AR.second)}) أثناء قراءة الملف` : String(error?.message || "تعذر الاتصال بـGemini").slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}
