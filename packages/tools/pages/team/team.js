const store = require('../../utils/team-store.js')
const { ABILITIES, MOVES } = require('../../../../data/pokedex.js')
const { ITEMS } = require('../../data/items.js')
const { calcStats } = require('../../utils/stats.js')
const { getNature, natureEffect } = require('../../utils/natures.js')
const { typeInfo } = require('../../../../utils/ui.js')

const ITEM_MAP = {}
ITEMS.forEach((x) => { ITEM_MAP[x.key] = x.name })

function statCells(stats) {
  return [
    { key: 'hp', label: 'HP', value: stats.hp },
    { key: 'attack', label: '攻击', value: stats.attack },
    { key: 'defense', label: '防御', value: stats.defense },
    { key: 'spAttack', label: '特攻', value: stats.spAttack },
    { key: 'spDefense', label: '特防', value: stats.spDefense },
    { key: 'speed', label: '速度', value: stats.speed }
  ]
}

Page({
  data: {
    teamId: '',
    teamName: '',
    slots: [],
    memberCount: 0
  },

  onLoad(options) {
    this.teamId = options && options.id ? options.id : ''
    if (!this.teamId) {
      wx.showToast({ title: '队伍不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
    }
  },

  onShow() {
    if (this.teamId) this.load()
  },

  load() {
    const team = store.getTeam(this.teamId)
    if (!team) {
      wx.showToast({ title: '队伍不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }
    const slots = team.members.map((member, index) => {
      if (!member) return { index, empty: true }
      const mon = store.MON_BY_KEY[member.key]
      if (!mon) return { index, empty: true }
      const stats = calcStats(mon, member)
      const moveNames = member.moves
        .filter(Boolean)
        .map((key) => (MOVES[key] ? MOVES[key].name : key))
      return {
        index,
        empty: false,
        key: mon.key,
        name: mon.name,
        sprite: mon.sprite,
        typesInfo: mon.types.map((t) => typeInfo(t)),
        ability: ABILITIES[member.ability] ? ABILITIES[member.ability].name : '—',
        item: member.item ? (ITEM_MAP[member.item] || member.item) : '无道具',
        nature: getNature(member.nature).name,
        natureEffect: natureEffect(member.nature),
        moveNames,
        stats: statCells(stats),
        spTotal: (member.sp || []).reduce((a, b) => a + b, 0)
      }
    })
    this.setData({
      teamId: team.id,
      teamName: team.name,
      slots,
      memberCount: slots.filter((s) => !s.empty).length
    })
  },

  onNameInput(e) {
    this.setData({ teamName: e.detail.value })
  },

  onHide() {
    this.onNameBlur()
  },

  onNameBlur() {
    const team = store.getTeam(this.teamId)
    if (!team) return
    const name = (this.data.teamName || '').trim() || '未命名队伍'
    team.name = name
    store.saveTeam(team)
    if (name !== this.data.teamName) this.setData({ teamName: name })
  },

  addMember(e) {
    const slot = Number(e.currentTarget.dataset.slot)
    if (Number.isNaN(slot)) return
    wx.navigateTo({
      url: `/packages/tools/pages/picker/picker?teamId=${this.teamId}&slot=${slot}`
    })
  },

  editMember(e) {
    const slot = Number(e.currentTarget.dataset.slot)
    if (Number.isNaN(slot)) return
    wx.navigateTo({
      url: `/packages/tools/pages/member/member?teamId=${this.teamId}&slot=${slot}`
    })
  },

  removeMember(e) {
    const slot = Number(e.currentTarget.dataset.slot)
    if (Number.isNaN(slot)) return
    wx.showModal({
      title: '移除宝可梦',
      content: '确定从队伍中移除这只宝可梦吗？',
      confirmColor: '#FF5C6C',
      success: (res) => {
        if (!res.confirm) return
        store.removeMember(this.teamId, slot)
        this.load()
        wx.showToast({ title: '已移除', icon: 'none' })
      }
    })
  },

  goCalc() {
    if (this.data.memberCount < 2) {
      wx.showToast({ title: '至少需要 2 只宝可梦', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/packages/tools/pages/calc/calc?teamId=' + this.teamId })
  },

  goTeams() {
    wx.navigateBack()
  },

  onShareAppMessage() {
    return {
      title: `宝可梦冠军队伍｜${this.data.teamName}`,
      path: '/pages/index/index',
      imageUrl: '/assets/share.png'
    }
  }
})


