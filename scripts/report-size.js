#!/usr/bin/env node
/**
 * 估算 / 实测小程序代码包体积。
 *
 *   node scripts/report-size.js                按开发者工具规则统计，并尽量读取本机编译缓存
 *   node scripts/report-size.js --json         机器可读输出
 *   node scripts/report-size.js --quiet        只输出结论（给 update-data.js check 用）
 *
 * 背景（重要）：
 *   微信开发者工具编译时用 Babel 做 ES6→ES5，Babel 会把巨大的对象/数组字面量
 *   重新排版（每个字段一行 + 缩进）。本项目曾因此把 497KB 的 data/pokedex.js
 *   撑到 2837KB，整包「源码包」4478KB，超过服务器 2MB 上限而上传失败。
 *   所以数据文件必须写成「单行 JSON 字符串 + JSON.parse」的形式（见 lib/emit.js）。
 *
 * 体积限制（微信官方）：
 *   单个包（含主包 / 每个分包）源码包 ≤ 2MB；整包压缩后总计 ≤ 20MB。
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')

const ROOT = path.resolve(__dirname, '..')
const SOURCE_LIMIT = 2 * 1024 * 1024
const TOTAL_LIMIT = 20 * 1024 * 1024

const CODE_EXT = new Set(['.js', '.json', '.wxml', '.wxss'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

/* ---------------------------------------------------------------- 打包规则 */

function loadPackIgnore() {
  const file = path.join(ROOT, 'project.config.json')
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
    return ((cfg.packOptions && cfg.packOptions.ignore) || []).filter((r) => r && r.value)
  } catch (e) {
    return []
  }
}

function globToRegExp(glob) {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*')
  return new RegExp('^' + body + '$')
}

function makeMatcher(rules) {
  const compiled = rules.map((r) => {
    if (r.type === 'regexp') {
      try {
        return { type: 'regexp', re: new RegExp(r.value) }
      } catch (e) {
        return null
      }
    }
    if (r.type === 'glob') return { type: 'glob', re: globToRegExp(r.value) }
    return r
  })
  return (rel) => {
    const norm = rel.split(path.sep).join('/')
    return compiled.some((rule) => {
      if (!rule) return false
      switch (rule.type) {
        case 'folder':
          return norm === rule.value || norm.startsWith(rule.value.replace(/\/$/, '') + '/')
        case 'file':
          return norm === rule.value
        case 'suffix':
          return norm.endsWith(rule.value)
        case 'prefix':
          return norm.startsWith(rule.value)
        case 'regexp':
        case 'glob':
          return rule.re.test(norm)
        default:
          return false
      }
    })
  }
}

function walk(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return out
  }
  entries.forEach((ent) => {
    // 开发者工具隐式忽略以 . 开头的文件和目录（.git / .cache 等）
    if (ent.name.startsWith('.')) return
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(full, out)
    else if (ent.isFile()) out.push(full)
  })
  return out
}

/* ---------------------------------------------------------------- 统计 */

function collect() {
  const ignored = makeMatcher(loadPackIgnore())
  const files = walk(ROOT, [])
    .map((full) => {
      const rel = path.relative(ROOT, full)
      return { full, rel, relPosix: rel.split(path.sep).join('/'), size: fs.statSync(full).size }
    })
    .filter((f) => !ignored(f.rel))

  const buckets = { code: [], image: [], other: [] }
  files.forEach((f) => {
    const ext = path.extname(f.rel).toLowerCase()
    const bucket = CODE_EXT.has(ext) ? 'code' : IMAGE_EXT.has(ext) ? 'image' : 'other'
    f.ext = ext
    buckets[bucket].push(f)
  })

  const sum = (arr) => arr.reduce((a, f) => a + f.size, 0)
  const code = sum(buckets.code)
  const image = sum(buckets.image)
  const other = sum(buckets.other)

  // 压缩后估算：文本逐个 deflate，图片按原样（PNG/JPEG 基本不可再压）
  let deflated = 0
  buckets.code.concat(buckets.other).forEach((f) => {
    if (f.size === 0) return
    try {
      deflated += zlib.deflateRawSync(fs.readFileSync(f.full), { level: 9 }).length
    } catch (e) {
      deflated += f.size
    }
  })

  return {
    root: ROOT,
    count: files.length,
    code,
    image,
    other,
    total: code + image + other,
    zipped: deflated + image,
    codeFiles: buckets.code,
    imageFiles: buckets.image,
    otherFiles: buckets.other
  }
}

