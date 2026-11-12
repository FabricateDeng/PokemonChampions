const usageService = require('./utils/usage-service.js')
const system = require('./utils/system.js')

App({
  globalData: system.getMetrics(),

  onLaunch() {
    // Cache system metrics once so every page/component can read them synchronously.
    this.globalData = system.getMetrics()
    system.applyPageBackground()
    // Hybrid data: render bundled/cached usage data first, then refresh silently.
    usageService.refresh()
  },

  onShow() {
    system.applyPageBackground()
  }
})
