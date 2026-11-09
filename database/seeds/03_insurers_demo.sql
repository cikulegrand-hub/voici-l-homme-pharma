-- Organismes assureurs de démonstration (à exécuter après la création d'une officine).
INSERT INTO insurers (pharmacy_id, name, is_active)
SELECT p.id, v.name, TRUE
FROM pharmacies p
CROSS JOIN (VALUES ('SONAS'), ('CNSS'), ('M&C Santé')) AS v(name)
ON CONFLICT (pharmacy_id, name) DO NOTHING;
