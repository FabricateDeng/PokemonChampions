const system = require('../../utils/system.js')

Component({
  options: {
    // Let the component reuse global tokens/classes from app.wxss.
    styleIsolation: 'apply-shared'
  },

  properties: {
    title: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: false
    },
    subtitle: {
      type: String,
      value: ''
    }
  },

  data: {
    m: system.getMetrics()
  },

  lifetimes: {
    attached() {
      this.setData({ m: system.getMetrics() })
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
