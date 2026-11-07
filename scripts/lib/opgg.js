// OP.GG《Pokémon Champions》图鉴抓取。
//
// 站点是 Next.js App Router，数据在 RSC 流里：self.__next_f.push([1,"<转义后的 JSON 片段>"])
// 把所有片段拼接、反转义后，可以按 "pokemon":[...] / "moves":[...] / "abilities":[...] / "items":[...]
// 提取到完整数组（已实测：352 只宝可梦 / 920 招式 / 314 特性 / 201 道具）。

const http = require('./http')

const BASE = 'https://op.gg/zh-cn/pokemon-champions'
const fs = require('fs')
const path = require('path')

// 页面动辄 2–9 MB，缓存到 .cache/opgg，第二次直接读本地
const CACHE_DIR = path.resolve(__dirname, '..', '..', '.cache', 'opgg')

function flightOf(html) {
  const chunks = []
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g
  let m
  while ((m = re.exec(html))) {
    try {
      chunks.push(JSON.parse(m[1]))
    } catch (e) {
      // 坏片段直接跳过，后续解析失败会更有意义
    }
  }
  return chunks.join('')
}

function arraysFor(flight, key) {
  const needle = `"${key}":[`
  const out = []
  let from = 0
  for (;;) {
    const at = flight.indexOf(needle, from)
    if (at < 0) break
    const start = flight.indexOf('[', at)
    let depth = 0
    let end = -1
    let inStr = false
    let esc = false
    for (let p = start; p < flight.length; p += 1) {
      const c = flight[p]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') inStr = true
      else if (c === '[') depth += 1
      else if (c === ']') {
        depth -= 1
        if (depth === 0) {
          end = p
          break
        }
      }
    }
    if (end < 0) break
    try {
      out.push(JSON.parse(flight.slice(start, end + 1)))
    } catch (e) {
      // 忽略无法解析的片段
    }
    from = end + 1
  }
  return out
}

async function pageHtml(pathname, opts) {
  const o = opts || {}
  const name = pathname.replace(/^\//, '') || 'index'
  const file = path.join(CACHE_DIR, `${name}.html`)
  if (!o.refresh && fs.existsSync(file)) {
    try {
      return { html: fs.readFileSync(file, 'utf8'), cached: true }
    } catch (e) {
      // 读不到就重新下载
    }
  }
  const html = await http.text(BASE + pathname, { timeoutMs: o.timeoutMs || 240000 })
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(file, html, 'utf8')
  } catch (e) {
    // 缓存失败不影响主流程
  }
  return { html, cached: false }
}

async function pageArray(pathname, key, opts) {
  const { html, cached } = await pageHtml(pathname, opts)
  const flight = flightOf(html)
  const candidates = arraysFor(flight, key).filter((a) => a && a.length)
  if (!candidates.length) {
    throw new Error(`${BASE}${pathname} 里没有找到 "${key}" 数组（页面结构可能变了）`)
  }
  // 取最长的那一个，避免命中嵌套的小数组
  const list = candidates.sort((a, b) => b.length - a.length)[0]
  list.cached = cached
  return list
}

async function fetchPokemon(opts) {
  const list = await pageArray('/pokedex', 'pokemon', opts)
  return list.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    gen: p.generation,
    types: p.types || [],
    abilities: p.abilities || [],
    stats: [
      p.stats && p.stats.hp,
      p.stats && p.stats.attack,
      p.stats && p.stats.defense,
      p.stats && p.stats.spAttack,
      p.stats && p.stats.spDefense,
      p.stats && p.stats.speed
    ].map((n) => Number(n) || 0),
    reg: p.regulation,
    moves: p.moves || [],
    bannedMoves: p.bannedMoves || [],
    baseKey: p.base_key || '',
    item: p.item || '',
    isNew: !!p.isNew
  }))
}

async function fetchMoves(opts) {
  const list = await pageArray('/moves', 'moves', opts)
  return list.map((m) => ({
    key: m.key,
    name: m.name,
    type: m.type,
    cat: m.category,
    power: m.power === null || m.power === undefined ? null : Number(m.power),
    acc: m.accuracy === null || m.accuracy === undefined ? null : Number(m.accuracy),
    pp: Number(m.pp) || 0,
    desc: m.effect || m.description || '',
    priority: Number(m.priority) || 0,
    available: !!m.isAvailable,
    flags: m.flags || null,
    target: m.target || ''
  }))
}

async function fetchAbilities(opts) {
  const list = await pageArray('/abilities', 'abilities', opts)
  return list.map((a) => ({
    key: a.key,
    name: a.name,
    desc: a.description || a.effect || '',
    regulation: a.regulation || ''
  }))
}

async function fetchItems(opts) {
  const list = await pageArray('/items', 'items', opts)
  return list.map((i) => ({
    key: i.key,
    name: i.name,
    category: i.category || 'hold-items',
    desc: i.effect || '',
    regulation: i.regulation || ''
  }))
}

module.exports = { fetchPokemon, fetchMoves, fetchAbilities, fetchItems, flightOf, arraysFor }
