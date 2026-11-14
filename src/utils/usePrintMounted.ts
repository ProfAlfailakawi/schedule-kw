/**
 * ورقةُ طباعة الجدول (ألفُ صفٍّ في جدولٍ واحد) لا تُركَّب في الصفحة إلا حين تُطلب الطباعة فعلاً.
 * كانت تُركَّب دائماً فتضيف آلافَ العُقد إلى كل عرضٍ وكل تفاعل (قياس W7b: 1048 سطرَ <tr> مع لوحةٍ من ألف موعد).
 *
 * الإشارة: beforeprint (Ctrl+P وwindow.print) أو مطابقةُ وسائط print (معاينةٌ/PDF بلا الحدث)؛ والتركيبُ متزامنٌ
 * (flushSync) كي يجد المتصفحُ الورقةَ في DOM قبل أن يرسم الصفحة. تنتهي بـ afterprint أو بعودة وسائط الشاشة.
 */
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

export function usePrintMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const on = () => { try { flushSync(() => setMounted(true)); } catch { setMounted(true); } };
    const off = () => setMounted(false);
    window.addEventListener("beforeprint", on);
    window.addEventListener("afterprint", off);
    const query = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
    const onQuery = (event: MediaQueryListEvent) => { if (event.matches) on(); else off(); };
    query?.addEventListener?.("change", onQuery);
    if (query?.matches) setMounted(true);
    return () => {
      window.removeEventListener("beforeprint", on);
      window.removeEventListener("afterprint", off);
      query?.removeEventListener?.("change", onQuery);
    };
  }, []);
  return mounted;
}
