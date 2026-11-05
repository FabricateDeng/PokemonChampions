const store = require('../../utils/team-store.js')

function decorate(team) {
  const members = (team.members || []).filter(Boolean).map((m) => {
    const mon = store.MON_BY_KEY[m.key]
    return mon
      ? { key: m.key, name: mon.name, sprite: mon.sprite, types: mon.types }
      : null
  }).filter(Boolean)
  return {
    id: team.id,
    name: team.name,
    count: members.length,
    members,
    date: (team.updatedAt || team.createdAt || '').slice(0, 10)
  }
}

Page({
  data: {
    teams: [],
    hasTeams: false
  },

  onShow() {
    this.load()
  },

  load() {
    const teams = store.listTeams().map(decorate)
    this.setData({ teams, hasTeams: teams.length > 0 })
  },

  createTeam() {
    const team = store.createTeam()
    wx.navigateTo({ url: '/packages/tools/pages/team/team?id=' + team.id })
  },

  openTeam(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/packages/tools/pages/team/team?id=' + id })
  },

  deleteTeam(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '该队伍'
    if (!id) return
    wx.showModal({
      title: '删除队伍',
      content: `确定删除「${name}」吗？`,
      confirmColor: '#FF5C6C',
      success: (res) => {
        if (!res.confirm) return
        store.deleteTeam(id)
        this.load()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    return {
      title: '宝可梦冠军｜队伍编辑与伤害计算',
      path: '/pages/index/index',
      imageUrl: '/assets/share.png'
    }
  }
})


