const monUtil = require('../../utils/mon.js')
const fmt = require('../../utils/format.js')
const routes = require('../../utils/routes.js')
const usageService = require('../../utils/usage-service.js')
const system = require('../../utils/system.js')

const FORMATS = [
  { key: 'singles', label: '单打' },
  { key: 'doubles', label: '双打' }
]

const SCOPES = [
  { key: 'top', label: 'TOP 50' },
  { key: 'all', label: '全部精灵' }
]

const PAGE = 50

Page({
  data: {
    formats: FORMATS,
    scopes: SCOPES,
    format: 'singles',
    formatLabel: '单打',
    scope: 'top',
    sourceText: '',
    sampleText: '',
    note: '',
    cutoffText: '',
    top: [],
    rows: [],
    hasMore: false,
    count: 0,
    totalCount: 0
  },

  onLoad() {
    this.apply(usageService.getUsage(), 'singles', 'top')
    this.unsubscribe = usageService.subscribe((data) => this.apply(data, this.data.format, this.data.scope))
    usageService.refresh()
  },

  onShow() {
    system.applyPageBackground()
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe()
  },

  onReachBottom() {
    if (!this.data.hasMore) return
    this.limit += PAGE
    this.render(false)
  },

  /* ------------------------------------------------------------ 数据装配 */

  // 榜单 + 51 名之后 + 完全无样本：让 348 只宝可梦都有使用率信息
  buildPool(data) {
    const meta = data.META || {}
    const singles = meta.singles || {}
    const doubles = meta.doubles || {}
    const usage = data.USAGE || {}
    const pool = {}

    FORMATS.forEach((f) => {
      const format = f.key
      const isSingles = format === 'singles'
      const extraText = (row) => (isSingles
        ? '样本 ' + fmt.numberText(row.raw)
        : row.winRate !== undefined
          ? '胜率 ' + (row.winRate || 0).toFixed(1) + '%'
          : '样本 ' + fmt.numberText(row.raw))

      const rows = []
      const seen = new Set()

      // 1) TOP50 榜单
      ;((data.RANKINGS && data.RANKINGS[format]) || []).forEach((row) => {
        const m = monUtil.byKey()[row.key]
        if (!m || seen.has(row.key)) return
        seen.add(row.key)
        rows.push({
          key: row.key,
          rank: row.rank,
          usage: row.usage,
          unranked: false,
          name: m.name,
          sprite: m.sprite,
          typesInfo: m.typesInfo,
          usageText: fmt.pctText(row.usage),
          extra: extraText(row)
        })
      })

      // 2) 有配置样本但排在 TOP50 之外的宝可梦（数据里有真实名次与使用率）
      Object.keys(usage).forEach((key) => {
        if (seen.has(key)) return
        const block = usage[key] && usage[key][format === 'singles' ? 's' : 'd']
        if (!block || !block.rank || block.usage === undefined) return
        const m = monUtil.byKey()[key]
        if (!m) return
        seen.add(key)
        rows.push({
          key,
          rank: block.rank,
          usage: block.usage,
          unranked: false,
          name: m.name,
          sprite: m.sprite,
          typesInfo: m.typesInfo,
          usageText: fmt.pctText(block.usage),
          extra: isSingles
            ? '样本 ' + fmt.numberText(block.raw)
            : '胜率 ' + (block.winRate || 0).toFixed(1) + '%'
        })
      })

      rows.sort((a, b) => a.rank - b.rank)

      const max = rows.length ? rows[0].usage : 1
      const cutoff = (data.RANKINGS && data.RANKINGS[format] || []).slice(-1)[0]
      const cutoffUsage = cutoff ? cutoff.usage : 0
      rows.forEach((row) => {
        row.width = Math.max(4, Math.min(100, (row.usage / max) * 100)).toFixed(1) + '%'
      })

      // 3) 完全没有样本：只给使用率上界
      const unranked = monUtil
        .all()
        .filter((m) => !seen.has(m.key))
        .sort((a, b) => a.dex - b.dex || a.order - b.order)
        .map((m) => ({
          key: m.key,
          rank: 0,
          usage: 0,
          unranked: true,
          name: m.name,
          sprite: m.sprite,
          typesInfo: m.typesInfo,
          usageText: cutoffUsage ? '< ' + fmt.pctText(cutoffUsage) : '—',
          extra: '无样本',
          width: Math.max(4, Math.min(100, (cutoffUsage / max) * 100)).toFixed(1) + '%'
        }))

      pool[format] = {
        ranked: rows,
        unranked,
        total: rows.length + unranked.length,
        sourceText: isSingles
          ? `${singles.source || 'Smogon'} · ${singles.month || '—'} · ${singles.cutoff || '—'} 分位`
          : `${doubles.source || 'Limitless'} · 规则 ${doubles.regulation || '—'} · 近 30 天`,
        sampleText: isSingles
          ? `${fmt.comma(singles.battles)} 场对战`
          : `${doubles.tournaments || 0} 项赛事`,
        note: isSingles ? singles.note || '' : doubles.note || '',
        cutoffText: cutoffUsage ? fmt.pctText(cutoffUsage) : '—'
      }
    })

    return pool
  },

  apply(data, format, scope) {
    if (!data) return
    this.usageData = data
    this.pool = this.buildPool(data)

    const block = this.pool[format]
    if (!block) return
    // TOP50 视图只取榜单前 50；全部视图 = 有样本的全部名次 + 无样本的
    this.list = scope === 'all'
      ? block.ranked.concat(block.unranked)
      : block.ranked.slice(0, 50)

    this.setData({
      format,
      scope,
      formatLabel: format === 'singles' ? '单打' : '双打',
      sourceText: block.sourceText,
      sampleText: block.sampleText,
      note: block.note,
      cutoffText: block.cutoffText,
      totalCount: block.total,
      count: this.list.length,
      top: scope === 'top' ? this.list.slice(0, 3) : []
    })
    this.render(true)
  },

  render(reset) {
    if (reset) this.limit = PAGE
    const offset = this.data.scope === 'top' ? 3 : 0
    const end = offset + this.limit
    this.setData({
      rows: this.list.slice(offset, end),
      hasMore: this.list.length > end
    })
  },

  /* ------------------------------------------------------------ 交互 */

  onFormat(e) {
    const format = e.detail.key
    if (!format || format === this.data.format) return
    this.apply(this.usageData, format, this.data.scope)
  },

  onScope(e) {
    const scope = e.currentTarget.dataset.key
    if (!scope || scope === this.data.scope) return
    this.apply(this.usageData, this.data.format, scope)
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
      title: '宝可梦冠军｜单双打使用率榜单',
      path: routes.rankings,
      imageUrl: '/assets/share.png'
    }
  }
})
