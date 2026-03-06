"use client"

import React, { useEffect, useState } from "react"
import { getHealth, login as apiLogin } from "@/lib/api"
import type { LoginResponse } from "@/lib/api"

import { LogIn, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export type UserRole = "psychiatrist" | "technician" | "admin"

const demoAccounts: { username: string; password: string; role: UserRole; label: string }[] = [
  { username: "psychiatrist1", password: "Password123!", role: "psychiatrist", label: "Psychiatrist" },
  { username: "technician1",   password: "Password123!", role: "technician",   label: "Technician" },
  { username: "admin1",        password: "Password123!", role: "admin",        label: "Admin" },
]

interface LoginPageProps {
  onLogin: (role: UserRole, session: LoginResponse) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    getHealth()
      .then(() => { if (!cancelled) setBackendOk(true) })
      .catch(() => { if (!cancelled) setBackendOk(false) })
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError("Username and password are required")
      return
    }

    setLoading(true)
    setError("")

    try {
      const res = await apiLogin(username.trim(), password)
      onLogin(res.role as UserRole, res)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen bg-background">
      {/* Demo accounts panel — top-left, collapsed by default */}
      <div className="fixed top-4 left-4 z-50 w-72">
        <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setNotesExpanded(!notesExpanded)}
            className="flex items-center justify-between w-full p-3 bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <span className="text-xs font-semibold text-foreground tracking-wide">Demo Sign Ins</span>
            {notesExpanded
              ? <ChevronUp className="size-3.5 text-muted-foreground" />
              : <ChevronDown className="size-3.5 text-muted-foreground" />}
          </button>

          {notesExpanded && (
            <div className="p-3 flex flex-col gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => {
                    setUsername(account.username)
                    setPassword(account.password)
                    setError("")
                  }}
                  className="flex items-center justify-between p-2.5 rounded-md border border-border bg-card hover:bg-muted/50 transition-colors text-left cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{account.label}</p>
                    <p className="text-xs text-muted-foreground">{account.username} / {account.password}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main login form */}
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="flex items-center gap-3 mb-8">
          <img src="/logo.png" alt="Aeglero" className="size-12 object-contain rounded-lg" />
          <div>
            <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Aeglero EHR</h1>
            <p className="text-xs text-muted-foreground">Detox &amp; Behavioral Health</p>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-center">
          <div className="text-xs px-2 py-1 rounded-md border border-border bg-card">
            Backend:{" "}
            {backendOk === null
              ? <span className="text-muted-foreground">checking…</span>
              : backendOk
                ? <span className="font-medium">connected</span>
                : <span className="font-medium">disconnected</span>}
          </div>
        </div>

        <Card className="w-full max-w-sm border-border/60">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-heading font-semibold text-foreground text-center">
              Sign In
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="username" className="text-sm font-medium text-foreground">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError("") }}
                  className="h-10"
                  disabled={loading}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError("") }}
                  className="h-10"
                  disabled={loading}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={loading}
              >
                <LogIn className="mr-2 size-4" />
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
