# Rehearsal — practical reviewer walkthrough

## Try it yourself (solo, about five minutes)

1. Open [Rehearsal](https://rollcall-pavel.app.space/), sign in and choose **Open the incident studio**.
2. Select **Runaway AI pricing agent**, then **Solo**. The incident is fictional.
3. Start the exercise, run `logs`, and inspect the evidence. Notice that the starter approval function checks only price-change size.
4. Open **Code editor** and run its 8 JavaScript cases. A small unapproved change can incorrectly pass.
5. Change the function to require approval, a verified source, and inclusive percentage boundaries. Run the 8 JavaScript cases again.
6. Repair **Guardrails** and run 6 configuration checks. Submit both passing artifacts.
7. In the commander role, compare the original and revised files, write a substantive review and authorize the repair.
8. Apply and verify. In the communications role, publish a factual simulated update. Close the incident and read the debrief.

One accepted JavaScript repair from the actual source tests:

```js
function approvePriceChange(change) {
  return change.approved === true && change.source === 'verified'
    && change.percentChange >= -10 && change.percentChange <= 10;
}
```

Use the actual [browser acceptance test](../tests/studio-collab.spec.ts) for the complete policy fixture and exact expected results. The editor supports a deliberately **restricted** JavaScript subset.

## Try three genuine accounts

A Commander creates a **Team** room and sends separate role invitations to two distinct signed-in users: **Engineer** and **Communications**. Only the Engineer sees the private diagnostic evidence and tests the repair. The Commander reviews the submitted code and configuration and authorizes application. The Engineer applies and verifies; Communications publishes after verification. A WebSocket notification prompts each browser to request its own authorized snapshot.

Do not substitute multiple tabs sharing a single identity for independent authentication. Never share real invite codes or tokens in a public video.

## The silent 90-second demonstration

The separately supplied internship MP4 condenses a recorded run; it is edited for time rather than pretending to be a continuous 90-second live repair. It contains subtitles and no audio.

| Time | Event |
| --- | --- |
| 0–22s | Problem, incident selection and fictional pricing-agent scenario |
| 22–35s | Three independently authenticated responders claim roles |
| 35–55s | Logs, failing starter rule, JavaScript and configuration repair |
| 55–70s | Submitted source comparison and written Commander approval |
| 70–82s | Apply, verify, simulated customer update and debrief |
| 82–90s | Released source and product summary |

## What to ask in a technical interview

- Why does the server, not the interface, decide what Communications can read?
- If two team members submit changes against the same revision, which one should win and why?
- How do request IDs protect against a client retry after a lost response?
- What happens when the WebSocket disconnects after a state change?
- Why use a restricted interpreter instead of evaluating arbitrary JavaScript?
- What does passing 8 tests prove—and what does it *not* prove?
- Which requirements and product decisions came from the project owner, and which implementation and tests were done with Codex?

[Read the architecture](../README.md#architecture) · [Release review](release-review.md)
