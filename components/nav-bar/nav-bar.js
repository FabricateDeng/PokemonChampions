Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: false
    },
    brand: {
      type: Boolean,
      value: false
    }
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    navTotalHeight: 64
  },

  lifetimes: {
    attached() {
      const app = getApp()
      const g = (app && app.globalData) || {}
      this.setData({
        statusBarHeight: g.statusBarHeight || 20,
        navBarHeight: g.navBarHeight || 44,
        navTotalHeight: g.navTotalHeight || 64
      })
    }
  },

  methods: {
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 })
      } else {
        wx.reLaunch({ url: '/pages/index/index' })
      }
    }
  }
})
