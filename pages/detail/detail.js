const { META, MOVES, ABILITIES } = require('../../data/pokedex.js')
const monUtil = require('../../utils/mon.js')
const ui = require('../../utils/ui.js')
const fmt = require('../../utils/format.js')
const favs = require('../../utils/favs.js')
const routes = require('../../utils/routes.js')
const store = require('../../utils/team-store.js')
const system = require('../../utils/system.js')
const usageService = require('../../utils/usage-service.js')
const { getDefenseMatchup } = require('../../utils/type-chart.js')

// move name -> move key, for the usage section where data only carries names.
const MOVE_KEY_BY_NAME = {}
Object.keys(MOVES).forEach((k) => {
  MOVE_KEY_BY_NAME[MOVES[k].name] = k
})

const STAT_LABELS = ['HP', '攻击', '防御', '特攻', '特防', '速度']
const STAT_MAX = 160

const TABS = [
  { key: 'stats', label: '数据' },
  { key: 'moves', label: '招式' },
  { key: 'usage', label: '使用率' }
]

const MOVE_CATS = [
  { key: 'all', name: '全部' },
  { key: 'physical', name: '物理' },
  { key: 'special', name: '特殊' },
  { key: 'status', name: '变化' }
]

const MATCHUP_ROWS = [
  { key: 'x4', mult: '×4', label: '四倍弱点', tone: 'weak' },
  { key: 'x2', mult: '×2', label: '弱点', tone: 'weak' },
  { key: 'x05', mult: '×0.5', label: '抵抗', tone: 'resist' },
  { key: 'x025', mult: '×0.25', label: '强抵抗', tone: 'resist' },
  { key: 'x0', mult: '×0', label: '免疫', tone: 'immune' }
]

