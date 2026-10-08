import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pet, PetGame, PetView } from '../types'
import * as G from './game'
import { FRAME_MS, FRAMES, H, W, petCells, petSvg, sceneOf } from './sprite'
import type { Scene } from './sprite'

const PANE = 'pet'
const PX = 6

const petAtom = atom({ plugin: 'tamagotchi', key: 'pet' } as const, null as Pet | null)
const viewAtom = atom({ plugin: 'tamagotchi', key: 'view' } as const, 'pet' as PetView)
const gameAtom = atom({ plugin: 'tamagotchi', key: 'game' } as const, null as PetGame)

const COLOR = { xp: '#d97757', food: '#e0a43a', mood: '#e07a9a', energy: '#5fb8e6', coin: '#e6b422' }

// Переменные модуля живут до перезагрузки мода; всё, что важно, — в $.store.
// Запись в хранилище — по одной за раз: события одной сессии идут подряд.
let queue: Promise<unknown> = Promise.resolve()
let tz = -new Date().getTimezoneOffset()
let hungryWarned = false
let turnTools = 0
let frame = 0
let terminalScene: Scene | null = null

function show($: EngineInterface, p: Pet, now: number, fx?: G.Effects) {
  $.ui.status(G.statusLine(p, now))
  for (const t of fx?.toasts ?? []) $.ui.toast(t, { timeoutMs: 7000 })
  if (p.food < 20 && !hungryWarned && G.stageOf(G.levelOf(p.xp).level) !== 'egg') {
    hungryWarned = true
    $.ui.toast(`🍖 ${p.name} проголодался: его кормят токены — просто поработай со мной`, { timeoutMs: 7000 })
  }
  if (p.food > 40) hungryWarned = false
}

async function apply($: EngineInterface, change: (p: Pet, now: number, fx: G.Effects) => void): Promise<Pet> {
  const now = await $.clock.now()
  const p = G.tick(G.revive(await $.store.get('pet'), now, tz), now)
  const before = p.xp
  const fx = G.effects()
  change(p, now, fx)
  G.settle(p, before, now, fx)
  await $.store.set('pet', p)
  await update($, petAtom, () => p)
  show($, p, now, fx)
  return p
}

/** Прочитать из хранилища, применить изменение, записать и показать. */
function mutate($: EngineInterface, change: (p: Pet, now: number, fx: G.Effects) => void): Promise<Pet> {
  const done = queue.then(
    () => apply($, change),
    () => apply($, change),
  )
  queue = done.catch(() => undefined)
  return done
}

/** Без записи: подтянуть изменения других сессий и убывание потребностей. */
async function refresh($: EngineInterface) {
  const now = await $.clock.now()
  const raw = await $.store.get('pet')
  if (!raw) return
  const p = G.tick(G.revive(raw, now, tz), now)
  await update($, petAtom, () => p)
  show($, p, now)
}

async function quietly(work: Promise<unknown>) {
  try {
    await work
  } catch {
    // Питомец никогда не мешает работе: сбой учёта просто пропускаем.
  }
}

async function detectTz($: EngineInterface) {
  if (tz !== 0) return
  const saved = await $.store.get('tz')
  if (typeof saved === 'number') {
    tz = saved
    return
  }
  const probes: string[][] = [
    ['powershell', '-NoProfile', '-Command', '[int][TimeZoneInfo]::Local.GetUtcOffset([DateTime]::Now).TotalMinutes'],
    ['date', '+%z'],
  ]
  for (const argv of probes) {
    try {
      const { exitCode, stdout } = await $.process.run(argv, { timeoutMs: 8000 })
      const text = stdout.trim()
      if (exitCode !== 0 || !text) continue
      const m = /^([+-])(\d\d)(\d\d)$/.exec(text)
      const minutes = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : Number(text)
      if (Number.isFinite(minutes)) {
        tz = minutes
        await $.store.set('tz', tz)
        return
      }
    } catch {
      // нет такой команды — пробуем следующую
    }
  }
}

