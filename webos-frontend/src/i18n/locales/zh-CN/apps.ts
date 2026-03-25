import about from './apps/about'
import aiChat from './apps/aiChat'
import appStore from './apps/appStore'
import diskManager from './apps/diskManager'
import docker from './apps/docker'
import editor from './apps/editor'
import fileManager from './apps/fileManager'
import image from './apps/image'
import markdown from './apps/markdown'
import musicPlayer from './apps/musicPlayer'
import settings from './apps/settings'
import taskManager from './apps/taskManager'
import terminal from './apps/terminal'
import video from './apps/video'
import webview from './apps/webview'

const apps = {
  about: about,
  aiChat: aiChat,
  appStore: appStore,
  diskManager: diskManager,
  docker: docker,
  editor: editor,
  fileManager: fileManager,
  image: image,
  markdown: markdown,
  musicPlayer: musicPlayer,
  settings: settings,
  taskManager: taskManager,
  terminal: terminal,
  video: video,
  webview: webview,
} as const

export default apps
