"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import { KeyRound, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { validateInvite, acceptInvite } from "@/lib/api"

// Wrap the page export in Suspense so static export can prerender it.
// useSearchParams() requires this in Next.js 13+ when output: 'export'.
export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <InviteContent />
    </Suspense>
  )
}

function InviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token") || ""

  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "expired" | "done">("loading")
  const [username, setUsername] = useState("")
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus("invalid")
      return
    }
    validateInvite(token)
      .then((data) => {
        setUsername(data.username)
        setFullName(data.full_name || "")
        setStatus("valid")
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : ""
        if (msg.includes("expired")) {
          setStatus("expired")
        } else {
          setStatus("invalid")
        }
      })
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!password || password.length < 12) {
      setError("Password must be at least 12 characters")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setSubmitting(true)
    try {
      await acceptInvite(token, password)
      setStatus("done")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to set password")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Image src="/logo.png" alt="Aeglero" width={100} height={100} className="object-contain rounded-lg mx-auto" />
          </div>
          <CardTitle className="font-heading text-xl text-foreground">
            {status === "done" ? "You're all set" : "Set Up Your Account"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Validating invite link...</p>
            </div>
          )}

          {status === "invalid" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground text-center">
                This invite link is invalid or has already been used.
                Contact your administrator for a new one.
              </p>
              <Button variant="outline" onClick={() => router.push("/")}>
                Go to Login
              </Button>
            </div>
          )}

          {status === "expired" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <AlertCircle className="h-8 w-8 text-orange-500" />
              <p className="text-sm text-muted-foreground text-center">
                This invite link has expired. Contact your administrator to send a new one.
              </p>
              <Button variant="outline" onClick={() => router.push("/")}>
                Go to Login
              </Button>
            </div>
          )}

          {status === "done" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <p className="text-sm text-muted-foreground text-center">
                Your password has been set. You can now log in.
              </p>
              <Button onClick={() => router.push("/")}>
                Go to Login
              </Button>
            </div>
          )}

          {status === "valid" && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="rounded-md bg-muted/30 border border-border p-3 text-center">
                <p className="text-sm text-muted-foreground">Welcome,</p>
                <p className="text-base font-medium text-foreground">{fullName || username}</p>
                <p className="text-xs text-muted-foreground mt-0.5">@{username}</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">Password</Label>
                <Input
                  type="password"
                  placeholder="Choose a strong password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError("") }}
                  disabled={submitting}
                  autoFocus
                />
                <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                  <li className={password.length >= 12 ? "text-green-600" : ""}>At least 12 characters</li>
                  <li className={/[A-Z]/.test(password) ? "text-green-600" : ""}>One uppercase letter</li>
                  <li className={/[a-z]/.test(password) ? "text-green-600" : ""}>One lowercase letter</li>
                  <li className={/[0-9]/.test(password) ? "text-green-600" : ""}>One number</li>
                  <li className={/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;'/`~]/.test(password) ? "text-green-600" : ""}>One special character</li>
                </ul>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">Confirm Password</Label>
                <Input
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError("") }}
                  disabled={submitting}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting password...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Set Password & Continue
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
