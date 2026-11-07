const monUtil = require('../../utils/mon.js')
const fmt = require('../../utils/format.js')
const routes = require('../../utils/routes.js')
const usageService = require('../../utils/usage-service.js')

const FORMATS = [
  { key: 'singles', label: '单打' },
  { key: 'doubles', label: '双打' }
]

Page({
  data: {
    formats: FORMATS,
    format: 'singles',
    formatLabel: '单打',
    sourceText: '',
    sampleText: '',
    note: '',
    top: [],
    rows: [],
    count: 0
  },

  onLoad() {
    this.apply(usageService.getUsage(), 'singles')
    this.unsubscribe = usageService.subscribe((data) => this.apply(data, this.data.format))
    usageService.refresh()
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe()
  },

  onFormat(e) {
    const format = e.detail.key
    if (!format || format === this.data.format) return
    this.apply(this.usageData, format)
  },

  apply(data, format) {
    if (!data) return
    this.usageData = data
    const meta = data.META || {}
    const list = (data.RANKINGS && data.RANKINGS[format]) || []
    const isSingles = format === 'singles'

    const rows = list
      .map((row) => {
        const m = monUtil.byKey()[row.key]
        if (!m) return null
        return {
          key: row.key,
          rank: row.rank,
          name: m.name,
          dexLabel: m.dexLabel,
          sprite: m.sprite,
          typesInfo: m.typesInfo,
          usage: row.usage,
          usageText: fmt.pctText(row.usage),
          extra: isSingles
            ? '样本 ' + fmt.numberText(row.raw)
            : '胜率 ' + (row.winRate || 0).toFixed(1) + '%'
        }
      })
      .filter(Boolean)

    const max = rows.length ? rows[0].usage : 1
    rows.forEach((row) => {
      row.width = Math.max(4, Math.min(100, (row.usage / max) * 100)) + '%'
    })

    this.setData({
      format,
      formatLabel: isSingles ? '单打' : '双打',
      sourceText: isSingles
        ? `${meta.singles.source} · ${meta.singles.month} · ${meta.singles.cutoff} 分位`
        : `${meta.doubles.source} · ${meta.doubles.regulation} · 近 30 天`,
      sampleText: isSingles
        ? `${fmt.comma(meta.singles.battles)} 场对战`
        : `${meta.doubles.tournaments} 项赛事`,
      note: isSingles ? meta.singles.note : meta.doubles.note,
      top: rows.slice(0, 3),
      rows: rows.slice(3),
      count: rows.length
    })
  },

  openMon(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.navigateTo({
      url: routes.detail(key) + '&tab=usage&format=' + this.data.format
    })
  },

  onShareAppMessage() {
    return {
      title: '宝可梦冠军｜单双打使用率 TOP 50',
      path: routes.rankings,
      imageUrl: '/assets/share.png'
    }
  }
})
