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
| **Webhook** | **uncheck Active** for now (webhooks land in Slice 4) |

### The three URL settings — get these right or the flows fail silently

These live in **two different sections** of the App page and are easy to miss.
Both known failure modes came from exactly these fields, so they are worth
checking twice. The two URLs are **different endpoints** — do not point both at
the same one.

| Setting | Section on the GitHub App page | Value |
|---|---|---|
| **Callback URL** | *Identifying and authorizing users* | `http://localhost:3001/api/v1/integrations/github/oauth/callback` |
| **Setup URL** | *Post installation* | `http://localhost:3001/api/v1/integrations/github/callback` |
| **Redirect on update** | *Post installation*, checkbox | ✅ **checked** |

What each one does, and what breaks without it:

- **Setup URL** — where GitHub returns the manager after they install. Blank, and
  a successful install never reaches AssessIQ: the installation exists on GitHub
  and nothing exists here, with no error anywhere. This is the redirect bug.
- **Redirect on update** — unchecked, the *initial* install returns but
  **changing repositories later does not**. The repo list then silently drifts
  out of date relative to what the manager actually shared.
- **Callback URL** — where GitHub returns the manager after they authorise
  **Sync from GitHub**. Point it at the Setup URL by mistake and the sync
  redirect arrives at the install handler, which has no `installation_id` to
  work with. (That handler now detects a `code`+`state` pair and completes the
  sync anyway, so this misconfiguration degrades to working — but set it
  correctly regardless.)

Leave **"Request user authorization (OAuth) during installation"** unchecked.
Install and sync are separate flows here by design.

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

For **Sync from GitHub** (below), also collect:

- **Client ID** — shown near the App ID, looks like `Iv1.…` → `GITHUB_CLIENT_ID`
- **Client secret** — *Generate a new client secret* → `GITHUB_CLIENT_SECRET`

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

If you land back with a **warning banner instead of the repo list**, match it here:

| Banner | Cause |
|---|---|
| "…without telling us which installation" | **Setup URL** missing or wrong |
| "…organisation requires an owner to approve" | genuine: an org owner must approve (only shown for `setup_action=request`) |
| "The sync could not be completed" | **Callback URL** wrong, or the 10-minute state expired |
| "no GitHub App is configured" | `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` not loaded — restart the API |

Changing repositories later and finding the list unchanged means **Redirect on
update** is unchecked.

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

## Sync from GitHub — when the redirect never happens

GitHub redirects back to the Setup URL on a fresh install, and on an update only
if *Redirect on update* is checked. Neither covers every path: a manager who
installs or edits the app from **Settings → Applications** on github.com can end
up with a working installation that AssessIQ has never heard of.

**Sync from GitHub** recovers that. It does *not* work by listing the App's
installations — `GET /app/installations` returns every customer's installation,
so adopting from it would let one tenant claim another's repositories, breaking
§2.4. Instead:

1. The manager authorises AssessIQ against their **GitHub identity** (the App's
   user-to-server flow — this is what the Callback URL and client secret are for).
2. We call `GET /user/installations`, which returns only installations **that
   user** can access. GitHub is the authority on whose is whose.
3. That verified list is cached server-side for 10 minutes and shown to them.
4. Adopting checks the chosen id against that list and refuses anything else.

The user access token is used for exactly one call, in that one request, and is
never stored. **Repository content is never read with it** — that always goes
through an installation token, as §2.1 requires. The token proves *identity*, not
access.

Without `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, the install flow still works
and the Sync button is simply hidden.

## Rotating the private key

Generate a new key on the App page, update `GITHUB_APP_PRIVATE_KEY`, restart the
API, then delete the old key on GitHub. Installations are unaffected — they are
tied to the App, not to a key.
