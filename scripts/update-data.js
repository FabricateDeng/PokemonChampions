#!/usr/bin/env node
/**
 * 数据更新工具（唯一入口）
 *
 *   node scripts/update-data.js status                 查看当前数据版本 / 是否过期
 *   node scripts/update-data.js usage                  拉 Smogon 最新月份，更新单打使用率
 *   node scripts/update-data.js usage --dry-run        只算不写，看差异
 *   node scripts/update-data.js usage --doubles smogon 双打也用 Smogon VGC 数据
 *   node scripts/update-data.js usage --month 2026-10 --cutoff 1760
 *   node scripts/update-data.js pokedex                OP.GG 图鉴 / 招式 / 特性
 *   node scripts/update-data.js pokedex --dry-run      只看差异
 *   node scripts/update-data.js pokedex --names        同时接受官方中文名（默认保留现有译名）
 *   node scripts/update-data.js pokedex --sprites      下载缺失的精灵图
 *   node scripts/update-data.js check                  校验数据自洽
 *   node scripts/update-data.js publish --out dist/usage.json
 *                                                      生成远程热更新包
 *   node scripts/update-data.js selftest               校验写出格式与现有文件一致
 */
const fs = require('fs')
const path = require('path')

const http = require('./lib/http')
const smogon = require('./lib/smogon')
const opgg = require('./lib/opgg')
const nameUtil = require('./lib/names')
const emit = require('./lib/emit')
const pokedexData = require('../data/pokedex.js')
const usageData = require('../data/usage.js')
const itemsData = require('../data/items.js')
const { TYPES: TYPE_MAP } = pokedexData
const NATURES = require('../utils/natures.js').NATURES

const ROOT = emit.ROOT
const today = () => new Date().toISOString().slice(0, 10)

/* ------------------------------------------------------------------ 参数 */

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        args[key] = next
        i += 1
      } else {
        args[key] = true
      }
    } else {
      args._.push(a)
    }
  }
  return args
}

function log(...parts) {
  console.log(parts.join(' '))
}

function pct(n) {
  return (Math.round(n * 100) / 100).toFixed(2) + '%'
}

/* ------------------------------------------------------------------ 查表 */

function buildLookups(pokedex, items) {
  const abilityBySquash = new Map()
  Object.keys(pokedex.ABILITIES).forEach((k) => abilityBySquash.set(nameUtil.squash(k), pokedex.ABILITIES[k].name))
  const moveBySquash = new Map()
  Object.keys(pokedex.MOVES).forEach((k) => moveBySquash.set(nameUtil.squash(k), pokedex.MOVES[k].name))
  const itemBySquash = new Map()
  items.ITEMS.forEach((i) => itemBySquash.set(nameUtil.squash(i.key), i.name))
  const natureByKey = new Map()
  NATURES.forEach((n) => natureByKey.set(nameUtil.squash(n.key), n.name))

  const knownKeys = new Set(pokedex.POKEMON.map((p) => p.key))
  return {
    abilityBySquash: (s) => abilityBySquash.get(s) || null,
    moveBySquash: (s) => moveBySquash.get(s) || null,
    itemBySquash: (s) => itemBySquash.get(s) || null,
    natureByKey: (s) => natureByKey.get(s) || null,
    resolveName: (name) => nameUtil.resolve(name, knownKeys)
  }
}

/* ------------------------------------------------------------------ status */

