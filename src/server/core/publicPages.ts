/**
 * ── الصفحاتُ العامة: تلميحُ التجربة وسياسةُ المحتوى ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Response } from "express";
import { randomBytes } from "crypto";
import { Repository } from "../../db/repository";
import { normalizeCivilId } from "../../utils/civilId";
import type { ScheduleShareLink } from "../../types";
import { isFacultyPlaceholder } from "../../utils/placeholderInstructor";
import { demoTeacherRequest } from "./demo";

/* The old `staff-ics?civil=…` route is gone. A subscription URL is stored by
   the phone and repeated in every server log for as long as it lives, and a
   civil ID has no business being either. `/api/public/ics/:token/:key` above
   carries a derived key instead and says the same thing. */

/**
 * The instructor card page: one file, no bundle, no account.
 *
 * It opens on a single question — the civil ID — and turns into a personal
 * week once answered. Everything is inline so it loads on a weak connection
 * and keeps working when the campus network is slow.
 */
/**
 * ── الصفحات العامة: سياسة صارمة، لأن مصدرها كلّه من هنا ─────────────────────
 *
 * These pages are the one surface an unauthenticated stranger reaches, and they
 * interpolate text the system did not author — a label, an OCR'd name, a message
 * typed by a visitor. Everything on them is escaped, but escaping is a rule that
 * has to hold at every single site; this is the wall that holds when one of them
 * someday does not.
 *
 * Their markup is written entirely by this file, so a per-response nonce is
 * reliable in a way it is not for a bundled application shell: only the four
 * scripts below carry it, and an injected script tag — having no nonce — does
 * not run at all.
 *
 * `style-src` stays 'unsafe-inline' deliberately. These pages carry a handful of
 * `style="…"` attributes, which a nonce cannot cover, and a nonce on the same
 * directive would *disable* the allowance they need. An inline style cannot
 * execute; with scripts nonced and `object-src 'none'`, letting them through
 * costs nothing that matters.
 */
/*
 * ── تلميحُ البيئة التجريبية على الصفحات العامة ──────────────────────────────
 *
 * بطاقةُ الأستاذ والاستبيانُ و«حالة طلبي» وطلبُ الجدول كلُّها تطلب رقماً مدنياً
 * — وزائرُ التجربة لا يعرف رقماً يطابق شيئاً في صندوقه، فتقف الرحلةُ عند أول
 * حقل. فتقترح الصفحةُ في البيئة التجريبية وحدها رقماً وهمياً يعمل: أستاذاً في
 * القسم، وطالباً جديداً، وحالةً مبذورةً برقمها.
 *
 * ولا يُكتب شيءٌ من هذا في الحقيقي أبداً: الشرطُ الأول `isDemoRequest`، وهو لا
 * يصدق إلا والطلبُ مربوطٌ بصندوقٍ برمز رابطه (bindPublicLinkContext).
 */
