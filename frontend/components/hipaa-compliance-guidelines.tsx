"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export function HIPAAComplianceGuidelines() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          HIPAA Compliance Guidelines
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Official guidance and resources for HIPAA compliance.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-6 sm:p-8">
          <article className="prose prose-sm max-w-none">
            <h2 className="text-xl font-bold font-heading text-foreground mt-0">Overview</h2>
            <p className="text-sm text-foreground leading-relaxed">
              The Health Insurance Portability and Accountability Act (HIPAA) establishes national standards for the protection of individually identifiable health information. All Aeglero users are required to follow these guidelines to ensure the security and privacy of patient data.
            </p>

            <Separator className="my-6" />

            <h3 className="text-base font-semibold text-foreground">Protected Health Information (PHI)</h3>
            <p className="text-sm text-foreground leading-relaxed">
              PHI includes any information about health status, provision of healthcare, or payment for healthcare that can be linked to an individual. This includes names, dates of birth, medical record numbers, and any clinical documentation. All PHI within Aeglero must be handled according to the HIPAA Privacy Rule.
            </p>

            <Separator className="my-6" />

            <h3 className="text-base font-semibold text-foreground">Access Controls</h3>
            <p className="text-sm text-foreground leading-relaxed">
              Aeglero implements role-based access controls (RBAC) to ensure that users can only access information necessary for their job function. Multi-factor authentication (MFA) is available and recommended for all accounts. Session timeouts are enforced to prevent unauthorized access from unattended workstations.
            </p>

            <Separator className="my-6" />

            <h3 className="text-base font-semibold text-foreground">Audit Trails</h3>
            <p className="text-sm text-foreground leading-relaxed">
              All access to patient records is logged in the System Logs with timestamp, user identity, action performed, and IP address. These audit trails are retained for a minimum of six years as required by HIPAA. Unusual access patterns automatically trigger compliance alerts for review.
            </p>

            <Separator className="my-6" />

            <h3 className="text-base font-semibold text-foreground">Breach Notification</h3>
            <p className="text-sm text-foreground leading-relaxed">
              In the event of a suspected data breach, immediately notify your system administrator and the compliance team. Under the HIPAA Breach Notification Rule, affected individuals must be notified within 60 days of discovery. Breaches affecting 500 or more individuals must also be reported to the HHS Office for Civil Rights.
            </p>

            <Separator className="my-6" />

            <h3 className="text-base font-semibold text-foreground">Employee Responsibilities</h3>
            <ul className="text-sm text-foreground leading-relaxed list-disc pl-5 flex flex-col gap-2">
              <li>Never share login credentials with other staff members</li>
              <li>Lock your workstation when stepping away, even briefly</li>
              <li>Do not access patient records unless required for treatment, payment, or operations</li>
              <li>Report any suspected security incidents immediately</li>
              <li>Complete annual HIPAA training as required by your organization</li>
              <li>Do not transmit PHI via unsecured email or messaging platforms</li>
            </ul>

            <Separator className="my-6" />

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <h3 className="text-base font-semibold text-foreground mt-0 mb-2">Official HIPAA Resources</h3>
              <p className="text-sm text-foreground leading-relaxed mb-3">
                For the full text of the HIPAA regulation and additional guidance materials, visit the official U.S. Department of Health & Human Services website.
              </p>
              <a
                href="https://www.hhs.gov/hipaa/index.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                HHS.gov - HIPAA for Professionals
              </a>
            </div>
          </article>
        </CardContent>
      </Card>
    </div>
  )
}
