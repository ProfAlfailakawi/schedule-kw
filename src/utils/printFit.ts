/**
 * ── الورقة تمتلئ، ولا تُقصّ ─────────────────────────────────────────────────
 *
 * كل صفحةٍ في تقارير مركز الاستعلامات مصمَّمةٌ على ورقة A4 عرضية، لكن ما
 * يملؤها هو البيانات لا التصميم: أستاذٌ بمحاضرتين يترك ثلثي الورقة أبيض بخطٍّ
 * صغير، وأستاذٌ بسبع محاضراتٍ طويلة الأسماء يتجاوزها — فيُقصّ أسفلُه في Safari
 * (صندوقٌ ثابت بارتفاع الورقة يُخفي ما زاد) ويسقط ذيلُه إلى ورقةٍ شبه بيضاء في
 * Chrome. وعدد الصفوف في الصفحة لا يحلّ هذا: الصف نفسه يقصر ويطول.
 *
 * فقبل أمر الطباعة مباشرةً تُقاس كل صفحة بقواعد الطباعة نفسها، ويُختار لها
 * أكبرُ تكبيرٍ تتّسع له الورقة — أو أقلُّ تصغيرٍ يُدخلها كلَّها — ثم يُطبَّق
 * تكبيراً موحّداً (`zoom`) على محتواها. فالتصميم هو هو بخطوطه ونِسَبه وألوانه
 * وترويسته، والهوامش وعدد الصفوف كما هي؛ الذي يتغيّر الحجم وحده.
 *
 * والتقرير الشامل وتقرير التغييرات يُعامَلان بحذرٍ أشدّ: صفّهما مطابقٌ لورقة
 * التسجيل صفحةً بصفحة، فلا يُكبَّران أبداً — يبقيان بحجمهما المعتمد حرفاً بحرف،
 * ولا يُصغَّران إلا إذا كانت الصفحة ستُقصّ. أمّا ملحق التغييرات فوثيقةٌ نصية
 * تُملأ كبقية التقارير.
 *
 * والقياس متزامن عمداً: Safari لا يفتح نافذة الطباعة إلا إذا جاء الأمر في
 * اللمسة نفسها بلا انتظار. فتُقلب وسائط الأوراق إلى وسائط الطباعة لحظةً،
 * وتُقاس الصفحات، ثم تُعاد كما كانت — كله قبل أن يرسم المتصفّح شيئاً.
 */

const MM = 96 / 25.4;
/** الورقة التي صُمّمت عليها التقارير: A4 عرضية. */
const SHEET_WIDTH_MM = 297;
const SHEET_HEIGHT_MM = 210;
/** ملّيمتراتٌ تُترك أسفل الورقة لفروق التقريب بين القياس والطباعة. */
const SAFETY_MM = 3;
/** أصغر ما تُصغَّر إليه صفحةٌ طويلة، وأكبر ما تُكبَّر إليه صفحةٌ قصيرة. */
export const PRINT_FIT_MIN = 0.6;
export const PRINT_FIT_MAX = 1.8;
const SEARCH_STEPS = 9;

/**
 * خطوط الورقة تصل قبل أول طباعة.
 *
 * بعض أوزان الخط لا تستعملها الشاشة (عناوين الورقة بوزن 800، والأرقام بخطٍّ
 * أحادي المسافة)، فلا يطلبها المتصفّح إلا حين تُقلب قواعد الطباعة — أي أثناء
 * القياس نفسه، فتُقاس الصفحة بخطٍّ بديلٍ أقصر وتُطبع بالخط الحقيقي فتتجاوز.
 * فتُطلب كلها حين تُفتح التقارير، قبل أن يضغط أحدٌ زرّ الطباعة.
 */
const PRINT_FACES = [
  ...[300, 400, 500, 600, 700].map(weight => `${weight} 12px "Plex Arabic"`),
  ...[400, 500, 600].map(weight => `${weight} 12px "Plex Mono"`),
];
let printFontsRequested = false;
export function warmPrintFonts() {
  if (printFontsRequested || typeof document === "undefined" || !document.fonts?.load) return;
  printFontsRequested = true;
  PRINT_FACES.forEach(face => { document.fonts.load(face, "عربي Abc 0123").catch(() => undefined); });
}
/** خطٌّ لم يصل بعد ساعةَ القياس: يُحتاط له بهذه النسبة من الورقة. */
const FONTS_PENDING_MARGIN = 0.05;