async function cmdStatus() {
  const p = pokedexData
  const u = usageData
  const todayStr = today()
  const age = (d) => {
    if (!d) return '—'
    const diff = Math.round((Date.parse(todayStr) - Date.parse(d)) / 86400000)
    return diff <= 0 ? '今天' : `${diff} 天前`
  }

  log('\n=== 图鉴数据 data/pokedex.js ===')
  log(`  收录        ${p.META.count} 只（超级进化 ${p.META.megaCount}）`)
  log(`  招式 / 特性  ${p.META.moveCount} / ${p.META.abilityCount}`)
  log(`  规则        ${(p.META.regulations || []).join(' / ')}`)
  log(`  更新日期    ${p.META.updated}（${age(p.META.updated)}）`)

  const spriteDir = path.join(ROOT, 'assets', 'sprites')
  const missingSprite = p.POKEMON.filter((m) => !fs.existsSync(path.join(spriteDir, path.basename(m.sprite))))
  log(`  精灵图      ${p.singles ? '' : ''}${p.POKEMON.length - missingSprite.length}/${p.POKEMON.length} 已就位${missingSprite.length ? `，缺 ${missingSprite.length} 张` : ''}`)

  log('\n=== 使用率 data/usage.js ===')
  log(`  版本        ${u.VERSION}`)
  log(`  更新日期    ${u.META.updated}（${age(u.META.updated)}）`)
  const s = u.META.singles || {}
  const d = u.META.doubles || {}
  log(`  单打        ${s.source} · ${s.format} · ${s.month} · ${s.cutoff} 分位 · ${(s.battles || 0).toLocaleString('en-US')} 场`)
  log(`  双打        ${d.source} · 规则 ${d.regulation} · ${d.from} ~ ${d.to} · ${d.tournaments} 项赛事`)
  log(`  覆盖        ${Object.keys(u.USAGE).length} 只（${p.META.count - Object.keys(u.USAGE).length} 只标注未上榜）`)

  log('\n=== 新鲜度 ===')
  const now = new Date()
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`
  if (s.month === prevStr || s.month === curMonth) {
    log(`  ✓ 单打使用率已是可用的最新月份（${s.month}）`)
  } else {
    log(`  ! 单打使用率停留在 ${s.month}，Smogon 通常每月初发布上月数据，可运行：node scripts/update-data.js usage`)
  }
  log('  提示：Smogon 每月初发布上月数据；图鉴随游戏版本更新。')
  log('')
}

/* ------------------------------------------------------------------ usage */

function pickBlock(b, format) {
  const out = { rank: b.rank, usage: b.usage }
  if (format === 'doubles') {
    // Limitless 来源才有胜率/队伍数；Smogon VGC 没有，字段缺省由 UI 兜底
    if (b.winRate !== undefined) out.winRate = b.winRate
    if (b.teams !== undefined) out.teams = b.teams
  }
  out.raw = b.raw
  out.abilities = b.abilities
  out.items = b.items
  out.moves = b.moves
  out.natures = b.natures
  out.spreads = b.spreads
  return out
}

async function cmdUsage(args) {
  const lk = buildLookups(pokedexData, itemsData)
  const projectKeys = new Set(pokedexData.POKEMON.map((p) => p.key))
  const month = args.month || (await smogon.latestMonth())
  if (!month) throw new Error('拿不到 Smogon 月份列表')
  const cutoff = Number(args.cutoff || (usageData.META.singles || {}).cutoff || 1760)
  const singlesFormat = args['singles-format'] || (usageData.META.singles || {}).format || 'gen9championsbssregmc'

  log(`\n拉取 Smogon 单打：${month} / ${singlesFormat} / ${cutoff}`)
  const s = await smogon.fetchChaos(month, singlesFormat, cutoff, { refresh: args.refresh })
  const singles = smogon.parseChaos(s.chaos, Object.assign({ format: singlesFormat, month, cutoff }, lk))
  log(`  解析到 ${Object.keys(singles.blocks).length} 只，对战 ${singles.battles.toLocaleString('en-US')} 场`)
  reportMissing('单打', singles.missing, projectKeys)

  let doubles = null
  let doublesMeta = (usageData.META && usageData.META.doubles) || {}
  if (args.doubles === 'smogon') {
    const dFormat = args['doubles-format'] || 'gen9championsvgc2026regmc'
    log(`拉取 Smogon 双打：${month} / ${dFormat} / ${cutoff}`)
    const d = await smogon.fetchChaos(month, dFormat, cutoff, { refresh: args.refresh })
    doubles = smogon.parseChaos(d.chaos, Object.assign({ format: dFormat, month, cutoff }, lk))
    log(`  解析到 ${Object.keys(doubles.blocks).length} 只`)
    reportMissing('双打', doubles.missing, projectKeys)
    const reg = /reg([a-z]+)/i.exec(dFormat)
    doublesMeta = {
      label: '双打',
      source: 'Smogon',
      regulation: reg ? 'M-' + reg[1].toUpperCase() : (doublesMeta.regulation || ''),
      from: `${month}-01`,
      to: endOfMonth(month),
      tournaments: doubles.battles,
      note: `Smogon VGC · ${month} · ${doubles.battles.toLocaleString('en-US')} 场`
    }
  } else {
    log('双打：沿用现有数据（如需改用 Smogon VGC，加 --doubles smogon）')
  }

  const topN = (blocks, n) => Object.keys(blocks)
    .sort((a, b) => blocks[b].usage - blocks[a].usage)
    .slice(0, n)

  const singlesTop = topN(singles.blocks, 50)
  const doublesTopRanked = (usageData.RANKINGS && usageData.RANKINGS.doubles) || []
  const doublesTop = doubles ? topN(doubles.blocks, 50) : doublesTopRanked.map((r) => r.key)

  const rankings = {
    singles: singlesTop.map((key, i) => ({
      key,
      rank: i + 1,
      usage: singles.blocks[key].usage,
      raw: singles.blocks[key].raw,
      real: Math.round((singles.blocks[key].raw * singles.blocks[key].usage) / 100)
    })),
    doubles: doubles
      ? doublesTop.map((key, i) => ({
        key,
        rank: i + 1,
        usage: doubles.blocks[key].usage,
        raw: doubles.blocks[key].raw,
        real: Math.round((doubles.blocks[key].raw * doubles.blocks[key].usage) / 100)
      }))
      : doublesTopRanked
  }

  const union = Array.from(new Set([].concat(singlesTop, doublesTop)))
  const usage = {}
  union.forEach((key) => {
    const entry = {}
    if (singles.blocks[key]) entry.s = pickBlock(singles.blocks[key], 'singles')
    // 沿用旧双打数据时原样保留（含 Limitless 的 teams / winRate）
    const dBlock = doubles ? (doubles.blocks[key] && pickBlock(doubles.blocks[key], 'doubles')) : (usageData.USAGE[key] && usageData.USAGE[key].d)
    if (dBlock) entry.d = dBlock
    if (entry.s || entry.d) usage[key] = entry
  })

  const meta = {
    updated: today(),
    singles: {
      label: '单打',
      source: 'Smogon',
      format: singlesFormat,
      month,
      cutoff,
      battles: singles.battles,
      note: `Smogon Champions BSS · ${cutoff} 分位`
    },
    doubles: doublesMeta
  }

  const version = args.version || `${today()}.1`
  const next = { version, meta, rankings, usage }

  reportUsageDiff(usageData, next)
  if (args['dry-run']) {
    log('\n[dry-run] 未写入 data/usage.js')
    return
  }
  const size = emit.writeUsage(next)
  log(`\n✓ 已写入 data/usage.js（${(size / 1024).toFixed(0)} KB）`)
  log('  下一步：node scripts/validate.js && node scripts/smoke.js，然后在开发者工具里预览')
}

function endOfMonth(month) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 0)
  return d.toISOString().slice(0, 10)
}

function reportMissing(label, missing, projectKeys) {
  if (missing.mons.length) {
    log(`  ! ${label}有 ${missing.mons.length} 只没匹配到图鉴 key：${missing.mons.slice(0, 8).join(', ')}${missing.mons.length > 8 ? ' …' : ''}`)
    log('    可在 scripts/lib/names.js 的 OVERRIDES 里补映射')
  }
  const buckets = ['abilities', 'moves', 'items', 'natures']
  buckets.forEach((b) => {
    const list = missing[b]
    if (list && list.length) log(`  ! 未识别的${b}（${list.length}）：${list.slice(0, 6).join(', ')}${list.length > 6 ? ' …' : ''}`)
  })
}

function reportUsageDiff(prev, next) {
  const prevS = (prev.RANKINGS && prev.RANKINGS.singles) || []
  const nextS = next.rankings.singles
  log('\n=== 单打变化 ===')
  log(`  榜首  ${prevS[0] ? prevS[0].key + ' ' + pct(prevS[0].usage) : '—'}  →  ${nextS[0] ? nextS[0].key + ' ' + pct(nextS[0].usage) : '—'}`)
  log(`  样本  ${((prev.META.singles || {}).battles || 0).toLocaleString('en-US')}  →  ${next.meta.singles.battles.toLocaleString('en-US')}`)

  const prevCover = Object.keys(prev.USAGE || {})
  const nextCover = Object.keys(next.usage)
  const added = nextCover.filter((k) => prevCover.indexOf(k) < 0)
  const removed = prevCover.filter((k) => nextCover.indexOf(k) < 0)
  if (added.length) log(`  新进覆盖：${added.join(', ')}`)
  if (removed.length) log(`  退出覆盖：${removed.join(', ')}`)

  const prevMap = {}
  prevS.forEach((r) => {
    prevMap[r.key] = r.usage
  })
  const moves = nextS
    .filter((r) => prevMap[r.key] !== undefined)
    .map((r) => ({ key: r.key, delta: r.usage - prevMap[r.key] }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5)
  if (moves.length) {
    log('  使用率变化最大：')
    moves.forEach((m) => log(`    ${m.key.padEnd(22)} ${m.delta > 0 ? '+' : ''}${m.delta.toFixed(2)}pp`))
  }
}

/* ------------------------------------------------------------------ pokedex */

const FORM_RULES = [
  { test: (k) => /^mega-/.test(k), form: 'mega', formLabel: 'MEGA', tags: ['MEGA'], order: 3 },
  { test: (k) => /-(alolan|galarian|hisuian|paldean)$/.test(k), form: 'regional', formLabel: '地区形态', tags: ['地区形态'], order: 1 },
  { test: () => false, form: 'special', formLabel: '特殊形态', tags: ['特殊形态'], order: 2 },
  { test: () => true, form: 'base', formLabel: '', tags: [], order: 0 }
]

function deriveForm(key, hasBase) {
  if (/^mega-/.test(key)) return FORM_RULES[0]
  if (/-(alolan|galarian|hisuian|paldean)$/.test(key)) return FORM_RULES[1]
  if (hasBase) return FORM_RULES[2]
  return FORM_RULES[3]
}

function genderOnlyVariants(live) {
  const byId = {}
  live.forEach((m) => {
    byId[m.id] = byId[m.id] || []
    byId[m.id].push(m)
  })
  const result = new Set()
  Object.keys(byId).forEach((id) => {
    const group = byId[id]
    group.forEach((m) => {
      if (!/-(female|male)$/.test(m.key)) return
      const sibling = group.find((x) => x !== m && !/-(female|male)$/.test(x.key))
      if (!sibling) return
      const sameStats = JSON.stringify(m.stats) === JSON.stringify(sibling.stats)
      const sameTypes = JSON.stringify(m.types) === JSON.stringify(sibling.types)
      const sameAbilities = JSON.stringify(m.abilities) === JSON.stringify(sibling.abilities)
      if (sameStats && sameTypes && sameAbilities) result.add(m.key)
    })
  })
  return result
}

async function cmdPokedex(args) {
  log('\n拉取 OP.GG：/pokedex /moves /abilities /items')
  const [liveMons, liveMoves, liveAbilities, liveItems] = await Promise.all([
    opgg.fetchPokemon({ refresh: args.refresh }),
    opgg.fetchMoves({ refresh: args.refresh }),
    opgg.fetchAbilities({ refresh: args.refresh }),
    opgg.fetchItems({ refresh: args.refresh })
  ])
  log(`  宝可梦 ${liveMons.length} / 招式 ${liveMoves.length} / 特性 ${liveAbilities.length} / 道具 ${liveItems.length}`)

  const existing = pokedexData
  const existingByKey = {}
  existing.POKEMON.forEach((p) => {
    existingByKey[p.key] = p
  })

  const skip = args['include-gender-forms'] ? new Set() : genderOnlyVariants(liveMons)
  const kept = liveMons.filter((m) => !skip.has(m.key))
  if (skip.size) log(`  跳过 ${skip.size} 个性别差异形态（能力值完全相同）：${Array.from(skip).join(', ')}`)

  const missingBase = []
  const pokemon = kept.map((m) => {
    const old = existingByKey[m.key]
    // dex：有基础形态就用基础形态的图鉴号，否则用自己的 id
    let dex = old ? old.dex : 0
    if (!dex) {
      if (m.baseKey && existingByKey[m.baseKey]) dex = existingByKey[m.baseKey].dex
      else if (m.id > 10000) {
        const base = kept.find((x) => x.id === m.id - 10000)
        dex = base ? dexOf(base) : m.id
        if (!base) missingBase.push(m.key)
      } else dex = m.id
    }
    const form = old ? old.form : deriveForm(m.key, !!m.baseKey).form
    const rule = old ? null : deriveForm(m.key, !!m.baseKey)
    return {
      id: m.id,
      key: m.key,
      dex: dex || m.id,
      name: args.names ? m.name : (old ? old.name : m.name),
      gen: m.gen,
      types: m.types,
      stats: m.stats,
      total: m.stats.reduce((a, b) => a + b, 0),
      abilities: m.abilities,
      moves: m.moves,
      reg: m.reg,
      form,
      formLabel: old ? old.formLabel : rule.formLabel,
      tags: old ? old.tags : rule.tags,
      sprite: old ? old.sprite : `/assets/sprites/${m.id}.png`,
      order: old ? old.order : rule.order
    }
  })

  pokemon.sort((a, b) => a.dex - b.dex || a.order - b.order || a.id - b.id)

  // 字典：以「被引用」为准（与原文件生成方式一致），缺失的用 OP.GG 补
  const moveRefs = new Set()
  const abilityRefs = new Set()
  pokemon.forEach((p) => {
    p.moves.forEach((k) => moveRefs.add(k))
    p.abilities.forEach((k) => abilityRefs.add(k))
  })

  const liveMoveByKey = {}
  liveMoves.forEach((m) => {
    liveMoveByKey[m.key] = m
  })
  const liveAbilityByKey = {}
  liveAbilities.forEach((a) => {
    liveAbilityByKey[a.key] = a
  })

  const moves = {}
  const newMoves = []
  Array.from(moveRefs).sort().forEach((key) => {
    if (existing.MOVES[key]) {
      moves[key] = existing.MOVES[key]
      return
    }
    const src = liveMoveByKey[key]
    if (!src) return
    newMoves.push(key)
    moves[key] = {
      name: src.name,
      type: src.type,
      cat: src.cat,
      power: src.power,
      acc: src.acc,
      pp: src.pp,
      desc: src.desc,
      priority: src.priority,
      traits: traitsOf(src)
    }
  })

  const abilities = {}
  const newAbilities = []
  Array.from(abilityRefs).sort().forEach((key) => {
    if (existing.ABILITIES[key]) {
      abilities[key] = existing.ABILITIES[key]
      return
    }
    const src = liveAbilityByKey[key]
    if (!src) return
    newAbilities.push(key)
    abilities[key] = { name: src.name, desc: src.desc }
  })

  const learnCount = {}
  pokemon.forEach((p) => {
    p.moves.forEach((k) => {
      learnCount[k] = (learnCount[k] || 0) + 1
    })
  })

  const regulations = Array.from(new Set(pokemon.map((p) => p.reg).filter(Boolean))).sort()
  const meta = {
    count: pokemon.length,
    megaCount: pokemon.filter((p) => p.form === 'mega').length,
    moveCount: Object.keys(moves).length,
    abilityCount: Object.keys(abilities).length,
    typeCount: Object.keys(TYPE_MAP).length,
    genCount: new Set(pokemon.map((p) => p.gen)).size,
    updated: today(),
    regulations
  }

  // ---- 差异报告
  const oldByKey = existingByKey
  const newKeys = pokemon.filter((p) => !oldByKey[p.key]).map((p) => p.key)
  const goneKeys = Object.keys(oldByKey).filter((k) => !pokemon.some((p) => p.key === k))
  const changed = []
  pokemon.forEach((p) => {
    const o = oldByKey[p.key]
    if (!o) return
    const fields = []
    if (JSON.stringify(o.stats) !== JSON.stringify(p.stats)) fields.push('stats')
    if (JSON.stringify(o.types) !== JSON.stringify(p.types)) fields.push('types')
    if (o.reg !== p.reg) fields.push('reg:' + o.reg + '→' + p.reg)
    if (JSON.stringify(o.abilities) !== JSON.stringify(p.abilities)) fields.push('abilities')
    if (JSON.stringify(o.moves) !== JSON.stringify(p.moves)) {
      const add = p.moves.filter((m) => o.moves.indexOf(m) < 0)
      const del = o.moves.filter((m) => p.moves.indexOf(m) < 0)
      fields.push(`moves(${o.moves.length}→${p.moves.length}${add.length ? ' +' + add.join('/') : ''}${del.length ? ' -' + del.join('/') : ''})`)
    }
    if (fields.length) changed.push(`${p.key}: ${fields.join(', ')}`)
  })

  log('\n=== 图鉴差异 ===')
  log(`  数量      ${existing.META.count} → ${pokemon.length}`)
  log(`  规则      ${(existing.META.regulations || []).join('/')} → ${regulations.join('/')}`)
  log(`  招式/特性 ${existing.META.moveCount}/${existing.META.abilityCount} → ${meta.moveCount}/${meta.abilityCount}`)
  if (newKeys.length) log(`  新增：${newKeys.join(', ')}`)
  if (goneKeys.length) log(`  移除：${goneKeys.join(', ')}`)
  if (newMoves.length) log(`  新招式 ${newMoves.length} 个：${newMoves.slice(0, 10).join(', ')}${newMoves.length > 10 ? ' …' : ''}`)
  if (newAbilities.length) log(`  新特性 ${newAbilities.length} 个：${newAbilities.slice(0, 10).join(', ')}`)
  log(`  字段变化 ${changed.length} 只`)
  changed.slice(0, 15).forEach((c) => log('    ' + c))
  if (changed.length > 15) log(`    … 其余 ${changed.length - 15} 只`)

  // 新增宝可梦缺图
  const spriteDir = path.join(ROOT, 'assets', 'sprites')
  const missingSprites = pokemon.filter((p) => !fs.existsSync(path.join(spriteDir, path.basename(p.sprite))))
  if (missingSprites.length) {
    log(`\n  缺精灵图 ${missingSprites.length} 张：${missingSprites.slice(0, 8).map((p) => p.sprite).join(', ')}`)
    if (args.sprites) {
      log('  开始下载…')
      for (const m of missingSprites) {
        const url = `https://s-stats-platform-cdn.op.gg/pokemon/images/pokemon/${m.id}.png`
        try {
          const buf = await http.binary(url)
          fs.writeFileSync(path.join(spriteDir, path.basename(m.sprite)), buf)
          log(`    ✓ ${m.key} → ${path.basename(m.sprite)} (${(buf.length / 1024).toFixed(0)} KB)`)
        } catch (e) {
          log(`    ✗ ${m.key}: ${e.message}`)
        }
      }
    } else {
      log('  加 --sprites 可自动下载')
    }
  }

  // 道具（可选）
  let items = null
  if (args.items) {
    const liveItemsByKey = {}
    liveItems.forEach((i) => {
      liveItemsByKey[i.key] = i
    })
    const keepKeys = new Set(existing.ITEMS.map((i) => i.key))
    liveItems.forEach((i) => {
      if (regulations.indexOf(i.regulation) >= 0) keepKeys.add(i.key)
    })
    items = Array.from(keepKeys)
      .filter((k) => liveItemsByKey[k] || existing.ITEMS.some((x) => x.key === k))
      .sort()
      .map((k) => {
        const live = liveItemsByKey[k]
        const old = existing.ITEMS.find((x) => x.key === k)
        return { key: k, name: live ? live.name : old.name, category: live ? live.category : old.category }
      })
    log(`\n  道具 ${existing.ITEMS.length} → ${items.length}`)
  }

  if (args['dry-run']) {
    log('\n[dry-run] 未写入文件')
    return
  }

  const size = emit.writePokedex({
    types: existing.TYPES,
    abilities,
    moves,
    pokemon,
    meta,
    learnCount
  })
  log(`\n✓ 已写入 data/pokedex.js（${(size / 1024).toFixed(0)} KB）`)
  if (items) {
    emit.writeItems(items)
    log(`✓ 已写入 data/items.js（${items.length} 项）`)
  }
  log('  提示：pokedex 变大后注意主包体积；改完务必跑 node scripts/validate.js')
}

