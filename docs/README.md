# GRC Documentation

Compliance, risk, and policy artifacts for Aeglero. Each document corresponds to a HIPAA Security Rule requirement, a NIST SP 800-66 Rev 2 implementation specification, or a SOC 2 Trust Services Criterion.

## Structure

| Folder / file | What's inside |
|---|---|
| `risk-analysis.md` | HIPAA Risk Analysis per §164.308(a)(1)(ii)(A) |
| `controls-evidence.md` | Crosswalk of SECURITY.md control claims to evidence |
| `gap-analysis.md` | Compliance work remaining before production launch |
| `vendor-register.md` | Third-party risk register (BAA / SOC 2 / risk rating per vendor) |
| `iac-scan-exceptions.md` | Every Trivy / Checkov suppression in `infra/`, grouped by reason, with removal criteria |
| `policies/` | Required organizational policies |
| `runbooks/` | Operational playbooks for incidents and routine compliance tasks |
| `evidence/` | Supporting screenshots, log samples, test output, signed BAAs |

## Status legend

- **Not started** — placeholder only
- **Draft** — first pass written, needs review
- **In review** — awaiting feedback or formal sign-off
- **Approved** — finalized, dated, and in production use
