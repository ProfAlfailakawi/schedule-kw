/**
 * ── «توقّع الرغبات» قبل النشر: ما طلبه الأساتذةُ في الفصول السابقة (للمنسّق وحده) ──
 *
 *   GET /api/instructor-requests/history-hints?collegeId&sectionId&termId
 *
 * بإذن القسم (7) ونطاقه، كقراءة الوارد نفسها. للقراءة فقط: لا يكتب ولا يرسل ولا يصل منه شيءٌ إلى أستاذ؛
 * والمتصفّحُ يرسمه شرائحَ على قائمة النشر عند المنسّق. الاستخراجُ والتجميعُ في utils/wishPatterns.ts.
 *
 * السقوف: آخرُ أربعة فصولٍ سابقة، وأكثرُ WISH_HINT_MAX_INSTRUCTORS أستاذاً. وذاكرةٌ قصيرة (دقيقة) مفتاحُها يحمل عالَمَ الجلسة
 * التجريبية (Repository.currentDemoSessionId) فلا يقرأ صندوقٌ تجريبيٌّ ما عند غيره، ولا الحقيقيُّ ما عند التجريبي.
 */
import type { Express, Response } from "express";
import { Repository } from "../db/repository";
import { type AuthenticatedRequest, requirePermission } from "./core/auth";
import { isScopeAllowed } from "./core/scope";
import { staffFamilyScopes } from "./core/staffCard";
import { createTtlMemo } from "./notificationCache";
import { aggregateWishPatterns, pastTermIds, WISH_LAST_TERMS, type AskDay, type InstructorWishHints, type WishAggregate, type WishLine } from "../utils/wishPatterns";
import { dayKeysOf } from "../utils/instructorRequestItems";

export const WISH_HINT_MAX_INSTRUCTORS = 200;
export const WISH_HINT_TTL_MS = 60_000;

export interface WishHintLine extends WishLine { /** موعدُه في الفصل الجاري، لزرّ «افتح الموعد»؛ غيابُه = لا موعدَ مطابقاً الآن. */ rowId: number | null }
export interface WishHintsReply {
  termIds: number[];
  termsObserved: number;
  heat: WishAggregate["heat"];
  instructors: Array<Omit<InstructorWishHints, "lines"> & { lines: WishHintLine[] }>;
}

const memo = createTtlMemo<WishHintsReply>({ ttlMs: WISH_HINT_TTL_MS });

async function build(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number): Promise<WishHintsReply> {
  const [terms, family] = await Promise.all([Repository.getTerms(), staffFamilyScopes(collegeId, sectionId)]);
  const scopes = family.filter(scope => isScopeAllowed(req, scope.collegeId, scope.sectionId));
  const past = pastTermIds(terms, termId, WISH_LAST_TERMS);
  const requests = (await Promise.all(past.flatMap(id => scopes.map(scope => Repository.getInstructorRequests(scope.collegeId, scope.sectionId, id))))).flat();
  const aggregate = aggregateWishPatterns(requests, past);
  const ranked = [...aggregate.byInstructor.values()]
    .sort((a, b) => b.patterns.length - a.patterns.length || b.patterns[0].terms - a.patterns[0].terms || a.instructorId - b.instructorId)
    .slice(0, WISH_HINT_MAX_INSTRUCTORS);
  /* موعدُ كل سطرٍ في الفصل الجاري: صفُّ الأستاذ نفسه في المقرر نفسه، وأولويتُه لما يقع في يوم «تركه». */
  const current = (await Promise.all(scopes.map(scope => Repository.getSchedulesByScope({ collegeId: scope.collegeId, sectionId: scope.sectionId, termId })))).flat();
  const rowFor = (instructorId: number, line: WishLine): number | null => {
    const rows = current.filter(row => Number(row.AdInstructorId) === instructorId && Number(row.AdCourseId) === line.courseId);
    const onDay = line.from ? rows.find(row => dayKeysOf(row).includes(line.from!.day as AskDay)) : undefined;
    const row = onDay || rows[0];
    return row ? Number(row.id) : null;
  };
  return {
    termIds: past,
    termsObserved: aggregate.termsObserved,
    heat: aggregate.heat,
    instructors: ranked.map(hint => ({ ...hint, lines: hint.lines.map(line => ({ ...line, rowId: rowFor(hint.instructorId, line) })) })),
  };
}

export function registerWishHintsRoutes(app: Express): void {
  app.get("/api/instructor-requests/history-hints", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
    const collegeId = Number(req.query.collegeId || 0);
    const sectionId = Number(req.query.sectionId || 0);
    const termId = Number(req.query.termId || 0);
    if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
    try {
      const key = `${Repository.currentDemoSessionId() || "real"}|${collegeId}|${sectionId}|${termId}|${req.userId ?? ""}`;
      const reply = await memo.get(key, () => build(req, collegeId, sectionId, termId));
      res.setHeader("Cache-Control", "no-store");
      res.json(reply);
    } catch {
      res.status(500).json({ error: "تعذّرت قراءة رغبات الفصول السابقة." });
    }
  });
}
