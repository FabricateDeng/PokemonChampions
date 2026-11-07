// 读写本项目的数据文件（保持与原文件完全一致的格式，便于 diff 审查）。

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')

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

function json(value) {
  return JSON.stringify(value)
}

const HEADERS = {
  'data/pokedex.js': '// Generated from OP.GG Pokemon Champions Pokédex data. Do not edit by hand.',
  'data/usage.js': '// Generated from Smogon Champions BSS and Limitless / PokeCamp usage data.',
  'data/items.js': '// Item catalog used by the team builder.'
}

const EXPORTS = {
  'data/pokedex.js': 'module.exports = { TYPES, ABILITIES, MOVES, POKEMON, META, LEARN_COUNT };',
  'data/usage.js': 'module.exports = { VERSION, META, RANKINGS, USAGE };',
  'data/items.js': 'module.exports = { ITEMS };'
}

/**
 * 按仓库既有排版生成文件内容。
 * consts: [[name, value, { tight?: boolean }]]  tight = 与上一条之间不留空行
 */
function build(rel, consts) {
  let out = HEADERS[rel]
  consts.forEach(([name, value, opts], i) => {
    const gap = i === 0 || (opts && opts.tight) ? '\n' : '\n\n'
    out += gap + `const ${name} = ${json(value)};`
  })
  out += '\n\n' + EXPORTS[rel] + '\n'
  // 仓库里的 data/*.js 使用 CRLF，保持一致，避免整文件 diff
  return out.replace(/\n/g, '\r\n')
}

function write(rel, consts) {
  const content = build(rel, consts)
  fs.writeFileSync(path.join(ROOT, rel), content, 'utf8')
  return content.length
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
    // 原文件里 VERSION 与 META 相邻，不空行
    ['META', u.meta, { tight: true }],
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

module.exports = {
  ROOT,
  loadCurrent,
  build,
  writePokedex,
  writeUsage,
  writeItems,
  pokedexConsts,
  usageConsts,
  itemsConsts
}