function dexOf(m) {
  return m.id > 10000 ? m.id : m.id
}

function traitsOf(src) {
  const traits = []
  const flags = src.flags
  if (flags) {
    const list = Array.isArray(flags) ? flags : Object.keys(flags).filter((k) => flags[k])
    const map = {
      contact: 'contact',
      punch: 'punch',
      bite: 'bite',
      sound: 'sound',
      slicing: 'slicing',
      pulse: 'pulse',
      wind: 'wind',
      dance: 'dance',
      powder: 'powder',
      bullet: 'ball-bomb',
      ballistics: 'ball-bomb',
      minimize: 'minimize',
      gravity: 'gravity'
    }
    list.forEach((f) => {
      const t = map[String(f).toLowerCase()]
      if (t) traits.push(t)
    })
  }
  if (!traits.length) traits.push(src.target === 'user' ? 'non-contact' : 'non-contact')
  if (traits.indexOf('contact') < 0 && traits.indexOf('non-contact') < 0) traits.unshift('non-contact')
  return traits
}

/* ------------------------------------------------------------------ check */

function cmdCheck() {
  const problems = []
  const p = pokedexData
  const u = usageData
  const items = itemsData.ITEMS

  const keys = new Set()
  p.POKEMON.forEach((m) => {
    if (keys.has(m.key)) problems.push(`重复 key: ${m.key}`)
    keys.add(m.key)
    if (typeof m.dex !== 'number' || m.dex <= 0) problems.push(`${m.key}: dex 非法`)
    if (!Array.isArray(m.stats) || m.stats.length !== 6) problems.push(`${m.key}: stats 不是 6 项`)
    const total = (m.stats || []).reduce((a, b) => a + b, 0)
    if (total !== m.total) problems.push(`${m.key}: total ${m.total} ≠ ${total}`)
    ;(m.moves || []).forEach((k) => {
      if (!p.MOVES[k]) problems.push(`${m.key}: 引用了不存在的招式 ${k}`)
    })
    ;(m.abilities || []).forEach((k) => {
      if (!p.ABILITIES[k]) problems.push(`${m.key}: 引用了不存在的特性 ${k}`)
    })
    ;(m.types || []).forEach((t) => {
      if (!p.TYPES[t]) problems.push(`${m.key}: 未知属性 ${t}`)
    })
    if (!fs.existsSync(path.join(ROOT, 'assets', 'sprites', path.basename(m.sprite)))) {
      problems.push(`${m.key}: 缺少精灵图 ${m.sprite}`)
    }
  })

  if (p.META.count !== p.POKEMON.length) problems.push(`META.count ${p.META.count} ≠ ${p.POKEMON.length}`)
  if (p.META.moveCount !== Object.keys(p.MOVES).length) problems.push('META.moveCount 与实际不符')
  if (p.META.abilityCount !== Object.keys(p.ABILITIES).length) problems.push('META.abilityCount 与实际不符')
  if (p.META.megaCount !== p.POKEMON.filter((m) => m.form === 'mega').length) problems.push('META.megaCount 与实际不符')

  Object.keys(p.LEARN_COUNT).forEach((k) => {
    if (!p.MOVES[k]) problems.push(`LEARN_COUNT 含未定义招式 ${k}`)
  })

  Object.keys(u.USAGE).forEach((k) => {
    if (!keys.has(k)) problems.push(`usage 引用了不存在的宝可梦 ${k}`)
    const entry = u.USAGE[k]
    ;['s', 'd'].forEach((f) => {
      const block = entry[f]
      if (!block) return
      if (!(block.usage >= 0 && block.usage <= 100)) problems.push(`${k}.${f}: usage 越界`)
      ;(block.abilities || []).forEach(([name, p2]) => {
        if (typeof name !== 'string' || !name) problems.push(`${k}.${f}: 特性名为空`)
        if (!(p2 >= 0 && p2 <= 100)) problems.push(`${k}.${f}: ${name} 百分比越界`)
      })
    })
  })

  ;['singles', 'doubles'].forEach((f) => {
    ;((u.RANKINGS && u.RANKINGS[f]) || []).forEach((row) => {
      if (!keys.has(row.key)) problems.push(`RANKINGS.${f} 含未知 key ${row.key}`)
    })
  })

  const itemKeys = new Set()
  items.forEach((i) => {
    if (itemKeys.has(i.key)) problems.push(`重复道具 key: ${i.key}`)
    itemKeys.add(i.key)
  })

  if (problems.length) {
    log(`\n✗ 数据自检发现 ${problems.length} 个问题：`)
    problems.slice(0, 40).forEach((x) => log('  · ' + x))
    if (problems.length > 40) log(`  … 其余 ${problems.length - 40} 个`)
    process.exitCode = 1
    return
  }
  log(`\n✓ 数据自检通过：${p.POKEMON.length} 只宝可梦 · ${Object.keys(p.MOVES).length} 招式 · ${items.length} 道具 · 使用率覆盖 ${Object.keys(u.USAGE).length} 只`)
}

