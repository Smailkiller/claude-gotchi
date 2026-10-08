// Механика питомца: чистые функции над Pet, без $ — их же гоняют тесты.
//
// Рост: опыт (XP) за токены, сообщения и инструменты, умноженный на бонусы
// за хороший уход. Потребности (сытость, настроение, энергия) убывают со
// временем; токены кормят, разговоры радуют, перерывы восстанавливают силы.
// Ошибки инструментов заводят жучков, тесты и ручная уборка их давят.

import type { Branch, Counters, Pet, Quest, QuestKind, Slot, Stage } from '../types'

export const HOUR = 3_600_000
export const MINUTE = 60_000
const SLEEP_AFTER = 20 * MINUTE
const PAT_COOLDOWN = 5 * MINUTE

export const BRANCHES: readonly Branch[] = ['code', 'research', 'shell', 'web', 'team', 'talk']

export const BRANCH_TITLE: Record<Branch, string> = {
  code: 'Кодер',
  research: 'Книжник',
  shell: 'Хакер',
  web: 'Странник',
  team: 'Вожак',
  talk: 'Болтун',
}

export const BRANCH_HINT: Record<Branch, string> = {
  code: 'правки файлов',
  research: 'чтение и поиск',
  shell: 'терминал',
  web: 'интернет',
  team: 'сабагенты',
  talk: 'разговоры',
}

export const BRANCH_ICON: Record<Branch, string> = {
  code: '🛠',
  research: '📚',
  shell: '💻',
  web: '🧭',
  team: '🚩',
  talk: '💬',
}

export const STAGE_TITLE: Record<Stage, string> = {
  egg: 'Яйцо',
  baby: 'Малыш',
  teen: 'Подросток',
  adult: 'Взрослый',
  legend: 'Легенда',
}

const STAGE_ICON: Record<Stage, string> = { egg: '🥚', baby: '🐣', teen: '🌱', adult: '⭐', legend: '👑' }

// ── уровни ────────────────────────────────────────────────────────────────

/** Сколько опыта нужно, чтобы перейти с уровня `level` на следующий. */
export const need = (level: number) => Math.round(100 * level ** 1.5)

export function levelOf(xp: number) {
  let level = 1
  let into = Math.max(0, xp)
  while (into >= need(level)) {
    into -= need(level)
    level++
  }
  return { level, into, need: need(level) }
}

/** Опыт, накопленный к началу уровня `level`. */
export function xpAt(level: number) {
  let sum = 0
  for (let l = 1; l < level; l++) sum += need(l)
  return sum
}

export const HATCH_LEVEL = 3
export const stageOf = (level: number): Stage =>
  level < HATCH_LEVEL ? 'egg' : level < 8 ? 'baby' : level < 15 ? 'teen' : level < 30 ? 'adult' : 'legend'

export const STAGE_FROM: Record<Stage, number> = { egg: 1, baby: HATCH_LEVEL, teen: 8, adult: 15, legend: 30 }

export function lead(p: Pet): Branch {
  return BRANCHES.reduce((a, b) => (p.traits[b] > p.traits[a] ? b : a), 'talk' as Branch)
}

export function title(p: Pet): string {
  const stage = stageOf(levelOf(p.xp).level)
  if (stage === 'adult') return BRANCH_TITLE[p.branch ?? lead(p)]
  if (stage === 'legend') return `Легенда · ${BRANCH_TITLE[p.branch ?? lead(p)]}`
  return STAGE_TITLE[stage]
}

export function icon(p: Pet): string {
  const stage = stageOf(levelOf(p.xp).level)
  return stage === 'adult' ? BRANCH_ICON[p.branch ?? lead(p)] : STAGE_ICON[stage]
}

// ── время ─────────────────────────────────────────────────────────────────

const local = (now: number, tz: number) => new Date(now + tz * MINUTE)
export const dayKey = (now: number, tz: number) => local(now, tz).toISOString().slice(0, 10)
export const hourOf = (now: number, tz: number) => local(now, tz).getUTCHours()
const prevDay = (day: string) => new Date(Date.parse(day) - 24 * HOUR).toISOString().slice(0, 10)

// ── создание ──────────────────────────────────────────────────────────────

