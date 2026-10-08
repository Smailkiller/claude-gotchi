// Пиксельный питомец: сцена 32×28, восемь кадров по 300 мс.
// Десктоп получает один SVG с SMIL-кадрами (только path, без text и ссылок —
// так его рисует картинка), терминал — те же кадры полублоками в Raster.

import type { Branch, Pet, Slot, Stage } from '../types'
import { HATCH_LEVEL, isAsleep, lead, levelOf, need, stageOf } from './game'

export const W = 32
export const H = 28
export const FRAMES = 8
export const FRAME_MS = 300
const GROUND = 26 // строка тени; нижний ряд питомца — над ней
const EMPTY = -1
const SHADOW = 0x1000000 // полупрозрачная тень: в SVG — прозрачностью, в терминале не рисуется

type Face = 'happy' | 'calm' | 'sad' | 'sleep'

export type Scene = {
  stage: Stage
  branch: Branch
  face: Face
  hungry: boolean
  hearts: boolean
  bugs: number
  /** Доля пути от яйца до вылупления, 0–1. */
  hatch: number
  worn: Partial<Record<Slot, string>>
}

export function sceneOf(p: Pet, now: number): Scene {
  const level = levelOf(p.xp).level
  const stage = stageOf(level)
  const asleep = isAsleep(p, now)
  const face: Face = asleep ? 'sleep' : p.mood < 30 || p.food < 15 ? 'sad' : p.mood >= 70 ? 'happy' : 'calm'
  return {
    stage,
    branch: p.branch ?? lead(p),
    face,
    hungry: p.food < 25 && !asleep,
    hearts: p.mood >= 85 && !asleep,
    bugs: p.bugs,
    hatch: Math.min(1, p.xp / (need(1) + need(HATCH_LEVEL - 1))),
    worn: p.worn,
  }
}

// ── палитра ───────────────────────────────────────────────────────────────

const BODY: Record<Branch | 'base', [number, number, number]> = {
  base: [0xd97757, 0xa9553a, 0xf0a588],
  code: [0x5b8def, 0x3a63b8, 0x9dbcf7],
  research: [0x9a7fe0, 0x6e54b8, 0xc8b8f2],
  shell: [0x4fb06d, 0x2f7e49, 0x92d9a6],
  web: [0x36b3a8, 0x23807a, 0x86dcd4],
  team: [0xe0605a, 0xa83c37, 0xf3a19c],
  talk: [0xe07a9a, 0xa9506c, 0xf4b0c6],
}

const FIXED: Record<string, number> = {
  K: 0x1b1b1b, // глаза, тёмные детали
  E: 0xffffff, // блик
  M: 0x4a1f24, // рот
  R: 0xe0485a, // язык, красное
  P: 0xf29bb0, // румянец, розовое
  W: 0xf7f1e8, // животик, скорлупа, белое
  w: 0xcfc3b3, // тень скорлупы
  Y: 0xffc93c, // золото
  y: 0xd99a1e, // тень золота
  G: 0x2b2b2b, // оправа
  D: 0x7a4a2a, // дерево, коричневое
  F: 0xc9733a, // окорочок
  T: 0x7fc8ff, // слеза
  Z: 0x9fb7ff, // сон
  H: 0xff6b9a, // сердечко
  X: 0xd0452a, // жучок
  x: 0x1b1b1b, // лапки жучка
  g: 0x39ff88, // неон
  h: 0x1e2a22, // экран
  S: 0xb9bcc6, // металл
  s: 0x8a8d97, // тень металла
  O: 0x3f7fbf, // колба
  o: 0x9fd0ff, // пузырьки
  C: 0xe3e3e3, // дым
  c: 0x3a6ea8, // синий
}

// ── формы ─────────────────────────────────────────────────────────────────

const EGG = [
  '....wwww....',
  '...wWWWWw...',
  '..wWWWWWWw..',
  '.wWWBWWWWWw.',
  '.wWBBWWWBWw.',
  'wWWWWWWWBBWw',
  'wWWWWWWWWWWw',
  'wWWBWWWWWWWw',
  'wWBBBWWWWWWw',
  'wWWBWWWWBWWw',
  '.wWWWWWBBWw.',
  '.wWWWWWWWWw.',
  '..wWWWWWWw..',
  '...wwwwww...',
]

