# session-handoff-button

A **Session Hand-off** button above the prompt that shows how full the context window is (green under 45%, orange 45–64%, red from 65%). While green it reads `Context clean` and cannot be pressed; from orange on it reads `Session Hand-off` and one press hands the work to a fresh session: it writes a session handoff, saves it to a temp `.md`, runs `/clear`, and continues in the fresh session with a short message while the handoff rides along as hidden context. Past 65% it also stops your next prompt once and recommends the button.

Requires Claude Code 2.1.287 or later. Built on 2.1.295; the live run below was on 2.1.299.

```
● 30% Context clean            <- green: plain text, nothing to press
[ ● 52% Session Hand-off ]      <- orange/red: the button
> _
```

## What one press does

1. Runs your handoff skill as a slash command (`/session-handoff` by default). If no command of that name is installed, it sends a built-in handoff prompt instead.
2. When that turn ends with an answer, the mod saves the answer to `<TMPDIR>/session-handoff/handoff-<timestamp>.md`.
3. It runs `/clear`, then adds the handoff to the fresh session as a user-role row you do not see as typed, and sends one short message: `Session Hand-off: continuing from the previous session (handoff saved at <path>).` The model reads the full handoff; you never see it pasted. If `autoSend` is off, the short message goes into the prompt box and you press Enter.

If the hidden row is refused, the full handoff text is sent as the message instead, so nothing is lost. If the file cannot be written, the path is left out of the message. When the handoff turn is interrupted, errors, is refused or returns no text, the mod does **not** run `/clear`; a toast says why. Presses while a handoff is running are ignored. `/resume` brings back the old session at any time.

## The 65% guard

From 65% on, the first prompt you send is stopped once with this message, and nothing reaches the model:

> Session Hand-off: context is at 72%, past the point where answers get worse. Press the Session Hand-off button above the prompt to continue in a fresh session without losing the thread. This message shows once; send yours again to carry on here anyway.

Press Enter again and the same prompt goes through (the mod puts your draft back if the box was emptied). It warns once per crossing: if the context drops under 65% (a new session, a compaction) and rises again, it warns again. Slash commands (`/compact`, `/clear`, …), prompts from plugins and everything while a handoff is running are never stopped. If the guard itself breaks, your prompt goes through.

## Where the button is

Claude Code's status line (the `statusLine` setting) is a shell command's output. Mods cannot draw into it, so the button sits in the band directly above the prompt, the closest place that accepts a pressable button. Click it, or focus the band (a click or `ctrl+x tab`) and press `h`.

The percentage is the same figure the status line reads as `context_window.used_percentage`. It shows `–` in a fresh session until the first response.

## What it can reach

    ❯ ./register.tsx hooks: session.start, session.measure, prompt.submit, turn.start, turn.complete, ui.render{component=AbovePrompt}
    ❯ ./register.tsx calls: $.clock.after, $.clock.now (via saveHandoff), $.command.list (via startHandoff), $.command.run (via startHandoff, switchSession), $.env.get (via saveHandoff), $.fs.write (via saveHandoff), $.prompt.fill (via restoreDraft, switchSession), $.prompt.read (via restoreDraft), $.prompt.submit (via startHandoff, switchSession), $.session.append (via switchSession), $.session.usage, $.state.get, $.state.set, $.ui.resolve, $.ui.toast
    ❯ ./register.tsx env reads: TEMP, TMPDIR
    ❯ ./register.tsx state keys: session-handoff-button.percent, session-handoff-button.phase, session-handoff-button.warned

Reach L2 writes or runs or drives Claude (drives Claude, writes one file, writes a session row and the prompt box, persists state, draws).

```
Threat model for session-handoff-button (reach L2, writes or runs or drives Claude)
1. Reads:    context usage figures ($.session.usage, session.measure); the final answer text of main-loop turns, used only for the turn the mod started; typed prompts (prompt.submit, text read only to decide on the 65% stop and to restore a draft); the slash command list; env names TMPDIR and TEMP; state keys session-handoff-button.percent, .phase and .warned
2. Runs:     no processes; it drives Claude: one skill turn (or the built-in prompt) per press, /clear, one session row and one prompt in the fresh session
3. Sends:    nothing leaves the machine beyond the normal model requests of those turns
4. Persists: the handoff as one .md file per press under TMPDIR (default /tmp); three $.state keys for this session only; nothing in $.store
5. Hostile input: the handoff text is the model's answer, which can carry text from files or tool results it read; the mod gives it to the fresh session as a user-role row and a message sent as your own words (asUser), so injected instructions in it reach the new session with your authority, exactly as a manual paste would; set autoSend to false to read the short message first, and read the .md at the path it names; the skill name option only reaches $.command.run as a command name, never a shell; the saved file takes the default permissions (on macOS TMPDIR is private to your user; on Linux /tmp is shared, so the file may be readable by other local users)
```

## Install

One session: `claude --plugin-dir ./session-handoff-button`. To keep it, install it from a marketplace, then run `/reload-plugins` in an open session. Installed copies are cached by version: bump `version` before reinstalling.

## Options

- `skill`: the slash command that writes the handoff, without the slash. Default `session-handoff`. If it is not installed, the built-in handoff prompt is used.
- `autoSend`: send the short continue message to the fresh session automatically. Default `true`. Off: the message goes into the prompt box and waits for Enter; the handoff is already in the session either way.

Stored under `pluginConfigs` in settings; a change reloads the mod.

## Proof

- 16 unit tests on the official kit pass (`claude plugin test`); the guard and the flow-order tests were seen failing against a deliberately broken copy.
- `claude plugin validate` passes.
- Live, in a real terminal session on 2.1.299 (a pseudo-terminal driving `claude --plugin-dir`, with the thresholds lowered in a scratch copy so 5% context was enough): the button press ran the handoff, `/clear` ran, the fresh session showed only the short message with the temp file path, the model then answered a question about something said only in the old session, and the handoff text did not appear on screen. In a second run the first prompt over the mark was stopped with the warning and the same prompt went through on Enter.
- Not checked: the Desktop Code tab, a reload mid-handoff, and a real 45% / 65% session (the live runs used lowered thresholds).

## Limitations

- The button is in the band above the prompt, not inside the status line (see above).
- Draws only in the terminal and the Desktop app's Code tab. In `claude -p`, the Agent SDK, the VS Code chat panel and cloud sessions nothing is drawn, so there is no button.
- The fresh session's transcript line for the short message is labelled with the plugin's name (`Prompt from the session-handoff-button plugin`), as Claude Code does for any prompt a plugin sends.
- If you queue another prompt yourself between the press and the start of the handoff turn, the mod can pick up that turn as the handoff. Press when the session is idle.
- Reloading the mod (`/reload-plugins`, saving a file in development) while a handoff runs cancels it; nothing is cleared.
- The colors are fixed hex values (`#22c55e`, `#f97316`, `#ef4444`) and do not follow your theme.
- The temp `.md` files are not deleted by the mod; the operating system clears its temp folder on its own schedule.

## Uninstall

Disable it in `/plugin`. It leaves no `$.store` keys; the handoff `.md` files it wrote stay in the temp folder until the operating system removes them.
