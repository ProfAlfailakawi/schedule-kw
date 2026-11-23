/**
 * بوابة «نبض القاعات» الكسولة: هذا الملف وحده في الحزمة الأولى. three.js والشاشة
 * وأنماطها تُحمَّل عند أول فتح، ومعها هيكل انتظارٍ بلون المسرح.
 */
import React, { Suspense, lazy } from "react";
import type { HallPulseProps } from "./HallPulse";

const HallPulse = lazy(() => import("./HallPulse"));

export type { HallPulseProps, HallPulseMove } from "./HallPulse";

export default function HallPulseLazy(props: HallPulseProps) {
  return (
    <Suspense fallback={
      <div className="hp-boot" role="status" aria-busy="true">
        <span className="hp-boot-dot" aria-hidden="true" />
        <span>يجهّز نبض القاعات…</span>
      </div>
    }>
      <HallPulse {...props} />
    </Suspense>
  );
}
