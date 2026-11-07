#!/usr/bin/env node
/**
 * 运行时冒烟测试：打桩 wx，真正执行每个页面的 onLoad / onShow 和主要事件处理，
 * 断言不抛异常且数据合理。弥补「静态校验看不出运行时错误」的空白。
 *
 *   node scripts/smoke.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const storage = {}
let nav = []

// 数据量随更新变化，断言里不要写死
const DATASET = require(path.join(ROOT, 'data', 'pokedex.js')).META
const MON_TOTAL = DATASET.count
const MOVE_TOTAL = DATASET.moveCount

const wx = {
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, screenHeight: 812, safeArea: { bottom: 812 } }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812 }),
  getMenuButtonBoundingClientRect: () => ({ top: 48, height: 32, width: 87, right: 367 }),
  getStorageSync: (k) => (k in storage ? storage[k] : ''),
  setStorageSync: (k, v) => {
    storage[k] = JSON.parse(JSON.stringify(v))
  },
  showToast: () => {},
  hideToast: () => {},
  showModal: () => {},
  navigateTo: (o) => nav.push(['navigateTo', o.url]),
  redirectTo: (o) => nav.push(['redirectTo', o.url]),
  switchTab: (o) => nav.push(['switchTab', o.url]),
  reLaunch: (o) => nav.push(['reLaunch', o.url]),
  navigateBack: () => nav.push(['navigateBack']),
  pageScrollTo: () => {},
  request: () => {},
  stopPullDownRefresh: () => {}
}
global.wx = wx
global.getApp = () => ({ globalData: {} })
global.getCurrentPages = () => [{}, {}]

let failures = 0
let checks = 0

function ok(cond, label) {
  checks += 1
  if (!cond) {
    failures += 1
    console.log('  ✗ ' + label)
  }
}

function loadPage(rel) {
  let cfg = null
  global.Page = (c) => {
    cfg = c
  }
  global.Component = () => {}
  delete require.cache[require.resolve(path.join(ROOT, rel + '.js'))]
  require(path.join(ROOT, rel + '.js'))
  return cfg
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

function instantiate(rel, query) {
  const cfg = loadPage(rel)
  const inst = {}
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
  if (cfg.onLoad) inst.onLoad(query || {})
  return inst
}

function event(dataset, detail) {
  return { currentTarget: { dataset: dataset || {} }, detail: detail || {} }
}

function seed() {
  const store = require(path.join(ROOT, 'utils', 'team-store.js'))
  const mk = (key, moves, sp, nature, item) => {
    const mon = store.MON_BY_KEY[key]
    return {
      key,
      ability: mon.abilities[0],
      item: item || '',
      nature: nature || 'hardy',
      sp,
      moves
    }
  }
  storage.champion_teams_v1 = [
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
      members: [mk('tyranitar', ['stone-edge', 'crunch', 'earthquake'], [32, 32, 0, 0, 2, 0], 'adamant'), null, null, null, null, null]
    }
  ]
  storage.champion_favs = ['primarina', 'gholdengo']
}

function run(name, fn) {
  const before = failures
  try {
    fn()
  } catch (e) {
    failures += 1
    console.log(`  ✗ ${name} 抛异常：${e && e.message}`)
    if (e && e.stack) console.log('    ' + e.stack.split('\n')[1].trim())
  }
  if (failures === before) console.log('  ✓ ' + name)
}

seed()
require(path.join(ROOT, 'utils', 'usage-service.js'))
nav = []

/* ---------------------------------------------------------------- 图鉴 */

