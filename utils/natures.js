const NATURES = [
  { key: 'hardy', name: '勤奋', up: '', down: '' },
  { key: 'lonely', name: '孤僻', up: 'attack', down: 'defense' },
  { key: 'brave', name: '勇敢', up: 'attack', down: 'speed' },
  { key: 'adamant', name: '固执', up: 'attack', down: 'spAttack' },
  { key: 'naughty', name: '顽皮', up: 'attack', down: 'spDefense' },
  { key: 'bold', name: '大胆', up: 'defense', down: 'attack' },
  { key: 'docile', name: '坦率', up: '', down: '' },
  { key: 'relaxed', name: '悠闲', up: 'defense', down: 'speed' },
  { key: 'impish', name: '淘气', up: 'defense', down: 'spAttack' },
  { key: 'lax', name: '乐天', up: 'defense', down: 'spDefense' },
  { key: 'timid', name: '胆小', up: 'speed', down: 'attack' },
  { key: 'hasty', name: '急躁', up: 'speed', down: 'defense' },
  { key: 'serious', name: '认真', up: '', down: '' },
  { key: 'jolly', name: '爽朗', up: 'speed', down: 'spAttack' },
  { key: 'naive', name: '天真', up: 'speed', down: 'spDefense' },
  { key: 'modest', name: '内敛', up: 'spAttack', down: 'attack' },
  { key: 'mild', name: '温和', up: 'spAttack', down: 'defense' },
  { key: 'quiet', name: '冷静', up: 'spAttack', down: 'speed' },
  { key: 'bashful', name: '害羞', up: '', down: '' },
  { key: 'rash', name: '马虎', up: 'spAttack', down: 'spDefense' },
  { key: 'calm', name: '沉着', up: 'spDefense', down: 'attack' },
  { key: 'gentle', name: '温顺', up: 'spDefense', down: 'defense' },
  { key: 'sassy', name: '自大', up: 'spDefense', down: 'speed' },
  { key: 'careful', name: '慎重', up: 'spDefense', down: 'spAttack' },
  { key: 'quirky', name: '浮躁', up: '', down: '' }
]

const NATURE_MAP = {}
NATURES.forEach((n) => {
  NATURE_MAP[n.key] = n
})

const STAT_LABELS = {
  attack: '攻击',
  defense: '防御',
  spAttack: '特攻',
  spDefense: '特防',
  speed: '速度'
}

function getNature(key) {
  return NATURE_MAP[key] || NATURE_MAP.hardy
}

function natureEffect(key) {
  const n = getNature(key)
  if (!n.up || !n.down) return '无能力修正'
  return `+${STAT_LABELS[n.up]} / -${STAT_LABELS[n.down]}`
}

module.exports = {
  NATURES,
  NATURE_MAP,
  STAT_LABELS,
  getNature,
  natureEffect
}
