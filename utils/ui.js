const { TYPES, MOVES, POKEMON } = require('../data/pokedex.js')

function hexToRgba(hex, alpha) {
  const h = (hex || '#888888').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function textOnColor(hex) {
  const h = (hex || '#888888').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 155 ? '#221902' : '#ffffff'
}

function typeInfo(key) {
  const t = TYPES[key] || { name: key, color: '#888888' }
  return {
    key,
    name: t.name,
    color: t.color,
    textOn: textOnColor(t.color),
    bg: hexToRgba(t.color, 0.14),
    border: hexToRgba(t.color, 0.42)
  }
}

// Attribute chips: "全部" + the 18 types, ready for a chip rail (R7.4).
function typeChips(includeAll) {
  const list = (includeAll === false ? [] : [{ key: 'all', name: '全部', color: '#f2c455' }])
  Object.keys(TYPES).forEach((key) => {
    list.push(typeInfo(key))
  })
  return list
}

const CATEGORY = {
  physical: { key: 'physical', name: '物理' },
  special: { key: 'special', name: '特殊' },
  status: { key: 'status', name: '变化' }
}

function categoryInfo(cat) {
  return CATEGORY[cat] || CATEGORY.status
}

const FORM_SHORT = {
  mega: 'MEGA',
  regional: '地区',
  special: '特殊'
}

function formShort(form) {
  return FORM_SHORT[form] || ''
}

function powerText(value) {
  return value === null || value === undefined ? '—' : String(value)
}

function accuracyText(value, category) {
  if (value === null || value === undefined) {
    return category && category !== 'status' ? '必中' : '—'
  }
  if (value >= 101) return '必中'
  return value + '%'
}

function priorityText(value) {
  if (!value) return ''
  return value > 0 ? '+' + value : String(value)
}

// Move view model used by the 招式 view and the detail page.
function moveView(key) {
  const m = MOVES[key]
  if (!m) return null
  const ti = typeInfo(m.type)
  const ci = categoryInfo(m.cat)
  return {
    key,
    name: m.name,
    type: m.type,
    typeName: ti.name,
    typeColor: ti.color,
    typeBg: ti.bg,
    cat: m.cat,
    catName: ci.name,
    power: m.power,
    powerText: powerText(m.power),
    accText: accuracyText(m.acc, m.cat),
    pp: m.pp,
    order: m.cat === 'physical' ? 0 : m.cat === 'special' ? 1 : 2,
    priorityText: priorityText(m.priority),
    desc: m.desc || '',
    searchText: `${m.name} ${ti.name} ${ci.name} ${m.desc || ''}`.toLowerCase()
  }
}

// Total-base-stat ranking, used by the detail page.
let totalRankMap = null
function totalRank(key) {
  if (!totalRankMap) {
    totalRankMap = {}
    POKEMON.slice()
      .sort((a, b) => b.total - a.total || a.dex - b.dex)
      .forEach((p, i) => {
        totalRankMap[p.key] = i + 1
      })
  }
  return totalRankMap[key] || 0
}

module.exports = {
  hexToRgba,
  textOnColor,
  typeInfo,
  typeChips,
  categoryInfo,
  formShort,
  powerText,
  accuracyText,
  priorityText,
  moveView,
  totalRank
}
