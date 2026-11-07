const store = require('../../utils/team-store.js')
const { MOVES, ABILITIES } = require('../../data/pokedex.js')
const { ITEMS } = require('../../data/items.js')
const { calcStats } = require('../../utils/stats.js')
const { getNature } = require('../../utils/natures.js')
const { calcDamage } = require('../../utils/damage.js')
const ui = require('../../utils/ui.js')
const routes = require('../../utils/routes.js')

const ITEM_MAP = {}
ITEMS.forEach((x) => {
  ITEM_MAP[x.key] = x.name
})

const WEATHERS = ['无', '晴天', '下雨']
const STAGES = ['-6', '-5', '-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '+4', '+5', '+6']

function memberView(member) {
  const mon = store.MON_BY_KEY[member.key]
  if (!mon) return null
  const stats = calcStats(mon, member)
  return {
    key: mon.key,
    name: mon.name,
    sprite: mon.sprite,
    typesInfo: mon.types.map(ui.typeInfo),
    abilityName: ABILITIES[member.ability] ? ABILITIES[member.ability].name : '—',
    itemName: member.item ? ITEM_MAP[member.item] || member.item : '无道具',
    natureName: getNature(member.nature).name,
    hp: stats.hp,
    attack: stats.attack,
    spAttack: stats.spAttack,
    defense: stats.defense,
    spDefense: stats.spDefense,
    speed: stats.speed,
    moves: member.moves
      .filter(Boolean)
      .map((key) => ({ key, name: MOVES[key] ? MOVES[key].name : key })),
    raw: member,
    mon
  }
}

Page({
  data: {
    hasTeams: false,
    teams: [],
    teamIndex: 0,
    teamName: '',
    needsMembers: false,

    memberOptions: [],
    attackerIndex: 0,
    defenderIndex: 1,
    attacker: null,
    defender: null,

    moveOptions: [],
    moveIndex: 0,

    weathers: WEATHERS,
    weatherIndex: 0,
    stages: STAGES,
    atkStageIndex: 6,
    defStageIndex: 6,
    atkStageText: STAGES[6],
    defStageText: STAGES[6],

    crit: false,
    reflect: false,
    lightScreen: false,
    burn: false,
    helpingHand: false,
    fullHp: true,
    more: false,

    result: null,
    resultReason: '',

    sheet: ''
  },

  onLoad(options) {
    this.requestedTeamId = (options && options.teamId) || ''
    this.loadTeams()
  },

  onShow() {
    if (this.refreshOnShow) {
      this.refreshOnShow = false
      this.loadTeams()
    }
  },

  /* ------------------------------------------------------------ 队伍 */

  loadTeams() {
    const teams = store.listTeams()
    if (!teams.length) {
      this.setData({ hasTeams: false, teams: [], attacker: null, defender: null, result: null })
      return
    }

    let index = teams.findIndex((t) => t.id === this.requestedTeamId)
    if (index < 0) index = 0

    this.teams = teams
    this.setData({
      hasTeams: true,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        count: t.members.filter(Boolean).length
      })),
      teamIndex: index
    })
    this.applyTeam(teams[index].id)
  },

  applyTeam(teamId) {
    const team = store.getTeam(teamId)
    if (!team) return

    const members = team.members
      .map((m, slot) => (m ? { slot, view: memberView(m) } : null))
      .filter((x) => x && x.view)

    if (members.length < 2) {
      this.members = []
      this.setData({
        teamName: team.name,
        needsMembers: true,
        memberOptions: members.map((x) => x.view.name),
        attacker: members[0] ? members[0].view : null,
        defender: null,
        result: null,
        resultReason: ''
      })
      return
    }

    this.members = members
    this.setData({
      teamName: team.name,
      needsMembers: false,
      memberOptions: members.map((x) => x.view.name),
      attackerIndex: 0,
      defenderIndex: 1
    })
    this.updateSides(0, 1)
  },

  updateSides(ai, di) {
    const attacker = this.members[ai] ? this.members[ai].view : null
    const defender = this.members[di] ? this.members[di].view : null
    const moveOptions = attacker ? attacker.moves : []
    this.setData({
      attacker,
      defender,
      moveOptions,
      moveIndex: 0
    })
    this.compute()
  },

  /* ------------------------------------------------------------ 计算 */

  compute() {
    const { attacker, defender } = this.data
    if (!attacker || !defender) {
      this.setData({ result: null, resultReason: '选择双方宝可梦后自动计算' })
      return
    }
    const move = this.data.moveOptions[this.data.moveIndex]
    if (!move) {
      this.setData({ result: null, resultReason: '先在成员配置里为攻击方选择招式' })
      return
    }

    const result = calcDamage({
      attacker: { mon: attacker.mon, member: attacker.raw },
      defender: { mon: defender.mon, member: defender.raw },
      moveKey: move.key,
      field: {
        weather: this.data.weatherIndex === 1 ? 'sun' : this.data.weatherIndex === 2 ? 'rain' : '',
        crit: this.data.crit,
        reflect: this.data.reflect,
        lightScreen: this.data.lightScreen,
        burn: this.data.burn,
        helpingHand: this.data.helpingHand,
        defenderFullHp: this.data.fullHp,
        atkStage: this.data.atkStageIndex - 6,
        defStage: this.data.defStageIndex - 6
      }
    })

    if (!result.ok) {
      this.setData({ result: null, resultReason: result.reason || '无法计算' })
      return
    }

    this.setData({
      result: {
        moveName: result.moveName,
        effText: result.effText,
        power: result.power,
        categoryName: result.category === 'physical' ? '物理' : result.category === 'special' ? '特殊' : '变化',
        damageText: `${result.damageMin}–${result.damageMax}`,
        percentText: `${result.percentMin}%–${result.percentMax}%`,
        percentWidth: Math.min(100, result.percentMax) + '%',
        koText: result.koChance > 0 ? `乱数击杀 ${result.koChance}%` : '无法一击击杀',
        hitsText: result.hits === '—' ? '—' : `至少 ${result.hits} 击`,
        notes: result.notes || []
      },
      resultReason: ''
    })
  },

  /* ------------------------------------------------------------ 选择 */

  openSheet(e) {
    const kind = e.currentTarget.dataset.kind
    if (!kind) return
    this.setData({ sheet: kind })
  },

  closeSheet() {
    this.setData({ sheet: '' })
  },

  onTeamPick(e) {
    const index = Number(e.currentTarget.dataset.index)
    const team = this.teams[index]
    if (!team) return
    this.requestedTeamId = team.id
    this.setData({ teamIndex: index, sheet: '' })
    this.applyTeam(team.id)
  },

  onAttackerPick(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!this.members || index === this.data.attackerIndex) {
      this.setData({ sheet: '' })
      return
    }
    this.setData({ attackerIndex: index, sheet: '' })
    this.updateSides(index, this.data.defenderIndex)
  },

  onDefenderPick(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!this.members || index === this.data.defenderIndex) {
      this.setData({ sheet: '' })
      return
    }
    this.setData({ defenderIndex: index, sheet: '' })
    this.updateSides(this.data.attackerIndex, index)
  },

  onMove(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.data.moveIndex) return
    this.setData({ moveIndex: index })
    this.compute()
  },

  onWeather(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.data.weatherIndex) return
    this.setData({ weatherIndex: index })
    this.compute()
  },

  onStage(e) {
    const field = e.currentTarget.dataset.field
    const delta = Number(e.currentTarget.dataset.delta)
    if (!field || Number.isNaN(delta)) return
    const indexKey = field === 'atk' ? 'atkStageIndex' : 'defStageIndex'
    const textKey = field === 'atk' ? 'atkStageText' : 'defStageText'
    const next = this.data[indexKey] + delta
    if (next < 0 || next >= STAGES.length) return
    const patch = {}
    patch[indexKey] = next
    patch[textKey] = STAGES[next]
    this.setData(patch)
    this.compute()
  },

  toggleField(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ [key]: !this.data[key] })
    this.compute()
  },

  toggleMore() {
    this.setData({ more: !this.data.more })
  },

  goTeams() {
    wx.navigateTo({ url: routes.teams })
  },

  goTeam() {
    const team = this.teams && this.teams[this.data.teamIndex]
    if (!team) return
    this.refreshOnShow = true
    wx.navigateTo({ url: routes.team(team.id) })
  },

  onShareAppMessage() {
    return {
      title: '宝可梦冠军｜伤害计算',
      path: routes.teams,
      imageUrl: '/assets/share.png'
    }
  }
})