/* ---------------------------------------------------------------- 编译缓存实测 */

/**
 * 开发者工具编译产物缓存：%LOCALAPPDATA%/微信开发者工具/User Data/<用户>/WeappCache/WeappCompileCache/<项目>/<hash>
 * 每个文件开头形如 define("data/pokedex.js", ...)，据此反查模块名。
 * 命中后可以直接得到「服务器看到的源码包体积」。
 */
function readDevtoolsCompiled() {
  const base = path.join(os.homedir(), 'AppData', 'Local', '微信开发者工具', 'User Data')
  if (!fs.existsSync(base)) return null
  let best = null
  let projects = []
  try {
    projects = fs.readdirSync(base)
  } catch (e) {
    return null
  }
  projects.forEach((user) => {
    const cacheRoot = path.join(base, user, 'WeappCache', 'WeappCompileCache')
    if (!fs.existsSync(cacheRoot)) return
    let dirs = []
    try {
      dirs = fs.readdirSync(cacheRoot)
    } catch (e) {
      return
    }
    dirs.forEach((proj) => {
      const dir = path.join(cacheRoot, proj)
      let names = []
      try {
        names = fs.readdirSync(dir)
      } catch (e) {
        return
      }
      const modules = new Map()
      let newest = 0
      names.forEach((name) => {
        if (name.endsWith('.json')) return
        const full = path.join(dir, name)
        try {
          const st = fs.statSync(full)
          if (st.size < 64) return
          const text = fs.readFileSync(full, 'utf8')
          const m = /define\("([^"]+)"/.exec(text.slice(0, 200))
          if (!m) return
          // 缓存文件 = 编译产物 + 内联 sourcemap（调试用）。上传时 sourcemap 是否随包
          // 走由 project.config.json 的 uploadWithSourceMap 决定，两者要分开统计。
          const cut = text.lastIndexOf('\n//# sourceMappingURL')
          const codeBytes = Buffer.byteLength(cut > 0 ? text.slice(0, cut) : text, 'utf8')
          modules.set(m[1], { code: codeBytes, total: st.size })
          newest = Math.max(newest, st.mtimeMs)
        } catch (e) {
          /* 忽略损坏的缓存项 */
        }
      })
      // 用数据文件指纹确认这就是本项目
      if (!modules.has('data/pokedex.js')) return
      if (!best || newest > best.newest) best = { dir, modules, newest }
    })
  })
  if (!best) return null

  const entries = Array.from(best.modules.entries())
    .map(([name, size]) => ({ name, code: size.code, total: size.total }))
    .sort((a, b) => b.total - a.total)
  const total = entries.reduce((a, e) => a + e.total, 0)
  const codeTotal = entries.reduce((a, e) => a + e.code, 0)

  // 判断缓存是否已经落后于源码
  const newestSource = walk(ROOT, []).reduce((a, f) => {
    const st = fs.statSync(f)
    return path.extname(f) === '.js' ? Math.max(a, st.mtimeMs) : a
  }, 0)

  return {
    dir: best.dir,
    at: new Date(best.newest),
    entries,
    total,
    codeTotal,
    mapTotal: total - codeTotal,
    stale: newestSource > best.newest + 1000
  }
}

function uploadSourceMapEnabled() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'))
    return !!(cfg.setting && cfg.setting.uploadWithSourceMap)
  } catch (e) {
    return false
  }
}

/* ---------------------------------------------------------------- 输出 */

function kb(n) {
  return (n / 1024).toFixed(n >= 1024 * 1024 ? 0 : 0) + ' KB'
}

function mb(n) {
  return (n / 1024 / 1024).toFixed(2) + ' MB'
}

function buildReport() {
  const stats = collect()
  const compiled = readDevtoolsCompiled()
  const sourceMapOn = uploadSourceMapEnabled()
  // 真正计入上传体积的：编译后代码 + （uploadWithSourceMap 开启时的）sourcemap
  const effectiveSource = compiled ? (sourceMapOn ? compiled.total : compiled.codeTotal) : null
  const verdict = {
    sourceOk: effectiveSource === null ? null : effectiveSource <= SOURCE_LIMIT,
    zippedOk: stats.zipped <= SOURCE_LIMIT,
    totalOk: stats.total <= TOTAL_LIMIT
  }
  return { stats, compiled, sourceMapOn, effectiveSource, verdict }
}