type Form = {
  art: string[]
  eyes: [[number, number], [number, number]]
  mouth: [number, number]
  blush: [[number, number], [number, number]]
  /** Макушка: левый и правый край, строка. */
  head: [number, number, number]
  neck: number
  /** Кончики антенн, если есть. */
  tips: [number, number][]
}

const FORMS: Record<'baby' | 'teen' | 'adult', Form> = {
  baby: {
    art: [
      '...bbbbbb...',
      '.bbBBllBBbb.',
      '.bBBllBBBBb.',
      'bBBBBBBBBBBb',
      'bBBBBBBBBBBb',
      'bBBBBBBBBBBb',
      'bBBBBBBBBBBb',
      '.bBBBBBBBBb.',
      '..bbBbbBbb..',
      '...bb..bb...',
    ],
    eyes: [[3, 3], [7, 3]],
    mouth: [4, 5],
    blush: [[2, 6], [9, 6]],
    head: [3, 8, 0],
    neck: 7,
    tips: [],
  },
  teen: {
    art: [
      '..b..........b..',
      '..lb........bl..',
      '...b..bbbb..b...',
      '...bbbBBBBbbb...',
      '..bBBBllBBBBBb..',
      '.bBBBllBBBBBBBb.',
      '.bBBBBBBBBBBBBb.',
      'bBBBBBBBBBBBBBBb',
      'bBBBBBBBBBBBBBBb',
      'bBBBBBBBBBBBBBBb',
      '.bBBBBBBBBBBBBb.',
      '..bBBBBBBBBBBb..',
      '...bbBbbbbBbb...',
      '....bb....bb....',
    ],
    eyes: [[4, 6], [10, 6]],
    mouth: [6, 8],
    blush: [[3, 9], [12, 9]],
    head: [4, 11, 3],
    neck: 10,
    tips: [[2, 1], [13, 1]],
  },
  adult: {
    art: [
      '....b..........b....',
      '....lb........bl....',
      '.....b.bbbbbb.b.....',
      '.....bbBBBBBBbb.....',
      '....bBBllBBBBBBb....',
      '...bBBllBBBBBBBBb...',
      '..bBBBBBBBBBBBBBBb..',
      '..bBBBBBBBBBBBBBBb..',
      '.bBBBBBBBBBBBBBBBBb.',
      '.bBBBBBBBBBBBBBBBBb.',
      'bbBBBBBWWWWWWBBBBBbb',
      'bBbBBBWWWWWWWWBBBbBb',
      '.bbBBBWWWWWWWWBBBbb.',
      '..bBBBBWWWWWWBBBBb..',
      '...bBBBBBBBBBBBBb...',
      '....bbBBbbbbBBbb....',
      '....bbbb....bbbb....',
    ],
    eyes: [[6, 7], [12, 7]],
    mouth: [8, 9],
    blush: [[4, 10], [15, 10]],
    head: [6, 13, 3],
    neck: 10,
    tips: [[4, 1], [15, 1]],
  },
}

const EYES: Record<'open' | 'shut' | 'joy', string[]> = {
  open: ['EK', 'KK'],
  shut: ['..', 'KK'],
  joy: ['KK', '..'],
}

const MOUTHS: Record<Face | 'open', string[]> = {
  happy: ['M..M', '.MM.'],
  calm: ['....', '.MM.'],
  sad: ['.MM.', 'M..M'],
  sleep: ['....', '.M..'],
  open: ['.MM.', '.RM.'],
}

const HEART = ['.H.H.', 'HHHHH', '.HHH.', '..H..']
const ZED = ['ZZZZ', '..Z.', '.Z..', 'ZZZZ']
const DRUMSTICK = ['..FFF', '.FFFF', '.FFF.', 'WW...', 'W....']
const BUG = ['XKX', 'XXX']

