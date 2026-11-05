const { getNature } = require('./natures.js')

const STAT_KEYS = ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed']
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
  calcStats,
  statsArray,
  spTotal,
  validateSp,
  blankSp
}
