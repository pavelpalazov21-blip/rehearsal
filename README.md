# Rollcall

Rollcall is a release console for one checkout feature. An operator chooses what percentage of shoppers get an itemized receipt. Another browser can watch a specific shopper’s checkout change as the operator publishes or rolls back. The basket uses invented prices in Macedonian denars. Its total is always 1,280 MKD.

## Try the release

1. Open the app. The published rollout starts at 0%. The operator’s draft starts at 25%. Switch between **Draft receipt** and **Published receipt** for `shopper-002` to compare the proposed and current experience.
2. Click **Share view** to create a workspace. Open the link in a private window. That browser is a read-only observer. Select **Open live checkout** for `shopper-002` and leave it open.
3. In the operator window, enter a release note and click **Publish 25%**. Produce, Pantry and Household appear in the open checkout. Inspect `shopper-001` to see someone who still gets a total-only receipt.
4. Restore the initial release. The three line items disappear from the shopper’s checkout. The journal shows the publish and restore as separate events.

## How it works

| Part | What it owns |
| --- | --- |
| DeepSpace RecordRoom | Each workspace has a collection of release revisions. A unique revision number prevents two operators’ tabs from winning the same publish. The SDK’s live query sends committed changes to any open consoles or checkouts. |
| DeepSpace PresenceRoom | The online count shows how many connections are watching the same workspace, including checkout tabs. |
| DeepSpace-managed D1 | One row maps a workspace to the hash of its operator’s random browser credential. The Worker checks this record on every write. Sharing the URL grants observer access. |
| Checkout evaluator | The Worker evaluates the current release for a customer ID. The console calls the same pure assignment function for drafts. |

The assignment function hashes the flag key and customer ID into one of 10,000 buckets. At 25%, buckets 0 through 2,499 get the breakdown. Customer `shopper-002` stays in bucket 1,749 and `shopper-001` stays in 7,562. Increasing a rollout keeps everyone previously included. With a small audience the actual count can differ from the target percentage.

Every publish carries the revision the operator saw and a request ID. The winning write takes the next revision. A competing write receives HTTP 409. Repeating the same successful command returns its existing entry. If the server commits and its response goes missing, the browser checks the journal for that exact command. A rollback adds a revision that points back to the chosen policy.

An open checkout reads the latest policy from this endpoint.

```text
GET /api/rollcall/workspaces/<workspace-id>/evaluate?customer=shopper-002
```

This is the response after the first 25% publish.

```json
{"flag":"checkout.price-breakdown","customer":"shopper-002","revision":1,"percent":25,"bucket":1749,"enabled":true}
```

## Scope

Each workspace has one operator browser and any number of observers. Other tabs in the same browser profile can operate the workspace. A guest credential lasts 90 days. Clearing it loses write access to that workspace. Named operators and account recovery would be the next changes for a team using this on real releases.

The inspector shows 100 synthetic IDs and accepts a custom ID. A new workspace starts with an empty journal. The console displays the latest 50 changes plus the initial policy. A release changes only the demonstration checkout.

## Run locally

Use Node 24 and npm 11.6 or newer. The local Worker uses D1 and Durable Objects through the Cloudflare runtime.

```sh
npm ci
npm run dev:local
```

Open the address printed by Vite. These commands run the checks.

```sh
npx playwright install chromium
npm run validate
npm run lint
npm run test:browser
```

The unit tests cover fixed buckets, expanding audiences, input validation and revision logic. The browser and API tests cover an observer watching a checkout, competing publishes, a stale operator tab, retries after a lost response, and persistence after refresh.

The optional single-file preview runs the same console and receipt locally. It saves releases in browser storage when available.

```sh
npm run preview:offline -- ../Rollcall-Preview.html
```

## Deploy to DeepSpace

This project is registered with DeepSpace. An owner or collaborator can clone it with `npx deepspace clone rollcall-pavel`. To deploy a clean, committed checkout, run the following commands from its root.

```sh
npx deepspace auth login
npx deepspace deploy
git remote get-url space
```

The deploy prints the app URL. The `space` remote identifies the hosted source repository.

## Code to read

- `src/rollout/model.ts` defines assignment, command validation and revision construction.
- `src/server/releases.ts` handles workspace ownership, publishing and checkout evaluation.
- `src/schemas.ts` defines the release collection and its unique revision constraint.
- `src/rollout/Wire.tsx` subscribes each open client to release updates and presence.
- `tests/collab.spec.ts` exercises multiple browsers. `tests/api.spec.ts` runs two publish requests concurrently.
