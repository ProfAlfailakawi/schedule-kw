/**
 * ── روابطُ المشاركة ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository, withSerialLock } from "../../db/repository";
import type { ScheduleShareLink } from "../../types";
import { departmentFamily } from "../../utils/sectionLabel";
import { termLinkExpiresAt } from "../../utils/shareLinkLifetime";
import { normalizeInstructorDeadline } from "../../utils/instructorRequestWindows";
import { instructorScheduleFingerprint } from "../../utils/scheduleFingerprint";
import { type AuthenticatedRequest, requirePermission } from "../core/auth";
import { isScopeAllowed } from "../core/scope";
import { shareLinkLabel, shareLinkStillReadable } from "../core/shareLinks";
import { liveStaffPublication, staffFamilyScopes, staffFamilyShareLinks } from "../core/staffCard";
import { surveyTermEnded } from "../core/studentIdentity";

const SHARE_MAX_DAYS = 180;

/* ── الروابط الشخصية: رابطٌ لكل أستاذ، لا يُفتح إلا له ─────────────────────────
 *
 * تُسكّ من «تسليم البطاقة» في لوحة النشر: لكلِّ أستاذٍ في القائمة رابطُه، يُعاد
 * استعمالُه إن وُجد (فلا تتكاثر الروابط مع كل ضغطة)، ويعيش حتى نهاية الفصل،
 * ويرث موعدَ الطلبات من بطاقة القسم التي سُكّ منها. ويُسجَّل الإرسالُ لكل أستاذ
 * مع بصمة جدوله، فيُعرف لاحقاً من تغيّر جدولُه منذ أُبلغ. */
const isPersonalStaffLink = (link: ScheduleShareLink) => link.kind === "staff" && Number(link.AdInstructorId || 0) > 0;

async function personalLinkEligibleIds(collegeId: number, sectionId: number, termId: number): Promise<Set<number>> {
  const family = await staffFamilyScopes(collegeId, sectionId);
  const members = await Promise.all(family.map(async scope => {
    const [rows, delegates] = await Promise.all([
      Repository.getSchedulesByScope({ collegeId: scope.collegeId, sectionId: scope.sectionId, termId }),
      Promise.all([
        Repository.getDepartmentDelegates(scope.collegeId, scope.sectionId),
        Repository.getDepartmentFaculty(scope.collegeId, scope.sectionId),
      ]).then(lists => lists.flat()).catch(() => [] as number[]),
    ]);
    return [...rows.map(row => Number(row.AdInstructorId)), ...delegates.map(Number)];
  }));
  return new Set(members.flat().filter(id => id > 0));
}
const staffLinkFamilyAllowed = async (req: AuthenticatedRequest, link: ScheduleShareLink): Promise<boolean> =>
  (await staffFamilyScopes(link.AdCollegeId, link.AdSectionId))
    .some(scope => isScopeAllowed(req, scope.collegeId, scope.sectionId));

/* ── جدولُ الطلبة برمز QR ─────────────────────────────────────────────────────
 *
 * رابطٌ واحدٌ للقسم (kind: "students") يُطبع رمزُه على لوحة الإعلانات: يفتح
 * جدولَ **الفصل الجاري** دائماً (currentTermId عند كل قراءة)، فلا يموت الملصق
 * بانتقال الفصل. ويقرأ **المعتمد وحده** (finalRowsOnly) — لا مسودّةَ قسمٍ يعمل
 * عليها. ولا بيانات أستاذٍ سوى اسمه المطبوع على الجداول أصلاً (ويُخفى إن شاء
 * القسم). بحثٌ وتصفيةٌ باليوم، وعرضان: حسب المقرر، وحسب اليوم. */
const STUDENT_QR_DAYS = 365;

