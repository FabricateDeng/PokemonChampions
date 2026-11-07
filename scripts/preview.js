#!/usr/bin/env node
/**
 * 设计预览渲染器（仅开发用，不参与小程序打包）。
 *
 * 思路：直接执行真实的页面 JS（Page/Component 打桩）+ 真实的 WXML 模板 +
 * 真实的 WXSS（rpx → px），用 Chrome 无头模式截图。这样看到的画面就是
 * 代码实际产出的画面，而不是另一份手抄的 HTML。
 *
 *   node scripts/preview.js
 *
 * 产物：docs/preview/*.png
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs', 'preview')
const FRAMES = path.join(OUT, 'frames')
const DEVICE_W = 375
const DEVICE_H = 812

/* ------------------------------------------------------------------ 工具 */

const read = (p) => fs.readFileSync(p, 'utf8')
const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function rpxToPx(css) {
  return css
    .replace(/(-?\d*\.?\d+)rpx/g, (m, n) => `${(parseFloat(n) * 0.5).toFixed(2)}px`)
    .replace(/env\(safe-area-inset-bottom\)/g, '0px')
}

/* ------------------------------------------------------------------ 运行环境打桩 */

const storage = {}
let toast = ''
let navLog = []

function makeWx() {
  return {
    getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: DEVICE_W, windowHeight: DEVICE_H, screenHeight: DEVICE_H, safeArea: { bottom: DEVICE_H } }),
    getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: DEVICE_W, windowHeight: DEVICE_H }),
    getMenuButtonBoundingClientRect: () => ({ top: 48, height: 32, width: 87, right: DEVICE_W - 8, left: DEVICE_W - 95 }),
    getStorageSync: (k) => (k in storage ? storage[k] : ''),
    setStorageSync: (k, v) => {
      storage[k] = v
    },
    showToast: (o) => {
      toast = (o && o.title) || ''
    },
    hideToast: () => {},
    showModal: () => {},
    navigateTo: (o) => navLog.push(['navigateTo', o && o.url]),
    redirectTo: (o) => navLog.push(['redirectTo', o && o.url]),
    switchTab: (o) => navLog.push(['switchTab', o && o.url]),
    reLaunch: (o) => navLog.push(['reLaunch', o && o.url]),
    navigateBack: () => navLog.push(['navigateBack']),
    pageScrollTo: () => {},
    request: () => {},
    stopPullDownRefresh: () => {},
    nextTick: (fn) => fn()
  }
}

const wxStub = makeWx()
global.wx = wxStub
global.getApp = () => ({ globalData: requireBasicMetrics() })
global.getCurrentPages = () => [{ route: 'pages/index/index' }]

function requireBasicMetrics() {
  return {
    statusBarHeight: 44,
    navBarHeight: 48,
    navTotalHeight: 92,
    windowWidth: DEVICE_W,
    windowHeight: DEVICE_H
  }
}

function runModule(file, extraGlobals) {
  let captured = null
  const g = global
  const prev = {
    Page: g.Page,
    Component: g.Component
  }
  g.wx = wxStub
  g.Page = (cfg) => {
    captured = cfg
  }
  g.Component = (cfg) => {
    captured = cfg
  }
  Object.assign(g, extraGlobals || {})
  delete require.cache[require.resolve(file)]
  require(file)
  Object.assign(g, prev)
  return captured
}

// 支持 setData('rows[0].value', v) 这类路径写法（真机行为）
function setPath(target, key, value) {
  if (!/[.[]/.test(key)) {
    target[key] = value
    return
  }
  const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cur = target
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i]
    if (cur[p] === undefined || cur[p] === null) cur[p] = {}
    cur = cur[p]
  }
  cur[parts[parts.length - 1]] = value
}

function instantiate(cfg, query) {
  const inst = Object.create(null)
  Object.keys(cfg).forEach((k) => {
    if (k !== 'data') inst[k] = cfg[k]
  })
  inst.data = JSON.parse(JSON.stringify(cfg.data || {}))
  inst.setData = function (patch) {
    Object.keys(patch || {}).forEach((k) => {
      setPath(this.data, k, patch[k])
    })
  }
  inst.triggerEvent = () => {}
  if (typeof cfg.onLoad === 'function') cfg.onLoad.call(inst, query || {})
  return inst
}

/* ------------------------------------------------------------------ WXML 渲染 */

