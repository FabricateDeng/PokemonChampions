const monUtil = require('../../utils/mon.js')
const ui = require('../../utils/ui.js')
const store = require('../../utils/team-store.js')
const routes = require('../../utils/routes.js')
const system = require('../../utils/system.js')

const PAGE = 40

Page({
  data: {
    navTotalHeight: 64,
    slotLabel: '',
    teamName: '',
    query: '',
    typeKey: 'all',
    typeList: [],
    list: [],
    count: 0,
    hasMore: false
  },

  onLoad(options) {
    const metrics = system.getMetrics()
    this.teamId = (options && options.teamId) || ''
    this.slot = Number(options && options.slot)

    const team = store.getTeam(this.teamId)
    if (!team || Number.isNaN(this.slot) || this.slot < 0 || this.slot >= 6) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }

    this.team = team
    this.limit = PAGE
    this.allList = monUtil.all()
    this.inTeam = new Set(team.members.filter(Boolean).map((m) => m.key))

    this.setData({
      navTotalHeight: metrics.navTotalHeight,
      teamName: team.name,
      slotLabel: `第 ${this.slot + 1} 位 · ${team.name}`,
      typeList: ui.typeChips()
    })
    this.apply(true)
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
  },

  onReachBottom() {
    if (!this.data.hasMore) return
    this.limit += PAGE
    this.apply(false)
  },

  apply(reset) {
    if (reset) this.limit = PAGE
    const terms = monUtil.terms(this.data.query)
    const typeKey = this.data.typeKey

    const filtered = this.allList.filter((item) => {
      if (typeKey !== 'all' && item.types.indexOf(typeKey) === -1) return false
      if (!terms.length) return true
      for (let i = 0; i < terms.length; i += 1) {
        if (item.searchText.indexOf(terms[i]) === -1) return false
      }
      return true
    })
    this.filtered = filtered

    this.setData({
      list: filtered.slice(0, this.limit).map((item) => ({
        key: item.key,
        name: item.name,
        dexLabel: item.dexLabel,
        sprite: item.sprite,
        typesInfo: item.typesInfo,
        total: item.total,
        inTeam: this.inTeam.has(item.key)
      })),
      count: filtered.length,
      hasMore: filtered.length > this.limit
    })
  },

  onSearch(e) {
    this.setData({ query: e.detail.value || '' })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.apply(true), 150)
  },

  clearQuery() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.setData({ query: '' })
    this.apply(true)
  },

  onType(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.typeKey) return
    this.setData({ typeKey: key })
    this.apply(true)
  },

  select(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    if (this.inTeam.has(key)) {
      wx.showToast({ title: '队伍中已有这只宝可梦', icon: 'none' })
      return
    }
    const mon = store.MON_BY_KEY[key]
    if (!mon) return
    store.setMember(this.teamId, this.slot, store.defaultMember(mon))
    wx.redirectTo({ url: routes.member(this.teamId, this.slot) })
  }
})
