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
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getAllBeds,
  createBed,
  updateBed,
  deleteBed,
} from "@/lib/api"
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

interface BedFormData {
  unit: string
  room: string
  bedLabel: string
  displayName: string
  notes: string
  sortOrder: string
  status: string
}

const EMPTY_FORM: BedFormData = {
  unit: "",
  room: "",
  bedLabel: "",
  displayName: "",
  notes: "",
  sortOrder: "0",
  status: "available",
}

export function ManageBedsView() {
  const [beds, setBeds] = useState<Bed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBed, setEditBed] = useState<Bed | null>(null)
  const [form, setForm] = useState<BedFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Bed | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const load = () => {
    setLoading(true)
    getAllBeds()
      .then(setBeds)
      .catch(() => setError("Failed to load beds"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditBed(null)
    setForm(EMPTY_FORM)
    setFormError("")
    setDialogOpen(true)
  }

  const openEdit = (bed: Bed) => {
    setEditBed(bed)
    setForm({
      unit: bed.unit || "",
      room: bed.room || "",
      bedLabel: bed.bedLabel || "",
      displayName: bed.displayName,
      notes: bed.notes || "",
      sortOrder: String(bed.sortOrder),
      status: bed.status === "occupied" ? "available" : bed.status,
    })
    setFormError("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.displayName.trim()) {
      setFormError("Display name is required.")
      return
    }
    setSaving(true)
    setFormError("")
    try {
      const payload = {
        unit: form.unit || undefined,
        room: form.room || undefined,
        bedLabel: form.bedLabel || undefined,
        displayName: form.displayName.trim(),
        notes: form.notes || undefined,
        sortOrder: parseInt(form.sortOrder) || 0,
        ...(editBed ? { status: form.status } : {}),
      }
      if (editBed) {
        await updateBed(editBed.id, payload)
      } else {
        await createBed(payload)
      }
      setDialogOpen(false)
      load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (bed: Bed) => {
    try {
      await updateBed(bed.id, { isActive: !bed.isActive })
      load()
    } catch {
      // ignore
    }
  }

  const handleDelete = async () => {
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

  const activeBeds = beds.filter((b) => b.isActive)
  const decommissionedBeds = beds.filter((b) => !b.isActive)

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Manage Beds</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure bed inventory — add, edit, or decommission beds
          </p>
        </div>
        <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 size-4" /> Add Bed
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Active beds */}
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BedDouble className="size-4 text-primary" />
            <CardTitle className="text-base font-heading font-semibold text-foreground">
              Active Beds
              <span className="ml-2 text-sm font-normal text-muted-foreground">({activeBeds.length})</span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm p-6">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : activeBeds.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">No active beds. Click "Add Bed" to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/60">
                  <TableHead className="text-xs text-muted-foreground">Display Name</TableHead>
                  <TableHead className="text-xs text-muted-foreground">Unit</TableHead>
                  <TableHead className="text-xs text-muted-foreground">Room</TableHead>
                  <TableHead className="text-xs text-muted-foreground">Bed Label</TableHead>
                  <TableHead className="text-xs text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs text-muted-foreground">Patient</TableHead>
                  <TableHead className="text-xs text-muted-foreground">Sort</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeBeds.map((bed) => (
                  <TableRow key={bed.id} className="border-border/40">
                    <TableCell className="font-medium text-sm text-foreground">{bed.displayName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{bed.unit || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{bed.room || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{bed.bedLabel || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_BADGE_CLASSES[bed.status] || ""}`}
                      >
                        {STATUS_LABELS[bed.status] || bed.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {bed.patient
                        ? `${bed.patient.firstName} ${bed.patient.lastName}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{bed.sortOrder}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(bed)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-amber-600"
                          title="Decommission"
                          onClick={() => handleToggleActive(bed)}
                        >
                          <PowerOff className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => { setDeleteError(""); setDeleteTarget(bed) }}
                          disabled={!!bed.patient}
                          title={bed.patient ? "Cannot delete — bed is occupied" : "Delete"}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Decommissioned beds */}
      {decommissionedBeds.length > 0 && (
        <Card className="border-border/60 opacity-70">
          <CardHeader>
            <div className="flex items-center gap-2">
              <PowerOff className="size-4 text-muted-foreground" />
              <CardTitle className="text-base font-heading font-semibold text-muted-foreground">
                Decommissioned
                <span className="ml-2 text-sm font-normal">({decommissionedBeds.length})</span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60">
                  <TableHead className="text-xs text-muted-foreground">Display Name</TableHead>
                  <TableHead className="text-xs text-muted-foreground">Unit</TableHead>
                  <TableHead className="text-xs text-muted-foreground">Room</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {decommissionedBeds.map((bed) => (
                  <TableRow key={bed.id} className="border-border/40">
                    <TableCell className="text-sm text-muted-foreground line-through">{bed.displayName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{bed.unit || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{bed.room || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-emerald-600"
                          title="Reactivate"
                          onClick={() => handleToggleActive(bed)}
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              {editBed ? "Edit Bed" : "Add Bed"}
            </DialogTitle>
            <DialogDescription>
              {editBed
                ? "Update the bed's details and status."
                : "Enter the details for the new bed."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label>Display Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Detox A-1"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Unit</Label>
                <Input
                  placeholder="e.g. Detox A"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Room</Label>
                <Input
                  placeholder="e.g. 101"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Bed Label</Label>
                <Input
                  placeholder="e.g. A"
                  value={form.bedLabel}
                  onChange={(e) => setForm({ ...form, bedLabel: e.target.value })}
                />
              </div>
            </div>

            {editBed && (
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="out_of_service">Out of Service</SelectItem>
                  </SelectContent>
                </Select>
                {editBed.status === "occupied" && (
                  <p className="text-xs text-muted-foreground">Bed is currently occupied — status is managed via patient assignment.</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes about this bed…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" className="bg-transparent text-foreground" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <><Loader2 className="mr-2 size-4 animate-spin" />Saving…</> : editBed ? "Save Changes" : "Add Bed"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Delete Bed</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.displayName}</span>?
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className="bg-transparent text-foreground" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <><Loader2 className="mr-2 size-4 animate-spin" />Deleting…</> : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
