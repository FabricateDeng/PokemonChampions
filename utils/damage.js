const { MOVES } = require('../data/pokedex.js')
const { calcStats } = require('./stats.js')
const { getAttackEffectiveness } = require('./type-chart.js')

const TYPE_BOOST_ITEMS = {
  charcoal: 'fire',
  'mystic-water': 'water',
  magnet: 'electric',
  'miracle-seed': 'grass',
  'never-melt-ice': 'ice',
  'sharp-beak': 'flying',
  'poison-barb': 'poison',
  'soft-sand': 'ground',
  'hard-stone': 'rock',
  'silver-powder': 'bug',
  'spell-tag': 'ghost',
  'dragon-fang': 'dragon',
  'black-glasses': 'dark',
  'metal-coat': 'steel',
  'silk-scarf': 'normal',
  'twisted-spoon': 'psychic',
  'pixie-plate': 'fairy',
  'black-belt': 'fighting'
}

const IMMUNITY_ABILITIES = {
  'flash-fire': 'fire',
  'water-absorb': 'water',
  'storm-drain': 'water',
  'dry-skin': 'water',
  'volt-absorb': 'electric',
  'lightning-rod': 'electric',
  'motor-drive': 'electric',
  'sap-sipper': 'grass',
  levitate: 'ground',
  'earth-eater': 'ground'
}

function stageMultiplier(stage) {
  const n = Math.max(-6, Math.min(6, Number(stage) || 0))
  return n >= 0 ? (2 + n) / 2 : 2 / (2 - n)
}

function effectiveStat(raw, stage) {
  return Math.max(1, Math.floor(raw * stageMultiplier(stage)))
}

function hasTrait(move, trait) {
  return !!(move && Array.isArray(move.traits) && move.traits.indexOf(trait) >= 0)
}

function abilityName(ability) {
  return ability || ''
}

