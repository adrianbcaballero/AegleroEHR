"use client"

import { Globe, Shield, Database, Smartphone } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function SettingsView() {
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-muted-foreground">Practice Name</Label>
              <Input defaultValue="Aeglero Mental Health Clinic" disabled className="disabled:opacity-70 disabled:cursor-not-allowed bg-muted/40" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-muted-foreground">NPI Number</Label>
              <Input defaultValue="1234567890" disabled className="disabled:opacity-70 disabled:cursor-not-allowed bg-muted/40" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-muted-foreground">Phone</Label>
              <Input defaultValue="(555) 100-2000" disabled className="disabled:opacity-70 disabled:cursor-not-allowed bg-muted/40" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-muted-foreground">Email</Label>
              <Input defaultValue="admin@aeglero.com" disabled className="disabled:opacity-70 disabled:cursor-not-allowed bg-muted/40" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-muted-foreground">Address</Label>
            <Input defaultValue="123 Wellness Blvd, Suite 200, San Francisco, CA 94102" disabled className="disabled:opacity-70 disabled:cursor-not-allowed bg-muted/40" />
          </div>
          <p className="text-xs text-muted-foreground">Contact your system administrator to update practice information.</p>
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
              <Label className="text-sm font-medium text-foreground">Session Timeout</Label>
              <Select defaultValue="30">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-foreground">Max Login Attempts</Label>
              <Select defaultValue="5">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 attempts</SelectItem>
                  <SelectItem value="5">5 attempts</SelectItem>
                  <SelectItem value="10">10 attempts</SelectItem>
                </SelectContent>
              </Select>
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
            <Switch defaultChecked />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-foreground">MFA Method</Label>
              <Select defaultValue="authenticator">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="authenticator">Authenticator App (TOTP)</SelectItem>
                  <SelectItem value="sms">SMS Code</SelectItem>
                  <SelectItem value="email">Email Code</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-foreground">Remember Device</Label>
              <Select defaultValue="30">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Never</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">Enforce MFA for Admin roles</p>
              <p className="text-xs text-muted-foreground">Admin users will always be required to use MFA regardless of global setting</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Database */}
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <CardTitle className="text-base font-heading font-semibold text-foreground">
              Data & Backup
            </CardTitle>
          </div>
          <CardDescription>Database and backup configuration</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Last Backup</p>
              <p className="text-sm font-medium text-foreground mt-1">2026-02-10 10:00 AM</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Backup Size</p>
              <p className="text-sm font-medium text-foreground mt-1">2.4 GB</p>
            </div>
          </div>
          <Button variant="outline" className="self-start bg-transparent">
            Run Manual Backup
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
