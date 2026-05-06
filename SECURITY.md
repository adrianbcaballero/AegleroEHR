# Security Policy

This document describes how to report security issues in Aeglero, the technical controls in place to protect protected health information (PHI), and how those controls map to the HIPAA Security Rule and 42 CFR Part 2.

If you're looking for the implementation behind any control, [ARCHITECTURE.md](ARCHITECTURE.md) has the deep-dive on auth, multi-tenancy, and the audit log integrity scheme. [README.md](README.md) covers tech stack and general information. The [`docs/`](docs/) folder holds the supporting GRC artifacts: HIPAA Risk Analysis, controls evidence, gap analysis, vendor register, organizational policies, and operational runbooks.

---

## Reporting a vulnerability

We take security reports seriously.

### How to report

Email **security@aeglero.com**. Do not file vulnerabilities in public GitHub issues — if a working exploit affects active deployments, public disclosure could put PHI at risk.

Please include:

- A description of the issue
- Steps to reproduce, including request/response payloads if applicable
- The environment where you observed it
- Your proposed severity assessment (we'll independently classify but yours helps)
- Whether you'd like public credit after the fix lands

---

## Technical controls

This section catalogues the security mechanisms implemented in the application. Each item is anchored to source code where possible so you can verify the implementation rather than just trust the description.

### Encryption

- **At rest** — AES-256 via AWS KMS customer-managed keys, with annual rotation enabled. Four keys partition encryption boundaries by service: RDS storage, Secrets Manager entries, CloudWatch Logs, and S3 buckets. ECR repository uses AWS-owned AES-256 (image bytes are application code, not PHI).
- **In transit** — TLS 1.2+ enforced everywhere. ALB listener uses `ELBSecurityPolicy-TLS13-1-2-2021-06`. CloudFront's `minimum_protocol_version = TLSv1.2_2021`. RDS `parameter_group` sets `rds.force_ssl = 1`, rejecting non-TLS Postgres connections.
- **Application-level** — `?sslmode=require` appended to the database connection string in Secrets Manager so the Flask app fails fast on any non-TLS DB connection.

### Authentication

- **Password hashing** — Werkzeug `generate_password_hash()` (scrypt by default) with `check_password_hash()` for verification.
- **Password complexity** — minimum 12 characters with mixed-class requirements (uppercase, lowercase, digit, special). Enforced server-side in `services/password_validator.py` for both initial password creation and admin password resets.
- **Sessions** — server-issued session ID stored in a single `httpOnly`, `Secure`, `SameSite=Lax` cookie. No tokens in localStorage or sessionStorage. Session records live in Postgres so revocation is instant.
- **Sliding expiration** — 15-minute idle timeout. Every authenticated request bumps `expires_at`.
- **Account lockout** — automatic temporary lockout after 5 consecutive failed logins, configurable. Permanent lock by an admin kills all active sessions for that user immediately.
- **MFA** — TOTP-based, RFC 6238 compliant. Per-tenant enforcement toggle. Users can't disable their own MFA while the tenant flag is on.
- **Self-protection** — admins cannot lock their own account or change their own role.

### Authorization

- **Role-based access control (RBAC)** — every user has exactly one role per tenant. Each role carries a flat list of permissions. System default roles are seeded by migration; tenants create unlimited custom roles. Permissions are namespaced strings (`patients.view`, `frontdesk.beds.manage`, etc.).
- **Care-team-scoped patient visibility** — orthogonal to roles. Users without `patients.view.all` can only see patients assigned to a care team they're a member of. Enforced server-side in every patient list query (see `routes/patients.py:_apply_rbac()`).
- **Per-template access overlay** — clinical form templates have their own role-by-template permission matrix with three tiers (view / edit / sign). More granular than role-level; same role can have different access on different templates.
- **Permission dependencies** — UI auto-resolves: checking "Manage Beds" auto-checks "View Front Desk"; unchecking the base auto-removes dependents. Prevents broken roles where a user has "edit" without "view".

### Multi-tenancy

- **Tenant resolution from Host header** — on every request, `services/helpers.py:get_slug_from_host()` parses the subdomain to a tenant slug. The session-resolved user's `tenant_id` is then validated against the slug in `auth_middleware.py`.
- **Universal schema-level enforcement** — every table that holds tenant data carries a non-nullable, indexed `tenant_id` foreign key. Unique constraints are scoped per-tenant (the same username, patient code, or role name can exist independently across tenants without colliding).
- **Universal query-level enforcement** — every authenticated route runs queries through the `tenant_query()` helper, which automatically applies the `tenant_id = g.tenant_id` filter. Cross-tenant data exposure is structurally prevented, not relying on per-route discipline.

### Audit and integrity

- **Hash-chained audit log** — every audit row's `entry_hash` is `SHA-256(content || prev_hash)`. The chain is per-tenant. Tampering with any past row breaks every subsequent hash; detection is a single API call to `GET /api/audit/verify`. See `services/audit_logger.py` for the hash construction and `routes/audit.py:verify_audit_chain()` for the verification walk. Satisfies **ONC §170.315(d)(2)** tamper-resistance.
- **Signed-form integrity** — completed clinical forms have their canonical-serialized contents SHA-256 hashed; the hash is recorded in the corresponding `FORM_SIGN` audit entry. Combined with the audit chain, this gives cryptographic proof signed forms have not been altered after the fact.
- **PHI-aware logging** — for sensitive field types (text, textarea, signature), audit log records "field X: changed" rather than the actual content. The audit log itself does not become a second copy of clinical narrative.
- **Comprehensive event coverage** — login (success/fail), logout, all PHI views, all edits, signs, deletes, role and permission changes, MFA events, account locks/unlocks, password resets, tenant settings changes. Every meaningful state change is captured.
- **Autosave dedup with high-signal exemptions** — draft form-update events dedup within a 10-minute window per (user, form). Sign and delete events never dedup — they always log.

### Network and infrastructure

- **VPC isolation** — three subnet tiers: public (ALB, NAT), private (ECS Fargate), isolated (RDS). RDS isolated subnets have no internet route at all.
- **Security group chaining** — ALB SG accepts ingress only from the AWS-managed CloudFront origin-facing prefix list. ECS SG accepts ingress only from ALB SG. RDS SG accepts ingress only from ECS SG.
- **Public access blocked on S3** — frontend bucket has all four public-access-block flags set (`block_public_acls`, `block_public_policy`, `ignore_public_acls`, `restrict_public_buckets`). Bucket policy allows reads only from the EMR's CloudFront distribution via Origin Access Control.
- **VPC Flow Logs** — captured to KMS-encrypted CloudWatch Logs with 365-day retention, supporting after-the-fact network forensics.
- **No SSH, no bastion** — operational shell access is via `aws ecs execute-command` over SSM Session Manager, not SSH. SSM session events are logged in CloudTrail.

### Hardened HTTP response headers

Every response from Flask carries:

| Header | Value | Why |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS for one year, including subdomains |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type confusion attacks |
| `X-Frame-Options` | `DENY` | Prevent clickjacking; the EMR cannot be iframed |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS filter (newer browsers use CSP) |
| `Content-Security-Policy` | `default-src 'self'; frame-ancestors 'none'` | Same-origin only, no embedding |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Don't leak full URLs cross-origin |
| `Cache-Control` | `no-store, no-cache, must-revalidate` | Prevent PHI from being cached by browsers or proxies |
| `Pragma` | `no-cache` | HTTP/1.0 backward-compat for `no-cache` |

See `backend/app.py:add_security_headers()`.

### Secrets management

- DB master password and Flask `SECRET_KEY` are auto-generated by Terraform's `random_password` resource and written directly to AWS Secrets Manager — they never appear on a developer laptop, in shell history, or in environment files.
- ECS task execution role has `secretsmanager:GetSecretValue` scoped to specific secret ARNs and `kms:Decrypt` scoped to the secrets KMS key only. No broader access.
- Secrets are injected into the running container as environment variables at task start by the ECS agent — process listings would show the env-var names but values are not logged by the ECS agent or CloudWatch.

### Operational telemetry

- **CloudWatch Logs** for application output, with KMS encryption and 365-day retention
- **VPC Flow Logs** for network-level visibility
- (Phase 3f — planned) **CloudTrail** with S3 object-lock for AWS API audit log
- (Phase 3f — planned) **AWS Config** for continuous compliance state monitoring
- (Phase 3f — planned) **AWS WAF** on CloudFront for L7 protection (rate limiting, common attack patterns)

### Business continuity

- **RDS Multi-AZ** — automatic failover to a synchronous standby replica in a second availability zone
- **RDS automated backups** — 7-day retention, point-in-time recovery enabled
- **ECS Fargate** — task auto-restart on failure; self-healing under AZ disruption
- **S3 versioning** — frontend bucket and Terraform state bucket retain versions for rollback
- **Stateless application** — Flask app keeps no in-memory state beyond per-request; new tasks pick up immediately

---

## Compliance mapping

The following table maps Aeglero's technical controls to the HIPAA Security Rule (45 CFR Part 164) and 42 CFR Part 2 sections most relevant to a substance use disorder treatment EMR. This is the technical control mapping; administrative controls (workforce training, sanction policies, BAAs) are operational and live outside this codebase.

### HIPAA Security Rule — Technical Safeguards (§ 164.312)

| Section | Requirement | How Aeglero implements it |
|---|---|---|
| **§ 164.312(a)(1)** | Access Control — Unique user identification | Per-tenant `User` records with unique usernames. Sessions tied to a specific user. |
| **§ 164.312(a)(2)(i)** | Access Control — Unique user ID | Same as above; usernames unique within tenant. |
| **§ 164.312(a)(2)(iii)** | Access Control — Automatic logoff | 15-min sliding session expiration; idle sessions return 401. |
| **§ 164.312(a)(2)(iv)** | Access Control — Encryption | Storage AES-256 via KMS; transit TLS 1.2+. |
| **§ 164.312(b)** | Audit Controls — Record and examine activity | Per-event audit log capturing every PHI access, edit, sign, delete; queryable via `/api/audit/logs`. |
| **§ 164.312(c)(1)** | Integrity — Protect EPHI from improper alteration | Completed forms immutable (UPDATE blocked at route level); deletion gated by separate `forms.delete_completed` permission. |
| **§ 164.312(c)(2)** | Integrity — Mechanism to authenticate EPHI | SHA-256 hash chain on the audit log + per-form SHA-256 on signed records. Tampering is mathematically detectable. |
| **§ 164.312(d)** | Person/Entity Authentication | Password (12+ char, scrypt) plus optional TOTP MFA. Account lockout after repeated failures. |
| **§ 164.312(e)(1)** | Transmission Security | TLS 1.2+ end-to-end; HSTS header; force_ssl on Postgres. |
| **§ 164.312(e)(2)(i)** | Integrity Controls in transit | TLS provides integrity for transmitted data. |
| **§ 164.312(e)(2)(ii)** | Encryption in transit | TLS 1.2+ everywhere. |

### HIPAA Security Rule — Administrative Safeguards (§ 164.308)

These are operational, not strictly technical, but the application surfaces help operators implement them:

| Section | Requirement | How Aeglero supports it |
|---|---|---|
| **§ 164.308(a)(3)(ii)(B)** | Workforce — Termination procedures | Permanent account lock kills all active sessions instantly; preserves the audit trail. |
| **§ 164.308(a)(4)** | Information Access Management | RBAC + care-team-scoped visibility; per-template access overlay; principle of least privilege enforceable per role. |
| **§ 164.308(a)(5)(ii)(C)** | Security Awareness — Login monitoring | Failed logins logged with IP and reason; admin can review via System Logs. |
| **§ 164.308(a)(6)** | Security Incident Procedures | Audit log + hash chain provide tamper-evident incident reconstruction. |

### HIPAA Security Rule — Physical Safeguards (§ 164.310)

Physical controls are largely AWS's responsibility under the BAA:

| Section | Requirement | How addressed |
|---|---|---|
| **§ 164.310(a)** | Facility access controls | AWS data centers (BAA-covered). |
| **§ 164.310(d)** | Device and media controls | AWS-managed; KMS-encrypted storage means decommissioned drives are unreadable. |

### ONC Health IT Certification

| Criterion | Implementation |
|---|---|
| **§ 170.315(d)(2)** Auditable events and tamper-resistance | SHA-256 hash chain on audit log; one-click integrity verification endpoint. |
| **§ 170.315(d)(3)** Audit report(s) | `/api/audit/logs` with filters (user, action, resource substring, status, date range) and CSV export. |
| **§ 170.315(d)(7)** End-user device encryption | Enforced via session cookie hardening + HSTS; the application does not store PHI on the device. |

### 42 CFR Part 2 — Confidentiality of Substance Use Disorder Records

| Section | Requirement | How Aeglero implements it |
|---|---|---|
| **§ 2.13** | Confidentiality restrictions and safeguards | Multi-tenant data isolation; encrypted at rest and in transit; RBAC; care-team-scoped access; full audit trail. |
| **§ 2.31** | Consent — written form requirements | Per-patient `Part2Consent` records with named recipient, expiration date, and disclosure purpose. Created, viewed, and revoked through the UI; every action audit-logged. |
| **§ 2.51** | Disclosures permitted with consent | Consent records track the recipient and purpose; disclosure events can be cross-referenced against consent records via the audit log. |
| **§ 2.61** | Disclosures permitted with written consent — revocation | Consent revocations are first-class events: an explicit `revoked_at` timestamp on the consent row plus a `CONSENT_REVOKE` audit log entry. |

---

## Contact

- **Security disclosures:** security@aeglero.com
- **General inquiries:** contact@aeglero.com