export function registerShareRoutes(app: Express): void {

app.get("/api/share", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const [ownLinks, familyStaff] = await Promise.all([
    Repository.getShareLinks(collegeId, sectionId, termId),
    staffFamilyShareLinks(collegeId, sectionId, termId),
  ]);
  /* قبل توحيد العائلة كانت لكل موقع بطاقةٌ منشورة؛ يظهر أحدث رابط حيّ
     واحد فقط، دون تعديل تاريخ الروابط المخزّن أثناء عملية القراءة. */
  const latest = familyStaff.filter(liveStaffPublication)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const visibleStaff = familyStaff.filter(link =>
    !liveStaffPublication(link) || link.id === latest?.id);
  res.json([...ownLinks.filter(link => link.kind !== "staff"), ...visibleStaff]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.post("/api/share", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const days = Math.min(SHARE_MAX_DAYS, Math.max(1, Number(req.body?.days || 30)));
  /* The survey door could be opened by the public routes but never issued by
     anything, so no student link could exist. The section carries the cohort,
     so the boys' link and the girls' link are simply two links on two
     sections — no gender is ever inferred from a name. */
  const kind = req.body?.kind === "staff" ? "staff"
    : req.body?.kind === "survey" ? "survey"
    : req.body?.kind === "students" ? "students"
    : "department";
  const [sections, terms] = await Promise.all([Repository.getSections(), Repository.getTerms()]);
  const sectionName = sections.find(row => row.AdSectionId === sectionId)?.AdSectionName || "قسم";
  const termName = terms.find(row => row.AdTermId === termId)?.AdTermName || "";
  /* A survey collects requests for a term that is still ahead or running. A
     link issued for an ended or closed term would only gather answers nobody
     can act on. (Survey links only; other link kinds are unchanged.) */
  if (kind === "survey" && surveyTermEnded(terms.find(row => Number(row.AdTermId) === termId))) {
    res.status(409).json({ error: "انتهى هذا الفصل، فلا يُصدَر له رابط استبيان. اختر الفصل القادم.", code: "term-ended" });
    return;
  }
  /* رمزُ QR للطلبة واحدٌ للقسم: يُعاد الرابطُ القائم فلا يتغيّر الملصق المطبوع. */
  if (kind === "students") {
    const existing = (await Repository.getShareLinks(collegeId, sectionId, termId))
      .find(link => link.kind === "students" && !link.revoked && Date.parse(String(link.expiresAt)) > Date.now());
    if (existing) { res.status(200).json(existing); return; }
  }
  const label = shareLinkLabel(kind, sectionName, termName);
  /* بطاقةُ الأستاذ تعيش الفصلَ كلَّه — التقويمُ في هاتفه يتبعها — وموعدُ
     الطلبات يُحفظ منفصلاً ويحكم الكتابة وحدها. العمرُ يُحسب هنا، لا في المتصفح. */
  const requestsCloseAt = kind === "staff" ? normalizeInstructorDeadline(req.body?.requestsCloseAt) : "";
  const expiresAt = kind === "staff"
    ? termLinkExpiresAt(terms.find(row => row.AdTermId === termId))
    : new Date(Date.now() + (kind === "students" ? STUDENT_QR_DAYS : days) * 86400000).toISOString();
  const family = kind === "staff" ? departmentFamily(sections, collegeId, sectionId) : [{ collegeId, sectionId }];
  const familyKey = family.map(scope => `${scope.collegeId}:${scope.sectionId}`).sort().join("|");
  const published = await withSerialLock(`share-publish:${kind}:${familyKey}:${termId}`, async () => {
    const link = await Repository.createShareLink({
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
      label,
      kind,
      expiresAt,
      ...(requestsCloseAt ? { requestsCloseAt } : {}),
      SystemUserId: Number(req.user!.SystemUserId),
      userName: String(req.user!.Name || ""),
      showInstructors: req.body?.showInstructors !== false
    });
  /* ── بطاقةٌ حيّةٌ واحدةٌ للقسم في الفصل ──────────────────────────────────
   * كلُّ بطاقةٍ جديدةٍ كانت تُضاف إلى ما قبلها، فتتراكم في اللوحة بطاقاتٌ
   * بمواعيدَ مختلفة، ولا يعرف المنسّقُ أيَّها يقرأ الأستاذ. فالجديدةُ تحلّ محلّ
   * السابقة: تُوقف بطاقاتُ القسم القديمة، وتأخذ الروابطُ الشخصيةُ — وقد وصلت
   * الأساتذةَ في واتساب — موعدَها الجديد بدل أن تُوقف. */
    let replaced = 0;
    if (kind === "staff") {
      const scopeLinks = (await Promise.all(family.map(scope =>
         Repository.getShareLinks(scope.collegeId, scope.sectionId, termId)))).flat();
      for (const old of scopeLinks) {
        if (old.id === link.id || old.kind !== "staff" || old.revoked) continue;
        if (isPersonalStaffLink(old)) {
          if (requestsCloseAt && old.requestsCloseAt !== requestsCloseAt) await Repository.setShareLinkRequestsCloseAt(old.id, requestsCloseAt);
          continue;
        }
        await Repository.revokeShareLink(old.id);
        replaced++;
      }
    }
    return { link, replaced };
  });
  res.status(201).json({ ...published.link, replaced: published.replaced });
});

app.delete("/api/share/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const link = await Repository.getShareLink(String(req.params.id));
  if (!link) { res.status(404).json({ error: "الرابط غير موجود" }); return; }
  /* إلغاء بطاقة القسم يوقف نشر عائلة القسم بالكامل والطلبات غير المرسلة.
     طلبات الأساتذة التي أُرسلت أو وُقّعت تبقى سجلاتها وروابط قراءتها بلا مساس. */
  if (link.kind === "staff" && !Number(link.AdInstructorId || 0)) {
    const family = await staffFamilyScopes(link.AdCollegeId, link.AdSectionId);
    if (!family.some(scope => isScopeAllowed(req, scope.collegeId, scope.sectionId))) {
      res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return;
    }
    const familyKey = family.map(scope => `${scope.collegeId}:${scope.sectionId}`).sort().join("|");
    await withSerialLock(`share-publish:staff:${familyKey}:${link.AdTermId}`, async () => {
      const [links, requests] = await Promise.all([
        Promise.all(family.map(scope =>
          Repository.getShareLinks(scope.collegeId, scope.sectionId, link.AdTermId))).then(groups => groups.flat()),
        Promise.all(family.map(scope =>
          Repository.getInstructorRequests(scope.collegeId, scope.sectionId, link.AdTermId))).then(groups => groups.flat()),
      ]);
      const unsentTokens = new Set(requests.filter(request =>
        request.status === "sent" && !request.submittedAt && !request.signature)
        .map(request => request.linkId));
      for (const familyLink of links) {
        if (familyLink.revoked) continue;
        if (familyLink.kind === "staff"
            || (familyLink.kind === "request" && unsentTokens.has(familyLink.id))) {
          await Repository.revokeShareLink(familyLink.id);
        }
      }
    });
  } else {
    /* الرابط الشخصي في سجلّ العائلة يمكن أن يكون قد أُصدر من موقعٍ شقيق.
       إيقافه مُتاح لمن يملك القسم العلمي من أيٍّ من مواقعه. */
    if (!isScopeAllowed(req, link.AdCollegeId, link.AdSectionId)
        && !(link.kind === "staff" && await staffLinkFamilyAllowed(req, link))) {
      res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return;
    }
    await Repository.revokeShareLink(link.id);
  }
  res.json({ ok: true });
});

/* قائمة التسليم كاملة لعائلة القسم من البطاقة نفسها، مع أقل الحقول
   اللازمة لإعداد الرسالة؛ لا يُعاد الرقم المدني ولا سجل الموظف الكامل. */
app.get("/api/share/:id/faculty", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const parent = await Repository.getShareLink(String(req.params.id || ""));
  if (!parent || parent.revoked || parent.kind !== "staff" || Number(parent.AdInstructorId || 0)) {
    res.status(404).json({ error: "بطاقة القسم غير موجودة أو موقوفة" }); return;
  }
  if (!await staffLinkFamilyAllowed(req, parent)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return;
  }
  const [eligible, people] = await Promise.all([
    personalLinkEligibleIds(parent.AdCollegeId, parent.AdSectionId, parent.AdTermId),
    Repository.getInstructors(),
  ]);
  res.setHeader("Cache-Control", "no-store");
  res.json(people.filter(person => eligible.has(Number(person.AdInstructorId))).map(person => ({
    AdInstructorId: person.AdInstructorId,
    AdInstructorName: person.AdInstructorName,
    AdInstructorMobile: person.AdInstructorMobile || "",
  })));
});

