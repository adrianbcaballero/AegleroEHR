"use client"

import Image from "next/image"
import React, { useState, useRef, useEffect, useCallback } from "react"
import type { UserRole } from "@/components/login-page"
import {
  LayoutDashboard,
  Users,
  ScrollText,
  Settings,
  HelpCircle,
  LogOut,
  ChevronDown,
  Shield,
  ShieldCheck,
  GitBranch,
  UserCog,
  PenLine,
  Trash2,
  RefreshCw,
  Loader2,
  ClipboardList,
  Archive,
  UsersRound,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { getMe, saveSignature } from "@/lib/api"

// ─── Signature Dialog ───
function SignatureDialog({ open, onClose, displayName }: { open: boolean; onClose: () => void; displayName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [hasExisting, setHasExisting] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(true)

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const generateFromName = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = `italic 48px "Brush Script MT", "Segoe Script", "Dancing Script", cursive`
    ctx.fillStyle = "#1a1a2e"
    ctx.textBaseline = "middle"
    const text = displayName
    const metrics = ctx.measureText(text)
    const x = Math.max(20, (canvas.width - metrics.width) / 2)
    ctx.fillText(text, x, canvas.height / 2)
  }, [displayName])

  // Load existing signature when dialog opens
  useEffect(() => {
    if (!open) return
    getMe()
      .then((me) => {
        setSaved(false)
        setError("")
        setHasExisting(!!me.signature_data)
        if (me.signature_data) {
          const canvas = canvasRef.current
          if (canvas) {
            const ctx = canvas.getContext("2d")
            if (ctx) {
              const img = new window.Image()
              img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0) }
              img.src = me.signature_data
            }
          }
        }
        setLoadingExisting(false)
      })
      .catch(() => setLoadingExisting(false))
  }, [open])

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ("touches" in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * (canvas.width / rect.width), y: (t.clientY - rect.top) * (canvas.height / rect.height) }
    }
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) }
  }

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.strokeStyle = "#1a1a2e"
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDraw = () => { drawing.current = false }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)
    setError("")
    const dataUrl = canvas.toDataURL("image/png")
    saveSignature(dataUrl)
      .then(() => { setSaved(true); setHasExisting(true) })
      .catch(() => setError("Failed to save signature"))
      .finally(() => setSaving(false))
  }

  const handleRemove = () => {
    setSaving(true)
    setError("")
    saveSignature(null)
      .then(() => { clearCanvas(); setHasExisting(false); setSaved(false) })
      .catch(() => setError("Failed to remove signature"))
      .finally(() => setSaving(false))
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">My Signature</DialogTitle>
          <DialogDescription>
            Draw your signature or generate one from your name. This will be embedded on forms when you sign and complete them.
          </DialogDescription>
        </DialogHeader>

        {loadingExisting ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="relative rounded-lg border-2 border-dashed border-border bg-white overflow-hidden" style={{ touchAction: "none" }}>
              <canvas
                ref={canvasRef}
                width={440}
                height={160}
                className="w-full cursor-crosshair"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
              <p className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/40 pointer-events-none select-none">sign above</p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="bg-transparent text-foreground" onClick={generateFromName}>
                <RefreshCw className="mr-1.5 size-3.5" /> Generate from name
              </Button>
              <Button variant="outline" size="sm" className="bg-transparent text-foreground" onClick={clearCanvas}>
                <Trash2 className="mr-1.5 size-3.5" /> Clear
              </Button>
              {hasExisting && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto" onClick={handleRemove} disabled={saving}>
                  Remove saved
                </Button>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {saved && <p className="text-sm text-accent">Signature saved!</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" className="bg-transparent text-foreground" onClick={onClose}>Cancel</Button>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 size-4 animate-spin" />Saving…</> : <><PenLine className="mr-2 size-4" />Save Signature</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const allMainNavItems = [
  { title: "Dashboard", icon: LayoutDashboard, permission: "patients.view" },
  { title: "Front Desk", icon: ClipboardList, permission: "patients.view" },
  { title: "Patients", icon: Users, permission: "patients.view" },
  { title: "Archive", icon: Archive, permission: "archive.view" },
]

const adminNavItems = [
  { title: "Workflows", icon: GitBranch, permission: "templates.manage" },
  { title: "Manage Users", icon: UserCog, permission: "users.manage" },
  { title: "Manage Roles", icon: Shield, permission: "roles.manage" },
  { title: "Manage Care Teams", icon: UsersRound, permission: "careteam.manage" },
  { title: "System Logs", icon: ScrollText, permission: "audit.view" },
  { title: "Settings", icon: Settings, permission: "roles.manage" },
]

const supportNavItems = [
  { title: "Help & Support", icon: HelpCircle },
  { title: "HIPAA Compliance Guidelines", icon: ShieldCheck },
]

const roleDisplayNames: Record<string, string> = {
  psychiatrist: "Psychiatrist",
  technician: "Technician",
  admin: "Administrator",
}

function getInitials(fullName: string | null, username: string): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return username.slice(0, 2).toUpperCase()
}

interface AppSidebarProps {
  activeItem: string
  onNavigate: (item: string) => void
  onSignOut: () => void
  userRole: UserRole
  userPermissions: string[]
  tenantName: string
  currentUser: { username: string; fullName: string | null }
}

export function AppSidebar({ activeItem, onNavigate, onSignOut, userRole, userPermissions, tenantName, currentUser }: AppSidebarProps) {
  const [sigDialogOpen, setSigDialogOpen] = useState(false)
  const [sigOpenCount, setSigOpenCount] = useState(0)
  const mainNavItems = allMainNavItems.filter((item) => userPermissions.includes(item.permission))
  const filteredAdminItems = adminNavItems.filter((item) => userPermissions.includes(item.permission))
  const showAdmin = filteredAdminItems.length > 0
  const displayName = currentUser.fullName || currentUser.username
  const initials = getInitials(currentUser.fullName, currentUser.username)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="hover:bg-sidebar-accent">
              {/* Replace logo.png in /public with your logo file */}
              <Image src="/logo.png" alt="Aeglero" width={32} height={32} className="object-contain rounded-lg shrink-0" />
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold text-sidebar-primary-foreground">Aeglero</span>
                <span className="text-xs text-sidebar-foreground/60">{tenantName || "Detox & Behavioral Health"}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-[10px] tracking-wider font-semibold">
            Main Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={activeItem === item.title}
                    onClick={() => onNavigate(item.title)}
                    tooltip={item.title}
                    className="transition-colors"
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-[10px] tracking-wider font-semibold">
                <ShieldCheck className="mr-1 size-3" />
                Admin
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredAdminItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={activeItem === item.title}
                        onClick={() => onNavigate(item.title)}
                        tooltip={item.title}
                        className="transition-colors"
                      >
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-[10px] tracking-wider font-semibold">
            Support
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {supportNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={activeItem === item.title}
                    onClick={() => onNavigate(item.title)}
                    tooltip={item.title}
                    className="transition-colors"
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="hover:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground rounded-lg text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 leading-none text-left">
                    <span className="text-sm font-medium text-sidebar-primary-foreground">{displayName}</span>
                    <span className="text-xs text-sidebar-foreground/60">{roleDisplayNames[userRole]}</span>
                  </div>
                  <ChevronDown className="ml-auto size-4 text-sidebar-foreground/50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem onClick={() => { setSigDialogOpen(true); setSigOpenCount((c: number) => c + 1) }}>
                  <PenLine className="mr-2 size-4" />
                  My Signature
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onSignOut}>
                  <LogOut className="mr-2 size-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SignatureDialog
        key={sigOpenCount}
        open={sigDialogOpen}
        onClose={() => setSigDialogOpen(false)}
        displayName={displayName}
      />
    </Sidebar>
  )
}
