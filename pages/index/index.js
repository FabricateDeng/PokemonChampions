const mon = require('../../utils/mon.js')
const ui = require('../../utils/ui.js')
const favs = require('../../utils/favs.js')
const routes = require('../../utils/routes.js')
const system = require('../../utils/system.js')

const MODES = [
  { key: 'mon', label: '宝可梦' },
  { key: 'move', label: '招式' }
]

const GEN_LABELS = ['全部世代', '第1世代', '第2世代', '第3世代', '第4世代', '第5世代', '第6世代', '第7世代', '第8世代', '第9世代']
const FORM_LABELS = ['全部形态', '基础形态', '超级进化', '地区形态', '其他形态']
const FORM_KEYS = ['all', 'base', 'mega', 'regional', 'special']
const MON_SORTS = ['图鉴编号', '种族值', '速度', '名称']
const MOVE_SORTS = ['学习面', '威力', '名称']
const MOVE_CATS = [
  { key: 'all', name: '全部' },
  { key: 'physical', name: '物理' },
  { key: 'special', name: '特殊' },
  { key: 'status', name: '变化' }
]

const PAGE_MON = 30
const PAGE_MOVE = 40

Page({
  data: {
    navTotalHeight: 64,
    modes: MODES,
    mode: 'mon',

    query: '',
    typeKey: 'all',
    typeList: [],

    // 筛选面板
    sheet: false,
    genLabels: GEN_LABELS,
    formLabels: FORM_LABELS,
    monSorts: MON_SORTS,
    moveSorts: MOVE_SORTS,
    moveCats: MOVE_CATS,
    genIndex: 0,
    formIndex: 0,
    sortIndex: 0,
    moveCatIndex: 0,
    moveSortIndex: 0,
    onlyFav: false,
    filterCount: 0,
    summary: '',

    monList: [],
    monCount: 0,
    monHasMore: false,
    moveList: [],
    moveCount: 0,
    moveHasMore: false
  },

  onLoad() {
    const metrics = system.getMetrics()
    this.favSet = favs.asSet()
    this.monLimit = PAGE_MON
    this.moveLimit = PAGE_MOVE
    this.monState = { typeKey: 'all', gen: 0, form: 'all', formIndex: 0, sort: 0, onlyFav: false }
    this.moveState = { typeKey: 'all', cat: 'all', catIndex: 0, sort: 0 }
    this.query = ''
    this.allMon = mon.all()
    this.allMoves = mon.allMoves()

    this.setData({
      navTotalHeight: metrics.navTotalHeight,
      typeList: ui.typeChips()
    })
    this.applyMode('mon', true)
  },

  onShow() {
    // Favourites can change on the detail page (R8.5 keeps filters, refreshes flags).
    const next = favs.asSet()
    let changed = next.size !== this.favSet.size
    if (!changed) {
      next.forEach((k) => {
        if (!this.favSet.has(k)) changed = true
      })
    }
    if (!changed) return
    this.favSet = next
    if (this.data.mode === 'mon') this.applyMon(false)
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
  },

  onReachBottom() {
    if (this.data.mode === 'mon') {
      if (!this.data.monHasMore) return
      this.monLimit += PAGE_MON
      this.applyMon(false)
      return
    }
    if (!this.data.moveHasMore) return
    this.moveLimit += PAGE_MOVE
    this.applyMove(false)
  },

  /* ------------------------------------------------------------ 模式切换 */

  onMode(e) {
    const mode = e.detail.key
    if (!mode || mode === this.data.mode) return
    this.query = ''
    this.applyMode(mode, true)
  },

  applyMode(mode, reset) {
    const patch = { mode, query: '' }
    const state = mode === 'mon' ? this.monState : this.moveState
    patch.typeKey = state.typeKey
    this.setData(patch)
    this.refreshSummary()
    if (mode === 'mon') this.applyMon(reset)
    else this.applyMove(reset)
  },

  /* ------------------------------------------------------------ 搜索 */

  onSearch(e) {
    this.query = e.detail.value || ''
    this.setData({ query: this.query })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      if (this.data.mode === 'mon') this.applyMon(true)
      else this.applyMove(true)
    }, 150)
  },

  clearQuery() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.query = ''
    this.setData({ query: '' })
    if (this.data.mode === 'mon') this.applyMon(true)
    else this.applyMove(true)
  },

  /* ------------------------------------------------------------ 属性 chip */

  onType(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    if (this.data.mode === 'mon') {
      if (key === this.monState.typeKey) return
      this.monState.typeKey = key
      this.setData({ typeKey: key })
      this.applyMon(true)
      return
    }
    if (key === this.moveState.typeKey) return
    this.moveState.typeKey = key
    this.setData({ typeKey: key })
    this.applyMove(true)
  },

  /* ------------------------------------------------------------ 筛选面板 */

  openFilter() {
    this.setData({ sheet: true })
  },

  closeFilter() {
    this.setData({ sheet: false })
  },

  onGen(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.monState.gen) return
    this.monState.gen = index
    this.setData({ genIndex: index })
    this.applyMon(true)
    this.refreshSummary()
  },

  onForm(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.monState.formIndex) return
    this.monState.formIndex = index
    this.monState.form = FORM_KEYS[index]
    this.setData({ formIndex: index })
    this.applyMon(true)
    this.refreshSummary()
  },

  onSort(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.monState.sort) return
    this.monState.sort = index
    this.setData({ sortIndex: index })
    this.applyMon(true)
    this.refreshSummary()
  },

  onOnlyFav() {
    this.monState.onlyFav = !this.monState.onlyFav
    this.setData({ onlyFav: this.monState.onlyFav })
    this.applyMon(true)
    this.refreshSummary()
  },

  onMoveCat(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.moveState.catIndex) return
    this.moveState.cat = MOVE_CATS[index].key
    this.moveState.catIndex = index
    this.setData({ moveCatIndex: index })
    this.applyMove(true)
    this.refreshSummary()
  },

  onMoveSort(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.moveState.sort) return
    this.moveState.sort = index
    this.setData({ moveSortIndex: index })
    this.applyMove(true)
    this.refreshSummary()
  },

  clearFilters() {
    // 关键词也要一起清掉，否则列表仍然被搜索结果过滤（R8.5 的反面）。
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.query = ''
    this.setData({ query: '' })
    if (this.data.mode === 'mon') {
      this.monState = { typeKey: 'all', gen: 0, form: 'all', formIndex: 0, sort: 0, onlyFav: false }
      this.setData({ typeKey: 'all', genIndex: 0, formIndex: 0, sortIndex: 0, onlyFav: false })
      this.applyMon(true)
    } else {
      this.moveState = { typeKey: 'all', cat: 'all', catIndex: 0, sort: 0 }
      this.setData({ typeKey: 'all', moveCatIndex: 0, moveSortIndex: 0 })
      this.applyMove(true)
    }
    this.refreshSummary()
  },

  refreshSummary() {
    if (this.data.mode === 'mon') {
      const s = this.monState
      const parts = []
      if (s.gen > 0) parts.push(GEN_LABELS[s.gen])
      if (s.form !== 'all') parts.push(FORM_LABELS[s.formIndex])
      if (s.onlyFav) parts.push('收藏')
      parts.push('按' + MON_SORTS[s.sort])
      this.setData({
        summary: parts.join(' · '),
        filterCount: (s.gen > 0 ? 1 : 0) + (s.form !== 'all' ? 1 : 0) + (s.onlyFav ? 1 : 0)
      })
      return
    }
    const m = this.moveState
    const parts = []
    if (m.cat !== 'all') parts.push(MOVE_CATS[m.catIndex].name)
    parts.push('按' + MOVE_SORTS[m.sort])
    this.setData({
      summary: parts.join(' · '),
      filterCount: m.cat !== 'all' ? 1 : 0
    })
  },

  /* ------------------------------------------------------------ 列表计算 */

  applyMon(reset) {
    if (reset) this.monLimit = PAGE_MON
    const s = this.monState
    const terms = mon.terms(this.query)

    const list = this.allMon.filter((item) => {
      if (s.typeKey !== 'all' && item.types.indexOf(s.typeKey) === -1) return false
      if (s.gen > 0 && item.gen !== s.gen) return false
      if (s.form !== 'all' && item.form !== s.form) return false
      if (s.onlyFav && !this.favSet.has(item.key)) return false
      return mon.matches(item, terms)
    })

    mon.sortMons(list, s.sort)
    this.filteredMon = list

    const slice = list.slice(0, this.monLimit)
    this.setData({
      monList: slice.map((item) => mon.cell(item, this.favSet)),
      monCount: list.length,
      monHasMore: list.length > this.monLimit
    })
  },

  applyMove(reset) {
    if (reset) this.moveLimit = PAGE_MOVE
    const s = this.moveState
    const terms = mon.terms(this.query)

    const list = this.allMoves.filter((item) => {
      if (s.typeKey !== 'all' && item.type !== s.typeKey) return false
      if (s.cat !== 'all' && item.cat !== s.cat) return false
      if (!terms.length) return true
      for (let i = 0; i < terms.length; i += 1) {
        if (item.searchText.indexOf(terms[i]) === -1) return false
      }
      return true
    })

    mon.sortMoves(list, s.sort)
    this.filteredMove = list

    this.setData({
      moveList: list.slice(0, this.moveLimit),
      moveCount: list.length,
      moveHasMore: list.length > this.moveLimit
    })
  },

  /* ------------------------------------------------------------ 交互 */

  toggleFav(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const next = favs.asSet()
    let added = false
    if (next.has(key)) next.delete(key)
    else {
      next.add(key)
      added = true
    }
    this.favSet = favs.set(Array.from(next))
    this.setData({ monList: this.data.monList.map((item) => (item.key === key ? { ...item, fav: added } : item)) })
    if (this.monState.onlyFav) this.applyMon(true)
    wx.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none', duration: 700 })
  },

  openDetail(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.navigateTo({ url: routes.detail(key) })
  },

  onShareAppMessage() {
    return {
      title: '宝可梦冠军图鉴｜348 只可用宝可梦的种族值、特性与招式',
      path: routes.index,
      imageUrl: '/assets/share.png'
    }
  },

  onShareTimeline() {
    return { title: '宝可梦冠军图鉴｜种族值 · 特性 · 招式 · 使用率' }
  }
})
