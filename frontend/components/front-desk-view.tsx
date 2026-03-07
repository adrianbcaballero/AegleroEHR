"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Loader2, UserPlus, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { getPatients, createPatient } from "@/lib/api"
import type { Patient } from "@/lib/api"
import { PatientProfileView } from "@/components/patients-view"

const riskColors: Record<string, string> = {
  low: "bg-accent/10 text-accent border-accent/20",
  moderate: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  high: "bg-destructive/10 text-destructive border-destructive/20",
}

export function FrontDeskView({ userRole }: { userRole?: string }) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  // Add patient form state
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [dob, setDob] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [insurance, setInsurance] = useState("")
  const [ssnLast4, setSsnLast4] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")

  const fetchPending = useCallback(() => {
    setLoading(true)
    getPatients()
      .then((all) => setPatients(all.filter((p) => p.status === "pending")))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const resetForm = () => {
    setFirstName(""); setLastName(""); setDob(""); setPhone("")
    setEmail(""); setInsurance(""); setSsnLast4(""); setAddError("")
  }

  const handleAdd = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setAddError("First and last name are required")
      return
    }
    setAdding(true)
    setAddError("")
    try {
      await createPatient({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dob || undefined,
        phone: phone || undefined,
        email: email || undefined,
        insurance: insurance || undefined,
        ssnLast4: ssnLast4 || undefined,
      })
      setShowAdd(false)
      resetForm()
      fetchPending()
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Failed to create patient")
    } finally {
      setAdding(false)
    }
  }

  if (selectedPatientId) {
    return (
      <PatientProfileView
        patientId={selectedPatientId}
        onBack={() => { setSelectedPatientId(null); fetchPending() }}
        userRole={userRole}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Front Desk</h1>
          <p className="text-sm text-muted-foreground">Manage incoming patients and pre-admission intake</p>
        </div>
        <Button onClick={() => { resetForm(); setShowAdd(true) }} className="gap-2">
          <Plus className="size-4" />
          Add Patient
        </Button>
      </div>

      {/* Pending patients */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="size-4 text-muted-foreground" />
            Pending Admission
            {!loading && (
              <Badge variant="secondary" className="ml-1 text-xs">{patients.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : patients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <UserPlus className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No patients pending admission</p>
              <p className="text-xs text-muted-foreground/60">New patients will appear here after registration</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {patients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPatientId(p.id)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors text-left w-full"
                >
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {p.firstName[0]}{p.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-muted-foreground">{p.id} &middot; {p.insurance || "No insurance on file"}</p>
                  </div>
                  <Badge variant="secondary" className={`text-xs shrink-0 ${riskColors[p.riskLevel] || ""}`}>
                    {p.riskLevel} risk
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Patient Dialog */}
      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); resetForm() } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Register New Patient</DialogTitle>
            <DialogDescription>
              Patient will be created with <strong>pending</strong> status. Complete intake forms before admitting.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>First Name <span className="text-destructive">*</span></Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Last Name <span className="text-destructive">*</span></Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>SSN Last 4</Label>
              <Input value={ssnLast4} onChange={(e) => setSsnLast4(e.target.value)} placeholder="1234" maxLength={4} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(512) 555-0100" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Insurance</Label>
              <Input value={insurance} onChange={(e) => setInsurance(e.target.value)} placeholder="Blue Shield, Medicaid…" />
            </div>
          </div>
          {addError && <p className="text-sm text-destructive">{addError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => { setShowAdd(false); resetForm() }} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="size-4 animate-spin" /> : "Register Patient"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