app.post("/api/share/:id/personal", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const parent = await Repository.getShareLink(String(req.params.id || ""));
  if (!parent || parent.revoked || parent.kind !== "staff" || isPersonalStaffLink(parent)) { res.status(404).json({ error: "بطاقة القسم غير موجودة أو موقوفة" }); return; }
  if (!await staffLinkFamilyAllowed(req, parent)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const wanted = [...new Set((Array.isArray(req.body?.instructorIds) ? req.body.instructorIds : []).map(Number).filter((id: number) => id > 0))].slice(0, 300) as number[];
  if (!wanted.length) { res.json({ links: [] }); return; }
  const [eligible, existing, instructors, terms] = await Promise.all([
    personalLinkEligibleIds(parent.AdCollegeId, parent.AdSectionId, parent.AdTermId),
    staffFamilyShareLinks(parent.AdCollegeId, parent.AdSectionId, parent.AdTermId),
    Repository.getInstructors(),
    Repository.getTerms(),
  ]);
  const live = new Map<number, ScheduleShareLink>();
  for (const link of existing) {
    if (!isPersonalStaffLink(link) || link.revoked || !await shareLinkStillReadable(link)) continue;
    if (!live.has(Number(link.AdInstructorId))) live.set(Number(link.AdInstructorId), link);
  }
  const term = terms.find(row => Number(row.AdTermId) === Number(parent.AdTermId));
  const nameOf = new Map(instructors.map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]));
  const links: Array<{ instructorId: number; id: string; expiresAt: string; reused: boolean }> = [];
  for (const instructorId of wanted) {
    if (!eligible.has(instructorId)) continue;
    const found = live.get(instructorId);
    if (found) { links.push({ instructorId, id: found.id, expiresAt: found.expiresAt, reused: true }); continue; }
    const created = await Repository.createShareLink({
      AdCollegeId: parent.AdCollegeId, AdSectionId: parent.AdSectionId, AdTermId: parent.AdTermId,
      label: `بطاقة شخصية · ${nameOf.get(instructorId) || instructorId}`,
      kind: "staff",
      AdInstructorId: instructorId,
      expiresAt: termLinkExpiresAt(term),
      ...(parent.requestsCloseAt ? { requestsCloseAt: parent.requestsCloseAt } : {}),
      SystemUserId: Number(req.user!.SystemUserId),
      userName: String(req.user!.Name || ""),
      showInstructors: false,
    });
    links.push({ instructorId, id: created.id, expiresAt: created.expiresAt, reused: false });
  }
  res.json({ links });
});

