#!/usr/bin/env node
/**
 * 静态校验：在没有微信开发者工具的环境里，尽可能提前发现结构性问题。
 *
 *   node scripts/validate.js
 *
 * 检查项
 *  1. JSON 可解析
 *  2. JS 语法（node --check）
 *  3. app.json 页面 / tabBar / 图标文件
 *  4. 页面与组件的四件套文件齐全
 *  5. WXML 标签闭合 + 自定义组件已注册
 *  6. WXML 事件处理函数在页面 JS 中存在
 *  7. WXML 里的 {{变量}} 在 data 或循环变量中声明
 *  8. WXML 用到的 class 在 app.wxss / 页面 wxss / 组件 wxss 中有定义
 *  9. WXSS 的 var(--x) 令牌均已定义
 * 10. 页面 wxss 不出现裸十六进制色值（规范 R6.1）
 * 11. JS / WXML 里引用的本地资源路径存在
 * 12. require() 路径可解析 + 路由字符串指向真实页面
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const problems = []
const warnings = []

function fail(file, message) {
  problems.push(`${file}: ${message}`)
}
function warn(file, message) {
  warnings.push(`${file}: ${message}`)
}
function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/')
}
function read(file) {
  return fs.readFileSync(file, 'utf8')
}
function exists(p) {
  return fs.existsSync(p)
}

/* ------------------------------------------------------------------ 扫描文件 */

function walk(dir, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') return
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  })
  return out
}

const files = walk(ROOT)
const byExt = (ext) => files.filter((f) => f.endsWith(ext))
const jsonFiles = byExt('.json')
const jsFiles = byExt('.js').filter((f) => !f.includes('node_modules'))

/* ------------------------------------------------------------------ 1. JSON */

jsonFiles.forEach((file) => {
  try {
    JSON.parse(read(file))
  } catch (e) {
    fail(rel(file), 'JSON 解析失败：' + e.message)
  }
})

/* ------------------------------------------------------------------ 2. JS 语法 */

jsFiles.forEach((file) => {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (e) {
    fail(rel(file), 'JS 语法错误：' + String(e.stderr || e.message).split('\n').slice(0, 3).join(' '))
  }
})

/* ------------------------------------------------------------------ 3. app.json */

const app = JSON.parse(read(path.join(ROOT, 'app.json')))
const pages = app.pages || []

pages.forEach((page) => {
  ;['.js', '.json', '.wxml'].forEach((ext) => {
    if (!exists(path.join(ROOT, page + ext))) fail('app.json', `页面文件缺失 ${page}${ext}`)
  })
})

const tabBar = app.tabBar || {}
;(tabBar.list || []).forEach((item) => {
  if (!pages.includes(item.pagePath)) fail('app.json', `tabBar 页面不在 pages 中：${item.pagePath}`)
  ;['iconPath', 'selectedIconPath'].forEach((key) => {
    const p = item[key]
    if (p && !exists(path.join(ROOT, p))) fail('app.json', `tabBar 图标缺失：${p}`)
  })
})

// tabBar 页面必须在主包（规范 R2.1）
;(tabBar.list || []).forEach((item) => {
  if (item.pagePath.split('/')[0] === 'packages') fail('app.json', `tabBar 页面在主包之外：${item.pagePath}`)
})

/* 页面目录反查：pages 里未注册的页面文件 */
const pageDirs = new Set(pages.map((p) => p.substr(0, p.lastIndexOf('/'))))
walk(path.join(ROOT, 'pages'))
  .filter((f) => f.endsWith('.js'))
  .forEach((f) => {
    const dir = path.dirname(rel(f))
    if (!pageDirs.has(dir)) fail(rel(f), '页面未在 app.json 注册')
  })

/* ------------------------------------------------------------------ 5-8. WXML */

const VOID_TAGS = new Set(['image', 'input', 'icon', 'progress', 'switch', 'slider', 'audio', 'video', 'canvas', 'map', 'textarea'])

function maskMustaches(src) {
  const slots = []
  const masked = src.replace(/\{\{[\s\S]*?\}\}/g, (m) => {
    slots.push(m)
    return `\u0000${slots.length - 1}\u0000`
  })
  return { masked, slots }
}

function parseWxml(src, label) {
  const { masked, slots } = maskMustaches(src)
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g
  const stack = []
  const tags = []
  let m
  while ((m = tagRe.exec(masked))) {
    const [, closing, name, attrs, selfClose] = m
    tags.push({ name, attrs, closing: !!closing, selfClose: !!selfClose })
    if (closing) {
      const top = stack.pop()
      if (!top) fail(label, `多余的闭合标签 </${name}>`)
      else if (top !== name) fail(label, `标签不匹配：<${top}> 被 </${name}> 关闭`)
    } else if (!selfClose && !VOID_TAGS.has(name)) {
      stack.push(name)
    }
  }
  if (stack.length) fail(label, `未闭合标签：${stack.join(', ')}`)
  return { tags, slots }
}

