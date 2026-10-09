import { describe, expect, mock, test } from 'claude-code/testing'
import type { CommandInfo, On, SessionMeasureInput, TurnCompleteInput } from 'claude-code'
import { FALLBACK_PROMPT, GREEN, ORANGE, RED, colorFor } from '../hooks/register.tsx'

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
  answer: over.answer ?? '# Session Handoff\nNext: run the tests.',
  durationMs: 1000,
  isAborted: over.isAborted ?? false,
  turnId: over.turnId ?? 't-handoff',
  reason: over.reason ?? 'answer',
})
const skillCommand: CommandInfo = { name: 'session-handoff', description: 'handoff', source: 'user' }

type Calls = { commands: string[]; submits: { text: string; asUser?: true }[]; fills: string[]; copies: string[]; toasts: string[] }

function stubEngine(on: On, listed: CommandInfo[]): Calls {
  const calls: Calls = { commands: [], submits: [], fills: [], copies: [], toasts: [] }
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['beneath'] }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.list', () => ({ value: listed }))
  on('command.run', ($, e) => { calls.commands.push(e.command); return {} })
  on('prompt.submit', ($, e) => { calls.submits.push({ text: e.text, asUser: e.origin.kind === 'plugin' ? e.origin.asUser : undefined }); return { text: e.text } })
  on('prompt.fill', ($, e) => { calls.fills.push(e.text); return { isFilled: true } })
  on('ui.copy', ($, e) => { calls.copies.push(e.text); return { value: { isCopied: true } } })
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

describe('hand-off flow', () => {
  test('press runs the skill, then /clear, then sends the handoff as the person', async ($, on) => {
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
    expect(calls.copies).toEqual(['# Session Handoff\nNext: run the tests.'])
    expect(calls.submits).toEqual([{ text: '# Session Handoff\nNext: run the tests.', asUser: true }])
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

  test('autoSend off puts the handoff in the prompt box instead of sending', { options: { autoSend: false } }, async ($, on) => {
    const clock = mock.clock(on)
    const calls = stubEngine(on, [skillCommand])
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await band.press({ key: 'session-handoff' })
    await clock.settle()
    await $.turn.start({ text: '', turnId: 't-handoff' })
    await $.turn.complete(finished({}))
    await clock.advance(300)
    await clock.settle()
    expect([calls.commands, calls.submits.length, calls.fills]).toEqual([['session-handoff', 'clear'], 0, ['# Session Handoff\nNext: run the tests.']])
  })
})
