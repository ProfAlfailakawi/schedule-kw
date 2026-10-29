/**
 * ── متغيّراتُ الحالة المشتركة (تُكتب من أكثر من وحدة) ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */


/** متغيّراتُ الحالة المشتركة: تُكتب من أكثر من وحدة، والاستيرادُ للقراءة وحدها. */
export const state = {
  /**
   * The one gate every API call passes before anything else.
   *
   * Registered at load, so it sits ahead of every route: if the database never
   * came up, no handler runs and no caller is left guessing at a Firestore stack
   * trace. The interface itself is untouched — it loads and shows this reason.
   */
  databaseDown: null as string | null,
  /**
   * The reason stays here; the browser gets a receipt.
   *
   * The failure text is a database driver's own words — hostnames, project ids,
   * credential paths, stack frames. It was being handed to whoever happened to be
   * looking at the login screen. What that reader actually needs is something they
   * can quote down a telephone; what the operator needs is the full sentence, and
   * the log is where the operator already looks. Same incident, one short id, two
   * audiences.
   */
  databaseDownRef: null as string | null,
  hallBarterSerial: 0,
};
