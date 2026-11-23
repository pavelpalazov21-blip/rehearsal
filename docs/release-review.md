# Rehearsal release review

## What would change on Rollcall

The public home page would introduce Rehearsal. The studio would open at /rehearsal-studio. The original console would move to /rollcall, and existing workspace links would keep opening their workspace. The release would add one SQLite Durable Object class, RehearsalStudioRoom, in migration v2-rehearsal-studio. Existing bindings remain in place. No backfill or deletion is required.

The candidate uses the installed DeepSpace 0.44.2 SDK. Its ancestor is Rollcall release source 296bd83. The tested application changes end at ed77313. The source page at /rehearsal-source/ would serve the released revision with a downloadable archive and a read-only Git clone. The export is assembled from committed source. Before the evidence document was added, a scan across all 156 reachable Git blobs found no common private-key, GitHub token, OpenAI secret-key or AWS access-key signatures. The tracked file list contained no environment files or key files. These checks have finite coverage.

## Evidence and remaining checks

| Requirement | Observed result |
| --- | --- |
| Seven incidents with behavioral repairs and diagnostics | Each scenario has a scenario-specific JavaScript function and policy document. Unit coverage exercises failure, repair, review and verification for all seven. |
| Build and types | The production Vite build with the installed DeepSpace plugin generated the worker, client and prerendered home page. TypeScript completed successfully. |
| State, permissions and tests | 33 native project unit tests passed across four files. Covers role-filtered views, competing revisions, duplicate submissions, chat retries and SQLite reopening. |
| Three-user collaboration | 13 of 13 Playwright cases passed against a locally running production build. Three independent Chromium processes completed a pricing incident with separate identities. The run included chat, a disconnected recipient fetching missed updates, revision conflicts, JavaScript and policy checks, written review, customer update and debrief. |
| Authentication | Local browser cases used signed identities from a temporary issuer. The production SDK and worker verified the tokens. Confirming issuance by the hosted identity provider requires owner access. |
| Desktop and mobile | The public entry and source were checked at 390 and 1280 pixels. The mobile solo case passed after correcting a sidebar that covered the workspace. Browser tests use Chromium. |
| Stage 15 baseline | 82 portable tests passed after restoring the referenced Stage 10 fixture. The portable TypeScript check passed. Those tests ran separately from the native suite. |
| Coaching | An authored guide is available by default. The optional server integration is opt-in and billed to its caller. A live paid response has not been tested. |
| Official platform tests | The official CLI returned not_authenticated. Pending owner login and a run with platform-issued identities. |
| Public release and public source | Pending deployment approval, publication on the original app and clean-browser checks against its public URL. |
| Submission | The project description, motivation, native architecture, AI disclosure and timed demonstration are in submission.md. The individual application checklist and deadline require verification in the candidate portal. |

The public DeepSpace Careers page describes an application and a live working session. The employer's university job listing describes building and deploying multi-user applications and evaluating how they feel to use. The candidate's own invitation governs any additional requirements.

- https://internship.app.space/
- https://career.alma.edu/jobs/eudaimonic-software-engineering-intern-summer-2027/

## Release procedure

After owner authentication, confirm the app ID, source authority and latest release, record the rollback release ID, and run the official suite. Review the changes with Pavel before replacing the public release. Use the SDK deployment for the existing app with its stale-release protection enabled. Open the public URL in a fresh browser, verify three hosted identities, repeat the team workflow and compare the anonymous source clone's HEAD with the deployed revision. An application rollback uses the platform's immutable release history. Retain the new studio storage when rolling back.