/** ورقة الطباعة كما يراها المتصفّح: عرضٌ وارتفاعٌ واتجاه تُقيَّم بها وسائط CSS. */
export interface PrintSheetGeometry {
  widthPx: number;
  heightPx: number;
  orientation: "portrait" | "landscape";
}

const splitMediaList = (text: string) => {
  const media: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) { media.push(current); current = ""; continue; }
    current += char;
  }
  media.push(current);
  return media.map(item => item.trim()).filter(Boolean);
};

const lengthPx = (value: string) => {
  const match = value.trim().match(/^(-?[\d.]+)(px|em|rem)?$/);
  if (!match) return NaN;
  return Number(match[1]) * (match[2] === "em" || match[2] === "rem" ? 16 : 1);
};

/**
 * هل ينطبق شرطٌ واحد (`(max-width: 760px)`) على ورقة الطباعة؟ العرض والارتفاع
 * والاتجاه من الورقة لا من النافذة — هاتفٌ عرضه 390px يطبع ورقةً عرضها 297 ملم،
 * والقاعدة المكتوبة للهاتف لا تصل إلى ورقته. وما سواها (الحركة، المؤشّر،
 * الألوان القسرية) يُسأل عنه المتصفّح كما هو.
 */
function featureApplies(feature: string, sheet: PrintSheetGeometry, environment: (query: string) => boolean): boolean {
  const body = feature.trim().replace(/^\(|\)$/g, "").trim();
  const [rawName, ...rest] = body.split(":");
  const name = rawName.trim();
  const value = rest.join(":").trim();
  const sized = name.match(/^(min-|max-)?(device-)?(width|height)$/);
  if (sized && value) {
    const target = lengthPx(value);
    if (!Number.isFinite(target)) return environment(`(${body})`);
    const actual = sized[3] === "width" ? sheet.widthPx : sheet.heightPx;
    if (sized[1] === "min-") return actual >= target;
    if (sized[1] === "max-") return actual <= target;
    return Math.abs(actual - target) < 0.5;
  }
  if (name === "orientation" && value) return value === sheet.orientation;
  return environment(`(${body})`);
}

/** هل ينطبق وسيطٌ واحد من قائمة (`screen and (max-width: 768px)`) على الورقة؟ */
export function mediumAppliesInPrint(medium: string, sheet: PrintSheetGeometry, environment: (query: string) => boolean): boolean {
  let text = medium.trim().toLowerCase();
  if (!text) return true;
  let negated = false;
  if (/^not\s+[a-z]/.test(text)) { negated = true; text = text.replace(/^not\s+/, ""); }
  text = text.replace(/^only\s+/, "");
  let typeApplies = true;
  let conditions = text;
  const typed = text.match(/^([a-z-]+)\s*(?:and\s+([\s\S]*))?$/);
  if (typed && !text.startsWith("(")) {
    typeApplies = typed[1] === "all" || typed[1] === "print";
    conditions = typed[2] || "";
  }
  let applies = typeApplies;
  if (applies && conditions) {
    /* «أو» و«ليس (…)» من المستوى الرابع نادرةٌ هنا؛ يُسأل عنها المتصفّح كاملةً. */
    if (/\)\s*or\s*\(|^not\s*\(/.test(conditions)) applies = environment(conditions);
    else applies = (conditions.match(/\([^()]*\)/g) || []).every(feature => featureApplies(feature, sheet, environment));
  }
  return negated ? !applies : applies;
}

/** قائمة وسائط كاملة: تنطبق إن انطبق أيُّ وسيطٍ فيها، والفارغة تنطبق دائماً. */
export function mediaListAppliesInPrint(text: string, sheet: PrintSheetGeometry, environment: (query: string) => boolean): boolean {
  const media = splitMediaList(text);
  return !media.length || media.some(medium => mediumAppliesInPrint(medium, sheet, environment));
}

type MediaSwap = { list: MediaList; text: string };

/**
 * يُشغّل `measure` والوثيقة تحت قواعد الطباعة، ثم يعيد كل شيء كما كان — وإن
 * رمى القياس خطأً. لا رسم بين القلب والإعادة لأن كليهما في المهمة نفسها.
 */
export function withPrintMedia<T>(sheet: PrintSheetGeometry, measure: () => T): T {
  const environment = (query: string) => {
    try { return window.matchMedia(query).matches; } catch { return false; }
  };
  const swaps: MediaSwap[] = [];
  const swap = (list: MediaList | null | undefined) => {
    if (!list || !list.mediaText) return;
    const text = list.mediaText;
    const next = mediaListAppliesInPrint(text, sheet, environment) ? "all" : "not all";
    if (next === text) return;
    swaps.push({ list, text });
    list.mediaText = next;
  };
  const walkSheet = (sheetObject: CSSStyleSheet) => {
    swap(sheetObject.media);
    let rules: CSSRuleList | null = null;
    /* ورقة خطوطٍ من نطاقٍ آخر لا تُقرأ قواعدها؛ ولا وسائط طباعةٍ فيها. */
    try { rules = sheetObject.cssRules; } catch { rules = null; }
    if (rules) walk(rules);
  };
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) { swap(rule.media); walk(rule.cssRules); }
      else if (rule instanceof CSSImportRule) { swap(rule.media); if (rule.styleSheet) walkSheet(rule.styleSheet); }
      else if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) walk((rule as CSSGroupingRule).cssRules);
    }
  };
  try {
    for (const sheetObject of Array.from(document.styleSheets)) walkSheet(sheetObject);
    for (const sheetObject of (document as Document & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets || []) walkSheet(sheetObject);
    return measure();
  } finally {
    for (let index = swaps.length - 1; index >= 0; index -= 1) {
      try { swaps[index].list.mediaText = swaps[index].text; } catch { /* تبقى كما هي */ }
    }
  }
}

