// Remote usage data (hybrid mode).
// 1. Upload remote/usage.json to an HTTPS CDN / object storage.
// 2. Add the domain to 微信公众平台 → 开发设置 → 服务器域名 → request 合法域名.
// 3. Fill the URL below and rebuild/release.
// Leave empty to run fully offline with the bundled fallback data.
module.exports = {
  usageRemote: {
    enabled: true,
    url: '',
    timeout: 6000,
    maxAge: 6 * 60 * 60 * 1000
  }
}
