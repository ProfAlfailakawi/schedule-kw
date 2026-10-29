# Delivery and Production Operations

These constraints preserve the official service and the college's curriculum rules.

## Official production target

- Domain: `schedule-kw.com`
- Cloud Run: service `schedule`, project `gen-lang-client-0379571946`, region `europe-west1`
- Firestore: project `gen-lang-client-0379571946`, database `ai-studio-schedule-337bbbf5-1098-44cb-aabf-95536daf9106`
- The image registry is for builds. Do not deploy to a different service or project.

## Deployment safeguards

- Never delete, recreate, move, or otherwise change the domain mapping; certificate issuance can interrupt availability.
- A normal release changes the image only. Do not alter the official service account, environment, secrets, or memory settings as part of deployment.
- Do not create a second regional service or delete cloud services/projects or move production data without explicit owner direction.
- Before any script writes to production data, run its preview mode first and review its changes.
- Releases flow through the repository's main branch, CI, and the `Deploy SCHEDULE` workflow. A successful deployment must be verified on `https://schedule-kw.com` and `https://schedule-34704073784.europe-west1.run.app`; both must serve the same build identifier from `/sw.js`.

## Firestore target selection (project and database)

The server picks its Firestore project/database in `src/server/firestoreTarget.ts`, applied by `src/server/runtimeEnv.ts`.

- **Current precedence (unchanged):** on Cloud Run `firebase-applet-config.json` wins over `FIREBASE_PROJECT_ID` / `FIREBASE_DATABASE_ID`; elsewhere the environment wins. A Cloud Run environment value that differs from the file is logged as a warning (it does not take effect).
- **Production never falls back to `(default)`.** On Cloud Run the server refuses to connect when the project or database id is missing or `(default)`.
- **Startup log:** `[firestore-target] project=… database=… source=…` shows the target actually used.
- `FIREBASE_CONFIG_SOURCE=environment` (Cloud Run only, off by default) makes the environment the single source: both ids must be set and the file may not contradict them.

### Phase 2 (not yet applied): remove the database name from source files

Do this only after read-only confirmation that the `schedule` service carries the correct `FIREBASE_PROJECT_ID` and `FIREBASE_DATABASE_ID` (`gcloud run services describe schedule --region=europe-west1 --project=gen-lang-client-0379571946 --format='value(spec.template.spec.containers[0].env)'`). Deployments change the image only, so these variables are set on the service itself, never by the deploy workflow.

1. Confirm the variables on the live service, and that the startup log of the current revision shows the production database.
2. Set `FIREBASE_CONFIG_SOURCE=environment` on a no-traffic revision first and confirm the same `database=` in its log.
3. Only then drop `firestoreDatabaseId` from the checked-in config files.

**Rollback:** route traffic back to the previous revision (`gcloud run services update-traffic schedule --to-revisions=<previous>=100`); remove `FIREBASE_CONFIG_SOURCE` to restore file precedence. No data is moved, copied or renamed at any step.

## Firestore indexes (Enterprise edition)

The production database is Firestore **Enterprise** edition. Nothing is indexed on its own there: a filter without an index reads the whole collection, and every document read is billed. Until 2026-10-29 it had no indexes at all; in the week before, its fifty heaviest queries read about 590 million read units, nearly all of them full scans.

- `firestore.indexes.json` is the record of every index in production (19 on 2026-10-29). It is **not deployed** — `firebase.json` points at the `(default)` database, not the production one — so an index is created by hand: Console → Firestore → the production database → Indexes → Create index (query scope Collection, leave Sparse and Unique unchecked).
- Add the index to the file in the same change as the query that needs it. `npm run test:firestore-indexes` fails when a query on a large collection starts with a field no index leads, and names the line.
- After a release, Firestore → Query insights (7 days, by Read units) shows what still scans: compare *Docs scanned* with *Results returned*.
- The TTL policies the file declares (`sessions.expiresAtTtl`, `clientTelemetry.expiresAtTtl`) are **not enabled** in production. Enabling one (Firestore → Time-to-live → Create policy) permanently deletes the expired documents of that collection, so it is the owner's decision.

## Cost decisions (October 2026)

The owner's rule: the site must stay up and free or nearly free, and a spending cap that would show visitors an error page is not acceptable. These are the decisions taken under that rule, with the measurement behind each, so they are not re-litigated from scratch.

- **Cloud Run `schedule`:** request-based billing, min 0 / max 1 instance, 2 vCPU, 4 GiB, concurrency 1000, startup CPU boost. Thirty-day p99 CPU was about 10% of the previous 8 vCPU. One instance with concurrency 1000 serves everyone; concurrency 80 would have refused visitors at max 1. `gcloud run deploy --image` keeps these settings.
- **Warm during working hours:** the Cloud Scheduler job `schedule-warm` (project `gen-lang-client-0379571946`, `europe-west1`) asks `https://schedule-kw.com/api/health` every five minutes, Sunday to Thursday, 08:00–15:55 Kuwait time. `/api/health` answers from memory without touching Firestore. Idle time is not billed under request-based billing, so the instance stays warm at no cost, and the first visitor of the morning does not wait for a cold start. Outside those hours the service scales to zero as before.
- **Live updates:** a 15-second pulse (`/api/schedules/pulse`), not an always-open stream. An open stream bills the instance for every second it stays open. The stream opens only when a colleague is on the same board (PR #280).
- **The frontend stays on Cloud Run (not Firebase Hosting).** Static files were about 8% of requests. Hashed assets are already cached for a year (`immutable`), so browsers do not ask again. Moving them would split the domain and the session cookie between two hosts and touch the domain mapping (see Deployment safeguards). The saving would be a fraction of a few percent of requests that already cost milliseconds. Revisit only if static traffic grows to dominate.
- **Firestore:** see *Firestore indexes* above — nearly all of the read bill was full scans.
- **Anonymous traffic:** `src/server/anonymousGuard.ts` counts failures (sessions that do not exist, link tokens that match nothing), never successes. A campus behind one NAT address is never limited.
- **CI minutes:** pull requests skip `tests/slow.txt`, and main runs everything. `Deploy SCHEDULE` releases only a commit whose full run on main passed.
- **Image:** the final stage carries the bundle, the packages it requires (`scripts/runtime-deps.mjs`), the Firestore target and the OCR language data. Artifact Registry keeps the 10 newest images.

## Academic curriculum rules

The complete approved rules are in [`CURRICULUM_SHEET_RULES.md`](CURRICULUM_SHEET_RULES.md). Preserve department-only visibility, cross-department prerequisite notes, the official sheet categories, service-course behavior, level and arrow colors, the two tracks per department, the shared girls' sheet, and the student's complete personal map. Do not change these rules without owner direction.

## Data and credentials

Do not include local database snapshots or production credentials in source control or delivery archives. Configure runtime access using private environment variables or the platform's managed identity. Keep local environment files, service-account keys, vault keys, and user exports outside the project.
