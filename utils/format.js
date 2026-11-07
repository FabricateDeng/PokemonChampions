// Number / text formatting shared by every page (R9.3).

function pad3(n) {
  return String(n).padStart(3, '0')
}

function dexLabel(n) {
  return '#' + pad3(n)
}

// Percent: one decimal, two decimals below 10%.
function pctText(value) {
  const n = Number(value) || 0
  return (n >= 10 ? n.toFixed(1) : n.toFixed(2)) + '%'
}

// Percent without trailing ".0" noise, for compact labels.
function pctShort(value) {
  const n = Number(value) || 0
  return (Math.round(n * 10) / 10).toFixed(1) + '%'
}

function numberText(n) {
  const v = Number(n) || 0
  if (v >= 10000) return (v / 10000).toFixed(1) + '万'
  return String(v)
}

function comma(n) {
  return String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function signed(n) {
  const v = Number(n) || 0
  return v > 0 ? '+' + v : String(v)
}

module.exports = { pad3, dexLabel, pctText, pctShort, numberText, comma, signed }
