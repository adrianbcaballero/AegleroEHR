"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { BookOpen, Mail, ExternalLink } from "lucide-react"

export function HelpView() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          Help & Support
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documentation and resources for the Aeglero Behavioral Health EMR
        </p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-6 sm:p-8">
          <h2 className="text-xl font-bold font-heading text-foreground flex items-center gap-2">
            <BookOpen className="size-5 text-muted-foreground" />
            Getting Started
          </h2>
          <p className="text-sm text-foreground leading-relaxed mt-3">
            Welcome to Aeglero, your comprehensive Behavioral Health EMR platform built for mental health and substance use treatment programs. For walk-throughs and step-by-step guides covering patient management, clinical documentation, treatment planning, and administrative tools, visit our learning portal.
          </p>
          <a
            href="https://aeglero.com/learning"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-primary hover:underline"
          >
            aeglero.com/learning
            <ExternalLink className="size-3.5" />
          </a>

          <Separator className="my-6" />

          <h2 className="text-xl font-bold font-heading text-foreground flex items-center gap-2">
            <Mail className="size-5 text-muted-foreground" />
            Reach Out to Support
          </h2>
          <p className="text-sm text-foreground leading-relaxed mt-3">
            For any issues or technical support, email our team to open a ticket and a member of our support staff will get back to you.
          </p>
          <a
            href="mailto:support@aeglero.com"
            className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-primary hover:underline"
          >
            support@aeglero.com
            <Mail className="size-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
