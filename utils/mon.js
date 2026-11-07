// Normalised, searchable view models for the Pokédex and the move library.
// Built once per launch (R11.3): pages only slice what they render.

const { POKEMON, MOVES, ABILITIES, LEARN_COUNT } = require('../data/pokedex.js')
const { typeInfo, formShort, moveView } = require('./ui.js')
const { dexLabel } = require('./format.js')

const STAT_KEYS = ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed']

let monCache = null
let monIndex = null
let moveCache = null

function buildMon(p) {
  const typesInfo = p.types.map(typeInfo)
  const abilityNames = p.abilities.map((k) => (ABILITIES[k] ? ABILITIES[k].name : '')).join(' ')
  const moveNames = p.moves.map((k) => (MOVES[k] ? MOVES[k].name : '')).join(' ')
  const searchText = [
    p.name,
    p.key,
    p.dex,
    String(p.dex).padStart(3, '0'),
    p.gen,
    `第${p.gen}世代`,
    ...typesInfo.map((t) => t.name),
    abilityNames
  ].join(' ').toLowerCase()

  return {
    key: p.key,
    id: p.id,
    dex: p.dex,
    dexLabel: dexLabel(p.dex),
    name: p.name,
    gen: p.gen,
    types: p.types,
    typesInfo,
    stats: p.stats,
    total: p.total,
    speed: p.stats[5],
    abilities: p.abilities,
    moves: p.moves,
    count: {
      abilities: p.abilities.length,
      moves: p.moves.length
    },
    reg: p.reg,
    form: p.form,
    formLabel: p.formLabel || '',
    formShort: formShort(p.form),
    tags: p.tags || [],
    sprite: p.sprite,
    order: p.order,
    searchText,
    moveText: moveNames.toLowerCase()
  }
}

function all() {
  if (!monCache) monCache = POKEMON.map(buildMon)
  return monCache
}

function byKey() {
  if (!monIndex) {
    monIndex = {}
    all().forEach((m) => {
      monIndex[m.key] = m
    })
  }
  return monIndex
}

function allMoves() {
  if (moveCache) return moveCache
  moveCache = Object.keys(MOVES)
    .map((key) => {
      const view = moveView(key)
      if (!view) return null
      view.learnCount = LEARN_COUNT[key] || 0
      view.learnText = view.learnCount + ' 只可学'
      view.searchText = `${view.searchText} ${view.learnCount}`
      return view
    })
    .filter(Boolean)
  return moveCache
}

// Query terms are AND-ed; one-character terms only hit names/types/abilities so
// that "火" does not return 300 moves (R8.8 / search quality).
function matches(item, terms) {
  if (!terms.length) return true
  for (let i = 0; i < terms.length; i += 1) {
    const term = terms[i]
    const inCore = item.searchText.indexOf(term) !== -1
    const inMoves = term.length >= 2 && item.moveText && item.moveText.indexOf(term) !== -1
    if (!inCore && !inMoves) return false
  }
  return true
}

function terms(query) {
  return (query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
}

function sortMons(list, sort) {
  if (sort === 1) return list.sort((a, b) => b.total - a.total || a.dex - b.dex || a.order - b.order)
  if (sort === 2) return list.sort((a, b) => b.speed - a.speed || b.total - a.total || a.dex - b.dex)
  if (sort === 3) return list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return list.sort((a, b) => a.dex - b.dex || a.order - b.order || a.id - b.id)
}

function sortMoves(list, sort) {
  if (sort === 1) return list.sort((a, b) => (b.power || -1) - (a.power || -1) || b.learnCount - a.learnCount)
  if (sort === 2) return list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return list.sort((a, b) => b.learnCount - a.learnCount || a.name.localeCompare(b.name))
}

// Compact cell used by grids / list rows.
function cell(m, favSet) {
  return {
    key: m.key,
    name: m.name,
    dexLabel: m.dexLabel,
    sprite: m.sprite,
    typesInfo: m.typesInfo,
    total: m.total,
    speed: m.speed,
    formShort: m.formShort,
    fav: !!(favSet && favSet.has(m.key))
  }
}

module.exports = {
  STAT_KEYS,
  all,
  byKey,
  allMoves,
  matches,
  terms,
  sortMons,
  sortMoves,
  cell
}
