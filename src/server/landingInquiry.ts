/**
 * ── طلبُ الاستعراض من صفحة الهبوط (FR-ENG-027) ─────────────────────────────────
 *
 * كان المسارُ يكتب الطلبَ في السجلّ ويجيب «تم» فيضيع. صار يُتحقَّق منه ويُحفظ في
 * مجموعة landingInquiries، ويصل الإدارةَ إشعاراً في الجرس. وإن تعذّر الحفظ أُجيب
 * بخطأ، فلا تقول الصفحةُ «أُرسل» وهو لم يُحفظ.
 */
import type { Request, Response } from "express";
import type { LandingInquiry } from "../types";
import type { CenterNotification } from "../utils/notificationCenter";

/** أطوالُ الحقول القصوى: ما زاد يُرفض لا يُقصّ، فلا يُحفظ نصٌّ غيرُ ما كتبه صاحبه. */
export const INQUIRY_LIMITS = { institution: 160, name: 120, email: 160, phone: 40, scale: 60, notes: 2000 } as const;
export const INQUIRY_BODY_LIMIT = "16kb";

export const INQUIRY_ERRORS = {
  institution: "اكتب اسم الجامعة أو الكلية.",
  name: "اكتب الاسم والصفة.",
  email: "اكتب بريداً إلكترونياً صحيحاً.",
  tooLong: "أحد الحقول أطول من المسموح.",
  rate: "طلباتٌ كثيرة من هذا الجهاز. حاول بعد قليل.",
  store: "تعذّر حفظ الطلب الآن.",
} as const;

export type InquiryFields = Omit<LandingInquiry, "id" | "createdAt" | "status">;
export type InquiryResult = { error: string; inquiry?: undefined } | { error?: undefined; inquiry: InquiryFields };

const text = (raw: unknown): string =>
  typeof raw === "string" || typeof raw === "number" ? String(raw).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim() : "";
const line = (raw: unknown): string => text(raw).replace(/\s+/g, " ");
const emailOk = (v: string) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(v);

/** تحقّقٌ نقيّ: يقبل `notes` ومعه `message` (اسمه القديم). */
export function cleanInquiry(body: any): InquiryResult {
  const institution = line(body?.institution);
  const name = line(body?.name);
  const email = line(body?.email).toLowerCase();
  /* «email-only» علامةٌ ترسلها الصفحة حين لا يوجد هاتف، لا رقم. */
  const phoneRaw = line(body?.phone);
  const phone = phoneRaw === "email-only" ? "" : phoneRaw;
  const scale = line(body?.scale);
  const notes = text(body?.notes ?? body?.message).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  const fields = { institution, name, email, phone, scale, notes };
  for (const key of Object.keys(INQUIRY_LIMITS) as Array<keyof typeof INQUIRY_LIMITS>) {
    if (fields[key].length > INQUIRY_LIMITS[key]) return { error: INQUIRY_ERRORS.tooLong };
  }
  if (institution.length < 2) return { error: INQUIRY_ERRORS.institution };
  if (name.length < 2) return { error: INQUIRY_ERRORS.name };
  if (!emailOk(email)) return { error: INQUIRY_ERRORS.email };
  return { inquiry: { institution, name, email, ...(phone ? { phone } : {}), ...(scale ? { scale } : {}), ...(notes ? { notes } : {}) } };
}

/* حدُّ المعدّل لكل عنوان: خمسةُ طلباتٍ في عشر دقائق، وذاكرةٌ محدودة. */
const RATE_MAX = 5;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_CAPACITY = 5000;

export interface InquiryDeps {
  create: (entry: InquiryFields) => Promise<LandingInquiry>;
  list: () => Promise<LandingInquiry[]>;
  databaseDown: () => boolean;
  now?: () => number;
}

export function createLandingInquiryHandler(deps: InquiryDeps) {
  const clock = deps.now || Date.now;
  const windows = new Map<string, { n: number; at: number }>();
  const underLimit = (key: string): boolean => {
    const now = clock();
    const cur = windows.get(key);
    if (!cur || now - cur.at >= RATE_WINDOW_MS) {
      if (windows.size >= RATE_CAPACITY) for (const [k, v] of windows) if (now - v.at >= RATE_WINDOW_MS) windows.delete(k);
      if (windows.size >= RATE_CAPACITY) windows.delete(windows.keys().next().value as string);
      windows.set(key, { n: 1, at: now });
      return true;
    }
    cur.n += 1;
    return cur.n <= RATE_MAX;
  };
  return async (req: Request, res: Response) => {
    if (deps.databaseDown()) { res.status(503).json({ success: false, error: INQUIRY_ERRORS.store }); return; }
    if (!underLimit(String(req.ip || "unknown"))) { res.status(429).json({ success: false, error: INQUIRY_ERRORS.rate }); return; }
    const parsed = cleanInquiry(req.body);
    if (parsed.error) { res.status(400).json({ success: false, error: parsed.error }); return; }
    const inquiry = parsed.inquiry!;
    try {
      /* الضغطُ المكرّر (البريدُ والجهةُ نفسهما خلال ساعة) لا يُنشئ طلباً ثانياً؛ الأول محفوظ. */
      const recent = await deps.list();
      const dup = recent.find(row => row.email === inquiry.email && row.institution === inquiry.institution && clock() - Date.parse(row.createdAt) < 3_600_000);
      const saved = dup || await deps.create(inquiry);
      console.log("[landing-inquiry] stored", { id: saved.id, duplicate: Boolean(dup) });
      res.status(dup ? 200 : 201).json({ success: true, id: saved.id, message: "وصل طلبكم وحُفظ لدى إدارة النظام، وسنتواصل معكم على بريدكم." });
    } catch (error) {
      console.error("[landing-inquiry] store failed:", error instanceof Error ? error.message : error);
      res.status(503).json({ success: false, error: INQUIRY_ERRORS.store });
    }
  };
}

/** من يرى طلبات الاستعراض: إدارةُ النظام وحدها (الحسابُ الرئيسي أو مديرٌ بلا صفةٍ أكاديمية)، وليس في الصندوق التجريبي. */
export function canSeeLandingInquiries(input: { isRootAdmin: boolean; isAdminUser: boolean; academicRole: boolean; demoRequest: boolean }): boolean {
  if (input.demoRequest) return false;
  return input.isRootAdmin || (input.isAdminUser && !input.academicRole);
}

/** إشعارُ الجرس لكل طلبٍ جديد خلال ثلاثين يوماً، فيه ما يكفي للتواصل. */
export function landingInquiryNotifications(rows: LandingInquiry[], now = Date.now()): CenterNotification[] {
  const since = now - 30 * 86_400_000;
  return rows
    .filter(row => row.status === "new" && Date.parse(row.createdAt) >= since)
    .slice(0, 30)
    .map(row => ({
      id: `landing-inquiry:${row.id}`,
      tone: "action" as const,
      title: `طلب استعراض من «${row.institution}»`,
      detail: [`${row.name} · ${row.email}`, row.phone, row.scale, row.notes ? (row.notes.length > 160 ? `${row.notes.slice(0, 160)}…` : row.notes) : ""].filter(Boolean).join(" — "),
      at: row.createdAt,
    }));
}