const zeroCounters = (): Counters => ({
  prompts: 0, tools: 0, edits: 0, reads: 0, shell: 0, web: 0, agents: 0, tests: 0, errors: 0,
  denied: 0, turns: 0, eaten: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, squashed: 0,
  pats: 0, plays: 0, wins: 0, quests: 0, sessions: 0, bought: 0, maxTurnTools: 0, maxTurnEaten: 0,
})

export function newPet(now: number, tz: number, name = 'Токи'): Pet {
  return {
    v: 1, name, bornAt: now, lastSeen: now, xp: 0, coins: 0,
    food: 70, mood: 60, energy: 100, at: now, bugs: 0,
    traits: { code: 0, research: 0, shell: 0, web: 0, team: 0, talk: 0 },
    branch: null, n: zeroCounters(), tools: [],
    streak: 0, best: 0, streakDay: '',
    daily: { day: '', quests: [], chest: false },
    trophies: {}, owned: [], worn: {}, log: [], lastPat: 0, tz,
  }
}

/** Достраивает старую запись до текущей формы. */
export function revive(raw: unknown, now: number, tz: number): Pet {
  if (!raw || typeof raw !== 'object' || (raw as Pet).v !== 1) return newPet(now, tz)
  const p = raw as Pet
  const fresh = newPet(now, tz)
  return { ...fresh, ...p, n: { ...fresh.n, ...p.n }, traits: { ...fresh.traits, ...p.traits }, tz }
}

// ── потребности ───────────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v))

export const isAsleep = (p: Pet, now: number) => now - p.lastSeen > SLEEP_AFTER || p.energy < 8

/** Применяет убывание потребностей с момента `p.at` до `now`. */
export function tick(p: Pet, now: number): Pet {
  const dt = Math.min(Math.max(0, now - p.at), 14 * 24 * HOUR) / HOUR
  if (dt <= 0) return p
  const asleep = now - p.lastSeen > SLEEP_AFTER
  p.food = clamp(p.food - 4 * dt)
  const toward = 40
  p.mood = p.mood > toward ? Math.max(toward, p.mood - 3 * dt) : Math.min(toward, p.mood + dt)
  p.mood = clamp(p.mood - p.bugs * 0.5 * dt - (p.food < 15 ? 2 * dt : 0))
  p.energy = clamp(p.energy + (asleep ? 15 : 4) * dt)
  p.at = now
  return p
}

export type Bonus = { factor: number; why: string[] }

export function bonus(p: Pet): Bonus {
  let factor = 1
  const why: string[] = []
  if (p.food >= 70) { factor += 0.1; why.push('сыт +10%') }
  if (p.mood >= 75) { factor += 0.25; why.push('счастлив +25%') }
  if (p.energy >= 80) { factor += 0.15; why.push('бодр +15%') }
  if (p.streak > 1) {
    const s = Math.min(0.5, (p.streak - 1) * 0.05)
    factor += s
    why.push(`серия ${p.streak} дн. +${Math.round(s * 100)}%`)
  }
  if (p.food < 15) { factor -= 0.4; why.push('голоден −40%') }
  if (p.bugs >= 5) { factor -= 0.25; why.push('жучки −25%') }
  return { factor: Math.max(0.25, factor), why }
}

// ── эффекты одного изменения ──────────────────────────────────────────────

/** Что увидит человек после изменения: всплывашки и реплика питомца. */
export type Effects = { toasts: string[]; say?: string }

export const effects = (): Effects => ({ toasts: [] })

function say(p: Pet, fx: Effects, text: string, now: number) {
  fx.say = text
  p.log = [{ at: now, text }, ...p.log].slice(0, 8)
}

const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!

function gain(p: Pet, base: number) {
  const got = base * bonus(p).factor
  p.xp += got
  return got
}

/** Любое действие с Claude: будит, двигает серию дней, отмечает время суток. */
export function touch(p: Pet, now: number, fx: Effects) {
  const away = now - p.lastSeen
  if (away > 3 * 24 * HOUR && p.n.prompts > 0) {
    unlock(p, 'comeback', now, fx)
    say(p, fx, pick(['Ты вернулся! Я так скучал…', 'Наконец-то! Я чуть не впал в спячку.']), now)
  } else if (away > SLEEP_AFTER && p.n.prompts > 0) {
    say(p, fx, pick(['*зевает* Я проснулся!', 'М-м… уже работаем?', 'Доброе утро! Или вечер?']), now)
  }
  p.lastSeen = now
  rollDay(p, now)
  const today = dayKey(now, p.tz)
  if (p.streakDay !== today) {
    p.streak = p.streakDay === prevDay(today) ? p.streak + 1 : 1
    p.streakDay = today
    p.best = Math.max(p.best, p.streak)
    if (p.streak > 1) say(p, fx, `Серия ${p.streak} дн. подряд! Бонус к опыту растёт.`, now)
  }
  const h = hourOf(now, p.tz)
  if (h < 5) unlock(p, 'owl', now, fx)
  else if (h < 7) unlock(p, 'lark', now, fx)
}

