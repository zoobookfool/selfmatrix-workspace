# SelfMatrix Review

Target repository: https://github.com/zoobookfool/selfmatrix  
Reviewed branch: `main`  
Reviewed commit: `276bbbda79ffe299e84b9d9161fe6c868174f253`  
Review date: 2026-07-06 JST

## Summary

The latest `main` includes the starter fixes from `a5f2f52` and subsequent documentation updates. The previous Route A nginx-generation issues are mostly fixed: the generated edge config now uses `8028` / `8082`, blocks `/_synapse/admin`, and emits Matrix well-known JSON including `org.matrix.msc4143.rtc_foci` for `SERVER_NAME`.

The most important remaining issue is a new regression in the updated `.env` parsing helper: optional keys now abort scripts before their documented defaults can apply.

## Checks Run

```sh
git fetch --prune origin
git status --short --branch
bash -n scripts/*.sh rtc/*.sh
docker compose --env-file .env.example -f compose.yaml config -q
BACKEND_BIND_IP=100.64.0.1 docker compose --env-file .env.example -f compose.yaml -f docker-compose.route-a.example.yml config -q
docker compose --env-file rtc/.env.example -f rtc/compose.yaml config -q
docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:stable scripts/*.sh rtc/*.sh
bash scripts/provision-rtc-vps.sh --server-name example.com --matrix-host matrix.example.com --chat-host chat.example.com --rtc-host rtc.example.com --node-ip 203.0.113.10 --home-backend-ip 100.64.0.1 --with-edge --dry-run
```

The syntax, Compose, ShellCheck, and Route A dry-run checks passed. The targeted script-execution checks below intentionally failed and are listed under Finding 1.

## Findings

### [P1] Optional `.env` keys now abort scripts before defaults are applied

`scripts/generate-synapse-config.sh` and `scripts/backup.sh` both added a non-sourcing `env_get` helper. That direction is good, but the helper is used under `set -euo pipefail`:

- `scripts/generate-synapse-config.sh:20-21`
- `scripts/generate-synapse-config.sh:29`
- `scripts/generate-synapse-config.sh:69`
- `scripts/backup.sh:16-17`
- `scripts/backup.sh:22`
- `scripts/backup.sh:26`

When a key is absent, `grep` returns 1; because `pipefail` is enabled, the command substitution makes the assignment itself fail. The script exits before `${MAX_UPLOAD_SIZE:-90M}` or `${BACKUP_KEEP:-7}` can apply.

This affects the stock sample path:

- `.env.example:11` has `SYNAPSE_TAG=v1.155.0`
- `.env.example:32` has `ENABLE_INVITE_REGISTRATION=false`
- `.env.example` does not define `MAX_UPLOAD_SIZE`
- `.env.example` does not define `BACKUP_KEEP`

Reproduction:

- Copy `.env.example` to `.env` in a temporary repo-shaped directory and run `bash -x scripts/generate-synapse-config.sh`. It stops immediately after `env_get MAX_UPLOAD_SIZE`.
- Copy `.env.example` to `.env` in a temporary repo-shaped directory and run `bash -x scripts/backup.sh`. It stops immediately after `env_get BACKUP_KEEP`.

Impact: Quick Start users can no longer generate `homeserver.yaml` from the provided example env, and backups fail unless the operator manually adds optional keys that the script says have defaults.

Suggested fix:

```bash
env_get() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" .env | head -1 || true)"
  printf '%s' "${line#*=}" | tr -d '\r'
}
```

Also consider adding `MAX_UPLOAD_SIZE=90M` and `BACKUP_KEEP=7` to `.env.example`, but the helper should still tolerate absent optional keys.

### [P2] RTC secret files are still written with default permissions

The backup path was hardened, but the RTC provisioning path still writes secrets with default process umask:

- `scripts/provision-rtc-vps.sh:111-119` has `write_file`, which uses plain `cat > "$path"`.
- `scripts/provision-rtc-vps.sh:210-225` writes `/opt/selfmatrix/rtc/.env` including `LIVEKIT_SECRET`.
- `rtc/generate-livekit-config.sh:33-37` writes `rtc/livekit.yaml` with shell redirection.
- `rtc/livekit.yaml.template:27-28` places `LIVEKIT_SECRET` under `keys`.

On a typical root provisioning run with umask `022`, both files can become `0644`. That leaks the LiveKit API secret to any local user able to traverse the install directory.

