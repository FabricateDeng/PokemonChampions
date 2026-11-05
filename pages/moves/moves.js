const { MOVES, TYPES, META, LEARN_COUNT } = require('../../data/pokedex.js')
const {
  typeInfo,
  categoryInfo,
  powerText,
  accuracyText,
  priorityText
} = require('../../utils/ui.js')

const TYPE_KEYS = Object.keys(TYPES)
const SORT_OPTIONS = ['学习面', '威力', '名称']

function compareName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

function buildMoves() {
  return Object.keys(MOVES).map((key) => {
    const m = MOVES[key]
    const ti = typeInfo(m.type)
    const ci = categoryInfo(m.cat)
    const learnCount = LEARN_COUNT[key] || 0
    return {
      key,
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
      priorityText: priorityText(m.priority),
      desc: m.desc || '',
      learnCount,
      searchText: `${m.name} ${ti.name} ${ci.name} ${m.desc || ''} ${learnCount}`.toLowerCase()
    }
  })
}

Page({
  data: {
    meta: META,
    query: '',
    typeKey: 'all',
    typeList: [],
    cat: 'all',
    catChips: [],
    sortIndex: 0,
    sortLabel: SORT_OPTIONS[0],
    sortOptions: SORT_OPTIONS,
    resultCount: 0,
    visibleMoves: [],
    hasMore: false,
    empty: false,
    expandedKey: '',
    hasFilters: false
  },

  onLoad() {
    this.filters = { query: '', typeKey: 'all', cat: 'all', sort: 0 }
    this.limit = 40
    this.allMoves = buildMoves()
    this.filtered = this.allMoves

    const catChips = [
      { key: 'all', name: '全部', count: this.allMoves.length },
      { key: 'physical', name: '物理', count: this.allMoves.filter((m) => m.cat === 'physical').length },
      { key: 'special', name: '特殊', count: this.allMoves.filter((m) => m.cat === 'special').length },
      { key: 'status', name: '变化', count: this.allMoves.filter((m) => m.cat === 'status').length }
    ]

    this.setData({
      typeList: [
        { key: 'all', name: '全部', color: '#FFD84D', textOn: '#10130a' },
        ...TYPE_KEYS.map((k) => typeInfo(k))
      ],
      catChips
    })
    this.applyFilters(true)
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
  },

  onReachBottom() {
    if (!this.data.hasMore) return
    this.limit += 40
    this.renderVisible(false)
  },

  applyFilters(resetLimit) {
    const f = this.filters
    const terms = (f.query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)

    let list = this.allMoves.filter((m) => {
      if (f.typeKey !== 'all' && m.type !== f.typeKey) return false
      if (f.cat !== 'all' && m.cat !== f.cat) return false
      if (terms.length) {
        for (let i = 0; i < terms.length; i += 1) {
          if (m.searchText.indexOf(terms[i]) === -1) return false
        }
      }
      return true
    })

    if (f.sort === 1) {
      list.sort((a, b) => (b.power || -1) - (a.power || -1) || b.learnCount - a.learnCount || compareName(a, b))
    } else if (f.sort === 2) {
      list.sort(compareName)
    } else {
      list.sort((a, b) => b.learnCount - a.learnCount || compareName(a, b))
    }

    this.filtered = list
    this.setData({
      resultCount: list.length,
      hasFilters: !!(f.query || f.typeKey !== 'all' || f.cat !== 'all')
    })
    this.renderVisible(resetLimit)
  },

  renderVisible(resetLimit) {
    if (resetLimit) this.limit = 40
    const slice = this.filtered.slice(0, this.limit)
    this.setData({
      visibleMoves: slice,
      hasMore: this.filtered.length > this.limit,
      empty: this.filtered.length === 0
    })
  },

  onSearchInput(e) {
    this.filters.query = e.detail.value || ''
    this.setData({ query: this.filters.query })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.applyFilters(true), 120)
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

  onCatTap(e) {
    const cat = e.currentTarget.dataset.cat
    if (!cat || cat === this.filters.cat) return
    this.filters.cat = cat
    this.setData({ cat })
    this.applyFilters(true)
  },

  onSortChange(e) {
    const idx = Number(e.detail.value)
    this.filters.sort = idx
    this.setData({ sortIndex: idx, sortLabel: SORT_OPTIONS[idx] })
    this.applyFilters(true)
  },

  clearFilters() {
    this.filters = { query: '', typeKey: 'all', cat: 'all', sort: 0 }
    this.setData({
      query: '',
      typeKey: 'all',
      cat: 'all',
      sortIndex: 0,
      sortLabel: SORT_OPTIONS[0],
      expandedKey: ''
    })
    this.applyFilters(true)
  },

  toggleMove(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ expandedKey: this.data.expandedKey === key ? '' : key })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    return {
      title: `宝可梦冠军招式库｜${META.moveCount} 个可用招式`,
      path: '/pages/moves/moves',
      imageUrl: '/assets/share.png'
    }
  }
})
