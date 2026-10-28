/**
 * ── باب الواجهة إلى محرّك الاقتراح الواحد ─────────────────────────────────────
 * الأزرار الثلاثة في المحرر الكامل («اقترح قاعة متاحة» · «اقترح لي وقتاً وقاعة» ·
 * «اقترح بديلاً آمناً») والزرّان في «موعد جديد» يسألون من هنا وحده
 * /api/schedules/suggest-slots. ذاكرة قصيرة (15 ث) تجعل الضغطة الثانية فورية،
 * وتُمسح عند أي تغيير في الجدول.
 */
import type { RoomSuggestion, ReplaceableSection } from "../components/RoomSuggestionCards";
import type { SuggestionEmptyReason } from "./suggestionEngine";

export interface SuggestionReply {
  slots: RoomSuggestion[];
  reason?: SuggestionEmptyReason;
  note?: string;
  replaceable: ReplaceableSection[];
}

export type SuggestionKind = "room" | "slot";

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; reply: SuggestionReply }>();

/** يُستدعى عند أي حفظ/تحديث للجدول: اقتراحٌ قديم قد يقترح قاعة حُجزت للتو. */
export function forgetSuggestions() { cache.clear(); }

const FIELDS = [
  "AdCollegeId", "AdSectionId", "AdTermId", "AdCourseId", "SCode", "AdInstructorId",
  "fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday", "fstarttime", "fendtime",
  "instructorRequestId", "excludeId",
] as const;

export function suggestionBody(form: Record<string, any>, kind: SuggestionKind, durationMinutes?: number) {
  const body: Record<string, unknown> = {};
  for (const key of FIELDS) if (form[key] !== undefined) body[key] = form[key];
  body.roomOnly = kind === "room";
  if (kind === "slot" && durationMinutes) body.durationMinutes = durationMinutes;
  return body;
}

export async function fetchSuggestions(body: Record<string, unknown>, signal?: AbortSignal): Promise<SuggestionReply> {
  const key = JSON.stringify(body);
  const held = cache.get(key);
  if (held && Date.now() - held.at < TTL_MS) return held.reply;
  const response = await fetch("/api/schedules/suggest-slots", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: key, signal,
  });
  const data = await response.json().catch(() => ({} as any));
  if (!response.ok) throw new Error(data?.error || "تعذّر الاقتراح");
  const reply: SuggestionReply = {
    slots: Array.isArray(data.slots) ? data.slots : [],
    reason: data.reason,
    note: typeof data.note === "string" ? data.note : undefined,
    replaceable: Array.isArray(data.replaceable) ? data.replaceable : [],
  };
  cache.set(key, { at: Date.now(), reply });
  if (cache.size > 60) cache.delete(cache.keys().next().value as string);
  return reply;
}

/**
 * «اقترح بديلاً آمناً»: الوقت الحالي بقاعة أخرى أولاً (أقل تغيير)، ثم أوقات أخرى
 * بالأيام نفسها. المحرّك نفسه مرتين بالتوازي، لا محرّك ثالث.
 */
export async function fetchAlternatives(form: Record<string, any>, durationMinutes: number, signal?: AbortSignal): Promise<SuggestionReply> {
  const timed = Boolean(form.fstarttime && form.fendtime);
  const [rooms, slots] = await Promise.all([
    timed ? fetchSuggestions(suggestionBody(form, "room"), signal) : Promise.resolve(null),
    fetchSuggestions(suggestionBody(form, "slot", durationMinutes), signal),
  ]);
  const seen = new Set<string>();
  const merged = [...(rooms?.slots.slice(0, 3) || []), ...slots.slots]
    .filter(slot => { const key = `${slot.start}|${slot.roomId || `${slot.room}/${slot.hall}`}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 5);
  return {
    slots: merged,
    reason: merged.length ? undefined : (slots.reason || rooms?.reason),
    note: merged.length ? undefined : (slots.note || rooms?.note),
    replaceable: rooms?.replaceable || [],
  };
}
