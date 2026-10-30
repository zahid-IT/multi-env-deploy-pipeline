#!/usr/bin/env bash
# One-time setup: creates an encrypted vault.yml (random DB password) for each environment.
# Run this on the Ansible VM from the repo root:   ./scripts/init-secrets.sh
#
# For each env it also writes a vault password file  ~/.vault-pass-<env>  (chmod 600).
# Upload each of those files to Jenkins as a "Secret file" credential named  ansible-vault-<env>
# and then keep them out of Git (they are in .gitignore).
set -euo pipefail
cd "$(dirname "$0")/.."

for env in dev staging prod; do
  vault_file="ansible/inventories/${env}/group_vars/all/vault.yml"
  pass_file="${HOME}/.vault-pass-${env}"

  if [[ -f "$vault_file" ]]; then
    echo "[skip] $vault_file already exists"
    continue
  fi

  [[ -f "$pass_file" ]] || { umask 077; openssl rand -base64 32 > "$pass_file"; }
  chmod 600 "$pass_file"

  db_password="$(openssl rand -hex 24)"   # hex only: safe inside the postgres:// URL
  printf -- "---\nvault_db_password: %s\n" "$db_password" > "$vault_file"
  ansible-vault encrypt --vault-password-file "$pass_file" "$vault_file"
  echo "[ok]   $vault_file  (vault password in $pass_file)"
done
