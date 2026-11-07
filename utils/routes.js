// Single source for navigation paths so a page rename can never leave a dead link.

function detail(key) {
  return `/pages/detail/detail?key=${encodeURIComponent(key)}`
}

function team(id) {
  return `/pages/team/team?id=${encodeURIComponent(id)}`
}

function picker(teamId, slot) {
  return `/pages/picker/picker?teamId=${encodeURIComponent(teamId)}&slot=${slot}`
}

function member(teamId, slot) {
  return `/pages/member/member?teamId=${encodeURIComponent(teamId)}&slot=${slot}`
}

function calc(teamId) {
  return `/pages/calc/calc${teamId ? '?teamId=' + encodeURIComponent(teamId) : ''}`
}

const ROUTES = {
  index: '/pages/index/index',
  rankings: '/pages/rankings/rankings',
  teams: '/pages/teams/teams',
  profile: '/pages/profile/profile',
  detail,
  team,
  picker,
  member,
  calc
}

module.exports = ROUTES
