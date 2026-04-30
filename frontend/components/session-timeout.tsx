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
  const [expired, setExpired] = useState(false)

  const warningMs = (timeoutMinutes * 60 - warningSeconds) * 1000

  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const showWarningRef = useRef(false)
  const expiredRef = useRef(false)
  const onTimeoutRef = useRef(onTimeout)
  const hadActivityRef = useRef(false)
  const lastResetRef = useRef(Date.now())
  const lastPingRef = useRef(0)
  const broadcastRef = useRef<BroadcastChannel | null>(null)

  function broadcast(type: "extended" | "expired") {
    try {
      broadcastRef.current?.postMessage({ type })
    } catch {}
  }

  // Wraps getMe so that whenever this tab successfully extends the backend
  // session, sibling tabs are notified to reset their timers — keeps an idle
  // background tab alive as long as another tab is active.
  function pingExtend() {
    return getMe().then((data) => {
      broadcast("extended")
      return data
    })
  }

  // Keep ref in sync
  onTimeoutRef.current = onTimeout

  function clearAllTimers() {
    if (warningTimer.current) clearTimeout(warningTimer.current)
    if (logoutTimer.current) clearTimeout(logoutTimer.current)
    if (countdownInterval.current) clearInterval(countdownInterval.current)
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
  }

  // Invalidates the backend session immediately (HIPAA auto-logoff) and freezes
  // the UI behind a "Session Expired" popup. The user must acknowledge it to
  // navigate to the login screen — so they always know why they were signed out.
  // Also notifies sibling tabs so they all show the expired popup in sync.
  function expireSession(opts?: { fromBroadcast?: boolean }) {
    if (expiredRef.current) return
    expiredRef.current = true
    clearAllTimers()
    if (!opts?.fromBroadcast) {
      // Only the originating tab invalidates the backend session — siblings
      // would race each other to delete an already-deleted row.
      apiLogout().catch(() => {})
      broadcast("expired")
    }
    setSessionToken(null)
    setSecondsLeft(0)
    setExpired(true)
  }

  function dismissExpired() {
    setExpired(false)
    expiredRef.current = false
    onTimeoutRef.current()
  }

  function resetTimers(opts?: { skipPing?: boolean }) {
    clearAllTimers()
    setShowWarning(false)
    showWarningRef.current = false
    setSecondsLeft(warningSeconds)
    hadActivityRef.current = false
    lastResetRef.current = Date.now()

    // Ping backend to keep session alive whenever timers reset due to activity.
    // Throttled to once per 2 minutes to avoid excessive requests.
    // Skip when called from a cross-tab broadcast — the sibling already pinged.
    const now = Date.now()
    if (!opts?.skipPing && now - lastPingRef.current >= 2 * 60 * 1000) {
      lastPingRef.current = now
      pingExtend().catch(() => {})
    } else if (opts?.skipPing) {
      lastPingRef.current = now
    }

    // Heartbeat: ping backend every 5 min, but only if there was real
    // user activity since the last ping.  This keeps the backend session
    // alive while the user is active, and lets it expire naturally when idle.
    heartbeatTimer.current = setInterval(() => {
      if (hadActivityRef.current) {
        hadActivityRef.current = false
        pingExtend().catch(() => {})
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

      logoutTimer.current = setTimeout(() => expireSession(), warningSeconds * 1000)
    }, warningMs)
  }

  // Set up activity listeners — runs once on mount
  useEffect(() => {
    function handleActivity() {
      if (expiredRef.current) return
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
      if (expiredRef.current) return
      if (showWarningRef.current) return

      // If we've been away longer than the timeout, freeze in the expired popup
      const elapsed = Date.now() - lastResetRef.current
      if (elapsed >= timeoutMinutes * 60 * 1000) {
        expireSession()
        return
      }

      // If we're past the warning threshold, verify with backend
      if (elapsed >= warningMs) {
        pingExtend()
          .then(() => resetTimers())
          .catch(() => expireSession())
        return
      }

      // Otherwise just reset (activity happened — user woke the machine)
      resetTimers()
    }

    // Cross-tab sync via BroadcastChannel: if any tab extends or expires the
    // session, all sibling tabs follow suit. This keeps an idle background tab
    // alive while another tab is active, and shows the expired popup in all
    // tabs at once when one tab times out.
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel("aeglero-session")
      broadcastRef.current = bc
      bc.onmessage = (e: MessageEvent<{ type: "extended" | "expired" }>) => {
        if (!e.data || expiredRef.current) return
        if (e.data.type === "extended") {
          // Sibling tab extended the session — reset our timers without pinging
          // /me again. This also dismisses any local warning popup, since the
          // session is genuinely fresh for another full timeout window.
          resetTimers({ skipPing: true })
        } else if (e.data.type === "expired") {
          expireSession({ fromBroadcast: true })
        }
      }
    }

    const events = ["mousedown", "keydown", "mousemove", "scroll", "touchstart"]
    events.forEach((event) => window.addEventListener(event, handleActivity))
    document.addEventListener("visibilitychange", handleVisibility)
    resetTimers()

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity))
      document.removeEventListener("visibilitychange", handleVisibility)
      broadcastRef.current?.close()
      broadcastRef.current = null
      clearAllTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (expired) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-heading font-semibold text-foreground">Session Expired</h2>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            You were signed out due to inactivity. Please sign in again to continue.
          </p>
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={dismissExpired}
          >
            Return to Sign In
          </Button>
        </div>
      </div>
    )
  }

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
              pingExtend()
                .then(() => resetTimers())
                .catch(() => expireSession())
            }}
          >
            Continue Session
          </Button>
          <Button
            variant="outline"
            className="bg-transparent text-foreground"
            onClick={() => expireSession()}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  )
}