/* ------------------------------------------------------------------ publish */

function cmdPublish(args) {
  const out = args.out || path.join('dist', 'usage.json')
  const payload = {
    version: args.version || `${today()}.1`,
    data: {
      META: usageData.META,
      RANKINGS: usageData.RANKINGS,
      USAGE: usageData.USAGE
    }
  }
  const file = path.join(ROOT, out)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8')
  const size = fs.statSync(file).size

  log(`\n✓ 已生成 ${out}（${(size / 1024).toFixed(0)} KB，version=${payload.version}）`)
  log('\n使用方式：')
  log('  1. 把该文件上传到任意 HTTPS 静态托管（对象存储 / CDN / GitHub Pages 均可）')
  log('  2. 在微信公众平台 → 开发设置 → 服务器域名 → request 合法域名，加入该域名')
  log('  3. 把 config.js 里的 usageRemote.url 改成这个文件的地址，重新发布一次即可')
  log('  4. 之后每次只更新这个 JSON，小程序启动就会自动拉到新数据（无需重新提审）')
}

/* ------------------------------------------------------------------ selftest */

function cmdSelftest() {
  // 用现有数据回写一遍，确认格式与仓库里的文件完全一致
  const p = pokedexData
  const u = usageData
  const items = itemsData.ITEMS

  const original = {
    'data/pokedex.js': fs.readFileSync(path.join(ROOT, 'data/pokedex.js'), 'utf8'),
    'data/usage.js': fs.readFileSync(path.join(ROOT, 'data/usage.js'), 'utf8'),
    'data/items.js': fs.readFileSync(path.join(ROOT, 'data/items.js'), 'utf8')
  }

  const out = {
    'data/pokedex.js': emit.build('data/pokedex.js', emit.pokedexConsts({
      types: p.TYPES,
      abilities: p.ABILITIES,
      moves: p.MOVES,
      pokemon: p.POKEMON,
      meta: p.META,
      learnCount: p.LEARN_COUNT
    })),
    'data/usage.js': emit.build('data/usage.js', emit.usageConsts({
      version: u.VERSION,
      meta: u.META,
      rankings: u.RANKINGS,
      usage: u.USAGE
    })),
    'data/items.js': emit.build('data/items.js', emit.itemsConsts(items))
  }

  let failed = 0
  Object.keys(original).forEach((rel) => {
    const byteSame = stripHeader(original[rel]) === stripHeader(out[rel])
    if (byteSame) {
      log(`✓ ${rel}（首行说明除外）与仓库文件逐字节一致`)
      return
    }
    // 数值格式可能不同（JSON 里 2.0 与 2 等价），退一步做语义比对
    const semanticSame = semanticEqual(original[rel], out[rel])
    if (semanticSame) {
      log(`✓ ${rel} 语义一致（仅数值写法差异，如 2.0 ↔ 2）`)
      return
    }
    failed += 1
    log(`✗ ${rel} 格式不一致`)
    const a = stripHeader(original[rel]).split('\n')
    const b = stripHeader(out[rel]).split('\n')
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i] !== b[i]) {
        log(`   第一个差异在第 ${i + 1} 行：`)
        log('   现有: ' + String(a[i] || '').slice(0, 160))
        log('   生成: ' + String(b[i] || '').slice(0, 160))
        break
      }
    }
  })
  if (failed) process.exitCode = 1
}

