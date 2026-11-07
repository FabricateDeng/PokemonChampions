// 读写本项目的数据文件。
//
// 重要：数据必须以「单行 JSON 字符串 + 运行时 JSON.parse」的形式写出。
// 原因：微信开发者工具编译时会用 Babel 把 ES6 转成 ES5，Babel 的代码生成器会把
// 巨大的对象/数组字面量重新排版（每个字段一行 + 缩进），实测：
//   data/pokedex.js  497KB → 编译后 2837KB（5.7 倍）
//   data/usage.js    116KB → 编译后 1264KB（10.9 倍）
// 而服务器对「源码包」有 2MB 上限，于是上传直接失败。
// 写成字符串字面量后，Babel 原样保留，编译后体积 ≈ 源文件体积。

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')

const PAYLOAD_NAME = 'DATA'

function loadFresh(rel) {
  const file = path.join(ROOT, rel)
  delete require.cache[require.resolve(file)]
  return require(file)
}

function loadCurrent() {
  return {
    pokedex: loadFresh('data/pokedex.js'),
    usage: loadFresh('data/usage.js'),
    items: loadFresh('data/items.js')
  }
}

const HEADERS = {
  'data/pokedex.js': '// Generated from OP.GG Pokemon Champions Pokédex data. Do not edit by hand.',
  'data/usage.js': '// Generated from Smogon Champions BSS and Limitless / PokeCamp usage data.',
  'data/items.js': '// Item catalog used by the team builder.'
}

const NOTE =
  '// 单行 JSON 载荷：避免开发者工具 Babel 重新排版大对象字面量（否则编译后体积翻 5~10 倍，' +
  '超过源码包 2MB 上限）。请勿改写成多行对象字面量。'

/** 把任意文本包成单引号 JS 字符串字面量（只需转义 \ 与 ' 以及行分隔符）。 */
function jsString(text) {
  return (
    "'" +
    text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029') +
    "'"
  )
}

/**
 * 生成文件内容。
 * consts: [[name, value]]，顺序即导出顺序（保持稳定，便于 diff）。
 */
function build(rel, consts) {
  const names = consts.map((c) => c[0])
  const payload = JSON.stringify(Object.fromEntries(consts.map((c) => [c[0], c[1]])))
  const destructure = `const { ${names.join(', ')} } = ${PAYLOAD_NAME};`
  const out = [
    HEADERS[rel],
    NOTE,
    `const ${PAYLOAD_NAME} = JSON.parse(${jsString(payload)});`,
    destructure,
    `module.exports = { ${names.join(', ')} };`
  ].join('\n')
  return out + '\n'
}

function write(rel, consts) {
  const content = build(rel, consts)
  fs.writeFileSync(path.join(ROOT, rel), content, 'utf8')
  // 返回字节数（不是字符数：中文一个字符占 3 字节）
  return Buffer.byteLength(content, 'utf8')
}

function pokedexConsts(d) {
  return [
    ['TYPES', d.types],
    ['ABILITIES', d.abilities],
    ['MOVES', d.moves],
    ['POKEMON', d.pokemon],
    ['META', d.meta],
    ['LEARN_COUNT', d.learnCount]
  ]
}

function usageConsts(u) {
  return [
    ['VERSION', u.version],
    ['META', u.meta],
    ['RANKINGS', u.rankings],
    ['USAGE', u.usage]
  ]
}

function itemsConsts(items) {
  return [['ITEMS', items]]
}

function writePokedex(d) {
  return write('data/pokedex.js', pokedexConsts(d))
}

function writeUsage(u) {
  return write('data/usage.js', usageConsts(u))
}

function writeItems(items) {
  return write('data/items.js', itemsConsts(items))
}

/** 从现有 data/*.js 反向读出数据（不需要联网），用于 reformat 重排。 */
function readCurrent() {
  const d = loadCurrent()
  return {
    pokedex: {
      types: d.pokedex.TYPES,
      abilities: d.pokedex.ABILITIES,
      moves: d.pokedex.MOVES,
      pokemon: d.pokedex.POKEMON,
      meta: d.pokedex.META,
      learnCount: d.pokedex.LEARN_COUNT
    },
    usage: {
      version: d.usage.VERSION,
      meta: d.usage.META,
      rankings: d.usage.RANKINGS,
      usage: d.usage.USAGE
    },
    items: d.items.ITEMS
  }
}

/** 按当前数据重排三个文件，返回每个文件的字节数。 */
function rewriteAll() {
  const cur = readCurrent()
  return {
    'data/pokedex.js': writePokedex(cur.pokedex),
    'data/usage.js': writeUsage(cur.usage),
    'data/items.js': writeItems(cur.items)
  }
}

module.exports = {
  ROOT,
  PAYLOAD_NAME,
  loadCurrent,
  readCurrent,
  rewriteAll,
  build,
  jsString,
  writePokedex,
  writeUsage,
  writeItems,
  pokedexConsts,
  usageConsts,
  itemsConsts
}
