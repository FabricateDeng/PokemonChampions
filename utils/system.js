// Layout metrics for the custom navigation bar and safe areas.
// Read once, share everywhere (pages + components) so heights never disagree.

let cached = null

function readWindow() {
  try {
    if (wx.getWindowInfo) return wx.getWindowInfo() || {}
  } catch (e) {
    // fall through to the legacy API
  }
  try {
    return wx.getSystemInfoSync() || {}
  } catch (e) {
    return {}
  }
}

function readMenuButton() {
  try {
    if (wx.getMenuButtonBoundingClientRect) return wx.getMenuButtonBoundingClientRect()
  } catch (e) {
    // ignore: fall back to defaults
  }
  return null
}

function getMetrics() {
  if (cached) return cached

  const info = readWindow()
  const menu = readMenuButton()
  const statusBarHeight = info.statusBarHeight || 20

  // Derive the nav bar height from the capsule button so the title stays
  // optically centred on every device (R10.5).
  let navBarHeight = 44
  if (menu && menu.top && menu.height) {
    const measured = (menu.top - statusBarHeight) * 2 + menu.height
    if (measured >= 36 && measured <= 88) navBarHeight = measured
  }

  cached = {
    statusBarHeight,
    navBarHeight,
    navTotalHeight: statusBarHeight + navBarHeight,
    windowWidth: info.windowWidth || 375,
    windowHeight: info.windowHeight || 667,
    safeAreaBottom: info.screenHeight && info.safeArea
      ? Math.max(0, info.screenHeight - info.safeArea.bottom)
      : 0
  }
  return cached
}

const PAGE_BG = '#0a0e14'

/**
 * Paint the native window behind the page. Without this, tab switches can
 * briefly reveal the WebView's default white surface before page WXSS paints.
 */
function applyPageBackground() {
  try {
    if (typeof wx !== 'undefined' && wx.setBackgroundColor) {
      wx.setBackgroundColor({
        backgroundColor: PAGE_BG,
        backgroundColorTop: PAGE_BG,
        backgroundColorBottom: PAGE_BG
      })
    }
  } catch (e) {
    // Non-fatal: the page CSS still paints the same dark color.
  }
}

module.exports = { getMetrics, applyPageBackground, PAGE_BG }
