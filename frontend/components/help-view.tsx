"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { BookOpen } from "lucide-react"

export function HelpView() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          Help & Support
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documentation and resources for the Aeglero Mental Health EMR
        </p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-6 sm:p-8">
          <article className="prose prose-sm max-w-none">
            <h2 className="text-xl font-bold font-heading text-foreground mt-0">Getting Started</h2>
            <p className="text-sm text-foreground leading-relaxed">
              Welcome to Aeglero, your comprehensive Mental Health EMR platform. This guide will walk you through the core features of the system including patient management, clinical documentation, treatment planning, and administrative tools.
            </p>

            <Separator className="my-6" />

            <h2 className="text-xl font-bold font-heading text-foreground">Key Sections</h2>
            <p className="text-sm text-foreground leading-relaxed">
              Use the sidebar to navigate between Dashboard, Patients, Treatment Plans, Workflows, and Administration. For official HIPAA compliance material, see the dedicated &qout;HIPAA Compliance Guidelines&quot; page under Support.
            </p>
          </article>
        </CardContent>
      </Card>
    </div>
  )
}
