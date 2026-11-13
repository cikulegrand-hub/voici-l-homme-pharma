-- Migration : Initialisation exhaustive des permissions du rôle ADMIN
-- Permet au Super-Administrateur de moduler et restreindre granularité par granularité
-- les accès de l'administrateur principal.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