const HATS: Record<string, string[]> = {
  bow: ['PP.PP', 'PPRPP', 'PP.PP'],
  beanie: ['...WW...', '..RRRR..', '.RRRRRR.', 'WWWWWWWW'],
  party: ['..Y..', '..c..', '.cYc.', '.YcY.', 'cYcYc'],
  crown: ['Y..Y..Y', 'YY.Y.YY', 'YRYEYRY', 'yyyyyyy'],
}

const HOOKAH = ['.X.', 'DDD', '.S.', 'SSS', '.S.', 'OOO', 'OoO', 'OOO']

// ── холст ─────────────────────────────────────────────────────────────────

type Canvas = Int32Array

const blank = (): Canvas => new Int32Array(W * H).fill(EMPTY)

function put(c: Canvas, x: number, y: number, color: number) {
  if (x >= 0 && y >= 0 && x < W && y < H) c[y * W + x] = color
}

function stamp(c: Canvas, art: readonly string[], ox: number, oy: number, pal: Record<string, number>) {
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = pal[row[x]!]
      if (color !== undefined) put(c, ox + x, oy + y, color)
    }
  })
}

const near = (f: number, every: number, span: number) => f % every < span

function frame(s: Scene, f: number): Canvas {
  const c = blank()
  const [B, b, l] = s.stage === 'egg' || s.stage === 'baby' ? BODY.base : BODY[s.branch]
  const pal: Record<string, number> = { ...FIXED, B, b, l }

  if (s.stage === 'egg') {
    const wobble = [0, 0, 1, 0, 0, 0, -1, 0][f]!
    const ox = (W - 12) / 2 + (s.hatch > 0.7 ? wobble : f === 2 ? 1 : 0)
    const oy = GROUND - EGG.length
    for (let x = 0; x < 10; x++) put(c, ox + 1 + x, GROUND, SHADOW)
    stamp(c, EGG, ox, oy, pal)
    const cracks: [number, number][] = []
    if (s.hatch > 0.35) cracks.push([5, 4], [6, 5], [5, 6], [6, 7])
    if (s.hatch > 0.65) cracks.push([7, 6], [8, 7], [4, 7], [3, 8], [9, 8])
    for (const [x, y] of cracks) put(c, ox + x, oy + y, FIXED.K!)
    if (s.hatch > 0.85 && !near(f, 8, 1)) {
      put(c, ox + 4, oy + 6, FIXED.K!)
      put(c, ox + 7, oy + 6, FIXED.K!)
    }
    return c
  }

  const form = FORMS[s.stage === 'legend' ? 'adult' : s.stage]
  const w = form.art[0]!.length
  const h = form.art.length
  const ox = Math.floor((W - w) / 2)
  const hop = s.face === 'happy' ? [0, -1, -2, -1, 0, 0, 0, 0] : s.face === 'calm' ? [0, 0, 0, -1, -1, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0, 0]
  const dy = hop[f]!
  const oy = GROUND - h + dy

  for (let x = 2; x < w - 2; x++) put(c, ox + x, GROUND, SHADOW)
  stamp(c, form.art, ox, oy, pal)

  // Животик хакера — экран с приглашением командной строки.
  if (s.branch === 'shell' && (s.stage === 'adult' || s.stage === 'legend')) {
    for (let y = 10; y <= 13; y++) for (let x = 7; x <= 12; x++) if (form.art[y]![x] === 'W') put(c, ox + x, oy + y, FIXED.h!)
    const cursor = near(f, 4, 2)
    stamp(c, ['g.....', '.g....', 'g..' + (cursor ? 'gg' : '..') + '.'], ox + 8, oy + 10, pal)
  }

  // Лицо.
  const blink = s.face !== 'sleep' && f === 6
  const eyes = s.face === 'sleep' || blink ? EYES.shut : s.face === 'happy' && (f === 2 || f === 3) ? EYES.joy : EYES.open
  for (const [ex, ey] of form.eyes) stamp(c, eyes, ox + ex, oy + ey, pal)
  const mouth = s.hungry && s.face !== 'sleep' && near(f, 4, 2) ? MOUTHS.open : MOUTHS[s.face]
  stamp(c, mouth, ox + form.mouth[0], oy + form.mouth[1], pal)
  if (s.face === 'happy' || s.face === 'sleep') for (const [bx, by] of form.blush) put(c, ox + bx, oy + by, FIXED.P!)
  if (s.face === 'sad') {
    const [ex, ey] = form.eyes[0]
    put(c, ox + ex, oy + ey + 2 + (f % 4 >= 2 ? 1 : 0), FIXED.T!)
  }

  const adult = s.stage === 'adult' || s.stage === 'legend'
  if (adult) feature(c, s, form, ox, oy, f, pal)
  if (s.stage === 'legend' && !s.worn.head) hat(c, HATS.crown!, form, ox, oy, pal)
  if (s.stage === 'legend') {
    const sparks: [number, number][] = [[2, 6], [28, 9], [4, 16], [27, 18], [25, 3]]
    sparks.forEach(([x, y], i) => {
      if (!near(f + i * 3, 8, 3)) return
      put(c, x, y, FIXED.Y!)
      put(c, x - 1, y, FIXED.y!)
      put(c, x + 1, y, FIXED.y!)
      put(c, x, y - 1, FIXED.y!)
      put(c, x, y + 1, FIXED.y!)
    })
  }
  wearables(c, s, form, ox, oy, f, pal)

  // Состояния вокруг.
  if (s.face === 'sleep') {
    const rise = f % 4
    stamp(c, ZED, ox + w, oy - 1 - rise, pal)
    if (f >= 4) stamp(c, ZED, ox + w + 3, oy - 5 - (f - 4), pal)
  }
  if (s.hearts) stamp(c, HEART, ox - 5, oy + 2 - Math.floor(f / 2), pal)
  if (s.hungry && near(f, 8, 4)) stamp(c, DRUMSTICK, ox + w + 1, Math.max(0, oy - 4), pal)
  bugs(c, s.bugs, ox, oy, w, h, f, pal)
  return c
}

