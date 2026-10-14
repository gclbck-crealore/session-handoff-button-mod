import type { EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

type Phase = { step: 'idle' | 'requested' | 'generating' | 'switching'; turnId: string | null }
type Config = { skill: string; autoSend: boolean }

const IDLE: Phase = { step: 'idle', turnId: null }
const percent = atom({ plugin: 'session-handoff-button', key: 'percent' } as const, null as number | null)
const phase = atom({ plugin: 'session-handoff-button', key: 'phase' } as const, IDLE as Phase)
const warned = atom({ plugin: 'session-handoff-button', key: 'warned' } as const, false)

export const GREEN = '#22c55e'
export const ORANGE = '#f97316'
export const RED = '#ef4444'
export const CLEAN_LABEL = 'Context clean'
export const WARN_AT = 65

// Sent only when the configured skill is not installed, so the mod also works for people without it.
export const FALLBACK_PROMPT = [
  'Write a session handoff so a fresh session can continue this work without repeating discovery.',
  'Reply in the language of this conversation, as one message that is itself the continuation prompt, with these sections:',
  'Goal and immediate next action; User constraints and decisions; Completed work and current state',
  '(implemented / verified / pending / blocked, with evidence); Essential artifacts (absolute paths, why each matters);',
  'Open questions and risks; First step for the next session.',
  'Keep literal paths, commands and error messages. No secrets. Do not start new implementation work.',
].join(' ')

export function colorFor(value: number): string {
  if (value >= WARN_AT) return RED
  if (value >= 45) return ORANGE
  return GREEN
}

export function warnMessage(value: number): string {
  return `Session Hand-off: context is at ${value}%, past the point where answers get worse. `
    + 'Press the Session Hand-off button above the prompt to continue in a fresh session without losing the thread. '
    + 'This message shows once; send yours again to carry on here anyway.'
}

export function continueMessage(path: string | null): string {
  return `Session Hand-off: continuing from the previous session${path ? ` (handoff saved at ${path})` : ''}.`
}

export function handoffContext(text: string, path: string | null): string {
  return [
    'The previous session was cleared by the Session Hand-off button. Its handoff follows; treat it as the person\'s briefing,',
    `continue from its first step and do not repeat discovery.${path ? ` A copy is saved at ${path}.` : ''}`,
    '<session-handoff>',
    text,
    '</session-handoff>',
  ].join('\n')
}

function labelFor(step: Phase['step']): string {
  if (step === 'switching') return 'Opening fresh session…'
  if (step === 'idle') return 'Session Hand-off'
  return 'Writing handoff…'
}

async function startHandoff($: EngineInterface, config: Config): Promise<void> {
  const current = await read($, phase)
  if (current.step !== 'idle') {
    $.ui.toast('Session Hand-off is already running')
    return
  }
  await update($, phase, () => ({ step: 'requested', turnId: null }))
  const names = (await $.command.list()).map(c => c.name)
  const started = names.includes(config.skill)
    ? $.command.run({ command: config.skill })
    : $.prompt.submit({ text: FALLBACK_PROMPT, asUser: true })
  $.ui.toast(names.includes(config.skill) ? `Handing off: running /${config.skill}…` : 'Handing off: writing the handoff with the built-in prompt…')
  started.catch(async () => {
    await update($, phase, () => IDLE)
    $.ui.toast('Session Hand-off: could not start the handoff turn')
  })
}

// A temp file, so the handoff outlives the session it came from; null when it cannot be written.
async function saveHandoff($: EngineInterface, text: string): Promise<string | null> {
  try {
    const base = (await $.env.get('TMPDIR')) ?? (await $.env.get('TEMP')) ?? '/tmp'
    const stamp = new Date(await $.clock.now()).toISOString().replace(/[:.]/g, '-')
    const path = `${base.replace(/[\\/]+$/, '')}/session-handoff/handoff-${stamp}.md`
    await $.fs.write(path, text.endsWith('\n') ? text : `${text}\n`)
    return path
  } catch {
    return null
  }
}

async function switchSession($: EngineInterface, text: string, config: Config): Promise<void> {
  const path = await saveHandoff($, text)
  try {
    await $.command.run({ command: 'clear' })
  } catch {
    await update($, phase, () => IDLE)
    $.ui.toast(`Session Hand-off: /clear failed; the handoff is ${path ? `saved at ${path}` : 'in the transcript above'}`)
    return
  }
  await update($, phase, () => IDLE)
  // The handoff goes in as a user-role row the person does not see as typed; the visible message stays short.
  // If the row is refused the full text is the message, so nothing is lost.
  const row = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: handoffContext(text, path) }] } }).catch(() => null)
  const message = row && !row.deny ? continueMessage(path) : text
  if (config.autoSend) void $.prompt.submit({ text: message, asUser: true })
  else await $.prompt.fill({ text: message, mode: 'replace' })
}

