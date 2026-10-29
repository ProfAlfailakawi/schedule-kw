import React, { useMemo } from "react";
import qrcode from "../utils/qrcodeGenerator";
import { formatReportStampCode, reportStampUrl } from "../utils/reportStamp";

type QrSymbol = { addData(data: string, mode?: string): void; make(): void; getModuleCount(): number; isDark(row: number, col: number): boolean };
type QrFactory = (typeNumber: number, level: "L" | "M" | "Q" | "H") => QrSymbol;

/**
 * ── الختم في ذيل الورقة ────────────────────────────────────────────────────
 *
 * مربعٌ صغير في الطرف الأيسر من الذيل، بارتفاع خانات التوقيع لا أكثر: لا يزيد
 * الذيلَ مليمتراً، فلا يُسقط صفاً من الصفحة. والرمزُ مكتوبٌ بجانبه رأسياً لمن
 * يريد أن يكتبه بيده.
 *
 * يُرسم متزامناً من المولّد الموجود في المشروع (لا خدمة خارجية): الختم جزءٌ
 * من الورقة ساعةَ أمر الطباعة، ولا مكان لانتظارٍ بينهما. وإن تعذّر رسمه
 * تُطبع الورقة كما كانت — ورقةٌ بلا ختمٍ خيرٌ من ورقةٍ لا تُطبع.
 */
export default function PrintStamp({ code, origin }: { code?: string | null; origin?: string }) {
  const symbol = useMemo(() => {
    if (!code) return null;
    try {
      const url = reportStampUrl(origin ?? (typeof window !== "undefined" ? window.location.origin : ""), code);
      const qr = (qrcode as unknown as QrFactory)(0, "M");
      qr.addData(url, /^[0-9A-Z $%*+\-./:]+$/.test(url) ? "Alphanumeric" : "Byte");
      qr.make();
      const size = qr.getModuleCount();
      /* مسارٌ واحد بخطوطٍ أفقية متصلة: أخفّ على الطابعة من مئات المربعات. */
      let path = "";
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          if (!qr.isDark(row, col)) continue;
          let run = 1;
          while (col + run < size && qr.isDark(row, col + run)) run += 1;
          path += `M${col} ${row}h${run}v1h-${run}z`;
          col += run - 1;
        }
      }
      return { size, path };
    } catch {
      return null;
    }
  }, [code, origin]);
  if (!code || !symbol) return null;
  return (
    <div className="print-stamp" aria-label={`ختم الورقة ${formatReportStampCode(code)}`}>
      <svg className="print-stamp-qr" viewBox={`-1 -1 ${symbol.size + 2} ${symbol.size + 2}`} shapeRendering="crispEdges" aria-hidden="true">
        <path d={symbol.path} />
      </svg>
      <small className="print-stamp-code" dir="ltr">{formatReportStampCode(code)}</small>
    </div>
  );
}