export async function demoPageHint(link: ScheduleShareLink, page: "staff" | "survey" | "status" | "request"): Promise<string> {
  if (!Repository.isDemoRequest()) return "";
  /* الرقمُ مع زرّ «نسخ الرقم»: التحديدُ بالإصبع كان يقطع الرقم، فالنسخُ بضغطةٍ (DEMO_COPY_SCRIPT). */
  const num = (value: string) => {
    const digits = String(value).replace(/[^0-9A-Z]/gi, "");
    return `<span class="demo-num"><bdi dir="ltr" style="font-weight:700;user-select:all;-webkit-user-select:all">${digits}</bdi>`
      + `<button type="button" class="demo-copy" data-demo-copy="${digits}" aria-live="polite" title="نسخ الرقم" aria-label="نسخ الرقم ${digits}">`
      + `<svg class="ic-copy" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>`
      + `<svg class="ic-ok" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button></span>`;
  };
  const lines: string[] = [];
  if (page === "staff" || page === "request") {
    const ownerId = Number(link.AdInstructorId || 0);
    const rows = ownerId ? [] : await Repository.getSchedulesByScope({ collegeId: link.AdCollegeId, sectionId: link.AdSectionId, termId: link.AdTermId });
    const ids = ownerId ? [ownerId] : [...new Set(rows.map(row => Number(row.AdInstructorId)))].sort((a, b) => a - b);
    /* في بطاقة القسم يُقترح رقمُ أستاذ التجربة نفسه (من له طلبٌ ينتظره)، فيجد بعد الدخول رابطَ طلبه؛ أمّا البطاقةُ الشخصية فرقمُ صاحبها وحده (غيره يُردّ). */
    const demoOwner = page === "staff" && !ownerId ? Number((await demoTeacherRequest())?.AdInstructorId || 0) : 0;
    const instructors = await Repository.getInstructors();
    const person = (demoOwner ? instructors.find(row => Number(row.AdInstructorId) === demoOwner && normalizeCivilId(row.AdInstructorCivil)) : undefined)
      || instructors.find(row => !isFacultyPlaceholder(row) && ids.includes(Number(row.AdInstructorId)) && normalizeCivilId(row.AdInstructorCivil));
    if (person) lines.push(page === "request"
      ? `رقمُ صاحب هذا الرابط المدني (وهمي) للتوقيع عند الإرسال: ${num(normalizeCivilId(person.AdInstructorCivil))}`
      : `جرّب الرقم المدني ${num(normalizeCivilId(person.AdInstructorCivil))} — أستاذٌ وهمي في هذا القسم.`);
  }
  const guide = Repository.getDemoGuide();
  if (page === "survey" && guide) {
    lines.push(`طالبٌ جديد: الرقم المدني ${num(guide.freshStudentCivil)} وأيُّ اسمٍ ثلاثي.`);
    const graduate = guide.cases[0];
    if (graduate) lines.push(`أو افتح حالةً مبذورة (${graduate.label}): الرقم المدني ${num(graduate.civil)} · رقم الحالة ${num(graduate.caseRef)}.`);
  }
  if (page === "status" && guide) {
    for (const entry of guide.cases.slice(0, 3)) lines.push(`${entry.label}: الرقم المدني ${num(entry.civil)} · رقم الحالة ${num(entry.caseRef)}`);
  }
  if (!lines.length) return "";
  const copyCss = `<style>.demo-num{display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap;vertical-align:middle}`
    + `.demo-copy{display:inline-grid;place-items:center;inline-size:34px;block-size:34px;padding:0;border-radius:50%;border:1px solid #c79b5f;background:#fffdf7;color:#5b4520;font:inherit;font-size:11.5px;font-weight:700;line-height:1.4;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .15s ease,color .15s ease,border-color .15s ease}`
    + `.demo-copy svg{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none;grid-area:1/1}.demo-copy .ic-ok{display:none}.demo-copy[data-copied] .ic-copy{display:none}.demo-copy[data-copied] .ic-ok{display:block}`
    + `.demo-copy:hover{background:#f6e7c6}.demo-copy:focus-visible{outline:2px solid #5b4520;outline-offset:2px}.demo-copy:active{transform:scale(.97)}`
    + `.demo-copy[data-copied]{background:#e8f5ee;border-color:#8fc7a9;color:#1f6b46}</style>`;
  return `${copyCss}<div class="demo-hint" role="note" style="margin:10px 0;padding:8px 11px;border-radius:10px;background:#fff7e6;border:1px dashed #c79b5f;color:#5b4520;font-size:12px;line-height:1.65;text-align:start"><b>بيئة تجريبية</b> — الأرقام وهمية.<br>${lines.join("<br>")}</div>`;
}

export function publicPageNonce(res: Response): string {
  const nonce = randomBytes(16).toString("base64");
  res.setHeader("Content-Security-Policy", [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    /* `blob:` is not decoration here: the proof upload shrinks a photo before
       sending it by drawing `URL.createObjectURL(file)` into a canvas. Without
       it that image fails to load, the compression path quietly falls back, and
       phones upload full-size originals over mobile data. */
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    /* manifest-src يرجع إلى default-src 'none' فيُحجب `<link rel=manifest>` (تثبيتُ «مساري» مستقلاً). */
    "manifest-src 'self'",
    /* عاملُ تنبيهات الكرت (/push-sw.js): بلا هذا يرجع worker-src إلى script-src بالـnonce فيُحجب التسجيل. */
    "worker-src 'self'",
    "base-uri 'none'",
    /* 'self', not 'none': the survey form is submitted by script and normally
       never navigates, but if that script ever fails the browser falls back to a
       native submit — which should reach this application, not be dropped. */
    "form-action 'self'",
    ...(process.env.APPLET_ID ? [] : ["frame-ancestors 'none'"]),
  ].join("; "));
  return nonce;
}
