"use client"

import { useState, useEffect } from "react"
import {
  BedDouble,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  PowerOff,
  Power,
  ChevronUp,
  ChevronDown,
  Check,
  X,
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getAllBeds, createBed, updateBed, deleteBed } from "@/lib/api"
import type { Bed } from "@/lib/api"

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  occupied: "Occupied",
  cleaning: "Cleaning",
  out_of_service: "Out of Service",
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  available: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  occupied: "bg-blue-500/15 text-blue-700 border-blue-200",
  cleaning: "bg-amber-500/15 text-amber-700 border-amber-200",
  out_of_service: "bg-red-500/15 text-red-700 border-red-200",
}

interface BedForm {
  bedLabel: string
  displayName: string
  room: string
  notes: string
  status: string
}

const EMPTY_BED_FORM: BedForm = {
  bedLabel: "",
  displayName: "",
  room: "",
  notes: "",
  status: "available",
}

export function ManageBedsView() {
  const [beds, setBeds] = useState<Bed[]>([])
  const [loading, setLoading] = useState(true)

  // Locally tracked unit names that have no beds yet
  const [emptyUnits, setEmptyUnits] = useState<string[]>([])

  // Inline unit rename
  const [editingUnit, setEditingUnit] = useState<{ original: string; value: string } | null>(null)
  const [renamingUnit, setRenamingUnit] = useState(false)

  // Add unit dialog
  const [addUnitOpen, setAddUnitOpen] = useState(false)
  const [newUnitName, setNewUnitName] = useState("")
  const [addUnitError, setAddUnitError] = useState("")

  // Bed add/edit dialog
  const [bedDialogOpen, setBedDialogOpen] = useState(false)
  const [bedDialogUnit, setBedDialogUnit] = useState("")
  const [editingBed, setEditingBed] = useState<Bed | null>(null)
  const [bedForm, setBedForm] = useState<BedForm>(EMPTY_BED_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  // Delete bed
  const [deleteTarget, setDeleteTarget] = useState<Bed | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const load = () => {
    setLoading(true)
    getAllBeds()
      .then(setBeds)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // ── Derived data ────────────────────────────────────────────────────────────
  const bedLabel = (b: Bed) => b.unit || "Unassigned"

  const activeBedsForUnit = (unit: string) =>
    beds.filter((b: Bed) => bedLabel(b) === unit && b.isActive).sort((a: Bed, b: Bed) => a.sortOrder - b.sortOrder)

  const decommissionedBedsForUnit = (unit: string) =>
    beds.filter((b: Bed) => bedLabel(b) === unit && !b.isActive).sort((a: Bed, b: Bed) => a.sortOrder - b.sortOrder)

  const derivedUnits = Array.from(new Set(beds.map(bedLabel)))
  const allUnits = [...derivedUnits, ...emptyUnits.filter((u: string) => !derivedUnits.includes(u))]

  // ── Unit actions ─────────────────────────────────────────────────────────────
  const handleAddUnit = () => {
    const name = newUnitName.trim()
    if (!name) { setAddUnitError("Unit name is required."); return }
    if (allUnits.includes(name)) { setAddUnitError("A unit with this name already exists."); return }
    setEmptyUnits((prev: string[]) => [...prev, name])
    setNewUnitName("")
    setAddUnitError("")
    setAddUnitOpen(false)
  }

  const handleRenameUnit = async () => {
    if (!editingUnit) return
    const newName = editingUnit.value.trim()
    if (!newName || newName === editingUnit.original) { setEditingUnit(null); return }

    // Empty unit — just update local state
    if (emptyUnits.includes(editingUnit.original)) {
      setEmptyUnits((prev: string[]) => prev.map((u: string) => (u === editingUnit.original ? newName : u)))
      setEditingUnit(null)
      return
    }

    // Rename all beds in this unit
    setRenamingUnit(true)
    const unitBeds = beds.filter((b: Bed) => bedLabel(b) === editingUnit.original)
    try {
      await Promise.all(unitBeds.map((b: Bed) => updateBed(b.id, { unit: newName })))
      setEditingUnit(null)
      load()
    } catch {
      setEditingUnit(null)
    } finally {
      setRenamingUnit(false)
    }
  }

  // ── Bed order ────────────────────────────────────────────────────────────────
  const moveBed = async (unit: string, bedId: number, direction: "up" | "down") => {
    const unitBeds = activeBedsForUnit(unit)
    const idx = unitBeds.findIndex((b: Bed) => b.id === bedId)
    if (idx === -1) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= unitBeds.length) return
    const a = unitBeds[idx]
    const b = unitBeds[swapIdx]
    await Promise.all([
      updateBed(a.id, { sortOrder: b.sortOrder }),
      updateBed(b.id, { sortOrder: a.sortOrder }),
    ])
    load()
  }

  // ── Bed CRUD ─────────────────────────────────────────────────────────────────
  const openAddBed = (unit: string) => {
    setEditingBed(null)
    setBedDialogUnit(unit)
    setBedForm(EMPTY_BED_FORM)
    setFormError("")
    setBedDialogOpen(true)
  }

  const openEditBed = (bed: Bed) => {
    setEditingBed(bed)
    setBedDialogUnit(bedLabel(bed))
    setBedForm({
      bedLabel: bed.bedLabel || "",
      displayName: bed.displayName,
      room: bed.room || "",
      notes: bed.notes || "",
      status: bed.status === "occupied" ? "available" : bed.status,
    })
    setFormError("")
    setBedDialogOpen(true)
  }

  const handleSaveBed = async () => {
    if (!bedForm.displayName.trim()) { setFormError("Display name is required."); return }
    setSaving(true)
    setFormError("")
    try {
      const unit = bedDialogUnit === "Unassigned" ? undefined : bedDialogUnit
      const nextSort = activeBedsForUnit(bedDialogUnit).length
      const payload = {
        unit,
        room: bedForm.room || undefined,
        bedLabel: bedForm.bedLabel || undefined,
        displayName: bedForm.displayName.trim(),
        notes: bedForm.notes || undefined,
        ...(editingBed
          ? { status: bedForm.status }
          : { sortOrder: nextSort }),
      }
      if (editingBed) {
        await updateBed(editingBed.id, payload)
      } else {
        await createBed(payload)
        // Remove from emptyUnits once first bed is added
        setEmptyUnits((prev: string[]) => prev.filter((u: string) => u !== bedDialogUnit))
      }
      setBedDialogOpen(false)
      load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (bed: Bed) => {
    await updateBed(bed.id, { isActive: !bed.isActive })
    load()
  }

  const handleDeleteBed = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError("")
    try {
      await deleteBed(deleteTarget.id)
      setDeleteTarget(null)
      load()
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-10">
        <Loader2 className="size-4 animate-spin" /> Loading...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Manage Beds</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure bed inventory by unit</p>
        </div>
        <Button
          variant="outline"
          className="bg-transparent text-foreground gap-2"
          onClick={() => { setNewUnitName(""); setAddUnitError(""); setAddUnitOpen(true) }}
        >
          <Plus className="size-4" /> Add Unit
        </Button>
      </div>

      {/* Empty state */}
      {allUnits.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center border-2 border-dashed border-border rounded-xl">
          <BedDouble className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No units configured. Click &ldquo;Add Unit&rdquo; to get started.
          </p>
        </div>
      )}

      {/* Unit cards */}
      {allUnits.map((unit) => {
        const activeBeds = activeBedsForUnit(unit)
        const decommissioned = decommissionedBedsForUnit(unit)
        const isEmptyUnit = emptyUnits.includes(unit) && activeBeds.length === 0 && decommissioned.length === 0
        const isEditing = editingUnit?.original === unit

        return (
          <Card key={unit} className="border-border/60">
            <CardHeader className="pb-3 pt-4 px-5">
              <div className="flex items-center justify-between gap-2">
                {/* Unit name (inline editable) */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <BedDouble className="size-4 text-muted-foreground shrink-0" />
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <Input
                        autoFocus
                        value={editingUnit.value}
                        onChange={(e) => setEditingUnit({ ...editingUnit, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameUnit()
                          if (e.key === "Escape") setEditingUnit(null)
                        }}
                        className="h-7 text-sm font-semibold max-w-xs"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-emerald-600 hover:text-emerald-700"
                        onClick={handleRenameUnit}
                        disabled={renamingUnit}
                      >
                        {renamingUnit ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground"
                        onClick={() => setEditingUnit(null)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <button
                        className="text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-text truncate"
                        onClick={() => setEditingUnit({ original: unit, value: unit })}
                        title="Click to rename"
                      >
                        {unit}
                      </button>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {activeBeds.length} bed{activeBeds.length !== 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                </div>

                {/* Header actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isEmptyUnit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      title="Delete unit"
                      onClick={() => setEmptyUnits((prev: string[]) => prev.filter((u: string) => u !== unit))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => openAddBed(unit)}
                  >
                    <Plus className="size-3.5 mr-1" /> Add Bed
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-5 pb-4">
              {activeBeds.length === 0 && decommissioned.length === 0 ? (
                <div className="flex items-center justify-center py-6 border border-dashed border-border rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    No beds yet. Click &ldquo;Add Bed&rdquo; to add one.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {/* Active beds */}
                  {activeBeds.map((bed: Bed, idx: number) => (
                    <div
                      key={bed.id}
                      className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-muted/40 transition-colors group"
                    >
                      {/* Reorder arrows */}
                      <div className="flex flex-col shrink-0">
                        <button
                          className="text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed"
                          onClick={() => moveBed(unit, bed.id, "up")}
                          disabled={idx === 0}
                        >
                          <ChevronUp className="size-3.5" />
                        </button>
                        <button
                          className="text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed"
                          onClick={() => moveBed(unit, bed.id, "down")}
                          disabled={idx === activeBeds.length - 1}
                        >
                          <ChevronDown className="size-3.5" />
                        </button>
                      </div>

                      {/* Bed info */}
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {bed.room && (
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">{bed.room}</span>
                        )}
                        <span className="text-sm font-medium text-foreground truncate">{bed.displayName}</span>
                        {bed.bedLabel && (
                          <span className="text-xs text-muted-foreground shrink-0">{bed.bedLabel}</span>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-xs shrink-0 ${STATUS_BADGE_CLASSES[bed.status] || ""}`}
                        >
                          {STATUS_LABELS[bed.status] || bed.status}
                        </Badge>
                        {bed.patient && (
                          <span className="text-xs text-muted-foreground truncate">
                            {bed.patient.firstName} {bed.patient.lastName}
                          </span>
                        )}
                      </div>

                      {/* Row actions (reveal on hover) */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditBed(bed)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-amber-600"
                          title="Decommission"
                          onClick={() => toggleActive(bed)}
                        >
                          <PowerOff className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          disabled={!!bed.patient}
                          title={bed.patient ? "Cannot delete — bed is occupied" : "Delete"}
                          onClick={() => { setDeleteError(""); setDeleteTarget(bed) }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Decommissioned beds */}
                  {decommissioned.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/40">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground/50 px-2 mb-1 font-medium">
                        Decommissioned
                      </p>
                      {decommissioned.map((bed: Bed) => (
                        <div
                          key={bed.id}
                          className="flex items-center gap-2 py-1.5 px-2 rounded-lg opacity-50"
                        >
                          <div className="w-5 shrink-0" />
                          <span className="text-sm text-muted-foreground line-through flex-1 truncate">
                            {bed.displayName}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-emerald-600"
                              title="Reactivate"
                              onClick={() => toggleActive(bed)}
                            >
                              <Power className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => { setDeleteError(""); setDeleteTarget(bed) }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* ── Add Unit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={addUnitOpen} onOpenChange={(v) => { if (!v) setAddUnitOpen(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Add Unit</DialogTitle>
            <DialogDescription>Enter a name for the new unit.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label>Unit Name</Label>
              <Input
                autoFocus
                placeholder="e.g. Detox Unit A"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddUnit() }}
              />
              {addUnitError && <p className="text-xs text-destructive">{addUnitError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="bg-transparent text-foreground" onClick={() => setAddUnitOpen(false)}>
                Cancel
              </Button>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleAddUnit}>
                Add Unit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Bed Dialog ───────────────────────────────────────────── */}
      <Dialog open={bedDialogOpen} onOpenChange={(v) => { if (!v) setBedDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              {editingBed ? "Edit Bed" : `Add Bed — ${bedDialogUnit}`}
            </DialogTitle>
            <DialogDescription>
              {editingBed ? "Update bed details and status." : "Fill in the details for the new bed."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label>
                Display Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Detox A-1"
                value={bedForm.displayName}
                onChange={(e) => setBedForm({ ...bedForm, displayName: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Bed Label</Label>
                <Input
                  placeholder="e.g. A"
                  value={bedForm.bedLabel}
                  onChange={(e) => setBedForm({ ...bedForm, bedLabel: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Room</Label>
                <Input
                  placeholder="e.g. 101"
                  value={bedForm.room}
                  onChange={(e) => setBedForm({ ...bedForm, room: e.target.value })}
                />
              </div>
            </div>

            {editingBed && (
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Select value={bedForm.status} onValueChange={(v) => setBedForm({ ...bedForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="out_of_service">Out of Service</SelectItem>
                  </SelectContent>
                </Select>
                {editingBed.status === "occupied" && (
                  <p className="text-xs text-muted-foreground">
                    Bed is occupied — status is managed via patient assignment.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes about this bed..."
                value={bedForm.notes}
                onChange={(e) => setBedForm({ ...bedForm, notes: e.target.value })}
                rows={2}
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" className="bg-transparent text-foreground" onClick={() => setBedDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSaveBed}
                disabled={saving}
              >
                {saving
                  ? <><Loader2 className="mr-2 size-4 animate-spin" />Saving...</>
                  : editingBed ? "Save Changes" : "Add Bed"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Delete Bed</DialogTitle>
            <DialogDescription>
              Permanently delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.displayName}</span>?
              {" "}This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className="bg-transparent text-foreground" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteBed} disabled={deleting}>
              {deleting ? <><Loader2 className="mr-2 size-4 animate-spin" />Deleting...</> : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
