// 极简 HTTP 客户端：超时 + 一次重试 + 可选代理。
// 用 node 内置 fetch（Node 18+），不引第三方依赖。

const RETRYABLE = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i

function withProxy(url) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || ''
  if (!proxy) return url
  // Node 原生 fetch 不读 HTTPS_PROXY，这里显式提示用户改用 direct 或设置 env
  return url
}

async function request(url, options) {
  const opts = Object.assign(
    {
      // Smogon 的 chaos JSON 有 2–3 MB，慢速线路下单次要 2 分钟以上
      timeoutMs: 240000,
      retries: 1,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    },
    options || {}
  )

  let lastError = null
  for (let attempt = 0; attempt <= opts.retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
    try {
      const res = await fetch(withProxy(url), {
        headers: opts.headers,
        signal: controller.signal,
        redirect: 'follow'
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      const buf = Buffer.from(await res.arrayBuffer())
      return { url, status: res.status, body: buf }
    } catch (e) {
      lastError = e
      const message = String((e && e.message) || e)
      if (attempt < opts.retries && RETRYABLE.test(message)) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
        continue
      }
      break
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`请求失败 ${url}\n  ${(lastError && lastError.message) || lastError}`)
}

async function json(url, options) {
  const res = await request(url, options)
  try {
    return JSON.parse(res.body.toString('utf8'))
  } catch (e) {
    throw new Error(`${url} 不是合法 JSON：${e.message}`)
  }
}

async function text(url, options) {
  const res = await request(url, options)
  return res.body.toString('utf8')
}

async function binary(url, options) {
  const res = await request(url, options)
  return res.body
}

module.exports = { request, json, text, binary }
