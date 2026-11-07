import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'paper-meter',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// Nothing sits beneath the plugin: these hooks stand in for the engine.
function engine(on: any) {
  const store = new Map<string, unknown>()
  on('store.get', (_: unknown, e: any) => ({ value: store.get(e.key) }))
  on('store.set', (_: unknown, e: any) => (store.set(e.key, e.value), { value: undefined }))
  on('clock.now', () => ({ value: new Date('2026-11-07T12:00:00').getTime() }))
  on('command.register', () => ({ value: { command: 'paper-usage' } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  // The engine's own band beneath the plugin: an empty Box.
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

async function bandText($: any, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ ...BAND, surface })
  const row = await ui.find({ type: 'Text', text: /^Paper / })
  await ui.unmount()
  return row?.text
}

test('Paper calls show in the band; other tools and repeat ids do not', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__paper__get_basic_info', tool_use_id: 'a' } as any)
  await $.tool.call({ tool: 'mcp__paper__get_basic_info', tool_use_id: 'a' } as any)
  await $.tool.call({ tool: 'mcp__paper__write_html', tool_use_id: 'b' } as any)
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of ['terminal', 'desktop'] as const)
    expect(await bandText($, surface)).toBe('Paper 2 / 100 this week')
})

test('the band stays hidden until a Paper call is counted', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const)
    expect(await bandText($, surface)).toBe(undefined)
})

test('the band follows the pro plan', { options: { plan: 'pro' } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__paper__get_basic_info', tool_use_id: 'a' } as any)
  expect(await bandText($, 'terminal')).toBe('Paper 1 / 1M this week')
})

test('show: false hides the band', { options: { show: false } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__paper__get_basic_info', tool_use_id: 'a' } as any)
  expect(await bandText($, 'terminal')).toBe(undefined)
})
