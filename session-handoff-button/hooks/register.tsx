import type { EngineInterface, Register, RenderSurface } from 'claude-code'
import { atom, read, update } from 'claude-code'

type Phase = { step: 'idle' | 'requested' | 'generating' | 'switching'; turnId: string | null }
type Config = { skill: string; autoSend: boolean }

const IDLE: Phase = { step: 'idle', turnId: null }
const percent = atom({ plugin: 'session-handoff-button', key: 'percent' } as const, null as number | null)
const phase = atom({ plugin: 'session-handoff-button', key: 'phase' } as const, IDLE as Phase)

export const GREEN = '#22c55e'
export const ORANGE = '#f97316'
export const RED = '#ef4444'
export const CLEAN_LABEL = 'Context clean'

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
  if (value >= 65) return RED
  if (value >= 45) return ORANGE
  return GREEN
}

function labelFor(step: Phase['step']): string {
  if (step === 'switching') return 'Opening fresh session…'
  if (step === 'idle') return 'Session Hand-off'
  return 'Writing handoff…'
}

// The surface of the last press, so the clipboard copy lands where the person pressed.
let pressedOn: RenderSurface | undefined

async function startHandoff($: EngineInterface, surface: RenderSurface, config: Config): Promise<void> {
  const current = await read($, phase)
  if (current.step !== 'idle') {
    $.ui.toast('Session Hand-off is already running')
    return
  }
  pressedOn = surface
  await update($, phase, () => ({ step: 'requested', turnId: null }))
  const names = (await $.command.list()).map(c => c.name)
  const started = names.includes(config.skill)
    ? $.command.run({ command: config.skill })
    : $.prompt.submit({ text: FALLBACK_PROMPT, asUser: true })
  $.ui.toast(names.includes(config.skill) ? `Running /${config.skill}…` : 'Writing handoff with the built-in prompt…')
  started.catch(async () => {
    await update($, phase, () => IDLE)
    $.ui.toast('Session Hand-off: could not start the handoff turn')
  })
}

async function switchSession($: EngineInterface, text: string, config: Config): Promise<void> {
  try {
    await $.command.run({ command: 'clear' })
  } catch {
    await update($, phase, () => IDLE)
    $.ui.toast('Session Hand-off: /clear failed; the handoff is on your clipboard')
    return
  }
  await update($, phase, () => IDLE)
  if (config.autoSend) void $.prompt.submit({ text, asUser: true })
  else await $.prompt.fill({ text, mode: 'replace' })
}

export const register: Register = (on, options) => {
  const config: Config = {
    skill: typeof options.skill === 'string' && options.skill.trim() ? options.skill.trim().replace(/^\//, '') : 'session-handoff',
    autoSend: options.autoSend !== false,
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await update($, phase, () => IDLE)
    const usage = await $.session.usage()
    await update($, percent, () => usage.context.percent ?? null)
    return started
  })

  on('session.measure', async ($, e, next) => {
    await update($, percent, () => e.context.percent ?? null)
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
    void $.ui.copy({ text, surface: pressedOn })
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
            : <Button key="session-handoff" hotkey="h" onPress={press => { void startHandoff($, press.surface, config) }}>
                {chip} {labelFor(current.step)}
              </Button>}
        </Box>
        {beneath}
      </Box>
    )
  })
}