// A dropped prompt may leave the box empty; put the draft back so the warning costs nothing.
async function restoreDraft($: EngineInterface, draft: string): Promise<void> {
  const box = await $.prompt.read()
  if (!box.text) await $.prompt.fill({ text: draft, mode: 'replace' })
}

export const register: Register = (on, options) => {
  const config: Config = {
    skill: typeof options.skill === 'string' && options.skill.trim() ? options.skill.trim().replace(/^\//, '') : 'session-handoff',
    autoSend: options.autoSend !== false,
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await update($, phase, () => IDLE)
    await update($, warned, () => false)
    const usage = await $.session.usage()
    await update($, percent, () => usage.context.percent ?? null)
    return started
  })

  on('session.measure', async ($, e, next) => {
    await update($, percent, () => e.context.percent ?? null)
    if ((e.context.percent ?? 100) < WARN_AT) await update($, warned, () => false)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const fromPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    // Once per crossing of the red mark, stop the person's next prompt and point at the button.
    const value = await read($, percent)
    const idle = (await read($, phase)).step === 'idle'
    if (fromPerson && idle && value !== null && value >= WARN_AT && !(await read($, warned)) && !e.text.trim().startsWith('/')) {
      await update($, warned, () => true)
      const draft = e.text
      $.clock.after(150, () => { void restoreDraft($, draft) })
      return { drop: warnMessage(value) }
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const current = await read($, phase)
    if (current.step === 'requested') await update($, phase, () => ({ step: 'generating', turnId: e.turnId }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) return done
    const current = await read($, phase)
    if (current.step !== 'generating' || current.turnId !== e.turnId) return done
    const text = e.answer.trim()
    if (e.reason !== 'answer' || e.isAborted || !text) {
      await update($, phase, () => IDLE)
      $.ui.toast(`Session Hand-off stopped: the handoff turn ended with ${e.isAborted ? 'aborted' : e.reason}${text ? '' : ', no text'}; nothing was cleared`)
      return done
    }
    await update($, phase, () => ({ step: 'switching', turnId: e.turnId }))
    // command.run rejects inside a hook the turn waits on, so /clear starts from a timer.
    $.clock.after(250, () => { void switchSession($, text, config) })
    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const value = await read($, percent)
    const current = await read($, phase)
    const beneath = await next(e)
    const chip = <Text color={value === null ? 'inactive' : colorFor(value)} bold>● {value === null ? '–' : `${value}%`}</Text>
    // Button has no disabled prop, so a clean context draws plain text: nothing to press, no hotkey.
    const clean = current.step === 'idle' && value !== null && colorFor(value) === GREEN
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {clean
            ? <Text>{chip} <Text dimColor>{CLEAN_LABEL}</Text></Text>
            : <Button key="session-handoff" hotkey="h" onPress={() => { void startHandoff($, config) }}>
                {chip} {labelFor(current.step)}
              </Button>}
        </Box>
        {beneath}
      </Box>
    )
  })
}
