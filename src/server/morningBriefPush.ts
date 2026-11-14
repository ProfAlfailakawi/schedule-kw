/**
 * ── موجز الصباح بالتنبيه ─────────────────────────────────────────────────────
 *
 * الخادمُ بلا مؤقّت عن قصد (Cloud Run يخنق المعالج بلا طلب)، فالموعدُ يأتي من الخارج: جدولةٌ
 * (Cloud Scheduler) تنادي هذه النقطة كل صباح أحدٍ إلى خميس، بسرٍّ في الترويسة x-brief-token
 * يطابق المتغيّر MORNING_BRIEF_TOKEN. بلا المتغيّر أو بسرٍّ خاطئ: 404 كأن النقطة غير موجودة.
 *
 * ولكل حسابٍ تنبيهٌ واحد في اليوم: سطرٌ لكل قسمٍ من أقسامه (حتى ثلاثة) فيه الموانع والأيام الباقية.
 * أقسامٌ بلا جدول لا تُذكر، وحسابٌ بلا شيءٍ يُذكر لا يُرسل إليه شيء. مديرُ النظام والعميدان (نطاقُ كلية)
 * لا يصلهم: موجزُهم داخل التطبيق في «ميزان الأقسام». لا أسماء ولا قاعات في النص.
 */
import type { Express, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { Repository } from "../db/repository";
import { AR, countOf } from "../utils/arabicCount";
import { resultsFingerprint, type SharedReportState } from "../utils/reportShareCore";
import { currentTermId } from "../utils/termSequence";
import { countBlockingConflicts, readApproval, readDeadlineFor } from "./core/approvals";
import { approvalBlockerOptions } from "./core/smartImport";
import { pushTopic, type PushMessage, type PushSubscriptionRecord } from "./webPush";

export interface BriefLine { place: string; blockers: number; daysLeft: number | null }
type Deliver = (records: PushSubscriptionRecord[], message: PushMessage, options?: { urgency?: "high" | "normal" | "low"; topic?: string }) => Promise<{ sent: number; failed: number; removed: number; limited: number }>;

/** ما يُقال في سطرٍ واحد لقسم: «القسم · ٢ مانع · ٥ أيام». لا شيء إن لم يكن فيه ما يُقال. */
export function briefLineText(line: BriefLine): string {
  const parts = [line.place];
  if (line.blockers > 0) parts.push(countOf(line.blockers, AR.blocker));
  if (line.daysLeft !== null) parts.push(line.daysLeft < 0 ? "انقضى الموعد" : line.daysLeft === 0 ? "التسليم اليوم" : countOf(line.daysLeft, AR.day));
  return parts.join(" · ");
}

/** `watched`: أسماءُ تقاريرَ حفظها صاحبُها بـ«نبّهني إن تغيّر» وتغيّر جدولُ قسمها منذ آخر موجز. */
export function briefMessage(lines: BriefLine[], at = new Date().toISOString(), watched: string[] = []): PushMessage | null {
  const worth = lines.filter(line => line.blockers > 0 || (line.daysLeft !== null && line.daysLeft <= 7));
  if (!worth.length && !watched.length) return null;
  const body = [...worth.slice(0, 3).map(briefLineText), ...watched.slice(0, 3).map(name => `🔔 «${name}»`)].join("\n");
  return { title: "☀ موجز الصباح", body, url: "/FSchedule/MainScheduleReport", tag: "morning-brief", at };
}

interface WatchedDoc { id: string; owner: number; name: string; watch: boolean; state: SharedReportState | null; fp?: string }

/** يوم الأسبوع بتوقيت الكويت: الأحد 0 … الخميس 4. */
export function kuwaitWeekday(now: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuwait", weekday: "short" }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}
export const kuwaitDayKey = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const sameSecret = (a: string, b: string) => {
  const left = Buffer.from(String(a || "")), right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
};

export function registerMorningBriefRoute(app: Express, deps: { deliver: Deliver; isPowerUser: (req: any) => boolean; now?: () => number }): void {
  app.post("/api/internal/morning-brief", async (req: Request, res: Response) => {
    const secret = String(process.env.MORNING_BRIEF_TOKEN || "");
    if (!secret || Repository.isDemoMode() || !sameSecret(String(req.headers["x-brief-token"] || ""), secret)) { res.status(404).json({ error: "غير موجود" }); return; }
    res.setHeader("Cache-Control", "no-store");
    const now = new Date((deps.now || Date.now)());
    const weekday = kuwaitWeekday(now);
    if (weekday < 0 || weekday > 4) { res.json({ ok: true, skipped: "weekend", sent: 0 }); return; }
    try {
      const terms = await Repository.getTerms();
      const termId = Number(currentTermId(terms as any, now.getTime()) || 0);
      if (!termId) { res.json({ ok: true, skipped: "no-term", sent: 0 }); return; }
      const [subscriptions, sections, termRows, options] = await Promise.all([
        Repository.listPushSubscriptions({ ownerKind: "user" }), Repository.getSections(), Repository.getSchedulesByScope({ termId }), approvalBlockerOptions(),
      ]);
      const nameOf = new Map((sections as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")]));
      const byUser = new Map<number, PushSubscriptionRecord[]>();
      for (const record of subscriptions) { const id = Number(record.userId || 0); if (id) byUser.set(id, [...(byUser.get(id) || []), record]); }
      const day = kuwaitDayKey(now);
      let users = 0, sent = 0, quiet = 0;
      for (const [userId, records] of byUser) {
        const user = await Repository.getUserById(userId);
        if (!user || !user.IsActive || user.IsLocked || user.IsDeleted || deps.isPowerUser({ user })) continue;
        const assigns = (await Repository.getUserAssigns(userId)).filter(item => Number(item.AdSectionId) > 0);
        const wanted = [...new Map(assigns.map(item => [`${item.AdCollegeId}:${item.AdSectionId}`, item])).values()].slice(0, 3);
        const lines: BriefLine[] = [];
        for (const scope of wanted) {
          const collegeId = Number(scope.AdCollegeId), sectionId = Number(scope.AdSectionId);
          const rows = termRows.filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId);
          if (!rows.length) continue;
          const approval = await readApproval(collegeId, sectionId, termId);
          const deadline = approval.status === "accepted" ? null : await readDeadlineFor(approval, termId);
          lines.push({ place: nameOf.get(sectionId) || "", blockers: countBlockingConflicts(rows, termRows, options), daysLeft: typeof deadline?.daysLeft === "number" ? deadline.daysLeft : null });
        }
        /* «نبّهني إن تغيّر»: بصمةُ جدول القسم الآن مقابل ما كان عند آخر موجز. أولُ مرةٍ قاعدةٌ لا تغيّر. */
        const watchedNames: string[] = [];
        const fingerprints: Array<{ id: string; fp: string }> = [];
        for (const doc of await Repository.listFeatureDocs<WatchedDoc>("savedReports", `${userId}:`)) {
          const state = doc?.state;
          if (!doc?.watch || !state || Number(doc.owner) !== userId || state.t !== termId) continue;
          if (!wanted.some(scope => Number(scope.AdCollegeId) === state.c && Number(scope.AdSectionId) === state.s)) continue;
          const fp = resultsFingerprint(termRows.filter(row => Number(row.AdCollegeId) === state.c && Number(row.AdSectionId) === state.s));
          if (doc.fp === fp) continue;
          fingerprints.push({ id: doc.id, fp });
          if (doc.fp !== undefined) watchedNames.push(doc.name);
        }
        const message = briefMessage(lines, now.toISOString(), watchedNames);
        const remember = () => Promise.all(fingerprints.map(item => Repository.updateFeatureDoc<WatchedDoc, boolean>("savedReports", item.id, current => current ? { next: { ...current, fp: item.fp }, result: true } : { refuse: false })));
        if (!message) { await remember(); quiet += 1; continue; }
        /* مرةً في اليوم لكل حساب، ذرّياً: نسختان من الخادم لا ترسلان تنبيهين. */
        const claimed = await Repository.updateFeatureDoc<{ id: string; at: number }, boolean>("pushCooldowns", `brief:${userId}:${day}`, current =>
          current ? { refuse: false } : { next: { id: `brief:${userId}:${day}`, at: now.getTime() }, result: true });
        if (!claimed.ok) continue;
        await remember();
        const report = await deps.deliver(records, message, { urgency: "normal", topic: pushTopic(`brief:${userId}`) });
        users += 1; sent += report.sent;
      }
      res.json({ ok: true, day, users, sent, quiet });
    } catch (error) {
      console.warn("[brief] failed:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "تعذّر إرسال الموجز" });
    }
  });
}