function semanticEqual(textA, textB) {
  const parse = (text) => {
    const out = {}
    const re = /^const ([A-Z_]+) = ([^]*?);\r?$/gm
    let m
    while ((m = re.exec(String(text).replace(/\r\n/g, '\n')))) {
      try {
        out[m[1]] = JSON.parse(m[2])
      } catch (e) {
        out[m[1]] = null
      }
    }
    return out
  }
  const a = parse(textA)
  const b = parse(textB)
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))
}

function stripHeader(text) {
  // 首行是生成说明，允许随数据源变化；其余内容逐字节比对
  const normalized = String(text).replace(/\r\n/g, '\n')
  const idx = normalized.indexOf('\n')
  return idx < 0 ? '' : normalized.slice(idx + 1)
}

/* ------------------------------------------------------------------ main */

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] || 'status'
  try {
    if (cmd === 'status') await cmdStatus(args)
    else if (cmd === 'usage') await cmdUsage(args)
    else if (cmd === 'pokedex') await cmdPokedex(args)
    else if (cmd === 'check') cmdCheck(args)
    else if (cmd === 'publish') cmdPublish(args)
    else if (cmd === 'selftest') cmdSelftest(args)
    else {
      log('未知命令：' + cmd)
      log('可用：status | usage | pokedex | check | publish | selftest')
      process.exitCode = 1
    }
  } catch (e) {
    log('\n✗ ' + (e && e.message ? e.message : e))
    if (process.env.DEBUG) console.error(e)
    process.exitCode = 1
  }
}

main()
