# BudgetRail security review — 2026-08-10

- Mode: Phase 5 full repository/payment-path audit
- Confidence gate: 8/10
- Security grade: B
- Quality grade: A
- Ready for mainnet: no

## Executive result

No critical or high-severity finding remains. The initial dependency scan found eight high advisories; all were remediated with a patched Next.js release and explicit image/CSS transitive overrides. The adversarial payment proof passes on an isolated Surfpool devnet fork, and secret scanning found no credential in current source, Git history, or generated client assets.

## Findings

### [MEDIUM] BR-SEC-001: Shared public demo runtime needs production isolation

**Confidence:** 9/10  
**Category:** OWASP A01/A06; STRIDE denial of service  
**Location:** `app/lib/phase3/demo-runtime.ts`, `app/api/demo/*`

**Description:** The current demo intentionally exposes one process-global disposable Surfpool rail. Same-origin checks stop browser CSRF, and reset operations are serialized, but a direct client can still invoke proof/reset/revoke endpoints. Multiple judges could interfere with one another, and repeated expensive setup requests could exhaust a hosted Node process.

**Exploit scenario:** An attacker repeatedly calls the public reset or proof routes. Legitimate viewers observe changing state or unavailable local RPC resources even though no funded production asset is at risk.

**Existing mitigation:** devnet-only disposable funds; same-origin browser guard; reset promise lock; no production deployment yet.

**Remediation:** Before Phase 6 deployment, issue an HttpOnly demo-session identifier, allocate one runtime per bounded session, add distributed per-session/IP rate limits and concurrency quotas, expire idle runtimes, and keep the deployment on a controlled persistent Node runtime.

**Priority:** P1 before public deployment.

### [LOW] BR-SEC-002: Replay state is process-local

**Confidence:** 9/10  
**Category:** OWASP A08/A10; STRIDE tampering/availability  
**Location:** `packages/x402-adapter/src/merchant.ts`

**Description:** Challenge and payment fingerprints live in in-memory maps. This is safe and deterministic for the current single-process demo, but a restart or multi-instance deployment loses routing continuity and can reject legitimate paid retries as unknown.

**Remediation:** Persist challenges, reservations, payment fingerprints, and terminal settlement state in an atomic shared store before horizontally scaled deployment. Keep the reserve-before-I/O transition as a compare-and-set operation.

**Priority:** P1 before horizontally scaled deployment.

### [LOW] BR-SEC-003: Moderate transitive UUID advisory remains isolated

**Confidence:** 10/10  
**Category:** OWASP A03 software supply chain  
**Location:** `8004-solana → @solana/web3.js → jayson → uuid@8.3.2`

**Description:** `pnpm audit` reports GHSA-w5hq-g745-h8pq for buffer bounds handling in UUID v3/v5/v6. BudgetRail does not call these UUID APIs; the package is inherited through the legacy registry/RPC adapter.

**Remediation:** Monitor `8004-solana`, `@solana/web3.js`, and `jayson` for an upstream patched dependency. Do not force a breaking `uuid` major override without compatibility tests.

**Priority:** P3 monitor upstream.

## Resolved during this review

- Upgraded Next.js to 16.2.12 and matching ESLint config.
- Pinned `sharp` 0.35.3, `postcss` 8.5.26, and legacy `nanoid` below 3.3.17 to patched versions.
- Replaced raw facilitator errors with fixed public diagnostics.
- Added centralized credential/key redaction and bounded error messages.
- Removed raw transaction error objects from browser logging.
- Added same-origin mutation guards and baseline security headers.
- Added merchant, RPC, settlement-unknown, malformed input, secret-safety, and origin-guard tests.

## Confidence calibration

- Total open findings: 3
- Critical: 0
- High: 0
- Medium: 1 (average confidence 9/10)
- Low: 2 (average confidence 9.5/10)
- False positives filtered: 6 minified vendor `password` assignments plus explicit test fixtures
- Mode: daily/high-confidence, adapted to the approved Phase 5 scope
