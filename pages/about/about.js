const { META } = require('../../data/pokedex.js')
const usageService = require('../../utils/usage-service.js')

Page({
  data: {
    meta: META,
    usageMeta: {},
    features: [
      { no: '01', title: '完整图鉴', desc: '收录当前版本 348 只可用宝可梦，含地区形态、超级进化与特殊形态。' },
      { no: '02', title: '环境 TOP 50', desc: '单打与双打使用率前 50 排名，一眼看清当前环境的热门宝可梦。' },
      { no: '03', title: '配置使用率', desc: '特性、招式、性格、道具与努力值分配的实战使用率，道具和努力值取 Top5，招式取 Top10。' },
      { no: '04', title: '战力一页看清', desc: '六维种族值、属性相性、全部特性，以及每只宝可梦的完整可用招式。' },
      { no: '05', title: '快速筛选', desc: '按属性、世代、形态筛选，支持名称、特性、招式关键词搜索与收藏。' },
      { no: '06', title: '队伍编辑', desc: '最多 6 只宝可梦，配置特性、道具、性格、四招与 0–32 SP，能力值实时计算并保存在本机。' },
      { no: '07', title: '伤害计算', desc: '基于队伍配置与能力值，结合属性、特性、道具、天气、强化与暴击等修正估算伤害。' }
    ]
  },

  onLoad() {
    this.setData({ usageMeta: usageService.getUsage().META })
    this.usageUnsubscribe = usageService.subscribe((data) => {
      this.setData({ usageMeta: data.META })
    })
    usageService.refresh()
  },

  onUnload() {
    if (this.usageUnsubscribe) this.usageUnsubscribe()
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  goRankings() {
    wx.navigateTo({ url: '/pages/rankings/rankings' })
  },

  onShareAppMessage() {
    return {
      title: '宝可梦冠军图鉴｜TOP50 使用率与配置数据',
      path: '/pages/index/index',
      imageUrl: '/assets/share.png'
    }
  }
})
