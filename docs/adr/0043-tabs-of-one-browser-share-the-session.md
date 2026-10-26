---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# A new tab joins the session of another tab of the same browser

ADR-0030 gives the session token only to a tab that redeems a launch address, and to that tab's reloads. A view address (its addendum of 2026-10-25) opened in a new tab therefore found no session there and said how to open the app again, so an address copied with Copy address, or given by Claude, opened nothing in a new tab even while the project was open beside it. This changes ADR-0030's model in one way: a tab can also get the token from another tab of the same browser that holds it.

- **Who asks.** A tab that opens with neither a launch code in its address nor a token in its session storage asks before it gives up. It opens this origin's `BroadcastChannel`, `visual-anything.session`, and posts `{ type: "session/ask", ask }`, where `ask` is 16 random bytes in hex, which holds nothing secret. While it waits it says it is asking the other tabs of this browser that have the project open.
- **Who answers.** Every tab keeps the channel open while its app runs, and answers an ask with `{ type: "session/token", ask, token }` only while its live connection is open, so that the token it gives is one the program accepts now; a tab still connecting, closed, or on its launch code gives nothing.
- **What the asking tab does.** It takes the first answer to its own ask, read strictly: a token of the form the program makes (base64url, 32 to 64 characters), anything else passed over. It closes the channel, keeps the token in its session storage, as a tab that redeemed a launch code does, and connects with it as ADR-0030 says. With no answer within 1.5 seconds, or where the browser has no `BroadcastChannel`, it closes the channel and shows what a tab with no token showed before, adding that a new tab joins only while another tab of this browser has the project open. The view state of its address applies once the project has come, as for a launch address.
- **The program changes nothing.** It still checks the Origin, the Host and the token of every live connection; a joined tab is one more app of the session, as a reload is.

ADR-0030's guarantees hold. The token goes into no address, no new request and no log: the channel's messages stay in the browser's memory, and the joined tab reaches the program only through the live connection that every tab opens. Nothing outside this origin can hear the channel, as the next section says. The token is still never printed and never handed to another process.

## Why only this origin's pages hear it

- A `BroadcastChannel` delivers only to documents and workers of the same origin, `http://127.0.0.1:<port>`, and, where the browser partitions storage, of the same top-level site. Another port, so another Visual Anything or any other local server, is another origin; so is `localhost:<port>`.
- That origin serves nothing but the app: its built files, or in dev mode its sources, never a file of the project folder (ADR-0030, M3b's dev guard). Images are cleaned data shown through `blob:` and `data:` addresses, never documents of their own (ADR-0027).
- The page's policy says `frame-ancestors 'none'`, so no other site can frame the app and listen from inside it.
- The browser keeps the channel per profile: another profile, a private window or another browser asks no tab of this one.

We chose this because an address that names where someone is in a project is only useful if it opens, and the person's own browser already holds the session in the tab beside it; because a channel of the page's own origin keeps the token inside what ADR-0030 already trusts, the app's own pages; and because the program and its checks stay as they are.

## Considered options

- **The program hands out a launch code to a tab that asks over HTTP**: rejected. A request without an Origin passes the checks without a token, so any local program could ask for a whole session (ADR-0032 rejected an HTTP route for the same reason).
- **The token in localStorage**: rejected. It would be written to disk in the browser's profile and outlive the session, and 127.0.0.1 and localhost are two origins anyway.
- **A shared or service worker that holds the token**: rejected for now. It does the same as the channel with more to load and to allow in the page's policy, and a service worker would outlive the program.
- **`window.opener` and `postMessage`**: rejected. They reach only a tab the app opened itself, not one the person opens by pasting an address.
- **Copy address carrying a launch code**: rejected. It would put a secret on the clipboard, and in whatever the person pastes it into.

## Consequences

- A view address, from Copy address, from Claude's `get_view_address` or from `visual-anything open --view … --no-open` (ADR-0044), opens in any new tab of the browser where the project is open, as long as the program runs on the same port.
- A joined tab paints its first frame in the system's theme and the browser's language, as a tab without a hint does, until the program sends the person's preferences with the project (ADR-0032, ADR-0038).
- Every tab of every Visual Anything in one browser hears its own origin's asks only; an ask costs a message per open tab of that origin.

## What remains

- **A stale token.** A tab whose session storage holds a token of an earlier run on the same port (`--port`) is refused and does not ask; it says how to open the app again, as before.
- **The live connection's query.** The token still travels to the program in the live connection's request target, `/live?token=…`, as ADR-0030 says for reloads and reconnections. A request target is no address the person sees or the browser's history keeps, and the program logs none; moving the token into a header of the WebSocket handshake would change every test of the live connection, and is left to a decision of its own.
- **Any page of this origin can read the token**, as it could read session storage before; that origin serves only the app.
