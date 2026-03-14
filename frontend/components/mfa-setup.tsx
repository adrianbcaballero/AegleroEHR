"use client"

import { useState, useEffect } from "react"
import { getMfaSetup, verifyMfaSetup } from "@/lib/api"
import { ShieldCheck, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import Image from "next/image"

interface MfaSetupProps {
  onComplete: () => void
  onBack: () => void
}

export function MfaSetup({ onComplete, onBack }: MfaSetupProps) {
  const [qrCode, setQrCode] = useState("")
  const [secret, setSecret] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    getMfaSetup()
      .then((res) => {
        setQrCode(res.qrCode)
        setSecret(res.secret)
      })
      .catch(() => setError("Failed to load MFA setup"))
      .finally(() => setLoading(false))
  }, [])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return

    setVerifying(true)
    setError("")

    try {
      await verifyMfaSetup(code.trim())
      onComplete()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid code"
      setError(message)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border/60">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-center mb-2">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="size-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-lg font-heading font-semibold text-foreground text-center">
            Set Up Two-Factor Authentication
          </CardTitle>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Your organization requires MFA. Scan the QR code below with your authenticator app.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              {qrCode && (
                <div className="flex justify-center">
                  <div className="rounded-lg border border-border bg-white p-3">
                    <Image src={qrCode} alt="MFA QR Code" width={200} height={200} />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground text-center">
                  Or enter this key manually:
                </p>
                <p className="text-xs font-mono text-center text-foreground bg-muted/40 rounded px-2 py-1 select-all">
                  {secret}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="setupCode" className="text-sm font-medium text-foreground">
                  Enter the 6-digit code to verify
                </Label>
                <Input
                  id="setupCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError("") }}
                  className="h-10 text-center text-lg tracking-widest"
                  disabled={verifying}
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={verifying || code.length < 6}
              >
                {verifying ? "Verifying…" : "Enable MFA"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm text-muted-foreground"
                onClick={onBack}
              >
                Back to Sign In
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
