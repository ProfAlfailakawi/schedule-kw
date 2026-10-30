import React, { useEffect, useId, useRef, useState } from "react";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { hueOf, initialOf } from "../utils/colleagueFace";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { departmentHolds, holdDayNames, holdRoomLabel, type ScheduleHoldView } from "../utils/scheduleHolds";
import { orderPeers, TEAM_HUE, TEAM_LABEL, workText, type Team, type TeamPeer } from "../utils/teamWork";

/**
 * ── «زميلان يعملان الآن» — شارةُ الحضور الواحدة لكل الفرق ─────────────────────────────
 *
 * لجنةُ الجدول (`ColleaguePresenceChip`، من حجوز النموذج المفتوح) والإرشادُ والتسجيل
 * (`TeamPresenceChip`، من نبضة الفريق) يلبسون الشارةَ نفسها: حتى خمسة وجوهٍ بحروفها وألوانها
 * داخل حلقةٍ بلون الفريق، ثم «+٢»، ولمسةٌ واحدة تفتح قائمةَ الحاضرين كلهم — الأحدثُ نشاطاً
 * أولاً — وبجانب كلٍّ رمزُ ما يعمل عليه وكلماتُه («📝 طلب شعبة 112»). زرُّها الوحيد يفتح ويطوي.
 */

/** وجوهُ شارة الحضور قبل «+N». */
export const MAX_FACES = 5;

export interface PresencePerson {
  id: string;
  name: string;
  /** رمزٌ قصير لما يعمل عليه (📝، 📅…). */
  icon: string;
  /** على ماذا يعمل الآن، بكلماتٍ قليلة. */
  text: string;
  /** للترتيب: الأحدثُ نشاطاً أولاً. */
  activeAt: number;
  /** حاضرٌ لكنه ليس أمام شاشته الآن. */
  away?: boolean;
}

export interface ColleagueFacesProps {
  people: readonly PresencePerson[];
  /** لونُ الفريق: حلقةٌ حول الشارة. */
  teamHue?: number;
  /** اسمُ الفريق لعنوان القائمة. */
  teamLabel?: string;
  className?: string;
}

/**
 * «٧ زملاء يعملون الآن»: حتى خمسة وجوهٍ ثم «+٢»، ولمسةٌ تفتح قائمةَ الجميع — الأحدثُ نشاطاً
 * أولاً — وبجانب كلٍّ ما يعمل عليه. Esc أو لمسةٌ خارجها تطويها. على الهاتف تنطوي كلمتُها إلى العدد.
 */
