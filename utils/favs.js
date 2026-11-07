// Favourites live in one place so index / detail / profile never disagree.
const { POKEMON } = require('../data/pokedex.js')

const KEY = 'champion_favs'

const MON_BY_KEY = {}
POKEMON.forEach((p) => {
  MON_BY_KEY[p.key] = p
})

function list() {
  try {
    const raw = wx.getStorageSync(KEY)
    if (!Array.isArray(raw)) return []
    // 去重 + 过滤已下架数据，避免历史脏数据影响展示
    return Array.from(new Set(raw.filter((k) => typeof k === 'string' && MON_BY_KEY[k])))
  } catch (e) {
    return []
  }
}

function set(keys) {
  const safe = Array.from(new Set((keys || []).filter((k) => !!MON_BY_KEY[k])))
  try {
    wx.setStorageSync(KEY, safe)
  } catch (e) {
    // Storage failure must not break the UI; state stays in memory.
  }
  // 返回 Set，方便调用方直接更新页面内的 favSet（避免 array/Set 混用）。
  return new Set(safe)
}

function asSet() {
  return new Set(list())
}

function count() {
  return list().length
}

module.exports = { KEY, MON_BY_KEY, list, set, asSet, count }
