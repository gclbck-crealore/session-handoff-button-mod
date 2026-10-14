# Session Hand-off button for Claude Code

![Context fills up, the model gets dull, one button hands the work to a fresh session](assets/banner.png)

> **Hand off at 45%. One button instead of five steps.**

## Why

Every token you use fills the context window, and as it fills the model gets duller: it loses the thread, repeats itself and misses details. Clearing the context brings the sharpness back, but it also wipes the memory of everything done so far, and you don't want the model to forget that.

The fix is to hand the work over to a clean session once the context passes about **45%**. Normally that is five manual steps:

```text
/session-handoff  →  /copy  →  /clear  →  ctrl+v  →  enter
```

This mod replaces them with **one button**.

## What it does

A Claude Code **mod** that puts a **Session Hand-off** button directly above the prompt. The button shows how full the context window is and changes color as it fills:

| Context used | Color | Label |
|---|---|---|
| 0–44% | green | `Context clean` (not pressable) |
| 45–64% | orange | `Session Hand-off` |
| 65%+ | red | `Session Hand-off` |

While the context is green there is nothing to hand off, so the band shows `● 30% Context clean` as plain text: no button, no hotkey.

One press does the whole handoff routine: it writes a session handoff, copies it to the clipboard, runs `/clear`, and sends the handoff to the fresh session so work continues there.

Requires Claude Code 2.1.287 or later (mods). Built and proven on 2.1.295.

## Install

```sh
claude plugin marketplace add gclbck-crealore/session-handoff-button-mod
claude plugin install session-handoff-button@session-handoff-button-mod
```

Then run `/reload-plugins` in an open session, or start a new one.

To try it for one session without installing, clone the repo and run `claude --plugin-dir ./session-handoff-button`.

## How it works

1. **Press** the button (click it, or focus the band with `ctrl+x tab` and press `h`).
2. The mod runs your handoff skill as a slash command (`/session-handoff` by default). If you have no such command, it sends a built-in handoff prompt.
3. When that turn finishes with an answer, the mod copies the answer to the clipboard, runs `/clear`, and sends the handoff to the new session as your message.

If the handoff turn is interrupted, errors or comes back empty, nothing is cleared. `/resume` always brings the previous session back.

## Options

Set them in `/plugin` → session-handoff-button → configure.

- `skill` (default `session-handoff`): the slash command that writes the handoff.
- `autoSend` (default `true`): turn it off to have the handoff placed in the prompt box so you can read it and press Enter yourself.

## What it can reach

Reach L2: it drives Claude (one handoff turn per press, `/clear`, one prompt in the new session). It runs no processes, reads no files or environment variables, and makes no network calls of its own. The handoff text is sent to the new session as your own words, just as a manual paste would be. Full footprint and threat model: [session-handoff-button/README.md](session-handoff-button/README.md).

## Limitations

- Claude Code's status line is a shell command's output, and mods cannot draw into it. The button sits in the band above the prompt instead.
- It is drawn in the terminal and the Desktop app's Code tab only. There is no button in `claude -p`, the SDK, the VS Code chat panel or cloud sessions.

## Uninstall

`claude plugin uninstall session-handoff-button@session-handoff-button-mod`, or disable it in `/plugin`. It leaves nothing behind.

## License

MIT
