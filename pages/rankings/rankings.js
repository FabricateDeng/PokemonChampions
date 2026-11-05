const { POKEMON } = require('../../data/pokedex.js')
const usageService = require('../../utils/usage-service.js')
const { typeInfo } = require('../../utils/ui.js')

const MON = {}
POKEMON.forEach((p) => {
  MON[p.key] = p
})

const FORMAT_LIST = [
  { key: 'singles', label: '单打' },
  { key: 'doubles', label: '双打' }
]

function numberText(n) {
  if (!n) return '—'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}

function commaNumber(n) {
  return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function pctText(n) {
  return (n >= 10 ? n.toFixed(1) : n.toFixed(2)) + '%'
}

function buildFormat(format, data) {
  const RANKINGS = data.RANKINGS || {}
  const META = data.META || {}
  const rows = (RANKINGS[format] || []).map((r) => {
    const p = MON[r.key]
    if (!p) return null
    const typesInfo = p.types.map((t) => typeInfo(t))
    return {
      key: r.key,
      rank: r.rank,
      usage: r.usage,
      usageText: pctText(r.usage),
      name: p.name,
      dexLabel: '#' + String(p.dex).padStart(3, '0'),
      sprite: p.sprite,
      typesInfo,
      formLabel: p.formLabel,
      form: p.form,
      subText: format === 'singles'
        ? '样本 ' + numberText(r.raw)
        : '胜率 ' + (r.winRate || 0).toFixed(1) + '%',
      teamText: format === 'singles' ? '' : '队伍 ' + numberText(r.teams)
    }
  }).filter(Boolean)

  const maxUsage = rows.length ? rows[0].usage : 1
  rows.forEach((row) => {
    row.bar = Math.max(5, Math.min(100, (row.usage / maxUsage) * 100)).toFixed(1) + '%'
  })

  const top3 = rows.slice(0, 3)
  const podium = [top3[1], top3[0], top3[2]].filter(Boolean).map((row, i) => ({
    ...row,
    podiumClass: ['second', 'first', 'third'][i],
    medal: ['2', '1', '3'][i]
  }))

  return {
    format,
    formatLabel: format === 'singles' ? '单打' : '双打',
    metaLine: format === 'singles'
      ? `Smogon · ${META.singles.month} · ${META.singles.cutoff} 分位`
      : `Limitless · ${META.doubles.regulation} · ${META.doubles.from.slice(5).replace('-', '.')} – ${META.doubles.to.slice(5).replace('-', '.')}`,
    sampleLine: format === 'singles'
      ? `${commaNumber(META.singles.battles)} 场对战`
      : `${META.doubles.tournaments} 项赛事`,
    sourceLine: format === 'singles' ? META.singles.note : META.doubles.note,
    topUsageText: top3[0] ? top3[0].usageText : '—',
    podium,
    rest: rows.slice(3),
    count: rows.length
  }
}

Page({
  data: {
    meta: {},
    formats: FORMAT_LIST,
    format: 'singles',
    formatLabel: '单打',
    metaLine: '',
    sampleLine: '',
    sourceLine: '',
    topUsageText: '',
    podium: [],
    rest: [],
    count: 0
  },

  onLoad() {
    this.rebuild(usageService.getUsage())
    this.usageUnsubscribe = usageService.subscribe((data) => this.rebuild(data))
    usageService.refresh()
  },

  onUnload() {
    if (this.usageUnsubscribe) this.usageUnsubscribe()
  },

  rebuild(data) {
    this.usageData = data
    this.dataByFormat = {
      singles: buildFormat('singles', data),
      doubles: buildFormat('doubles', data)
    }
    this.applyFormat(this.data.format || 'singles')
  },

  applyFormat(format) {
    const block = this.dataByFormat && this.dataByFormat[format]
    if (!block) return
    this.setData({
      meta: this.usageData.META,
      format,
      formatLabel: block.formatLabel,
      metaLine: block.metaLine,
      sampleLine: block.sampleLine,
      sourceLine: block.sourceLine,
      topUsageText: block.topUsageText,
      podium: block.podium,
      rest: block.rest,
      count: block.count
    })
  },

  switchFormat(e) {
    const format = e.currentTarget.dataset.format
    if (!format || format === this.data.format) return
    this.applyFormat(format)
  },

  openMon(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.navigateTo({
      url: '/pages/detail/detail?key=' + encodeURIComponent(key) + '&tab=usage&format=' + this.data.format
    })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    return {
      title: '宝可梦冠军 单双打使用率 TOP 50',
      path: '/pages/rankings/rankings',
      imageUrl: '/assets/share.png'
    }
  }
})