run('图鉴：首屏与筛选', () => {
  const p = instantiate('pages/index/index')
  ok(p.data.monCount === MON_TOTAL, '默认 ' + MON_TOTAL + ' 只，实际 ' + p.data.monCount)
  ok(p.data.monList.length === 30, '首屏 30 条，实际 ' + p.data.monList.length)
  ok(p.data.typeList.length === 19, '属性 chip 19 个')

  p.onType(event({ key: 'grass' }))
  ok(p.data.monCount > 0 && p.data.monCount < 348, '草属性子集，实际 ' + p.data.monCount)
  ok(p.data.monList.every((m) => m.typesInfo.some((t) => t.key === 'grass')), '筛选结果都含草')

  p.onSearch(event({}, { value: '妙蛙' }))
  // 搜索有 150ms 防抖，这里直接跑一次筛选
  p.applyMon(true)
  ok(p.data.monCount >= 1 && p.data.monCount <= 4, '搜索「妙蛙」命中 ' + p.data.monCount)

  p.clearFilters()
  ok(p.data.monCount === MON_TOTAL, '清除筛选回到 ' + MON_TOTAL + '，实际 ' + p.data.monCount)

  p.onSort(event({ index: 1 }))
  ok(p.data.monList[0].total >= p.data.monList[1].total, '按种族值降序')

  p.onOnlyFav()
  ok(p.data.monCount === 2, '只看收藏应为 2，实际 ' + p.data.monCount)
  p.onOnlyFav()

  p.onMode(event({}, { key: 'move' }))
  ok(p.data.moveCount === MOVE_TOTAL, '招式视图 ' + MOVE_TOTAL + ' 个，实际 ' + p.data.moveCount)
  p.onMoveCat(event({ index: 1 }))
  ok(p.data.moveList.every((m) => m.cat === 'physical'), '物理分类筛选')
  p.onMode(event({}, { key: 'mon' }))
  ok(p.data.monCount === MON_TOTAL, '切回宝可梦视图')

  p.toggleFav(event({ key: 'dragapult' }))
  const favs = require(path.join(ROOT, 'utils', 'favs.js')).list()
  ok(favs.indexOf('dragapult') >= 0, '收藏写入 storage')
  p.toggleFav(event({ key: 'dragapult' }))
  ok(require(path.join(ROOT, 'utils', 'favs.js')).list().indexOf('dragapult') === -1, '取消收藏')

  p.onReachBottom()
  ok(p.data.monList.length === 60, '触底追加到 60 条，实际 ' + p.data.monList.length)
})

/* ---------------------------------------------------------------- 详情 */

run('详情：三个视图与加入队伍', () => {
  const p = instantiate('pages/detail/detail', { key: 'primarina' })
  ok(p.data.mon && p.data.mon.key === 'primarina', '加载宝可梦')
  ok(p.data.stats.length === 6 && p.data.stats[0].value === 80, '六项种族值')
  ok(p.data.matchups.length >= 2, '属性相性分组')
  ok(p.data.abilities.length === 2, '特性 2 个')
  ok(p.data.totalRank > 0, '种族值排名')

  p.onTab(event({}, { key: 'moves' }))
  ok(p.data.activeTab === 'moves' && p.data.moves.length > 40, '招式列表 ' + p.data.moves.length)
  p.onMoveCat(event({ index: 1 }))
  ok(p.data.moves.every((m) => m.cat === 'physical'), '招式按物理筛选')
  p.onMoveCatReset()
  ok(p.data.moveCatIndex === 0, '恢复全部招式')

  p.onTab(event({}, { key: 'usage' }))
  ok(p.data.usageSummary && p.data.usageSummary.pctText.indexOf('%') > 0, '使用率摘要')
  ok(p.data.usageSections.length >= 4, '使用率分区 ' + p.data.usageSections.length)
  p.onUsageFormat(event({ key: 'doubles' }))
  ok(p.data.usageFormat === 'doubles', '切换双打')

  p.openTeams()
  ok(p.data.teams.length === 2, '队伍面板 2 支')
  const store = require(path.join(ROOT, 'utils', 'team-store.js'))
  // 已在 t1 里的宝可梦：应当被拒绝，槽位数不变
  p.addToTeam('t1')
  ok(store.getTeam('t1').members.filter(Boolean).length === 3, '已在队伍中的宝可梦不会被重复加入')

  // 换一只不在队伍里的宝可梦：应落到第 4 位
  const other = instantiate('pages/detail/detail', { key: 'kingambit' })
  other.openTeams()
  other.addToTeam('t1')
  const slot4 = store.getTeam('t1').members[3]
  ok(slot4 && slot4.key === 'kingambit', '新宝可梦加入第 4 位')
})

