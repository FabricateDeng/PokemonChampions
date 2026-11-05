const store = require('../../utils/team-store.js')
const { ABILITIES, MOVES } = require('../../../../data/pokedex.js')
const { ITEMS } = require('../../data/items.js')
const { calcStats, statsArray, spTotal, blankSp } = require('../../utils/stats.js')
const { NATURES, getNature, natureEffect } = require('../../utils/natures.js')
const { typeInfo } = require('../../../../utils/ui.js')

const ITEM_OPTIONS = [{ key: '', name: '无道具' }].concat(
  ITEMS.map((x) => ({ key: x.key, name: x.name }))
)

const NATURE_OPTIONS = NATURES.map((n) => ({
  key: n.key,
  name: n.name + '（' + natureEffect(n.key) + '）'
}))

const SP_FIELDS = [
  { key: 'hp', label: 'HP', color: '#FF6B6B' },
  { key: 'attack', label: '攻击', color: '#FFA45B' },
  { key: 'defense', label: '防御', color: '#FFD166' },
  { key: 'spAttack', label: '特攻', color: '#6FA8FF' },
  { key: 'spDefense', label: '特防', color: '#59D6A7' },
  { key: 'speed', label: '速度', color: '#F472C6' }
]

Page({
  data: {
    teamName: '',
    mon: null,
    typesInfo: [],
    abilityOptions: [],
    abilityIndex: 0,
    itemOptions: ITEM_OPTIONS,
    itemIndex: 0,
    natureOptions: NATURE_OPTIONS,
    natureIndex: 0,
    abilityName: '',
    itemName: '',
    natureName: '',
    moveOptions: [],
    moveSlots: [],
    spFields: SP_FIELDS,
    spView: [],
    sp: [0, 0, 0, 0, 0, 0],
    spTotal: 0,
    stats: [],
    natureEffectText: '',
    hasMember: false
  },

  onLoad(options) {
    this.teamId = options && options.teamId ? options.teamId : ''
    this.slot = Number(options && options.slot)
    const team = store.getTeam(this.teamId)
    const member = team && !Number.isNaN(this.slot) && this.slot >= 0 && this.slot < 6
      ? team.members[this.slot]
      : null
    if (!team || !member) {
      wx.showToast({ title: '配置不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }
    this.team = team
    this.member = member
    this.mon = store.MON_BY_KEY[member.key]
    if (!this.mon) {
      wx.showToast({ title: '宝可梦不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }

    const abilityOptions = this.mon.abilities.map((k) => ({
      key: k,
      name: ABILITIES[k] ? ABILITIES[k].name : k
    }))
    const moveOptions = [{ key: '', name: '无' }].concat(
      this.mon.moves.map((k) => ({
        key: k,
        name: MOVES[k] ? MOVES[k].name : k
      }))
    )
    this.moveOptions = moveOptions

    this.setData({
      teamName: team.name,
      mon: {
        key: this.mon.key,
        name: this.mon.name,
        sprite: this.mon.sprite,
        dexLabel: '#' + String(this.mon.dex).padStart(3, '0'),
        typesInfo: this.mon.types.map((t) => typeInfo(t))
      },
      abilityOptions,
      abilityIndex: Math.max(0, this.mon.abilities.indexOf(member.ability)),
      itemIndex: Math.max(0, ITEM_OPTIONS.findIndex((x) => x.key === member.item)),
      natureIndex: Math.max(0, NATURE_OPTIONS.findIndex((x) => x.key === member.nature)),
      moveOptions,
      hasMember: true
    })
    this.refresh()
  },

  refresh() {
    if (!this.member || !this.mon) return
    const stats = calcStats(this.mon, this.member)
    const statList = statsArray(stats)
    const moveSlots = [0, 1, 2, 3].map((i) => {
      const key = this.member.moves[i] || ''
      const move = key ? MOVES[key] : null
      const ti = move ? typeInfo(move.type) : null
      return {
        index: i,
        key,
        name: move ? move.name : '无',
        empty: !move,
        optionIndex: Math.max(0, this.moveOptions.findIndex((x) => x.key === key)),
        typeName: ti ? ti.name : '',
        typeColor: ti ? ti.color : '#8A96AB',
        typeBg: ti ? ti.bg : 'rgba(138,150,171,0.12)'
      }
    })
    const abilityIndex = Math.max(0, this.mon.abilities.indexOf(this.member.ability))
    const itemIndex = Math.max(0, ITEM_OPTIONS.findIndex((x) => x.key === this.member.item))
    const natureIndex = Math.max(0, NATURE_OPTIONS.findIndex((x) => x.key === this.member.nature))
    this.setData({
      sp: this.member.sp,
      spView: SP_FIELDS.map((field, i) => ({
        ...field,
        index: i,
        value: this.member.sp[i]
      })),
      spTotal: spTotal(this.member.sp),
      stats: statList,
      moveSlots,
      natureEffectText: natureEffect(this.member.nature),
      abilityIndex,
      itemIndex,
      natureIndex,
      abilityName: (this.data.abilityOptions[abilityIndex] || {}).name || '',
      itemName: (ITEM_OPTIONS[itemIndex] || {}).name || '',
      natureName: (NATURE_OPTIONS[natureIndex] || {}).name || ''
    })
  },

  save(patch) {
    const updated = store.updateMember(this.teamId, this.slot, patch)
    if (!updated) {
      wx.showToast({ title: '保存失败', icon: 'none' })
      return
    }
    this.member = updated
    this.refresh()
  },

  onAbility(e) {
    const idx = Number(e.detail.value)
    const option = this.data.abilityOptions[idx]
    if (!option) return
    this.save({ ability: option.key })
  },

  onItem(e) {
    const idx = Number(e.detail.value)
    const option = ITEM_OPTIONS[idx]
    if (!option) return
    this.save({ item: option.key })
  },

  onNature(e) {
    const idx = Number(e.detail.value)
    const option = NATURE_OPTIONS[idx]
    if (!option) return
    this.save({ nature: option.key })
  },

  onMove(e) {
    const slot = Number(e.currentTarget.dataset.slot)
    const idx = Number(e.detail.value)
    const option = this.moveOptions[idx]
    if (!option || Number.isNaN(slot)) return
    if (option.key) {
      const duplicate = this.member.moves.some((key, i) => i !== slot && key === option.key)
      if (duplicate) {
        wx.showToast({ title: '不能重复携带同一招式', icon: 'none' })
        this.refresh()
        return
      }
    }
    const moves = this.member.moves.slice()
    moves[slot] = option.key
    this.save({ moves })
  },

  changeSp(e) {
    const index = Number(e.currentTarget.dataset.index)
    const delta = Number(e.currentTarget.dataset.delta)
    if (Number.isNaN(index) || Number.isNaN(delta)) return
    const sp = this.member.sp.slice()
    const next = (sp[index] || 0) + delta
    if (next < 0 || next > 32) return
    if (delta > 0 && spTotal(sp) >= 66) {
      wx.showToast({ title: '努力值总和最多 66 点', icon: 'none' })
      return
    }
    sp[index] = next
    this.save({ sp })
  },

  resetSp() {
    this.save({ sp: blankSp() })
  },

  removeMember() {
    wx.showModal({
      title: '移除宝可梦',
      content: `确定移除「${this.data.mon.name}」吗？`,
      confirmColor: '#FF5C6C',
      success: (res) => {
        if (!res.confirm) return
        store.removeMember(this.teamId, this.slot)
        wx.navigateBack()
      }
    })
  },

  goCalc() {
    wx.navigateTo({ url: '/packages/tools/pages/calc/calc?teamId=' + this.teamId })
  },

  onShareAppMessage() {
    return {
      title: `宝可梦冠军配置｜${this.data.mon ? this.data.mon.name : '能力值'}`,
      path: '/pages/index/index',
      imageUrl: '/assets/share.png'
    }
  }
})