const VOID_TAGS = new Set(['image', 'input', 'icon', 'progress', 'switch', 'slider'])
const TAG_MAP = {
  view: 'div',
  text: 'span',
  block: null,
  image: 'img',
  input: 'input',
  'scroll-view': 'div',
  picker: 'div',
  button: 'button',
  navigator: 'a',
  switch: 'input'
}
const BUILTIN = new Set(['view', 'text', 'block', 'image', 'input', 'scroll-view', 'picker', 'button', 'switch', 'slot', 'navigator'])

function parseAttrs(src) {
  const attrs = {}
  // 允许无值属性（如 wx:else / wx:if 的简写）
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*"([^"]*)")?/g
  let m
  while ((m = re.exec(src || ''))) {
    if (!m[1]) continue
    attrs[m[1]] = m[2] === undefined ? '' : m[2]
  }
  return attrs
}

function parseWxml(src) {
  const root = { children: [] }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
  let last = 0
  let m
  while ((m = re.exec(src))) {
    const text = src.slice(last, m.index)
    if (text) stack[stack.length - 1].children.push({ type: 'text', text })
    last = re.lastIndex
    if (m[1]) {
      const node = stack.pop()
      if (!node || node.tag !== m[1]) throw new Error(`标签不匹配 </${m[1]}>`)
    } else if (m[2]) {
      const node = { type: 'el', tag: m[2], attrs: parseAttrs(m[3]), children: [] }
      stack[stack.length - 1].children.push(node)
      if (!m[4] && !VOID_TAGS.has(m[2])) stack.push(node)
    }
  }
  return root.children
}

function evalExpr(expr, scope) {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('__s', `with (__s) { return (${expr}) }`)
    const v = fn(scope)
    return v === undefined ? '' : v
  } catch (e) {
    return ''
  }
}

function interpolate(tpl, scope) {
  if (tpl.indexOf('{{') === -1) return tpl
  return tpl.replace(/\{\{([\s\S]*?)\}\}/g, (m, expr) => {
    const v = evalExpr(expr, scope)
    return v === null || v === undefined ? '' : String(v)
  })
}

function scopeFor(data, extra) {
  return Object.assign(Object.create(null), data, extra || {})
}

function renderNodes(nodes, scope, ctx) {
  let out = ''
  let condMatched = true
  let inChain = false

  nodes.forEach((node) => {
    if (node.type === 'text') {
      out += escapeHtml(interpolate(node.text, scope))
      return
    }

    const a = node.attrs
    if ('wx:if' in a) {
      inChain = true
      condMatched = !!evalExpr(a['wx:if'].replace(/^\{\{|\}\}$/g, ''), scope)
      if (!condMatched) return
    } else if ('wx:elif' in a) {
      if (!inChain) return
      if (condMatched) return
      condMatched = !!evalExpr(a['wx:elif'].replace(/^\{\{|\}\}$/g, ''), scope)
      if (!condMatched) return
    } else if ('wx:else' in a) {
      if (!inChain) return
      if (condMatched) return
      condMatched = true
    } else {
      inChain = false
      condMatched = true
    }

    if ('wx:for' in a) {
      const raw = a['wx:for'].replace(/^\{\{|\}\}$/g, '')
      const list = evalExpr(raw, scope) || []
      const itemName = a['wx:for-item'] || 'item'
      const indexName = a['wx:for-index'] || 'index'
      const clone = Object.assign({}, node)
      clone.attrs = Object.assign({}, a)
      delete clone.attrs['wx:for']
      Array.from(list).forEach((item, i) => {
        const childScope = scopeFor(scope, { [itemName]: item, [indexName]: i })
        out += renderNodes([Object.assign({}, clone, { children: node.children })], childScope, ctx)
      })
      return
    }

    out += renderElement(node, scope, ctx)
  })

  return out
}

