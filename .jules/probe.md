## 2026-08-15 - Protocol allowlisting regression test
**Learning:** Found a journal-documented security fix from the Warden persona regarding protocol allowlisting in `resolveUrl` that did not have a corresponding regression test in the suite. Added a test ensuring `javascript:`, `file:`, and `ftp:` protocols are properly rejected to protect this trust boundary.
**Action:** Always verify that security fixes documented in journals are paired with tests in the codebase.