export function ColleagueFaces({ people, teamHue, teamLabel, className }: ColleagueFacesProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const listId = useId();
  const sorted = orderPeers((Array.isArray(people) ? people : []).map(person => ({ ...person, since: 0 })));
  const count = sorted.length;
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => { if (!count) setOpen(false); }, [count]);
  if (!count) return null;
  const faces = sorted.slice(0, MAX_FACES);
  const more = count - faces.length;
  const names = sorted.map(person => person.name).join("، ");
  return (
    <span
      ref={box}
      className={`colleague-presence${className ? ` ${className}` : ""}`}
      style={teamHue !== undefined ? { ["--team-hue" as any]: teamHue } : undefined}
      data-team={teamHue !== undefined ? "1" : undefined}
    >
      <button
        ref={button}
        type="button"
        className="colleague-presence-chip"
        aria-expanded={open}
        aria-controls={listId}
        title={names}
        onClick={() => setOpen(value => !value)}
        data-guide-ignore="يفتح قائمة الزملاء الحاضرين وما يعمل عليه كلٌّ منهم؛ عرضٌ لا يغيّر شيئاً"
      >
        <span className="colleague-presence-faces" aria-hidden="true">
          {faces.map(person => (
            <i key={person.id} data-away={person.away ? "1" : undefined} style={{ ["--hold-hue" as any]: hueOf(person.id || person.name) }}>{initialOf(person.name)}</i>
          ))}
          {more > 0 ? <i className="colleague-presence-more"><bdi dir="ltr">+{more}</bdi></i> : null}
        </span>
        <span className="colleague-presence-pulse" aria-hidden="true" />
        <span className="colleague-presence-text">
          <span className="colleague-presence-count">{countOf(count, AR.colleague)}</span>
          <span className="colleague-presence-verb"> {nounFor(count, AR.workingVerb)} الآن</span>
        </span>
      </button>
      <span role="status" className="sr-only">{`${countOf(count, AR.colleague)} ${nounFor(count, AR.workingVerb)} الآن`}</span>
      {open ? (
        <span className="colleague-presence-pop" id={listId} role="group" aria-label={teamLabel ? `${teamLabel} الآن` : "الزملاء الآن"}>
          <b className="colleague-presence-pop-head">{teamLabel ? `${teamLabel} · ` : ""}{countOf(count, AR.colleague)} {nounFor(count, AR.workingVerb)} الآن</b>
          <ul>
            {sorted.map(person => (
              <li key={person.id} data-away={person.away ? "1" : undefined}>
                <i className="colleague-presence-face" aria-hidden="true" style={{ ["--hold-hue" as any]: hueOf(person.id || person.name) }}>{initialOf(person.name)}</i>
                <span className="colleague-presence-who">
                  <b>{person.name}</b>
                  <small><span aria-hidden="true">{person.icon}</span> {person.text}</small>
                </span>
              </li>
            ))}
          </ul>
        </span>
      ) : null}
    </span>
  );
}

export interface ColleaguePresenceChipProps {
  /** حجوزُ الزملاء كما يعيدها useScheduleHolds. */
  holds: readonly ScheduleHoldView[];
  /** القسمُ المفتوح: تُعدّ حجوزُه وحده. */
  collegeId?: number;
  sectionId?: number;
  className?: string;
}

/** لجنةُ الجدول: من يبني موعداً في هذا القسم الآن، وأين — الشارةُ نفسها التي لكل الفرق. */
export function ColleaguePresenceChip({ holds, collegeId, sectionId, className }: ColleaguePresenceChipProps) {
  /* الحجزُ يتجدّد ما دام النموذجُ مفتوحاً: أبعدُها انتهاءً أحدثُها لمسة. والشخصُ مرةً واحدة. */
  const byPerson = new Map<string, ScheduleHoldView>();
  for (const hold of departmentHolds(holds, collegeId, sectionId)) {
    const key = hold.id || hold.name;
    const have = byPerson.get(key);
    if (!have || Number(hold.expiresAt) > Number(have.expiresAt)) byPerson.set(key, hold);
  }
  const people: PresencePerson[] = [...byPerson.values()].map(hold => {
    const room = holdRoomLabel(hold);
    const days = holdDayNames(hold.days);
    return {
      id: hold.id || hold.name, name: hold.name, icon: "📅",
      text: [days, formatScheduleTimeRange(hold.start, hold.end), room ? `القاعة ${room}` : ""].filter(Boolean).join(" · ") || "موعد جديد",
      activeAt: Number(hold.expiresAt) || 0,
    };
  });
  return <ColleagueFaces people={people} teamHue={TEAM_HUE.committee} teamLabel="لجنة الجدول" className={className} />;
}

/** الإرشادُ والتسجيل: زملاءُ الفريق والنطاق كما تقولهم النبضة. */
export function TeamPresenceChip({ peers, team, className }: { peers: readonly TeamPeer[]; team: Team | null; className?: string }) {
  const people: PresencePerson[] = (Array.isArray(peers) ? peers : []).map(peer => {
    const what = workText(peer.work, peer.screen);
    return { id: peer.id, name: peer.name, icon: what.icon, text: what.text, activeAt: peer.activeAt, away: peer.away };
  });
  return <ColleagueFaces people={people} teamHue={team ? TEAM_HUE[team] : undefined} teamLabel={team ? TEAM_LABEL[team] : undefined} className={className} />;
}
