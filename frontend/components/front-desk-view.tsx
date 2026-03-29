"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Plus, Loader2, UserPlus, ClipboardList, BedDouble, Camera, X, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getPatients, createPatient, checkDuplicatePatient, getBeds, assignBed, updateBed, listCareTeams } from "@/lib/api"
import type { Patient, Bed, CareTeam, DuplicateMatch } from "@/lib/api"
import { PatientProfileView } from "@/components/patients-view"
import { ManageBedsView } from "@/components/manage-beds-view"

const bedStatusConfig: Record<string, { label: string; border: string; bg: string; dot: string }> = {
  occupied:       { label: "Occupied",       border: "border-primary/40",     bg: "bg-primary/5",     dot: "bg-primary" },
  available:      { label: "Available",      border: "border-green-500/40",   bg: "bg-green-500/5",   dot: "bg-green-500" },
  cleaning:       { label: "Cleaning",       border: "border-chart-4/40",     bg: "bg-chart-4/5",     dot: "bg-chart-4" },
}

const EMPTY_FORM = {
  firstName: "", lastName: "", dateOfBirth: "", ssnLast4: "",
  gender: "", pronouns: "", maritalStatus: "", ethnicity: "",
  preferredLanguage: "", employmentStatus: "",
  phone: "", email: "",
  addressStreet: "", addressCity: "", addressState: "", addressZip: "",
  emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelationship: "",
  primaryDiagnosis: "", insurance: "",
  referringProvider: "", primaryCarePhysician: "", pharmacy: "",
  currentMedications: "", allergies: "",
}

type FormData = typeof EMPTY_FORM

function daysSince(isoDate: string | null): string {
  if (!isoDate) return ""
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000)
  return diff === 0 ? "Today" : `Day ${diff + 1}`
}

function groupBedsByUnit(unitBeds: Bed[]): [string, Bed[]][] {
  const map = new Map<string, Bed[]>()
  for (const bed of unitBeds) {
    const key = bed.unit || "Unassigned"
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(bed)
  }
  return Array.from(map.entries())
}