function hat(c: Canvas, art: string[], form: Form, ox: number, oy: number, pal: Record<string, number>) {
  const [x0, x1, top] = form.head
  const cx = Math.round((x0 + x1 + 1) / 2)
  stamp(c, art, ox + cx - Math.floor(art[0]!.length / 2), oy + top - art.length + 1, pal)
}

function feature(c: Canvas, s: Scene, form: Form, ox: number, oy: number, f: number, pal: Record<string, number>) {
  const [[e1x, ey], [e2x]] = form.eyes
  const ring = (x: number, y: number, color: number) => {
    for (let i = -1; i <= 2; i++) {
      put(c, ox + x + i, oy + y - 1, color)
      put(c, ox + x + i, oy + y + 2, color)
      put(c, ox + x - 1, oy + y + i, color)
      put(c, ox + x + 2, oy + y + i, color)
    }
  }
  const w = form.art[0]!.length
  switch (s.branch) {
    case 'code':
      if (s.worn.face) break
      ring(e1x, ey, FIXED.G!)
      ring(e2x, ey, FIXED.G!)
      for (let x = e1x + 3; x < e2x - 1; x++) put(c, ox + x, oy + ey, FIXED.G!)
      break
    case 'research':
      if (!s.worn.face) {
        ring(e2x, ey, FIXED.Y!)
        put(c, ox + e2x + 2, oy + ey + 3, FIXED.y!)
        put(c, ox + e2x + 3, oy + ey + 4, FIXED.y!)
      }
      stamp(c, ['RRRR', 'RWWR', 'RWWR', 'RWWR', 'RRRR'], ox + w - 3, oy + 9, pal)
      break
    case 'web':
      for (const [tx, ty] of form.tips) {
        put(c, ox + tx, oy + ty, near(f, 2, 1) ? FIXED.Y! : FIXED.y!)
        const side = tx < w / 2 ? -1 : 1
        if (near(f, 4, 3)) for (let k = -1; k <= 1; k++) put(c, ox + tx + side * 2, oy + ty + k, FIXED.Y!)
        if (near(f + 2, 4, 2)) for (let k = -2; k <= 2; k++) put(c, ox + tx + side * 4, oy + ty + k, FIXED.y!)
      }
      break
    case 'team': {
      const px = ox + w
      for (let y = 2; y <= 13; y++) put(c, px, oy + y, FIXED.D!)
      stamp(c, near(f, 2, 1) ? ['RRRR', 'RRRR', 'RRR.'] : ['RRR.', 'RRRR', 'RRRR'], px + 1, oy + 2, pal)
      break
    }
    case 'talk': {
      const bx = ox + w - 4
      const by = Math.max(0, oy - 7)
      stamp(c, ['.wwwwwww.', 'wWWWWWWWw', 'wWWWWWWWw', 'wWWWWWWWw', '.wwwwwww.', 'ww.......', 'w........'], bx, by, pal)
      const dots = f < 2 ? 1 : f < 4 ? 2 : 3
      for (let i = 0; i < dots; i++) put(c, bx + 2 + i * 2, by + 2, FIXED.K!)
      break
    }
    case 'shell':
      break
  }
}

