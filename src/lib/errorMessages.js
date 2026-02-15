const ERROR_MAP = {
  'Invalid login credentials': 'Email ou mot de passe incorrect',
  'Email not confirmed': 'Veuillez confirmer votre email avant de vous connecter',
  'User already registered': 'Un compte existe déjà avec cet email',
  'Signup requires a valid password': 'Le mot de passe est invalide',
  'Password should be at least': 'Le mot de passe doit contenir au moins 8 caractères',
  'rate limit': 'Trop de tentatives. Veuillez patienter quelques instants.',
  'only request this once': 'Veuillez patienter 60 secondes avant de refaire une demande.',
  'Failed to fetch': 'Impossible de contacter le serveur. Vérifiez votre connexion.',
  'NetworkError': 'Erreur réseau. Vérifiez votre connexion internet.',
  'JWT expired': 'Votre session a expiré. Veuillez vous reconnecter.',
  'refresh_token_not_found': 'Session expirée. Veuillez vous reconnecter.',
  'new row violates row-level security': 'Vous n\'avez pas les droits pour effectuer cette action.',
  'duplicate key': 'Cet élément existe déjà.',
  'unique_violation': 'Cet élément existe déjà.',
  'Unexpected end of JSON input': 'Erreur de communication avec le serveur. Veuillez réessayer.',
  'not found': 'Élément introuvable.',
  'Only workspace owner': 'Seul le propriétaire peut effectuer cette action.',
  'Seul le proprietaire': 'Seul le propriétaire peut effectuer cette action.',
  'Invitation invalide': 'Invitation invalide ou déjà utilisée.',
  'invitation a expire': 'Cette invitation a expiré.',
  'workspace est actuellement suspendu': 'Ce workspace est actuellement suspendu.',
  'deja membre': 'Vous êtes déjà membre de ce workspace.',
  'Stripe configuration': 'Configuration Stripe manquante. Contactez le support.',
  'Aucun compte de facturation': 'Aucun compte de facturation trouvé pour ce workspace.',
}

export function translateError(error) {
  const msg = typeof error === 'string' ? error : error?.message || ''
  for (const [key, value] of Object.entries(ERROR_MAP)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) return value
  }
  return 'Une erreur est survenue. Veuillez réessayer.'
}
