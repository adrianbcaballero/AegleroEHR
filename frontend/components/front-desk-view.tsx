"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Loader2, UserPlus, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

const EMPTY_FORM = {
  // Basic
  firstName: "", lastName: "", dateOfBirth: "", ssnLast4: "",
  gender: "", pronouns: "", maritalStatus: "", ethnicity: "",
  preferredLanguage: "", employmentStatus: "",
  // Contact
  phone: "", email: "",
  addressStreet: "", addressCity: "", addressState: "", addressZip: "",
  // Emergency
  emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelationship: "",
  // Clinical
  primaryDiagnosis: "", insurance: "",
  referringProvider: "", primaryCarePhysician: "", pharmacy: "",
  currentMedications: "", allergies: "",
}

type FormData = typeof EMPTY_FORM

export function FrontDeskView({ userRole }: { userRole?: string }) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")

  const sf = (field: keyof FormData) => (e: { target: { value: string } }) =>
    setFormData((prev) => ({ ...prev, [field]: e.target.value }))

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
    setFormData(EMPTY_FORM)
    setAddError("")
  }

  const handleAdd = async () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setAddError("First and last name are required")
      return
    }
    setAdding(true)
    setAddError("")
    try {
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(formData)) {
        if (v.trim()) payload[k] = v.trim()
      }
      await createPatient(payload)
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
        {userRole !== "technician" && (
          <Button onClick={() => { resetForm(); setShowAdd(true) }} className="gap-2">
            <Plus className="size-4" />
            Add Patient
          </Button>
        )}
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
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Register New Patient</DialogTitle>
            <DialogDescription>
              Patient will be created with <strong>pending</strong> status. Complete intake forms before admitting.
            </DialogDescription>
          </DialogHeader>

          {/* Basic Information */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">Basic Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>First Name <span className="text-destructive">*</span></Label>
                <Input value={formData.firstName} onChange={sf("firstName")} placeholder="Jane" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Last Name <span className="text-destructive">*</span></Label>
                <Input value={formData.lastName} onChange={sf("lastName")} placeholder="Doe" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Date of Birth</Label>
                <Input type="date" value={formData.dateOfBirth} onChange={sf("dateOfBirth")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>SSN Last 4</Label>
                <Input value={formData.ssnLast4} onChange={sf("ssnLast4")} placeholder="1234" maxLength={4} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Gender</Label>
                <Input value={formData.gender} onChange={sf("gender")} placeholder="Male, Female, Non-binary…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Pronouns</Label>
                <Input value={formData.pronouns} onChange={sf("pronouns")} placeholder="he/him, she/her…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Marital Status</Label>
                <Input value={formData.maritalStatus} onChange={sf("maritalStatus")} placeholder="Single, Married…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Ethnicity</Label>
                <Input value={formData.ethnicity} onChange={sf("ethnicity")} placeholder="Hispanic, White, Black…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Preferred Language</Label>
                <Input value={formData.preferredLanguage} onChange={sf("preferredLanguage")} placeholder="English, Spanish…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Employment Status</Label>
                <Input value={formData.employmentStatus} onChange={sf("employmentStatus")} placeholder="Employed, Unemployed…" />
              </div>
            </div>
          </div>

          {/* Contact & Address */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Contact & Address</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={sf("phone")} placeholder="(512) 555-0100" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={sf("email")} placeholder="jane@example.com" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Street Address</Label>
                <Input value={formData.addressStreet} onChange={sf("addressStreet")} placeholder="123 Main St" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>City</Label>
                <Input value={formData.addressCity} onChange={sf("addressCity")} placeholder="Austin" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>State</Label>
                  <Input value={formData.addressState} onChange={sf("addressState")} placeholder="TX" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Zip</Label>
                  <Input value={formData.addressZip} onChange={sf("addressZip")} placeholder="78701" />
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Emergency Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={formData.emergencyContactName} onChange={sf("emergencyContactName")} placeholder="John Doe" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Relationship</Label>
                <Input value={formData.emergencyContactRelationship} onChange={sf("emergencyContactRelationship")} placeholder="Spouse, Parent…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Phone</Label>
                <Input value={formData.emergencyContactPhone} onChange={sf("emergencyContactPhone")} placeholder="(512) 555-0101" />
              </div>
            </div>
          </div>

          {/* Clinical */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Clinical</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Primary Diagnosis</Label>
                <Input value={formData.primaryDiagnosis} onChange={sf("primaryDiagnosis")} placeholder="F10.239, Alcohol dependence…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Insurance</Label>
                <Input value={formData.insurance} onChange={sf("insurance")} placeholder="Blue Shield, Medicaid…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Referring Provider</Label>
                <Input value={formData.referringProvider} onChange={sf("referringProvider")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Primary Care Physician</Label>
                <Input value={formData.primaryCarePhysician} onChange={sf("primaryCarePhysician")} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Pharmacy</Label>
                <Input value={formData.pharmacy} onChange={sf("pharmacy")} placeholder="CVS on 5th St…" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Current Medications</Label>
                <Textarea value={formData.currentMedications} onChange={sf("currentMedications")} placeholder="List medications…" className="min-h-[60px]" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Allergies</Label>
                <Textarea value={formData.allergies} onChange={sf("allergies")} placeholder="List known allergies…" className="min-h-[60px]" />
              </div>
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