run('详情：不存在的 key 走空态', () => {
  const p = instantiate('pages/detail/detail', { key: 'not-a-mon' })
  ok(p.data.notFound === true, 'notFound 置位')
})

/* ---------------------------------------------------------------- 榜单 */

run('榜单：单打/双打', () => {
  const p = instantiate('pages/rankings/rankings')
  ok(p.data.count === 50, 'TOP50，实际 ' + p.data.count)
  ok(p.data.totalCount === MON_TOTAL, '全部精灵 ' + MON_TOTAL + ' 只，实际 ' + p.data.totalCount)
  ok(p.data.top.length === 3, '前三名')
  ok(p.data.rows.length === 47, '其余 47 行')
  p.onFormat(event({}, { key: 'doubles' }))
  ok(p.data.format === 'doubles' && p.data.count === 50, '切换双打')

  // 全部精灵视图：未上榜也要有自己的行
  p.onScope(event({ key: 'all' }))
  ok(p.data.scope === 'all', '切到全部精灵')
  ok(p.data.top.length === 0, '全部视图不显示 TOP3')
  ok(p.data.count === MON_TOTAL, '全部 ' + MON_TOTAL + ' 只，实际 ' + p.data.count)
  ok(p.data.rows.length === 50, '首屏 50 行，实际 ' + p.data.rows.length)
  ok(p.data.hasMore === true, '还有更多')
  p.onReachBottom()
  ok(p.data.rows.length === 100, '触底追加到 100 行，实际 ' + p.data.rows.length)
  ok(p.data.rows.some((r) => r.unranked && r.usageText.indexOf('<') === 0), '未上榜行给出使用率上界')

  p.onScope(event({ key: 'top' }))
  ok(p.data.scope === 'top' && p.data.rows.length === 47, '切回 TOP50')
})

run('详情：未上榜精灵也有使用率', () => {
  const p = instantiate('pages/detail/detail', { key: 'charizard', tab: 'usage' })
  ok(p.data.usageBounded === true, '未上榜标记')
  ok(p.data.usageSummary && p.data.usageSummary.rankText === '未上榜', '排名显示未上榜')
  ok(p.data.usageSummary.pctText.indexOf('<') === 0, '给出使用率上界 ' + p.data.usageSummary.pctText)
  ok(p.data.usageSections.length === 0, '没有配置分布')
  p.onUsageFormat(event({ key: 'doubles' }))
  ok(p.data.usageSummary.pctText.indexOf('<') === 0, '双打同样给出上界 ' + p.data.usageSummary.pctText)
})

/* ---------------------------------------------------------------- 队伍 */

run('队伍列表', () => {
  const p = instantiate('pages/teams/teams')
  p.onShow()
  ok(p.data.teams.length === 2, '2 支队伍，实际 ' + p.data.teams.length)
  ok(p.data.teams[0].slots.length === 6, '每队 6 槽')
  ok(p.data.teams[0].count >= 3, '首队成员数 ' + p.data.teams[0].count)
  p.createTeam()
  ok(nav[nav.length - 1][1].indexOf('/pages/team/team?id=') === 0, '新建后跳转队伍编辑')
})

run('队伍编辑', () => {
  const p = instantiate('pages/team/team', { id: 't1' })
  p.onShow()
  ok(p.data.slots.length === 6 && p.data.count >= 3, '6 槽位 / 已填 ' + p.data.count)
  ok(p.data.canCalc === true, '人数足够可计算')
  ok(p.data.slots[0].moveText.indexOf('/') > 0, '招式文本')
  p.onNameInput(event({}, { value: '改名后' }))
  p.onNameBlur()
  ok(require(path.join(ROOT, 'utils', 'team-store.js')).getTeam('t1').name === '改名后', '队名自动保存')
  p.deleteTeam() // showModal 被打桩为无操作，只验证不抛异常
  ok(true, '删除流程不抛异常')
})

/* ---------------------------------------------------------------- 选择宝可梦 */

