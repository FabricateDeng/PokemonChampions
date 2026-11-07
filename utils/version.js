// 数据版本号：`YYYY-MM-DD.N`（N 从 1 开始递增）。
//
// 为什么不能直接比较字符串：'2026-11-07.10' 用 localeCompare 会小于 '2026-11-07.9'
// （逐字符比，'1' < '9'），到第 10 次热更新时新数据会被当成旧数据丢掉。
// 这里按「日期 + 序号（数字）」比较，日期用零填充的 ISO 串，字典序本身就正确。

const VERSION_RE = /^(\d{4})-(\d{2})-(\d{2})(?:\.(\d+))?$/

/** 解析版本号；格式不匹配返回 null。 */
function parseVersion(value) {
  const m = VERSION_RE.exec(String(value == null ? '' : value).trim())
  if (!m) return null
  return {
    date: m[1] + '-' + m[2] + '-' + m[3],
    seq: m[4] ? parseInt(m[4], 10) : 0
  }
}

/** 比较两个版本号：a > b 返回 1，a < b 返回 -1，相等返回 0。 */
function compareVersion(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  // 老格式（或非法值）退回字符串比较，保证不会因为解析失败而误判
  if (!pa || !pb) {
    const sa = String(a == null ? '' : a)
    const sb = String(b == null ? '' : b)
    return sa === sb ? 0 : sa.localeCompare(sb) < 0 ? -1 : 1
  }
  if (pa.date !== pb.date) return pa.date < pb.date ? -1 : 1
  if (pa.seq === pb.seq) return 0
  return pa.seq < pb.seq ? -1 : 1
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * 生成比 current 大的下一个版本号：
 *   同一天  2026-11-07.1 → 2026-11-07.2
 *   跨天    2026-09-05.3 → 2026-11-07.1
 */
function nextVersion(current, dateStr) {
  const date = dateStr || today()
  const p = parseVersion(current)
  if (p && p.date === date) return date + '.' + (p.seq + 1)
  return date + '.1'
}

module.exports = {
  parseVersion,
  compareVersion,
  nextVersion
}
