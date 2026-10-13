import { test, expect } from 'claude-code/testing'
import { detached, fetchMinutes } from '../hooks/schedule'

test('fetch interval: 0 turns it off, anything else is at least a minute', () => {
  expect(fetchMinutes(undefined)).toBe(5)
  expect(fetchMinutes(0)).toBe(0)
  expect(fetchMinutes(0.2)).toBe(1)
  expect(fetchMinutes(-3)).toBe(1)
  expect(fetchMinutes(15)).toBe(15)
  expect(fetchMinutes('abc')).toBe(5)
})

test('a tick runs its work detached and swallows a failure', async () => {
  let runs = 0
  const tick = detached(async () => {
    runs += 1
    throw new Error('discovery failed')
  })
  tick()
  tick()
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
  expect(runs).toBe(2)
})

test('work that throws before returning a promise does not escape the tick', async () => {
  const tick = detached(() => {
    throw new Error('no app yet')
  })
  expect(() => tick()).not.toThrow()
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
  expect(() => tick()).not.toThrow()
})