run('选择宝可梦', () => {
  const p = instantiate('pages/picker/picker', { teamId: 't1', slot: 3 })
  ok(p.data.count === MON_TOTAL, MON_TOTAL + ' 只可选')
  ok(p.data.list.length === 40, '首屏渲染 40 条，实际 ' + p.data.list.length)
  p.setData({ query: '多龙' })
  p.apply(true)
  ok(p.data.list.some((m) => m.inTeam), '标记已在队伍')
  p.clearQuery()
  ok(p.data.count === MON_TOTAL, '清空搜索回到 ' + MON_TOTAL)
  p.onType(event({ key: 'dragon' }))
  ok(p.data.count > 0 && p.data.count < 348, '龙属性子集 ' + p.data.count)
  nav = []
  p.select(event({ key: 'venusaur' }))
  ok(nav.length === 1 && nav[0][0] === 'redirectTo', '选中后 redirectTo 成员配置')
})

/* ---------------------------------------------------------------- 成员配置 */

run('成员配置', () => {
  const p = instantiate('pages/member/member', { teamId: 't1', slot: 1 })
  const store = require(path.join(ROOT, 'utils', 'team-store.js'))
  ok(p.data.mon && p.data.mon.name === '赛富豪', '加载成员')
  ok(p.data.rows.length === 6, '能力值/努力值 6 行')
  ok(p.data.rows[0].value === 194, 'HP 194，实际 ' + p.data.rows[0].value)
  ok(p.data.rows[0].sp === 32 && p.data.rows[0].spText === '32', '努力值文本回显')
  ok(p.data.rows[3].mark === '+' && p.data.rows[1].mark === '−', '性格修正标记（+特攻 / −攻击）')
  ok(p.data.spTotal === 66, '努力值 66，实际 ' + p.data.spTotal)
  ok(p.data.moveSlots.length === 4 && p.data.moveSlots.every((s) => !s.empty), '四个招式位已填满')

  // 步进器：满 66 时不能再加
  p.changeSp(event({ index: 0, delta: 1 }))
  ok(p.data.spTotal === 66, '上限被拦截（仍为 66）')

  // 键盘填努力值：即时反映到能力值
  p.onSpInput(event({ index: 0 }, { value: '20' }))
  ok(store.getTeam('t1').members[1].sp[0] === 20, '努力值输入写入 storage')
  ok(p.data.spTotal === 54 && p.data.spLeft === 12, '总和与剩余即时更新：' + p.data.spTotal)
  ok(p.data.rows[0].value === 182, 'HP 随努力值即时变为 182，实际 ' + p.data.rows[0].value)

  // 越界输入在失焦时截断
  p.onSpBlur(event({ index: 0 }, { value: '99' }))
  ok(store.getTeam('t1').members[1].sp[0] === 32, '超上限截断到 32')

  // 键盘填能力值：反解努力值（先腾出点数）
  p.onSpInput(event({ index: 0 }, { value: '20' }))
  const beforeValue = p.data.rows[2].value
  p.onStatBlur(event({ index: 2 }, { value: '130' }))
  const afterRow = p.data.rows[2]
  ok(afterRow.sp > 0, '填写能力值 130 → 反解出防御努力值 ' + afterRow.sp)
  ok(afterRow.value > beforeValue && afterRow.value <= 130, '反解后防御能力值 ' + afterRow.value + '（原 ' + beforeValue + '）')
  ok(p.data.spTotal <= 66, '反解后总和不超过 66：' + p.data.spTotal)

  // 无法达成时给出最接近值而不是崩掉
  p.onStatBlur(event({ index: 2 }, { value: '999' }))
  ok(p.data.rows[2].value > 0 && p.data.spTotal <= 66, '极端目标值不越界')

  // 空输入 / 非法输入回退
  p.onStatBlur(event({ index: 2 }, { value: '' }))
  p.onSpBlur(event({ index: 2 }, { value: 'abc' }))
  ok(p.data.rows[2].sp >= 0, '非法输入被忽略')

  p.openSheet(event({ kind: 'item' }))
  ok(p.data.itemList.length === 60, '道具面板首批 60 项')
  p.onItemSearch(event({}, { value: '果' }))
  p.setData({ itemList: p.filterItems('果') })
  ok(p.data.itemList.length > 0 && p.data.itemList.every((i) => i.name.indexOf('果') >= 0 || i.name === '无道具'), '道具搜索')
  p.pickItem(event({ key: 'sitrus-berry' }))
  ok(store.getTeam('t1').members[1].item === 'sitrus-berry', '道具保存')

  p.openSheet(event({ kind: 'move', slot: 0 }))
  ok(p.data.moveList.length > 0 && p.data.moveList.some((m) => m.selected), '招式面板含已选标记')
  p.onMoveCat(event({ index: 2 }))
  ok(p.data.moveList.every((m) => m.cat === 'special'), '特殊招式筛选')

  p.openSheet(event({ kind: 'nature' }))
  ok(p.data.natureList.length === 25, '25 种性格')
  p.pickNature(event({ key: 'timid' }))
  ok(store.getTeam('t1').members[1].nature === 'timid', '性格保存')
  ok(p.data.rows[5].mark === '+' && p.data.rows[1].mark === '−', '换性格后标记随之变化')

  p.openSheet(event({ kind: 'ability' }))
  ok(p.data.abilityList.length >= 1 && p.data.abilityList[0].selected === true, '特性面板默认选中首项')

  p.resetSp()
  ok(p.data.spTotal === 0 && p.data.rows.every((r) => r.sp === 0), '重置努力值')
})