Suggested fix: set `umask 077` before creating RTC secret material, write `.env` with `install -m 600` or `chmod 600 "$RTC_ENV"`, and make `generate-livekit-config.sh` write `livekit.yaml` as `0600`.

### [P2] Manual MatrixRTC well-known docs still point at `MATRIX_HOST` instead of `SERVER_NAME`

The generated `--with-edge` nginx config now correctly writes `/.well-known/matrix/client` for `SERVER_NAME`, but the manual instructions still point operators to the Matrix API host:

- `README.md:226` says to add `org.matrix.msc4143.rtc_foci` to `MATRIX_HOST`'s `/.well-known/matrix/client`.
- `scripts/provision-rtc-vps.sh:360-361` prints the same instruction when `--with-edge` is not used.
- `caddy/Caddyfile:5-10` serves Matrix client well-known under `{$SERVER_NAME}`, not under `{$MATRIX_HOST}`.
- `docs/home-server-network.md:35` also says well-known is on the `SERVER_NAME` host.

Element's MatrixRTC setup documentation says MatrixRTC fetches the client well-known at `https://<server name>/.well-known/matrix/client` and checks that it includes `org.matrix.msc4143.rtc_foci`: https://docs.element.io/latest/element-server-suite-pro/configuring-components/configuring-matrix-rtc/

Impact: users following the manual/non-`--with-edge` instructions can add the SFU discovery record to the wrong host and still get `MISSING_MATRIX_RTC_FOCUS` from clients.

Suggested fix: change README and the final provisioning message to say `SERVER_NAME`'s `/.well-known/matrix/client`. If the project intentionally wants both hosts to work, document that both must return the same client well-known.

### [P3] Some SFU-selection docs still preserve the old "federated users join only" assumption

The main architecture and requirements docs now say MatrixRTC focus selection is first-participant / first-come. A few planning/result notes still refer to the older model:

- `docs/client-spike.md:34`
- `docs/client-spike-results.md:47`
- `docs/roadmap.md:113`

Impact: these are not runtime-breaking, but they cite `requirements.md §5` and can confuse future reviewers about whether other-homeserver-only users are technically allowed to be the first participant.

Suggested fix: either mark these lines as historical findings superseded by the later multi-SFU verification, or update them to match `docs/requirements.md` and `docs/architecture.md`.

### [P3] Noise-suppression requirement text is stale after the RNNoise decision

The roadmap says RNNoise WASM was selected and implementation was completed:

- `docs/roadmap.md:272-275`

But the requirements page still says the implementation method is to be selected by spike:

- `docs/requirements.md:40-41`
- `docs/requirements.md:109`

Impact: this is a documentation consistency issue. A later implementer may think the decision is still pending even though the roadmap records it as complete.

Suggested fix: keep the `SHOULD` requirement, but replace the "to be selected by spike" wording with the chosen RNNoise WASM approach and the remaining operator listening-evaluation caveat.

### [P3] Database identifiers are still interpolated without validation or quoting

The restore and config-generation scripts still assume database names/users are simple identifiers:

- `scripts/restore.sh:58-59`
- `scripts/restore.sh:85-86`
- `scripts/generate-synapse-config.sh:92`
- `scripts/generate-synapse-config.sh:94`

Impact: the default `.env.example` values are safe, so this is lower priority. Non-default identifiers containing hyphens, spaces, quotes, or shell-expanded surprises can break restore/config generation, and restore SQL becomes operator-self-inflicted SQL injection if `.env` values are not trusted.

Suggested fix: validate `POSTGRES_DB` and `POSTGRES_USER` against a strict identifier pattern, or quote identifiers using a real SQL/YAML emitter instead of string interpolation.

## Resolved Since the Previous Review

- `.env.example` now pins `SYNAPSE_TAG=v1.155.0`.
- CI now runs ShellCheck for both `scripts` and `rtc`.
- `scripts/provision-rtc-vps.sh --with-edge --dry-run` now generates Matrix upstream `:8028`, chat upstream `:8082`, `/_synapse/admin` blocking, and both Matrix well-known JSON responses.
- `scripts/generate-synapse-config.sh`, `scripts/backup.sh`, and `scripts/restore.sh` no longer `source .env` directly.
- Backup output hardening and encrypted off-host backup guidance were added.
- `docs/architecture.md` was updated to the first-participant SFU-selection model.
