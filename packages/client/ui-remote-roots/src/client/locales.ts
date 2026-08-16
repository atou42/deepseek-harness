/** Locale namespace for remote-root UI strings. */
export const NS = 'remoteRoots'

/** Simplified Chinese remote-root strings. */
export const zh = {
  'section': '远程',
  'tree.aria': '远程文件夹',
  'source.loading': '正在连接远程来源',
  'source.authenticationRequired': '登录 {provider} 后查看云端文件夹',
  'source.error': '远程来源不可用：{message}',
  'folder.loading': '正在读取',
  'folder.empty': '空文件夹',
  'folder.error': '无法读取：{message}',
  'retry': '重试',
  'expand': '展开 {name}',
  'collapse': '收起 {name}',
  'file': '文件 {name}',
  'link': '链接 {name}',
  'session': '会话 {name}',
  'conversation.title': 'Cohub 会话',
  'conversation.close': '关闭 Cohub 会话',
  'conversation.loading': '正在读取会话',
  'conversation.empty': '这个 Cohub 会话还没有 Turn。',
  'conversation.running': 'Agent 正在处理…',
  'conversation.error': '会话出错：{message}',
} as const

/** Supported remote-root locale key. */
export type RemoteRootsKey = keyof typeof zh

/** English remote-root strings. */
export const en: Record<RemoteRootsKey, string> = {
  'section': 'Remote',
  'tree.aria': 'Remote folders',
  'source.loading': 'Connecting to remote source',
  'source.authenticationRequired': 'Sign in to {provider} to view cloud folders',
  'source.error': 'Remote source unavailable: {message}',
  'folder.loading': 'Loading',
  'folder.empty': 'Empty folder',
  'folder.error': 'Could not load: {message}',
  'retry': 'Retry',
  'expand': 'Expand {name}',
  'collapse': 'Collapse {name}',
  'file': 'File {name}',
  'link': 'Link {name}',
  'session': 'Session {name}',
  'conversation.title': 'Cohub conversation',
  'conversation.close': 'Close Cohub conversation',
  'conversation.loading': 'Loading conversation',
  'conversation.empty': 'This Cohub Session has no Turns yet.',
  'conversation.running': 'Agent is working…',
  'conversation.error': 'Conversation error: {message}',
}
