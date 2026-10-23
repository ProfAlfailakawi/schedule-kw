/**
 * Which term's authority PDF may be copied into the chosen term.
 *
 * Only the same season of the PREVIOUS academic year: «الثاني 2026/2027» takes
 * «الثاني 2025/2026» and nothing else — not the first term of its own year, not
 * an older year, not a later one. The chosen term has no official table of its
 * own yet (that is what is being built), so its own season is refused too.
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

export function pdfTermAccepted(header: PdfHeaderTerm, targetName: string): boolean {
  const accepted = acceptedPdfSourceTerm(targetName);
  if (!accepted) return false;
  const years = [...header.years].map(Number).sort((a, b) => a - b);
  const want = [...accepted.years].sort((a, b) => a - b);
  return header.season === accepted.season && years.length === want.length && years.every((year, i) => year === want[i]);
}

const SEASON_WORD = { first: "الأول", second: "الثاني", summer: "الصيفي" } as const;

/** «الفصل الثاني 2025/2026» — the name shown in the refusal. */
export function acceptedPdfSourceLabel(targetName: string): string {
  const accepted = acceptedPdfSourceTerm(targetName);
  if (!accepted) return "";
  const years = [...accepted.years].sort((a, b) => a - b);
  return `الفصل ${SEASON_WORD[accepted.season]} ${years[0]}${years[1] ? `/${years[1]}` : ""}`;
}
