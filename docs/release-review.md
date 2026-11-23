# Rehearsal — current release review

**Current status (November 23, 2026): Rehearsal release 6 was reported deployed.** The original Rollcall app ID and history were retained, and the old console was retired. The previous notes below document the **predeployment candidate** and should not be interpreted as present-day blockers.

| Field | Recorded value |
| --- | --- |
| Original application | `rollcall-pavel` (`app_01M80KTYBTN7RBB8BD54CQAST3`) |
| Deployed candidate | Release 6, commit `6af91a66f3062a1be6db82de885bd2f5af58c4cc` |
| Live app | https://rollcall-pavel.app.space/ |
| Read-only source | https://rollcall-pavel.app.space/rehearsal-source/ |
| Git clone endpoint | `https://rollcall-pavel.app.space/release-source/git` |

### Reported release-6 evidence

- DeepSpace SDK 0.44.2: **33 unit tests + 14 browser checks passed**, with a successful three-identity incident through debrief.
- A separate production-build suite reportedly passed 14 browser tests; 82 earlier portable tests also passed.
- Both source-page URL forms reportedly returned HTTP 200 for anonymous browsing, and archive/clone content was matched against the released Git commit.
- A 90-second, 1080p/24fps, silent H.264 walkthrough with 19 English subtitle cues was exported from an edited three-account run.
- The latest browser testing was in Chromium. Physical iOS/Android, Safari, assistive-technology and sustained-load tests were not claimed.

These outcomes were recorded by **Codex in the authenticated environment**; this repository file is not itself a new independent production execution. Every new change must be tested again. In particular, changes proposed on GitHub are **not automatically reflected in the live DeepSpace release**; align the source records when deploying.

### Remaining boundaries

- Incident metrics and customer communications are fictional, and a passing authored test suite does not prove the repair works for all possible inputs.
- The bounded interpreter does not accept general-purpose JavaScript; the optional paid AI provider was not enabled.
- Room replay records should be bounded, but an application-level quota for creating rooms per account is not yet established; add platform abuse controls before broader public use.
- A previously executed limited secret scan is not a substitute for a full source/history security audit.
- The candidate's personal walkthrough and final application submission remain their responsibility.

## Historical predeployment notes (preserved for traceability)

---
## What would change on Rollcall

The public home page would introduce Rehearsal. The studio would open at /rehearsal-studio. The original console would move to /rollcall, and existing workspace links would keep opening their workspace. The release would add one SQLite Durable Object class, RehearsalStudioRoom, in migration v2-rehearsal-studio. Existing bindings remain in place. No backfill or deletion is required.

The candidate uses the installed DeepSpace 0.44.2 SDK. Its ancestor is Rollcall release source 296bd83. The studio implementation ends at ed77313. Later commits add release evidence and the build-based platform test runner. The owner CLI confirmed that DeepSpace holds the source of record and that live release 3 comes from 296bd83. The platform marks rel_01M80MDEJV9Q1JZCMXYTPB1YJ2 as available for rollback. The source page at /rehearsal-source/ would serve the released revision with a downloadable archive and a read-only Git clone. The export is assembled from committed source. Before the evidence document was added, a scan across all 156 reachable Git blobs found no common private-key, GitHub token, OpenAI secret-key or AWS access-key signatures. The tracked file list contained no environment files or key files. These checks have finite coverage.

## Evidence and remaining checks

| Requirement | Observed result |
| --- | --- |
| Seven incidents with behavioral repairs and diagnostics | Each scenario has a scenario-specific JavaScript function and policy document. Unit coverage exercises failure, repair, review and verification for all seven. |
| Build and types | The production Vite build with the installed DeepSpace plugin generated the worker, client and prerendered home page. TypeScript completed successfully. |
| State, permissions and tests | 33 native project unit tests passed across four files. Covers role-filtered views, competing revisions, duplicate submissions, chat retries and SQLite reopening. |
| Three-user collaboration | 13 of 13 Playwright cases passed against a locally running production build. Three independent Chromium processes completed a pricing incident with separate identities. The run included chat, a disconnected recipient fetching missed updates, revision conflicts, JavaScript and policy checks, written review, customer update and debrief. |
| Authentication | Local browser cases used signed identities from a temporary issuer. The production SDK and worker verified the tokens. A separate official run used three provisioned DeepSpace accounts. Each signed in through the real auth service. The official SDK created three isolated browser contexts. |
| Desktop and mobile | The public entry and source were checked at 390 and 1280 pixels. The mobile solo case passed after correcting a sidebar that covered the workspace. Browser tests use Chromium. |
| Stage 15 baseline | 82 portable tests passed after restoring the referenced Stage 10 fixture. The portable TypeScript check passed. Those tests ran separately from the native suite. |
| Coaching | An authored guide is available by default. The optional server integration is opt-in and billed to its caller. A live paid response has not been tested. |
| Official platform tests | After owner sign-in, deepspace test run all passed 33 unit tests and 13 browser cases, with zero skips. An initial run exposed missing source assets on the Vite dev server and DNS failures inside local workerd. The runner now builds the production assets and can forward real auth requests through the environment’s HTTPS proxy. The successful official run included the full three-account repair, permissions, collaboration and reconnect workflow. |
| Public release and public source | Pending deployment approval, publication on the original app and clean-browser checks against its public URL. |
| Submission | The project description, motivation, native architecture, AI disclosure and timed demonstration are in submission.md. The individual application checklist and deadline require verification in the candidate portal. |

The public DeepSpace Careers page describes an application and a live working session. The employer's university job listing describes building and deploying multi-user applications and evaluating how they feel to use. The candidate's own invitation governs any additional requirements.

- https://internship.app.space/
- https://career.alma.edu/jobs/eudaimonic-software-engineering-intern-summer-2027/

## Release procedure

Review the tested changes with Pavel before replacing the public release. Recheck the current release and source tip immediately before deploying. Use the SDK deployment for the existing app with its stale-release protection enabled. Open the public URL in a fresh browser, verify three hosted identities, repeat the team workflow and compare the anonymous source clone's HEAD with the deployed revision. An application rollback uses the platform's immutable release history. Retain the new studio storage when rolling back.

## Candidate invitation

Pavel’s previously supplied invitation asks for a focused full-stack DeepSpace application, a live URL, a source repository and a short write-up within the five-day exercise. It asks the applicant to explain integrations, tradeoffs, agent assistance, independent verification and unfinished work. The quoted deadline is Thursday, November 26, 2026 at 10:59 p.m. Minneapolis time (11:59 p.m. Eastern). This record uses the previously supplied invitation and the public listing. The private portal has not been reopened.

The working branch, tests, architecture, tradeoffs, SDK feedback, limitations and disclosure are ready for review. A live release and anonymous source link depend on publication. Personal verification belongs to the applicant. The ninety-second script gives Pavel a concrete run to perform before describing it in the first person.