function wearables(c: Canvas, s: Scene, form: Form, ox: number, oy: number, f: number, pal: Record<string, number>) {
  const [x0, x1, top] = form.head
  const [[e1x, ey], [e2x]] = form.eyes
  const w = form.art[0]!.length
  const head = s.worn.head
  if (head === 'headphones') {
    for (let x = x0 - 1; x <= x1 + 1; x++) put(c, ox + x, oy + top - 1, FIXED.G!)
    const ly = Math.max(top, ey - 1)
    for (let y = top - 1; y < ly; y++) {
      put(c, ox + x0 - 2, oy + y, FIXED.G!)
      put(c, ox + x1 + 2, oy + y, FIXED.G!)
    }
    stamp(c, ['RR', 'RR', 'RR'], ox + e1x - 3, oy + ly, pal)
    stamp(c, ['RR', 'RR', 'RR'], ox + e2x + 3, oy + ly, pal)
  } else if (head && HATS[head]) {
    hat(c, HATS[head]!, form, ox, oy, pal)
  }
  if (s.worn.face === 'shades') {
    for (let x = e1x - 1; x <= e2x + 2; x++) put(c, ox + x, oy + ey, FIXED.K!)
    stamp(c, ['KKKK', '.KK.'], ox + e1x - 1, oy + ey + 1, pal)
    stamp(c, ['KKKK', '.KK.'], ox + e2x - 1, oy + ey + 1, pal)
    put(c, ox + e1x, oy + ey + 1, FIXED.E!)
    put(c, ox + e2x, oy + ey + 1, FIXED.E!)
  }
  if (s.worn.neck === 'scarf') {
    const y = oy + form.neck
    let x = 0
    for (const ch of form.art[form.neck]!) {
      if (ch !== '.') put(c, ox + x, y, x % 3 === 0 ? FIXED.W! : FIXED.R!)
      x++
    }
    const tail = near(f, 4, 2) ? 0 : 1
    stamp(c, ['RR', 'RW', 'RR', 'W.'], ox + w - 5 + tail, y + 1, pal)
  }
  if (s.worn.side === 'hookah') {
    const hx = Math.max(0, ox - 5)
    const hy = GROUND - HOOKAH.length
    stamp(c, HOOKAH, hx, hy, pal)
    put(c, hx + 1, hy, near(f, 3, 1) ? FIXED.Y! : FIXED.X!)
    // Шланг к питомцу и колечки дыма.
    for (let x = hx + 3; x < ox + 2; x++) put(c, x, hy + 4, FIXED.c!)
    if (f >= 3) {
      const up = f - 3
      stamp(c, ['.C.', 'C.C', '.C.'], hx, hy - 3 - up, pal)
    }
  }
}

