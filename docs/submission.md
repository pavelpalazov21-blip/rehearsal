# Rehearsal — a multiplayer incident-response studio

## Project description

A checkout stops working after a release. The engineer has the logs, the commander has to decide whether a repair is safe, and someone owes customers an update. Rehearsal lets three people practice that conversation while fixing an actual JavaScript function. There are seven incidents, including a pricing agent that publishes changes without approval.

I chose incident response because I wanted to practice the part of debugging that starts after someone suggests a fix. Which input would have caught the bug? Who has reviewed the change? What can we honestly tell a customer? In Rehearsal, those questions affect what the team can do next.

The app uses the original Rollcall DeepSpace project. An authenticated worker sends each decision to a SQLite-backed room. Two approvals based on the same revision cannot both change the incident. WebSocket notifications tell each browser to fetch its own view, so Communications can report recovery without receiving the engineer’s private notes.

## AI and previous work

I started with my existing Rollcall scaffold and an earlier Rehearsal prototype. I used Codex extensively to implement the interface, integrate the worker and room, write and run tests, troubleshoot failures, and prepare this write-up. The exercises use authored examples. The app displays whether a hint came from the scenario guide or an AI provider. Automated test results in the release record were run by Codex. I would describe any walkthrough I performed myself separately.

## Ninety-second live demo

Before the clock starts, sign three browser profiles in and join one team pricing incident. Leave each profile on its assigned role. Keep a tested repair and config ready to paste. The acceptance test in tests/studio-collab.spec.ts contains both.

| Time | Action and talking point |
| --- | --- |
| 0–12s | Show the incident and the three roles. “A pricing agent changed hundreds of listings. We need to find out which updates were allowed through.” |
| 12–27s | Start, open the engineer’s logs and investigate. Show a failing case. “An unverified change can pass the original approval rule.” |
| 27–48s | Enter the revised function and config. Run both suites and show the counts. “It checks approval, source and size, including the boundaries.” Submit the repair. |
| 48–64s | In the commander window inspect the before/after diff. Write why an unapproved change must fail, record the review, then approve. |
| 64–78s | Apply and verify from the engineer window. Publish a short factual customer update from Communications. Show the other screens updating. |
| 78–90s | Close the incident. Point to the recovery explanation and open the read-only source. “The room runs the tests again on the applied files. Each browser only sees the information its role needs.” |
