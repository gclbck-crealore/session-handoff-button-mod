# session-handoff-button

A **Session Hand-off** button above the prompt that shows how full the context window is (green under 45%, orange 45–64%, red from 65%). One press writes a session handoff, copies it to the clipboard, runs `/clear`, and sends the handoff to the fresh session.

Built on Claude Code 2.1.295. Proven on 2.1.295 (stages: validate, load, test, install-smoke, isolation). Requires Claude Code 2.1.287 or later.

```
[ ● 52% Session Hand-off ]      <- the band directly above the prompt
> _
```

## What one press does

1. Runs your handoff skill as a slash command (`/session-handoff` by default). If no command of that name is installed, it sends a built-in handoff prompt instead.
2. When that turn ends with an answer, the mod copies the answer to the clipboard as a backup.
3. It runs `/clear`, then sends the handoff text to the fresh session as your own message. If `autoSend` is off, it puts the text in the prompt box and you press Enter.

When the handoff turn is interrupted, errors, is refused or returns no text, the mod does **not** run `/clear`; a toast says why. Presses while a handoff is running are ignored. `/resume` brings back the old session at any time.

## Where the button is

Claude Code's status line (the `statusLine` setting) is a shell command's output. Mods cannot draw into it, so the button sits in the band directly above the prompt, the closest place that accepts a pressable button. Click it, or focus the band (a click or `ctrl+x tab`) and press `h`.

The percentage is the same figure the status line reads as `context_window.used_percentage`. It shows `–` in a fresh session until the first response.

## What it can reach

    ❯ ./register.tsx hooks: session.start, session.measure, turn.start, turn.complete, ui.render{component=AbovePrompt}
    ❯ ./register.tsx calls: $.clock.after, $.command.list (via startHandoff), $.command.run (via startHandoff, switchSession), $.prompt.fill (via switchSession), $.prompt.submit (via startHandoff, switchSession), $.session.usage, $.state.get, $.state.set, $.ui.copy, $.ui.resolve, $.ui.toast

Reach L2 writes or runs or drives Claude (drives Claude, writes the prompt box, persists state, draws).

```
Threat model for session-handoff-button (reach L2, writes or runs or drives Claude)
1. Reads:    context usage figures ($.session.usage, session.measure); the final answer text of main-loop turns, used only for the turn the mod started; the slash command list; state keys session-handoff-button.percent and session-handoff-button.phase; no env vars, no files
2. Runs:     no processes; it drives Claude: one skill turn (or the built-in prompt) per press, /clear, and one prompt in the fresh session
3. Sends:    nothing leaves the machine beyond the normal model requests of those turns
4. Persists: two $.state keys for this session only (percent, phase); the handoff text on the clipboard; nothing in $.store, no files
5. Hostile input: the handoff text is the model's answer, which can carry text from files or tool results it read; the mod sends it to the fresh session as your own words (asUser), exactly as a manual paste would, so injected instructions in it reach the new session with your authority; set autoSend to false to read it before sending; the skill name option only reaches $.command.run as a command name, never a shell
```

## Install

One session: `claude --plugin-dir ./session-handoff-button`. To keep it, install it from a marketplace, then run `/reload-plugins` in an open session. Installed copies are cached by version: bump `version` before reinstalling.

## Options

- `skill`: the slash command that writes the handoff, without the slash. Default `session-handoff`. If it is not installed, the built-in handoff prompt is used.
- `autoSend`: send the handoff to the fresh session automatically. Default `true`. Off: the text goes into the prompt box and waits for Enter.

Stored under `pluginConfigs` in settings; a change reloads the mod.

## Limitations

- The button is in the band above the prompt, not inside the status line (see above).
- Draws only in the terminal and the Desktop app's Code tab. In `claude -p`, the Agent SDK, the VS Code chat panel and cloud sessions nothing is drawn, so there is no button.
- If you queue another prompt yourself between the press and the start of the handoff turn, the mod can pick up that turn as the handoff. Press when the session is idle.
- Reloading the mod (`/reload-plugins`, saving a file in development) while a handoff runs cancels it; nothing is cleared.
- The colors are fixed hex values (`#22c55e`, `#f97316`, `#ef4444`) and do not follow your theme.

## Uninstall

Disable it in `/plugin`. It leaves nothing behind: no `$.store` keys, no files.