const classDefs = new Map() // file -> Set(class)
function collectClasses(cssText, into) {
  const cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /\.(-?[a-zA-Z_][\w-]*)/g
  let m
  while ((m = re.exec(cleaned))) into.add(m[1])
}

const globalClasses = new Set()
collectClasses(read(path.join(ROOT, 'app.wxss')), globalClasses)

const componentDirs = fs
  .readdirSync(path.join(ROOT, 'components'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(ROOT, 'components', d.name))

const componentClasses = new Map()
const componentEvents = new Map()
componentDirs.forEach((dir) => {
  const set = new Set()
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.wxss'))
    .forEach((f) => collectClasses(read(path.join(dir, f)), set))
  componentClasses.set(path.basename(dir), set)
})

const varDefs = new Set()
{
  const css = read(path.join(ROOT, 'app.wxss')).replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /(--[\w-]+)\s*:/g
  let m
  while ((m = re.exec(css))) varDefs.add(m[1])
}

/** 从 JS 里抽取 data 的顶层键 */
function extractDataKeys(js) {
  const idx = js.indexOf('data: {')
  if (idx < 0) return new Set()
  let depth = 0
  let start = js.indexOf('{', idx)
  let end = -1
  for (let i = start; i < js.length; i += 1) {
    const ch = js[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return new Set()
  const body = js.slice(start + 1, end)
  const keys = new Set()
  let nested = 0
  body.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('//')) return
    if (nested === 0) {
      const km = /^([A-Za-z_$][\w$]*)\s*:/.exec(trimmed)
      if (km) keys.add(km[1])
    }
    nested += (line.match(/[{[(\[]/g) || []).length
    nested -= (line.match(/[}\])\]]/g) || []).length
  })
  return keys
}

