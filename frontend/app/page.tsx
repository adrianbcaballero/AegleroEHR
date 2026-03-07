"use client"

import { useState } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { LoginPage } from "@/components/login-page"
import type { UserRole } from "@/components/login-page"
import { DashboardView } from "@/components/dashboard-view"
import { PatientsView } from "@/components/patients-view"
import { FrontDeskView } from "@/components/front-desk-view"
import { ArchiveView } from "@/components/archive-view"
import { WorkflowsView } from "@/components/workflows-view"
import { SystemLogsView } from "@/components/system-logs-view"
import { ManageUsersView } from "@/components/manage-users-view"
import { SettingsView } from "@/components/settings-view"
import { HelpView } from "@/components/help-view"
import { HIPAAComplianceGuidelines } from "@/components/hipaa-compliance-guidelines"
import { Separator } from "@/components/ui/separator"
import { setSessionToken, logout as apiLogout } from "@/lib/api"
import { SessionTimeout } from "@/components/session-timeout"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export default function EHRApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userRole, setUserRole] = useState<UserRole>("psychiatrist")
  const [tenantName, setTenantName] = useState("")
  const [currentUser, setCurrentUser] = useState<{ username: string; fullName: string | null }>({
    username: "",
    fullName: null,
  })
  const [activeItem, setActiveItem] = useState("Dashboard")
  const [navOptions, setNavOptions] = useState<{ filter?: string; patientId?: string } | null>(null)

  const handleSignOut = () => {
    apiLogout().catch(() => {})
    setSessionToken(null)
    setIsLoggedIn(false)
    setTenantName("")
    setCurrentUser({ username: "", fullName: null })
    setActiveItem("Dashboard")
    setNavOptions(null)
  }

  if (!isLoggedIn) {
    return (
      <LoginPage
        onLogin={(role, session) => {
          setSessionToken(session.session_id)
          setUserRole(role)
          setTenantName(session.tenant_name)
          setCurrentUser({ username: session.username, fullName: session.full_name })
          setIsLoggedIn(true)
        }}
      />
    )
  }

  const handleNavigate = (tab: string, options?: { filter?: string; patientId?: string }) => {
    setActiveItem(tab)
    setNavOptions(options || null)
  }

  const handleSidebarNavigate = (tab: string) => {
    setActiveItem(tab)
    setNavOptions(null)
  }

  const renderView = () => {
    switch (activeItem) {
      case "Dashboard":
        return <DashboardView onNavigate={handleNavigate} userRole={userRole} />
      case "Patients":
        return (
          <PatientsView
            initialFilter={
              navOptions?.filter as "intake-complete" | "intake-incomplete" | "dr-completion" | null | undefined
            }
            initialPatientId={navOptions?.patientId}
            userRole={userRole}
          />
        )
      case "Front Desk":
        return <FrontDeskView userRole={userRole} />
      case "Archive":
        return <ArchiveView userRole={userRole} />
      case "Workflows":
        return <WorkflowsView userRole={userRole} />
      case "System Logs":
        return <SystemLogsView />
      case "Manage Users":
        return <ManageUsersView />
      case "Settings":
        return <SettingsView />
      case "Help & Support":
        return <HelpView />
      case "HIPAA Compliance Guidelines":
        return <HIPAAComplianceGuidelines />
      default:
        return <DashboardView onNavigate={handleNavigate} userRole={userRole} />
    }
  }

  return (
    <SidebarProvider>
      <SessionTimeout
        timeoutMinutes={15}
        warningSeconds={60}
        onTimeout={() => {
          setIsLoggedIn(false)
          setTenantName("")
          setCurrentUser({ username: "", fullName: null })
          setActiveItem("Dashboard")
          setNavOptions(null)
        }}
      />
      <AppSidebar
        activeItem={activeItem}
        onNavigate={handleSidebarNavigate}
        onSignOut={handleSignOut}
        userRole={userRole}
        tenantName={tenantName}
        currentUser={currentUser}
      />
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
          <SidebarTrigger className="-ml-1 text-foreground" />
          <Separator orientation="vertical" className="h-5" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <span className="text-xs text-muted-foreground">{tenantName}</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-xs font-medium text-foreground">
                  {activeItem}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {renderView()}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
