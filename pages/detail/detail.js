const { POKEMON, MOVES, ABILITIES, META } = require('../../data/pokedex.js')
const usageService = require('../../utils/usage-service.js')
const { getDefenseMatchup } = require('../../utils/type-chart.js')
const {
  hexToRgba,
  typeInfo,
  categoryInfo,
  powerText,
  accuracyText,
  priorityText
} = require('../../utils/ui.js')

const STAT_META = [
  { key: 'hp', label: 'HP', color: '#FF6B6B' },
  { key: 'attack', label: '攻击', color: '#FFA45B' },
  { key: 'defense', label: '防御', color: '#FFD166' },
  { key: 'spAttack', label: '特攻', color: '#6FA8FF' },
  { key: 'spDefense', label: '特防', color: '#59D6A7' },
  { key: 'speed', label: '速度', color: '#F472C6' }
]

const CAT_ORDER = { physical: 0, special: 1, status: 2 }
const SORT_LABEL = { power: '威力', pp: 'PP', name: '名称' }
const SORT_CYCLE = ['power', 'pp', 'name']

const MOVE_BY_NAME = {}
Object.keys(MOVES).forEach((k) => {
  MOVE_BY_NAME[MOVES[k].name] = { key: k, type: MOVES[k].type }
})

function compareName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

function numberText(n) {
  if (!n) return '—'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}

function pctText(n) {
  const value = Number(n) || 0
  return (value >= 10 ? value.toFixed(1) : value.toFixed(2)) + '%'
}

const TOTAL_RANK = {}
POKEMON.slice()
  .sort((a, b) => b.total - a.total || a.dex - b.dex)
  .forEach((p, i) => {
    TOTAL_RANK[p.key] = i + 1
  })

function tagClass(tag) {
  if (tag === 'MEGA') return 'mega'
  if (tag === '地区形态') return 'regional'
  if (tag === '特殊形态') return 'special'
  if (tag === '对战形态') return 'battle'
  return ''
}

