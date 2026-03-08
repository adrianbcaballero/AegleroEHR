"use client"

import { useState } from "react"
import { acceptTerms } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import React from "react"

export function FirstLoginModal({
  open,
  onAccept,
}: {
  open: boolean
  onAccept: () => void
}) {
  const [agreed, setAgreed] = useState(false)

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0"
        onPointerDownOutside={(e: Event) => e.preventDefault()}
        onEscapeKeyDown={(e: KeyboardEvent) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="font-heading text-foreground text-lg">
            User Agreement & HIPAA Acknowledgment
          </DialogTitle>
          <DialogDescription>
            Please read the following before accessing the system. You must agree to proceed.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-5 overflow-y-auto max-h-[55vh]">
          <div className="flex flex-col gap-5 text-sm text-foreground leading-relaxed">

            <section className="flex flex-col gap-1.5">
              <h3 className="font-semibold text-foreground">1. Software License Agreement (SLA)</h3>
              <p className="text-muted-foreground">
                By accessing Aeglero EMR, you agree to use this software solely for authorized
                clinical and administrative purposes within your organization. You may not copy,
                modify, distribute, or reverse-engineer any part of this system. Access is granted
                on a per-user basis and is non-transferable. Aeglero Health, Inc. reserves the right
                to suspend or revoke access at any time for violations of this agreement or
                applicable law.
              </p>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="font-semibold text-foreground">2. Acceptable Use Policy</h3>
              <p className="text-muted-foreground">
                You agree to access only the patient records and system functions necessary for your
                role. Unauthorized access, sharing of login credentials, or use of this system for
                any purpose outside your assigned clinical duties is strictly prohibited and may
                result in immediate account termination and legal action.
              </p>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="font-semibold text-foreground">3. HIPAA Privacy & Security Acknowledgment</h3>
              <p className="text-muted-foreground">
                This system contains Protected Health Information (PHI) subject to the Health
                Insurance Portability and Accountability Act of 1996 (HIPAA), 45 CFR Parts 160
                and 164. By accessing this system you acknowledge that:
              </p>
              <ul className="list-disc pl-5 text-muted-foreground flex flex-col gap-1">
                <li>You are authorized to access only the PHI necessary to perform your job duties (minimum necessary standard, §164.502(b)).</li>
                <li>You will not disclose PHI to any unauthorized individual, inside or outside the organization.</li>
                <li>You will not access, view, or download PHI for any personal, non-clinical, or non-administrative purpose.</li>
                <li>All access to PHI is logged and audited per §164.312(b).</li>
                <li>You will report any suspected or confirmed breach of PHI to your Privacy Officer immediately.</li>
                <li>Violations of HIPAA may result in civil penalties up to $1.9 million per violation category per year, and criminal penalties including imprisonment.</li>
              </ul>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="font-semibold text-foreground">4. Data Security Responsibilities</h3>
              <p className="text-muted-foreground">
                You are responsible for maintaining the confidentiality of your login credentials.
                You must lock or log out of the system when leaving your workstation unattended.
                You may not install unauthorized software, use unapproved devices, or attempt to
                circumvent any security control within this system.
              </p>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="font-semibold text-foreground">5. 42 CFR Part 2 — Substance Use Disorder Records</h3>
              <p className="text-muted-foreground">
                Patient records related to substance use disorder treatment are additionally
                protected under 42 CFR Part 2. These records may not be disclosed without a
                specific patient consent form that meets Part 2 requirements, except in limited
                circumstances permitted by law (e.g., medical emergencies, audits). Unauthorized
                disclosure carries separate federal penalties.
              </p>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="font-semibold text-foreground">6. Acknowledgment of Monitoring</h3>
              <p className="text-muted-foreground">
                You acknowledge that all activity within this system is subject to monitoring,
                logging, and auditing. There is no expectation of privacy when using this system
                for work purposes. Audit logs may be reviewed by authorized administrators at any
                time.
              </p>
            </section>

          </div>
        </ScrollArea>

        <div className="px-6 py-4 border-t border-border flex flex-col gap-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(v: boolean) => setAgreed(v)}
              className="mt-0.5 shrink-0"
            />
            <span className="text-sm text-foreground leading-relaxed">
              I have read and understand the User Agreement, Acceptable Use Policy, HIPAA
              Acknowledgment, and all policies above. I agree to comply with all terms as a
              condition of accessing this system.
            </span>
          </label>
          <Button
            className="w-full"
            disabled={!agreed}
            onClick={() => { acceptTerms().catch(() => {}); onAccept() }}
          >
            I Agree — Continue to Dashboard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
