const store = require('../../utils/team-store.js')
const { MOVES, ABILITIES } = require('../../../../data/pokedex.js')
const { ITEMS } = require('../../data/items.js')
const { calcStats } = require('../../utils/stats.js')
const { getNature } = require('../../utils/natures.js')
const { calcDamage } = require('../../utils/damage.js')
const { typeInfo } = require('../../../../utils/ui.js')

const ITEM_MAP = {}
ITEMS.forEach((x) => { ITEM_MAP[x.key] = x.name })

const WEATHER_OPTIONS = ['无', '晴天', '下雨']
const STAGE_OPTIONS = ['-6', '-5', '-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '+4', '+5', '+6']

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

function memberView(member) {
  const mon = store.MON_BY_KEY[member.key]
  if (!mon) return null
  const stats = calcStats(mon, member)
  return {
    key: mon.key,
    name: mon.name,
    sprite: mon.sprite,
    typesInfo: mon.types.map((t) => typeInfo(t)),
    abilityName: ABILITIES[member.ability] ? ABILITIES[member.ability].name : '—',
    itemName: member.item ? (ITEM_MAP[member.item] || member.item) : '无道具',
    natureName: getNature(member.nature).name,
    stats: statCells(stats),
    moves: member.moves.filter(Boolean).map((key) => ({
      key,
      name: MOVES[key] ? MOVES[key].name : key
    })),
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
    moveOptions: [],
    moveIndex: 0,
    moveName: '请选择招式',
    weatherName: WEATHER_OPTIONS[0],
    atkStageName: STAGE_OPTIONS[6],
    defStageName: STAGE_OPTIONS[6],
    attacker: null,
    defender: null,
    weatherOptions: WEATHER_OPTIONS,
    weatherIndex: 0,
    stageOptions: STAGE_OPTIONS,
    atkStageIndex: 6,
    defStageIndex: 6,
    crit: false,
    reflect: false,
    lightScreen: false,
    burn: false,
    helpingHand: false,
    fullHp: true,
    result: null,
    resultReason: ''
  },

  onLoad(options) {
    this.requestedTeamId = options && options.teamId ? options.teamId : ''
    this.loadTeams()
  },

  onShow() {
    if (this.refreshOnShow) {
      this.refreshOnShow = false
      this.loadTeams()
    }
  },

  loadTeams() {
    const teams = store.listTeams()
    if (!teams.length) {
      this.setData({ hasTeams: false, teams: [] })
      return
    }
    const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }))
    let idx = teams.findIndex((t) => t.id === this.requestedTeamId)
    if (idx < 0) idx = 0
    this.teams = teams
    this.setData({
      hasTeams: true,
      teams: teamOptions,
      teamIndex: idx
    })
    this.applyTeam(teams[idx].id)
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
        result: null
      })
      return
    }
    this.members = members
    this.setData({
      teamName: team.name,
      needsMembers: false,
      memberOptions: members.map((x) => x.view.name),
      attackerIndex: 0,
      defenderIndex: 1,
      moveIndex: 0
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
      moveIndex: 0,
      moveName: moveOptions[0] ? moveOptions[0].name : '请选择招式',
      result: null,
      resultReason: ''
    })
    this.compute(moveOptions[0] ? 0 : -1, attacker, defender)
  },

  compute(moveIndex, attacker, defender) {
    const a = attacker || this.data.attacker
    const d = defender || this.data.defender
    const idx = moveIndex === undefined ? this.data.moveIndex : moveIndex
    const move = a && a.moves[idx] ? a.moves[idx] : null
    if (!a || !d) {
      this.setData({ result: null, resultReason: '请选择双方宝可梦' })
      return
    }
    if (!move) {
      this.setData({ result: null, resultReason: '请选择攻击招式' })
      return
    }
    const result = calcDamage({
      attacker: { mon: a.mon, member: a.raw },
      defender: { mon: d.mon, member: d.raw },
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
        ...result,
        percentText: `${result.percentMin}%–${result.percentMax}%`,
        damageText: `${result.damageMin}–${result.damageMax}`,
        koText: result.koChance > 0 ? `乱数击杀 ${result.koChance}%` : '无法一击击杀',
        hitsText: result.hits === '—' ? '—' : `至少 ${result.hits} 击`,
        categoryName: result.category === 'physical' ? '物理' : result.category === 'special' ? '特殊' : '变化'
      },
      resultReason: ''
    })
  },

  onTeamChange(e) {
    const idx = Number(e.detail.value)
    const team = this.teams[idx]
    if (!team) return
    this.requestedTeamId = team.id
    this.setData({ teamIndex: idx })
    this.applyTeam(team.id)
  },

  onAttacker(e) {
    const idx = Number(e.detail.value)
    if (!this.members || idx === this.data.attackerIndex) return
    this.setData({ attackerIndex: idx })
    this.updateSides(idx, this.data.defenderIndex)
  },

  onDefender(e) {
    const idx = Number(e.detail.value)
    if (!this.members || idx === this.data.defenderIndex) return
    this.setData({ defenderIndex: idx })
    this.updateSides(this.data.attackerIndex, idx)
  },

  onMove(e) {
    const idx = Number(e.detail.value)
    const option = this.data.moveOptions[idx]
    this.setData({ moveIndex: idx, moveName: option ? option.name : '请选择招式' })
    this.compute(idx)
  },

  onWeather(e) {
    const idx = Number(e.detail.value)
    this.setData({ weatherIndex: idx, weatherName: WEATHER_OPTIONS[idx] })
    this.compute(this.data.moveIndex)
  },

  onAtkStage(e) {
    const idx = Number(e.detail.value)
    this.setData({ atkStageIndex: idx, atkStageName: STAGE_OPTIONS[idx] })
    this.compute(this.data.moveIndex)
  },

  onDefStage(e) {
    const idx = Number(e.detail.value)
    this.setData({ defStageIndex: idx, defStageName: STAGE_OPTIONS[idx] })
    this.compute(this.data.moveIndex)
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const patch = {}
    patch[key] = e.detail.value
    this.setData(patch)
    this.compute(this.data.moveIndex)
  },

  goTeams() {
    wx.navigateTo({ url: '/packages/tools/pages/teams/teams' })
  },

  goTeam() {
    const team = this.teams && this.teams[this.data.teamIndex]
    if (!team) return
    this.refreshOnShow = true
    wx.navigateTo({ url: '/packages/tools/pages/team/team?id=' + team.id })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    return {
      title: '宝可梦冠军｜伤害计算',
      path: '/pages/index/index',
      imageUrl: '/assets/share.png'
    }
  }
})


