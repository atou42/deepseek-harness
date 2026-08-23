/** Locale namespace owned by the Cohub Board UI. */
export const NS = 'cohubBoard' as const

/** Chinese Cohub Board UI dictionary. */
export const zh = {
  trigger: 'Cohub Board', title: 'Cohub Board', close: '关闭', spaces: 'Space', chooseSpace: '选择 Space',
  loading: '正在读取…', empty: '这个目录没有 Board', retry: '重试', back: '上一级', root: '根目录',
  boards: 'Board 文件', openBoard: '打开 {name}', nodes: '{count} 个节点', connections: '{count} 条连接',
  unknownNode: '未识别节点', error: '读取失败：{message}', refresh: '刷新', noSpaces: '当前账号没有可访问的 Space',
} as const

/** English Cohub Board UI dictionary. */
export const en: Record<keyof typeof zh, string> = {
  trigger: 'Cohub Board', title: 'Cohub Board', close: 'Close', spaces: 'Space', chooseSpace: 'Choose a Space',
  loading: 'Loading…', empty: 'No Board in this folder', retry: 'Retry', back: 'Up', root: 'Root',
  boards: 'Board files', openBoard: 'Open {name}', nodes: '{count} nodes', connections: '{count} connections',
  unknownNode: 'Unknown node', error: 'Could not load: {message}', refresh: 'Refresh', noSpaces: 'This account has no accessible Spaces',
}

/** Valid Cohub Board UI dictionary key. */
export type CohubBoardKey = keyof typeof zh