Page({
  data: {
    meta: META,
    mon: null,
    navTitle: '宝可梦详情',
    fav: false,
    navTotalHeight: 64,
    activeTab: 'stats',
    totalRank: 0,
    stats: [],
    matchupGroups: [],
    abilities: [],
    moves: [],
    moveCats: [],
    moveCat: 'all',
    moveQuery: '',
    moveSort: 'power',
    moveSortLabel: SORT_LABEL.power,
    shownMoveCount: 0,
    expandedMove: '',
    forms: [],
    notFound: false,
    usageMeta: {},
    usageFormat: 'doubles',
    usageFormatLabel: '双打',
    usageHasSingles: false,
    usageHasDoubles: false,
    usageEmpty: false,
    usageFormatEmpty: false,
    usageRankText: '',
    usagePctText: '',
    usageSourceText: '',
    usageSampleText: '',
    usageWinRateText: '',
    usageAbilities: [],
    usageItems: [],
    usageNatures: [],
    usageSpreads: [],
    usageMoves: []
  },

  onLoad(options) {
    const app = getApp()
    const g = (app && app.globalData) || {}
    const navTotalHeight = g.navTotalHeight || 64

    let key = options && options.key ? options.key : ''
    try {
      key = decodeURIComponent(key)
    } catch (e) {
      // keep raw key
    }

    const raw = POKEMON.find((p) => p.key === key)
    if (!raw) {
      this.setData({ notFound: true, navTotalHeight })
      wx.showToast({ title: '未找到该宝可梦', icon: 'none' })
      return
    }

    const favs = wx.getStorageSync('champion_favs') || []
    this.favSet = new Set(Array.isArray(favs) ? favs : [])
    this.raw = raw
    this.allMoves = this.buildMoves(raw)
    this.moveState = { cat: 'all', query: '', sort: 'power' }

    const monView = this.buildMon(raw)
    const stats = STAT_META.map((s, i) => {
      const value = raw.stats[i]
      return {
        key: s.key,
        label: s.label,
        value,
        color: s.color,
        percent: Math.min(100, (value / 180) * 100).toFixed(1) + '%'
      }
    })

    const matchup = getDefenseMatchup(raw.types)
    const groups = []
    const addGroup = (label, mult, tone, list) => {
      if (list && list.length) {
        groups.push({
          key: label,
          label,
          mult,
          tone,
          types: list.map((k) => typeInfo(k))
        })
      }
    }
    addGroup('四倍弱点', '×4', 'weak', matchup.x4)
    addGroup('弱点', '×2', 'weak', matchup.x2)
    addGroup('抵抗', '×0.5', 'resist', matchup.x05)
    addGroup('强抵抗', '×0.25', 'resist', matchup.x025)
    addGroup('免疫', '×0', 'immune', matchup.x0)

    const abilities = raw.abilities.map((k, i) => {
      const ab = ABILITIES[k] || { name: k, desc: '' }
      return {
        key: k,
        index: String(i + 1).padStart(2, '0'),
        name: ab.name,
        desc: ab.desc || '暂无说明'
      }
    })

    const forms = POKEMON
      .filter((p) => p.dex === raw.dex && p.key !== raw.key)
      .sort((a, b) => a.order - b.order || a.id - b.id)
      .map((p) => ({
        key: p.key,
        name: p.name,
        sprite: p.sprite,
        formLabel: p.formLabel || '基础',
        typesInfo: p.types.map((t) => typeInfo(t))
      }))

    const moveCats = [
      { key: 'all', name: '全部', count: this.allMoves.length },
      { key: 'physical', name: '物理', count: this.allMoves.filter((m) => m.cat === 'physical').length },
      { key: 'special', name: '特殊', count: this.allMoves.filter((m) => m.cat === 'special').length },
      { key: 'status', name: '变化', count: this.allMoves.filter((m) => m.cat === 'status').length }
    ]

    this.usageData = usageService.getUsage()
    this.usageRaw = this.usageData.USAGE[raw.key] || null
    const usageHasSingles = !!(this.usageRaw && this.usageRaw.s)
    const usageHasDoubles = !!(this.usageRaw && this.usageRaw.d)
    let usageFormat = usageHasDoubles ? 'doubles' : 'singles'
    if (options && options.format === 'singles') usageFormat = 'singles'
    if (options && options.format === 'doubles') usageFormat = 'doubles'

    const activeTab = options && options.tab === 'usage' ? 'usage' : 'stats'
    this.setData({
      navTotalHeight,
      navTitle: raw.name,
      mon: monView,
      fav: this.favSet.has(raw.key),
      totalRank: TOTAL_RANK[raw.key] || 0,
      stats,
      matchupGroups: groups,
      abilities,
      moveCats,
      moves: this.allMoves,
      shownMoveCount: this.allMoves.length,
      forms,
      activeTab,
      usageFormat,
      usageFormatLabel: usageFormat === 'singles' ? '单打' : '双打',
      usageHasSingles,
      usageHasDoubles
    })

    this.usageUnsubscribe = usageService.subscribe((data) => {
      this.usageData = data
      this.usageRaw = data.USAGE[raw.key] || null
      if (this.data.activeTab === 'usage') {
        this.buildUsageView(this.data.usageFormat)
      } else {
        this.setData({
          usageMeta: data.META,
          usageHasSingles: !!(this.usageRaw && this.usageRaw.s),
          usageHasDoubles: !!(this.usageRaw && this.usageRaw.d)
        })
      }
    })
    usageService.refresh()

    if (activeTab === 'usage') {
      this.buildUsageView(usageFormat)
    }
  },

  onShow() {
    if (!this.raw) return
    const favs = wx.getStorageSync('champion_favs') || []
    this.favSet = new Set(Array.isArray(favs) ? favs : [])
    const fav = this.favSet.has(this.raw.key)
    if (fav !== this.data.fav) this.setData({ fav })
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    if (this.usageUnsubscribe) this.usageUnsubscribe()
  },

  buildMon(raw) {
    const typesInfo = raw.types.map((t) => typeInfo(t))
    const primary = typesInfo[0] ? typesInfo[0].color : '#FFD84D'
    return {
      key: raw.key,
      id: raw.id,
      dex: raw.dex,
      dexLabel: '#' + String(raw.dex).padStart(3, '0'),
      name: raw.name,
      gen: raw.gen,
      types: raw.types,
      typesInfo,
      stats: raw.stats,
      total: raw.total,
      reg: raw.reg,
      form: raw.form,
      formLabel: raw.formLabel,
      tags: raw.tags || [],
      tagItems: (raw.tags || []).map((t) => ({ name: t, cls: tagClass(t) })),
      sprite: raw.sprite,
      abilityCount: raw.abilities.length,
      moveCount: raw.moves.length,
      heroBg: `linear-gradient(155deg, ${hexToRgba(primary, 0.34)} 0%, rgba(15, 22, 36, 0.97) 56%, #0c1320 100%)`,
      ringColor: hexToRgba(primary, 0.32),
      glowColor: hexToRgba(primary, 0.4)
    }
  },

  buildMoves(raw) {
    return raw.moves
      .map((k) => {
        const m = MOVES[k]
        if (!m) return null
        const ti = typeInfo(m.type)
        const ci = categoryInfo(m.cat)
        return {
          key: k,
          name: m.name,
          type: m.type,
          typeName: ti.name,
          typeColor: ti.color,
          typeBg: ti.bg,
          cat: m.cat,
          catName: ci.name,
          catColor: ci.color,
          catBg: ci.bg,
          power: m.power,
          powerText: powerText(m.power),
          accText: accuracyText(m.acc, m.cat),
          pp: m.pp,
          priority: m.priority || 0,
          priorityText: priorityText(m.priority),
          desc: m.desc || '',
          searchText: `${m.name} ${ti.name} ${ci.name} ${m.desc || ''}`.toLowerCase()
        }
      })
      .filter(Boolean)
  },

  buildUsageView(format) {
    const u = this.usageRaw
    const hasSingles = !!(u && u.s)
    const hasDoubles = !!(u && u.d)
    const empty = {
      usageAbilities: [],
      usageItems: [],
      usageNatures: [],
      usageSpreads: [],
      usageMoves: []
    }

    if (!u) {
      this.setData({
        usageFormat: format,
        usageFormatLabel: format === 'singles' ? '单打' : '双打',
        usageHasSingles: false,
        usageHasDoubles: false,
        usageEmpty: true,
        usageFormatEmpty: true,
        ...empty
      })
      return
    }

    const block = format === 'singles' ? u.s : u.d
    if (!block) {
      this.setData({
        usageFormat: format,
        usageFormatLabel: format === 'singles' ? '单打' : '双打',
        usageHasSingles: hasSingles,
        usageHasDoubles: hasDoubles,
        usageEmpty: false,
        usageFormatEmpty: true,
        ...empty
      })
      return
    }

    const pairs = (list, limit) => (list || []).slice(0, limit).map(([name, pct]) => ({
      name,
      pct,
      pctText: pctText(pct),
      width: Math.min(100, Math.max(2, pct)) + '%'
    }))

    const moves = (block.moves || []).slice(0, 10).map(([name, pct]) => {
      const found = MOVE_BY_NAME[name]
      const ti = found
        ? typeInfo(found.type)
        : { name: '—', color: '#8A96AB', bg: 'rgba(138,150,171,0.12)' }
      return {
        name,
        pctText: pctText(pct),
        width: Math.min(100, Math.max(2, pct)) + '%',
        typeName: ti.name,
        typeColor: ti.color,
        typeBg: ti.bg
      }
    })

    const spreads = (block.spreads || []).slice(0, 5).map((sp, index) => ({
      key: 's' + index,
      nature: sp.n || '—',
      valuesText: sp.v.join(' / '),
      pctText: pctText(sp.p),
      width: Math.min(100, Math.max(2, sp.p)) + '%',
      stats: STAT_META.map((meta, i) => ({
        key: meta.key,
        label: meta.label,
        value: sp.v[i]
      }))
    }))

    const isSingles = format === 'singles'
    const usageMeta = (this.usageData && this.usageData.META) || {}
    const sourceText = isSingles
      ? `${usageMeta.singles.source} · ${usageMeta.singles.month} · ${usageMeta.singles.cutoff} 分位`
      : `${usageMeta.doubles.source} · ${usageMeta.doubles.regulation} · ${usageMeta.doubles.from.slice(5).replace('-', '.')}–${usageMeta.doubles.to.slice(5).replace('-', '.')}`
    const sampleText = isSingles
      ? `样本 ${numberText(block.raw)}`
      : `队伍 ${numberText(block.teams)} · 胜率 ${(block.winRate || 0).toFixed(1)}%`

    this.setData({
      usageFormat: format,
      usageFormatLabel: isSingles ? '单打' : '双打',
      usageHasSingles: hasSingles,
      usageHasDoubles: hasDoubles,
      usageEmpty: false,
      usageFormatEmpty: false,
      usageRankText: block.rank ? '#' + block.rank : '未上榜',
      usagePctText: block.usage ? pctText(block.usage) : '—',
      usageSourceText: sourceText,
      usageSampleText: sampleText,
      usageWinRateText: isSingles ? '' : (block.winRate || 0).toFixed(1) + '%',
      usageAbilities: pairs(block.abilities),
      usageItems: pairs(block.items, 5),
      usageNatures: pairs(block.natures, 5),
      usageSpreads: spreads,
      usageMoves: moves
    })
  },

  onUsageFormat(e) {
    const format = e.currentTarget.dataset.format
    if (!format || format === this.data.usageFormat) return
    this.buildUsageView(format)
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    if (tab === 'usage') {
      this.buildUsageView(this.data.usageFormat)
    }
  },

  applyMoveFilters() {
    const state = this.moveState
    const terms = (state.query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    let list = this.allMoves.filter((m) => {
      if (state.cat !== 'all' && m.cat !== state.cat) return false
      if (terms.length) {
        for (let i = 0; i < terms.length; i += 1) {
          if (m.searchText.indexOf(terms[i]) === -1) return false
        }
      }
      return true
    })

    if (state.sort === 'pp') {
      list.sort((a, b) => b.pp - a.pp || compareName(a, b))
    } else if (state.sort === 'name') {
      list.sort(compareName)
    } else {
      list.sort((a, b) => (CAT_ORDER[a.cat] - CAT_ORDER[b.cat]) || ((b.power || -1) - (a.power || -1)) || compareName(a, b))
    }

    this.setData({
      moves: list,
      shownMoveCount: list.length,
      moveCat: state.cat,
      moveQuery: state.query,
      moveSort: state.sort,
      moveSortLabel: SORT_LABEL[state.sort]
    })
  },

  onMoveSearch(e) {
    this.moveState.query = e.detail.value || ''
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.applyMoveFilters()
    }, 120)
  },

  clearMoveSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.moveState.query = ''
    this.applyMoveFilters()
  },

  onMoveCat(e) {
    const cat = e.currentTarget.dataset.cat
    if (!cat || cat === this.moveState.cat) return
    this.moveState.cat = cat
    this.applyMoveFilters()
  },

  cycleMoveSort() {
    const idx = SORT_CYCLE.indexOf(this.moveState.sort)
    this.moveState.sort = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]
    this.applyMoveFilters()
  },

  toggleMove(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ expandedMove: this.data.expandedMove === key ? '' : key })
  },

  toggleFav() {
    if (!this.raw) return
    const key = this.raw.key
    let added = false
    if (this.favSet.has(key)) {
      this.favSet.delete(key)
    } else {
      this.favSet.add(key)
      added = true
    }
    wx.setStorageSync('champion_favs', Array.from(this.favSet))
    this.setData({ fav: added })
    wx.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none', duration: 700 })
  },

  openForm(e) {
    const key = e.currentTarget.dataset.key
    if (!key || !this.raw || key === this.raw.key) return
    wx.redirectTo({ url: '/pages/detail/detail?key=' + encodeURIComponent(key) })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  goRankings() {
    wx.navigateTo({ url: '/pages/rankings/rankings' })
  },

  onShareAppMessage() {
    const name = this.data.mon ? this.data.mon.name : '宝可梦冠军'
    return {
      title: `${name}｜种族值、特性与使用率`,
      path: this.raw ? '/pages/detail/detail?key=' + encodeURIComponent(this.raw.key) : '/pages/index/index',
      imageUrl: '/assets/share.png'
    }
  },

  onShareTimeline() {
    const name = this.data.mon ? this.data.mon.name : '宝可梦冠军'
    return { title: `${name}｜宝可梦冠军图鉴` }
  }
})
