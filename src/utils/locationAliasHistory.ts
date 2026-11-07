import type { LocationRegistryAlias } from "../types";
import { isInvalidLocationToken, normalizeLocationToken } from "./locationRegistry";

/**
 * يسجّل الرمز القديم صيغةً تاريخيةً للقاعة/المبنى بصمتٍ حين يتغيّر الرمز المعتمد،
 * حتى تبقى سجلات الأعوام السابقة معروفة. القواعد:
 *  - لا تُكرَّر صيغة (المقارنة بعد التطبيع نفسه الذي يستعمله السجل).
 *  - لا تُسجَّل صيغة تساوي الرمز الجديد، ولا ما يملكه غيرُه في النطاق نفسه
 *    (رمز قاعة أخرى في المبنى أو صيغتها التاريخية).
 *  - إن عاد الرمز إلى قيمة كانت صيغةً قديمة، سقطت من الصيغ لأنها صارت الأصل.
 */
export function withHistoricalAlias(
  aliases: readonly LocationRegistryAlias[] | undefined,
  oldValue: string,
  newCanonical: string,
  ownedByOthers: Iterable<string> = [],
  evidence = `الرمز السابق قبل تغييره إلى ${newCanonical}.`,
): LocationRegistryAlias[] {
  const canonical = normalizeLocationToken(newCanonical);
  const owned = new Set([...ownedByOthers].map(normalizeLocationToken).filter(Boolean));
  const seen = new Set<string>();
  const kept: LocationRegistryAlias[] = [];
  for (const alias of aliases || []) {
    const token = normalizeLocationToken(alias?.value);
    if (!token || token === canonical || seen.has(token)) continue;
    seen.add(token);
    kept.push(alias);
  }
  const token = normalizeLocationToken(oldValue);
  if (token && token !== canonical && !seen.has(token) && !owned.has(token) && !isInvalidLocationToken(oldValue)) {
    kept.push({ value: String(oldValue).trim(), confidence: "CONFIRMED", evidence: [evidence] } as LocationRegistryAlias);
  }
  return kept;
}
