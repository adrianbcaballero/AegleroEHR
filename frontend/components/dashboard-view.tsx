"use client"

import { LifeBuoy, BookOpen, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import React from "react"

export function DashboardView({
  onNavigate,
  userName,
  isFirstLogin,
}: {
  onNavigate?: (tab: string, options?: { filter?: string; patientId?: string }) => void
  userPermissions?: string[]
  userName?: string
  isFirstLogin?: boolean
}) {
  const today = new Date()
  const formattedDate = today.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{formattedDate}</p>
      </div>

      {/* Welcome card */}
      <Card className="border-border/60 bg-primary/5">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center gap-2">
            <h2 className="text-xl font-heading font-semibold text-foreground">
              {isFirstLogin ? "Welcome" : "Welcome back"}{userName ? `, ${userName}` : ""}.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              Aeglero EMR is here to support your team in providing compassionate, structured care
              for patients on their path to recovery. Use the sidebar to navigate to your sections,
              document patient progress, and keep your facility running smoothly.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Learning resources callout */}
      <Card className="border-border/60">
        <CardContent className="p-6">
          <div className="flex flex-col items-center text-center gap-1">
            <p className="text-sm font-semibold text-foreground">New to Aeglero?</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
              If you ever need to familiarize yourself with the system, visit{" "}
              <a
                href="https://aeglero/learning.com"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              >
                aeglero/learning.com
              </a>{" "}
              for in-depth tutorials and staff training resources.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Support links */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-0.5">
          Resources
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card
            className="border-border/60 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
            onClick={() => onNavigate?.("Help & Support")}
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center size-10 rounded-lg bg-muted shrink-0 mt-0.5">
                  <LifeBuoy className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Help & Support</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Guides, FAQs, and contact information for technical assistance
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </CardContent>
          </Card>

          <Card
            className="border-border/60 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
            onClick={() => onNavigate?.("HIPAA Compliance Guidelines")}
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center size-10 rounded-lg bg-muted shrink-0 mt-0.5">
                  <BookOpen className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">HIPAA Compliance Guidelines</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Privacy and security standards your practice is required to follow
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
