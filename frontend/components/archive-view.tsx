"use client"

import { useState } from "react"
import { Search, Loader2, Archive, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { searchArchive } from "@/lib/api"
import type { Patient } from "@/lib/api"
import { PatientProfileView } from "@/components/patients-view"

const statusColors: Record<string, string> = {
  inactive: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  archived: "bg-muted text-muted-foreground border-border",
}

export function ArchiveView({ userRole }: { userRole?: string }) {
  const [query, setQuery] = useState("")
  const [ssn, setSsn] = useState("")
  const [results, setResults] = useState<Patient[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [searched, setSearched] = useState(false)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!query.trim() && !ssn.trim()) {
      setError("Enter a name, patient code, or SSN last 4 to search")
      return
    }
    setLoading(true)
    setError("")
    setSearched(true)
    try {
      const data = await searchArchive({
        q: query.trim() || undefined,
        ssn: ssn.trim() || undefined,
      })
      setResults(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed")
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch()
  }

  if (selectedPatientId) {
    return (
      <PatientProfileView
        patientId={selectedPatientId}
        onBack={() => setSelectedPatientId(null)}
        userRole={userRole}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Archive</h1>
        <p className="text-sm text-muted-foreground">Look up discharged and archived patient records</p>
      </div>

      {/* Search */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            Patient Search
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Name or Patient Code</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="John Doe or PT-009"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>SSN Last 4</Label>
              <Input
                value={ssn}
                onChange={(e) => setSsn(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="1234"
                maxLength={4}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={handleSearch} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Search Records
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {searched && !loading && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
              <Archive className="size-4 text-muted-foreground" />
              Results
              {results && (
                <Badge variant="secondary" className="ml-1 text-xs">{results.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!results || results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <UserX className="size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No records found</p>
                <p className="text-xs text-muted-foreground/60">Try a different name, patient code, or SSN</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatientId(p.id)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors text-left w-full"
                  >
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
                        {p.firstName[0]}{p.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">{p.firstName} {p.lastName}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.id} &middot; {p.dischargedAt ? `Discharged ${new Date(p.dischargedAt).toLocaleDateString()}` : "No discharge date"}
                      </p>
                    </div>
                    <Badge variant="secondary" className={`text-xs shrink-0 capitalize ${statusColors[p.status] || ""}`}>
                      {p.status}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
