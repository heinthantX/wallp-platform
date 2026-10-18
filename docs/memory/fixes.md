## Refresh-token reuse revoke rolled back
Root cause: `auth/tokens.go` revoked the token family inside the tx that then returned an error, so the revoke was rolled back. Fix: perform the revoke after the tx ends.
