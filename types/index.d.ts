/** Склонность питомца: чем чаще занимаешься делом, тем вероятнее взрослая форма. */
export type Branch = 'code' | 'research' | 'shell' | 'web' | 'team' | 'talk'

export type Stage = 'egg' | 'baby' | 'teen' | 'adult' | 'legend'

export type Slot = 'head' | 'face' | 'neck' | 'side'

export type QuestKind =
  | 'edits'
  | 'tests'
  | 'prompts'
  | 'eaten'
  | 'web'
  | 'reads'
  | 'agents'
  | 'shell'
  | 'pat'
  | 'squash'
  | 'play'

export type Quest = { kind: QuestKind; goal: number; have: number; xp: number; coins: number; done: boolean }

export type Counters = {
  prompts: number
  tools: number
  edits: number
  reads: number
  shell: number
  web: number
  agents: number
  tests: number
  errors: number
  denied: number
  turns: number
  /** Съедено токенов: вход + выход + запись в кэш + десятая часть чтения из кэша. */
  eaten: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  squashed: number
  pats: number
  plays: number
  wins: number
  quests: number
  sessions: number
  bought: number
  maxTurnTools: number
  maxTurnEaten: number
}

export type LogEntry = { at: number; text: string }

export type Pet = {
  v: 1
  name: string
  bornAt: number
  /** Последнее действие с Claude: от него считается сон. */
  lastSeen: number
  xp: number
  coins: number
  /** Потребности 0–100 на момент `at`; убывают лениво при каждом чтении. */
  food: number
  mood: number
  energy: number
  at: number
  bugs: number
  traits: Record<Branch, number>
  branch: Branch | null
  n: Counters
  tools: string[]
  streak: number
  best: number
  streakDay: string
  daily: { day: string; quests: Quest[]; chest: boolean }
  trophies: Record<string, number>
  owned: string[]
  worn: Partial<Record<Slot, string>>
  log: LogEntry[]
  lastPat: number
  /** Сдвиг местного времени от UTC в минутах. */
  tz: number
}

export type PetView = 'pet' | 'quests' | 'shop' | 'trophies'

/** Мини-игра «в какой лапке токен»: где спрятан, пока игрок не выбрал. */
export type PetGame = { hand: 'left' | 'right' } | null

declare module 'claude-code' {
  interface PluginState {
    'tamagotchi': { pet: Pet | null; view: PetView; game: PetGame }
  }
}