function renderElement(node, scope, ctx) {
  const tag = node.tag
  const a = node.attrs || {}

  if (tag === 'block') return renderNodes(node.children, scope, ctx)
  if (tag === 'slot') return ctx.slot || ''

  if (!BUILTIN.has(tag)) {
    return renderComponent(tag, a, node.children, scope, ctx)
  }

  const html = TAG_MAP[tag] || 'div'
  const cls = a.class ? interpolate(a.class, scope) : ''
  const style = a.style ? interpolate(a.style, scope) : ''

  if (html === 'img') {
    let src = interpolate(a.src || '', scope)
    if (src && src.startsWith('/')) src = 'file:///' + path.join(ROOT, src.slice(1)).replace(/\\/g, '/')
    const fit = a.mode === 'aspectFit' ? 'contain' : a.mode === 'aspectFill' ? 'cover' : 'fill'
    return `<img class="${escapeHtml(cls)}" style="${escapeHtml(style)};object-fit:${fit}" src="${escapeHtml(src)}">`
  }

  if (html === 'input') {
    const value = interpolate(a.value || '', scope)
    const ph = a.placeholder ? interpolate(a.placeholder, scope) : ''
    return `<input class="${escapeHtml(cls)}" style="${escapeHtml(style)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(ph)}">`
  }

  if (html === 'button') {
    return `<button class="${escapeHtml(cls)}" style="${escapeHtml(style)}">${renderNodes(node.children, scope, ctx)}</button>`
  }

  const inner = renderNodes(node.children, scope, ctx)
  return `<${html} class="${escapeHtml(cls)}" style="${escapeHtml(style)}">${inner}</${html}>`
}

const componentCache = {}

function loadComponent(dir) {
  if (componentCache[dir]) return componentCache[dir]
  const base = path.join(ROOT, 'components', dir)
  const cfg = runModule(path.join(base, dir + '.js')) || {}
  const props = {}
  Object.keys(cfg.properties || {}).forEach((k) => {
    const p = cfg.properties[k]
    props[k] = p && Object.prototype.hasOwnProperty.call(p, 'value') ? p.value : ''
  })
  const wxml = read(path.join(base, dir + '.wxml'))
  componentCache[dir] = { cfg, props, wxml }
  return componentCache[dir]
}

function renderComponent(tag, attrs, children, scope, ctx) {
  const comp = loadComponent(tag)
  const props = Object.assign({}, comp.props, comp.cfg.data || {})
  Object.keys(attrs).forEach((k) => {
    if (k.startsWith('bind') || k.startsWith('catch') || k === 'class' || k === 'style') return
    const raw = attrs[k]
    props[k] = /^\{\{[\s\S]*\}\}$/.test(raw) ? evalExpr(raw.replace(/^\{\{|\}\}$/g, ''), scope) : raw
  })

  // 组件内容 + 传入的默认 slot
  const innerScope = scopeFor(props)
  const slotHtml = children && children.length ? renderNodes(children, scope, ctx) : ''
  return renderNodes(parseWxml(comp.wxml), innerScope, { slot: slotHtml })
}

/* ------------------------------------------------------------------ 组装 */

