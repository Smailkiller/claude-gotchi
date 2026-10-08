import { expect, mock, test } from 'claude-code/testing'

import type { Pet } from '../types'
import * as G from './game'
import { petCells, petSvg, sceneOf } from './sprite'

const T0 = Date.parse('2026-10-08T09:00:00Z')

const pane = {
  title: 'Токи',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40, contentRows: 0 },
  view: {},
}

const turn = (output: number, input = 2000, read = 200_000, write = 20_000) => ({
  usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: write },
  reason: 'answer',
  isSubagent: false,
  tools: 12,
})

test('уровни растут по кривой, стадии меняются на 3, 8, 15 и 30', async () => {
  expect(G.levelOf(0).level).toBe(1)
  expect(G.levelOf(G.need(1)).level).toBe(2)
  expect(G.stageOf(1)).toBe('egg')
  expect(G.stageOf(3)).toBe('baby')
  expect(G.stageOf(8)).toBe('teen')
  expect(G.stageOf(15)).toBe('adult')
  expect(G.stageOf(30)).toBe('legend')
  expect(G.levelOf(G.xpAt(15)).level).toBe(15)
})

test('токены кормят и дают опыт, яйцо вылупляется после пары ходов', async () => {
  const p = G.newPet(T0, 180)
  p.food = 20
  const fx = G.effects()
  for (let i = 0; i < 3; i++) {
    const before = p.xp
    G.onTurn(p, turn(15_000), T0 + i * 60_000, fx)
    G.settle(p, before, T0 + i * 60_000, fx)
  }
  expect(p.food).toBeGreaterThan(50)
  expect(p.n.eaten).toBeGreaterThan(100_000)
  expect(G.stageOf(G.levelOf(p.xp).level)).toBe('baby')
  expect(fx.toasts.some(t => t.includes('вылупился'))).toBe(true)
})

test('ошибка заводит жучка, прошедшие тесты его давят', async () => {
  const p = G.newPet(T0, 180)
  const fx = G.effects()
  G.onTool(p, { tool: 'Bash', command: 'npm run build', isError: true, text: 'exit 1' }, T0, fx)
  G.onTool(p, { tool: 'Edit', isError: true, text: 'old_string not found' }, T0, fx)
  expect(p.bugs).toBe(2)
  G.onTool(p, { tool: 'Bash', command: 'Test-Path foo', isError: false }, T0, fx)
  expect(p.bugs).toBe(2)
  G.onTool(p, { tool: 'Bash', command: 'npx vitest run', isError: false }, T0, fx)
  expect(p.bugs).toBe(0)
  expect(p.n.squashed).toBe(2)
})

test('отказ в разрешении огорчает, но жучка не заводит', async () => {
  const p = G.newPet(T0, 180)
  const mood = p.mood
  G.onTool(p, { tool: 'Bash', isError: true, text: "The user doesn't want to proceed with this tool use." }, T0, G.effects())
  expect(p.bugs).toBe(0)
  expect(p.mood).toBeLessThan(mood)
  expect(p.n.denied).toBe(1)
})

test('потребности убывают со временем, сон восстанавливает энергию', async () => {
  const p = G.newPet(T0, 180)
  p.energy = 30
  G.tick(p, T0 + 5 * G.HOUR)
  expect(Math.round(p.food)).toBe(50)
  expect(p.energy).toBeGreaterThan(90)
  expect(G.isAsleep(p, T0 + 5 * G.HOUR)).toBe(true)
})

test('серия дней и задания дня', async () => {
  const p = G.newPet(T0, 180)
  const fx = G.effects()
  G.touch(p, T0, fx)
  G.touch(p, T0 + 24 * G.HOUR, fx)
  expect(p.streak).toBe(2)
  G.touch(p, T0 + 4 * 24 * G.HOUR, fx)
  expect(p.streak).toBe(1)
  expect(p.trophies.comeback).toBeUndefined() // ни одного сообщения ещё не было

  const quests = G.questsFor('2026-10-08')
  expect(quests.length).toBe(3)
  expect(new Set(quests.map(q => q.kind)).size).toBe(3)
  expect(G.questsFor('2026-10-08')).toEqual(quests)
})

test('магазин: покупка надевает вещь, не хватает монет — отказ', async () => {
  const p = G.newPet(T0, 180)
  const fx = G.effects()
  p.coins = 25
  expect(G.buy(p, 'crown', T0, fx)).toBe(false)
  expect(G.buy(p, 'beanie', T0, fx)).toBe(true)
  expect(p.worn.head).toBe('beanie')
  expect(p.coins).toBe(5)
  G.wear(p, 'beanie', T0, fx)
  expect(p.worn.head).toBeUndefined()
})

test('спрайт: каждая стадия и ветка рисуется в SVG и в полублоках', async () => {
  const p = G.newPet(T0, 180)
  const levels = [1, 2, 3, 8, 15, 30]
  for (const branch of G.BRANCHES) {
    for (const level of levels) {
      const q: Pet = { ...p, xp: G.xpAt(level), branch, bugs: 7, worn: { head: 'party', face: 'shades', neck: 'scarf', side: 'hookah' } }
      const s = sceneOf(q, T0)
      const svg = petSvg(s, 6)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.includes('<text')).toBe(false)
      expect(svg.length).toBeLessThan(131_072)
      expect(petCells(s, 3).rows).toBe(14)
    }
  }
})

test('окно питомца рисуется на десктопе и в терминале, /pet name переименовывает', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: T0 })
  const named = await $.command.run({ command: 'pet', args: 'name Пушок' } as never)
  expect(named.text).toContain('Пушок')

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'tamagotchi', surface, component: 'Pane', requestId: 'pet', props: pane } as never)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain(surface === 'desktop' ? 'Svg' : 'Raster')
    expect(drawn).toContain('Пушок')
    expect(drawn).toContain('Погладить')
    await ui.press({ key: 'tab-shop' })
    expect(JSON.stringify(await ui.drawn())).toContain('Кальянчик')
    await ui.press({ key: 'tab-pet' })
    await ui.press({ key: 'pat' })
    expect(JSON.stringify(await ui.drawn())).toContain('Задания')
  }
})

test('ошибка инструмента в сессии заводит жучка и видна в строке состояния', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: T0 })
  on('tool.call', () => ({ result: 'boom', text: 'boom', isError: true }) as never)
  await $.tool.call({ tool: 'Bash', command: 'make' } as never)
  const ui = await $.ui.mount({ plugin: 'tamagotchi', surface: 'desktop', component: 'Pane', requestId: 'pet', props: pane } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Раздавить жучков (1)')
})