// ── события ───────────────────────────────────────────────────────────────

export function onPrompt(p: Pet, text: string, now: number, fx: Effects) {
  touch(p, now, fx)
  p.n.prompts++
  p.traits.talk += text.length > 400 ? 3 : 2
  p.mood = clamp(p.mood + 4)
  gain(p, 3)
  progress(p, 'prompts', 1, now, fx)
}

const TESTS = /(?<![\w-])(pytest|jest|vitest|mocha|unittest|rspec|phpunit|ctest|go test|cargo test|dotnet test|mvn test|gradle test|(npm|yarn|pnpm|bun)( run)? test|plugin test)(?![\w-])/i
const REJECTED = /doesn.t want to proceed|was rejected|user (denied|declined|rejected)/i

export function classify(tool: string): Branch | null {
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'code'
  if (/^(Read|Grep|Glob|LSP|NotebookRead)$/.test(tool)) return 'research'
  if (/^(Bash|PowerShell|BashOutput|Monitor)$/.test(tool)) return 'shell'
  if (/^(WebSearch|WebFetch)$/.test(tool) || /^mcp__(Claude_Browser|claude-in-chrome)__/.test(tool)) return 'web'
  if (/^(Agent|Task|SendMessage)$/.test(tool)) return 'team'
  return null
}

export type ToolOutcome = { tool: string; command?: string; isError: boolean; text?: string; deny?: string }

export function onTool(p: Pet, o: ToolOutcome, now: number, fx: Effects) {
  touch(p, now, fx)
  p.n.tools++
  if (!p.tools.includes(o.tool) && p.tools.length < 200) p.tools.push(o.tool)
  p.energy = clamp(p.energy - 0.4)
  const kind = classify(o.tool)

  if (o.deny !== undefined || (o.isError && REJECTED.test(o.text ?? ''))) {
    p.n.denied++
    p.mood = clamp(p.mood - 6)
    say(p, fx, pick(['Эх, не разрешили…', 'Ладно, не очень-то и хотелось.', 'Понял, туда нельзя.']), now)
    return
  }
  if (o.isError) {
    p.n.errors++
    p.mood = clamp(p.mood - 3)
    if (p.bugs < 9) {
      p.bugs++
      say(p, fx, pick(['Ой, жучок!', 'Кто-то ползает… это баг?', 'Ещё один жучок завёлся.']), now)
    }
    gain(p, 0.5)
    return
  }

  p.mood = clamp(p.mood + 0.5)
  gain(p, kind === 'code' ? 2 : 1)
  if (kind) p.traits[kind] += kind === 'team' ? 3 : kind === 'research' ? 0.5 : 1
  if (kind === 'code') { p.n.edits++; progress(p, 'edits', 1, now, fx) }
  if (kind === 'research') { p.n.reads++; progress(p, 'reads', 1, now, fx) }
  if (kind === 'web') { p.n.web++; progress(p, 'web', 1, now, fx) }
  if (kind === 'team') { p.n.agents++; progress(p, 'agents', 1, now, fx) }
  if (kind === 'shell') {
    p.n.shell++
    progress(p, 'shell', 1, now, fx)
    if (o.command && TESTS.test(o.command)) {
      p.n.tests++
      progress(p, 'tests', 1, now, fx)
      if (p.bugs > 0) {
        const n = p.bugs
        squash(p, now, fx)
        say(p, fx, `Тесты прошли — раздавил ${n} ${plural(n, 'жучка', 'жучков', 'жучков')}!`, now)
      }
    }
  }
}

export type TurnUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export const eatenOf = (u: TurnUsage) =>
  u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + Math.round(u.cache_read_input_tokens / 10)

