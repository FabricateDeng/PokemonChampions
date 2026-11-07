const store = require('../../utils/team-store.js')
const { ABILITIES, MOVES } = require('../../data/pokedex.js')
const { ITEMS } = require('../../data/items.js')
const { getNature } = require('../../utils/natures.js')
const { typeInfo } = require('../../utils/ui.js')
const routes = require('../../utils/routes.js')

const ITEM_MAP = {}
ITEMS.forEach((x) => {
  ITEM_MAP[x.key] = x.name
})

function slotView(member, index) {
  if (!member) return { index, key: 'slot' + index, empty: true }
  const mon = store.MON_BY_KEY[member.key]
  if (!mon) return { index, key: 'slot' + index, empty: true }

  const moveNames = member.moves
    .filter(Boolean)
    .map((k) => (MOVES[k] ? MOVES[k].name : ''))
    .filter(Boolean)

  return {
    index,
    key: 'slot' + index,
    empty: false,
    name: mon.name,
    sprite: mon.sprite,
    typesInfo: mon.types.map(typeInfo),
    abilityName: ABILITIES[member.ability] ? ABILITIES[member.ability].name : '未选特性',
    itemName: member.item ? ITEM_MAP[member.item] || member.item : '无道具',
    natureName: getNature(member.nature).name,
    moveText: moveNames.length ? moveNames.join(' / ') : '未配置招式',
    movesEmpty: !moveNames.length
  }
}

Page({
  data: {
    teamId: '',
    name: '',
    slots: [],
    count: 0,
    canCalc: false,
    sheet: false
  },

  onLoad(options) {
    this.teamId = (options && options.id) || ''
    if (!this.teamId) {
      wx.showToast({ title: '队伍不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
    }
  },

  onShow() {
    if (this.teamId) this.load()
  },

  onHide() {
    this.saveName()
  },

  load() {
    const team = store.getTeam(this.teamId)
    if (!team) {
      wx.showToast({ title: '队伍不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    const slots = team.members.map((member, index) => slotView(member, index))
    const count = slots.filter((s) => !s.empty).length
    this.setData({
      teamId: team.id,
      name: team.name,
      slots,
      count,
      canCalc: count >= 2
    })
  },

  /* ------------------------------------------------------------ 队名 */

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onNameBlur() {
    this.saveName()
  },

  saveName() {
    const team = store.getTeam(this.teamId)
    if (!team) return
    const name = (this.data.name || '').trim() || '未命名队伍'
    if (name === team.name) {
      if (name !== this.data.name) this.setData({ name })
      return
    }
    team.name = name
    store.saveTeam(team)
    this.setData({ name })
  },

  /* ------------------------------------------------------------ 成员 */

  addMember(e) {
    const slot = Number(e.currentTarget.dataset.slot)
    if (Number.isNaN(slot)) return
    wx.navigateTo({ url: routes.picker(this.teamId, slot) })
  },

  editMember(e) {
    const slot = Number(e.currentTarget.dataset.slot)
    if (Number.isNaN(slot)) return
    wx.navigateTo({ url: routes.member(this.teamId, slot) })
  },

  /* ------------------------------------------------------------ 菜单 */

  openMenu() {
    this.setData({ sheet: true })
  },

  closeMenu() {
    this.setData({ sheet: false })
  },

  deleteTeam() {
    const team = store.getTeam(this.teamId)
    if (!team) return
    wx.showModal({
      title: '删除队伍',
      content: `「${team.name}」及其配置将被删除，且无法恢复。`,
      confirmText: '删除',
      confirmColor: '#f0616f',
      success: (res) => {
        if (!res.confirm) return
        store.deleteTeam(this.teamId)
        wx.showToast({ title: '已删除', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 320)
      }
    })
  },

  goCalc() {
    if (!this.data.canCalc) {
      wx.showToast({ title: '至少需要 2 只宝可梦', icon: 'none' })
      return
    }
    wx.navigateTo({ url: routes.calc(this.teamId) })
  },

  onShareAppMessage() {
    return {
      title: `宝可梦冠军队伍｜${this.data.name}`,
      path: routes.teams,
      imageUrl: '/assets/share.png'
    }
  }
})
