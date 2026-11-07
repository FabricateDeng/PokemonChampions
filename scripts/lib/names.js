// 通用：把外部数据源的英文名/键，映射到本项目使用的 key 与中文名。

const OVERRIDES = {
  // 外部名字 → 本项目 key（按需增补，脚本会打印未匹配项）
  ninetalesalola: 'ninetales-alolan',
  ninetalesalolan: 'ninetales-alolan',
  slowkinggalar: 'slowking-galarian',
  slowbrogalar: 'slowbro-galarian',
  indeedee: 'indeedee-male',
  basculegion: 'basculegion-male',
  meowstic: 'meowstic-male',
  maushold: 'maushold-family-of-four',
  squawkabilly: 'squawkabilly-green-plumage',
  meowsticfmega: 'mega-meowstic',
  meowsticmmega: 'mega-meowstic',
  meowsticm: 'meowstic-male',
  meowsticf: 'meowstic-female',
  taurospaldeablaze: 'tauros-paldean-blaze',
  taurospaldeacombat: 'tauros-paldean-combat',
  taurospaldeaaqua: 'tauros-paldean-aqua',
  toxtricity: 'toxtricity-amped',
  floetteeternal: 'floette-eternal',
  mrisme: 'mr-mime',
  mrrime: 'mr-rime',
  sirfetchd: 'sirfetchd',
  gourgeistsmall: 'gourgeist-small',
  gourgeistlarge: 'gourgeist-large',
  gourgeistsuper: 'gourgeist-super',
  urshifu: 'urshifu-single-strike',
  zacleancrowned: 'zacian-crowned',
  zamazentacrowned: 'zamazenta-crowned',
  eterntusmax: 'eternatus-eternamax',
  darmanitangalarzen: 'darmanitan-galar-zen',
  zygardecomplete: 'zygarde-complete'
}

function squash(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function kebab(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * 生成候选 key（按优先级）。knownKeys 用于「同名多形态」时挑已存在的那个。
 */
function candidates(name, knownKeys) {
  const k = kebab(name)
  const sq = squash(name)
  const out = []

  const push = (v) => {
    if (v && out.indexOf(v) === -1) out.push(v)
  }

  if (OVERRIDES[sq]) push(OVERRIDES[sq])

  push(k)

  // Charizard-Mega-Y → mega-charizard-y / Baxcalibur-Mega → mega-baxcalibur
  let m
  if ((m = /^(.+)-mega(?:-([a-z0-9]+))?$/.exec(k))) push(`mega-${m[1]}${m[2] ? '-' + m[2] : ''}`)
  // Indeedee-M / Indeedee-F
  if ((m = /^(.+)-m$/.exec(k))) push(`${m[1]}-male`)
  if ((m = /^(.+)-f$/.exec(k))) push(`${m[1]}-female`)
  // Ninetales-Alola → ninetales-alolan
  if ((m = /^(.+)-alola$/.exec(k))) push(`${m[1]}-alolan`)
  if ((m = /^(.+)-galar$/.exec(k))) push(`${m[1]}-galarian`)
  if ((m = /^(.+)-hisui$/.exec(k))) push(`${m[1]}-hisuian`)
  if ((m = /^(.+)-paldea$/.exec(k))) push(`${m[1]}-paldean`)
  // Tauros-Paldea-Blaze → tauros-paldean-blaze
  if ((m = /^(.+)-paldea-(.+)$/.exec(k))) push(`${m[1]}-paldean-${m[2]}`)

  // 名字已含后缀但项目里是另一种写法：用已知 key 里以 `<k>-` 开头的唯一项
  if (knownKeys) {
    const prefixed = []
    knownKeys.forEach((key) => {
      if (key === k) return
      if (key.indexOf(k + '-') === 0) prefixed.push(key)
      if (squash(key) === sq) push(key)
    })
    if (prefixed.length === 1) push(prefixed[0])
  }

  return out.filter(Boolean)
}

function resolve(name, knownKeys) {
  const list = candidates(name, knownKeys)
  for (let i = 0; i < list.length; i += 1) {
    if (knownKeys.has(list[i])) return list[i]
  }
  return null
}

module.exports = { OVERRIDES, squash, kebab, candidates, resolve }
