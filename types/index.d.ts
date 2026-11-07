export type Usage = { total: number }

declare module 'claude-code' {
  interface PluginState {
    'paper-meter': { usage: Shaped<Usage> }
  }
}
