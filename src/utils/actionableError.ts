/**
 * ── خطأٌ يقول ما حدث وماذا تفعل (K3) ─────────────────────────────────────────
 *
 * «تعذّر إتمام العملية الآن. حاول مرة أخرى…» was the only sentence a reader of
 * «مركز الذكاء» ever got, whatever had happened: a permission edge, a page that
 * was not deployed, a network drop, or a read that failed on the server. Each of
 * those wants a different next step, so each gets an icon, one short reason and
 * — only when it can help — a retry. The technical detail (status, route, the
 * server's reference) is kept for administrators and the console, never shown
 * as the headline.
 *
 * Pure: it classifies, it does not render.
 */

export type ActionableErrorKind = "offline" | "permission" | "missing" | "validation" | "busy" | "server" | "unknown";

export interface ActionableError {
  kind: ActionableErrorKind;
  /** Two or three words for the headline. */
  title: string;
  /** One sentence the reader can act on. */
  reason: string;
  /** Whether pressing «أعد المحاولة» could change the answer. */
  retryable: boolean;
  /** For administrators: status · route · server reference. */
  technical: string;
}

interface ErrorLike { message?: unknown; status?: unknown; ref?: unknown; code?: unknown; issues?: unknown; url?: unknown }

export function classifyActionableError(value: unknown): ActionableError {
  const error = (value && typeof value === "object" ? value : { message: value }) as ErrorLike;
  const message = String(error.message || "").trim();
  const status = Number(error.status || 0);
  const ref = String(error.ref || "").trim();
  const route = String(error.url || "").split("?")[0];
  const technical = [status ? `HTTP ${status}` : "", route, ref ? `مرجع ${ref}` : "", error.code ? String(error.code) : ""].filter(Boolean).join(" · ");
  const issues = Array.isArray(error.issues) ? error.issues.filter(Boolean).map(String).slice(0, 3) : [];

  if (/Failed to fetch|NetworkError|Load failed|دون اتصال/i.test(message) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    return { kind: "offline", title: "لا اتصال", reason: "تحقق من الإنترنت؛ لم يُحفظ أي تغيير.", retryable: true, technical };
  }
  if (status === 401 || status === 403) {
    return { kind: "permission", title: "خارج صلاحيتك", reason: message || "هذا النطاق خارج الأقسام المسموحة لك.", retryable: false, technical };
  }
  if (status === 404 || /API endpoint not found/i.test(message)) {
    return { kind: "missing", title: "غير متاح بعد", reason: "هذه الأداة لم تُنشر على الخادم بعد.", retryable: false, technical };
  }
  if (status === 400 || status === 409 || status === 422 || issues.length) {
    return { kind: "validation", title: "يحتاج مراجعة", reason: issues.length ? `${message}: ${issues.join(" · ")}` : message || "البيانات المرسلة تحتاج مراجعة.", retryable: false, technical };
  }
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return { kind: "busy", title: "الخادم مشغول", reason: "أعد المحاولة بعد لحظات.", retryable: true, technical };
  }
  if (status >= 500) {
    return { kind: "server", title: "تعذّرت القراءة", reason: "حدث خلل في الخادم أثناء هذه القراءة؛ بقية الصفحة تعمل.", retryable: true, technical };
  }
  return { kind: "unknown", title: "لم تكتمل", reason: message || "لم تكتمل العملية.", retryable: true, technical };
}
