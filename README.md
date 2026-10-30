# MySite – Jenkins + Ansible + Docker + Postgres (dev / staging / prod)

Node.js website backed by its own PostgreSQL database in every environment.
Jenkins builds **one** Docker image per commit; Ansible deploys that same image to each VM.

```
git push ──> Jenkins ──> test ──> build image ──> push to registry
                                                      │
  develop ──────────────────────────────────────────> Ansible ──> DEV VM
  main    ──> Ansible ──> STAGING VM ──> (manual approval) ──> Ansible ──> PROD VM
```

## What runs on each VM
`docker compose` project in `/opt/mysite` with two containers:
- `db`  – Postgres 16, data in a named volume (`pgdata`), **not published** to the network
- `app` – the website, published on port `app_port` (80)

Each environment has its own DB name, user and password (`ansible/inventories/<env>/group_vars/all/`).

## Deploy steps Ansible performs (every environment)
1. Install Docker if missing
2. Write `.env` (secrets, mode 0600) and `docker-compose.yml`
3. Start Postgres and wait until healthy
4. **Prod only:** `pg_dump` backup to `/opt/mysite/backups` (last 10 kept)
5. Pull new image → run migrations → start new app container
6. Health check `GET /health` (also checks the DB)
7. If anything fails → roll back to the previous image and fail the Jenkins job

## One-time setup

**1. Edit these placeholders**
- `ansible/inventories/*/hosts.yml` → real IP of each VM, and the SSH user
- `image_repo` in `ansible/inventories/*/group_vars/all/vars.yml` and `IMAGE_REPO` in `Jenkinsfile`
- `registry_host` in `ansible/roles/app/defaults/main.yml` if you do not use Docker Hub

**2. Target VMs** (dev, staging, prod): a user (e.g. `deploy`) with your Ansible VM's SSH public key and passwordless sudo.

**3. Create the encrypted DB passwords** (on the Ansible VM, in the repo):
```bash
./scripts/init-secrets.sh
git add ansible/inventories/*/group_vars/all/vault.yml   # encrypted, safe to commit
```
It also creates `~/.vault-pass-dev`, `-staging`, `-prod`.

**4. Jenkins**
- Make the Ansible VM a Jenkins agent with label `ansible` (it needs `docker` and `ansible` installed and the Jenkins user in the `docker` group). Or install both on the Jenkins VM and change `agent { label 'ansible' }` to `agent any`.
- Add credentials:
  | ID | Type | Content |
  |---|---|---|
  | `registry-creds` | Username/password | registry login (Docker Hub token) |
  | `ansible-vault-dev` | Secret file | `~/.vault-pass-dev` |
  | `ansible-vault-staging` | Secret file | `~/.vault-pass-staging` |
  | `ansible-vault-prod` | Secret file | `~/.vault-pass-prod` |
- Create a **Multibranch Pipeline** job pointing at this repo.

**5. Branches:** `develop` → dev, `main` → staging, then approve in Jenkins → prod.

## Manual deploy / rollback
```bash
cd ansible
ansible-galaxy collection install -r requirements.yml
ansible-playbook -i inventories/prod/hosts.yml playbooks/deploy.yml \
  --vault-password-file ~/.vault-pass-prod -e image_tag=<older-tag>
```
Re-deploying an older tag is the manual rollback. Restore a DB backup with
`docker compose exec -T db pg_restore -U <user> -d <db> --clean < backups/<file>.dump`.

## Things to know
- **Migrations are not rolled back** when the app rolls back, so write them backward compatible (add columns/tables first, remove old ones in a later release). Add new files as `app/migrations/002_*.sql`.
- Prod DB is on the prod VM. For stronger isolation later, point `DATABASE_URL` at a separate DB server or managed Postgres.
- HTTPS: put Nginx/Caddy/Traefik in front (or add Let's Encrypt) and set `app_port` to something like 3000.
- Local test: `cd app && npm ci && npm test`.