/** ورقة هذه الطباعة: Safari يطبع على ورقةٍ طولية ويُدير الصفحة داخلها. */
export function printSheetFor(root: HTMLElement): PrintSheetGeometry {
  return root.dataset.printRotate === "1"
    ? { widthPx: SHEET_HEIGHT_MM * MM, heightPx: SHEET_WIDTH_MM * MM, orientation: "portrait" }
    : { widthPx: SHEET_WIDTH_MM * MM, heightPx: SHEET_HEIGHT_MM * MM, orientation: "landscape" };
}

/**
 * يرصّ عناصرَ في صفحاتٍ بحسب ما يأخذه كلٌّ منها من الورقة لا بعددها: الأولى
 * تحمل ملخّصاً فتتّسع لأقل. والعنصر الأطول من الصفحة يبقى وحده في صفحته،
 * ويتكفّل `fitPrintPages` بإدخاله.
 */
export function packPrintLines<T>(items: T[], cost: (item: T) => number, firstBudget: number, nextBudget: number): T[][] {
  const pages: T[][] = [[]];
  let used = 0;
  items.forEach(item => {
    const weight = cost(item);
    const budget = pages.length === 1 ? firstBudget : nextBudget;
    if (pages[pages.length - 1].length && used + weight > budget) { pages.push([]); used = 0; }
    pages[pages.length - 1].push(item);
    used += weight;
  });
  return pages;
}

/** الصفحات التي تُقاس: صفحات التقارير الصريحة، وصفحات الشامل وتقرير التغييرات. */
const REPORT_PAGES = ".print-report:not(.print-comprehensive) .print-explicit-page";
const BOOK_PAGES = ".print-comprehensive-book .print-comprehensive-page";

/**
 * أقصى تكبيرٍ لكل صفحة: صفحة الشامل وتقرير التغييرات لا تُكبَّر — شكلها
 * الرسمي ثابت — والملحق وبقية التقارير تُكبَّر حتى تمتلئ الورقة.
 */
export function printFitCeiling(page: Pick<Element, "matches">): number {
  return page.matches(".print-comprehensive-page") && !page.matches(".print-changes-appendix") ? 1 : PRINT_FIT_MAX;
}

/** يُكتب أثناء القياس وحده: الصفحة بطولها الطبيعي، لا مقصوصةً ولا مُدارة. */
const MEASURE_CSS = `
html[data-print-fit-measure] body ${REPORT_PAGES},
html[data-print-fit-measure] body ${BOOK_PAGES}{
  height:auto !important;min-height:0 !important;max-height:none !important;
  overflow:visible !important;transform:none !important;margin-block:0 !important;
}
html[data-print-fit-measure="generic"] body ${REPORT_PAGES},
html[data-print-fit-measure="generic"] body ${BOOK_PAGES}{
  width:${SHEET_WIDTH_MM}mm !important;max-width:${SHEET_WIDTH_MM}mm !important;
}`;

