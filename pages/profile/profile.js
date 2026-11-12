const { META } = require('../../data/pokedex.js')
const fmt = require('../../utils/format.js')
const favs = require('../../utils/favs.js')
const monUtil = require('../../utils/mon.js')
const routes = require('../../utils/routes.js')
const store = require('../../utils/team-store.js')
const usageService = require('../../utils/usage-service.js')
const system = require('../../utils/system.js')

const SOURCES = [
  {
    key: 'opgg',
    name: 'OP.GG · Champions Pokédex',
    url: 'op.gg/zh-cn/pokemon-champions/pokedex',
    desc: '宝可梦名单、种族值、特性、招式与中文说明'
  },
  {
    key: 'serebii',
    name: 'Serebii.net · Champions Pokédex',
    url: 'serebii.net/pokedex-champions',
    desc: '名单、招式池与超级进化形态核对'
  },
  {
    key: 'smogon',
    name: 'Smogon · Champions BSS Stats',
    url: 'smogon.com/stats',
    desc: '单打使用率与配置统计'
  },
  {
    key: 'pokecamp',
    name: 'PokeCamp · Limitless Champions',
    url: 'pokecamp.cc/zh/champions',
    desc: '双打使用率与赛事配置统计'
  }
]

Page({
  data: {
    favs: [],
    favCount: 0,
    teamCount: 0,
    meta: META,
    infoRows: [],
    sources: SOURCES,
    version: '1.0.0',
    regLabel: '',
    regRange: ''
  },

  onShow() {
    system.applyPageBackground()
    this.load()
  },

  load() {
    const favorites = favs
      .list()
      .map((key) => monUtil.byKey()[key])
      .filter(Boolean)
      .map((m) => ({ key: m.key, name: m.name, sprite: m.sprite }))

    const usage = usageService.getUsage()
    const meta = (usage && usage.META) || {}
    const singles = meta.singles || {}
    const doubles = meta.doubles || {}
    // 使用率数据来源：内置 / 本地缓存 / 远程（用来确认热更新到底有没有生效）
    const sourceLabel = { remote: '远程', cache: '本地缓存', bundled: '内置' }[usageService.getSource()] || '内置'

    // 当前规则以双打样本的赛制为准（单打格式同为 reg M-C）
    const regLabel = doubles.regulation || 'M-C'
    const regRange = doubles.from && doubles.to
      ? `${doubles.from.slice(5).replace('-', '.')} – ${doubles.to.slice(5).replace('-', '.')}`
      : ''

    const ranked = new Set(
      [].concat(
        (usage.RANKINGS && usage.RANKINGS.singles) || [],
        (usage.RANKINGS && usage.RANKINGS.doubles) || []
      ).map((row) => row.key)
    )
    const covered = ranked.size

    this.setData({
      favs: favorites,
      favCount: favorites.length,
      teamCount: store.listTeams().length,
      regLabel,
      regRange,
      infoRows: [
        { key: 'reg', isKey: true, label: '当前规则', value: `规则 ${regLabel}${regRange ? '（' + regRange + '）' : ''}` },
        { key: 'count', label: '收录', value: `${META.count} 只 · ${META.megaCount} 个超级进化` },
        { key: 'moves', label: '招式', value: `${META.moveCount} 个 · 特性 ${META.abilityCount} 个` },
        { key: 'data', label: '图鉴数据', value: `更新于 ${META.updated}` },
        {
          key: 'singles',
          label: '单打榜单',
          value: singles.source
            ? `${singles.source} · ${singles.month} · ${singles.cutoff} 分位 · ${fmt.comma(singles.battles)} 场`
            : '—'
        },
        {
          key: 'doubles',
          label: '双打榜单',
          value: doubles.source
            ? `${doubles.source} · ${doubles.regulation} · 近 30 天 · ${doubles.tournaments} 项赛事`
            : '—'
        },
        {
          key: 'coverage',
          label: '使用率覆盖',
          value: `榜单收录 ${covered} 只，其余 ${Math.max(0, META.count - covered)} 只标注未上榜`
        },
        { key: 'usageVer', label: '使用率版本', value: `${usage.VERSION || '—'} · ${sourceLabel}` },
        { key: 'sp', label: '能力值体系', value: 'Lv.50 / IV 31 / 0–32 SP（总和 66）' }
      ]
    })
  },

  openDetail(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.navigateTo({ url: routes.detail(key) })
  },

  goIndex() {
    wx.switchTab({ url: routes.index })
  },

  goTeams() {
    wx.switchTab({ url: routes.teams })
  },

  onShareAppMessage() {
    return {
      title: '宝可梦冠军图鉴｜种族值 · 特性 · 招式 · 使用率',
      path: routes.index,
      imageUrl: '/assets/share.png'
    }
  }
})
