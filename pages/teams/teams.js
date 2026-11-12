const store = require('../../utils/team-store.js')
const routes = require('../../utils/routes.js')
const system = require('../../utils/system.js')

function decorate(team) {
  const members = team.members.filter(Boolean)
  const slots = [0, 1, 2, 3, 4, 5].map((i) => {
    const member = team.members[i]
    const mon = member ? store.MON_BY_KEY[member.key] : null
    return {
      key: 'slot' + i,
      empty: !mon,
      sprite: mon ? mon.sprite : '',
      name: mon ? mon.name : ''
    }
  })
  return {
    id: team.id,
    name: team.name,
    count: members.length,
    slots,
    updated: (team.updatedAt || team.createdAt || '').slice(0, 10)
  }
}

Page({
  data: {
    teams: [],
    count: 0
  },

  onShow() {
    system.applyPageBackground()
    this.load()
  },

  load() {
    const teams = store.listTeams().map(decorate)
    this.setData({ teams, count: teams.length })
  },

  createTeam() {
    const team = store.createTeam()
    wx.navigateTo({ url: routes.team(team.id) })
  },

  openTeam(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: routes.team(id) })
  },

  onShareAppMessage() {
    return {
      title: '宝可梦冠军｜队伍编辑与伤害计算',
      path: routes.index,
      imageUrl: '/assets/share.png'
    }
  }
})
