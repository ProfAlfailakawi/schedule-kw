/**
 * «تقاريري» من الخادم: ما حفظتَه، وما شاركه زملاءُ قسمك. يُرحِّل ما كان محفوظاً في المتصفح (مرةً واحدة)،
 * ويتراجع بهدوء إلى قائمةٍ فارغة إن تعذّر الخادم — الاستعلام نفسه لا يتوقف على الحفظ.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { clearLocalSavedReports, readLocalSavedReports, type SavedReport, type SharedReportState } from "../utils/reportShare";

export function useSavedReports(owner: number) {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [problem, setProblem] = useState("");
  const migrated = useRef(false);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/reports/saved");
      if (!response.ok) throw new Error();
      const data = await response.json();
      setReports(Array.isArray(data?.reports) ? data.reports : []);
    } catch { /* الاستعلام لا يتوقف على الحفظ */ }
  }, []);

  const save = useCallback(async (input: { name: string; state: SharedReportState; shared: boolean; watch: boolean; id?: string }) => {
    setProblem("");
    try {
      const response = await fetch("/api/reports/saved", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setProblem(String(data?.error || "تعذّر الحفظ")); return null; }
      await reload();
      return data.report as SavedReport;
    } catch { setProblem("تعذّر الحفظ"); return null; }
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    setReports(previous => previous.filter(item => item.id !== id));
    try { await fetch(`/api/reports/saved/${encodeURIComponent(id)}`, { method: "DELETE" }); } catch { /* يُعاد عند التحميل */ }
    void reload();
  }, [reload]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!migrated.current) {
        migrated.current = true;
        const local = readLocalSavedReports(owner);
        if (local.length) {
          const done = await Promise.all(local.map(item => fetch("/api/reports/saved", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.name, state: item.state, shared: false, watch: false }) }).then(r => r.ok).catch(() => false)));
          if (done.every(Boolean)) clearLocalSavedReports(owner);
        }
      }
      if (alive) await reload();
    })();
    return () => { alive = false; };
  }, [owner, reload]);

  return { reports, problem, save, remove, reload };
}
