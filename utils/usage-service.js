const bundled = require('../data/usage.js')
const config = require('../config.js')
const versionUtil = require('./version.js')

const CACHE_KEY = 'champion_usage_remote_v1'
const listeners = []

let current = {
  META: bundled.META,
  RANKINGS: bundled.RANKINGS,
  USAGE: bundled.USAGE,
  VERSION: bundled.VERSION || ''
}
let hydrated = false
let cachedAt = 0
// 'bundled' 内置 | 'cache' 本地缓存 | 'remote' 远程刚拉到
let sourceKind = 'bundled'

const compareVersion = versionUtil.compareVersion

function isValidPayload(data) {
  return !!(
    data &&
    data.META &&
    data.META.singles &&
    data.META.doubles &&
    data.RANKINGS &&
    Array.isArray(data.RANKINGS.singles) &&
    Array.isArray(data.RANKINGS.doubles) &&
    data.USAGE &&
    typeof data.USAGE === 'object' &&
    Object.keys(data.USAGE).length > 0
  )
}

function hydrate() {
  if (hydrated) return
  hydrated = true
  try {
    const cached = wx.getStorageSync(CACHE_KEY)
    if (
      cached &&
      typeof cached.version === 'string' &&
      cached.version &&
      cached.data &&
      isValidPayload(cached.data) &&
      compareVersion(cached.version, current.VERSION) > 0
    ) {
      current = {
        META: cached.data.META,
        RANKINGS: cached.data.RANKINGS,
        USAGE: cached.data.USAGE,
        VERSION: cached.version
      }
      cachedAt = cached.fetchedAt || 0
      sourceKind = 'cache'
    }
  } catch (e) {
    // Stored cache is best-effort; fall back to the bundled data.
  }
}

function notify() {
  listeners.slice().forEach((fn) => {
    try {
      fn(current)
    } catch (e) {
      // One broken page must not stop other subscribers.
    }
  })
}

function getUsage() {
  hydrate()
  return current
}

/** 当前使用率数据的来源：bundled 内置 / cache 本地缓存 / remote 远程拉取。 */
function getSource() {
  hydrate()
  return sourceKind
}

function subscribe(fn) {
  hydrate()
  if (typeof fn === 'function') listeners.push(fn)
  return function unsubscribe() {
    const idx = listeners.indexOf(fn)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

function refresh(force) {
  hydrate()
  const cfg = config.usageRemote || {}
  if (!cfg.enabled || !cfg.url) return Promise.resolve(current)
  if (!force && cachedAt && Date.now() - cachedAt < (cfg.maxAge || 0)) {
    return Promise.resolve(current)
  }

  return new Promise((resolve) => {
    wx.request({
      url: cfg.url + (cfg.url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now(),
      method: 'GET',
      timeout: cfg.timeout || 6000,
      dataType: 'json',
      success(res) {
        try {
          const payload = res && res.data
          if (
            res.statusCode >= 200 &&
            res.statusCode < 300 &&
            payload &&
            typeof payload.version === 'string' &&
            payload.version &&
            isValidPayload(payload.data) &&
            compareVersion(payload.version, current.VERSION) > 0
          ) {
            current = {
              META: payload.data.META,
              RANKINGS: payload.data.RANKINGS,
              USAGE: payload.data.USAGE,
              VERSION: payload.version
            }
            cachedAt = Date.now()
            sourceKind = 'remote'
            wx.setStorageSync(CACHE_KEY, {
              version: payload.version,
              data: payload.data,
              fetchedAt: cachedAt
            })
            notify()
          }
        } catch (e) {
          // Keep the current bundled/cached data on malformed remote data.
        }
        resolve(current)
      },
      fail() {
        resolve(current)
      }
    })
  })
}

module.exports = {
  getUsage,
  getSource,
  subscribe,
  refresh
}