function bugs(c: Canvas, n: number, ox: number, oy: number, w: number, h: number, f: number, pal: Record<string, number>) {
  const ground: [number, number][] = [[1, GROUND - 1], [W - 4, GROUND - 1], [4, GROUND - 2], [W - 7, GROUND]]
  const body: [number, number][] = [[ox + 1, oy + h - 6], [ox + w - 4, oy + h - 8], [ox + 2, oy + h - 10], [ox + w - 5, oy + h - 4], [ox + w / 2 - 1, oy + 1]]
  const spots = [...ground, ...body]
  for (let i = 0; i < Math.min(n, spots.length); i++) {
    const [x, y] = spots[i]!
    const step = (f + i) % 4 < 2 ? 0 : 1
    stamp(c, BUG, i < ground.length ? x + step : x, i < ground.length ? y : y + step, pal)
  }
}

// ── вывод ─────────────────────────────────────────────────────────────────

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')

/** Горизонтальные отрезки одного цвета — по path на цвет. */
function paths(c: Canvas, keep: (i: number) => boolean): string {
  const byColor = new Map<number, string>()
  for (let y = 0; y < H; y++) {
    let x = 0
    while (x < W) {
      const i = y * W + x
      const color = c[i]!
      if (color === EMPTY || !keep(i)) { x++; continue }
      let len = 1
      while (x + len < W && c[i + len] === color && keep(i + len)) len++
      byColor.set(color, (byColor.get(color) ?? '') + `M${x} ${y}h${len}v1h-${len}z`)
      x += len
    }
  }
  return [...byColor]
    .map(([color, d]) => (color === SHADOW ? `<path fill="#000" fill-opacity=".22" d="${d}"/>` : `<path fill="${hex(color)}" d="${d}"/>`))
    .join('')
}

const cache = new Map<string, string>()

/** Вся анимация одним SVG: общий слой и по слою на кадр. */
export function petSvg(s: Scene, px: number): string {
  const key = JSON.stringify(s) + px
  const hit = cache.get(key)
  if (hit) return hit
  const frames = Array.from({ length: FRAMES }, (_, f) => frame(s, f))
  const same = (i: number) => frames.every(fr => fr[i] === frames[0]![i])
  const dur = (FRAMES * FRAME_MS) / 1000
  const layers = frames.map((fr, i) => {
    const body = paths(fr, k => !same(k))
    if (!body) return ''
    const a = i / FRAMES
    const b = (i + 1) / FRAMES
    const [values, times] =
      i === 0 ? ['visible;hidden', `0;${b}`] : i === FRAMES - 1 ? ['hidden;visible', `0;${a}`] : ['hidden;visible;hidden', `0;${a};${b}`]
    return (
      `<g visibility="${i === 0 ? 'visible' : 'hidden'}">${body}` +
      `<animate attributeName="visibility" values="${values}" keyTimes="${times}" dur="${dur}s" repeatCount="indefinite" calcMode="discrete"/></g>`
    )
  })
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W * px}" height="${H * px}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">` +
    paths(frames[0]!, same) +
    layers.join('') +
    `</svg>`
  if (cache.size > 32) cache.clear()
  cache.set(key, svg)
  return svg
}

const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄

/** Кадр для терминала: полублоки, две строки пикселей на клетку. */
export function petCells(s: Scene, f: number): { columns: number; rows: number; cells: string } {
  const c = frame(s, f % FRAMES)
  const rows = Math.ceil(H / 2)
  const words = new Uint32Array(W * rows * 3)
  const at = (x: number, y: number) => {
    const v = y < H ? c[y * W + x]! : EMPTY
    return v === EMPTY || v === SHADOW ? null : v
  }
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < W; x++) {
      const top = at(x, r * 2)
      const bottom = at(x, r * 2 + 1)
      const k = (r * W + x) * 3
      if (top === null && bottom === null) words.set([0x20, DEFAULT, DEFAULT], k)
      else if (top === null) words.set([LOWER, bottom!, DEFAULT], k)
      else words.set([UPPER, top, bottom ?? DEFAULT], k)
    }
  }
  return { columns: W, rows, cells: (new Uint8Array(words.buffer) as Uint8Array & { toBase64(): string }).toBase64() }
}
