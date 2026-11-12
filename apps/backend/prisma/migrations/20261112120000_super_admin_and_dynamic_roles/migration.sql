-- Migration : SUPER_ADMIN et Gestion Dynamique des Rôles (RBAC)

-- 1. Ajout des colonnes is_system et pharmacy_id sur roles
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE CASCADE;

-- 2. Marquer les rôles existants du système comme immuables (is_system = TRUE)
UPDATE roles SET is_system = TRUE WHERE name IN ('ADMIN', 'PHARMACIEN', 'CAISSIER', 'STOCK', 'COMPTABLE');

-- 3. Insérer le rôle SUPER_ADMIN (accès racine absolu à toutes les officines et modules)
INSERT INTO roles (name, description, max_discount_percent, is_system)
VALUES (
  'SUPER_ADMIN',
  'Super-Administrateur système / Propriétaire de la plateforme (accès racine absolu)',
  100.00,
  TRUE
)
ON CONFLICT (name) DO UPDATE SET 
  is_system = TRUE,
  max_discount_percent = 100.00,
  description = EXCLUDED.description;

-- 4. Ajouter la permission fine admin.roles pour la gestion dynamique des rôles
INSERT INTO permissions (code, category, description)
VALUES 
  ('admin.roles', 'ADMIN', 'Créer, modifier et gérer les rôles personnalisés et leurs habilitations')
ON CONFLICT (code) DO NOTHING;

-- 5. Attribuer automatiquement toutes les permissions au SUPER_ADMIN et admin.roles à ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN' AND p.code = 'admin.roles'
ON CONFLICT DO NOTHING;

-- 6. Assouplir pharmacy_id sur users pour permettre aux Super-Admins globaux
ALTER TABLE users ALTER COLUMN pharmacy_id DROP NOT NULL;