function animate($: EngineInterface) {
  if (!terminalScene) return
  frame = (frame + 1) % FRAMES
  const { cells } = petCells(terminalScene, frame)
  $.ui.blit({ requestId: PANE, key: 'pet', cells }).catch(() => {
    terminalScene = null
  })
}

async function startGame($: EngineInterface) {
  const now = await $.clock.now()
  const fresh = G.tick(G.revive(await read($, petAtom), now, tz), now)
  if (fresh.energy < G.PLAY_COST + 2) {
    await mutate($, (p, now, fx) => {
      fx.say = 'Я слишком устал… Дай мне отдохнуть, пока ты не работаешь.'
      p.log = [{ at: now, text: fx.say }, ...p.log].slice(0, 8)
    })
    return
  }
  await update($, gameAtom, () => ({ hand: Math.random() < 0.5 ? 'left' : 'right' }))
}

async function guess($: EngineInterface, side: 'left' | 'right') {
  const game = await read($, gameAtom)
  if (!game) return
  await update($, gameAtom, () => null)
  await mutate($, (p, now, fx) => G.play(p, side, game.hand, now, fx))
}

function squashAll($: EngineInterface) {
  return mutate($, (p, now, fx) => {
    const n = p.bugs
    G.squash(p, now, fx)
    fx.say = `Хрусть! ${n} ${G.plural(n, 'жучок', 'жучка', 'жучков')} — нет больше.`
    p.log = [{ at: now, text: fx.say }, ...p.log].slice(0, 8)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await quietly(detectTz($))
    await $.command.register({
      name: 'pet',
      description: 'Тамагочи: открыть питомца; /pet name Имя — переименовать; /pet stats — сводка',
      argumentHint: '[name <имя> | stats]',
    })
    try {
      const p = await mutate($, p => void p.n.sessions++)
      if (e.isInteractive) {
        const now = await $.clock.now()
        $.ui.toast(`${G.icon(p)} ${p.name} · ур.${G.levelOf(p.xp).level} · ${G.mood(p, now)}. Открыть: /pet`, { timeoutMs: 5000 })
      }
    } catch {
      // без питомца сессия идёт как обычно
    }
    $.clock.every(2 * G.MINUTE, () => void quietly(refresh($)))
    // В десктопе анимацию крутит сам SVG; в терминале кадры подменяет blit.
    $.clock.every(FRAME_MS, () => animate($))
    return started
  })

  on('prompt.submit', async ($, e, next) => {
    turnTools = 0
    if (e.origin.kind !== 'plugin') await quietly(mutate($, (p, now, fx) => G.onPrompt(p, e.text, now, fx)))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    turnTools++
    const tool = String(e.tool)
    const command = 'command' in e && typeof e.command === 'string' ? e.command : undefined
    const outcome: G.ToolOutcome = {
      tool,
      command,
      isError: r.isError === true,
      text: typeof r.text === 'string' ? r.text.slice(0, 500) : undefined,
      deny: r.deny,
    }
    await quietly(mutate($, (p, now, fx) => G.onTool(p, outcome, now, fx)))
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const isSubagent = e.agentId !== undefined
    const tools = turnTools
    if (!isSubagent) turnTools = 0
    await quietly(mutate($, (p, now, fx) => G.onTurn(p, { usage: e.usage, reason: e.reason, isSubagent, tools }, now, fx)))
    return r
  })

  on('ui.close', ($, e, next) => {
    if (e.id === PANE) terminalScene = null
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'pet' }, async ($, e) => {
    const args = e.args.trim()
    const [verb = '', ...rest] = args.split(/\s+/)
    if (/^(name|имя|rename)$/i.test(verb)) {
      const name = rest.join(' ').trim()
      if (!name) return { text: 'Как назвать питомца? Например: /pet name Пушок' }
      const p = await mutate($, (p, now, fx) => G.rename(p, name, now, fx))
      return { text: `Питомца теперь зовут ${p.name}.` }
    }
    const p = await mutate($, () => undefined)
    const now = await $.clock.now()
    if (/^(stats|статус|сводка)$/i.test(verb)) return { text: summary(p, now) }
    await $.ui.open({ id: PANE, title: `${G.icon(p)} ${p.name}` })
    return { text: G.statusLine(p, now) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const stored = await read($, petAtom)
    const view = await read($, viewAtom)
    const game = await read($, gameAtom)
    const now = await $.clock.now()
    if (!stored) return <Text dimColor>Питомец просыпается…</Text>

    const p = G.tick({ ...stored }, now)
    const scene = sceneOf(p, now)
    const { level, into, need } = G.levelOf(p.xp)
    const cols = e.props.bodyColumns
    const wide = cols >= 70
    const barW = Math.max(8, Math.min(20, cols - 34))

    let art
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      terminalScene = scene
      art = <Raster key="pet" {...petCells(scene, frame)} />
    } else {
      const { Svg } = $.ui.resolve(e)
      art = <Svg source={petSvg(scene, PX)} alt={`${p.name}: ${G.title(p)}, ${G.mood(p, now)}`} width={W * PX} height={H * PX} />
    }

    const need3 = (label: string, value: number, color: string) => (
      <Text>
        <Text>{label} </Text>
        <Text color={color}>{G.bar(value / 100, barW, '█', '░')}</Text>
        <Text dimColor> {Math.round(value)}</Text>
      </Text>
    )
    const b = G.bonus(p)

    const header = (
      <Box flexDirection="column" flexShrink={1}>
        <Text>
          <Text bold>{p.name}</Text>
          <Text dimColor> · {G.title(p)} · {G.mood(p, now)}</Text>
        </Text>
        <Text>
          <Text bold>Ур. {level} </Text>
          <Text color={COLOR.xp}>{G.bar(into / need, barW)}</Text>
          <Text dimColor> {Math.floor(into)} / {need} XP</Text>
        </Text>
        {need3('🍖 Сытость   ', p.food, COLOR.food)}
        {need3('😊 Настроение', p.mood, COLOR.mood)}
        {need3('⚡ Энергия   ', p.energy, COLOR.energy)}
        <Text>
          <Text color={COLOR.coin}>🪙 {p.coins}</Text>
          <Text dimColor>   🔥 серия {p.streak} дн.</Text>
          {p.bugs > 0 ? <Text color="#d0452a">   🐞 жучков: {p.bugs}</Text> : null}
        </Text>
        <Text dimColor>
          ✨ опыт ×{b.factor.toFixed(2)}{b.why.length ? ` — ${b.why.join(', ')}` : ''}
        </Text>
      </Box>
    )

    const said = p.log[0]
    const counts = {
      quests: `${p.daily.quests.filter(q => q.done).length}/${p.daily.quests.length}`,
      trophies: `${Object.keys(p.trophies).length}/${G.TROPHIES.length}`,
    }
    const tab = (id: PetView, label: string, hotkey: string) => (
      <Button
        key={`tab-${id}`}
        label={label}
        hotkey={hotkey}
        variant={view === id ? 'primary' : 'secondary'}
        onPress={() => update($, viewAtom, () => id)}
      />
    )

    let body
    if (view === 'quests') body = questsView()
    else if (view === 'shop') body = shopView()
    else if (view === 'trophies') body = trophiesView()
    else body = petView()

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection={wide ? 'row' : 'column'} gap={2} alignItems={wide ? 'center' : 'flex-start'}>
          {art}
          {header}
        </Box>
        {said ? (
          <Text italic wrap="wrap">
            💭 «{said.text}» <Text dimColor>{ago(now - said.at)}</Text>
          </Text>
        ) : null}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {tab('pet', 'Питомец', '1')}
          {tab('quests', `Задания ${counts.quests}`, '2')}
          {tab('shop', 'Магазин', '3')}
          {tab('trophies', `Достижения ${counts.trophies}`, '4')}
        </Box>
        {body}
      </Box>
    )

    function petView() {
      const sorted = G.BRANCHES.map(k => ({ k, v: p.traits[k] })).sort((a, b) => b.v - a.v)
      const top = Math.max(1, sorted[0]!.v)
      const stage = G.stageOf(level)
      const nextStage = stage === 'egg' ? 'baby' : stage === 'baby' ? 'teen' : stage === 'teen' ? 'adult' : stage === 'adult' ? 'legend' : null
      return (
        <Box flexDirection="column" gap={1}>
          {game ? (
            <Box flexDirection="column">
              <Text bold>🎲 В какой лапке токен?</Text>
              <Box flexDirection="row" gap={1}>
                <Button key="guess-left" label="👈 Левая" hotkey="l" onPress={() => guess($, 'left')} />
                <Button key="guess-right" label="Правая 👉" hotkey="r" onPress={() => guess($, 'right')} />
                <Button key="guess-cancel" label="Не сейчас" dimColor onPress={() => update($, gameAtom, () => null)} />
              </Box>
            </Box>
          ) : (
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              <Button key="pat" label="🤚 Погладить" hotkey="p" onPress={() => mutate($, (p, now, fx) => G.pat(p, now, fx))} />
              <Button key="play" label={`🎲 Поиграть (−${G.PLAY_COST}⚡)`} hotkey="g" onPress={() => startGame($)} />
              {p.bugs > 0 ? (
                <Button key="squash" label={`🐞 Раздавить жучков (${p.bugs})`} hotkey="b" onPress={() => squashAll($)} />
              ) : null}
            </Box>
          )}
          <Box flexDirection="column">
            <Text bold>Склонности</Text>
            {sorted.slice(0, 3).map(({ k, v }) => (
              <Text key={`trait-${k}`}>
                <Text>{G.BRANCH_ICON[k]} {G.BRANCH_HINT[k].padEnd(15)}</Text>
                <Text color={COLOR.xp}>{G.bar(v / top, 10, '█', '░')}</Text>
                <Text dimColor> {Math.round(v)}</Text>
              </Text>
            ))}
            <Text dimColor wrap="wrap">
              {p.branch
                ? `Форма выбрана: ${G.BRANCH_TITLE[p.branch]}.`
                : `На 15 уровне ${p.name} вырастет в того, чем вы чаще занимаетесь — сейчас это «${G.BRANCH_TITLE[G.lead(p)]}».`}
              {nextStage ? ` Следующая стадия — ${G.STAGE_TITLE[nextStage]} (ур. ${G.STAGE_FROM[nextStage]}, ещё ${tokensXp(G.xpAt(G.STAGE_FROM[nextStage]) - p.xp)} XP).` : ''}
            </Text>
          </Box>
          <Box flexDirection="column">
            <Text bold>Статистика</Text>
            <Text dimColor wrap="wrap">
              Возраст {age(now - p.bornAt)} · съедено {G.tokens(p.n.eaten)} токенов (выход {G.tokens(p.n.output)}) · сообщений {p.n.prompts} · инструментов {p.n.tools} · ходов {p.n.turns} · рекорд серии {p.best} дн.
            </Text>
          </Box>
          {p.log.length > 1 ? (
            <Box flexDirection="column">
              <Text bold>Недавно</Text>
              {p.log.slice(1, 5).map((l, i) => (
                <Text key={`log-${i}`} dimColor wrap="truncate">
                  {ago(now - l.at)} — {l.text}
                </Text>
              ))}
            </Box>
          ) : null}
        </Box>
      )
    }

    function questsView() {
      const day = p.daily.day === G.dayKey(now, p.tz) ? p.daily.quests : G.questsFor(G.dayKey(now, p.tz))
      return (
        <Box flexDirection="column">
          <Text bold>Задания на сегодня</Text>
          {day.map((q, i) => (
            <Text key={`q-${i}`} wrap="wrap">
              <Text color={q.done ? '#4fb06d' : undefined}>{q.done ? '✅ ' : '▫️ '}</Text>
              <Text strikethrough={q.done}>{G.questText(q, p.name)}</Text>
              <Text dimColor>
                {'  '}
                {q.kind === 'eaten' ? `${G.tokens(q.have)}/${G.tokens(q.goal)}` : `${q.have}/${q.goal}`} · +{q.xp} XP, +{q.coins} 🪙
              </Text>
            </Text>
          ))}
          <Text dimColor>{p.daily.chest ? '🎁 Сундук дня открыт.' : '🎁 Выполни все три — сундук: +10 🪙 и +50 XP.'}</Text>
          <Text dimColor wrap="wrap">
            🔥 Серия {p.streak} дн. (рекорд {p.best}). Каждый день подряд добавляет +5% к опыту, до +50%.
          </Text>
        </Box>
      )
    }

    function shopView() {
      return (
        <Box flexDirection="column">
          <Text>
            <Text bold>Магазин · </Text>
            <Text color={COLOR.coin}>у тебя 🪙 {p.coins}</Text>
          </Text>
          <Text dimColor wrap="wrap">Монетки дают задания, достижения и новые уровни. Купленное надевается сразу.</Text>
          {G.SHOP.map(item => {
            const owned = p.owned.includes(item.id)
            const worn = p.worn[item.slot] === item.id
            return (
              <Box key={`shop-${item.id}`} flexDirection="row" gap={1} alignItems="center">
                <Text>
                  {item.title} <Text dimColor>({slotName(item.slot)}{owned ? '' : `, ${item.price} 🪙`})</Text>
                </Text>
                {owned ? (
                  <Button
                    key={`wear-${item.id}`}
                    label={worn ? 'Снять' : 'Надеть'}
                    dimColor={worn}
                    onPress={() => mutate($, (p, now, fx) => G.wear(p, item.id, now, fx))}
                  />
                ) : (
                  <Button
                    key={`buy-${item.id}`}
                    label="Купить"
                    dimColor={p.coins < item.price}
                    onPress={() => mutate($, (p, now, fx) => void G.buy(p, item.id, now, fx))}
                  />
                )}
              </Box>
            )
          })}
        </Box>
      )
    }

    function trophiesView() {
      const got = G.TROPHIES.filter(t => p.trophies[t.id])
      const left = G.TROPHIES.filter(t => !p.trophies[t.id])
      return (
        <Box flexDirection="column">
          <Text bold>
            Достижения {got.length} из {G.TROPHIES.length}
          </Text>
          {got.map(t => (
            <Text key={`t-${t.id}`} wrap="wrap">
              🏆 <Text bold>{t.title}</Text> <Text dimColor>— {t.hint}</Text>
            </Text>
          ))}
          {left.map(t => (
            <Text key={`t-${t.id}`} dimColor wrap="wrap">
              🔒 {t.title} — {t.hint} (+{t.coins} 🪙)
            </Text>
          ))}
        </Box>
      )
    }
  })
}

