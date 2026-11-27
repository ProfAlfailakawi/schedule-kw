/**
 * بوابة «الحرم كله» الكسولة: three.js والمدينة وأنماطها تُحمَّل عند أول فتح مع
 * حزمة النبض نفسها، وهذا الملف وحده في الحزمة الأولى.
 */
import React, { Suspense, lazy } from "react";
import type { CampusCityProps } from "./CampusCity";

const CampusCity = lazy(() => import("./CampusCity"));

export type { CampusCityProps, CampusOpen } from "./CampusCity";

export default function CampusCityLazy(props: CampusCityProps) {
  return (
    <Suspense fallback={
      <div className="hp-boot" role="status" aria-busy="true">
        <span className="hp-boot-dot" aria-hidden="true" />
        <span>يبني الحرم كله…</span>
      </div>
    }>
      <CampusCity {...props} />
    </Suspense>
  );
}
