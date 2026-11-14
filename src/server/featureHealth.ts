/**
 * ── «سلامة الميزات الجديدة»: GET /api/system-health/features ───────────────────
 * ست بطاقاتٍ داخل «سلامة النظام» تقول هل الميزاتُ المُطلَقة حديثاً تُستعمل وتعمل في الفصل الجاري. قراءةٌ فقط، وحارسُها
 * حارسُ «سلامة النظام» نفسه (requireAuth ثم requireRootAdmin). أعدادٌ فقط — لا اسمَ ولا رقمَ مدنياً ولا بصمةً ولا رمزاً.
 *
 * قراءةٌ خفيفة: ملفاتُ الطلبة تُقرأ مرةً واحدة وتُنتقى منها الأعدادُ في الذاكرة، وتُخبَّأ الاستجابةُ دقيقةً (FEATURE_CACHE_MS).
 * كلُّ بطاقةٍ في try/catch خاص بها: فشلُ مصدرٍ يُظهر بطاقتَه «تعذّرت القراءة» ولا يمسّ الباقي.
 */
import type { Request, Response } from "express";
import { Repository } from "../db/repository";
import { createTtlMemo } from "./notificationCache";
import { readLocationRegistry } from "./core/locations";
import { studentPushConfigured } from "./studentExtras";
import { kuwaitDateISO } from "../utils/approvalWorkflow";
import { roomCapacityGaps } from "../utils/roomCapacityGaps";
import { currentTermId } from "../utils/termSequence";
import { pickDoorTerm, readStudentPhase } from "../utils/termStudentPhases";
import { canBypassHealthCache } from "../utils/systemHealth";
import {
  FEATURE_CACHE_MS, buildFeaturePayload, cardsTile, featureRange, masariTile, pushTile, recoveryTile, roomsTile, runTileProbes, shareTile,
  type FeatureProfile, type FeaturePayload,
} from "../utils/featureHealth";

const memo = createTtlMemo<FeaturePayload>({ ttlMs: FEATURE_CACHE_MS });
const addDay = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** يجمع البطاقات الست (دون تخبئة). `now` للاختبار. */
export async function computeFeatureHealth(now: number = Date.now()): Promise<FeaturePayload> {
  const demo = Repository.isDemoRequest();
  const terms = (await Repository.getTerms().catch(() => [])) as any[];
  const doorTerm = pickDoorTerm(terms, now) || terms.find(term => Number(term.AdTermId) === currentTermId(terms, now)) || null;
  const termId = Number(doorTerm?.AdTermId || 0);
  const range = featureRange(doorTerm, now);
  const today = kuwaitDateISO(new Date(now));
  const hour = new Date(now + 3 * 3_600_000).getUTCHours();

  /* ملفاتُ الطلبة مرةً واحدة تشترك فيها أربعُ بطاقات؛ فشلُ القراءة يسقط تلك الأربع وحدها. */
  let profilesRead: Promise<FeatureProfile[]> | null = null;
  const profiles = () => (profilesRead ||= Repository.listStudentProfiles() as Promise<FeatureProfile[]>);

  const tiles = await runTileProbes([
    { id: "push", run: async () => {
      const [list, configured] = await Promise.all([profiles(), studentPushConfigured()]);
      const phases = doorTerm?.AdTermStudentPhases;
      const reading = phases ? readStudentPhase(phases, today) : null;
      const rounds: Array<{ start?: string }> = phases?.rounds || [];
      return pushTile(list, termId, range, configured, {
        hour,
        wishesCloseToday: Boolean(reading && reading.mode === "wishes" && reading.until && reading.until === today),
        roundTomorrow: rounds.some(round => round.start === addDay(today, 1)),
      });
    } },
    { id: "share", run: async () => shareTile(await profiles(), range, now) },
    { id: "recovery", run: async () => recoveryTile(await profiles(), range, now) },
    { id: "rooms", run: async () => { const registry = await readLocationRegistry(); return roomsTile(roomCapacityGaps(registry.rooms, registry.buildings)); } },
    { id: "cards", run: async () => {
      const cardTerm = currentTermId(terms, now) || termId;
      return cardsTile(cardTerm ? await Repository.getInstructorRequests(0, 0, cardTerm) : []);
    } },
    { id: "masari", run: async () => masariTile(await profiles(), termId, range) },
  ]);
  return buildFeaturePayload(tiles, termId, now, demo);
}

/** آخرُ «تحديث» يدويٍّ نفّذه هذا الخادم فعلاً؛ ما بعده ضمن الفاصل يقرأ من الذاكرة. */
let lastFreshAt: number | null = null;

export async function featureHealthHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (req.query?.fresh === "1" && canBypassHealthCache(lastFreshAt, Date.now())) { lastFreshAt = Date.now(); memo.invalidate(); }
  const key = `${Repository.currentDemoSessionId() || "real"}|features`;
  res.json(await memo.get(key, () => computeFeatureHealth()));
}
