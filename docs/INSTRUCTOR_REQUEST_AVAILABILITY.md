# Instructor requests: availability and assignment

## Contract

A professor submits wishes, not official schedule writes. Selecting an available
placeholder-faculty section only changes the local draft. Submission acquires a
private reservation; the card says that the department is reviewing the request.
No reservation countdown or room picker is exposed. Approval assigns the existing
section rows to the professor without changing their times, rooms or section code.
Rejection releases the reservation. Pending reservations have no automatic expiry.

The collapsible available-sections list uses the existing card styling. It includes
all meetings of each section and only operational courses within the request's
allowed scopes. It excludes professor/cohort clashes, load violations and sections
with conflicting physical rooms. Another professor's timetable is never returned.

## Shared rules and deliberate differences

- `scheduleTime`, `scheduleRegulations`, `scheduleIntelligence`, `courseNature` and
  the historical time model remain the scheduling authorities.
- `instructorRequestWeek` projects the complete final bundle. Different clock
  ranges become distinct rows before conflict evaluation, just as on approval.
  Rejected deletions do not release a slot; fixed additions are not counted twice.
- `historicalDurationMinutes` shares the editor's confidence threshold. Approved
  regulation patterns supply a fallback when reliable course history is absent.
  Current main's 4-hour Monday/Wednesday 110+110 pattern remains supported.
- `roomSuitability` shares advisory scores with central suggestions. Request
  candidates prefer room type, then suitability and a deterministic location sort.
  Capacity/type mismatches remain advisory, not new save blockers.
- Approved borrowed rooms retain central day/hour eligibility, without adding a
  borrowing workflow to the professor page. Companion facilities are also checked.
- Physical overlap blocks. Turnaround advice stays advisory. Cohort exceptions
  require a written reason rather than a new hard prohibition. Automatically
  offered alternatives avoid those overlaps rather than advertising exceptions.
- The coordinator retains room/section selection, exception decisions and official
  writing permissions. Requests never grant the professor these permissions.

## Concurrency and storage

`instructorRequestReservations/{termId}` is an additive internal Firestore ledger.
Existing rows/documents are unchanged; no migration or deletion is required. This
shared contention point is necessary: process-local locks cannot protect separate
Cloud Run instances. Each reservation contains only server-resolved slots, item
identity, instructor, section row revisions and a ranked feasible room/facility.

Submission reads the live term week and ledger in the same Firestore transaction,
replaces only that request's reservations, and writes the request revision and
ledger together. Forty submissions competing for one room have one winner. A
stale client receives 409 and retains its local draft. Browsing/checking acquires
nothing. Official write paths also consult the ledger, including batch operations.

Approval dry-runs the existing schedule save handlers against the final bundle.
`commitInstructorRequestPlan` then rechecks live revisions and physical conflicts
and commits all official row operations, the decision and hold release in one
transaction. A stale second operation cannot leave the first written. The term
apply lease is retained; the database transaction supplies the final guarantee.

Existing pending requests gain reservations on their next submission or accepted
alternative; deployment does not silently reserve or rewrite old requests.
Revalidation on approval still applies to every request.

## History and privacy

Stable item IDs preserve conversations across edits. Replaced decisions and
signatures are archived. Overflow correspondence is retained separately from the
compact displayed thread. Removed submitted additions are archived internally.
Internal room candidates, offering revision snapshots, signature history and
archived items are stripped from public responses; mixed-scope inbox signatures
cannot reveal hidden signed items. Historical signature verification still works.

## Verification

- `npm run test:instructor-availability`: exact per-day clock parity, final bundles,
  rejected/fixed items, delete/reuse, weekly minutes, alternatives, advisory ranking,
  correspondence preservation, 40 contenders, stale revisions, release and atomic
  all-or-none approval.
- The same test with `--emulator` exercises real Firestore transactions. It refuses
  any emulator host other than loopback and requires a `demo-instructor-*` project.
- `npm run test:instructor-offering-flow`: isolated HTTP journey from section
  discovery through signed competing submissions, unchanged official rows,
  department preview, immediate assignment, duplicate refusal and rejection/release.
- Optional `INSTRUCTOR_BROWSER_MODULE` (Playwright Core module path) and
  `INSTRUCTOR_CHROMIUM` run Chromium selection, offline draft recovery, mobile
  overflow assertions and mobile/desktop screenshots during that API journey.
- Existing instructor, time, room, regulation, blocker, signature and apply audits
  remain enabled. Source assertions were updated to track shared helpers and
  atomic writes; existing main's known-failure list was not expanded.

## Rollout and recovery

Deploy the server and frontend together. The ledger is included automatically in
collection-based backups. No background data backfill is run. Monitor 409 rates
and Firestore contention; a busy term deliberately serializes claims rather than
accepting competing reservations. The ledger is bounded by Firestore's document
size limit; unusually large pending populations require measurement before scale-up.

Do not roll back to a server version unaware of active reservations. First settle
or reject the affected pending requests through their normal department workflow,
or deploy a compatible repair that still reads the ledger. Never delete official
schedule rows or reservation documents as an informal rollback.

A local emulator and Chromium are not proof of production multi-instance latency,
real SMS delivery, real staff credentials or live coordinator exception decisions.
Deployment/version checks and any remaining manual checks are reported separately.