function collectCss(page) {
  const files = [
    'app.wxss',
    'components/nav-bar/nav-bar.wxss',
    'components/segmented/segmented.wxss',
    'components/sheet/sheet.wxss',
    'components/empty-state/empty-state.wxss',
    page + '.wxss'
  ]
  const parts = files
    .map((f) => path.join(ROOT, f))
    .filter((f) => fs.existsSync(f))
    .map((f) => read(f))
  // 小程序里 `page` 是根节点；HTML 里没有这个元素，需要把令牌挂到 body 上。
  return rpxToPx(parts.join('\n')).replace(/(^|\n)(\s*)page\s*\{/g, '$1$2page, body {')
}

const TABBAR = [
  { label: '图鉴', icon: 'dex', on: true },
  { label: '榜单', icon: 'rank' },
  { label: '队伍', icon: 'team' },
  { label: '我的', icon: 'profile' }
]

function tabBarHtml(active) {
  const items = TABBAR.map((t) => {
    const on = t.label === active
    const iconPath = path.join(ROOT, 'assets/tabbar', `${t.icon}${on ? '-on' : ''}.png`).replace(/\\/g, '/')
    return `<div class="tb-item ${on ? 'on' : ''}"><img src="file:///${iconPath}"><span>${t.label}</span></div>`
  }).join('')
  return `<div class="tb">${items}</div>`
}

const TAB_BAR_CSS = rpxToPx(`
.tb { position: absolute; left: 0; right: 0; bottom: 0; height: 98rpx; display: flex; background: #0c121b; border-top: 1rpx solid rgba(255,255,255,.08); }
.tb-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4rpx; }
.tb-item img { width: 44rpx; height: 44rpx; }
.tb-item span { font-size: 20rpx; color: #6a7585; line-height: 1; }
.tb-item.on span { color: #f2c455; }
`)

function frame(title, page, data, opts) {
  const o = opts || {}
  const wxml = read(path.join(ROOT, page + '.wxml'))
  const body = renderNodes(parseWxml(wxml), scopeFor(data), {})
  const css = collectCss(page) + TAB_BAR_CSS
  const tab = o.tab ? tabBarHtml(o.tab) : ''
  return `
  <figure class="frame">
    <figcaption>${escapeHtml(title)}</figcaption>
    <div class="screen" style="width:${DEVICE_W}px;height:${DEVICE_H}px;">
      <div class="viewport">${body}</div>
      ${tab}
    </div>
  </figure>`
}

function pageHtml(frames, title) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; padding: 0; background: #05070a; }
  body { display: flex; flex-wrap: wrap; gap: 24px; padding: 24px; align-items: flex-start; }
  .frame { margin: 0; }
  .frame figcaption { font: 500 13px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #7b8698; padding: 0 0 8px 2px; letter-spacing: .3px; }
  .screen { position: relative; overflow: hidden; border-radius: 28px; background: #0a0e14; box-shadow: 0 0 0 1px #1d2430, 0 20px 60px rgba(0,0,0,.6); }
  .viewport { position: absolute; inset: 0; overflow: hidden; }
  .screen img { -webkit-user-drag: none; }
  input { outline: none; background: transparent; border: 0; }
  input::placeholder { color: #6a7585; font-size: 13px; }
  button { border: 0; font-family: inherit; }
</style>
<style>${''}</style>
</head><body>${frames}</body></html>`
}

/* 把每帧的样式内联到 <style>：因为不同页面 wxss 不同，这里按帧生成独立 html 更简单 */
function singleFrameHtml(title, page, data, opts) {
  const wxml = read(path.join(ROOT, page + '.wxml'))
  const body = renderNodes(parseWxml(wxml), scopeFor(data), {})
  const css = collectCss(page) + TAB_BAR_CSS
  const tab = opts && opts.tab ? tabBarHtml(opts.tab) : ''
  return { body, css, tab, title }
}

/* ------------------------------------------------------------------ 场景 */

function seedStorage() {
  const store = require(path.join(ROOT, 'utils', 'team-store.js'))
  const mk = (key, moves, sp, nature, item, ability) => {
    const mon = store.MON_BY_KEY[key]
    return {
      key,
      ability: ability || mon.abilities[0],
      item: item || '',
      nature: nature || 'hardy',
      sp,
      moves
    }
  }
  const teams = [
    {
      id: 't1',
      name: '双打 · 首发',
      createdAt: '2026-11-02T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.000Z',
      members: [
        mk('primarina', ['moonblast', 'aqua-jet', 'sparkling-aria', 'protect'], [32, 0, 0, 32, 2, 0], 'modest', 'sitrus-berry'),
        mk('gholdengo', ['make-it-rain', 'shadow-ball', 'protect', 'nasty-plot'], [32, 0, 0, 32, 0, 2], 'modest', 'life-orb'),
        mk('dragapult', ['dragon-darts', 'phantom-force', 'u-turn', 'protect'], [0, 32, 0, 0, 2, 32], 'jolly', 'choice-band'),
        null,
        null,
        null
      ]
    },
    {
      id: 't2',
      name: '单打 · 沙暴',
      createdAt: '2026-11-03T10:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z',
      members: [
        mk('tyranitar', ['stone-edge', 'crunch', 'earthquake', 'stealth-rock'], [32, 32, 0, 0, 2, 0], 'adamant'),
        mk('archaludon', ['draco-meteor', 'flash-cannon', 'body-press', 'electro-shot'], [32, 0, 0, 32, 2, 0], 'modest', 'assault-vest'),
        null,
        null,
        null,
        null
      ]
    }
  ]
  storage.champion_teams_v1 = teams
  storage.champion_favs = ['primarina', 'gholdengo', 'dragapult', 'kingambit', 'dragapult', 'tyranitar']
}

const pages = {}

function loadPage(rel) {
  if (pages[rel]) return pages[rel]
  const cfg = runModule(path.join(ROOT, rel + '.js'))
  pages[rel] = cfg
  return cfg
}

function buildIndexScreen(mode) {
  const cfg = loadPage('pages/index/index')
  const inst = instantiate(cfg, {})
  if (mode === 'move') inst.onMode({ detail: { key: 'move' } })
  if (mode === 'sheet') inst.openFilter()
  return inst.data
}

function buildDetailScreen(tab) {
  const cfg = loadPage('pages/detail/detail')
  if (tab === 'bounded') {
    return instantiate(cfg, { key: 'charizard', tab: 'usage' }).data
  }
  const inst = instantiate(cfg, { key: 'primarina', tab: tab === 'usage' ? 'usage' : 'stats' })
  inst.onShow()
  if (tab === 'moves') inst.onTab({ detail: { key: 'moves' } })
  if (tab === 'usage') inst.buildUsage('singles')
  return inst.data
}

function buildRankings(scope) {
  const cfg = loadPage('pages/rankings/rankings')
  const inst = instantiate(cfg, {})
  if (scope === 'all') inst.onScope({ currentTarget: { dataset: { key: 'all' } } })
  return inst.data
}

function buildPicker() {
  const cfg = loadPage('pages/picker/picker')
  return instantiate(cfg, { teamId: 't1', slot: 3 }).data
}

function buildTeams() {
  const cfg = loadPage('pages/teams/teams')
  const inst = instantiate(cfg, {})
  inst.onShow()
  return inst.data
}

function buildTeam() {
  const cfg = loadPage('pages/team/team')
  const inst = instantiate(cfg, { id: 't1' })
  inst.onShow()
  return inst.data
}

function buildMember() {
  const cfg = loadPage('pages/member/member')
  const inst = instantiate(cfg, { teamId: 't1', slot: 1 })
  return inst.data
}

function buildCalc() {
  const cfg = loadPage('pages/calc/calc')
  const inst = instantiate(cfg, { teamId: 't1' })
  return inst.data
}

function buildProfile() {
  const cfg = loadPage('pages/profile/profile')
  const inst = instantiate(cfg, {})
  inst.onShow()
  return inst.data
}

/* ------------------------------------------------------------------ 主流程 */

function main() {
  fs.mkdirSync(OUT, { recursive: true })
  fs.mkdirSync(FRAMES, { recursive: true })
  seedStorage()

  // 单帧放大：node scripts/preview.js --zoom <关键词>
  // Chrome 无头窗口在 Windows 上有最小尺寸，直接截取会把 375 宽的帧拉宽，
  // 因此把帧放进固定 375×812 的 iframe 里再截图。
  const zoomArg = process.argv.indexOf('--zoom')
  if (zoomArg > 0) {
    const keyword = process.argv[zoomArg + 1] || ''
    const target = fs
      .readdirSync(FRAMES)
      .filter((f) => f.endsWith('.html') && f.includes(keyword) && !f.startsWith('_'))
      .sort((a, b) => b.length - a.length)[0]
    if (!target) {
      console.log('没找到匹配的帧：', keyword)
      return
    }
    const chrome = findChrome()
    const wrap = path.join(FRAMES, '_zoom.html')
    fs.writeFileSync(
      wrap,
      `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;padding:0;background:#05070a}
        iframe{display:block;width:${DEVICE_W}px;height:${DEVICE_H}px;border:0;border-radius:26px;margin:12px;box-shadow:0 0 0 1px #1d2430}
      </style></head><body><iframe src="${target}" scrolling="no"></iframe></body></html>`,
      'utf8'
    )
    const png = path.join(OUT, 'z-' + path.basename(target, '.html') + '.png')
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--force-device-scale-factor=2',
      `--window-size=${DEVICE_W + 24},${DEVICE_H + 24}`,
      `--screenshot=${png}`,
      'file:///' + wrap.replace(/\\/g, '/')
    ], { stdio: 'pipe' })
    console.log('✓', path.relative(ROOT, png))
    return
  }
  // 重新生成：先清掉上一次的产物，避免旧分组文件干扰 --zoom 匹配
  fs.readdirSync(OUT).forEach((f) => {
    if (f.endsWith('.png') || f.endsWith('.html')) fs.unlinkSync(path.join(OUT, f))
  })
  fs.readdirSync(FRAMES).forEach((f) => fs.unlinkSync(path.join(FRAMES, f)))

  const groups = [
    {
      name: 'a-图鉴',
      frames: [
        ['图鉴 · 宝可梦', 'pages/index/index', buildIndexScreen('mon'), { tab: '图鉴' }],
        ['图鉴 · 招式', 'pages/index/index', buildIndexScreen('move'), { tab: '图鉴' }],
        ['图鉴 · 筛选面板', 'pages/index/index', buildIndexScreen('sheet'), { tab: '图鉴' }]
      ]
    },
    {
      name: 'b-详情',
      frames: [
        ['详情 · 数据', 'pages/detail/detail', buildDetailScreen('stats'), {}],
        ['详情 · 招式', 'pages/detail/detail', buildDetailScreen('moves'), {}],
        ['详情 · 使用率', 'pages/detail/detail', buildDetailScreen('usage'), {}]
      ]
    },
    {
      name: 'c-榜单',
      frames: [
        ['榜单 · TOP50', 'pages/rankings/rankings', buildRankings('top'), { tab: '榜单' }],
        ['榜单 · 全部精灵', 'pages/rankings/rankings', buildRankings('all'), { tab: '榜单' }],
        ['详情 · 无样本', 'pages/detail/detail', buildDetailScreen('bounded'), {}]
      ]
    },
    {
      name: 'd-队伍',
      frames: [
        ['队伍', 'pages/teams/teams', buildTeams(), { tab: '队伍' }],
        ['队伍编辑', 'pages/team/team', buildTeam(), {}],
        ['选择宝可梦', 'pages/picker/picker', buildPicker(), {}]
      ]
    },
    {
      name: 'e-配置与计算',
      frames: [
        ['成员配置', 'pages/member/member', buildMember(), {}],
        ['伤害计算', 'pages/calc/calc', buildCalc(), {}],
        ['我的', 'pages/profile/profile', buildProfile(), { tab: '我的' }]
      ]
    }
  ]

  groups.forEach((group) => {
    const body = group.frames
      .map(([title, page, data, opts]) => {
        const f = singleFrameHtml(title, page, data, opts)
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>
          html,body{margin:0;padding:0;background:#0a0e14}
          .screen{position:relative;width:${DEVICE_W}px;height:${DEVICE_H}px;overflow:hidden;background:#0a0e14}
          .viewport{position:absolute;inset:0;overflow:hidden}
          input{outline:none;border:0;background:transparent;font-family:inherit}
          input::placeholder{color:#6a7585}
          button{border:0;font-family:inherit}
        </style><style>${f.css}</style></head>
        <body><div class="screen"><div class="viewport">${f.body}</div>${f.tab}</div></body></html>`
        const file = path.join(FRAMES, `${group.name}-${title.replace(/[ ·]/g, '')}.html`)
        fs.writeFileSync(file, html, 'utf8')
        return { title, file }
      })

    // 合成一张总览图
    const cells = body
      .map(
        (b, i) => `<div class="cell"><div class="cap">${escapeHtml(b.title)}</div>
          <iframe class="fr" src="frames/${path.basename(b.file)}" width="${DEVICE_W}" height="${DEVICE_H}" scrolling="no"></iframe></div>`
      )
      .join('')
    const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:#05070a}
      body{display:flex;flex-wrap:wrap;gap:20px;padding:20px}
      .cap{font:500 13px/1.8 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#7b8698}
      .fr{border:0;border-radius:26px;box-shadow:0 0 0 1px #1d2430,0 16px 48px rgba(0,0,0,.55);background:#0a0e14}
    </style></head><body>${cells}</body></html>`
    const sheetFile = path.join(OUT, `${group.name}.html`)
    fs.writeFileSync(sheetFile, sheet, 'utf8')

    const chrome = findChrome()
    if (!chrome) {
      console.log('未找到 Chrome，跳过截图，仅生成 HTML：', path.relative(ROOT, sheetFile))
      return
    }
    const png = path.join(OUT, `${group.name}.png`)
    const cols = Math.min(group.frames.length, 4)
    const width = cols * (DEVICE_W + 20) + 20
    const rows = Math.ceil(group.frames.length / cols)
    const height = rows * (DEVICE_H + 44) + 20
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--force-device-scale-factor=1',
      `--window-size=${width},${height}`,
      `--screenshot=${png}`,
      'file:///' + sheetFile.replace(/\\/g, '/')
    ], { stdio: 'pipe' })
    console.log('✓', path.relative(ROOT, png))
  })
}

function findChrome() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ]
  return candidates.find((c) => fs.existsSync(c)) || null
}

main()

