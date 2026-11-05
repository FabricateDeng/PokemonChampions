const { POKEMON, MOVES, ABILITIES, TYPES, META } = require('../../data/pokedex.js')
const usageService = require('../../utils/usage-service.js')

const TYPE_KEYS = Object.keys(TYPES)
const FORM_KEYS = ['all', 'base', 'mega', 'regional', 'special']
const GEN_OPTIONS = ['全部世代', '第1世代', '第2世代', '第3世代', '第4世代', '第5世代', '第6世代', '第7世代', '第8世代', '第9世代']
const FORM_OPTIONS = ['全部形态', '基础形态', '超级进化', '地区形态', '其他形态']
const SORT_OPTIONS = ['图鉴编号', '种族值', '速度', '名称']

function hexToRgba(hex, alpha) {
  const h = (hex || '#888888').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function textOnColor(hex) {
  const h = (hex || '#888888').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 155 ? '#10130a' : '#ffffff'
}

function typeInfo(key) {
  const t = TYPES[key] || { name: key, color: '#888888' }
  return {
    key,
    name: t.name,
    color: t.color,
    textOn: textOnColor(t.color),
    bg: hexToRgba(t.color, 0.16),
    border: hexToRgba(t.color, 0.42)
  }
}

function formShort(form) {
  if (form === 'mega') return 'MEGA'
  if (form === 'regional') return '地区'
  if (form === 'special') return '特殊'
  return ''
}

function buildAll() {
  return POKEMON.map((p) => {
    const typesInfo = p.types.map(typeInfo)
    const primary = typesInfo[0] ? typesInfo[0].color : '#FFD84D'
    const abilityText = p.abilities.map((k) => (ABILITIES[k] ? ABILITIES[k].name : '')).join(' ')
    const moveText = p.moves.map((k) => (MOVES[k] ? MOVES[k].name : '')).join(' ')
    const coreText = [
      p.name,
      p.key,
      p.dex,
      String(p.dex).padStart(3, '0'),
      `第${p.gen}世代`,
      p.gen,
      ...typesInfo.map((t) => t.name),
      abilityText
    ].join(' ').toLowerCase()

    return {
      key: p.key,
      dex: p.dex,
      dexLabel: '#' + String(p.dex).padStart(3, '0'),
      name: p.name,
      gen: p.gen,
      types: p.types,
      typesInfo,
      stats: p.stats,
      total: p.total,
      abilities: p.abilities,
      moves: p.moves,
      reg: p.reg,
      form: p.form,
      formLabel: p.formLabel,
      formShort: formShort(p.form),
      tags: p.tags,
      sprite: p.sprite,
      order: p.order,
      id: p.id,
      coreText,
      moveText: moveText.toLowerCase(),
      glow: `radial-gradient(circle at 50% 44%, ${hexToRgba(primary, 0.3)} 0%, rgba(0, 0, 0, 0) 70%)`
    }
  })
}

Page({
  data: {
    meta: META,
    typeList: [],
    query: '',
    typeKey: 'all',
    genOptions: GEN_OPTIONS,
    genIndex: 0,
    genLabel: GEN_OPTIONS[0],
    formOptions: FORM_OPTIONS,
    formIndex: 0,
    formLabel: FORM_OPTIONS[0],
    sortOptions: SORT_OPTIONS,
    sortIndex: 0,
    sortLabel: SORT_OPTIONS[0],
    onlyFav: false,
    favCount: 0,
    resultCount: 0,
    visibleList: [],
    hasMore: false,
    empty: false,
    hasFilters: false,
    usageMeta: null,
    singleTop: null,
    doubleTop: null
  },

  onLoad() {
    const favs = wx.getStorageSync('champion_favs') || []
    this.favSet = new Set(Array.isArray(favs) ? favs : [])
    this.filters = {
      query: '',
      typeKey: 'all',
      gen: 0,
      form: 'all',
      sort: 0,
      onlyFav: false
    }
    this.limit = 30
    this.all = buildAll()
    this.filtered = this.all
    this.monByKey = {}
    POKEMON.forEach((p) => { this.monByKey[p.key] = p })

    this.setData({
      favCount: this.favSet.size,
      typeList: [
        { key: 'all', name: '全部', color: '#FFD84D', textOn: '#10130a', bg: 'rgba(255, 216, 77, 0.14)', border: 'rgba(255, 216, 77, 0.38)' },
        ...TYPE_KEYS.map((k) => typeInfo(k))
      ]
    })
    this.applyFilters(true)
    this.applyUsageData(usageService.getUsage())
    this.usageUnsubscribe = usageService.subscribe((data) => this.applyUsageData(data))
    usageService.refresh()
  },

  applyUsageData(data) {
    if (!data || !this.monByKey) return
    const topTeaser = (format) => {
      const row = ((data.RANKINGS && data.RANKINGS[format]) || [])[0]
      const p = row ? this.monByKey[row.key] : null
      if (!p) return null
      return {
        key: p.key,
        name: p.name,
        usage: row.usage.toFixed(1),
        sprite: p.sprite
      }
    }
    this.setData({
      usageMeta: data.META,
      singleTop: topTeaser('singles'),
      doubleTop: topTeaser('doubles')
    })
  },

  onShow() {
    if (!this.all) return
    const favs = wx.getStorageSync('champion_favs') || []
    this.favSet = new Set(Array.isArray(favs) ? favs : [])
    this.setData({ favCount: this.favSet.size })
    if (this.filters.onlyFav) {
      this.applyFilters(true)
    } else {
      this.renderVisible(false)
    }
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    if (this.usageUnsubscribe) this.usageUnsubscribe()
  },

  onReachBottom() {
    if (!this.data.hasMore) return
    this.limit += 30
    this.renderVisible(false)
  },

  applyFilters(resetLimit) {
    const f = this.filters
    const terms = (f.query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)

    let list = this.all.filter((item) => {
      if (f.typeKey !== 'all' && item.types.indexOf(f.typeKey) === -1) return false
      if (f.gen > 0 && item.gen !== f.gen) return false
      if (f.form !== 'all' && item.form !== f.form) return false
      if (f.onlyFav && !this.favSet.has(item.key)) return false
      if (terms.length) {
        for (let i = 0; i < terms.length; i += 1) {
          const term = terms[i]
          const inCore = item.coreText.indexOf(term) !== -1
          // Single-character queries stay focused on names/types/abilities;
          // longer queries may also match the move pool.
          const inMoves = term.length >= 2 && item.moveText.indexOf(term) !== -1
          if (!inCore && !inMoves) return false
        }
      }
      return true
    })

    if (f.sort === 1) {
      list.sort((a, b) => b.total - a.total || a.dex - b.dex || a.order - b.order)
    } else if (f.sort === 2) {
      list.sort((a, b) => b.stats[5] - a.stats[5] || b.total - a.total || a.dex - b.dex)
    } else if (f.sort === 3) {
      list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.dex - b.dex))
    } else {
      list.sort((a, b) => a.dex - b.dex || a.order - b.order || a.id - b.id)
    }

    this.filtered = list
    this.setData({
      resultCount: list.length,
      hasFilters: !!(f.query || f.typeKey !== 'all' || f.gen > 0 || f.form !== 'all' || f.onlyFav)
    })
    this.renderVisible(resetLimit)
  },

  renderVisible(resetLimit) {
    if (resetLimit) this.limit = 30
    const slice = this.filtered.slice(0, this.limit)
    const visibleList = slice.map((item) => ({
      key: item.key,
      dexLabel: item.dexLabel,
      name: item.name,
      gen: item.gen,
      typesInfo: item.typesInfo,
      total: item.total,
      speed: item.stats[5],
      sprite: item.sprite,
      form: item.form,
      formShort: item.formShort,
      formLabel: item.formLabel,
      glow: item.glow,
      isFav: this.favSet.has(item.key)
    }))

    this.setData({
      visibleList,
      hasMore: this.filtered.length > this.limit,
      empty: this.filtered.length === 0
    })
  },

  onSearchInput(e) {
    const value = e.detail.value || ''
    this.filters.query = value
    this.setData({ query: value })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.applyFilters(true)
    }, 120)
  },

  clearSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.filters.query = ''
    this.setData({ query: '' })
    this.applyFilters(true)
  },

  onTypeTap(e) {
    const key = e.currentTarget.dataset.key
    this.filters.typeKey = key
    this.setData({ typeKey: key })
    this.applyFilters(true)
  },

  onGenChange(e) {
    const idx = Number(e.detail.value)
    this.filters.gen = idx
    this.setData({ genIndex: idx, genLabel: GEN_OPTIONS[idx] })
    this.applyFilters(true)
  },

  onFormChange(e) {
    const idx = Number(e.detail.value)
    this.filters.form = FORM_KEYS[idx]
    this.setData({ formIndex: idx, formLabel: FORM_OPTIONS[idx] })
    this.applyFilters(true)
  },

  onSortChange(e) {
    const idx = Number(e.detail.value)
    this.filters.sort = idx
    this.setData({ sortIndex: idx, sortLabel: SORT_OPTIONS[idx] })
    this.applyFilters(true)
  },

  toggleOnlyFav() {
    const next = !this.filters.onlyFav
    this.filters.onlyFav = next
    this.setData({ onlyFav: next })
    this.applyFilters(true)
  },

  clearFilters() {
    this.filters = {
      query: '',
      typeKey: 'all',
      gen: 0,
      form: 'all',
      sort: 0,
      onlyFav: false
    }
    this.setData({
      query: '',
      typeKey: 'all',
      genIndex: 0,
      genLabel: GEN_OPTIONS[0],
      formIndex: 0,
      formLabel: FORM_OPTIONS[0],
      sortIndex: 0,
      sortLabel: SORT_OPTIONS[0],
      onlyFav: false
    })
    this.applyFilters(true)
  },

  toggleFav(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    if (this.favSet.has(key)) {
      this.favSet.delete(key)
      wx.showToast({ title: '已取消收藏', icon: 'none', duration: 700 })
    } else {
      this.favSet.add(key)
      wx.showToast({ title: '已收藏', icon: 'none', duration: 700 })
    }
    wx.setStorageSync('champion_favs', Array.from(this.favSet))
    this.setData({ favCount: this.favSet.size })
    if (this.filters.onlyFav) {
      this.applyFilters(true)
    } else {
      this.renderVisible(false)
    }
  },

  openDetail(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.navigateTo({ url: '/pages/detail/detail?key=' + encodeURIComponent(key) })
  },

  openRankings() {
    wx.navigateTo({ url: '/pages/rankings/rankings' })
  },

  openMoves() {
    wx.navigateTo({ url: '/pages/moves/moves' })
  },

  openTeams() {
    wx.navigateTo({ url: '/packages/tools/pages/teams/teams' })
  },

  openCalc() {
    wx.navigateTo({ url: '/packages/tools/pages/calc/calc' })
  },

  openAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },

  onShareAppMessage() {
    return {
      title: `宝可梦冠军图鉴｜收录 ${META.count} 只可用宝可梦`,
      path: '/pages/index/index',
      imageUrl: '/assets/share.png'
    }
  },

  onShareTimeline() {
    return {
      title: `宝可梦冠军图鉴｜${META.count} 只可用宝可梦的种族值、特性与招式`
    }
  }
})

