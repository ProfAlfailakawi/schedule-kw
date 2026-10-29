/**
 * Which term's authority PDF may be copied into the chosen term.
 *
 * The same season of the PREVIOUS academic year; the term just before it as well:
 * second ← first of its own year; first ← last year's second. «الثاني 2026/2027» takes
 * «الثاني 2025/2026» and «الأول 2026/2027»; «الأول 2026/2027» takes «الأول 2025/2026»
 * and «الثاني 2025/2026». The summer term takes only last year's summer.
 *
 * And the chosen term itself, always: the term the department created in the
 * system (the current/newest one) may receive its own official schedule file —
 * «الثاني 2026/2027» takes «الثاني 2026/2027». Three accepted terms in all.
 */
export type PdfHeaderTerm = { season: "first" | "second" | "summer"; years: number[]; label?: string };

const seasonOf = (name: string): PdfHeaderTerm["season"] | "" =>
  /الاول|الأول/.test(name) ? "first" : /الثاني|الثانى/.test(name) ? "second" : /صيفي|صيفى/.test(name) ? "summer" : "";

/** «الفصل الثاني 2025/2026» → موسم وسنوات؛ null إن لم يُقرأ الموسم أو السنة. لقبول ملفات الإكسل وJSON بالقاعدة نفسها. */
export function parseTermName(name: string): PdfHeaderTerm | null {
  const text = String(name || "").normalize("NFKC").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const season = seasonOf(text);
  const years = (text.match(/(?:19|20)\d{2}/g) || []).map(Number);
  return season && years.length ? { season, years, label: text.trim() } : null;
}

/** The one source term a target accepts, or null when its name cannot be read. */
export function acceptedPdfSourceTerm(targetName: string): { season: PdfHeaderTerm["season"]; years: number[] } | null {
  const season = seasonOf(targetName);
  const years = (targetName.match(/(?:19|20)\d{2}/g) || []).map(Number);
  if (!season || !years.length) return null;
  return { season, years: years.map(year => year - 1) };
}

/**
 * المصادر المقبولة: الفصلُ المختار نفسه (الفصل الذي أُنشئ في النظام يقبل ملفَّ جدوله)،
 * ونفس موسم السنة السابقة، ومعه الفصل الذي يسبقه مباشرة:
 * الثاني ← الأول من سنته نفسها، والأول ← الثاني من العام الماضي. الصيفي يقبل نفسه وصيفي العام الماضي.
 */
function acceptedSources(targetName: string) {
  const previous = acceptedPdfSourceTerm(targetName);
  if (!previous) return [];
  const own = previous.years.map(year => year + 1);
  const self = { season: previous.season, years: own };
  if (previous.season === "second") return [self, previous, { season: "first" as const, years: own }];
  if (previous.season === "first") return [self, previous, { season: "second" as const, years: previous.years }];
  return [self, previous];
}

export function pdfTermAccepted(header: PdfHeaderTerm, targetName: string): boolean {
  const years = [...header.years].map(Number).sort((a, b) => a - b);
  return acceptedSources(targetName).some(accepted => {
    const want = [...accepted.years].sort((a, b) => a - b);
    return header.season === accepted.season && years.length === want.length && years.every((year, i) => year === want[i]);
  });
}

const SEASON_WORD = { first: "الأول", second: "الثاني", summer: "الصيفي" } as const;

/** «الفصل الثاني 2025/2026 أو الفصل الثاني 2026/2027» — the names shown in the refusal. */
export function acceptedPdfSourceLabel(targetName: string): string {
  return acceptedSources(targetName).map(accepted => {
    const years = [...accepted.years].sort((a, b) => a - b);
    return `الفصل ${SEASON_WORD[accepted.season]} ${years[0]}${years[1] ? `/${years[1]}` : ""}`;
  }).join(" أو ");
}
