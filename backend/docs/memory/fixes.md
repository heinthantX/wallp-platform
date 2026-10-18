## Refresh-token reuse revoke rolled back
Root cause: `auth/tokens.go` revoked the token family inside the tx that then returned an error, so the revoke was rolled back. Fix: perform the revoke after the tx ends.

## Checks used a narrower item set than Publish
Root cause: the checks candidate set omitted approved-but-unscheduled items, so they could ship without being checked. Fix: one candidate rule shared by `checks.Run` and `releases.Publish`.

## Default release checker was a no-op
Root cause: publish defaulted to a checker that returned an empty report, so checks never ran in production. Fix: default to `checks.Run`; tests override via `Deps.Checker`.

## agy reverted files it was told not to edit
Root cause: an agy delegation rewrote `openapi.json`, which it was told to leave alone. Fix: always regenerate the OpenAPI types after agy jobs and diff the result.

## Shell gate chains committed after a failed step
Root cause: `(a; b; c) && git commit` only checks the subshell's last exit code, so an inner failure still commits. Fix: check each step's exit code before committing.
