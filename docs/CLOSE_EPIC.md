# AssessIQ — Task: Close the Repo-Grounding Epic (v1.1.0)

> Run this AFTER PR #24 (Slice 4 hardening) is merged into epic/repo-grounding.
> Usage: claude --dangerously-skip-permissions "Read docs/CLOSE_EPIC.md and execute it."

All four slices of the repo-grounding epic are complete and verified (connect flow, scan
pipeline, findings→questions, hardening — including strict mode exercised for real and the
second-repo scan that confirmed the risk-skew is the synthesis prompt, not the repo).
This task merges the epic into the stable product and tags v1.1.0.

## Steps, in order

1. **Regression smoke of the pre-epic product against the epic branch.** The epic must not
   have disturbed the ground it was built on. Verify end to end: build an assessment from
   bank questions → generate a candidate link → take the assessment → worker scores it →
   report renders. If anything in the core loop broke, STOP and report — do not merge.

2. **Env documentation.** Confirm .env.example documents every env var the epic added:
   GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_SLUG, GITHUB_CLIENT_ID,
   GITHUB_CLIENT_SECRET, GITHUB_WEBHOOK_SECRET, ANALYSIS_MODEL.

3. **Webhook doc update.** docs/github-app-setup.md still says to leave webhooks off.
   Update it: note the dev GITHUB_WEBHOOK_SECRET setup used for signature testing, and what
   to enable in the GitHub App settings for production revocation webhooks (Active + same
   secret + the webhook URL pattern).

4. **Merge epic/repo-grounding → develop** with --no-ff.

5. **Commit docs/BLUEPRINT_POST_EPIC.md** (the next-wave plan). It should already be placed
   in docs/ by the human — confirm it exists first; if it does not, STOP and say so.

6. **Update CLAUDE.md:**
   - Repo-grounding is complete: one-paragraph summary (GitHub App contents:read only, layered
     scan, findings with ≤3-line excerpts, source never stored, strict mode, questions via the
     draft→review→vetted pipeline, candidate neutrality).
   - Next wave is defined in docs/BLUEPRINT_POST_EPIC.md (Feature A then Feature B; build
     docs: docs/BUILD_DOCUMENT_GROUNDING.md and docs/BUILD_FOLLOWUP_PROBES.md).
   - Add follow-up item: "Tune synthesis prompt for findings-kind spread — verified the risk
     skew is the prompt, not the repo (75% / 67% risk across two unrelated repos, no other
     kind exceeding one finding). Address before or during Feature A."

7. **Merge develop → main, tag v1.1.0** (annotated; message summarizes what v1.1 adds over
   v1.0: repo-grounded question generation end to end, with its security guarantees), push
   main + tags.

## End state to confirm

- develop and main in sync (identical trees), tag v1.1.0 on origin, epic branch fully merged.
- Report the tag URL and a one-line diff summary (files/lines the epic added).
