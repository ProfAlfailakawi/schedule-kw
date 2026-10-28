/**
 * نافذتا تعديل جدول الأستاذ: الموعد العام، والاستثناء الفردي المؤقت.
 * جميع المدخلات المحلية بتوقيت الكويت (+03:00)، والحكم دائماً في الخادم.
 */
import { requestsCloseAtFromDate } from "./shareLinkLifetime";

export interface IndividualRequestException {
  opensAt: string;
  closesAt: string;
  grantedAt: string;
  grantedBy: string;
  reason: string;
  revokedAt?: string;
  revokedBy?: string;
}

/** موعد آخر دقيقة، مع الاحتفاظ بتوافق الروابط القديمة التي تحمل تاريخاً فقط. */
export function normalizeInstructorDeadline(input: unknown): string {
  const text = String(input || "").trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(text);
  if (!match) return "";
  const day = match[1], hour = match[2] ?? "23", minute = match[3] ?? "59";
  if (Number(hour) > 23 || Number(minute) > 59) return "";
  const unix = Date.parse(`${day}T${hour}:${minute}:59+03:00`);
  if (!Number.isFinite(unix)) return "";
  // يمنع قبول تاريخ غير موجود (31 فبراير) يصححه Date.parse آلياً.
  if (new Date(unix + 3 * 3600000).toISOString().slice(0, 16) !== `${day}T${hour}:${minute}`) return "";
  return match[2] == null ? requestsCloseAtFromDate(day) : new Date(unix).toISOString();
}

export function individualExceptionOpen(exception: IndividualRequestException | undefined, now: number = Date.now()): boolean {
  if (!exception || exception.revokedAt) return false;
  const opens = Date.parse(exception.opensAt), closes = Date.parse(exception.closesAt);
  return Number.isFinite(opens) && Number.isFinite(closes) && opens <= now && now <= closes;
}

/** لا يُمدد استثناءٌ حالةَ طلبٍ ثُبّت أو أُلغي، ولا يمنح الفصل المنتهي صلاحيةً جديدة. */
export function requestWindowOpen(request: {
  status: string;
  window?: { opensAt: string; closesAt: string };
  individualException?: IndividualRequestException;
}, now: number = Date.now()): boolean {
  if (request.status === "settled" || request.status === "superseded") return false;
  const opens = Date.parse(request.window?.opensAt || "");
  const closes = Date.parse(request.window?.closesAt || "");
  const general = (!Number.isFinite(opens) || now >= opens) && (!Number.isFinite(closes) || now <= closes);
  return general || individualExceptionOpen(request.individualException, now);
}
