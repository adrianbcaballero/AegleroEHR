"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Search,
  Shield,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  ArrowLeft,
  Globe,
  Loader2,
  LogIn,
  Activity,
  Download,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { getAuditLogs, getAuditStats, exportAuditLogs, getUsersPicker } from "@/lib/api"
import type { AuditLogEntry, AuditStats } from "@/lib/api"

type UserPickerItem = { id: number; username: string; full_name: string | null }

// Map action/status to visual styles
function getLogLevel(entry: AuditLogEntry): "success" | "error" | "warning" | "info" {
  if (entry.status === "FAILED") {
    if (entry.action === "ACCESS_401" || entry.action === "ACCESS_403") return "warning"
    if (entry.action === "ACCESS_500") return "error"
    if (entry.action === "LOGIN") return "warning"
    return "error"
  }
  return entry.action === "LOGIN" || entry.action === "LOGOUT" ? "info" : "success"
}

const levelConfig = {
  info: {
    icon: LogIn,
    color: "text-primary",
    bg: "bg-primary/10",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-chart-4",
    bg: "bg-chart-4/10",
    badgeClass: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  },
  error: {
    icon: AlertCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
  },
  success: {
    icon: CheckCircle,
    color: "text-accent",
    bg: "bg-accent/10",
    badgeClass: "bg-accent/10 text-accent border-accent/20",
  },
}

// ------- Log Detail Page -------
function LogDetailPage({
  log,
  onBack,
}: {
  log: AuditLogEntry
  onBack: () => void
}) {
  const level = getLogLevel(log)
  const config = levelConfig[level]
  const LevelIcon = config.icon

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">System Logs / #{log.id}</p>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            {log.action}
          </h1>
        </div>
        <Badge variant="secondary" className={`text-xs ${config.badgeClass}`}>
          {log.status}
        </Badge>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading font-semibold text-foreground">
            Event Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Log ID</p>
              <p className="text-sm font-medium font-mono text-foreground mt-1">#{log.id}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Timestamp</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Clock className="size-3.5 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {new Date(log.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Action</p>
              <div className="flex items-center gap-1.5 mt-1">
                <LevelIcon className={`size-3.5 ${config.color}`} />
                <p className="text-sm font-medium text-foreground">{log.action}</p>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-medium text-foreground mt-1">{log.status}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">User</p>
              <div className="flex items-center gap-1.5 mt-1">
                <User className="size-3.5 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {log.username || "Anonymous"} {log.userId ? `(ID: ${log.userId})` : ""}
                </p>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">IP Address</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Globe className="size-3.5 text-muted-foreground" />
                <p className="text-sm font-medium font-mono text-foreground">
                  {log.ipAddress || "—"}
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          {log.description && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm text-foreground">{log.description}</p>
            </div>
          )}
          <div className="p-3 bg-muted/50 rounded-lg mt-3">
            <p className="text-xs text-muted-foreground mb-1">Resource</p>
            <p className="text-sm font-mono text-foreground">{log.resource}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ------- Main System Logs View -------
