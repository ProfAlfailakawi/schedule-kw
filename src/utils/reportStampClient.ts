import type { ReportStampClaim } from "./reportStamp";
import { safeStorage } from "./safeStorage";

/**
 * ── تسجيل الختم بعد أمر الطباعة ────────────────────────────────────────────
 *
 * يُرسل بعد الأمر ولا يُنتظر: أمرُ الطباعة لا يحتمل قراءةً شبكية قبله. وما
 * تعثّر لانقطاع شبكة يُحفظ ويُعاد عند فتح الاستعلامات التالي، فلا تبقى ورقةٌ
 * في يد أحدٍ بختمٍ لا يعرفه النظام. وما رفضه الخادم رفضاً (صلاحية، ختمٌ لا
 * يطابق صفوفه) لا يُعاد: إعادته لا تغيّر الجواب.
 */
const QUEUE_KEY = "schedule.reportStamps.pending.v1";
const QUEUE_MAX = 12;
/* المتصفح يرفض طلب keepalive فوق ٦٤ كيلوبايت؛ ورقةٌ بهذا الحجم تُرسل طلباً عادياً. */
const KEEPALIVE_LIMIT = 60_000;

const readQueue = (): ReportStampClaim[] => {
  try {
    const list = JSON.parse(safeStorage.get(QUEUE_KEY) || "[]");
    return Array.isArray(list) ? list.filter(item => item && typeof item.code === "string") : [];
  } catch {
    return [];
  }
};

const writeQueue = (list: ReportStampClaim[]) => {
  if (list.length) safeStorage.set(QUEUE_KEY, JSON.stringify(list.slice(-QUEUE_MAX)));
  else safeStorage.remove(QUEUE_KEY);
};

async function post(claim: ReportStampClaim): Promise<"done" | "retry"> {
  const body = JSON.stringify(claim);
  try {
    const response = await fetch("/api/report-stamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: body.length < KEEPALIVE_LIMIT,
    });
    if (response.ok) return "done";
    /* ٤٠١: الجلسة انتهت، فيُعاد بعد الدخول. ٤٠٨ و٤٢٩ و٥xx: عارضٌ يزول. */
    return response.status === 401 || response.status === 408 || response.status === 429 || response.status >= 500 ? "retry" : "done";
  } catch {
    return "retry";
  }
}

export function sendReportStamp(claim: ReportStampClaim | null | undefined): void {
  if (!claim) return;
  void post(claim).then(result => {
    if (result === "retry") writeQueue([...readQueue().filter(item => item.code !== claim.code), claim]);
  });
}

/** يعيد إرسال ما تعثّر من قبل. يُنادى عند فتح الاستعلامات. */
export function flushPendingReportStamps(): void {
  const queued = readQueue();
  if (!queued.length) return;
  writeQueue([]);
  queued.forEach(claim => sendReportStamp(claim));
}
