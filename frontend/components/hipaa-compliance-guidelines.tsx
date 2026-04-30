"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export function HIPAAComplianceGuidelines() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          HIPAA Compliance Guidelines
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Official guidance and resources for HIPAA and 42 CFR Part 2 compliance.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-6 sm:p-8 flex flex-col gap-6">
          <section>
            <h2 className="text-xl font-bold font-heading text-foreground mt-0">Overview</h2>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              The Health Insurance Portability and Accountability Act (HIPAA) establishes national standards for the protection of individually identifiable health information. Because Aeglero supports behavioral health and substance use treatment programs, certain records are also subject to <strong>42 CFR Part 2</strong>, which imposes stricter confidentiality requirements than HIPAA. All Aeglero users are required to follow both sets of guidelines to ensure the security and privacy of patient data.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">Protected Health Information (PHI)</h3>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              PHI includes any information about health status, provision of healthcare, or payment for healthcare that can be linked to an individual. This includes names, dates of birth, medical record numbers, clinical documentation, and any of the 18 HIPAA identifiers. All PHI within Aeglero must be handled according to the HIPAA Privacy Rule.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">42 CFR Part 2 — Substance Use Disorder Records</h3>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              Patient records identifying an individual as having a substance use disorder, when created by a Part 2-covered program, receive heightened protection beyond HIPAA. Disclosure outside the treating program generally requires written patient consent specifying the recipient, purpose, and expiration. Aeglero enforces this through the Part 2 consent module — never share Part 2 records, even with another treating provider, without a valid consent on file.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">Minimum Necessary Standard</h3>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              When using or disclosing PHI, access is limited to the minimum amount needed to accomplish the intended purpose. Aeglero enforces this through role-based permissions. Do not look up patient records you are not assigned to or that are not required for your job function.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">Patient Rights</h3>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              Under the HIPAA Privacy Rule, patients have the right to access, inspect, and obtain copies of their own PHI (45 CFR § 164.524), request amendments to inaccurate records, receive an accounting of disclosures, request restrictions on uses and disclosures, and receive confidential communications. All such requests must be routed to your organization&apos;s Privacy Officer for processing within the required timeframes.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">Access Controls &amp; Authentication</h3>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              Aeglero implements role-based access controls (RBAC) so users only access information necessary for their job function. Multi-factor authentication (MFA) is supported and may be enforced at the tenant level. Session timeouts protect against unauthorized access from unattended workstations. Account lockouts and rate-limiting mitigate brute-force attacks.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">Encryption &amp; Technical Safeguards</h3>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              PHI is encrypted in transit using TLS 1.2 or higher, and at rest using industry-standard encryption (AES-256). Database backups, audit logs, and signed forms are stored with the same protections. Workstations accessing Aeglero should also use full-disk encryption and automatic screen lock per your organization&apos;s policy.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">Audit Trails</h3>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              All access to patient records is logged with timestamp, user identity, action performed, and source IP address. Audit logs are tamper-evident (hash-chained) and retained for a minimum of six years as required by HIPAA. Unusual access patterns (failed logins, after-hours record access, bulk exports) are surfaced in the System Logs view for compliance review.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">Business Associate Agreements (BAAs)</h3>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              Any third-party vendor with access to PHI through Aeglero (hosting, email, analytics, integrated services) must have a signed Business Associate Agreement on file. Aeglero, Inc. executes a BAA with every customer organization. Contact your Privacy Officer for a copy of your organization&apos;s BAA.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">Breach Notification</h3>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              In the event of a suspected data breach, immediately notify your system administrator and your organization&apos;s Privacy or Security Officer. Under the HIPAA Breach Notification Rule, affected individuals must be notified within 60 days of discovery. Breaches affecting 500 or more individuals must also be reported to the HHS Office for Civil Rights and may require media notification.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">Designated Privacy &amp; Security Officers</h3>
            <p className="text-sm text-foreground leading-relaxed mt-3">
              HIPAA requires every covered entity to designate a Privacy Officer and a Security Officer responsible for compliance. Your organization&apos;s designated officers are the points of contact for breach reports, patient rights requests, training questions, and risk assessments. If you are unsure who they are, ask your administrator.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="text-base font-semibold text-foreground">Workforce Responsibilities</h3>
            <ul className="text-sm text-foreground leading-relaxed list-disc pl-5 flex flex-col gap-2 mt-3">
              <li>Never share login credentials with other staff members</li>
              <li>Lock your workstation when stepping away, even briefly</li>
              <li>Access patient records only when required for treatment, payment, or operations</li>
              <li>Apply the minimum necessary standard to every disclosure</li>
              <li>Report suspected security incidents or privacy violations immediately</li>
              <li>Complete annual HIPAA and 42 CFR Part 2 training as required by your organization</li>
              <li>Do not transmit PHI via unsecured email, SMS, or messaging platforms</li>
              <li>Verify Part 2 consent is on file before any disclosure of substance use treatment records</li>
            </ul>
          </section>

          <Separator />

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <h3 className="text-base font-semibold text-foreground mt-0 mb-2">Official Resources</h3>
            <p className="text-sm text-foreground leading-relaxed mb-3">
              For the full text of HIPAA, 42 CFR Part 2, and additional guidance materials, visit the official U.S. Department of Health &amp; Human Services and SAMHSA websites.
            </p>
            <div className="flex flex-col gap-1.5">
              <a
                href="https://www.hhs.gov/hipaa/index.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                HHS.gov — HIPAA for Professionals
              </a>
              <a
                href="https://www.samhsa.gov/about-us/who-we-are/laws-regulations/confidentiality-regulations-faqs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                SAMHSA — 42 CFR Part 2 Confidentiality Regulations
              </a>
              <a
                href="https://www.hhs.gov/ocr/index.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                HHS Office for Civil Rights — Breach Reporting
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