export function SystemLogsView() {
  const PAGE_SIZE = 20

  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)
  const [beforeId, setBeforeId] = useState<number | undefined>(undefined)
  const [pageHistory, setPageHistory] = useState<(number | undefined)[]>([])

  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [exporting, setExporting] = useState(false)
  const [userFilter, setUserFilter] = useState<string>("")
  const [usersList, setUsersList] = useState<UserPickerItem[]>([])

  const handleExport = () => {
    setExporting(true)
    const params: { status?: string; date_from?: string; date_to?: string; user_id?: number } = {}
    if (statusFilter) params.status = statusFilter
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    if (userFilter) params.user_id = parseInt(userFilter)

    exportAuditLogs(params)
      .catch(() => {})
      .finally(() => setExporting(false))
  }

  const fetchLogs = useCallback((cursorBeforeId?: number) => {
    setLoading(true)
    setError("")

    const params: { status?: string; limit?: number; before_id?: number; date_from?: string; date_to?: string; user_id?: number } = { limit: PAGE_SIZE }
    if (statusFilter) params.status = statusFilter
    if (cursorBeforeId) params.before_id = cursorBeforeId
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    if (userFilter) params.user_id = parseInt(userFilter)

    getAuditLogs(params)
      .then((logsRes) => {
        setLogs(logsRes.items)
        setTotal(logsRes.total)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load logs"))
      .finally(() => setLoading(false))
  }, [statusFilter, dateFrom, dateTo, userFilter])

  const fetchStats = useCallback(() => {
    getAuditStats()
      .then(setStats)
      .catch(() => {})
  }, [])
  
  useEffect(() => {
    getUsersPicker().then(setUsersList).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => {
      setBeforeId(undefined)
      setPageHistory([])
      fetchLogs()
      fetchStats()
    })
  }, [fetchLogs, fetchStats])

  const handleNextPage = () => {
    if (logs.length === 0) return
    const lastId = logs[logs.length - 1].id
    setPageHistory((prev) => [...prev, beforeId])
    setBeforeId(lastId)
    fetchLogs(lastId)
  }

  const handlePrevPage = () => {
    const prev = [...pageHistory]
    const prevCursor = prev.pop()
    setPageHistory(prev)
    setBeforeId(prevCursor)
    fetchLogs(prevCursor)
  }

  const currentPage = pageHistory.length + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasNextPage = logs.length === PAGE_SIZE
  const hasPrevPage = pageHistory.length > 0

  if (selectedLog) {
    return (
      <LogDetailPage
        log={selectedLog}
        onBack={() => setSelectedLog(null)}
      />
    )
  }

  // Client-side search filter
  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      log.action.toLowerCase().includes(q) ||
      log.resource.toLowerCase().includes(q) ||
      (log.username || "").toLowerCase().includes(q) ||
      (log.ipAddress || "").toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            System Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            HIPAA audit trail — all system access events
          </p>
        </div>
        <Button
          variant="outline"
          className="border-border text-foreground bg-transparent"
          onClick={handleExport}
          disabled={exporting}
        >
          <Download className="mr-2 size-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      {/* Stats from real API */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <LogIn className="size-3.5 text-accent" />
                <p className="text-xs text-muted-foreground font-medium">Logins Today</p>
              </div>
              <p className="text-xl font-bold font-heading text-accent">{stats.total_logins_today}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="size-3.5 text-chart-4" />
                <p className="text-xs text-muted-foreground font-medium">Failed Logins</p>
              </div>
              <p className="text-xl font-bold font-heading text-chart-4">{stats.failed_logins_today}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="size-3.5 text-destructive" />
                <p className="text-xs text-muted-foreground font-medium">401 Unauth</p>
              </div>
              <p className="text-xl font-bold font-heading text-destructive">{stats.not_authenticated_today}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle className="size-3.5 text-destructive" />
                <p className="text-xs text-muted-foreground font-medium">403 Forbidden</p>
              </div>
              <p className="text-xl font-bold font-heading text-destructive">{stats.unauthorized_attempts_today}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle className="size-3.5 text-destructive" />
                <p className="text-xs text-muted-foreground font-medium">500 Errors</p>
              </div>
              <p className="text-xl font-bold font-heading text-destructive">{stats.server_errors_today}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity className="size-3.5 text-primary" />
                <p className="text-xs text-muted-foreground font-medium">Active Sessions</p>
              </div>
              <p className="text-xl font-bold font-heading text-primary">{stats.active_sessions}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by action, resource, user, or IP..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={(v) => setUserFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {usersList.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.full_name || u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              className="w-full sm:w-40"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From date"
            />
            <Input
              type="date"
              className="w-full sm:w-40"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To date"
            />
          </div>
        </CardContent>
      </Card>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="mt-3 bg-transparent text-foreground" onClick={() => fetchLogs()}>
            Retry
          </Button>
        </div>
      )}

      {/* Log Entries */}
      {!loading && !error && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">
                Audit Log ({filteredLogs.length} entries)
              </CardTitle>
              {(hasPrevPage || hasNextPage) && (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages} ({total} total)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent text-foreground h-7 text-xs"
                      onClick={handlePrevPage}
                      disabled={!hasPrevPage}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent text-foreground h-7 text-xs"
                      onClick={handleNextPage}
                      disabled={!hasNextPage}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filteredLogs.map((log) => {
                const level = getLogLevel(log)
                const config = levelConfig[level]
                const LevelIcon = config.icon

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 px-6 py-4 transition-colors hover:bg-muted/30 cursor-pointer"
                    onClick={() => setSelectedLog(log)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedLog(log)}
                  >
                    <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                      <LevelIcon className={`size-4 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{log.action}</span>
                        <Badge variant="secondary" className={`text-[10px] ${config.badgeClass}`}>
                          {log.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-0.5 leading-relaxed line-clamp-1 text-xs">
                        {log.description || log.resource}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="size-3" />
                          {log.username || "Anonymous"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                        <span className="hidden sm:flex items-center gap-1">
                          <Globe className="size-3" />
                          {log.ipAddress || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {filteredLogs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">No logs found matching your criteria.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}