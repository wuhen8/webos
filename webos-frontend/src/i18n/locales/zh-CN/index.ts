import common from './common'
import apps from './apps'
import task from './task'
import login from './login'
import menu from './menu'
import spotlight from './spotlight'
import launchpad from './launchpad'
import dock from './dock'
import context from './context'
import actions from './actions'
import settings from './settings'
import widgets from './widgets'

const locale = {
  common: common,
  apps: apps,
  task: task,
  login: login,
  menu: menu,
  spotlight: spotlight,
  launchpad: launchpad,
  dock: dock,
  context: context,
  actions: actions,
  settings: settings,
  widgets: widgets,
} as const

export default locale
