/**
 * ── مواقع القسم في رأس «المنتدبون — الفصل الحالي» ─────────────────────────────
 *
 * كان الرأس يكتب «القسم في: كلية التربية الأساسية - بنات، كلية التربية الأساسية
 * - بنين، كلية التربية الأساسية - الجهراء - بنات، …» جملةً واحدة تأكل عرض
 * السطر، فينضغط اسم المنتدب حتى تقع كل كلمةٍ منه في سطر. والجزء المشترك
 * («كلية التربية الأساسية») يُقال مرةً واحدة، وما يميّز كل موقعٍ يصير وسماً
 * قصيراً: بنات · بنين · الجهراء - بنات · …
 */
export function compactCampusLabels(names: readonly string[]): { base: string; chips: string[] } {
  const clean = [...new Set(names.map(name => String(name || "").trim()).filter(Boolean))];
  if (clean.length < 2) return { base: "", chips: clean };
  const parts = clean.map(name => name.split(/\s+-\s+/));
  const shared: string[] = [];
  for (let index = 0; ; index++) {
    const segment = parts[0][index];
    if (segment === undefined || !parts.every(list => list[index] === segment)) break;
    shared.push(segment);
  }
  if (!shared.length) return { base: "", chips: clean };
  const base = shared.join(" - ");
  const chips = parts.map(list => list.slice(shared.length).join(" - ") || base);
  return { base, chips };
}
