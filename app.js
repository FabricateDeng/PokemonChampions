const usageService = require('./utils/usage-service.js')

App({
  globalData: {
    statusBarHeight: 20,
    navBarHeight: 44,
    navTotalHeight: 64,
    windowWidth: 375
  },

  onLaunch() {
    let info = {}
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    } catch (e) {
      info = {}
    }

    let menu = null
    try {
      menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
    } catch (e) {
      menu = null
    }

    const statusBarHeight = info.statusBarHeight || 20
    let navBarHeight = 44
    if (menu && menu.top && menu.height) {
      const measured = (menu.top - statusBarHeight) * 2 + menu.height
      if (measured >= 36 && measured <= 88) navBarHeight = measured
    }

    this.globalData = {
      statusBarHeight,
      navBarHeight,
      navTotalHeight: statusBarHeight + navBarHeight,
      windowWidth: info.windowWidth || 375
    }

    // Hybrid data: show bundled/cached data immediately, then refresh silently.
    usageService.refresh()
  }
})
