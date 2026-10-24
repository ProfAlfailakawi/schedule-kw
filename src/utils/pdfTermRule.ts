/**
 * Which term's authority PDF may be copied into the chosen term.
 *
 * The same season of the PREVIOUS academic year; the second term also takes the
 * first term of its own year. «الثاني 2026/2027» takes «الثاني 2025/2026» and
 * «الأول 2026/2027» and nothing else. The summer term takes only last year's summer.
 */
export type PdfHeaderTerm = { season: "first" | "second" | "summer"; years: number[]; label?: string };

const seasonOf = (name: string): PdfHeaderTerm["season"] | "" =>
  /الاول|الأول/.test(name) ? "first" : /الثاني|الثانى/.test(name) ? "second" : /صيفي|صيفى/.test(name) ? "summer" : "";

/** The one source term a target accepts, or null when its name cannot be read. */
export function acceptedPdfSourceTerm(targetName: string): { season: PdfHeaderTerm["season"]; years: number[] } | null {
  const season = seasonOf(targetName);
  const years = (targetName.match(/(?:19|20)\d{2}/g) || []).map(Number);
  if (!season || !years.length) return null;
  return { season, years: years.map(year => year - 1) };
}

/**
 * المصادر المقبولة: نفس موسم السنة السابقة دائماً؛ والفصل الثاني يقبل أيضاً الفصل الأول من سنته نفسها.
 * الصيفي لا يقبل إلا صيفي العام الماضي، والفصل الأول لا يقبل إلا أوله من العام الماضي.
 */
function acceptedSources(targetName: string) {
  const previous = acceptedPdfSourceTerm(targetName);
  if (!previous) return [];
  const own = previous.years.map(year => year + 1);
  return previous.season === "second" ? [previous, { season: "first" as const, years: own }] : [previous];
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
