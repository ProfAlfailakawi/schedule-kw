/**
 * ربطُ «رمز استعادة لطالب» (src/server/studentRecovery.ts) بالمستودع والصلاحيات والنطاق.
 * مفصولٌ عن المنطق ليُختبر المنطقُ بخادمٍ صغيرٍ ومخزنٍ في الذاكرة.
 *
 * من يُصدر: من يفتح «كشف التسجيل» نفسَه — إذنُ الجدول (٧) أو تقارير القسم (١٤: المرشد) —
 * وليس من صفات العرض الصرف (العميد ونائبه وعميد التسجيل). ومديرُ النظام لكل قسم.
 */
import type { Request } from "express";
import { Repository } from "../db/repository";
import { isViewerOnlyRole } from "../utils/academicRoles";
import { type AuthenticatedRequest, isPowerUser } from "./core/auth";
import { isScopeAllowed } from "./core/scope";
import { openStudentIdentity, studentIdentityKey, surveyFingerprint } from "./core/studentIdentity";
import type { RecoveryIssuer, StudentRecoveryDeps } from "./studentRecovery";

export async function issuerOf(request: Request): Promise<RecoveryIssuer | { status: number; error: string }> {
  const req = request as AuthenticatedRequest;
  if (!req.user) return { status: 401, error: "الرجاء تسجيل الدخول أولاً" };
  const power = isPowerUser(req);
  if (!power) {
    if (isViewerOnlyRole(req.user.Role)) return { status: 403, error: "هذه الصفة للعرض فقط." };
    const granted = req.permissions ?? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(item => Number(item.FormNameId));
    if (!granted.some(id => id === 7 || id === 14)) return { status: 403, error: "ليس لديك صلاحية كشف التسجيل." };
  }
  return {
    id: Number(req.user.SystemUserId), name: String(req.user.Name || req.user.SystemUserLogin || ""), power,
    scopeAllows: (collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId),
  };
}

export function studentRecoveryDeps(): StudentRecoveryDeps {
  return {
    issuer: issuerOf,
    fingerprint: surveyFingerprint,
    identityKey: studentIdentityKey,
    getProfile: fingerprint => Repository.getStudentProfile(fingerprint),
    updateProfile: (fingerprint, mutate) => Repository.updateStudentProfile(fingerprint, mutate),
    openIdentity: cipher => openStudentIdentity(cipher),
    sectionName: async sectionId => String((await Repository.getSections() as any[]).find(row => Number(row.AdSectionId) === sectionId)?.AdSectionName || ""),
    audit: entry => Repository.createAuditLog({
      SystemUserId: entry.issuer.id, userName: entry.issuer.name, method: "POST", path: "/api/student-recovery/code",
      action: entry.action, entity: "studentProfile", entityId: entry.fingerprintTail, status: entry.status,
    }),
  };
}