function calcDamage(options) {
  const opts = options || {}
  const attacker = opts.attacker || {}
  const defender = opts.defender || {}
  const attackerMon = attacker.mon
  const defenderMon = defender.mon
  const attackerMember = attacker.member
  const defenderMember = defender.member
  const move = MOVES[opts.moveKey]
  const field = opts.field || {}

  if (!attackerMon || !defenderMon || !attackerMember || !defenderMember || !move) {
    return { ok: false, reason: '请选择双方宝可梦和招式' }
  }
  if (move.cat === 'status') {
    return { ok: false, reason: '变化招式没有直接伤害' }
  }
  if (move.power === null || move.power === undefined) {
    return { ok: false, reason: '该招式威力可变，暂不支持估算' }
  }

  const attackerAbility = abilityName(attackerMember.ability)
  const defenderAbility = abilityName(defenderMember.ability)
  const attackerItem = attackerMember.item || ''
  const defenderItem = defenderMember.item || ''

  const attackStats = calcStats(attackerMon, attackerMember)
  const defenseStats = calcStats(defenderMon, defenderMember)

  let moveType = move.type
  let power = Number(move.power) || 0
  let attack = move.cat === 'physical' ? attackStats.attack : attackStats.spAttack
  let defense = move.cat === 'physical' ? defenseStats.defense : defenseStats.spDefense
  const notes = []

  // -ate abilities turn Normal moves into their type and add 20% power.
  const ateMap = {
    pixilate: 'fairy',
    aerilate: 'flying',
    refrigerate: 'ice',
    galvanize: 'electric'
  }
  if (moveType === 'normal' && ateMap[attackerAbility]) {
    moveType = ateMap[attackerAbility]
    power *= 1.2
    notes.push('已计入' + attackerAbility + '属性转换')
  }

  if (attackerAbility === 'technician' && power <= 60) power *= 1.5
  if (attackerAbility === 'tough-claws' && hasTrait(move, 'contact')) power *= 1.3
  if (attackerAbility === 'iron-fist' && hasTrait(move, 'punch')) power *= 1.2
  if (attackerAbility === 'strong-jaw' && hasTrait(move, 'bite')) power *= 1.5
  if (attackerAbility === 'sharpness' && hasTrait(move, 'slicing')) power *= 1.5
  if (attackerAbility === 'punk-rock' && hasTrait(move, 'sound')) power *= 1.3
  if (attackerAbility === 'mega-launcher' && hasTrait(move, 'pulse')) power *= 1.5

  // Attacker stat modifiers.
  if (move.cat === 'physical' && (attackerAbility === 'huge-power' || attackerAbility === 'pure-power')) {
    attack *= 2
    notes.push('已计入大力士 / 瑜珈之力')
  }
  if (attackerAbility === 'guts' && field.burn && move.cat === 'physical') {
    attack *= 1.5
    notes.push('已计入毅力')
  }
  if (move.cat === 'physical' && attackerItem === 'choice-band') attack *= 1.5
  if (move.cat === 'special' && attackerItem === 'choice-specs') attack *= 1.5
  attack = effectiveStat(attack, field.atkStage || 0)

  // Defender stat modifiers.
  if (move.cat === 'physical' && defenderAbility === 'fur-coat') {
    defense *= 2
    notes.push('已计入毛皮大衣')
  }
  if (move.cat === 'special' && defenderAbility === 'ice-scales') {
    defense *= 2
    notes.push('已计入冰鳞粉')
  }
  if (move.cat === 'special' && defenderItem === 'assault-vest') defense *= 1.5
  if (defenderItem === 'eviolite') defense *= 1.5
  defense = effectiveStat(defense, field.defStage || 0)

  const level = 50
  const base = Math.floor((Math.floor(((2 * level) / 5 + 2) * power * attack / defense) / 50) + 2)

  // Type matchup and STAB.
  const effectiveness = getAttackEffectiveness(moveType, defenderMon.types)
  if (effectiveness === 0) {
    return {
      ok: true,
      moveName: move.name,
      moveType,
      category: move.cat,
      power,
      effectiveness,
      effText: '无效',
      damageMin: 0,
      damageMax: 0,
      percentMin: 0,
      percentMax: 0,
      koChance: 0,
      hits: '—',
      notes
    }
  }

  let stab = 1
  if (attackerMon.types.indexOf(moveType) >= 0) {
    stab = attackerAbility === 'adaptability' ? 2 : 1.5
  }

  let mods = 1
  mods *= stab
  mods *= effectiveness

  if (field.burn && move.cat === 'physical' && attackerAbility !== 'guts') mods *= 0.5
  if (field.weather === 'sun') {
    if (moveType === 'fire') mods *= 1.5
    if (moveType === 'water') mods *= 0.5
  }
  if (field.weather === 'rain') {
    if (moveType === 'water') mods *= 1.5
    if (moveType === 'fire') mods *= 0.5
  }
  if (field.weather === 'sun' && attackerAbility === 'solar-power') mods *= 1.5

  if (field.crit) {
    mods *= 1.5
    notes.push('暴击已计入，且无视反射 / 光墙')
  } else {
    if (move.cat === 'physical' && field.reflect && defenderAbility !== 'infiltrator') mods *= 0.5
    if (move.cat === 'special' && field.lightScreen && defenderAbility !== 'infiltrator') mods *= 0.5
  }

  if (field.helpingHand) mods *= 1.5
  if (attackerItem === 'life-orb') mods *= 1.3
  if (attackerItem === 'expert-belt' && effectiveness > 1) mods *= 1.2
  if (TYPE_BOOST_ITEMS[attackerItem] === moveType) mods *= 1.2
  if (move.cat === 'physical' && attackerItem === 'muscle-band') mods *= 1.1
  if (move.cat === 'special' && attackerItem === 'wise-glasses') mods *= 1.1

  if (field.defenderFullHp !== false && (defenderAbility === 'multiscale' || defenderAbility === 'shadow-shield')) {
    mods *= 0.5
    notes.push('已计入满 HP 减伤特性')
  }
  if (effectiveness > 1 && (defenderAbility === 'solid-rock' || defenderAbility === 'filter')) mods *= 0.75
  if ((moveType === 'fire' || moveType === 'ice') && defenderAbility === 'thick-fat') mods *= 0.5
  if (moveType === 'fire' && defenderAbility === 'heatproof') mods *= 0.5
  if (moveType === 'fire' && defenderAbility === 'water-bubble') mods *= 0.5
  if (moveType === 'fire' && defenderAbility === 'fluffy') mods *= 2
  if (move.cat === 'physical' && hasTrait(move, 'contact') && defenderAbility === 'fluffy') mods *= 0.5

  if (IMMUNITY_ABILITIES[defenderAbility] === moveType) {
    return {
      ok: true,
      moveName: move.name,
      moveType,
      category: move.cat,
      power,
      effectiveness: 0,
      effText: '特性免疫',
      damageMin: 0,
      damageMax: 0,
      percentMin: 0,
      percentMax: 0,
      koChance: 0,
      hits: '—',
      notes: notes.concat('目标特性免疫该属性')
    }
  }
  if (defenderItem === 'air-balloon' && moveType === 'ground') {
    return {
      ok: true,
      moveName: move.name,
      moveType,
      category: move.cat,
      power,
      effectiveness: 0,
      effText: '气球免疫',
      damageMin: 0,
      damageMax: 0,
      percentMin: 0,
      percentMax: 0,
      koChance: 0,
      hits: '—',
      notes: notes.concat('目标携带气球')
    }
  }
  if (defenderAbility === 'wonder-guard' && effectiveness <= 1) mods = 0
  if (defenderAbility === 'bulletproof' && hasTrait(move, 'ball-bomb')) mods = 0
  if (defenderAbility === 'soundproof' && hasTrait(move, 'sound')) mods = 0
  if (defenderAbility === 'overcoat' && hasTrait(move, 'powder')) mods = 0

  const hp = defenseStats.hp
  const rollDamage = (roll) => Math.max(1, Math.floor(base * mods * roll))
  const minRoll = 0.85
  const maxRoll = 1
  const damageMin = mods === 0 ? 0 : rollDamage(minRoll)
  const damageMax = mods === 0 ? 0 : rollDamage(maxRoll)

  let koCount = 0
  for (let i = 0; i < 16; i += 1) {
    const roll = minRoll + (i * (maxRoll - minRoll)) / 15
    if (rollDamage(roll) >= hp) koCount += 1
  }

  const effText = effectiveness === 4 ? '四倍效果绝佳'
    : effectiveness === 2 ? '效果绝佳'
      : effectiveness === 0.5 ? '效果不佳'
        : effectiveness === 0.25 ? '效果非常不佳'
          : '效果一般'

  return {
    ok: true,
    moveName: move.name,
    moveType,
    category: move.cat,
    power: Math.round(power * 10) / 10,
    effectiveness,
    effText,
    damageMin,
    damageMax,
    percentMin: Math.round((damageMin / hp) * 1000) / 10,
    percentMax: Math.round((damageMax / hp) * 1000) / 10,
    koChance: Math.round((koCount / 16) * 100),
    hits: damageMax > 0 ? Math.ceil(hp / damageMax) : '—',
    notes
  }
}

module.exports = {
  calcDamage,
  stageMultiplier,
  TYPE_BOOST_ITEMS
}

