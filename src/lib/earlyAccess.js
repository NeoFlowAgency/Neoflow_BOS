export const isAdminUser = (userOrEmail) => {
  if (!userOrEmail) return false
  // Support User object (preferred) or email string (legacy)
  if (typeof userOrEmail === 'object') {
    return userOrEmail?.app_metadata?.is_internal_admin === true
  }
  return false
}
