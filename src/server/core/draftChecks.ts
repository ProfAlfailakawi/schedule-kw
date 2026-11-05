/**
 * ── مسودة بداية الفصل تمرّ من بوابة الموعد نفسها ─────────────────────────────
 *
 * كانت المسودة تُفحص بفحص الاستيراد وحده (الحقول والمكان وتعارض القاعة والأستاذ)، فتُنشر مواعيد لو كُتبت
 * واحداً واحداً لرفضها «موعد جديد»: نمطٌ غير معتمد، أو ساعاتٌ تزيد على المعتمد، أو حجزُ طلب أستاذ، أو
 * قاعةٌ خارج النطاق. هنا كلُّ صفٍّ يُسأل عنه ما يُسأل عن الموعد — الدوالُّ نفسها، لا فاحصٌ ثانٍ —
 * على «الفصل كما سيصير» (أقسامُ الفصل الأخرى + صفوف المسودة). والتنبيه اللطيف يُعرض ولا يمنع.
 */
import type { FSchedule } from "../../types";
import { scheduleConflicts } from "./scheduleConflicts";
import { scheduleLengthIssue, schedulePayloadIssues, unapprovedPatternIssue } from "./scheduleRules";

export const isGenesisDraft = (draft: { name?: unknown }) => /^بداية الفصل/.test(String(draft?.name || ""));

export interface DraftChecks { issues: string[]; rowIssues: Record<string, string[]>; rowWarnings: Record<string, string[]> }

/** يكفي لسؤال الصفوف على دفعات دون أن تتزاحم قراءات الفحص على المخزن. */
const CONCURRENT_ROWS = 8;

export async function draftAppointmentChecks(req: Parameters<typeof scheduleConflicts>[0], rows: any[], external: FSchedule[]): Promise<DraftChecks> {
  const week = [...external, ...rows] as FSchedule[];
  const rowIssues: Record<string, string[]> = {}, rowWarnings: Record<string, string[]> = {};
  const add = (bucket: Record<string, string[]>, id: unknown, message: unknown) => {
    const text = String(message || "").trim();
    if (!text) return;
    const key = String(Number(id));
    bucket[key] = [...new Set([...(bucket[key] || []), text])];
  };
  const check = async (row: any) => {
    try {
      for (const message of await schedulePayloadIssues(row)) add(rowIssues, row.id, message);
      add(rowIssues, row.id, await scheduleLengthIssue(row, week));
      add(rowIssues, row.id, await unapprovedPatternIssue(row, week));
      for (const conflict of await scheduleConflicts(req, row, Number(row.id), week)) add((conflict as any).soft ? rowWarnings : rowIssues, row.id, (conflict as any).message);
    } catch (error) {
      /* فحصٌ لم يكتمل لا يُقرأ سلامةً. */
      console.error("Draft appointment check failed:", error);
      add(rowIssues, row.id, "تعذّر فحص هذا الموعد. أعد المحاولة قبل النشر.");
    }
  };
  for (let at = 0; at < rows.length; at += CONCURRENT_ROWS) await Promise.all(rows.slice(at, at + CONCURRENT_ROWS).map(check));
  const issues = rows.flatMap(row => (rowIssues[String(Number(row.id))] || []).map(message => `${row.AdCourseName || "مقرر"} · ش${row.SCode || "—"}: ${message}`));
  return { issues: [...new Set(issues)], rowIssues, rowWarnings };
}

/** يضمّ ملاحظات الموعد إلى ملاحظات الصف، بلا تكرار. */
export function mergeRowIssues(base: Record<string, string[]>, extra: Record<string, string[]>) {
  const out: Record<string, string[]> = { ...base };
  for (const [key, list] of Object.entries(extra)) out[key] = [...new Set([...(out[key] || []), ...list])];
  return out;
}
