"use client"

import { useEffect, useRef, useState } from "react"
import { logout as apiLogout, setSessionToken, getMe } from "@/lib/api"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SessionTimeoutProps {
  timeoutMinutes?: number
  warningSeconds?: number
  onTimeout: () => void
}

export function SessionTimeout({
  timeoutMinutes = 15,
  warningSeconds = 60,
  onTimeout,
}: SessionTimeoutProps) {
  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(warningSeconds)

  const warningMs = (timeoutMinutes * 60 - warningSeconds) * 1000

  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const showWarningRef = useRef(false)
  const onTimeoutRef = useRef(onTimeout)
  const hadActivityRef = useRef(false)
  const lastResetRef = useRef(Date.now())

  // Keep ref in sync
  onTimeoutRef.current = onTimeout

  function clearAllTimers() {
    if (warningTimer.current) clearTimeout(warningTimer.current)
    if (logoutTimer.current) clearTimeout(logoutTimer.current)
    if (countdownInterval.current) clearInterval(countdownInterval.current)
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
  }

  function doLogout() {
    clearAllTimers()
    apiLogout().catch(() => {})
    setSessionToken(null)
    onTimeoutRef.current()
  }

  function resetTimers() {
    clearAllTimers()
    setShowWarning(false)
    showWarningRef.current = false
    setSecondsLeft(warningSeconds)
    hadActivityRef.current = false
    lastResetRef.current = Date.now()

    // Heartbeat: ping backend every 5 min, but only if there was real
    // user activity since the last ping.  This keeps the backend session
    // alive while the user is active, and lets it expire naturally when idle.
    heartbeatTimer.current = setInterval(() => {
      if (hadActivityRef.current) {
        hadActivityRef.current = false
        getMe().catch(() => {})
      }
    }, 5 * 60 * 1000)

    // Warning shows at (timeout - warningSeconds)
    warningTimer.current = setTimeout(() => {
      setShowWarning(true)
      showWarningRef.current = true
      setSecondsLeft(warningSeconds)

      countdownInterval.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) return 0
          return prev - 1
        })
      }, 1000)

      logoutTimer.current = setTimeout(() => doLogout(), warningSeconds * 1000)
    }, warningMs)
  }

  // Set up activity listeners — runs once on mount
  useEffect(() => {
    function handleActivity() {
      if (showWarningRef.current) return
      hadActivityRef.current = true

      // Only reset the full timer set if enough time has passed (throttle to
      // avoid resetting on every single mouse move — 30 second debounce)
      if (Date.now() - lastResetRef.current > 30_000) {
        resetTimers()
      }
    }

    // Handle computer sleep/hibernate: when the page becomes visible again,
    // check if the session is still valid.  JS timers freeze during sleep so
    // the warning popup may never have fired.
    function handleVisibility() {
      if (document.visibilityState !== "visible") return
      if (showWarningRef.current) return

      // If we've been away longer than the timeout, go straight to logout
      const elapsed = Date.now() - lastResetRef.current
      if (elapsed >= timeoutMinutes * 60 * 1000) {
        doLogout()
        return
      }

      // If we're past the warning threshold, verify with backend
      if (elapsed >= warningMs) {
        getMe()
          .then(() => resetTimers())
          .catch(() => doLogout())
        return
      }

      // Otherwise just reset (activity happened — user woke the machine)
      resetTimers()
    }

    const events = ["mousedown", "keydown", "mousemove", "scroll", "touchstart"]
    events.forEach((event) => window.addEventListener(event, handleActivity))
    document.addEventListener("visibilitychange", handleVisibility)
    resetTimers()

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity))
      document.removeEventListener("visibilitychange", handleVisibility)
      clearAllTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!showWarning) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-chart-4/10">
            <AlertTriangle className="size-5 text-chart-4" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-semibold text-foreground">Session Expiring</h2>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-1">
          Your session will expire due to inactivity.
        </p>
        <p className="text-2xl font-bold font-heading text-chart-4 mb-4">
          {secondsLeft}s remaining
        </p>
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              getMe()
                .then(() => resetTimers())
                .catch(() => doLogout())
            }}
          >
            Continue Session
          </Button>
          <Button
            variant="outline"
            className="bg-transparent text-foreground"
            onClick={() => doLogout()}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  )
}