/** Конец хода: токены — это еда и основной опыт. */
export function onTurn(
  p: Pet,
  t: { usage?: TurnUsage; reason: string; isSubagent: boolean; tools: number },
  now: number,
  fx: Effects,
) {
  touch(p, now, fx)
  const u = t.usage
  if (u) {
    const eaten = eatenOf(u)
    p.n.eaten += eaten
    p.n.input += u.input_tokens
    p.n.output += u.output_tokens
    p.n.cacheRead += u.cache_read_input_tokens
    p.n.cacheWrite += u.cache_creation_input_tokens
    p.n.maxTurnEaten = Math.max(p.n.maxTurnEaten, eaten)
    const wasHungry = p.food < 25
    p.food = clamp(p.food + Math.min(35, 2 + eaten / 5000))
    gain(
      p,
      u.output_tokens / 150 + u.input_tokens / 1500 + u.cache_creation_input_tokens / 3000 + u.cache_read_input_tokens / 30000,
    )
    progress(p, 'eaten', eaten, now, fx)
    if (!t.isSubagent && eaten > 2000) {
      say(
        p,
        fx,
        wasHungry
          ? pick([`Наконец-то еда! ${tokens(eaten)} токенов!`, `Спасибо! ${tokens(eaten)} токенов — то что нужно.`])
          : pick([`Ням! ${tokens(eaten)} токенов.`, `Вкусно: ${tokens(eaten)} токенов.`, `Хрум-хрум, ${tokens(eaten)} токенов.`]),
        now,
      )
    }
  }
  if (t.isSubagent) {
    p.traits.team += 1
    return
  }
  p.n.turns++
  p.n.maxTurnTools = Math.max(p.n.maxTurnTools, t.tools)
  p.energy = clamp(p.energy - 1.5)
  if (t.reason === 'answer') p.mood = clamp(p.mood + 1)
  if (t.reason === 'aborted') p.mood = clamp(p.mood - 3)
  if (t.reason === 'error') p.mood = clamp(p.mood - 2)
}

// ── забота ────────────────────────────────────────────────────────────────

export function pat(p: Pet, now: number, fx: Effects) {
  if (now - p.lastPat < PAT_COOLDOWN) {
    p.mood = clamp(p.mood + 1)
    say(p, fx, pick(['*мурлычет* Уже и так хорошо.', 'Хи-хи, щекотно!']), now)
    return
  }
  p.lastPat = now
  p.n.pats++
  p.mood = clamp(p.mood + 12)
  gain(p, 2)
  say(p, fx, pick(['*мурлычет*', 'Ещё! Ещё!', 'Как приятно ♥', 'Я тебя тоже люблю.']), now)
  progress(p, 'pat', 1, now, fx)
}

export const PLAY_COST = 8

export function play(p: Pet, guess: 'left' | 'right', hand: 'left' | 'right', now: number, fx: Effects) {
  p.n.plays++
  p.energy = clamp(p.energy - PLAY_COST)
  gain(p, 4)
  if (guess === hand) {
    p.n.wins++
    p.coins += 2
    p.mood = clamp(p.mood + 15)
    say(p, fx, pick(['Угадал! Держи 2 🪙', 'Ты меня раскусил! +2 🪙']), now)
  } else {
    p.mood = clamp(p.mood + 6)
    say(p, fx, pick(['Не угадал! Токен был в другой лапке.', 'Ха! Мимо. Ещё разок?']), now)
  }
  progress(p, 'play', 1, now, fx)
}

export function squash(p: Pet, now: number, fx: Effects) {
  const n = p.bugs
  if (n === 0) return
  p.bugs = 0
  p.n.squashed += n
  p.mood = clamp(p.mood + 5)
  gain(p, 3 * n)
  progress(p, 'squash', n, now, fx)
}

export function rename(p: Pet, name: string, now: number, fx: Effects) {
  p.name = name.trim().slice(0, 24) || p.name
  say(p, fx, `Теперь меня зовут ${p.name}!`, now)
}

// ── магазин ───────────────────────────────────────────────────────────────

export type Item = { id: string; title: string; slot: Slot; price: number }

export const SHOP: readonly Item[] = [
  { id: 'bow', title: 'Бантик', slot: 'head', price: 15 },
  { id: 'beanie', title: 'Шапочка с помпоном', slot: 'head', price: 20 },
  { id: 'party', title: 'Праздничный колпак', slot: 'head', price: 25 },
  { id: 'headphones', title: 'Наушники', slot: 'head', price: 35 },
  { id: 'crown', title: 'Корона', slot: 'head', price: 150 },
  { id: 'shades', title: 'Пиксельные очки', slot: 'face', price: 30 },
  { id: 'scarf', title: 'Шарф', slot: 'neck', price: 20 },
  { id: 'hookah', title: 'Кальянчик', slot: 'side', price: 60 },
]

