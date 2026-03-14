"use client"

import { useState, useEffect } from "react"
import { Globe, Shield, Smartphone, Loader2, Lock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { getTenant, toggleTenantMfa } from "@/lib/api"
import type { TenantInfo } from "@/lib/api"

export function SettingsView() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTenant()
      .then(setTenant)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your practice and system configuration
        </p>
      </div>

      {/* Practice Info */}
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            <CardTitle className="text-base font-heading font-semibold text-foreground">
              Practice Information
            </CardTitle>
          </div>
          <CardDescription>General details about your practice (read-only)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-muted-foreground">Practice Name</Label>
                  <Input value={tenant?.name || "—"} readOnly disabled className="disabled:opacity-70 disabled:cursor-not-allowed bg-muted/40" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-muted-foreground">NPI Number</Label>
                  <Input value={tenant?.npi || "—"} readOnly disabled className="disabled:opacity-70 disabled:cursor-not-allowed bg-muted/40" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-muted-foreground">Phone</Label>
                  <Input value={tenant?.phone || "—"} readOnly disabled className="disabled:opacity-70 disabled:cursor-not-allowed bg-muted/40" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                  <Input value={tenant?.email || "—"} readOnly disabled className="disabled:opacity-70 disabled:cursor-not-allowed bg-muted/40" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-muted-foreground">Address</Label>
                <Input value={tenant?.address || "—"} readOnly disabled className="disabled:opacity-70 disabled:cursor-not-allowed bg-muted/40" />
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            To update practice information, contact{" "}
            <a href="mailto:ticket@aeglero.com" className="underline hover:text-foreground transition-colors">ticket@aeglero.com</a>.
          </p>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <CardTitle className="text-base font-heading font-semibold text-foreground">
              Security
            </CardTitle>
          </div>
          <CardDescription>Authentication and access control settings</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-muted-foreground">Session Timeout</Label>
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border bg-muted/40">
                <Lock className="size-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground">15 minutes</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-muted-foreground">Max Login Attempts</Label>
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border bg-muted/40">
                <Lock className="size-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground">5 attempts</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MFA */}
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="size-4 text-primary" />
            <CardTitle className="text-base font-heading font-semibold text-foreground">
              Multi-Factor Authentication (MFA)
            </CardTitle>
          </div>
          <CardDescription>Add an extra layer of security to user accounts</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">Require MFA for all users</p>
              <p className="text-xs text-muted-foreground">When enabled, all users must set up MFA on their next login</p>
            </div>
            <Switch
              checked={tenant?.mfaRequired ?? false}
              onCheckedChange={(checked) => {
                toggleTenantMfa(checked)
                  .then((res) => setTenant((prev) => prev ? { ...prev, mfaRequired: res.mfaRequired } : prev))
                  .catch(() => {})
              }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-muted-foreground">MFA Method</Label>
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border bg-muted/40">
                <Lock className="size-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground">Authenticator App (TOTP)</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-muted-foreground">
                Remember Device
                <span className="ml-2 text-xs font-normal text-muted-foreground/60">Coming soon</span>
              </Label>
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border bg-muted/40 opacity-50">
                <Lock className="size-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Not available</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20 opacity-50">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Enforce MFA for Admin roles
                <span className="ml-2 text-xs font-normal text-muted-foreground/60">Coming soon</span>
              </p>
              <p className="text-xs text-muted-foreground">Admin users will always be required to use MFA regardless of global setting</p>
            </div>
            <Switch disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
