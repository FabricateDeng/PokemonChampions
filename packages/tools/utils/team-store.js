const { POKEMON, MOVES } = require('../../../data/pokedex.js')

const STORAGE_KEY = 'champion_teams_v1'
const TEAM_SIZE = 6

const MON_BY_KEY = {}
POKEMON.forEach((p) => {
  MON_BY_KEY[p.key] = p
})

function safeRead() {
  try {
    const data = wx.getStorageSync(STORAGE_KEY)
    return Array.isArray(data) ? data : []
  } catch (e) {
    return []
  }
}

function safeWrite(teams) {
  try {
    wx.setStorageSync(STORAGE_KEY, teams)
    return true
  } catch (e) {
    return false
  }
}

function newId() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function defaultMember(mon) {
  if (!mon) return null
  const damaging = []
  const status = []
  mon.moves.forEach((key) => {
    const move = MOVES[key]
    if (!move) return
    if (move.cat === 'status') status.push(key)
    else damaging.push(key)
  })
  const moves = damaging.concat(status).slice(0, 4)
  while (moves.length < 4) moves.push('')
  return {
    key: mon.key,
    ability: mon.abilities[0] || '',
    item: '',
    nature: 'hardy',
    sp: [0, 0, 0, 0, 0, 0],
    moves
  }
}

function normalizeMember(member) {
  if (!member || !member.key || !MON_BY_KEY[member.key]) return null
  const mon = MON_BY_KEY[member.key]
  const out = defaultMember(mon)
  out.ability = mon.abilities.indexOf(member.ability) >= 0 ? member.ability : out.ability
  out.item = typeof member.item === 'string' ? member.item : ''
  out.nature = typeof member.nature === 'string' ? member.nature : 'hardy'
  const sp = Array.isArray(member.sp) ? member.sp.slice(0, 6) : []
  out.sp = [0, 0, 0, 0, 0, 0].map((v, i) => Math.max(0, Math.min(32, Number(sp[i]) || 0)))
  const moves = Array.isArray(member.moves) ? member.moves.slice(0, 4) : []
  out.moves = [0, 1, 2, 3].map((i) => {
    const key = moves[i]
    return mon.moves.indexOf(key) >= 0 ? key : ''
  })
  return out
}

function normalizeTeam(team) {
  if (!team || !team.id) return null
  const members = Array.isArray(team.members) ? team.members.slice(0, TEAM_SIZE) : []
  while (members.length < TEAM_SIZE) members.push(null)
  return {
    id: team.id,
    name: team.name || '未命名队伍',
    createdAt: team.createdAt || new Date().toISOString(),
    updatedAt: team.updatedAt || new Date().toISOString(),
    members: members.map(normalizeMember)
  }
}

function listTeams() {
  return safeRead().map(normalizeTeam).filter(Boolean)
}

function getTeam(id) {
  const team = listTeams().find((t) => t.id === id)
  return team || null
}

function createTeam(name) {
  const teams = listTeams()
  const team = {
    id: newId(),
    name: name || '新队伍 ' + (teams.length + 1),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    members: [null, null, null, null, null, null]
  }
  teams.unshift(team)
  safeWrite(teams)
  return team
}

function saveTeam(team) {
  const teams = listTeams()
  const normalized = normalizeTeam(team)
  if (!normalized) return false
  normalized.updatedAt = new Date().toISOString()
  const idx = teams.findIndex((t) => t.id === normalized.id)
  if (idx < 0) teams.unshift(normalized)
  else teams[idx] = normalized
  return safeWrite(teams)
}

function deleteTeam(id) {
  const teams = listTeams().filter((t) => t.id !== id)
  return safeWrite(teams)
}

function setMember(teamId, slot, member) {
  const team = getTeam(teamId)
  if (!team || slot < 0 || slot >= TEAM_SIZE) return false
  team.members[slot] = normalizeMember(member)
  return saveTeam(team)
}

function removeMember(teamId, slot) {
  const team = getTeam(teamId)
  if (!team || slot < 0 || slot >= TEAM_SIZE) return false
  team.members[slot] = null
  return saveTeam(team)
}

function updateMember(teamId, slot, patch) {
  const team = getTeam(teamId)
  if (!team || slot < 0 || slot >= TEAM_SIZE) return null
  const current = team.members[slot]
  if (!current) return null
  team.members[slot] = normalizeMember({ ...current, ...(patch || {}) })
  saveTeam(team)
  return team.members[slot]
}

function getMember(teamId, slot) {
  const team = getTeam(teamId)
  if (!team || slot < 0 || slot >= TEAM_SIZE) return null
  return team.members[slot]
}

module.exports = {
  STORAGE_KEY,
  TEAM_SIZE,
  MON_BY_KEY,
  defaultMember,
  normalizeMember,
  listTeams,
  getTeam,
  createTeam,
  saveTeam,
  deleteTeam,
  setMember,
  removeMember,
  updateMember,
  getMember
}

