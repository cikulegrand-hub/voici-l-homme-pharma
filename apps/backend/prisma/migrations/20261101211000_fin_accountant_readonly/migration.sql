DELETE FROM role_permissions
WHERE role_id = '22222222-2222-2222-2222-222222222225'
  AND permission_id IN (
    SELECT id FROM permissions WHERE code IN ('depense.creer', 'caisse.cloturer', 'client.paiement')
  );
