import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Usage } from '../types'
import { LOGO } from './logo.ts'
import { addCall, crossed, label, meterBar, prune, QUOTA, remember, report, weekTotal } from './meter.ts'
import type { Days, Plan } from './meter.ts'

const STORE_KEY = 'days-v1'
const SEEN_KEY = 'seen-v1'
const HEX = /^#[0-9a-fA-F]{6}$/

// What the band draws; kept in session state so a write redraws it.
const usage = atom({ plugin: 'paper-meter', key: 'usage' } as const, { total: 0 } as Usage, {
  shape: 'usage-1',
})

async function load($: Engine): Promise<Days> {
  const raw = await $.store.get(STORE_KEY)
  return raw && typeof raw === 'object' ? (raw as Days) : {}
}

/** Re-prune what is stored (days age out) and refresh the band. */
async function refresh($: Engine): Promise<void> {
  const days = prune(await load($), await $.clock.now())
  await $.store.set(STORE_KEY, days)
  await update($, usage, () => ({ total: weekTotal(days) }))
}

/** Count one Paper call once; toast when it crosses 80% or 100% of the quota. */
async function count($: Engine, tool: string, id: string, plan: Plan): Promise<void> {
  const raw = await $.store.get(SEEN_KEY)
  const seen = remember(Array.isArray(raw) ? (raw as string[]) : [], id)
  if (!seen) return // already counted by another copy of this mod
  await $.store.set(SEEN_KEY, seen)
  const now = await $.clock.now()
  const before = await load($)
  const days = addCall(before, tool, now)
  await $.store.set(STORE_KEY, days)
  const total = weekTotal(days)
  await update($, usage, () => ({ total }))
  const hit = crossed(weekTotal(prune(before, now)), total, plan)
  if (hit)
    $.ui.toast(`Paper: ${hit === 1 ? 'weekly limit reached' : '80% of weekly limit used'} · ${label(total, plan)}`)
}

export const register: Register = (on, options) => {
  const plan: Plan = options?.plan === 'pro' ? 'pro' : 'free'
  const show = options?.show !== false
  const color = typeof options?.color === 'string' && HEX.test(options.color) ? options.color : '#7BA7E9'

  // Parallel Paper calls would race the store's read-modify-write; queue them.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = (work: () => Promise<void>): Promise<void> => {
    const run = queue.then(work, work)
    queue = run.catch(() => undefined)
    return run
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'paper-usage',
      description: 'Show Paper MCP calls counted over the last 7 days',
    })
    await serial(() => refresh($)).catch(err => $.ui.log(`paper-meter: ${String(err)}`))
    return next(e)
  })

  on('command.run', { command: 'paper-usage' }, async $ => {
    const now = await $.clock.now()
    return { text: report(prune(await load($), now), plan, now) }
  })

  on('tool.call', { tool: /^mcp__paper__/ }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran // never reached Paper
    await serial(() => count($, e.tool, e.tool_use_id, plan)).catch(err =>
      $.ui.log(`paper-meter: ${String(err)}`),
    )
    return ran
  }).catch(($, e, next) => next(e)) // a meter failure never blocks the call

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { total } = await read($, usage)
    if (!show || e.props.hasSurvey || total === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const isHigh = total >= QUOTA[plan] * 0.8
    const ink = isHigh ? 'warning' : color

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={color}>{LOGO}</Text>
        <Text color={ink} bold>
          {label(total, plan)}
        </Text>
        <Text color={ink}>{meterBar(total, plan)}</Text>
      </Box>
    )
  })
}
