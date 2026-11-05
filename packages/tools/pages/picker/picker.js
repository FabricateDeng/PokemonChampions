const { POKEMON, TYPES } = require('../../../../data/pokedex.js')
const store = require('../../utils/team-store.js')
const { typeInfo } = require('../../../../utils/ui.js')

const TYPE_KEYS = Object.keys(TYPES)
const LIMIT = 40

function buildList() {
  return POKEMON.map((p) => {
    const typesInfo = p.types.map((t) => typeInfo(t))
    return {
      key: p.key,
      name: p.name,
      dexLabel: '#' + String(p.dex).padStart(3, '0'),
      sprite: p.sprite,
      typesInfo,
      total: p.total,
      formLabel: p.formLabel,
      searchText: [p.name, p.key, p.dex, String(p.dex).padStart(3, '0'), ...typesInfo.map((t) => t.name)]
        .join(' ').toLowerCase()
    }
  })
}

Page({
  data: {
    teamName: '',
    slotLabel: '',
    query: '',
    typeKey: 'all',
    typeList: [],
    list: [],
    resultCount: 0,
    hasMore: false
  },

  onLoad(options) {
    this.teamId = options && options.teamId ? options.teamId : ''
    this.slot = Number(options && options.slot)
    const team = store.getTeam(this.teamId)
    if (!team || Number.isNaN(this.slot) || this.slot < 0 || this.slot >= 6) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }
    this.team = team
    this.all = buildList()
    this.limit = LIMIT
    const existing = team.members.filter(Boolean).map((m) => m.key)
    this.existing = new Set(existing)
    this.setData({
      teamName: team.name,
      slotLabel: '第 ' + (this.slot + 1) + ' 个位置',
      typeList: [
        { key: 'all', name: '全部', color: '#FFD84D', textOn: '#10130a' },
        ...TYPE_KEYS.map((k) => typeInfo(k))
      ]
    })
    this.apply()
  },

  apply() {
    const q = (this.data.query || '').trim().toLowerCase()
    const typeKey = this.data.typeKey
    let list = this.all.filter((p) => {
      if (typeKey !== 'all' && p.typesInfo.every((t) => t.key !== typeKey)) return false
      if (q && p.searchText.indexOf(q) === -1) return false
      return true
    })
    this.filtered = list
    this.render(true)
  },

  render(reset) {
    if (reset) this.limit = LIMIT
    const list = (this.filtered || []).slice(0, this.limit)
    this.setData({
      list,
      resultCount: (this.filtered || []).length,
      hasMore: (this.filtered || []).length > this.limit
    })
  },

  onSearchInput(e) {
    this.setData({ query: e.detail.value || '' })
    this.apply()
  },

  clearSearch() {
    this.setData({ query: '' })
    this.apply()
  },

  onTypeTap(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ typeKey: key })
    this.apply()
  },

  onReachBottom() {
    if (!this.data.hasMore) return
    this.limit += LIMIT
    this.render(false)
  },

  select(e) {
    const key = e.currentTarget.dataset.key
    const mon = store.MON_BY_KEY[key]
    if (!mon) return
    if (this.existing.has(key)) {
      wx.showToast({ title: '队伍中已有这只宝可梦', icon: 'none' })
      return
    }
    store.setMember(this.teamId, this.slot, store.defaultMember(mon))
    wx.redirectTo({
      url: `/packages/tools/pages/member/member?teamId=${this.teamId}&slot=${this.slot}`
    })
  },

  cancel() {
    wx.navigateBack()
  }
})


