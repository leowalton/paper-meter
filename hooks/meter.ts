// Pure helpers: no engine, `now` passed in, so tests need no clock.

export type Day = { total: number; byTool: Record<string, number> }
export type Days = Record<string, Day>

export const WINDOW_DAYS = 7
export const QUOTA = { free: 100, pro: 1_000_000 } as const
export type Plan = keyof typeof QUOTA

const DAY_MS = 86_400_000

/** Local calendar date, YYYY-MM-DD. */
export const dayKey = (now: number): string => {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Keys of today and the six days before it. */
const windowKeys = (now: number): Set<string> =>
  new Set(Array.from({ length: WINDOW_DAYS }, (_, i) => dayKey(now - i * DAY_MS)))

export const prune = (days: Days, now: number): Days => {
  const keep = windowKeys(now)
  return Object.fromEntries(Object.entries(days).filter(([k]) => keep.has(k)))
}

export const addCall = (days: Days, tool: string, now: number): Days => {
  const key = dayKey(now)
  const day = days[key] ?? { total: 0, byTool: {} }
  return prune(
    {
      ...days,
      [key]: {
        total: day.total + 1,
        byTool: { ...day.byTool, [tool]: (day.byTool[tool] ?? 0) + 1 },
      },
    },
    now,
  )
}

export const weekTotal = (days: Days): number =>
  Object.values(days).reduce((sum, d) => sum + d.total, 0)

const short = (n: number): string =>
  n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en-US')

export const label = (total: number, plan: Plan): string => {
  const quota = QUOTA[plan]
  const warn = total >= quota * 0.8 ? ' ⚠' : ''
  return `Paper ${short(total)} / ${short(quota)} this week${warn}`
}

/** Which threshold (0.8 or 1) the step from `before` to `after` crossed, if any. */
export const crossed = (before: number, after: number, plan: Plan): 0.8 | 1 | undefined => {
  const quota = QUOTA[plan]
  if (before < quota && after >= quota) return 1
  if (before < quota * 0.8 && after >= quota * 0.8) return 0.8
  return undefined
}

export const report = (days: Days, plan: Plan, now: number): string => {
  const total = weekTotal(days)
  const today = days[dayKey(now)]?.total ?? 0
  const byTool: Record<string, number> = {}
  for (const d of Object.values(days))
    for (const [t, n] of Object.entries(d.byTool)) byTool[t] = (byTool[t] ?? 0) + n
  const top = Object.entries(byTool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t, n]) => `  ${t.replace(/^mcp__paper__/, '')}: ${n}`)
  const oldest = Object.keys(days).sort()[0]
  const lines = [
    `${label(total, plan)} (${plan}, rolling 7 days)`,
    `Today: ${today}`,
    ...(top.length ? ['Top tools:', ...top] : ['No Paper calls counted yet.']),
  ]
  if (oldest && oldest !== dayKey(now)) {
    const dropsOn = dayKey(new Date(`${oldest}T00:00:00`).getTime() + WINDOW_DAYS * DAY_MS)
    lines.push(`${oldest}'s ${days[oldest]?.total ?? 0} calls drop out on ${dropsOn}.`)
  }
  lines.push('Counts Claude Code calls only — an estimate of Paper’s own meter.')
  return lines.join('\n')
}

/** How many recent tool_use_ids to remember; far more than any burst of calls. */
export const SEEN_LIMIT = 2000

/**
 * Dedupe guard: returns the updated id list, or undefined when `id` was
 * already counted (e.g. two copies of the mod loaded in one session).
 */
export const remember = (seen: readonly string[], id: string): string[] | undefined =>
  seen.includes(id) ? undefined : [...seen, id].slice(-SEEN_LIMIT)

/** An 8-segment usage meter, e.g. ▰▰▱▱▱▱▱▱; any use shows at least one segment. */
export const meterBar = (total: number, plan: Plan, segments = 8): string => {
  const ratio = Math.min(1, total / QUOTA[plan])
  const on = total > 0 ? Math.max(1, Math.round(ratio * segments)) : 0
  return '▰'.repeat(on) + '▱'.repeat(segments - on)
}
