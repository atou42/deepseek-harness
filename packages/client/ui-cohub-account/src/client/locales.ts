/** Locale namespace owned by the Cohub account UI. */
export const NS = 'cohubAccount' as const

/** Chinese Cohub account UI dictionary. */
export const zh = {
  trigger: 'Cohub 账号', title: 'Cohub 账号', close: '关闭', loading: '正在读取账号…',
  anonymousTitle: '登录 Cohub', anonymousBody: '登录后，其他 Cohub 插件才能访问你的 Space、模型、生成能力和 Board。',
  signIn: '登录 Cohub', authenticatingTitle: '完成网页登录', authenticatingBody: '在 Cohub 登录页确认后，这里会自动继续。',
  userCode: '验证码', openLogin: '打开 Cohub 登录页', invalidLoginUrl: '登录地址不可用', cancel: '取消登录',
  signedIn: '已登录', accountFallback: 'Cohub 用户', signOut: '退出登录', expires: '验证码有效至 {time}',
  refreshFailed: '账号续期失败。退出后重新登录即可恢复。', denied: '登录已被拒绝。', expired: '验证码已过期。',
  retry: '重试', error: '账号操作失败：{message}', revocationWarning: '本地账号已退出，但远端退出未能确认：{message}',
} as const

/** English Cohub account UI dictionary. */
export const en: Record<keyof typeof zh, string> = {
  trigger: 'Cohub account', title: 'Cohub account', close: 'Close', loading: 'Loading account…',
  anonymousTitle: 'Sign in to Cohub', anonymousBody: 'Sign in before other Cohub plugins can use your Spaces, models, generation capabilities, or Boards.',
  signIn: 'Sign in to Cohub', authenticatingTitle: 'Finish sign-in on the web', authenticatingBody: 'After confirming on Cohub, this window continues automatically.',
  userCode: 'Verification code', openLogin: 'Open Cohub sign-in', invalidLoginUrl: 'The sign-in URL is unavailable', cancel: 'Cancel sign-in',
  signedIn: 'Signed in', accountFallback: 'Cohub user', signOut: 'Sign out', expires: 'Code expires at {time}',
  refreshFailed: 'Account refresh failed. Sign out and sign in again to recover.', denied: 'Sign-in was denied.', expired: 'The verification code expired.',
  retry: 'Retry', error: 'Account operation failed: {message}', revocationWarning: 'Signed out locally, but remote revocation could not be confirmed: {message}',
}

/** Valid Cohub account UI dictionary key. */
export type CohubAccountKey = keyof typeof zh