export function buy(p: Pet, id: string, now: number, fx: Effects): boolean {
  const item = SHOP.find(i => i.id === id)
  if (!item || p.owned.includes(id)) return false
  if (p.coins < item.price) {
    say(p, fx, `Не хватает ${item.price - p.coins} 🪙 на «${item.title}».`, now)
    return false
  }
  p.coins -= item.price
  p.owned.push(id)
  p.n.bought++
  p.worn[item.slot] = id
  say(p, fx, `Обновка: ${item.title}! Как я выгляжу?`, now)
  return true
}

export function wear(p: Pet, id: string, now: number, fx: Effects) {
  const item = SHOP.find(i => i.id === id)
  if (!item || !p.owned.includes(id)) return
  if (p.worn[item.slot] === id) {
    delete p.worn[item.slot]
    say(p, fx, `Снял: ${item.title}.`, now)
  } else {
    p.worn[item.slot] = id
    say(p, fx, `Надел: ${item.title}.`, now)
  }
}

// ── задания дня ───────────────────────────────────────────────────────────

type QuestTemplate = { kind: QuestKind; goals: readonly number[]; text: (n: number, name: string) => string }

const QUESTS: readonly QuestTemplate[] = [
  { kind: 'edits', goals: [5, 10, 20], text: n => `Сделай ${n} правок в файлах` },
  { kind: 'tests', goals: [1, 3], text: n => (n === 1 ? 'Запусти тесты' : `Запусти тесты ${n} раза`) },
  { kind: 'prompts', goals: [5, 10, 20], text: n => `Отправь мне ${n} ${plural(n, 'сообщение', 'сообщения', 'сообщений')}` },
  { kind: 'eaten', goals: [200_000, 500_000, 1_000_000], text: n => `Скорми ${tokens(n)} токенов` },
  { kind: 'web', goals: [1, 3], text: n => (n === 1 ? 'Поищи что-нибудь в интернете' : `Сходи в интернет ${n} раза`) },
  { kind: 'reads', goals: [10, 25], text: n => `Прочитай ${n} файлов` },
  { kind: 'agents', goals: [1, 2], text: n => (n === 1 ? 'Позови помощника-сабагента' : `Позови ${n} сабагентов`) },
  { kind: 'shell', goals: [5, 15], text: n => `Выполни ${n} команд в терминале` },
  { kind: 'pat', goals: [1, 3], text: (n, name) => (n === 1 ? `Погладь ${name}` : `Погладь ${name} ${n} раза`) },
  { kind: 'squash', goals: [1, 3], text: n => `Раздави ${n} ${plural(n, 'жучка', 'жучков', 'жучков')}` },
  { kind: 'play', goals: [1, 2], text: n => (n === 1 ? 'Сыграй со мной' : `Сыграй со мной ${n} раза`) },
]

export const questText = (q: Quest, name: string) => QUESTS.find(t => t.kind === q.kind)!.text(q.goal, name)

function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1)
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296
  }
}

export function questsFor(day: string): Quest[] {
  const rnd = seeded(day)
  const pool = [...QUESTS]
  const out: Quest[] = []
  while (out.length < 3) {
    const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!
    const i = Math.floor(rnd() * t.goals.length)
    out.push({ kind: t.kind, goal: t.goals[i]!, have: 0, xp: 40 + i * 30, coins: 4 + i * 3, done: false })
  }
  return out
}

export function rollDay(p: Pet, now: number) {
  const day = dayKey(now, p.tz)
  if (p.daily.day !== day) p.daily = { day, quests: questsFor(day), chest: false }
}

function progress(p: Pet, kind: QuestKind, amount: number, now: number, fx: Effects) {
  rollDay(p, now)
  for (const q of p.daily.quests) {
    if (q.kind !== kind || q.done) continue
    q.have = Math.min(q.goal, q.have + amount)
    if (q.have >= q.goal) {
      q.done = true
      p.n.quests++
      p.xp += q.xp
      p.coins += q.coins
      fx.toasts.push(`✅ Задание выполнено: ${questText(q, p.name)} · +${q.xp} XP, +${q.coins} 🪙`)
    }
  }
  if (!p.daily.chest && p.daily.quests.length > 0 && p.daily.quests.every(q => q.done)) {
    p.daily.chest = true
    p.coins += 10
    p.xp += 50
    fx.toasts.push('🎁 Все задания дня выполнены: сундук +10 🪙 и +50 XP')
  }
}