function slotName(slot: string) {
  return slot === 'head' ? 'голова' : slot === 'face' ? 'лицо' : slot === 'neck' ? 'шея' : 'рядом'
}

function tokensXp(n: number) {
  return Math.max(0, Math.ceil(n)).toLocaleString('ru-RU')
}

function ago(ms: number) {
  const m = Math.floor(ms / G.MINUTE)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.floor(h / 24)} дн. назад`
}

function age(ms: number) {
  const d = Math.floor(ms / (24 * G.HOUR))
  if (d >= 1) return `${d} ${G.plural(d, 'день', 'дня', 'дней')}`
  const h = Math.floor(ms / G.HOUR)
  return h >= 1 ? `${h} ч` : 'меньше часа'
}

function summary(p: Pet, now: number) {
  const { level, into, need } = G.levelOf(p.xp)
  const b = G.bonus(p)
  return [
    `${G.icon(p)} ${p.name} — ${G.title(p)}, уровень ${level} (${Math.floor(into)}/${need} XP), ${G.mood(p, now)}`,
    `Сытость ${Math.round(p.food)} · настроение ${Math.round(p.mood)} · энергия ${Math.round(p.energy)} · жучков ${p.bugs} · монет ${p.coins}`,
    `Опыт ×${b.factor.toFixed(2)}${b.why.length ? ` (${b.why.join(', ')})` : ''} · серия ${p.streak} дн.`,
    `Съедено ${G.tokens(p.n.eaten)} токенов · сообщений ${p.n.prompts} · инструментов ${p.n.tools} · достижений ${Object.keys(p.trophies).length}/${G.TROPHIES.length}`,
  ].join('\n')
}
