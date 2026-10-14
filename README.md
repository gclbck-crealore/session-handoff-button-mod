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

One press does the whole handoff routine, quietly: it writes a session handoff, saves it to a temp `.md`, runs `/clear`, and continues in the fresh session with a short message. The handoff goes in as hidden context, so nothing is pasted on screen.

Past 65% it also **stops your next prompt once** and recommends the button, so you don't carry on in a dull context by accident.

Requires Claude Code 2.1.287 or later (mods). Built on 2.1.295, run live on 2.1.299.

## Install

```sh
claude plugin marketplace add gclbck-crealore/session-handoff-button-mod
claude plugin install session-handoff-button@session-handoff-button-mod
```

Then run `/reload-plugins` in an open session, or start a new one.

To try it for one session without installing, clone the repo and run `claude --plugin-dir ./session-handoff-button`.

## Update

```sh
claude plugin marketplace update session-handoff-button-mod
claude plugin update session-handoff-button@session-handoff-button-mod
```

Then restart Claude Code, or run `/reload-plugins` in an open session. Installed copies are cached by version, so if `update` reports nothing new after a release, reinstall instead:

```sh
claude plugin uninstall session-handoff-button@session-handoff-button-mod
claude plugin install session-handoff-button@session-handoff-button-mod
```

## How it works

1. **Press** the button (click it, or focus the band with `ctrl+x tab` and press `h`).
2. The mod runs your handoff skill as a slash command (`/session-handoff` by default). If you have no such command, it sends a built-in handoff prompt.
3. When that turn finishes with an answer, the mod saves the answer to `<TMPDIR>/session-handoff/handoff-<timestamp>.md` and runs `/clear`.
4. In the fresh session the handoff is added as a hidden row and one short message is sent: `Session Hand-off: continuing from the previous session (handoff saved at <path>).` The model has the full handoff; you see only that line.

If the handoff turn is interrupted, errors or comes back empty, nothing is cleared. If the hidden row is refused, the full handoff text is sent as the message instead, so nothing is lost. `/resume` always brings the previous session back.

## The 65% guard

Once the context passes 65%, the first prompt you send is stopped with a message that points at the button:

> Session Hand-off: context is at 72%, past the point where answers get worse. Press the Session Hand-off button above the prompt to continue in a fresh session without losing the thread. This message shows once; send yours again to carry on here anyway.

It shows once per crossing. Press Enter again and the prompt goes through. Slash commands such as `/compact` and `/clear` are never stopped.

## Options

Set them in `/plugin` → session-handoff-button → configure.

- `skill` (default `session-handoff`): the slash command that writes the handoff.
- `autoSend` (default `true`): turn it off to have the short continue message placed in the prompt box so you can press Enter yourself. The handoff is already in the fresh session either way.

## What it can reach

Reach L2: it drives Claude (one handoff turn per press, `/clear`, one hidden row and one prompt in the new session) and writes one `.md` file per press under your temp folder (it reads only the `TMPDIR`/`TEMP` variable names to find it). It runs no processes and makes no network calls of its own. The handoff text reaches the new session with your authority, just as a manual paste would. On Linux `/tmp` is shared, so the saved file may be readable by other local users. Full footprint and threat model: [session-handoff-button/README.md](session-handoff-button/README.md).

## Limitations

- Claude Code's status line is a shell command's output, and mods cannot draw into it. The button sits in the band above the prompt instead.
- It is drawn in the terminal and the Desktop app's Code tab only. There is no button in `claude -p`, the SDK, the VS Code chat panel or cloud sessions.

## Uninstall

`claude plugin uninstall session-handoff-button@session-handoff-button-mod`, or disable it in `/plugin`. The only thing it leaves behind is the handoff `.md` files in your temp folder, which the operating system clears on its own.

## License

MIT
