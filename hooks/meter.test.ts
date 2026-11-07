import { expect, test } from 'claude-code/testing'

import { addCall, crossed, dayKey, label, prune, remember, report, SEEN_LIMIT, weekTotal } from './meter.ts'
import type { Days } from './meter.ts'

const NOW = new Date('2026-11-07T12:00:00').getTime()
const DAY = 86_400_000

test('a call is counted under today and its tool', async () => {
  const days = addCall(addCall({}, 'mcp__paper__write_html', NOW), 'mcp__paper__write_html', NOW)
  expect(weekTotal(days)).toBe(2)
  expect(days[dayKey(NOW)]?.byTool['mcp__paper__write_html']).toBe(2)
})

test('days older than the 7-day window are pruned', async () => {
  const days: Days = {
    [dayKey(NOW - 6 * DAY)]: { total: 5, byTool: {} },
    [dayKey(NOW - 7 * DAY)]: { total: 9, byTool: {} },
  }
  expect(weekTotal(prune(days, NOW))).toBe(5)
})

test('the label shortens big numbers and warns past 80%', async () => {
  expect(label(30, 'pro')).toBe('Paper 30 / 1M this week')
  expect(label(79, 'free')).toBe('Paper 79 / 100 this week')
  expect(label(80, 'free')).toBe('Paper 80 / 100 this week ⚠')
  expect(label(12_345, 'pro')).toBe('Paper 12k / 1M this week')
})

test('crossing 80% and 100% is reported once each', async () => {
  expect(crossed(79, 80, 'free')).toBe(0.8)
  expect(crossed(80, 81, 'free')).toBe(undefined)
  expect(crossed(99, 100, 'free')).toBe(1)
})

test('the report lists top tools and when the oldest day drops out', async () => {
  const days = addCall({ [dayKey(NOW - 2 * DAY)]: { total: 3, byTool: { mcp__paper__get_screenshot: 3 } } }, 'mcp__paper__get_basic_info', NOW)
  const text = report(days, 'pro', NOW)
  expect(text).toContain('Paper 4 / 1M this week')
  expect(text).toContain('Today: 1')
  expect(text).toContain('get_screenshot: 3')
  expect(text).toContain(`drop out on ${dayKey(NOW + 5 * DAY)}`)
})

test('an id already counted is refused; the list stays bounded', async () => {
  expect(remember([], 'a')).toEqual(['a'])
  expect(remember(['a'], 'a')).toBe(undefined)
  const full = Array.from({ length: SEEN_LIMIT }, (_, i) => String(i))
  const next = remember(full, 'new')
  expect(next?.length).toBe(SEEN_LIMIT)
  expect(next?.at(-1)).toBe('new')
})
