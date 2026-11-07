// Smogon 月度 chaos 数据 → 本项目 usage 结构。
//
// chaos 结构（2026 年数据实测）：
//   { info: { metagame, cutoff, number of battles },
//     data: { "Primarina": { usage: 0.3888, "Raw count": 45321,
//                            Abilities: {torrent: 203.0, liquidvoice: 10.5},
//                            Items: {...}, Moves: {...}, Spreads: {"Modest:32/0/0/32/2/0": 14.8} } } }
//
// 关键换算（已用现有数据反推校验）：
//   每个数据块里的数值是「加权计数」，同一只宝可梦所有特性的加权值之和 = 该宝可梦的总样本。
//   因此 百分比 = value / sum(Abilities values) * 100，特性百分比之和恰好 100%。

const http = require('./http')
const names = require('./names')

const STATS_BASE = 'https://www.smogon.com/stats'

// 低于该百分比的条目没有信息量（0.00% 不展示；0.01% 级保留）
const MIN_PCT = 0.005

function round2(n) {
  return Math.round(n * 100) / 100
}

function entriesOf(block) {
  if (!block) return []
  if (Array.isArray(block)) return block
  return Object.keys(block).map((k) => [k, block[k]])
}

function sortDesc(pairs) {
  return pairs.slice().sort((a, b) => b[1] - a[1])
}

async function latestMonth() {
  const html = await http.text(`${STATS_BASE}/`)
  const months = []
  const re = /href="(\d{4}-\d{2})\/"/g
  let m
  while ((m = re.exec(html))) months.push(m[1])
  const uniq = Array.from(new Set(months)).sort()
  return uniq.length ? uniq[uniq.length - 1] : null
}

/**
 * 解析一份 chaos JSON。
 * @param {object} chaos
 * @param {object} ctx  { format, month, cutoff, pokedex, resolveName(name) }
 */
function parseChaos(chaos, ctx) {
  const info = (chaos && chaos.info) || {}
  const data = (chaos && chaos.data) || {}
  const battles = info['number of battles'] || 0
  const cutoff = info.cutoff || ctx.cutoff || 0
  const format = info.metagame || ctx.format

  const abilityBySquash = ctx.abilityBySquash
  const moveBySquash = ctx.moveBySquash
  const itemBySquash = ctx.itemBySquash
  const natureByKey = ctx.natureByKey

  const missing = { mons: [], abilities: new Set(), moves: new Set(), items: new Set(), natures: new Set() }
  const blocks = {}

  Object.keys(data).forEach((displayName) => {
    const raw = data[displayName] || {}
    const key = ctx.resolveName(displayName)
    if (!key) {
      missing.mons.push(displayName)
      return
    }

    const abilityPairs = sortDesc(entriesOf(raw.Abilities))
    const total = abilityPairs.reduce((sum, [, v]) => sum + (Number(v) || 0), 0) || (Number(raw['Raw count']) || 1)
    const pct = (v) => Math.max(0, Math.min(100, round2(((Number(v) || 0) / total) * 100)))

    const named = (pairs, lookup) => {
      const out = []
      pairs.forEach(([name, value]) => {
        const hit = lookup(squash(name))
        if (!hit) {
          const bucket = lookup === abilityBySquash ? missing.abilities
            : lookup === moveBySquash ? missing.moves
              : missing.items
          bucket.add(name)
          return
        }
        const shown = pct(value)
        if (shown < MIN_PCT) return
        out.push([hit, shown])
      })
      return out
    }

    // 特性 / 道具
    const abilities = named(abilityPairs, abilityBySquash)
    const items = named(sortDesc(entriesOf(raw.Items)), itemBySquash)

    // 招式（携带率，可叠加）
    const moves = named(sortDesc(entriesOf(raw.Moves)), moveBySquash)

    // 性格：优先 Natures 字段，否则从 Spreads 前缀聚合
    const spreadPairs = sortDesc(entriesOf(raw.Spreads))
    let natures = []
    if (raw.Natures && entriesOf(raw.Natures).length) {
      natures = sortDesc(entriesOf(raw.Natures)).map(([name, value]) => {
        const n = natureByKey(squash(name))
        if (!n) missing.natures.add(name)
        const shown = pct(value)
        return n && shown >= MIN_PCT ? [n, shown] : null
      }).filter(Boolean)
    } else {
      const agg = {}
      spreadPairs.forEach(([spread, value]) => {
        const nature = String(spread).split(':')[0]
        agg[nature] = (agg[nature] || 0) + (Number(value) || 0)
      })
      natures = Object.keys(agg).map((name) => {
        const n = natureByKey(squash(name))
        if (!n) missing.natures.add(name)
        const shown = pct(agg[name])
        return n && shown >= MIN_PCT ? [n, shown] : null
      }).filter(Boolean).sort((a, b) => b[1] - a[1])
    }

    // 努力值分配： "Modest:32/0/0/32/2/0"
    const spreads = spreadPairs
      .map(([spread, value]) => {
        const m = /^([A-Za-z' -]+):(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/.exec(String(spread))
        if (!m) return null
        const natureName = natureByKey(squash(m[1]))
        if (!natureName) {
          missing.natures.add(m[1])
          return null
        }
        const shown = pct(value)
        if (shown < MIN_PCT) return null
        return {
          n: natureName,
          v: [m[2], m[3], m[4], m[5], m[6], m[7]].map((x) => parseInt(x, 10)),
          p: shown
        }
      })
      .filter(Boolean)
      .slice(0, 5)

    blocks[key] = {
      usage: round2((Number(raw.usage) || 0) * 100),
      raw: Number(raw['Raw count']) || 0,
      abilities,
      items: items.slice(0, 5),
      moves: moves.slice(0, 10),
      natures: natures.slice(0, 5),
      spreads
    }
  })

  // 排名
  const ordered = Object.keys(blocks).sort((a, b) => blocks[b].usage - blocks[a].usage)
  ordered.forEach((key, i) => {
    blocks[key].rank = i + 1
  })

  return {
    format,
    month: ctx.month,
    cutoff,
    battles,
    blocks,
    missing: {
      mons: missing.mons,
      abilities: Array.from(missing.abilities),
      moves: Array.from(missing.moves),
      items: Array.from(missing.items),
      natures: Array.from(missing.natures)
    }
  }
}

function squash(s) {
  return names.squash(s)
}

/**
 * 拉取并缓存 chaos JSON。同一份文件第二次读缓存，避免重复下载 2–3 MB。
 * @param {object} opts { refresh?: boolean, cacheDir?: string, timeoutMs?: number }
 */
async function fetchChaos(month, format, cutoff, opts) {
  const fs = require('fs')
  const path = require('path')
  const o = opts || {}
  const cacheDir = o.cacheDir || path.resolve(__dirname, '..', '..', '.cache', 'smogon')
  const cacheFile = path.join(cacheDir, `${month}-${format}-${cutoff}.json`)
  const url = `${STATS_BASE}/${month}/chaos/${format}-${cutoff}.json`

  if (!o.refresh && fs.existsSync(cacheFile)) {
    try {
      return { url, chaos: JSON.parse(fs.readFileSync(cacheFile, 'utf8')), cached: true }
    } catch (e) {
      // 缓存坏了就重新下载
    }
  }

  const chaos = await http.json(url, { timeoutMs: o.timeoutMs || 240000 })
  try {
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify(chaos), 'utf8')
  } catch (e) {
    // 缓存失败不影响主流程
  }
  return { url, chaos, cached: false }
}

module.exports = { latestMonth, fetchChaos, parseChaos, round2 }
