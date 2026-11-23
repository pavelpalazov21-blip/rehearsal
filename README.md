# Rehearsal

Rehearsal gives students and junior engineers a place to practice responding to an outage. Three people share one incident. The engineer investigates and tests a JavaScript repair, the commander reviews it, and Communications writes the customer update. A solo player can perform all three jobs.

Open the studio from the home page. Choose an incident and either start a solo drill or share one invitation per team role. Try the broken implementation first. Each exercise has eight behavioral cases and six configuration checks. A passing repair becomes eligible for written review. Applying it, checking the applied files and updating customers unlocks the report.

The seven drills cover checkout saturation, traffic surges, exposed credentials, an AI pricing error, duplicate charges, stale database replicas and an over-broad notification campaign. Evidence, customers, impact and timing are fictional. The code tests and room transitions execute on the server.

## Architecture

| Layer | Responsibility |
| --- | --- |
| React and TypeScript | Public entry, SDK auth gate, diagnostics, editor, review, chat and report |
| DeepSpace worker actions | Verify the caller, forward a fixed operation to the room, return a role-filtered view |
| DeepSpace BaseRoom and SQLite | One Durable Object owns a room. A transaction checks role, expected revision and request ID before changing its state |
| WebSockets | Send a change notification to admitted members after commit. Clients fetch their own view and recover missed updates by fetching again on reconnect |
| Repair evaluator | Parse a bounded JavaScript subset and test the function on scenario inputs. Validate JSON against the incident rules. Repeat the checks on the applied repair |
| Coaching | A role-specific authored hint works offline from the AI provider. An optional DeepSpace OpenAI integration, billed to the caller and enabled by the operator, can provide one short hint. It cannot commit a decision |

The original Rollcall app ID, source history and existing room bindings are retained. The new SQLite class has its own additive migration. The original console remains accessible at /rollcall and existing workspace links continue to open the corresponding workspace.

## Development and checks

Use Node 24 and install the locked dependencies with npm ci. Sign in with the existing app's DeepSpace owner or collaborator account for platform commands.

```sh
npm run dev
npm run type-check
npm run test:unit
npm run build
node tools/test-built.mjs
npx deepspace test run all
```

The isolated browser suite runs the production build locally under workerd with a temporary signing key, test identity provider, isolated SQLite state and independent browsers. Set ROLLCALL_CHROMIUM to use a system Chromium executable. The official account fixture uses the same Studio acceptance assertions with platform test accounts when the isolated runner is absent. The SDK suite requires owner authentication and three provisioned test identities.

The source page at /rehearsal-source/ is generated during the build from the Git commit. Review and commit first so its source matches the release. It includes a static, read-only Git endpoint. Deployment and evidence are tracked in docs/release-review.md.

## Limits

The editor supports expressions, comparisons, conditionals, local constants and a small set of operations. A passing result proves the authored tests. Recovery metrics and the score model practice decisions. A seat remains assigned when a person disconnects. Independent sign-in, hosted AI and production behavior each require their own platform checks.
