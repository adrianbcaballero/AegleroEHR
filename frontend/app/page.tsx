"use client"

import { useState, useEffect } from "react"
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
import { ManageRolesView } from "@/components/manage-roles-view"
import { ManageCareTeamsView } from "@/components/manage-care-teams-view"
import { SettingsView } from "@/components/settings-view"
import { HelpView } from "@/components/help-view"
import { HIPAAComplianceGuidelines } from "@/components/hipaa-compliance-guidelines"
import { Separator } from "@/components/ui/separator"
import { setSessionToken, logout as apiLogout, getMe } from "@/lib/api"
import { SessionTimeout } from "@/components/session-timeout"
import { FirstLoginModal } from "@/components/first-login-modal"

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
  const [userPermissions, setUserPermissions] = useState<string[]>([])
  const [tenantName, setTenantName] = useState("")
  const [currentUser, setCurrentUser] = useState<{ username: string; fullName: string | null }>({
    username: "",
    fullName: null,
  })
  const [activeItem, setActiveItem] = useState("Dashboard")
  const [navOptions, setNavOptions] = useState<{ filter?: string; patientId?: string } | null>(null)
  const [showFirstLoginModal, setShowFirstLoginModal] = useState(false)
  const [isFirstLogin, setIsFirstLogin] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(true)

  // On mount, check if there's already a valid session cookie
  useEffect(() => {
    getMe()
      .then((me) => {
        setUserRole((me.role as UserRole) || "psychiatrist")
        setUserPermissions(me.permissions || [])
        setTenantName(me.tenant_name || "")
        setCurrentUser({ username: me.username, fullName: me.full_name })
        setIsLoggedIn(true)
      })
      .catch(() => {})
      .finally(() => setSessionLoading(false))
  }, [])

  if (sessionLoading) return null

  const handleSignOut = () => {
    apiLogout().catch(() => {})
    setSessionToken(null)
    setIsLoggedIn(false)
    setUserPermissions([])
    setTenantName("")
    setCurrentUser({ username: "", fullName: null })
    setActiveItem("Dashboard")
    setNavOptions(null)
  }

  if (!isLoggedIn) {
    return (
      <LoginPage
        onLogin={(role, session) => {
          setUserRole(role)
          setUserPermissions(session.permissions || [])
          setTenantName(session.tenant_name)
          setCurrentUser({ username: session.username, fullName: session.full_name })
          setIsLoggedIn(true)
          setIsFirstLogin(session.is_first_login)
          if (session.requires_terms_agreement) setShowFirstLoginModal(true)
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
        return <DashboardView onNavigate={handleNavigate} userPermissions={userPermissions} userName={currentUser.fullName || currentUser.username} isFirstLogin={isFirstLogin} />
      case "Patients":
        return (
          <PatientsView
            initialFilter={
              navOptions?.filter as "intake-complete" | "intake-incomplete" | "dr-completion" | null | undefined
            }
            initialPatientId={navOptions?.patientId}
            userRole={userRole}
            userPermissions={userPermissions}
          />
        )
      case "Front Desk":
        return <FrontDeskView userPermissions={userPermissions} />
      case "Archive":
        return <ArchiveView userRole={userRole} />
      case "Workflows":
        return <WorkflowsView userRole={userRole} />
      case "System Logs":
        return <SystemLogsView />
      case "Manage Users":
        return <ManageUsersView />
      case "Manage Roles":
        return <ManageRolesView />
      case "Manage Care Teams":
        return <ManageCareTeamsView />
      case "Settings":
        return <SettingsView />
      case "Help & Support":
        return <HelpView />
      case "HIPAA Compliance Guidelines":
        return <HIPAAComplianceGuidelines />
      default:
        return <DashboardView onNavigate={handleNavigate} userPermissions={userPermissions} userName={currentUser.fullName || currentUser.username} isFirstLogin={isFirstLogin} />
    }
  }

  return (
    <SidebarProvider>
      <FirstLoginModal open={showFirstLoginModal} onAccept={() => setShowFirstLoginModal(false)} />
      <SessionTimeout
        timeoutMinutes={15}
        warningSeconds={60}
        onTimeout={() => {
          setIsLoggedIn(false)
          setUserPermissions([])
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
        userPermissions={userPermissions}
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
