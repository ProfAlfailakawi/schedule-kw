import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importRowKey, type ImportRow } from "../components/ImportPreviewTable";
import { importRowsSignature } from "../utils/importGate";

/**
 * ── فحصُ البوابة قبل الضغط ──
 *
 * يسأل `import-preflight`: الفحص نفسه الذي يرفض به الحفظ والنشر، على الفصل كله. وهو
 * موضعٌ واحد للشاشتين (أدوات الجدول، ومركز الذكاء).
 *
 * - الملف الجديد يُفحص فوراً؛ لا مهلة تنتظر كتابةً لم تبدأ. المهلة للتعديل المتتالي وحده.
 * - يُعاد الفحص حين يتغيّر ما يقرؤه الفحص (التوقيع)، لا كلما وُلدت مصفوفة صفوفٍ جديدة.
 * - ملاحظات الجولة السابقة تبقى على خلاياها حتى تحلّ جولةٌ محلّها، فلا تختفي الحمرة
 *   لحظةً ثم تعود؛ لكنها لا تُحسب في منع النشر إلا إن كانت تخصّ الصفوف الحالية بالذات.
 * - تعذّر الفحص يُقال («failed») ولا يُعامَل كنجاح، والبوابة على الخادم تبقى الحارس الأخير.
 */
export const IMPORT_EDIT_DEBOUNCE_MS = 300;

type RowCheck = { row: number; text: string };
type Result = { signature: string; notes: Record<string, string[]>; issues: string[]; rowChecks: RowCheck[]; failed: boolean };
export type ImportPreflight = {
  state: "idle" | "pending" | "done" | "failed";
  /** تخصّ الصفوف الحالية بالذات؛ وحدها تمنع النشر. */
  issues: string[];
  /** ما يرفضه الحفظ صفاً صفاً (الوقت، القاعة، الأستاذ…): مفصولة لأن الفحص المحلي يقول بعضها. */
  rowChecks: RowCheck[];
  /** ملاحظات الخلايا: من آخر جواب، ولو كان فحصٌ أحدث جارياً. */
  notes: Record<string, string[]>;
  retry: () => void;
};

const NO_NOTES: Record<string, string[]> = {};
const NO_ISSUES: string[] = [];
const NO_CHECKS: RowCheck[] = [];

export function readPreflightAnswer(data: any, rows: ImportRow[]) {
  const notes: Record<string, string[]> = {};
  const issues: string[] = [];
  const label = (at: number) => (at + 1).toLocaleString("ar-KW-u-nu-latn");
  (Array.isArray(data?.conflicts) ? data.conflicts : []).forEach((item: any) => {
    const message = String(item?.message || "تعارض يمنع النشر");
    const here = Number.isInteger(item?.rowIndex) ? Number(item.rowIndex) : null;
    const there = Number.isInteger(item?.otherIndex) ? Number(item.otherIndex) : null;
    /* الطرف الآخر إمّا صف في المسودة فيُسمّى برقمه، وإمّا موعد محفوظ لقسم
       آخر لا رقم له هنا — وهو بالضبط ما كانت الشاشة تعجز عن قوله. */
    const otherLabel = String(item?.otherLabel || "").trim();
    const partner = there !== null ? `مع الصف ${label(there)}` : otherLabel ? `مع موعد محفوظ في ${otherLabel}` : "مع موعد محفوظ خارج هذا الجدول";
    [here, there].forEach(at => {
      if (at === null) return;
      const row = rows[at];
      if (!row) return;
      const key = importRowKey(row);
      const other = at === here ? partner : (here !== null ? `مع الصف ${label(here)}` : partner);
      notes[key] = [...new Set([...(notes[key] || []), `${message} ${other}`])];
    });
    if (here !== null) issues.push(`الصف ${label(here)}: ${message} ${partner}.`);
    else issues.push(`${message} ${partner}.`);
  });
  const rowChecks: RowCheck[] = [];
  (Array.isArray(data?.issues) ? data.issues : []).forEach((item: unknown) => {
    const match = String(item || "").trim().match(/^السطر\s+(\d+)\s*:\s*(.*)$/);
    if (!match) { if (item) issues.push(String(item)); return; }
    const row = rows[Number(match[1]) - 1];
    if (row) { const key = importRowKey(row); notes[key] = [...new Set([...(notes[key] || []), match[2].trim()])]; }
    rowChecks.push({ row: Number(match[1]), text: `الصف ${match[1]}: ${match[2].trim()}` });
  });
  return { notes, issues: [...new Set(issues)], rowChecks };
}

export function useImportPreflight({ enabled, collegeId, sectionId, termId, rows, importLayout }: {
  enabled: boolean; collegeId: number; sectionId: number; termId: number; rows: ImportRow[]; importLayout: "authority-pdf" | "worksheet";
}): ImportPreflight {
  const signature = useMemo(() => (enabled ? importRowsSignature(rows) : ""), [enabled, rows]);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  /* المهلة لمن يعدّل، لا لمن فتح ملفاً: أول جولة لكل ملف بلا انتظار. */
  const answeredRef = useRef(false);

  useEffect(() => {
    if (!enabled || !collegeId || !sectionId || !termId) { answeredRef.current = false; setResult(null); return; }
    const sent = rowsRef.current;
    if (!sent.length) { setResult({ signature, notes: {}, issues: [], rowChecks: [], failed: false }); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/schedules/import-preflight", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ collegeId, sectionId, termId, rows: sent, importLayout }),
        });
        if (!response.ok) throw new Error("preflight");
        answeredRef.current = true;
        setResult({ signature, ...readPreflightAnswer(await response.json(), sent), failed: false });
      } catch (fault: any) {
        if (fault?.name === "AbortError") return;
        answeredRef.current = true;
        setResult({ signature, notes: {}, issues: [], rowChecks: [], failed: true });
      }
    }, answeredRef.current ? IMPORT_EDIT_DEBOUNCE_MS : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enabled, collegeId, sectionId, termId, signature, importLayout, attempt]);

  const retry = useCallback(() => { setResult(null); setAttempt(value => value + 1); }, []);
  const fresh = Boolean(result && result.signature === signature);
  return useMemo(() => ({
    state: !enabled ? "idle" : !fresh ? "pending" : result!.failed ? "failed" : "done",
    issues: fresh ? result!.issues : NO_ISSUES,
    rowChecks: fresh ? result!.rowChecks : NO_CHECKS,
    notes: result?.notes || NO_NOTES,
    retry,
  }), [enabled, fresh, result, retry]);
}
