declare module 'claude-code' {
  interface PluginState {
    'session-handoff-button': {
      percent: number | null
      phase: { step: 'idle' | 'requested' | 'generating' | 'switching'; turnId: string | null }
    }
  }
}
