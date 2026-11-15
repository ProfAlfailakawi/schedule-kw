import React from "react";
import { WHY_ICON_PATHS, type WhyIconName } from "../utils/whyNotIcons";

/** أيقونةٌ من مجموعة «لماذا لا؟»/«إعادة العرض» — المسارات نفسها التي تُحقن في خانات الشبكة. */
export default function WhyIcon({ name, className }: { name: WhyIconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      dangerouslySetInnerHTML={{ __html: WHY_ICON_PATHS[name] }} />
  );
}