/* ---------------------------------------------------------------- 伤害计算 */

run('伤害计算', () => {
  const p = instantiate('pages/calc/calc', { teamId: 't1' })
  ok(p.data.hasTeams && !p.data.needsMembers, '队伍可用')
  ok(p.data.attacker && p.data.defender, '攻守双方已就位')
  ok(p.data.moveOptions.length === 4, '四个招式可选')
  ok(p.data.result && p.data.result.percentText.indexOf('%') > 0, '自动出结果 ' + (p.data.result && p.data.result.percentText))
  const before = p.data.result.percentText
  p.toggleField(event({ key: 'crit' }))
  ok(p.data.result.percentText !== before, '暴击影响结果：' + before + ' → ' + p.data.result.percentText)
  p.onMove(event({ index: 3 })) // 守住，变化招式
  ok(p.data.result === null && p.data.resultReason.length > 0, '变化招式给出原因：' + p.data.resultReason)
  p.onMove(event({ index: 0 }))
  ok(p.data.result !== null, '切回攻击招式恢复结果')
  p.onStage(event({ field: 'atk', delta: 1 }))
  ok(p.data.atkStageText === '+1', '攻击强化 +1')
  p.toggleMore()
  ok(p.data.more === true, '展开更多条件')
})

run('伤害计算：队伍不足', () => {
  const p = instantiate('pages/calc/calc', { teamId: 't2' })
  ok(p.data.needsMembers === true, '单只队伍触发人数不足空态')
})

run('伤害计算：没有队伍', () => {
  const saved = storage.champion_teams_v1
  storage.champion_teams_v1 = []
  const p = instantiate('pages/calc/calc', {})
  ok(p.data.hasTeams === false, '无队伍触发空态')
  storage.champion_teams_v1 = saved
})

/* ---------------------------------------------------------------- 我的 */

run('我的', () => {
  const p = instantiate('pages/profile/profile')
  p.onShow()
  ok(p.data.favs.length === 2, '收藏 2 只，实际 ' + p.data.favs.length)
  ok(p.data.teamCount >= 2, '队伍数量 ' + p.data.teamCount)
  ok(p.data.infoRows.length >= 5, '数据说明行数')
})

/* ---------------------------------------------------------------- 组件 */

run('公共组件', () => {
  const system = require(path.join(ROOT, 'utils', 'system.js'))
  const m = system.getMetrics()
  ok(m.navTotalHeight === 84, '导航总高 = 44 + 胶囊推导 40，实际 ' + m.navTotalHeight)
  ok(require(path.join(ROOT, 'utils', 'routes.js')).detail('a b') === '/pages/detail/detail?key=a%20b', '路由编码')
})

console.log(`\n${failures === 0 ? '✓' : '✗'} 冒烟测试：${checks} 项断言，${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)

