/**
 * ── «زميلان يعملان الآن» في الإرشاد والتسجيل، من جهة الشاشة ─────────────────────────────
 *
 * ثلاثةُ خطّافات فوق نبضة اللسان الواحدة (utils/livePulse.ts) — لا خيطَ ولا سؤالَ ثانياً:
 *
 *   useTeamPlace(place)  الشاشةُ تقول مكانها (الكلية والقسم والفصل وأيُّ شاشة). تستدعيه الشاشةُ الأمّ وحدها.
 *   useTeamWork(work)    «أعمل الآن على هذا» — من أيّ بطاقةٍ أو ورقة. أحدثُ ما أُعلن هو ما يُقال.
 *   useTeamPeers()       زملاءُ الفريق والنطاق كما قالتهم آخرُ نبضة، وفريقي.
 *
 * والنبضةُ تنام مع اللسان وتبطؤ حين لا أحد معي (pulseDelay)، فلا كلفةَ لمن يعمل وحده.
 */
import { useEffect, useRef, useState } from "react";
import { onLiveState, setLiveScope, type LiveState } from "../utils/livePulse";
import type { TeamScreen, WorkMark } from "../utils/teamWork";

export interface TeamPlace { collegeId: number; sectionId: number; termId: number; screen: TeamScreen }

let place: TeamPlace | null = null;
let serial = 0;
const works = new Map<number, { at: number; work: WorkMark }>();

const currentWork = (): WorkMark | null => {
  let best: { at: number; work: WorkMark } | null = null;
  for (const entry of works.values()) if (!best || entry.at > best.at) best = entry;
  return best ? best.work : null;
};
const push = () => setLiveScope(place ? { ...place, team: true, work: currentWork() } : null);

const validPlace = (value: TeamPlace | null | undefined): value is TeamPlace =>
  Boolean(value && value.collegeId > 0 && value.sectionId > 0 && value.termId > 0);

/** الشاشةُ الأمّ تقول مكانها؛ وحين تُغلق (أو تفقد نطاقها) لا يبقى لها مكان. */
export function useTeamPlace(next: TeamPlace | null): void {
  const key = validPlace(next) ? `${next.collegeId}:${next.sectionId}:${next.termId}:${next.screen}` : "";
  useEffect(() => {
    if (!key || !next) return;
    const mine: TeamPlace = { collegeId: next.collegeId, sectionId: next.sectionId, termId: next.termId, screen: next.screen };
    place = mine;
    push();
    return () => {
      if (place === mine) { place = null; push(); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** «أعمل الآن على هذا». null حين لا شيء. يعيش ما دامت البطاقةُ تقوله، ويُرفع حين تسكت أو تُغلق. */
export function useTeamWork(work: WorkMark | null | undefined): void {
  const token = useRef(0);
  if (!token.current) token.current = ++serial;
  const key = work ? `${work.kind}|${work.id}|${work.label}` : "";
  useEffect(() => {
    const id = token.current;
    if (!key || !work) { if (works.delete(id)) push(); return; }
    works.set(id, { at: Date.now() + id / 1e6, work: { kind: work.kind, id: work.id, label: work.label } });
    push();
    return () => { if (works.delete(id)) push(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

const EMPTY: LiveState = { company: 0, connected: false, peers: [], team: null };

/** زملاءُ الفريق والنطاق الآن (بالأحدث نشاطاً)، وفريقي كما قاله الخادم. */
export function useTeamPeers(): Pick<LiveState, "peers" | "team" | "company"> {
  const [state, setState] = useState<LiveState>(EMPTY);
  useEffect(() => onLiveState(setState), []);
  return state;
}
