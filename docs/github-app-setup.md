# Registering the AssessIQ GitHub App

This is a **human step** — it cannot be automated, because only a GitHub account
owner can create an App. Until it is done, AssessIQ runs with GitHub connection
disabled: `GET /api/v1/integrations/github` returns `configured: false` and the
Integrations page says so instead of offering a button that cannot work.

Design reference: `docs/DESIGN_REPO_GROUNDING.md` §2.1, §2.3.

---

## 1. Create the App

Go to **Settings → Developer settings → GitHub Apps → New GitHub App**
(`https://github.com/settings/apps/new`). For an org-owned app, use
`https://github.com/organizations/<org>/settings/apps/new`.

| Field | Value |
|---|---|
| **GitHub App name** | `AssessIQ` (or `AssessIQ Dev` — names are globally unique) |
| **Homepage URL** | `http://localhost:5173` in dev |
| **Callback URL** | leave blank — we don't use user OAuth |
| **Setup URL** | `http://localhost:3001/api/v1/integrations/github/callback` |
| **Redirect on update** | ✅ **checked** — so "change repositories" comes back to us too |
| **Webhook** | **uncheck Active** for now (webhooks land in Slice 4) |

### Permissions — this is the part that matters

Under **Repository permissions**, set exactly one:

- **Contents: Read-only**

Leave *everything else* at "No access". Do not grant Issues, Pull requests,
Actions, Administration, or any write scope. The scan only ever reads file
contents, and the App should be unable to do anything else even if compromised.

Under **Where can this App be installed?** choose **Any account** if you want to
install it on an org other than your own; **Only on this account** is fine for
local development.

Click **Create GitHub App**.

## 2. Collect the three values

On the App's settings page:

- **App ID** — shown near the top → `GITHUB_APP_ID`
- **Private key** — scroll to *Private keys* → **Generate a private key**. A
  `.pem` downloads. This is a credential: it never goes in the repo →
  `GITHUB_APP_PRIVATE_KEY`
- **Public link** — the URL slug, e.g. `https://github.com/apps/assessiq-dev`
  → the `assessiq-dev` part is `GITHUB_APP_SLUG`

`GITHUB_WEBHOOK_SECRET` is only needed once webhook-driven revocation lands in
Slice 4. Set it now if you like — nothing reads it yet.

## 3. Put them in `apps/api/.env`

The private key is multi-line PEM; `.env` is line-based, so collapse the
newlines to literal `\n`. The API un-escapes them on load.

```bash
# From assessiq/, with the downloaded .pem:
printf 'GITHUB_APP_ID=%s\n' "123456" >> apps/api/.env
printf 'GITHUB_APP_SLUG=%s\n' "assessiq-dev" >> apps/api/.env
printf 'GITHUB_APP_PRIVATE_KEY=%s\n' "$(awk '{printf "%s\\n", $0}' ~/Downloads/assessiq-dev.*.pem)" >> apps/api/.env
```

Then restart the API. `apps/api/.env` is gitignored — keep it that way, and
delete the downloaded `.pem` once it is in there.

## 4. Verify

```bash
curl -s -b cookies.txt http://localhost:3001/api/v1/integrations/github
# → {"configured":true,"integration":null}
```

`configured: true` proves the App ID and private key parse. Then in the app:
**Integrations → Connect GitHub** → GitHub shows *its own* permission screen and
repo picker → approve → you land back on the Integrations page with the repos
you selected listed.

---

## What the manager is agreeing to

GitHub — not AssessIQ — shows the permission screen and the repository picker.
That is deliberate (design §2.1): the picker only offers repos the person has
authority over, so AssessIQ never has to verify ownership itself, and private
repos work identically to public ones.

AssessIQ holds **no long-lived credential**. What it stores is the
`installation_id`. Access tokens are minted from the App's private key on demand
and expire after an hour. Revoking on GitHub (**Settings → Applications →
Installed GitHub Apps → Configure → Uninstall**) cuts access immediately and
irreversibly, whatever AssessIQ's own state says.

## Rotating the private key

Generate a new key on the App page, update `GITHUB_APP_PRIVATE_KEY`, restart the
API, then delete the old key on GitHub. Installations are unaffected — they are
tied to the App, not to a key.