function printText(report, quiet) {
  const { stats, compiled, sourceMapOn, effectiveSource, verdict } = report
  const lines = []
  if (!quiet) {
    lines.push('=== 代码包体积 ===')
    lines.push(`  根目录        ${stats.root}`)
    lines.push(`  参与打包      ${stats.count} 个文件`)
    lines.push(`  代码          ${kb(stats.code)}   （js/json/wxml/wxss，服务器按“源码包”计）`)
    lines.push(`  图片          ${kb(stats.image)}   （zip 基本压不动）`)
    lines.push(`  其他          ${kb(stats.other)}`)
    lines.push(`  合计          ${kb(stats.total)}`)
    lines.push(`  压缩后估算    ${kb(stats.zipped)}`)

    const top = stats.codeFiles.slice().sort((a, b) => b.size - a.size).slice(0, 5)
    if (top.length) {
      lines.push('')
      lines.push('  代码文件 Top5：')
      top.forEach((f) => lines.push(`    ${kb(f.size).padStart(8)}  ${f.relPosix}`))
    }
    lines.push('')
  }

  if (compiled) {
    lines.push(`=== 开发者工具编译产物（实测，${compiled.at.toLocaleString('zh-CN')}）===`)
    lines.push(`  编译后代码    ${kb(compiled.codeTotal)}`)
    lines.push(
      `  内联 sourcemap ${kb(compiled.mapTotal)}  （${sourceMapOn ? '会上传，计入体积' : 'uploadWithSourceMap=false，不上传'}）`
    )
    compiled.entries.slice(0, 5).forEach((e) => {
      lines.push(`    ${kb(e.total).padStart(8)}  ${e.name}  （代码 ${kb(e.code)}）`)
    })
    if (compiled.stale) {
      lines.push('  ! 缓存早于最近的源码改动：请在开发者工具里按 Ctrl+B 重新编译后再看这一项')
    }
  } else {
    lines.push('=== 开发者工具编译产物：未找到缓存（还没在本机编译过）===')
  }

  lines.push('')
  lines.push('=== 结论 ===')
  if (effectiveSource === null) {
    lines.push('  ? 源码包体积待编译后确认（上限 2MB）')
  } else if (verdict.sourceOk) {
    lines.push(`  ✓ 源码包 ≈ ${kb(effectiveSource)} ≤ 2MB`)
  } else {
    lines.push(`  ✗ 源码包 ≈ ${kb(effectiveSource)} > 2MB —— 上传会被服务器拒绝`)
    if (compiled && compiled.mapTotal > SOURCE_LIMIT / 2) {
      lines.push('    · sourcemap 占比很大：把 project.config.json 的 uploadWithSourceMap 设为 false')
    }
    lines.push('    · 代码本身过大：确认 data/*.js 是「单行 JSON 字符串」写法（node scripts/update-data.js reformat）')
  }
  lines.push(
    verdict.zippedOk
      ? `  ✓ 压缩后 ≈ ${kb(stats.zipped)} ≤ 2MB`
      : `  ✗ 压缩后 ≈ ${kb(stats.zipped)} > 2MB（需要拆分包或压缩图片）`
  )
  lines.push(
    verdict.totalOk ? `  ✓ 总包 ${kb(stats.total)} ≤ 20MB` : `  ✗ 总包 ${kb(stats.total)} > 20MB`
  )
  console.log(lines.join('\n'))
}

function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const quiet = args.includes('--quiet')
  const report = buildReport()
  if (json) {
    console.log(
      JSON.stringify({
        counts: { files: report.stats.count },
        sizes: {
          code: report.stats.code,
          image: report.stats.image,
          other: report.stats.other,
          total: report.stats.total,
          zipped: report.stats.zipped
        },
        compiled: report.compiled
          ? {
              codeTotal: report.compiled.codeTotal,
              mapTotal: report.compiled.mapTotal,
              total: report.compiled.total,
              at: report.compiled.at.toISOString(),
              stale: report.compiled.stale,
              entries: report.compiled.entries
            }
          : null,
        uploadWithSourceMap: report.sourceMapOn,
        effectiveSource: report.effectiveSource,
        limits: { source: SOURCE_LIMIT, total: TOTAL_LIMIT },
        ok: report.verdict
      })
    )
    return
  }
  printText(report, quiet)
  if (report.verdict.sourceOk === false) process.exitCode = 1
  if (!report.verdict.zippedOk || !report.verdict.totalOk) process.exitCode = 1
}

if (require.main === module) main()

module.exports = { buildReport, readDevtoolsCompiled, collect, SOURCE_LIMIT, TOTAL_LIMIT }