Page({
  data: {
    notFound: false,
    navTotalHeight: 64,
    mon: null,
    fav: false,

    tabs: TABS,
    activeTab: 'stats',

    stats: [],
    totalRank: 0,
    totalCount: META.count,

    matchups: [],

    abilities: [],

    moveCats: MOVE_CATS,
    moveCatIndex: 0,
    moves: [],
    moveCount: 0,

    sheet: false,
    teams: [],

    usageFormat: 'singles',
    usageFormats: [],
    usageEmpty: false,
    usageFormatEmpty: false,
    usageSummary: null,
    usageSections: []
  },

  onLoad(options) {
    const metrics = system.getMetrics()
    this.raw = null
    this.usageRaw = null

    let key = (options && options.key) || ''
    try {
      key = decodeURIComponent(key)
    } catch (e) {
      // keep the raw value
    }

    const found = monUtil.byKey()[key]
    if (!found) {
      this.setData({ notFound: true, navTotalHeight: metrics.navTotalHeight })
      return
    }

    this.raw = found
    this.favSet = favs.asSet()
    this.movesAll = found.moves.map((k) => ui.moveView(k)).filter(Boolean)

    const stats = found.stats.map((value, i) => ({
      key: 'stat' + i,
      label: STAT_LABELS[i],
      value,
      percent: Math.min(100, Math.round((value / STAT_MAX) * 100)) + '%'
    }))

    const matchup = getDefenseMatchup(found.types)
    const matchups = MATCHUP_ROWS.map((row) => {
      const types = matchup[row.key] || []
      if (!types.length) return null
      return {
        key: row.key,
        mult: row.mult,
        label: row.label,
        tone: row.tone,
        types: types.map(ui.typeInfo)
      }
    }).filter(Boolean)

    const abilities = found.abilities.map((k, i) => ({
      key: k,
      index: String(i + 1).padStart(2, '0'),
      name: (ABILITIES[k] || {}).name || k,
      desc: (ABILITIES[k] || {}).desc || '暂无说明'
    }))

    const tabs = TABS.map((t) => (t.key === 'moves' ? { ...t, badge: String(found.count.moves) } : t))

    this.setData({
      navTotalHeight: metrics.navTotalHeight,
      mon: {
        key: found.key,
        name: found.name,
        dexLabel: found.dexLabel,
        dex: found.dex,
        gen: found.gen,
        total: found.total,
        reg: found.reg,
        formLabel: found.formLabel,
        formShort: found.formShort,
        sprite: found.sprite,
        typesInfo: found.typesInfo,
        count: found.count,
        glow: ui.hexToRgba(found.typesInfo[0].color, 0.16)
      },
      fav: this.favSet.has(found.key),
      tabs,
      stats,
      totalRank: ui.totalRank(found.key),
      matchups,
      abilities,
      moves: this.movesAll,
      moveCount: this.movesAll.length
    })

    const initialTab = options && options.tab === 'usage' ? 'usage' : 'stats'
    if (initialTab !== 'stats') this.setData({ activeTab: initialTab })

    this.loadUsage(options && options.format)
  },

  onShow() {
    if (!this.raw) return
    this.favSet = favs.asSet()
    const fav = this.favSet.has(this.raw.key)
    if (fav !== this.data.fav) this.setData({ fav })
    if (this.data.sheet) this.refreshTeams()
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe()
  },

  /* ------------------------------------------------------------ 使用率 */

  loadUsage(preferred) {
    const data = usageService.getUsage()
    this.applyUsage(data, preferred)
    this.unsubscribe = usageService.subscribe((next) => this.applyUsage(next, this.data.usageFormat))
    usageService.refresh()
  },

  applyUsage(data, preferred) {
    if (!data || !this.raw) return
    this.usageData = data
    this.usageRaw = (data.USAGE && data.USAGE[this.raw.key]) || null

    const hasSingles = !!(this.usageRaw && this.usageRaw.s)
    const hasDoubles = !!(this.usageRaw && this.usageRaw.d)
    let format = preferred === 'doubles' || preferred === 'singles' ? preferred : ''
    if (!format) format = hasSingles ? 'singles' : hasDoubles ? 'doubles' : 'singles'

    this.setData({
      usageFormats: [
        { key: 'singles', label: '单打' },
        { key: 'doubles', label: '双打' }
      ]
    })
    this.buildUsage(format)
  },

  buildUsage(format) {
    const u = this.usageRaw
    const isSingles = format === 'singles'

    if (!u) {
      this.setData({
        usageFormat: format,
        usageEmpty: true,
        usageFormatEmpty: false,
        usageSummary: null,
        usageSections: []
      })
      return
    }

    const block = isSingles ? u.s : u.d
    if (!block) {
      this.setData({
        usageFormat: format,
        usageEmpty: false,
        usageFormatEmpty: true,
        usageSummary: null,
        usageSections: []
      })
      return
    }

    const meta = (this.usageData && this.usageData.META) || {}
    const bar = (name, pct) => ({
      name,
      pctText: fmt.pctText(pct),
      width: Math.max(4, Math.min(100, pct)) + '%'
    })

    const sections = []
    if (block.abilities && block.abilities.length) {
      sections.push({
        key: 'abilities',
        title: '特性',
        note: '全部',
        kind: 'bar',
        items: block.abilities.map((row) => bar(row[0], row[1]))
      })
    }
    if (block.items && block.items.length) {
      sections.push({
        key: 'items',
        title: '道具',
        note: 'TOP5',
        kind: 'bar',
        items: block.items.slice(0, 5).map((row) => bar(row[0], row[1]))
      })
    }
    if (block.natures && block.natures.length) {
      sections.push({
        key: 'natures',
        title: '性格',
        note: 'TOP5',
        kind: 'bar',
        items: block.natures.slice(0, 5).map((row) => bar(row[0], row[1]))
      })
    }
    if (block.spreads && block.spreads.length) {
      sections.push({
        key: 'spreads',
        title: '努力值分配',
        note: 'TOP5',
        kind: 'spread',
        items: block.spreads.slice(0, 5).map((sp, i) => ({
          key: 'sp' + i,
          name: sp.n || '—',
          pctText: fmt.pctText(sp.p),
          width: Math.max(4, Math.min(100, sp.p)) + '%',
          cells: STAT_LABELS.map((label, idx) => ({ key: label, label, value: sp.v[idx] }))
        }))
      })
    }
    if (block.moves && block.moves.length) {
      sections.push({
        key: 'moves',
        title: '招式携带率',
        note: 'TOP10',
        kind: 'bar',
        items: block.moves.slice(0, 10).map((row) => {
          const view = ui.moveView(MOVE_KEY_BY_NAME[row[0]])
          return {
            ...bar(row[0], row[1]),
            typeName: view ? view.typeName : '',
            typeColor: view ? view.typeColor : '',
            typeBg: view ? view.typeBg : ''
          }
        })
      })
    }

    const sourceText = isSingles
      ? `${meta.singles.source} · ${meta.singles.month} · ${meta.singles.cutoff} 分位`
      : `${meta.doubles.source} · ${meta.doubles.regulation} · ${meta.doubles.from.slice(5).replace('-', '.')}–${meta.doubles.to.slice(5).replace('-', '.')}`
    const sampleText = isSingles
      ? `样本 ${fmt.numberText(block.raw)}`
      : `队伍 ${fmt.numberText(block.teams)} · 胜率 ${(block.winRate || 0).toFixed(1)}%`

    this.setData({
      usageFormat: format,
      usageEmpty: false,
      usageFormatEmpty: false,
      usageSummary: {
        rankText: block.rank ? '#' + block.rank : '未上榜',
        pctText: block.usage ? fmt.pctText(block.usage) : '—',
        sourceText,
        sampleText
      },
      usageSections: sections
    })
  },

  onUsageFormat(e) {
    const format = e.currentTarget.dataset.key
    if (!format || format === this.data.usageFormat) return
    this.buildUsage(format)
  },

  /* ------------------------------------------------------------ 页内视图 */

  onTab(e) {
    const tab = e.detail.key
    if (!tab || tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  onMoveCat(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.data.moveCatIndex) return
    const cat = MOVE_CATS[index].key
    const moves = cat === 'all' ? this.movesAll : this.movesAll.filter((m) => m.cat === cat)
    this.setData({ moveCatIndex: index, moves, moveCount: moves.length })
  },

  onMoveCatReset() {
    this.setData({
      moveCatIndex: 0,
      moves: this.movesAll,
      moveCount: this.movesAll.length
    })
  },

  /* ------------------------------------------------------------ 收藏 / 队伍 */

  toggleFav() {
    if (!this.raw) return
    const next = favs.asSet()
    let added = false
    if (next.has(this.raw.key)) next.delete(this.raw.key)
    else {
      next.add(this.raw.key)
      added = true
    }
    this.favSet = favs.set(Array.from(next))
    this.setData({ fav: added })
    wx.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none', duration: 700 })
  },

  openTeams() {
    this.refreshTeams()
    this.setData({ sheet: true })
  },

  closeSheet() {
    this.setData({ sheet: false })
  },

  refreshTeams() {
    const teams = store.listTeams().map((t) => {
      const count = t.members.filter(Boolean).length
      return {
        id: t.id,
        name: t.name,
        count,
        full: count >= 6,
        has: t.members.some((m) => m && m.key === this.raw.key)
      }
    })
    this.setData({ teams })
  },

  pickTeam(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.addToTeam(id)
  },

  createAndAdd() {
    const team = store.createTeam()
    this.addToTeam(team.id)
  },

  addToTeam(teamId) {
    const picked = store.getTeam(teamId)
    if (!picked || !this.raw) return

    if (picked.members.some((m) => m && m.key === this.raw.key)) {
      wx.showToast({ title: `「${picked.name}」已有这只宝可梦`, icon: 'none' })
      return
    }
    const slot = picked.members.findIndex((m) => !m)
    if (slot < 0) {
      wx.showToast({ title: '这支队伍已满 6 只', icon: 'none' })
      return
    }
    store.setMember(teamId, slot, store.defaultMember(this.raw))
    this.setData({ sheet: false })
    wx.showToast({ title: `已加入「${picked.name}」第 ${slot + 1} 位`, icon: 'none', duration: 1200 })
  },

  goHome() {
    wx.reLaunch({ url: routes.index })
  },

  onShareAppMessage() {
    return {
      title: `${this.raw ? this.raw.name : '宝可梦'}｜种族值 · 特性 · 使用率`,
      path: this.raw ? routes.detail(this.raw.key) : routes.index,
      imageUrl: '/assets/share.png'
    }
  },

  onShareTimeline() {
    return { title: `${this.raw ? this.raw.name : '宝可梦'}｜冠军图鉴` }
  }
})