function extractMethods(js) {
  const names = new Set()
  const re = /^\s{2}([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm
  let m
  while ((m = re.exec(js))) names.add(m[1])
  return names
}

function mustacheIdentifiers(expr) {
  const noStrings = expr.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
  const ids = new Set()
  const re = /(^|[^.\w$'"])([A-Za-z_$][\w$]*)/g
  let m
  while ((m = re.exec(noStrings))) {
    const word = m[2]
    if (['true', 'false', 'null', 'undefined'].includes(word)) continue
    ids.add(word)
  }
  return ids
}

pages.forEach((page) => {
  const wxmlPath = path.join(ROOT, page + '.wxml')
  const jsPath = path.join(ROOT, page + '.js')
  if (!exists(wxmlPath) || !exists(jsPath)) return

  const wxml = read(wxmlPath)
  const js = read(jsPath)
  const json = exists(path.join(ROOT, page + '.json')) ? JSON.parse(read(path.join(ROOT, page + '.json'))) : {}
  const using = json.usingComponents || {}
  const dataKeys = extractDataKeys(js)
  const methods = extractMethods(js)

  // --- 标签闭合（带文件名）
  const { tags, slots } = parseWxml(wxml, `${page}.wxml`)

  // --- 自定义组件注册
  const builtin = new Set(['view', 'text', 'block', 'image', 'input', 'scroll-view', 'button', 'picker', 'switch', 'slider', 'form', 'label', 'swiper', 'swiper-item', 'navigator', 'template', 'import', 'include', 'slot', 'rich-text', 'movable-area', 'movable-view', 'checkbox', 'radio', 'textarea', 'progress', 'icon', 'canvas', 'video', 'camera', 'map', 'cover-view', 'cover-image', 'functional-page-navigator', 'editor', 'page-meta', 'navigation-bar', 'root-portal', 'keyboard-accessory', 'match-media', 'open-data'])
  tags.forEach((t) => {
    if (builtin.has(t.name)) return
    if (!using[t.name]) fail(`${page}.wxml`, `自定义组件未注册：<${t.name}> 不在 usingComponents`)
  })
  Object.keys(using).forEach((name) => {
    const target = using[name].replace(/^\//, '')
    ;['.js', '.json', '.wxml'].forEach((ext) => {
      if (!exists(path.join(ROOT, target + ext))) fail(`${page}.json`, `组件文件缺失 ${target}${ext}`)
    })
  })

  // --- 事件处理函数存在
  tags.forEach((t) => {
    const re = /(?:bind|catch):?([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g
    let m
    while ((m = re.exec(t.attrs))) {
      const handler = m[2].trim()
      if (!handler || handler.includes('{{')) continue
      if (!methods.has(handler)) fail(`${page}.wxml`, `事件处理函数缺失：${handler}（bind${m[1]}）`)
    }
  })

  // --- 变量声明
  const loopVars = new Set(['item', 'index'])
  tags.forEach((t) => {
    const fi = /wx:for-item\s*=\s*"([\w$]+)"/.exec(t.attrs)
    if (fi) loopVars.add(fi[1])
    const fx = /wx:for-index\s*=\s*"([\w$]+)"/.exec(t.attrs)
    if (fx) loopVars.add(fx[1])
  })
  slots.forEach((slot) => {
    mustacheIdentifiers(slot.replace(/^\{\{|\}\}$/g, '')).forEach((id) => {
      if (dataKeys.has(id) || loopVars.has(id)) return
      fail(`${page}.wxml`, `未声明的变量 {{${id}}}`)
    })
  })

  // --- class 定义
  const pageClasses = new Set(globalClasses)
  const wxssPath = path.join(ROOT, page + '.wxss')
  if (exists(wxssPath)) collectClasses(read(wxssPath), pageClasses)
  Object.keys(using).forEach((name) => {
    const set = componentClasses.get(name)
    if (set) set.forEach((c) => pageClasses.add(c))
  })

  const classRe = /class\s*=\s*"([^"]*)"/g
  let cm
  while ((cm = classRe.exec(wxml))) {
    const raw = cm[1]
    const statics = raw.replace(/\{\{[\s\S]*?\}\}/g, ' ')
    const dyn = []
    raw.replace(/\{\{([\s\S]*?)\}\}/g, (mm, expr) => {
      // 只把三元分支里的字符串当作动态 class，避免把 {{x === 'reg' ? ...}} 的 'reg' 误判为 class
      const q = expr.match(/[?:]\s*'([\w-]+)'/g) || []
      q.forEach((s) => dyn.push(s.replace(/^[?:]\s*'|'$/g, '')))
      return ''
    })
    statics
      .split(/\s+/)
      .concat(dyn)
      .filter(Boolean)
      .forEach((cls) => {
        if (!pageClasses.has(cls)) fail(`${page}.wxml`, `class 无样式定义：.${cls}`)
      })
  }

  // --- 页面 wxss 裸色值
  if (exists(wxssPath)) {
    const css = read(wxssPath).replace(/\/\*[\s\S]*?\*\//g, '')
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) || []
    if (hex.length) fail(`${page}.wxss`, `出现裸十六进制色值：${hex.join(' ')}（规范 R6.1）`)
  }
})

/* ------------------------------------------------------------------ 9. 令牌 */

files
  .filter((f) => f.endsWith('.wxss'))
  .forEach((file) => {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '')
    const re = /var\(\s*(--[\w-]+)\s*\)/g
    let m
    while ((m = re.exec(css))) {
      if (!varDefs.has(m[1])) fail(rel(file), `未定义的令牌 ${m[1]}`)
    }
  })

/* ------------------------------------------------------------------ 11. 资源 */

const assetRe = /["'(](\/?assets\/[\w./@-]+\.(?:png|jpg|jpeg|svg|webp))["')]/g
files
  .filter((f) => /\.(js|wxml|wxss|json)$/.test(f))
  .forEach((file) => {
    const text = read(file)
    let m
    while ((m = assetRe.exec(text))) {
      const target = path.join(ROOT, m[1].replace(/^\//, ''))
      if (!exists(target)) fail(rel(file), `资源不存在：${m[1]}`)
    }
  })

/* ------------------------------------------------------------------ 12. require 与路由 */

jsFiles.forEach((file) => {
  const text = read(file)
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g
  let m
  while ((m = re.exec(text))) {
    const target = path.resolve(path.dirname(file), m[1])
    if (!exists(target) && !exists(target + '.js') && !exists(path.join(target, 'index.js'))) {
      fail(rel(file), `require 路径无法解析：${m[1]}`)
    }
  }
})

const routeRe = /['"](\/pages\/[\w/]+)['"]/g
files
  .filter((f) => f.endsWith('.js'))
  .forEach((file) => {
    const text = read(file)
    let m
    while ((m = routeRe.exec(text))) {
      const target = m[1].replace(/^\//, '')
      if (!pages.includes(target)) fail(rel(file), `路由指向未注册页面：${m[1]}`)
    }
  })

/* ------------------------------------------------------------------ 输出 */

if (warnings.length) {
  console.log('\n提示：')
  warnings.forEach((w) => console.log('  ! ' + w))
}

if (problems.length) {
  console.log(`\n发现 ${problems.length} 个问题：`)
  problems.forEach((p) => console.log('  ✗ ' + p))
  process.exit(1)
}

console.log('✓ 静态校验通过')