/** يسجّل أن القسم فتح محادثة الإرسال لهذا الأستاذ، مع بصمة جدوله الآن. */
app.post("/api/share/:id/sent", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const link = await Repository.getShareLink(String(req.params.id || ""));
  if (!link || !isPersonalStaffLink(link)) { res.status(404).json({ error: "الرابط الشخصي غير موجود" }); return; }
  if (!await staffLinkFamilyAllowed(req, link)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const rows = (await Repository.getSchedulesByScope({ termId: link.AdTermId }))
    .filter(row => Number(row.AdInstructorId) === Number(link.AdInstructorId));
  const sentAt = new Date().toISOString();
  await Repository.markShareLinkInstructor(link.id, Number(link.AdInstructorId), { sentAt, sentFingerprint: instructorScheduleFingerprint(rows as any) });
  res.json({ ok: true, sentAt });
});

/** الروابط الشخصية في النطاق، ومن تغيّر جدولُه منذ أُرسل إليه. */
app.get("/api/share-personal", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const [links, termRows, instructors] = await Promise.all([
    staffFamilyShareLinks(collegeId, sectionId, termId),
    Repository.getSchedulesByScope({ termId }),
    Repository.getInstructors(),
  ]);
  const rowsOf = new Map<number, any[]>();
  for (const row of termRows as any[]) {
    const key = Number(row.AdInstructorId);
    if (!rowsOf.has(key)) rowsOf.set(key, []);
    rowsOf.get(key)!.push(row);
  }
  const nameOf = new Map(instructors.map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]));
  res.json(links.filter(isPersonalStaffLink).map(link => {
    const instructorId = Number(link.AdInstructorId);
    const mark = link.marks?.[String(instructorId)] || {};
    const now = instructorScheduleFingerprint(rowsOf.get(instructorId) || []);
    return {
      id: link.id, instructorId, name: nameOf.get(instructorId) || "",
      expiresAt: link.expiresAt, revoked: Boolean(link.revoked), views: Number(link.views || 0),
      lastSentAt: mark.sentAt || "", lastSeenAt: mark.seenAt || "",
      changedSinceSent: Boolean(mark.sentFingerprint) && mark.sentFingerprint !== now,
    };
  }));
});
}
