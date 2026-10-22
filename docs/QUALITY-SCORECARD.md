# Quality scorecard — round 3 (presentation only)

Base: schedule-kw `main` at `b3bddf7` (includes the registrar's ruled-sheet identity layer and the round 1–2 motion layer). Branch: `claude/comprehensive-site-review-ak1w4y`. Scope: CSS and static-page CSS only. No markup, logic, data, server, tests or dependencies changed.

## Method

Demo mode (`DATA_MODE=demo`), production build, Chromium via Playwright. For every reachable screen the harness loaded the page, dismissed the onboarding tour, waited for it to settle and measured:

H1 axe-core (wcag2a/aa, 2.1, 2.2 AA, best-practice) · H2 horizontal overflow · H3 clipped text · H4 console/page errors · H5 layout shift · H6 visible focus on the first 30 focusables · H7 content stuck invisible · H8 running animations under `prefers-reduced-motion` · H9 computed text contrast. Soft counts: text walls, fonts under 11px, targets under 44px, infinite animations.

Matrix: viewports 320 / 390 / 768 / 1280 × normal / reduced motion. Light only: the app forces `data-theme="light"` (`App.tsx`), so there is no dark mode to measure.

Screens: login; static `/landing/`, `/schedule-presentation.html`; student demo `/me/demo`; admin home, mobile drawer (≤768), the eight nav screens (schedule, queries and reports, intelligence, schedule changes, instructor preferences, registration sheet, registration radar, plan review, academic data, system admin), their tabs (390 and 1280 only); the home of the dean, registrar head, department head, advisor and standard roles.

## Result (before → after, same method, same build commit apart from this branch)

| Slice | Rows | Hard-pass before → after | axe colour-contrast nodes | H9 contrast rows | Targets under 44px |
|---|---|---|---|---|---|
| 390 (no tab sweep) + 768 + 320 | 108 | 10 → 10 | 22 → 8 | 27 → 19 | 1877 → 1598 |
| 1280 (with tab sweep) | 59 | 2 → 2 | 10 → 4 | 12 → 9 | 1591 → 1591 |

Overflow (H2), errors (H4), stuck-invisible (H7) and reduced-motion animation (H8) are zero in the final runs, at every viewport. Pass counts did not move: what keeps nearly every screen from a "perfect" mark is the items listed under "Not fixed" below, which are markup, not styling.

Caveat on H6: the probe calls `element.focus()` from script, which does not trigger `:focus-visible`, so it reports most buttons as ringless. A real keyboard sweep (Tab ×40 on home, schedule, plan review, queries; 390 and 1280) found every control drawing the 2px jade/brass ring except the text inputs (border-colour focus) and the document body on wrap-around. Treat H6 as a harness artefact.

An earlier "before" at 390 for the five non-admin roles was discarded: the tour dialog was still open, so axe measured the dialog. Those rows are excluded from the table; the 390 comparison above is rebuilt from a second run of the untouched base.

## What changed

| Where | Defect | Fix |
|---|---|---|
| `07-responsive.css` (≤1119px) | The closed off-canvas drawer stayed in the tab order and the accessibility tree: the first Tab stops landed on invisible nav buttons. | `visibility:hidden` while closed, delayed by the 280ms slide-out so the exit still animates; visible instantly on open. |
| `public/landing/index.html` | `--muted` (`#74837c`) on the dark ground, 4.34:1. | `#8a9a93`. |
| `public/schedule-presentation.html` | `--muted-2` (`#6f7c77`) grid labels, below 4.5:1. | `#8a9792`. |
| `30-motion.css` (end) | White count bubble in the registration "open" pill 4.36:1; case-type chip text 4.46:1; plan-review level sub-label at 0.88 opacity on a coloured band. | Darker bubble tint; chip text mixed 20% toward ink; opacity 1. Hues unchanged. |

Motion: nothing added in this round. The existing layer (transform/opacity, 120–260ms, `cubic-bezier(.2,.7,.2,1)`, once, none under reduced motion) already covers the gaps, and the identity layer's ruler draw is left alone. The new rules do not touch the identity layer's selectors beyond text colours.

## Looked at by eye, left alone

Login, tour dialog, admin home (390, 1280), schedule list, intelligence centre, schedule changes (deadline card, student-journey stepper), registration sheet, plan review (infographic level map). These already read as icon + number + short label with a clear ruled-sheet hierarchy. The course-code colours in plan review are the owner's rule (the colour of the number is the colour of its arrows, `AGENTS.md`), so their contrast was not touched.

## Not fixed (needs markup or server changes, out of scope)

- `select-name`: about 30 unlabeled `<select>` elements (schedule term filter, query filters, registration sheet).
- `aria-prohibited-attr` on `.demo-rail-chip`; `aria-allowed-role` on search/list wrappers.
- Missing `<h1>` on dashboard-style homes and heading-order jumps (radar, changes, queries).
- `scrollable-region-focusable` on horizontal ribbons (plan-review level ribbon) and one landing carousel; `button-name` on an icon button in plan review; `landmark-one-main` and `region` on the static landing page.
- `/me/demo` (server-rendered in `src/server/studentHomePage.ts`): "ينقصك" small text at 2.34:1, several 4.0–4.4:1 labels.
- Plan review shows ten near-identical amber prerequisite warnings in a row; grouping them would be a markup change.
- Touch targets under 44px remain numerous in dense lists and chips (informational metric).

## Not viewed

Dark mode (not supported). 768 and 320 screenshots were measured but not individually eyeballed. Print/report papers, approval bar and dossier dialogs, PDF-import previews, notification panel, Gemini surfaces, data-dependent empty/error states, other roles beyond their home, tab sweeps at 768/320, and any screen requiring real Firestore data.

## Verification

`npm run lint` clean. All 122 scripts of the `npm test` chain pass individually on this branch (including the markup-inspecting audits). `npm run build` succeeds (its guide performance audit is timing-based: it failed once under a heavily loaded machine and passed on rerun, unrelated to this change). `src/generated/buildStamp.ts` is not committed.
