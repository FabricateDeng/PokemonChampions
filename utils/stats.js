const { getNature } = require('./natures.js')

const STAT_KEYS = ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed']
const SP_MAX = 32
const SP_TOTAL_MAX = 66
const STAT_LABELS = {
  hp: 'HP',
  attack: '攻击',
  defense: '防御',
  spAttack: '特攻',
  spDefense: '特防',
  speed: '速度'
}
const STAT_COLORS = {
  hp: '#FF6B6B',
  attack: '#FFA45B',
  defense: '#FFD166',
  spAttack: '#6FA8FF',
  spDefense: '#59D6A7',
  speed: '#F472C6'
}

/**
 * Champions uses 0–32 SP per stat (66 total), IV 31, level 50.
 * Each SP is worth 8 EVs, i.e. 2 stat points before nature.
 */
function calcStats(mon, member) {
  const nature = getNature(member && member.nature)
  const sp = (member && member.sp) || [0, 0, 0, 0, 0, 0]
  const out = {}

  STAT_KEYS.forEach((key, i) => {
    const base = mon.stats[i]
    const points = Math.max(0, Math.min(32, Number(sp[i]) || 0))
    const core = Math.floor(((2 * base + 31 + points * 2) * 50) / 100)

    if (key === 'hp') {
      out[key] = core + 60
      return
    }

    let value = core + 5
    if (nature.up === key) value = Math.floor(value * 1.1)
    if (nature.down === key) value = Math.floor(value * 0.9)
    out[key] = value
  })

  return out
}

function statsArray(stats) {
  return STAT_KEYS.map((key) => ({
    key,
    label: STAT_LABELS[key],
    color: STAT_COLORS[key],
    value: stats[key]
  }))
}

function spTotal(sp) {
  return (sp || []).reduce((sum, value) => sum + (Number(value) || 0), 0)
}

/**
 * 单项能力值：把第 index 项 SP 设为 spValue 后，该项的能力值。
 * 用于「直接填写能力值 → 反解努力值」。
 */
function statAt(mon, member, index, spValue) {
  if (!mon || index < 0 || index >= STAT_KEYS.length) return 0
  const sp = blankSp()
  sp[index] = Math.max(0, Math.min(SP_MAX, Number(spValue) || 0))
  return calcStats(mon, { nature: member && member.nature, sp })[STAT_KEYS[index]]
}

/**
 * 已知目标能力值，反解最接近的 SP 分配。
 * 返回 { sp, value, diff }；超出剩余点数时按剩余点数封顶。
 * 能力值随 SP 单调递增，33 个候选暴力枚举即可。
 */
function solveSpForStat(mon, member, index, target, budget) {
  const current = (member && member.sp) || blankSp()
  const usedByOthers = spTotal(current) - (Number(current[index]) || 0)
  const maxTotal = Math.max(0, Math.min(SP_MAX * 6, budget === undefined ? SP_TOTAL_MAX : budget))
  const cap = Math.max(0, Math.min(SP_MAX, maxTotal - usedByOthers))
  const aim = Number(target) || 0

  let best = null
  for (let sp = 0; sp <= cap; sp += 1) {
    const value = statAt(mon, member, index, sp)
    const diff = Math.abs(value - aim)
    // 同样接近时取更省点数的一档
    if (!best || diff < best.diff || (diff === best.diff && sp < best.sp)) {
      best = { sp, value, diff }
    }
  }
  return best || { sp: 0, value: statAt(mon, member, index, 0), diff: 0 }
}

function validateSp(sp) {
  const arr = sp || []
  if (arr.length !== 6) return false
  return arr.every((value) => value >= 0 && value <= 32) && spTotal(arr) <= 66
}

function blankSp() {
  return [0, 0, 0, 0, 0, 0]
}

module.exports = {
  STAT_KEYS,
  STAT_LABELS,
  STAT_COLORS,
  SP_MAX,
  SP_TOTAL_MAX,
  calcStats,
  statsArray,
  spTotal,
  validateSp,
  blankSp,
  statAt,
  solveSpForStat
}