/** ما يفيض نصّه إن ضاق عرضه: رمزٌ أو وقتٌ أو اسمٌ لا يلتفّ. */
const OVERFLOW_PROBES = "td,th,[role='cell'],[role='columnheader'],time,bdi,.print-ltr,.print-nowrap";

interface Overflow { count: number; worst: number }

function readOverflow(page: HTMLElement): Overflow {
  let count = 0;
  let worst = 1;
  for (const probe of Array.from(page.querySelectorAll<HTMLElement>(OVERFLOW_PROBES))) {
    const { clientWidth, scrollWidth } = probe;
    if (!clientWidth) continue;
    const ratio = scrollWidth / clientWidth;
    if (ratio > 1.02) count += 1;
    if (ratio > worst) worst = ratio;
  }
  if (page.scrollWidth > page.clientWidth + 2) count += 1;
  return { count, worst };
}

const setFit = (page: HTMLElement, scale: number) => {
  /* حجمٌ مطابقٌ للتصميم لا يُكتب أصلاً: الصفحة تخرج كما كانت تماماً. */
  if (Math.abs(scale - 1) < 0.0005) { delete page.dataset.printFit; page.style.removeProperty("--print-fit"); return; }
  page.dataset.printFit = scale.toFixed(3);
  page.style.setProperty("--print-fit", scale.toFixed(3));
};

/** يعيد الصفحات إلى حجمها المصمَّم (قبل كل قياسٍ جديد). */
export function clearPrintFit(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>("[data-print-fit]").forEach(page => {
    delete page.dataset.printFit;
    page.style.removeProperty("--print-fit");
  });
}

/**
 * القارئ يعود إلى حيث كان.
 *
 * تحت قواعد الطباعة تختفي الشاشة كلها، فتقصر الوثيقة ويرتدّ موضع التمرير إلى
 * أعلاها — وإعادته بعد القياس تكلّف إعادة رسم الشاشة كلها قبل نافذة الطباعة.
 * فالوثيقة تُبقي طولها أثناء القياس، فلا يرتدّ شيء أصلاً ولا يُعاد شيء.
 */
function holdScroll() {
  const body = document.body;
  const previous = body.style.getPropertyValue("min-height");
  const priority = body.style.getPropertyPriority("min-height");
  const x = window.scrollX;
  const y = window.scrollY;
  body.style.setProperty("min-height", `${document.documentElement.scrollHeight}px`, "important");
  return () => {
    if (previous) body.style.setProperty("min-height", previous, priority);
    else body.style.removeProperty("min-height");
    if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
  };
}

export interface PrintFitResult { pages: number; scales: number[] }

/**
 * يملأ كل صفحةٍ في `scope` بأكبر حجمٍ تحمله ورقة A4، ويُصغّر ما تجاوزها.
 *
 * الصفحات التي تحمل `data-print-fit-group` واحداً في التقرير نفسه تأخذ حجماً
 * واحداً — أصغرَ ما احتاجته صفحاتها — حتى لا يتبدّل الخط بين صفحتين من الورقة
 * نفسها؛ وما لا يحمله يُجمع بتقريره كله. أستاذٌ في صفحتين بخطٍّ واحد، وأستاذٌ
 * آخر بخطّه هو.
 */
