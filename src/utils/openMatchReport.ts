/** يفتح «الاستعلامات ← مطابقة التسجيل»: العدسةُ تُطلب مرةً وتُقرأ عند فتح الاستعلامات (Reports.takeLensRequest). */
export function openMatchReport(): void {
  try { sessionStorage.setItem("schedule-report-lens", "registrar"); } catch { /* تخزينٌ محجوب: تُفتح الاستعلامات على عدستها */ }
  window.history.pushState(window.history.state, "", "/FSchedule/MainReport");
  window.dispatchEvent(new PopStateEvent("popstate"));
}
