const { TYPES } = require('../data/pokedex.js')

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
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 155 ? '#10130a' : '#ffffff'
}

function typeInfo(key) {
  const t = TYPES[key] || { name: key, color: '#888888' }
  return {
    key,
    name: t.name,
    color: t.color,
    textOn: textOnColor(t.color),
    bg: hexToRgba(t.color, 0.16),
    border: hexToRgba(t.color, 0.42)
  }
}

const CATEGORY = {
  physical: { name: '物理', color: '#FF9A62', bg: 'rgba(255, 154, 98, 0.14)' },
  special: { name: '特殊', color: '#6FB1FF', bg: 'rgba(111, 177, 255, 0.14)' },
  status: { name: '变化', color: '#A9B4C6', bg: 'rgba(169, 180, 198, 0.12)' }
}

function categoryInfo(cat) {
  const c = CATEGORY[cat] || CATEGORY.status
  return { key: cat, name: c.name, color: c.color, bg: c.bg }
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

module.exports = {
  hexToRgba,
  textOnColor,
  typeInfo,
  categoryInfo,
  powerText,
  accuracyText,
  priorityText
}
