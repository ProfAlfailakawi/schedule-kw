/**
 * Which term's authority PDF may be copied into the chosen term.
 *
 * The same season of the PREVIOUS academic year, or the chosen term itself:
 * «الثاني 2026/2027» takes «الثاني 2025/2026» and «الثاني 2026/2027» — not the
 * other season of its own year, not an older year, not a later one.
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

/** المصدران المقبولان: فصل السنة السابقة، والفصل المختار نفسه. */
function acceptedSources(targetName: string) {
  const previous = acceptedPdfSourceTerm(targetName);
  if (!previous) return [];
  return [previous, { season: previous.season, years: previous.years.map(year => year + 1) }];
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