export function fitPrintPages(scope: ParentNode = document): PrintFitResult {
  const root = document.documentElement;
  /* يُسأل عن الخطوط قبل قلب الوسائط: القلب نفسه يعيد بناء وجوه الخط فتبدو
     «قيد التحميل» وهي في الذاكرة. */
  const fontsPending = typeof document.fonts !== "undefined" && document.fonts.status === "loading";
  warmPrintFonts();
  clearPrintFit(scope);
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>(`${REPORT_PAGES},${BOOK_PAGES}`));
  if (!candidates.length) return { pages: 0, scales: [] };

  const restoreScroll = holdScroll();
  const style = document.createElement("style");
  style.dataset.printFitMeasure = "true";
  style.textContent = MEASURE_CSS;
  const reports = new Map<Element, number>();
  const groupOf = (page: HTMLElement) => {
    const report = page.closest(".print-report") || page;
    if (!reports.has(report)) reports.set(report, reports.size);
    return `${reports.get(report)}:${page.dataset.printFitGroup || ""}`;
  };

  let scales: number[] = [];
  try {
    scales = withPrintMedia(printSheetFor(root), () => {
      /* حدّ الصفحة كما تُطبع: صندوقها إن كان ثابت الارتفاع، وإلا الورقة كلها.
         يُقرأ قبل كتابة قواعد القياس، لأنها هي التي تُطلق الارتفاع. */
      const sheetHeight = SHEET_HEIGHT_MM * MM;
      const pages = candidates
        .filter(page => page.getClientRects().length)
        .map(page => {
          const fixed = parseFloat(getComputedStyle(page).maxHeight);
          const box = Number.isFinite(fixed) && fixed > 0 ? Math.min(fixed, sheetHeight) : sheetHeight;
          return { page, limit: box - SAFETY_MM * MM, ceiling: printFitCeiling(page) };
        });
      if (!pages.length) return [];

      root.dataset.printFitMeasure = root.dataset.printRotate === "1" ? "rotate" : root.dataset.printChromium === "1" ? "chromium" : "generic";
      document.head.appendChild(style);
      const height = (page: HTMLElement) => page.getBoundingClientRect().height;
      const baseHeights = pages.map(item => height(item.page));
      /* خطٌّ لم يصل بعد يُقاس ببديله: يُترك له هامشٌ أوسع. */
      if (fontsPending) pages.forEach(item => { item.limit *= 1 - FONTS_PENDING_MARGIN; });
      /* الفيضان يُحسب للتكبير وحده: التصغير يوسّع السطر فلا يزيد شيئاً فيضاً. */
      const baseOverflow = pages.map(item => (item.ceiling > 1 ? readOverflow(item.page) : { count: 0, worst: 1 }));
      /* حدّا البحث من القياس الأول، لأن كل خطوةٍ تعيد تشكيل النص العربي كله:
         المحتوى المكبَّر يلتفّ أكثر فلا يقصر عن نسبته، والمصغَّر يلتفّ أقل فلا
         يطول عنها — فنسبة المتاح إلى المحتوى أقصى تكبيرٍ ممكن، وأدنى تصغيرٍ كافٍ. */
      const ratio = pages.map((item, index) => {
        const computed = getComputedStyle(item.page);
        const padding = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
        return Math.max(0, item.limit - padding) / Math.max(1, baseHeights[index] - padding);
      });
      const low = pages.map((item, index) => (baseHeights[index] > item.limit ? Math.max(PRINT_FIT_MIN, Math.min(1, ratio[index])) : 1));
      const high = pages.map((item, index) => (baseHeights[index] > item.limit ? 1 : Math.max(1, Math.min(item.ceiling, ratio[index]))));
      const fits = (index: number, scale: number) => {
        const item = pages[index];
        if (height(item.page) > item.limit) return false;
        if (scale <= 1) return true;
        const overflow = readOverflow(item.page);
        return overflow.count <= baseOverflow[index].count
          && overflow.worst <= Math.max(1.02, baseOverflow[index].worst) + 0.02;
      };
      for (let step = 0; step < SEARCH_STEPS; step += 1) {
        const active = pages.map((_, index) => high[index] - low[index] > 0.01);
        if (!active.some(Boolean)) break;
        const mids = pages.map((_, index) => (low[index] + high[index]) / 2);
        pages.forEach((item, index) => { if (active[index]) setFit(item.page, mids[index]); });
        pages.forEach((_, index) => {
          if (!active[index]) return;
          if (fits(index, mids[index])) low[index] = mids[index];
          else high[index] = mids[index];
        });
      }

      const groupScale = new Map<string, number>();
      pages.forEach((item, index) => {
        const key = groupOf(item.page);
        const scale = low[index] >= 1 && high[index] <= 1 ? 1 : Math.floor(low[index] * 100) / 100;
        groupScale.set(key, Math.min(groupScale.get(key) ?? Infinity, scale));
      });
      return pages.map(item => {
        const scale = groupScale.get(groupOf(item.page)) ?? 1;
        setFit(item.page, scale);
        return scale;
      });
    });
  } catch {
    /* قياسٌ تعثّر لا يمنع الطباعة: الورقة تخرج بحجمها المصمَّم. */
    clearPrintFit(scope);
    scales = [];
  } finally {
    style.remove();
    delete root.dataset.printFitMeasure;
    restoreScroll();
  }
  return { pages: scales.length, scales };
}
