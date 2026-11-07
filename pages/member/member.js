const store = require('../../utils/team-store.js')
const { ABILITIES, MOVES } = require('../../data/pokedex.js')
const { ITEMS } = require('../../data/items.js')
const { calcStats, spTotal, blankSp } = require('../../utils/stats.js')
const { NATURES, getNature, natureEffect } = require('../../utils/natures.js')
const ui = require('../../utils/ui.js')

const STAT_LABELS = ['HP', '攻击', '防御', '特攻', '特防', '速度']
const SP_MAX = 32
const SP_TOTAL_MAX = 66

const ITEM_OPTIONS = [{ key: '', name: '无道具', searchText: '无道具' }].concat(
  ITEMS.map((x) => ({ key: x.key, name: x.name, searchText: x.name.toLowerCase() }))
)

const NATURE_OPTIONS = NATURES.map((n) => ({
  key: n.key,
  name: n.name,
  effect: natureEffect(n.key)
}))

Page({
  data: {
    mon: null,
    teamName: '',
    stats: [],
    natureEffectText: '',

    abilityName: '',
    itemName: '',
    natureName: '',

    moveSlots: [],

    spView: [],
    spTotal: 0,
    spLeft: SP_TOTAL_MAX,

    sheet: '',
    sheetTitle: '',

    abilityList: [],
    itemOptions: [],
    itemList: [],
    itemQuery: '',
    natureList: [],
    moveList: [],
    moveQuery: '',
    moveCats: [
      { key: 'all', name: '全部' },
      { key: 'physical', name: '物理' },
      { key: 'special', name: '特殊' },
      { key: 'status', name: '变化' }
    ],
    moveCatIndex: 0,
    moveSlotIndex: 0,
    pendingMoveKey: ''
  },

  onLoad(options) {
    this.teamId = (options && options.teamId) || ''
    this.slot = Number(options && options.slot)

    const team = store.getTeam(this.teamId)
    const member = team && !Number.isNaN(this.slot) && this.slot >= 0 && this.slot < 6
      ? team.members[this.slot]
      : null

    if (!team || !member) {
      wx.showToast({ title: '配置不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }

    this.team = team
    this.member = member
    this.rawMon = store.MON_BY_KEY[member.key]
    if (!this.rawMon) {
      wx.showToast({ title: '宝可梦不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }

    this.abilityOptions = this.rawMon.abilities.map((k) => ({
      key: k,
      name: ABILITIES[k] ? ABILITIES[k].name : k,
      desc: ABILITIES[k] ? ABILITIES[k].desc : ''
    }))
    this.allMoves = this.rawMon.moves
      .map((k) => ui.moveView(k))
      .filter(Boolean)
      .map((m) => ({ ...m, selected: false }))

    this.setData({
      teamName: team.name,
      mon: {
        key: this.rawMon.key,
        name: this.rawMon.name,
        sprite: this.rawMon.sprite,
        dexLabel: '#' + String(this.rawMon.dex).padStart(3, '0'),
        typesInfo: this.rawMon.types.map(ui.typeInfo),
        total: this.rawMon.total
      },
      abilityOptions: this.abilityOptions,
      itemOptions: ITEM_OPTIONS.map((x) => ({ key: x.key, name: x.name }))    })

    this.refresh()
  },

  refresh() {
    if (!this.member || !this.rawMon) return
    const stats = calcStats(this.rawMon, this.member)
    const sp = Array.isArray(this.member.sp) ? this.member.sp : blankSp()
    const total = spTotal(sp)

    const moveSlots = [0, 1, 2, 3].map((i) => {
      const key = this.member.moves[i] || ''
      const move = key ? MOVES[key] : null
      const ti = move ? ui.typeInfo(move.type) : null
      return {
        index: i,
        key,
        name: move ? move.name : '选择招式',
        empty: !move,
        typeName: ti ? ti.name : '',
        typeColor: ti ? ti.color : '',
        typeBg: ti ? ti.bg : '',
        powerText: move ? ui.powerText(move.power) : ''
      }
    })

    this.setData({
      stats: STAT_LABELS.map((label, i) => ({
        key: 'stat' + i,
        label,
        value: stats[['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'][i]]
      })),
      natureEffectText: natureEffect(this.member.nature),
      abilityName: (ABILITIES[this.member.ability] || {}).name || '未选特性',
      itemName: this.member.item
        ? (ITEM_OPTIONS.find((x) => x.key === this.member.item) || {}).name || this.member.item
        : '无道具',
      natureName: getNature(this.member.nature).name,
      moveSlots,
      spView: sp.map((value, i) => ({
        index: i,
        key: 'sp' + i,
        label: STAT_LABELS[i],
        value,
        canMinus: value > 0,
        canPlus: value < SP_MAX && total < SP_TOTAL_MAX
      })),
      spTotal: total,
      spLeft: Math.max(0, SP_TOTAL_MAX - total)
    })
  },

  save(patch) {
    const updated = store.updateMember(this.teamId, this.slot, patch)
    if (!updated) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      return
    }
    this.member = updated
    this.refresh()
  },

  /* ------------------------------------------------------------ 面板开关 */

  openSheet(e) {
    const kind = e.currentTarget.dataset.kind
    if (!kind) return
    const titles = {
      ability: '选择特性',
      item: '选择道具',
      nature: '选择性格',
      move: '选择招式'
    }
    const patch = { sheet: kind, sheetTitle: titles[kind] || '' }

    if (kind === 'ability') {
      patch.abilityList = this.abilityOptions.map((a) => ({
        key: a.key,
        name: a.name,
        desc: a.desc,
        selected: a.key === this.member.ability
      }))
    }
    if (kind === 'item') {
      patch.itemQuery = ''
      patch.itemList = this.filterItems('')
    }
    if (kind === 'nature') {
      patch.natureList = NATURE_OPTIONS.map((n) => ({
        key: n.key,
        name: n.name,
        effect: n.effect,
        selected: n.key === this.member.nature
      }))
    }
    if (kind === 'move') {
      const slot = Number(e.currentTarget.dataset.slot)
      this.moveSlot = slot
      patch.moveSlotIndex = slot
      patch.moveQuery = ''
      patch.moveCatIndex = 0
      patch.moveList = this.filterMoves('', 'all')
    }

    this.setData(patch)
  },

  closeSheet() {
    this.setData({ sheet: '' })
  },

  /* ------------------------------------------------------------ 特性 / 道具 / 性格 */

  pickAbility(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ sheet: '' })
    this.save({ ability: key })
  },

  filterItems(query) {
    const q = (query || '').trim().toLowerCase()
    const base = ITEM_OPTIONS
    const list = q ? base.filter((x) => x.searchText.indexOf(q) !== -1) : base
    return list.slice(0, 60).map((x) => ({
      key: x.key,
      name: x.name,
      selected: x.key === this.member.item
    }))
  },

  onItemSearch(e) {
    const query = e.detail.value || ''
    this.setData({ itemQuery: query })
    if (this.itemTimer) clearTimeout(this.itemTimer)
    this.itemTimer = setTimeout(() => {
      this.setData({ itemList: this.filterItems(query) })
    }, 150)
  },

  clearItemSearch() {
    if (this.itemTimer) clearTimeout(this.itemTimer)
    this.setData({ itemQuery: '', itemList: this.filterItems('') })
  },

  pickItem(e) {
    const key = e.currentTarget.dataset.key
    if (key === undefined) return
    this.setData({ sheet: '' })
    this.save({ item: key })
  },

  pickNature(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ sheet: '' })
    this.save({ nature: key })
  },

  /* ------------------------------------------------------------ 招式 */

  filterMoves(query, cat) {
    const q = (query || '').trim().toLowerCase()
    return this.allMoves
      .filter((m) => {
        if (cat !== 'all' && m.cat !== cat) return false
        if (q && m.searchText.indexOf(q) === -1) return false
        return true
      })
      .slice(0, 80)
      .map((m) => ({
        ...m,
        selected: this.member.moves.indexOf(m.key) !== -1
      }))
  },

  onMoveSearch(e) {
    const query = e.detail.value || ''
    this.setData({ moveQuery: query })
    if (this.moveTimer) clearTimeout(this.moveTimer)
    this.moveTimer = setTimeout(() => {
      const cat = this.data.moveCats[this.data.moveCatIndex].key
      this.setData({ moveList: this.filterMoves(query, cat) })
    }, 150)
  },

  onMoveCat(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.data.moveCatIndex) return
    const cat = this.data.moveCats[index].key
    this.setData({ moveCatIndex: index, moveList: this.filterMoves(this.data.moveQuery, cat) })
  },

  clearMoveSearch() {
    if (this.moveTimer) clearTimeout(this.moveTimer)
    const cat = this.data.moveCats[this.data.moveCatIndex].key
    this.setData({ moveQuery: '', moveList: this.filterMoves('', cat) })
  },

  pickMove(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const slot = this.moveSlot
    const moves = (this.member.moves || []).slice(0, 4)
    while (moves.length < 4) moves.push('')
    if (moves.some((k, i) => i !== slot && k === key)) {
      wx.showToast({ title: '同一招式不能重复携带', icon: 'none' })
      return
    }
    moves[slot] = key
    this.setData({ sheet: '' })
    this.save({ moves })
  },

  clearMove(e) {
    const slot = Number(e.currentTarget.dataset.slot)
    if (Number.isNaN(slot)) return
    const moves = (this.member.moves || []).slice(0, 4)
    while (moves.length < 4) moves.push('')
    moves[slot] = ''
    this.setData({ sheet: '' })
    this.save({ moves })
  },

  /* ------------------------------------------------------------ 努力值 */

  changeSp(e) {
    const index = Number(e.currentTarget.dataset.index)
    const delta = Number(e.currentTarget.dataset.delta)
    if (Number.isNaN(index) || Number.isNaN(delta)) return

    const sp = (this.member.sp || blankSp()).slice()
    const next = (sp[index] || 0) + delta
    if (next < 0 || next > SP_MAX) return
    if (delta > 0 && spTotal(sp) >= SP_TOTAL_MAX) {
      wx.showToast({ title: '努力值总和上限 66 点', icon: 'none' })
      return
    }
    sp[index] = next
    this.save({ sp })
  },

  resetSp() {
    this.save({ sp: blankSp() })
  },

  /* ------------------------------------------------------------ 移除 */

  removeMember() {
    wx.showModal({
      title: '移出队伍',
      content: `把「${this.rawMon.name}」从队伍中移除？`,
      confirmText: '移除',
      confirmColor: '#f0616f',
      success: (res) => {
        if (!res.confirm) return
        store.removeMember(this.teamId, this.slot)
        wx.navigateBack()
      }
    })
  },

  onShareAppMessage() {
    return {
      title: `宝可梦冠军配置｜${this.data.mon ? this.data.mon.name : '能力值'}`,
      path: '/pages/teams/teams',
      imageUrl: '/assets/share.png'
    }
  }
})
