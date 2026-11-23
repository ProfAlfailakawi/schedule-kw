/**
 * ── فيلمي للأستاذ: قراءةٌ فقط من رابطه ──
 *
 * مساران لا يكتبان شيئاً: صفحةُ الفيلم ‎/r/:token/film‎ وقراءتُه
 * ‎/api/public/request/:token/film‎. صاحبُ الفيلم هو صاحبُ الرابط وحده: يُعرف من
 * `resolveRequestLink` كما تعرفه صفحةُ طلبه (رابطٌ حيّ غير موقوف ولا منتهٍ، وطلبٌ
 * في الجولة الحالية)، ولا يُقبل رقمُ أستاذٍ من العنوان أبداً.
 *
 * يُقرأ جدولُه **الرسمي** في فصل طلبه (كل ما يدرّسه في الجامعة، لا في قسم الرابط
 * وحده) وقراراتُ القسم في بنود طلبه. **لا قاعةَ ولا مبنى**: `lecturesFromRows`
 * لا تقرأ حقلَ مكان، والجوابُ يمرّ بـ`withoutPlaceFields` قبل أن يخرج. ولا رقمَ
 * مدنياً ولا اسمَ أحدٍ غيره. وفتحُ الفيلم لا يُسجَّل فتحاً للرابط.
 *
 * والفيلم يعمل قبل الاعتماد النهائي (قرار المالك في فيلم الفصل): `final` يقول هل
 * اعتمد التسجيل جدولَ كل قسمٍ يدرّس فيه، والمشاهدُ تروي «حتى الآن» حتى يصبح نهائياً.
 */
import type { Express, Request, Response } from "express";
import { Repository } from "../../db/repository";
import type { FSchedule, InstructorRequest } from "../../types";
import { instructorFilm, lecturesFromRows, teachingScopes, wishesFromItems, type MyFilmData } from "../../utils/myFilm";
import { withoutPlaceFields } from "../../utils/teacherSafeFields";
import { resolveRequestLink } from "../core/instructorRequests";
import { publicPageNonce } from "../core/publicPages";
import { myFilmPage } from "../myFilmPage";
import { publicInvalidLinkPage } from "../pages/publicInvalidLinkPage";

/* دقيقةٌ لكل رابط، ومفتاحُ جلسة التجربة في المخبأ: لا يرى زائرُ التجربة بياناتٍ حقيقية ولا صندوقَ غيره. */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; film: MyFilmData | null }>();

async function filmFor(linkId: string, request: InstructorRequest): Promise<MyFilmData | null> {
  const key = `${Repository.currentDemoSessionId() || "live"}|${linkId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.film;
  const instructorId = Number(request.AdInstructorId), termId = Number(request.AdTermId);
  const [rows, instructors, term, courses] = await Promise.all([
    Repository.getSchedulesByScope({ termId }), Repository.getInstructors(termId), Repository.getTermById(termId), Repository.getCourses(),
  ]);
  const courseName = new Map((courses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseName || "")]));
  const scopes = teachingScopes(rows as FSchedule[], instructorId);
  const approvals = await Promise.all(scopes.map(scope =>
    Repository.getScheduleApproval(scope.collegeId, scope.sectionId, termId).catch(() => undefined)));
  const person = (instructors as any[]).find(row => Number(row.AdInstructorId) === instructorId);
  const film = instructorFilm({
    name: String(person?.AdInstructorName || "").trim(),
    termName: String((term as any)?.AdTermName || ""),
    lectures: lecturesFromRows(rows as FSchedule[], instructorId, id => courseName.get(id) || ""),
    wishes: wishesFromItems(request.items, Boolean(request.submittedAt)),
    final: scopes.length > 0 && approvals.every(approval => approval?.status === "accepted"),
  });
  const safe = film ? withoutPlaceFields(film) : null;
  cache.set(key, { at: Date.now(), film: safe });
  if (cache.size > 400) for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
  return safe;
}

export function registerMyFilmRoutes(app: Express): void {

app.get("/api/public/request/:token/film", async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  res.setHeader("Cache-Control", "no-store");
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  try {
    const film = await filmFor(resolved.link.id, resolved.request);
    if (!film) { res.status(404).json({ error: "لا محاضرات لك في جدول هذا الفصل بعد، فلا فيلم يُروى الآن." }); return; }
    res.json({ film });
  } catch (error) {
    console.error("[my-film] أستاذ:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "تعذّر إعداد فيلمك الآن. أعد المحاولة بعد قليل." });
  }
});

app.get("/r/:token/film", async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if ("error" in resolved) {
    res.status(resolved.status).type("text/html; charset=utf-8").send(publicInvalidLinkPage(resolved.error));
    return;
  }
  const token = encodeURIComponent(resolved.link.id);
  res.type("text/html; charset=utf-8").send(myFilmPage({
    api: `/api/public/request/${token}/film`, back: `/r/${token}`, backLabel: "جدولي", nonce: publicPageNonce(res),
  }));
});

}
