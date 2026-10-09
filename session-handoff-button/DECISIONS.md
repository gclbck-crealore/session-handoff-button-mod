# Decisions: session-handoff-button

## Decisions
- The button is drawn in the `AbovePrompt` band. Rejected: the status line, because the `statusLine` setting is a command's output and no render site exists for it; `$.ui.status`, because it takes plain text and cannot be pressed; `PromptHint`, because its `tail` is text only and replacing its tree removes the engine's hints.
- The handoff is written by a real turn of the person's skill (`$.command.run`). Rejected: `$.model.fork`, because a fork denies every tool, and the skill runs read-only checks (git status) to reconcile state.
- When the configured skill is missing, the mod sends a built-in handoff prompt, so the shared mod works for people without the skill. Rejected: refusing to run, because the shared repo would do nothing for most people.
- The handoff turn is identified by the first main-loop `turn.start` after the press, and its `turnId` is kept in `$.state`. Rejected: matching the turn text, because what a skill command's turn carries as `text` is not documented.
- `/clear` and the submit run from `$.clock.after`, not from inside the `turn.complete` hook, because `$.command.run` rejects inside a hook the turn waits on.
- `/clear` runs only after the handoff turn ended with reason `answer`, not aborted, with non-empty text. Rejected: always clearing, because a failed handoff would lose the session with nothing to continue from.
- The handoff is sent with `asUser: true`, because the manual workflow pastes it as the person's own words. Rejected: the framed plugin message, because the new session should treat it as the person's instruction to continue. `autoSend: false` is the opt-out for anyone who wants to read it first.
- The handoff is copied to the clipboard before `/clear` as a recovery copy. Rejected: `$.store`, because the clipboard is where the manual workflow already keeps it, and a store key would outlive the session.
- Colors are fixed bands at the person's thresholds (under 45, 45–64, 65 and up), not interpolated, because the thresholds were stated as ranges. Hex values, not theme keys, because the request named green, orange and red and the theme's `warning` may be yellow.
- A green context draws the chip and `Context clean` as plain `Text` instead of the Button, so there is nothing to click and the `h` hotkey is gone. Rejected: a disabled Button, because `ButtonProps` has no disabled prop in 2.1.295; keeping the Button and ignoring the press, because it would still look pressable. While a handoff is running the Button stays, whatever the color, so its progress label stays visible. An unknown percent (`–`) keeps the Button.
- `phase` is reset to idle on `session.start`, so a reload mid-handoff cannot leave the button stuck in "Writing handoff…".

## Assumptions not verified
- `$.command.run({ command: 'clear' })` runs the built-in `/clear` from a plugin. The types say it runs a command "as if the person typed" it and that the command list includes built-ins. If wrong: the press ends with the toast "/clear failed; the handoff is on your clipboard". How to check: press the button in a real session and see the transcript clear.
- `$.command.run` of a skill command raises `turn.start` and `turn.complete` like a typed prompt, and `answer` holds the full handoff. If wrong: the mod waits in "Writing handoff…" until the next turn, or sends only part of the handoff. How to check: press it once and compare the sent text with the skill's reply.
- `$.prompt.submit` sent right after `/clear` resolves lands in the fresh session, not the old one. If wrong: the handoff appears before the clear. How to check: press it once and see the handoff as the first message after the clear.
- A single click on the band's Button presses it, not just focuses the band. The Button docs say a click raises `ui.press`; the band docs say a click focuses it. If wrong: it takes two clicks, or a click then `h`. How to check: click once in a real terminal.
- Reload survival: designed for (`$.state` keeps both keys), unverified; no stage proves a reload.
- Not checked on the Desktop Code tab.
