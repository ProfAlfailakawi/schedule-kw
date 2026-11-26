/**
 * ── خريطة المترو لآلة الزمن ──────────────────────────────────────────────────
 *
 * السيناريوهاتُ فروعٌ فوق الجدول الحيّ كفروع git، فتُرسم خطوطَ مترو: الخطُّ الرئيس
 * هو الجدول الحيّ، وكل سيناريو خطٌّ يتفرّع منه، محطاتُه تغييراتُه، ونهايتُه حالُه
 * (مسوّدة، أو اعتُمد فعاد إلى الخطّ الرئيس، أو استُعيد). الضغطُ على خطٍّ محفوظ يفتحه
 * كما يفتحه زرُّه في «سيناريوهات محفوظة» تماماً. عرضٌ لا يكتب شيئاً.
 */
import React from "react";
import { GitBranch } from "lucide-react";
import type { TmScenarioRecord } from "../utils/timeMachine";
import { AR, countOf } from "../utils/arabicCount";
import "../styles/95-time-machine-metro.css";

interface Branch { id: string; name: string; changes: number; status: "draft" | "applied" | "restored" | "trying"; record?: TmScenarioRecord }

const STATUS: Record<Branch["status"], string> = { draft: "مسوّدة", applied: "اعتُمد", restored: "استُعيد", trying: "تجربة الآن" };
const W = 360, ROW = 40, TOP = 34, TRUNK_Y = 18, START = 336, END = 18;

export default function ScenarioMetro({ saved, trying, onOpen }: {
  saved: TmScenarioRecord[];
  /** ما يُجرَّب في المنضدة الآن ولم يُحفظ بعد. */
  trying?: { title: string; changes: number } | null;
  onOpen: (record: TmScenarioRecord) => void;
}) {
  const branches: Branch[] = [
    ...(trying ? [{ id: "trying", name: trying.title, changes: trying.changes, status: "trying" as const }] : []),
    ...saved.slice(0, 8).map(record => ({
      id: record.id, name: record.name, changes: record.changes.length, record,
      status: (record.status === "applied" ? "applied" : record.status === "restored" ? "restored" : "draft") as Branch["status"],
    })),
  ];
  if (!branches.length) return null;
  const height = TOP + branches.length * ROW;
  return (
    <section className="tm-metro" aria-label="خريطة السيناريوهات">
      <h3><GitBranch aria-hidden="true" />خريطة الفروع</h3>
      <svg viewBox={`0 0 ${W} ${height}`} role="group" aria-label="الجدول الحيّ وفروعه">
        <line className="tm-metro-trunk" x1={START} y1={TRUNK_Y} x2={END} y2={TRUNK_Y} />
        <circle className="tm-metro-origin" cx={START} cy={TRUNK_Y} r={7} />
        <text className="tm-metro-trunk-label" x={START - 26} y={TRUNK_Y - 9}>الجدول الحيّ</text>
        {branches.map((branch, index) => {
          const y = TOP + index * ROW + ROW / 2;
          const fork = START - 22 - (index % 3) * 12;
          const bend = fork - (y - TRUNK_Y);
          const tail = 150;
          const stations = Math.min(6, Math.max(1, branch.changes));
          const step = (bend - tail) / (stations + 1);
          const line = `M ${fork} ${TRUNK_Y} L ${bend} ${y} L ${tail} ${y}`;
          const tone = `tone-${index % 5}`;
          const open = branch.record ? () => onOpen(branch.record!) : undefined;
          const label = `${branch.name}: ${countOf(branch.changes, AR.change)} — ${STATUS[branch.status]}`;
          return (
            <g key={branch.id} className={`tm-metro-line ${tone} is-${branch.status}${open ? " is-open" : ""}`}
              {...(open ? { role: "button", tabIndex: 0, "aria-label": `افتح ${label}`, onClick: open,
                onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } },
                "data-guide-ignore": "خطّ سيناريو في خريطة الفروع يفتحه كما يفتحه زرّه في السيناريوهات المحفوظة؛ لا يكتب" } : { "aria-label": label })}>
              <title>{label}</title>
              <path d={line} className="tm-metro-path" />
              {branch.status === "applied" ? <path d={`M ${tail} ${y} Q ${tail - 40} ${y} ${tail - 70} ${TRUNK_Y}`} className="tm-metro-path tm-metro-merge" /> : null}
              {Array.from({ length: stations }, (_, n) => <circle key={n} className="tm-metro-station" cx={bend - step * (n + 1)} cy={y} r={4} />)}
              <circle className="tm-metro-end" cx={tail} cy={y} r={7} />
              <text className="tm-metro-name" x={tail - 12} y={y - 3}>{branch.name.length > 22 ? `${branch.name.slice(0, 21)}…` : branch.name}</text>
              <text className="tm-metro-meta" x={tail - 12} y={y + 11}>{countOf(branch.changes, AR.change)} · {STATUS[branch.status]}</text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
