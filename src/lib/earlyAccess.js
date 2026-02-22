const LAUNCH_DATE = new Date('2026-03-01T00:00:00+01:00') // Heure Paris
const DEV_EMAIL = 'gnoakim05@gmail.com'
const ADMIN_EMAIL = 'neoflowagency05@gmail.com'

export const isBeforeLaunch = () => new Date() < LAUNCH_DATE
export const isDevUser = (email) => email === DEV_EMAIL
export const isAdminUser = (email) => email === ADMIN_EMAIL
export const getLaunchDate = () => LAUNCH_DATE

export function shouldShowWaitingPage(workspace, userEmail) {
  if (!workspace) return false
  if (isDevUser(userEmail)) return false
  if (isAdminUser(userEmail)) return false
  return isBeforeLaunch()
}
