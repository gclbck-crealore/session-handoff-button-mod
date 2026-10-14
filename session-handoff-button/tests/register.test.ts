import { describe, expect, mock, test } from 'claude-code/testing'
import type { CommandInfo, On, PromptSubmitInput, SessionMeasureInput, TurnCompleteInput } from 'claude-code'
import { CLEAN_LABEL, FALLBACK_PROMPT, GREEN, ORANGE, RED, colorFor, continueMessage, handoffContext } from '../hooks/register.tsx'

const PLUGIN = 'session-handoff-button'
const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

const measure = (value: number): SessionMeasureInput => ({
  context: { tokens: value * 2000, window: 200000, percent: value },
  rateLimits: [],
  changed: ['context'],
})
type Ending = { answer?: string; isAborted?: boolean; turnId?: string; reason?: 'answer' | 'aborted' | 'error' }
const finished = (over: Ending): TurnCompleteInput => ({
  answer: over.answer ?? HANDOFF,
  durationMs: 1000,
  isAborted: over.isAborted ?? false,
  turnId: over.turnId ?? 't-handoff',
  reason: over.reason ?? 'answer',
})
const HANDOFF = '# Session Handoff\nNext: run the tests.'
const typed = (text: string, kind: 'composer' | 'plugin' = 'composer'): PromptSubmitInput => ({
  text,
  wait: false,
  origin: kind === 'composer' ? { kind: 'composer' } : { kind: 'plugin', name: 'other' },
})
const skillCommand: CommandInfo = { name: 'session-handoff', description: 'handoff', source: 'user' }

type Submit = { text: string; asUser?: true }
type Calls = {
  commands: string[]; submits: Submit[]; fills: string[]; appends: string[]; writes: { path: string; text: string }[]
  toasts: string[]; order: string[]
}