// ── достижения ────────────────────────────────────────────────────────────

export type Trophy = { id: string; title: string; hint: string; coins: number; test?: (p: Pet) => boolean }

const lvl = (p: Pet) => levelOf(p.xp).level

export const TROPHIES: readonly Trophy[] = [
  { id: 'hello', title: 'Первое слово', hint: 'Отправить первое сообщение', coins: 3, test: p => p.n.prompts >= 1 },
  { id: 'hatched', title: 'Вылупился!', hint: `Дорасти до ${HATCH_LEVEL} уровня`, coins: 5, test: p => lvl(p) >= HATCH_LEVEL },
  { id: 'teen', title: 'Переходный возраст', hint: 'Стать подростком (ур. 8)', coins: 10, test: p => lvl(p) >= 8 },
  { id: 'adult', title: 'Совершеннолетие', hint: 'Стать взрослым (ур. 15)', coins: 20, test: p => lvl(p) >= 15 },
  { id: 'legend', title: 'Легенда', hint: 'Дорасти до 30 уровня', coins: 50, test: p => lvl(p) >= 30 },
  { id: 'tok1m', title: 'Миллионер', hint: 'Скормить 1M токенов', coins: 5, test: p => p.n.eaten >= 1e6 },
  { id: 'tok10m', title: 'Гурман', hint: 'Скормить 10M токенов', coins: 15, test: p => p.n.eaten >= 1e7 },
  { id: 'tok100m', title: 'Чёрная дыра', hint: 'Скормить 100M токенов', coins: 40, test: p => p.n.eaten >= 1e8 },
  { id: 'glutton', title: 'Обжора', hint: 'Съесть 500k токенов за один ход', coins: 10, test: p => p.n.maxTurnEaten >= 500_000 },
  { id: 'tools100', title: 'Подмастерье', hint: '100 вызовов инструментов', coins: 5, test: p => p.n.tools >= 100 },
  { id: 'tools1k', title: 'Мастер', hint: '1 000 вызовов инструментов', coins: 15, test: p => p.n.tools >= 1000 },
  { id: 'tools10k', title: 'Грандмастер', hint: '10 000 вызовов инструментов', coins: 40, test: p => p.n.tools >= 10_000 },
  { id: 'marathon', title: 'Марафонец', hint: '50 инструментов за один ход', coins: 10, test: p => p.n.maxTurnTools >= 50 },
  { id: 'polyglot', title: 'Полиглот', hint: 'Попробовать 15 разных инструментов', coins: 10, test: p => p.tools.length >= 15 },
  { id: 'architect', title: 'Архитектор', hint: '200 правок файлов', coins: 10, test: p => p.n.edits >= 200 },
  { id: 'explorer', title: 'Путешественник', hint: '25 походов в интернет', coins: 10, test: p => p.n.web >= 25 },
  { id: 'team', title: 'Командный игрок', hint: 'Позвать 10 сабагентов', coins: 10, test: p => p.n.agents >= 10 },
  { id: 'tester', title: 'Зелёные тесты', hint: 'Запустить тесты 20 раз', coins: 10, test: p => p.n.tests >= 20 },
  { id: 'bugs10', title: 'Дезинсектор', hint: 'Раздавить 10 жучков', coins: 5, test: p => p.n.squashed >= 10 },
  { id: 'bugs100', title: 'Гроза жучков', hint: 'Раздавить 100 жучков', coins: 20, test: p => p.n.squashed >= 100 },
  { id: 'petter', title: 'Ласковый хозяин', hint: 'Погладить 50 раз', coins: 10, test: p => p.n.pats >= 50 },
  { id: 'gamer', title: 'Игроман', hint: 'Выиграть 10 раз в «лапки»', coins: 10, test: p => p.n.wins >= 10 },
  { id: 'quests10', title: 'Исполнительный', hint: 'Выполнить 10 заданий', coins: 10, test: p => p.n.quests >= 10 },
  { id: 'quests50', title: 'Ударник', hint: 'Выполнить 50 заданий', coins: 30, test: p => p.n.quests >= 50 },
  { id: 'streak3', title: 'Три дня подряд', hint: 'Серия 3 дня', coins: 5, test: p => p.streak >= 3 },
  { id: 'streak7', title: 'Неделя вместе', hint: 'Серия 7 дней', coins: 15, test: p => p.streak >= 7 },
  { id: 'streak30', title: 'Месяц преданности', hint: 'Серия 30 дней', coins: 50, test: p => p.streak >= 30 },
  { id: 'shopper', title: 'Модник', hint: 'Купить первую вещь', coins: 3, test: p => p.n.bought >= 1 },
  { id: 'wardrobe', title: 'Икона стиля', hint: 'Собрать весь гардероб', coins: 30, test: p => SHOP.every(i => p.owned.includes(i.id)) },
  { id: 'owl', title: 'Ночная сова', hint: 'Работать между 0:00 и 5:00', coins: 5 },
  { id: 'lark', title: 'Ранняя пташка', hint: 'Работать между 5:00 и 7:00', coins: 5 },
  { id: 'comeback', title: 'Я вернулся!', hint: 'Вернуться после 3 дней разлуки', coins: 5 },
]

