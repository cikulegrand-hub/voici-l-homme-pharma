# Guide de Déploiement en Production (Render & Vercel)
## Projet : Voici l'Homme Pharma (VHP-CDC-001)

Ce guide détaille la mise en ligne du backend (NestJS/Prisma) sur **Render**, du frontend (Angular 19) sur **Vercel**, et la base de données relationnelle sur **Supabase** (PostgreSQL).

---

## 1. Déploiement de la Base de Données (Supabase PostgreSQL)

1. Créez un projet sur [Supabase](https://supabase.com).
2. Dans **Project Settings > Database** :
   - Récupérez la chaîne de connexion **Session Pooler** (port 5432 ou 6543, IPv4 compatible).
   - Récupérez la chaîne de connexion directe **Direct Connection** pour Prisma CLI.
3. Exécutez les migrations :
   ```bash
   npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma
   ```

---

## 2. Déploiement du Backend sur Render (Node.js)

Le dépôt contient déjà un fichier de configuration automatique [`render.yaml`](file:///e:/voici%20l'homme%20pharma/render.yaml).

### Option A : Déploiement Automatique via Blueprint Render
1. Rendez-vous sur votre tableau de bord [Render](https://dashboard.render.com).
2. Cliquez sur **New > Blueprint** et liez votre dépôt GitHub `voici-l-homme-pharma`.
3. Render détecte automatiquement `render.yaml` et pré-remplit les variables de sécurité.

### Option B : Création Manuelle d'un Web Service
- **Name :** `voici-l-homme-pharma-backend`
- **Region :** Frankfurt (ou la plus proche)
- **Branch :** `main`
- **Root Directory :** Laisser vide (racine du monorepo)
- **Runtime :** `Node`
- **Build Command :**
  ```bash
  npm install && npm run prisma:generate && npm run build --workspace=@vhp/backend
  ```
- **Start Command :**
  ```bash
  npm run start:prod --workspace=@vhp/backend
  ```
- **Health Check Path :**
  ```
  /api/v1/health
  ```

### Variables d'Environnement sur Render
| Variable | Description / Valeur |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `3000` (défini par Render automatiquement) |
| `DATABASE_URL` | Chaîne PostgreSQL Supabase avec `?sslmode=require` |
| `DIRECT_URL` | Chaîne directe PostgreSQL Supabase |
| `JWT_SECRET` | Chaîne secrète aléatoire >= 64 caractères (générée par Render) |
| `JWT_REFRESH_SECRET` | Chaîne secrète aléatoire >= 64 caractères |
| `CORS_ORIGIN` | URL publique de votre frontend Vercel (ex: `https://voici-l-homme-pharma.vercel.app`) |
| `KEEP_ALIVE_URL` | URL de santé publique (ex: `https://voici-l-homme-pharma-backend.onrender.com/api/v1/health`) |

---

## 3. Empêcher la Mise en Veille du Serveur Render (Anti-Sleep 24h/24)

Sur le forfait gratuit (Free Tier), Render met le serveur en veille après **15 minutes d'inactivité**.

### Solution 1 (Intégrée au Backend) : `KEEP_ALIVE_URL`
Le backend intègre un worker automatique (`HealthKeepAliveService`) programmé avec `@Cron('*/10 * * * *')`.  
Il suffit d'ajouter la variable d'environnement sur Render :
```env
KEEP_ALIVE_URL=https://<votre-service-render>.onrender.com/api/v1/health
```
Le backend s'envoie un ping HTTP à lui-même toutes les 10 minutes via l'URL publique de Render, réinitialisant le décompte d'inactivité de Render.

### Solution 2 (Recommandée & Gratuite) : UptimeRobot / cron-job.org
Pour une garantie totale même après un redémarrage :
1. Créez un compte gratuit sur [UptimeRobot](https://uptimerobot.com) ou [cron-job.org](https://cron-job.org).
2. Ajoutez un moniteur **HTTP(s)** :
   - **URL :** `https://<votre-service-render>.onrender.com/api/v1/health`
   - **Intervalle :** Toutes les 5 ou 10 minutes.
3. Le serveur restera éveillé en permanence (0 cold start) et vous serez notifié par email en cas d'incident réseau.

---

## 4. Déploiement du Frontend sur Vercel (Angular 19)

1. Rendez-vous sur [Vercel](https://vercel.com) et cliquez sur **Add New > Project**.
2. Importez le dépôt GitHub `voici-l-homme-pharma`.
3. Configurez les paramètres du projet :
   - **Root Directory :** Cliquez sur Edit et sélectionnez `apps/frontend`.
   - **Framework Preset :** `Angular` (ou `Other`).
   - **Build Command :** `npm run build`
   - **Output Directory :** `dist/frontend/browser`
4. Cliquez sur **Deploy**.

Le fichier [`apps/frontend/vercel.json`](file:///e:/voici%20l'homme%20pharma/apps/frontend/vercel.json) gère automatiquement la redirection de toutes les routes vers `index.html` (SPA) et applique les en-têtes de sécurité OWASP.

---

## 5. Premier Démarrage & Initialisation du Compte Administrateur

Une fois la base de données migrée et l'API déployée, connectez-vous en SSH ou exécutez le script d'initialisation sécurisé :
```bash
node apps/backend/scripts/create-initial-admin.js
```
Saisissez votre mot de passe administrateur fort et votre code PIN. Vous pouvez maintenant vous connecter sur le frontend !