export function FrontDeskView({ userPermissions = [] }: { userPermissions?: string[] }) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [beds, setBeds] = useState<Bed[]>([])
  const [loading, setLoading] = useState(true)
  const [bedsLoading, setBedsLoading] = useState(true)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showManageBeds, setShowManageBeds] = useState(false)

  // Assign bed dialog
  const [assignDialog, setAssignDialog] = useState<{ bed: Bed } | null>(null)
  const [assignPatientCode, setAssignPatientCode] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState("")

  // Bed status change confirmation dialog
  const [statusDialog, setStatusDialog] = useState<{ bed: Bed; action: "available" | "cleaning" } | null>(null)
  const [statusChanging, setStatusChanging] = useState(false)

  // Occupied bed action dialog (cleaning or transfer)
  const [occupiedDialog, setOccupiedDialog] = useState<{ bed: Bed } | null>(null)
  const [transferTarget, setTransferTarget] = useState<number | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [transferError, setTransferError] = useState("")

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [selectedCareTeamId, setSelectedCareTeamId] = useState("")
  const [careTeams, setCareTeams] = useState<CareTeam[]>([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Duplicate detection
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([])
  const [dupChecking, setDupChecking] = useState(false)
  const [dupDismissed, setDupDismissed] = useState(false)
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkDuplicates = useCallback((fd: FormData) => {
    if (dupTimer.current) clearTimeout(dupTimer.current)
    const first = fd.firstName.trim()
    const last = fd.lastName.trim()
    if (!first || !last) { setDuplicates([]); return }
    dupTimer.current = setTimeout(async () => {
      setDupChecking(true)
      try {
        const res = await checkDuplicatePatient({
          firstName: first,
          lastName: last,
          dateOfBirth: fd.dateOfBirth || undefined,
          ssnLast4: fd.ssnLast4 || undefined,
        })
        setDuplicates(res.matches)
        setDupDismissed(false)
      } catch { setDuplicates([]) }
      finally { setDupChecking(false) }
    }, 500)
  }, [])

  const sf = (field: keyof FormData) => (e: { target: { value: string } }) => {
    const updated = { ...formData, [field]: e.target.value }
    setFormData(updated)
    if (field === "firstName" || field === "lastName" || field === "dateOfBirth" || field === "ssnLast4") {
      checkDuplicates(updated)
    }
  }

  const fetchPending = useCallback(() => {
    setLoading(true)
    getPatients()
      .then((all) => setPatients(all.filter((p) => p.status === "pending")))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const fetchBeds = useCallback(() => {
    setBedsLoading(true)
    getBeds()
      .then(setBeds)
      .catch(() => {})
      .finally(() => setBedsLoading(false))
  }, [])

  useEffect(() => {
    fetchPending()
    fetchBeds()
    listCareTeams().then(setCareTeams).catch(() => {})
  }, [fetchPending, fetchBeds])

  const resetForm = () => { setFormData(EMPTY_FORM); setSelectedCareTeamId(""); setAddError(""); setPhotoPreview(null); setDuplicates([]); setDupDismissed(false) }

  const handleAdd = async () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setAddError("First and last name are required")
      return
    }
    setAdding(true)
    setAddError("")
    try {
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(formData) as [string, string][]) {
        if (v.trim()) payload[k] = v.trim()
      }
      if (selectedCareTeamId && selectedCareTeamId !== "none") payload.careTeamId = parseInt(selectedCareTeamId)
      if (photoPreview) payload.photo = photoPreview
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

  const handleAssign = async () => {
    if (!assignDialog) return
    setAssigning(true)
    setAssignError("")
    try {
      await assignBed(assignDialog.bed.id, assignPatientCode || null)
      setAssignDialog(null)
      setAssignPatientCode("")
      fetchBeds()
    } catch (e: unknown) {
      setAssignError(e instanceof Error ? e.message : "Failed to assign bed")
    } finally {
      setAssigning(false)
    }
  }

  const handleStatusChange = async () => {
    if (!statusDialog) return
    setStatusChanging(true)
    try {
      if (statusDialog.action === "available") {
        await updateBed(statusDialog.bed.id, { status: "available" })
      } else {
        await assignBed(statusDialog.bed.id, null)
      }
      setStatusDialog(null)
      fetchBeds()
    } catch { /* ignore */ }
    finally { setStatusChanging(false) }
  }

  const handleSetToCleaning = async () => {
    if (!occupiedDialog) return
    setTransferring(true)
    try {
      await assignBed(occupiedDialog.bed.id, null)
      setOccupiedDialog(null)
      fetchBeds()
    } catch { /* ignore */ }
    finally { setTransferring(false) }
  }

  const handleTransfer = async () => {
    if (!occupiedDialog || !transferTarget) return
    const patient = occupiedDialog.bed.patient
    if (!patient) return
    setTransferring(true)
    setTransferError("")
    try {
      await assignBed(transferTarget, patient.id)
      setOccupiedDialog(null)
      fetchBeds()
    } catch (e: unknown) {
      setTransferError(e instanceof Error ? e.message : "Transfer failed")
    } finally {
      setTransferring(false)
    }
  }

  // Active (admitted) patients without a bed assigned — candidates for assignment
  const [activePatients, setActivePatients] = useState<Patient[]>([])
  useEffect(() => {
    getPatients()
      .then((all) => setActivePatients(all.filter((p) => p.status === "active" && !p.assignedBedId)))
      .catch(() => {})
  }, [beds]) // re-fetch when beds change to keep list fresh

  const occupiedCount = beds.filter((b) => b.status === "occupied").length
  const totalCount = beds.length

  if (showManageBeds) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Button variant="outline" size="sm" className="bg-transparent text-foreground" onClick={() => { setShowManageBeds(false); fetchBeds() }}>
            ← Done
          </Button>
        </div>
        <ManageBedsView />
      </div>
    )
  }

  if (selectedPatientId) {
    return (
      <PatientProfileView
        patientId={selectedPatientId}
        onBack={() => { setSelectedPatientId(null); fetchPending(); fetchBeds() }}
        userPermissions={userPermissions}
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
        {userPermissions.includes("frontdesk.patients.create") && (
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
              {patients.map((p: Patient) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPatientId(p.id)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors text-left w-full"
                >
                  <Avatar className="size-12 shrink-0">
                    {p.photo && <AvatarImage src={p.photo} alt={`${p.firstName} ${p.lastName}`} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {p.firstName[0]}{p.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-muted-foreground">{p.id} &middot; {p.insurance || "No insurance on file"}</p>
                  </div>
                  {p.createdAt && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(() => {
                        const diff = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86_400_000)
                        return diff === 0 ? "Registered today" : `Waiting ${diff} day${diff === 1 ? "" : "s"}`
                      })()}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bed Board */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
              <BedDouble className="size-4 text-muted-foreground" />
              Bed Board
              {!bedsLoading && totalCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {occupiedCount}/{totalCount} occupied
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
              {userPermissions.includes("frontdesk.beds.manage") && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowManageBeds(true)}>
                  Manage Beds
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {bedsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : beds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <BedDouble className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No beds configured</p>
              <p className="text-xs text-muted-foreground/60">Add beds in Settings → Bed Management</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groupBedsByUnit(beds).map(([unit, unitBeds]) => (
                <div key={unit}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{unit}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                    {unitBeds.map((bed) => {
                      const cfg = bedStatusConfig[bed.status] ?? bedStatusConfig.available
                      return (
                        <div
                          key={bed.id}
                          className={`relative rounded-lg border ${cfg.border} ${cfg.bg} p-3 flex flex-col gap-2 transition-colors ${
                            bed.status === "available" || bed.status === "cleaning" || bed.status === "occupied"
                              ? "cursor-pointer hover:bg-muted/40"
                              : ""
                          }`}
                          onClick={() => {
                            if (bed.status === "available") {
                              setAssignPatientCode("")
                              setAssignError("")
                              setAssignDialog({ bed })
                            } else if (bed.status === "cleaning") {
                              setStatusDialog({ bed, action: "available" })
                            } else if (bed.status === "occupied" && userPermissions.includes("frontdesk.beds.manage")) {
                              setTransferTarget(null)
                              setTransferError("")
                              setOccupiedDialog({ bed })
                            }
                          }}
                        >
                          {/* Room + bed label + status dot */}
                          {bed.room && (
                            <p className="text-[10px] text-muted-foreground/70 -mb-1">{bed.room}</p>
                          )}
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-foreground truncate">{bed.displayName}</span>
                            <span className={`shrink-0 size-2 rounded-full ${cfg.dot}`} title={cfg.label} />
                          </div>

                          {/* Status or patient info */}
                          {bed.status === "occupied" && bed.patient ? (
                            <div className="flex flex-col gap-0.5">
                              <p className="text-xs font-medium text-foreground leading-tight">
                                {bed.patient.firstName} {bed.patient.lastName}
                              </p>
                              {bed.patient.primaryDiagnosis && (
                                <p className="text-[10px] text-muted-foreground truncate">{bed.patient.primaryDiagnosis}</p>
                              )}
                              <div className="flex items-center justify-between mt-0.5">
                                <span className="text-[10px] text-muted-foreground truncate">{bed.patient.insurance || "No insurance"}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{daysSince(bed.patient.admittedAt)}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">{cfg.label}</p>
                          )}

                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Bed Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={(v) => { if (!v) { setAssignDialog(null); setAssignPatientCode(""); setAssignError("") } }}>
        <DialogContent className="sm:max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              Assign Bed — {assignDialog?.bed.displayName}
            </DialogTitle>
            <DialogDescription>
              Select an admitted patient to assign to this bed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label>Patient</Label>
              <Select value={assignPatientCode} onValueChange={setAssignPatientCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select patient…" />
                </SelectTrigger>
                <SelectContent>
                  {activePatients.length === 0 ? (
                    <SelectItem value="_none" disabled>No admitted patients</SelectItem>
                  ) : (
                    activePatients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} ({p.id})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {assignError && <p className="text-sm text-destructive">{assignError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { setAssignDialog(null); setAssignPatientCode("") }} disabled={assigning}>
                Cancel
              </Button>
              <Button onClick={handleAssign} disabled={assigning || !assignPatientCode}>
                {assigning ? <Loader2 className="size-4 animate-spin" /> : "Assign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bed Status Change Confirmation Dialog */}
      <Dialog open={!!statusDialog} onOpenChange={(v) => { if (!v) setStatusDialog(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              {statusDialog?.action === "cleaning" ? "Set Bed to Cleaning" : "Mark Bed Available"}
            </DialogTitle>
            <DialogDescription>
              {statusDialog?.action === "cleaning"
                ? `This will unassign the patient from ${statusDialog?.bed.displayName} and set the bed to cleaning.`
                : `Mark ${statusDialog?.bed.displayName} as available and ready for a new patient.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setStatusDialog(null)} disabled={statusChanging}>Cancel</Button>
            <Button onClick={handleStatusChange} disabled={statusChanging}>
              {statusChanging ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {statusDialog?.action === "cleaning" ? "Set to Cleaning" : "Mark Available"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Occupied Bed Actions Dialog */}
      <Dialog open={!!occupiedDialog} onOpenChange={(v) => { if (!v) { setOccupiedDialog(null); setTransferTarget(null); setTransferError("") } }}>
        <DialogContent className="sm:max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              {occupiedDialog?.bed.displayName} — {occupiedDialog?.bed.patient?.firstName} {occupiedDialog?.bed.patient?.lastName}
            </DialogTitle>
            <DialogDescription>
              Choose an action for this occupied bed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-1">
            {/* Transfer to another bed */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">Transfer to Another Bed</p>
              <Select value={transferTarget ? String(transferTarget) : ""} onValueChange={(v) => setTransferTarget(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination bed…" />
                </SelectTrigger>
                <SelectContent>
                  {beds.filter((b) => b.status === "available" && b.id !== occupiedDialog?.bed.id).length === 0 ? (
                    <SelectItem value="_none" disabled>No available beds</SelectItem>
                  ) : (
                    beds
                      .filter((b) => b.status === "available" && b.id !== occupiedDialog?.bed.id)
                      .map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.displayName}{b.unit ? ` (${b.unit})` : ""}
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
              {transferError && <p className="text-sm text-destructive">{transferError}</p>}
              <Button onClick={handleTransfer} disabled={transferring || !transferTarget} className="w-full">
                {transferring ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Transfer Patient
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
            </div>

            {/* Set to cleaning */}
            <Button variant="outline" onClick={handleSetToCleaning} disabled={transferring} className="w-full">
              {transferring ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Unassign &amp; Set to Cleaning
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Patient Dialog */}
      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); resetForm() } }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Register New Patient</DialogTitle>
            <DialogDescription>
              Patient will be created with <strong>pending</strong> status. Complete intake forms before admitting.
            </DialogDescription>
          </DialogHeader>

          {/* Photo Upload */}
          <div className="flex items-center gap-4 py-2">
            <div className="relative">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center overflow-hidden border border-border">
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" className="size-full object-cover" />
                ) : (
                  <Camera className="size-5 text-muted-foreground" />
                )}
              </div>
              {photoPreview && (
                <button
                  type="button"
                  className="absolute -top-1 -right-1 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  onClick={() => setPhotoPreview(null)}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground cursor-pointer hover:underline">
                {photoPreview ? "Change Photo" : "Add Photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.size > 2 * 1024 * 1024) { setAddError("Photo must be under 2 MB"); return }
                    const reader = new FileReader()
                    reader.onload = () => setPhotoPreview(reader.result as string)
                    reader.readAsDataURL(file)
                    e.target.value = ""
                  }}
                />
              </label>
              <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP — max 2 MB</p>
            </div>
          </div>

          {/* Duplicate Warning */}
          {duplicates.length > 0 && !dupDismissed && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Possible existing patient{duplicates.length > 1 ? "s" : ""} found
                  </p>
                  <div className="flex flex-col gap-1.5 mt-2">
                    {duplicates.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className="flex items-center justify-between gap-2 p-2 rounded-md bg-amber-100/60 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors text-left"
                        onClick={() => {
                          setShowAdd(false)
                          resetForm()
                          setSelectedPatientId(d.id)
                        }}
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{d.firstName} {d.lastName}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.id}
                            {d.dateOfBirth ? ` · DOB ${d.dateOfBirth}` : ""}
                            {d.ssnLast4 ? ` · SSN ••••${d.ssnLast4}` : ""}
                            {" · "}
                            {d.status === "active" ? "Currently admitted" : d.status === "inactive" ? "Previously discharged" : d.status}
                            {d.readmissionCount > 0 ? ` · ${d.readmissionCount} prior admission${d.readmissionCount > 1 ? "s" : ""}` : ""}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0">View</Badge>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-amber-700 dark:text-amber-400 hover:underline mt-2"
                    onClick={() => setDupDismissed(true)}
                  >
                    This is a different person — continue registration
                  </button>
                </div>
              </div>
            </div>
          )}
          {dupChecking && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Checking for existing records…
            </div>
          )}

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

          {/* Care Team Assignment */}
          {careTeams.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Care Team</p>
              <div className="flex flex-col gap-1.5">
                <Label>Assign to Care Team</Label>
                <Select value={selectedCareTeamId} onValueChange={setSelectedCareTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No care team (visible to all staff)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No care team (visible to all staff)</SelectItem>
                    {careTeams.map((ct) => (
                      <SelectItem key={ct.id} value={String(ct.id)}>
                        {ct.name} ({ct.members.length} members)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Assigning a care team restricts patient visibility to team members only.
                </p>
              </div>
            </div>
          )}

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