function unlock(p: Pet, id: string, now: number, fx: Effects) {
  if (p.trophies[id]) return
  const t = TROPHIES.find(x => x.id === id)
  if (!t) return
  p.trophies[id] = now
  p.coins += t.coins
  fx.toasts.push(`🏆 Достижение «${t.title}»: ${t.hint.toLowerCase()} · +${t.coins} 🪙`)
}

/** После изменения: уровни, стадии, ветка, достижения. `before` — опыт до. */
export function settle(p: Pet, beforeXp: number, now: number, fx: Effects) {
  const was = levelOf(beforeXp).level
  const is = levelOf(p.xp).level
  if (is > was) {
    p.coins += 2 * (is - was)
    const from = stageOf(was)
    const to = stageOf(is)
    if (to === 'adult' && p.branch === null) p.branch = lead(p)
    if (to === 'legend' && !p.owned.includes('crown')) p.owned.push('crown')
    if (from !== to) {
      const line =
        to === 'baby' ? `🐣 ${p.name} вылупился!`
        : to === 'teen' ? `🌱 ${p.name} стал подростком — тянется к делу «${BRANCH_HINT[lead(p)]}»`
        : to === 'adult' ? `${BRANCH_ICON[p.branch!]} ${p.name} вырос: теперь он ${BRANCH_TITLE[p.branch!]}!`
        : `👑 ${p.name} стал Легендой! Корона — в гардеробе.`
      fx.toasts.push(line)
      say(p, fx, line.replace(/^\S+ /, ''), now)
    } else {
      fx.toasts.push(`⬆ ${p.name}: уровень ${is}!`)
    }
  }
  for (const t of TROPHIES) if (t.test?.(p)) unlock(p, t.id, now, fx)
}

// ── подписи ───────────────────────────────────────────────────────────────

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100
  const b = a % 10
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many
}

export const tokens = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`

export const bar = (part: number, width: number, full = '▰', empty = '▱') => {
  const n = Math.round(clamp(part, 0, 1) * width)
  return full.repeat(n) + empty.repeat(width - n)
}

export function mood(p: Pet, now: number): string {
  if (stageOf(levelOf(p.xp).level) === 'egg') return 'греется'
  if (isAsleep(p, now)) return 'спит'
  if (p.food < 15) return 'голодает'
  if (p.bugs >= 5) return 'чешется от жучков'
  if (p.mood < 30) return 'грустит'
  if (p.energy < 20) return 'устал'
  if (p.mood >= 80) return 'счастлив'
  return 'в порядке'
}

/** Строка состояния под полем ввода. */
export function statusLine(p: Pet, now: number): string {
  const { level, into, need: n } = levelOf(p.xp)
  const pct = Math.floor((into / n) * 100)
  const parts = [
    `${icon(p)} ${p.name} · ур.${level} ${bar(into / n, 8)} ${pct}%`,
    `🍖${Math.round(p.food)} 😊${Math.round(p.mood)} ⚡${Math.round(p.energy)}`,
  ]
  if (p.bugs > 0) parts.push(`🐞${p.bugs}`)
  if (isAsleep(p, now)) parts.push('💤')
  parts.push(`🪙${p.coins}`)
  return parts.join(' · ')
}