function stubEngine(on: On, listed: CommandInfo[], options: { writeFails?: boolean; appendFails?: boolean } = {}): Calls {
  const calls: Calls = { commands: [], submits: [], fills: [], appends: [], writes: [], toasts: [], order: [] }
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['beneath'] }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.list', () => ({ value: listed }))
  on('command.run', ($, e) => { calls.commands.push(e.command); calls.order.push(e.command); return {} })
  on('prompt.submit', ($, e) => {
    calls.submits.push({ text: e.text, asUser: e.origin.kind === 'plugin' ? e.origin.asUser : undefined })
    calls.order.push('submit')
    return { text: e.text }
  })
  on('session.append', ($, e, next) => {
    if (options.appendFails) return { deny: 'refused' }
    calls.appends.push(e.message.content.map(b => (b.type === 'text' ? b.text : '')).join(''))
    calls.order.push('append')
    return next(e)
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('env.get', ($, e) => ({ value: e.name === 'TMPDIR' ? '/tmp/test/' : undefined }))
  on('fs.write', ($, e) => {
    if (options.writeFails) return { deny: 'read-only' }
    calls.writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('prompt.fill', ($, e) => { calls.fills.push(e.text); calls.order.push('fill'); return { isFilled: true } })
  on('ui.toast', ($, e) => { calls.toasts.push(e.text); return { value: undefined } })
  return calls
}

describe('color thresholds', () => {
  test('0-44 green, 45-64 orange, 65+ red', () => {
    expect([0, 44, 45, 64, 65, 100].map(colorFor)).toEqual([GREEN, GREEN, ORANGE, ORANGE, RED, RED])
  })
})

describe('band', () => {
  test('shows the percent in its color on terminal and desktop, and keeps what is beneath', async ($, on) => {
    stubEngine(on, [])
    await $.session.measure(measure(52))
    for (const surface of ['terminal', 'desktop'] as const) {
      const band = await $.ui.mount({ ...BAND, surface })
      const chip = await band.find({ type: 'Text', text: /^● 52%$/ })
      expect(chip?.props.color).toBe(ORANGE)
      expect(await band.find({ type: 'Button', key: 'session-handoff' })).toBeDefined()
      expect(await band.find({ type: 'Text', text: 'beneath' })).toBeDefined()
      await band.unmount()
    }
  })
})

describe('clean context', () => {
  test('green draws "Context clean" with no button to press', async ($, on) => {
    stubEngine(on, [skillCommand])
    await $.session.measure(measure(30))
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await band.find({ type: 'Text', text: /^● 30%$/ }))?.props.color).toBe(GREEN)
    expect(await band.find({ type: 'Text', text: CLEAN_LABEL })).toBeDefined()
    expect(await band.find({ type: 'Button', key: 'session-handoff' })).toBeUndefined()
    expect(await band.find({ text: /Session Hand-off/ })).toBeUndefined()
  })

  for (const value of [52, 80]) {
    test(`${value}% draws the Session Hand-off button and a press starts the handoff`, async ($, on) => {
      const clock = mock.clock(on)
      const calls = stubEngine(on, [skillCommand])
      await $.session.measure(measure(value))
      const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
      expect((await band.find({ type: 'Button', key: 'session-handoff' }))?.text).toMatch(/Session Hand-off$/)
      expect(await band.find({ type: 'Text', text: CLEAN_LABEL })).toBeUndefined()
      await band.press({ key: 'session-handoff' })
      await clock.settle()
      expect(calls.commands).toEqual(['session-handoff'])
    })
  }
})

describe('hand-off flow', () => {
  test('press runs the skill, saves the md, runs /clear, then adds the handoff as a hidden row and sends a short message', async ($, on) => {
    const clock = mock.clock(on)
    const calls = stubEngine(on, [skillCommand])
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await band.press({ key: 'session-handoff' })
    await clock.settle()
    expect(calls.commands).toEqual(['session-handoff'])
    await $.turn.start({ text: '', turnId: 't-handoff' })
    await $.turn.complete(finished({}))
    await clock.advance(300)
    await clock.settle()
    expect(calls.commands).toEqual(['session-handoff', 'clear'])
    expect(calls.writes).toHaveLength(1)
    const { path, text } = calls.writes[0] ?? { path: '', text: '' }
    expect(path).toMatch(/^\/tmp\/test\/session-handoff\/handoff-.+\.md$/)
    expect(text).toBe(`${HANDOFF}\n`)
    expect(calls.appends).toEqual([handoffContext(HANDOFF, path)])
    expect(calls.submits).toEqual([{ text: continueMessage(path), asUser: true }])
    expect(calls.submits[0]?.text).not.toContain('Next: run the tests.')
    expect(calls.order).toEqual(['session-handoff', 'clear', 'append', 'submit'])
  })

  test('a handoff that cannot be written is still delivered, without a path', async ($, on) => {
    const clock = mock.clock(on)
    const calls = stubEngine(on, [skillCommand], { writeFails: true })
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await band.press({ key: 'session-handoff' })
    await clock.settle()
    await $.turn.start({ text: '', turnId: 't-handoff' })
    await $.turn.complete(finished({}))
    await clock.advance(300)
    await clock.settle()
    expect(calls.commands).toEqual(['session-handoff', 'clear'])
    expect(calls.appends).toEqual([handoffContext(HANDOFF, null)])
    expect(calls.submits).toEqual([{ text: continueMessage(null), asUser: true }])
  })

  test('if the hidden row is refused, the full handoff is sent as the message so nothing is lost', async ($, on) => {
    const clock = mock.clock(on)
    const calls = stubEngine(on, [skillCommand], { appendFails: true })
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await band.press({ key: 'session-handoff' })
    await clock.settle()
    await $.turn.start({ text: '', turnId: 't-handoff' })
    await $.turn.complete(finished({}))
    await clock.advance(300)
    await clock.settle()
    expect(calls.appends).toEqual([])
    expect(calls.submits).toEqual([{ text: HANDOFF, asUser: true }])
  })

  test('without the skill it sends the built-in handoff prompt', async ($, on) => {
    const clock = mock.clock(on)
    const calls = stubEngine(on, [])
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await band.press({ key: 'session-handoff' })
    await clock.settle()
    expect([calls.commands, calls.submits.map(s => s.text)]).toEqual([[], [FALLBACK_PROMPT]])
  })

  test('gate: an aborted handoff turn never runs /clear', async ($, on) => {
    const clock = mock.clock(on)
    const calls = stubEngine(on, [skillCommand])
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await band.press({ key: 'session-handoff' })
    await clock.settle()
    await $.turn.start({ text: '', turnId: 't-handoff' })
    await $.turn.complete(finished({ isAborted: true, reason: 'aborted', answer: '' }))
    await clock.advance(1000)
    await clock.settle()
    expect(calls.commands.filter(c => c === 'clear')).toHaveLength(0)
    expect(calls.submits).toHaveLength(0)
  })

  test('a turn that was not the handoff is ignored', async ($, on) => {
    const clock = mock.clock(on)
    const calls = stubEngine(on, [skillCommand])
    await $.turn.start({ text: 'hi', turnId: 't-other' })
    await $.turn.complete(finished({ turnId: 't-other' }))
    await clock.advance(1000)
    await clock.settle()
    expect(calls.commands).toEqual([])
  })

  test('autoSend off adds the hidden row and drafts the short message for Enter', { options: { autoSend: false } }, async ($, on) => {
    const clock = mock.clock(on)
    const calls = stubEngine(on, [skillCommand])
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await band.press({ key: 'session-handoff' })
    await clock.settle()
    await $.turn.start({ text: '', turnId: 't-handoff' })
    await $.turn.complete(finished({}))
    await clock.advance(300)
    await clock.settle()
    const path = calls.writes[0]?.path ?? ''
    expect(calls.submits).toEqual([])
    expect(calls.order).toEqual(['session-handoff', 'clear', 'append', 'fill'])
    expect(calls.fills).toEqual([continueMessage(path)])
  })
})

describe('65% guard', () => {
  test('stops the next prompt once with the warning, then lets it through', async ($, on) => {
    const clock = mock.clock(on)
    const calls = stubEngine(on, [skillCommand])
    await $.session.measure(measure(70))
    const first = await $.prompt.submit(typed('keep going'))
    expect('drop' in first ? first.drop : '').toMatch(/70%.*Session Hand-off button/)
    expect(calls.submits).toEqual([])
    await clock.advance(200)
    await clock.settle()
    expect(calls.fills).toEqual(['keep going'])
    await $.prompt.submit(typed('keep going'))
    expect(calls.submits.map(s => s.text)).toEqual(['keep going'])
  })

  test('below 65% nothing is stopped', async ($, on) => {
    const calls = stubEngine(on, [skillCommand])
    await $.session.measure(measure(64))
    await $.prompt.submit(typed('hello'))
    expect(calls.submits.map(s => s.text)).toEqual(['hello'])
  })

  test('slash commands and plugin prompts are never stopped, and do not use up the warning', async ($, on) => {
    const calls = stubEngine(on, [skillCommand])
    await $.session.measure(measure(90))
    await $.prompt.submit(typed('/compact'))
    await $.prompt.submit(typed('from a plugin', 'plugin'))
    expect(calls.submits.map(s => s.text)).toEqual(['/compact', 'from a plugin'])
    const stopped = await $.prompt.submit(typed('now a real prompt'))
    expect('drop' in stopped).toBe(true)
  })

  test('warns again after the context dropped below the mark and crossed it again', async ($, on) => {
    mock.clock(on)
    const calls = stubEngine(on, [skillCommand])
    await $.session.measure(measure(70))
    expect('drop' in (await $.prompt.submit(typed('one')))).toBe(true)
    await $.prompt.submit(typed('two'))
    await $.session.measure(measure(20))
    await $.session.measure(measure(68))
    expect('drop' in (await $.prompt.submit(typed('three')))).toBe(true)
    expect(calls.submits.map(s => s.text)).toEqual(['two'])
  })
})
