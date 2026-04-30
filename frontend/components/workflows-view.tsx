"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  GitBranch,
  Search,
  ArrowLeft,
  Clock,
  ChevronRight,
  Plus,
  Loader2,
  Shield,
  Pencil,
  ChevronUp,
  ChevronDown,
  X,
  Settings2,
  Trash2,
  Archive,
  Eye,
  PenLine,
  GripVertical,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, getCategories, updateCategories, deleteCategory, renameCategory, getRolesPicker } from "@/lib/api"
import type { FormTemplate, TemplateField, RoleAccess, DeleteCategoryError } from "@/lib/api"

type AccessLevel = "none" | "view" | "edit" | "sign"

const ACCESS_LEVEL_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "none", label: "No Access" },
  { value: "view", label: "View + Print" },
  { value: "edit", label: "View + Edit + Save" },
  { value: "sign", label: "Full (View + Edit + Save + Sign + Print)" },
]

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Yes/No" },
  { value: "checkbox_group", label: "Check All That Apply" },
  { value: "select", label: "Dropdown" },
  { value: "scale", label: "Scale" },
  { value: "multi_select", label: "Multi-Select Dropdown" },
  { value: "time", label: "Time" },
  { value: "matrix", label: "Matrix / Grid" },
  { value: "signature", label: "Signature" },
  { value: "patient_data", label: "Patient Data" },
  { value: "section", label: "Section Break" },
  { value: "title", label: "Title" },
]

const PATIENT_PROPERTIES = [
  { value: "dateOfBirth", label: "Date of Birth" },
  { value: "age", label: "Age" },
  { value: "gender", label: "Gender" },
  { value: "maritalStatus", label: "Marital Status" },
  { value: "insurance", label: "Insurance" },
  { value: "currentLoc", label: "Level of Care" },
  { value: "primaryDiagnosis", label: "Primary Diagnosis" },
  { value: "careTeamName", label: "Care Team" },
  { value: "assignedProvider", label: "Assigned Provider" },
  { value: "admittedAt", label: "Admission Date" },
  { value: "status", label: "Patient Status" },
  { value: "currentMedications", label: "Current Medications" },
  { value: "allergies", label: "Allergies" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "emergencyContactName", label: "Emergency Contact" },
  { value: "emergencyContactPhone", label: "Emergency Contact Phone" },
  { value: "preferredLanguage", label: "Preferred Language" },
  { value: "ethnicity", label: "Ethnicity" },
  { value: "referringProvider", label: "Referring Provider" },
  { value: "primaryCarePhysician", label: "Primary Care Physician" },
  { value: "pharmacy", label: "Pharmacy" },
]

const DEFAULT_CATEGORIES = ["intake", "assessment", "flowsheet", "consent", "insurance", "clinical", "discharge"]

// ------- Template Editor Dialog (create + edit) -------
function TemplateEditorDialog({
  existing,
  onSaved,
  trigger,
  existingCategories = [],
}: {
  existing?: FormTemplate
  onSaved: (createdId?: number) => void
  trigger: React.ReactNode
  existingCategories?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  const [fields, setFields] = useState<TemplateField[]>([{ label: "", type: "text", fieldId: crypto.randomUUID().replace(/-/g, "").slice(0, 12) }])
  const [roleAccess, setRoleAccess] = useState<Record<number, AccessLevel>>({})
  const [availableRoles, setAvailableRoles] = useState<{ id: number; name: string; displayName: string }[]>([])
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceValue, setRecurrenceValue] = useState("8")
  const [recurrenceUnit, setRecurrenceUnit] = useState("hours")
  const [requiredForAdmission, setRequiredForAdmission] = useState(false)
  const [requiredForDischarge, setRequiredForDischarge] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [previewing, setPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (open) {
      getRolesPicker().then(setAvailableRoles).catch(() => {})
    }
  }, [open])

  useEffect(() => {
    if (open && availableRoles.length > 0) {
      Promise.resolve().then(() => {
        if (existing) {
          // Build access map from existing roleAccess, default unset roles to "none"
          const map: Record<number, AccessLevel> = {}
          availableRoles.forEach((r: { id: number; name: string; displayName: string }) => { map[r.id] = "none" })
          ;(existing.roleAccess || []).forEach((ra: RoleAccess) => {
            map[ra.roleId] = ra.accessLevel as AccessLevel
          })
          setRoleAccess(map)
          setName(existing.name)
          setCategory(existing.category)
          setDescription(existing.description || "")
          setFields(existing.fields.length > 0 ? existing.fields : [{ label: "", type: "text" }])
          setIsRecurring(existing.isRecurring)
          const storedHours = existing.recurrenceValue || 8
          if (storedHours % 168 === 0) {
            setRecurrenceValue(String(storedHours / 168))
            setRecurrenceUnit("weeks")
          } else if (storedHours % 24 === 0) {
            setRecurrenceValue(String(storedHours / 24))
            setRecurrenceUnit("days")
          } else {
            setRecurrenceValue(String(storedHours))
            setRecurrenceUnit("hours")
          }
          setRequiredForAdmission(existing.requiredForAdmission)
          setRequiredForDischarge(existing.requiredForDischarge)
        } else {
          // New template — default all roles to "none" (no access)
          const map: Record<number, AccessLevel> = {}
          availableRoles.forEach((r: { id: number; name: string; displayName: string }) => { map[r.id] = "none" })
          setRoleAccess(map)
        }
      })
    }
  }, [open, existing, availableRoles])

  const updateField = (index: number, key: string, value: unknown) => {
    const updated = [...fields]
    updated[index] = { ...updated[index], [key]: value }
    setFields(updated)
  }

  const removeField = (index: number) => {
    if (fields.length <= 1) return
    setFields(fields.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    if (!name.trim()) { setError("Name is required"); return }
    if (!category) { setError("Category is required"); return }
    if (existing && fields.some((f) => f.type !== "section" && !f.label.trim())) { setError("All fields need a label"); return }
    if (isRecurring && (!recurrenceValue || parseInt(recurrenceValue) < 1)) { setError("Recurring interval must be at least 1"); return }

    setLoading(true)
    setError("")

    const cleanFields = fields.map((f) => {
      const field: TemplateField = { fieldId: f.fieldId || crypto.randomUUID().replace(/-/g, "").slice(0, 12), label: f.type === "section" ? "---" : f.label.trim(), type: f.type }
      if (f.options) {
        const raw = Array.isArray(f.options) ? f.options.join(", ") : String(f.options)
        field.options = raw.split(",").map((s: string) => s.trim()).filter(Boolean)
      }
      if (f.type === "scale") { field.min = f.min ?? 0; field.max = f.max ?? 3; if (f.scaleLabels && Object.keys(f.scaleLabels).length) field.scaleLabels = f.scaleLabels }
      if (f.type === "matrix") {
        const rawRows = Array.isArray(f.matrixRows) ? f.matrixRows.join(", ") : (f.matrixRows || "")
        const rawCols = Array.isArray(f.matrixColumns) ? f.matrixColumns.join(", ") : (f.matrixColumns || "")
        const rows = (rawRows as string).split(",").map((s: string) => s.trim()).filter(Boolean)
        const cols = (rawCols as string).split(",").map((s: string) => s.trim()).filter(Boolean)
        if (rows.length) field.matrixRows = rows
        if (cols.length) field.matrixColumns = cols
      }
      if (f.placeholder?.trim()) { field.placeholder = f.placeholder.trim() }
      if (f.optional) { field.optional = true }
      if (f.labelWidth && f.labelWidth !== 100) { field.labelWidth = f.labelWidth }
      if (f.type === "checkbox_group" && f.checkboxLayout === "inline") { field.checkboxLayout = "inline" }
      if (f.type === "patient_data" && f.patientProperty) { field.patientProperty = f.patientProperty }
      return field
    })

    const hoursMap: Record<string, number> = { hours: 1, days: 24, weeks: 168 }
    const totalHours = isRecurring ? parseInt(recurrenceValue) * (hoursMap[recurrenceUnit] ?? 1) : null

    // Build roleAccess payload — exclude "none" entries (no access = not present)
    const roleAccessPayload = Object.entries(roleAccess)
      .filter(([, level]) => level !== "none")
      .map(([roleId, level]) => ({ roleId: Number(roleId), accessLevel: level as string }))

    const payload = {
      name: name.trim(),
      category,
      description: description.trim() || undefined,
      fields: existing ? cleanFields : [],
      roleAccess: roleAccessPayload,
      isRecurring,
      recurrenceValue: totalHours,
      recurrenceUnit: isRecurring ? "hours" : null,
      requiredForAdmission,
      requiredForDischarge,
    }

    const promise = existing
      ? updateTemplate(existing.id, payload)
      : createTemplate(payload)

    promise
      .then((result) => {
        setOpen(false)
        onSaved(!existing ? result.id : undefined)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to save"))
      .finally(() => setLoading(false))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">
            {existing ? "Edit Template" : "Create New Template"}
          </DialogTitle>
          <DialogDescription>
            {existing ? "Update the form template." : "Define a new form template for use across the system."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-foreground">Template Name</Label>
            <Input placeholder="e.g. Patient Follow-Up Assessment" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-foreground">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category..." />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...DEFAULT_CATEGORIES, ...existingCategories])].map((cat) => (
                  <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              To add custom categories use <span className="font-medium text-foreground">Manage Categories</span> on the Workflows page.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-foreground">Description</Label>
            <Textarea
              placeholder="Describe the purpose of this template..."
              className="min-h-[60px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Recurring Schedule */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={isRecurring} onCheckedChange={(v) => setIsRecurring(!!v)} />
              <span className="text-sm font-medium text-foreground">Recurring form</span>
            </label>
            {isRecurring && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Every</span>
                <Input
                  type="number"
                  min={1}
                  value={recurrenceValue}
                  onChange={(e) => setRecurrenceValue(e.target.value)}
                  className="w-20"
                />
                <Select value={recurrenceUnit} onValueChange={setRecurrenceUnit}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="weeks">Weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-xs text-muted-foreground pl-6">
              {isRecurring ? "A new draft will be auto-created each time the interval elapses." : "One-time form — created manually per patient."}
            </p>
          </div>

          {/* Admission / Discharge Gates */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-foreground">Completion Gates</Label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={requiredForAdmission} onCheckedChange={(v) => setRequiredForAdmission(!!v)} />
              <span className="text-sm text-foreground">Required before admission</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={requiredForDischarge} onCheckedChange={(v) => setRequiredForDischarge(!!v)} />
              <span className="text-sm text-foreground">Required before discharge</span>
            </label>
            <p className="text-xs text-muted-foreground">If checked, this form must be completed before a patient can be admitted or discharged.</p>
          </div>

          {/* Role Access Levels */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Shield className="size-3.5" /> Role Access
            </Label>
            <div className="flex flex-col gap-2">
              {availableRoles.length === 0 && (
                <p className="text-xs text-muted-foreground">Loading roles...</p>
              )}
              {availableRoles.map((role: { id: number; name: string; displayName: string }) => (
                <div key={role.id} className="flex items-center justify-between gap-3 p-2 rounded-lg border border-border bg-muted/30">
                  <span className="text-sm text-foreground">{role.displayName}</span>
                  <Select
                    value={roleAccess[role.id] ?? "none"}
                    onValueChange={(val: string) => setRoleAccess((prev: Record<number, AccessLevel>) => ({ ...prev, [role.id]: val as AccessLevel }))}
                  >
                    <SelectTrigger className="w-56 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCESS_LEVEL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Set what each role can do with forms created from this template.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent text-foreground" disabled={loading}>
              Cancel
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave} disabled={loading}>
              {loading ? "Saving…" : existing ? "Save Changes" : "Create Template"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ------- Template Detail Page -------
function TemplateDetailPage({
  templateId,
  onBack,
  onRefresh,
  userPermissions = [],
}: {
  templateId: number
  onBack: () => void
  onRefresh: () => void
  userPermissions?: string[]
}) {
  const [template, setTemplate] = useState<FormTemplate | null>(null)
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState("")
  const [editFields, setEditFields] = useState<TemplateField[]>([])
  const [fieldsDirty, setFieldsDirty] = useState(false)
  const [fieldsSaving, setFieldsSaving] = useState(false)
  const [fieldsPreviewing, setFieldsPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState<Record<string, unknown>>({})

  const fetchTemplate = useCallback(async () => {
    setLoading(true)
    Promise.all([getTemplate(templateId), getTemplates("all")])
      .then(([tmpl, all]) => {
        setTemplate(tmpl || null)
        setAllCategories([...new Set(all.map((t: FormTemplate) => t.category))])
        if (tmpl) {
          setEditFields(tmpl.fields.length > 0 ? tmpl.fields : [{ label: "", type: "text" }])
          setFieldsDirty(false)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [templateId])

  useEffect(() => {
    Promise.resolve().then(() => fetchTemplate())
  }, [templateId, fetchTemplate])

  const canManage = userPermissions.includes("workflows.manage")

  const updateEditField = (index: number, key: string, value: unknown) => {
    const updated = [...editFields]
    updated[index] = { ...updated[index], [key]: value }
    // Default layout to 10% when switching to number type
    if (key === "type" && value === "number" && !updated[index].labelWidth) {
      updated[index].labelWidth = 90
    }
    if (key === "type" && value !== "number" && updated[index].labelWidth === 90) {
      updated[index].labelWidth = undefined
    }
    setEditFields(updated)
    setFieldsDirty(true)
  }
  const removeEditField = (index: number) => {
    if (editFields.length <= 1) return
    setEditFields(editFields.filter((_, i) => i !== index))
    setFieldsDirty(true)
  }
  const addEditField = () => {
    setEditFields([...editFields, { label: "", type: "text", fieldId: crypto.randomUUID().replace(/-/g, "").slice(0, 12) }])
    setFieldsDirty(true)
  }
  const fieldDragItem = useRef<number | null>(null)
  const fieldDragOver = useRef<number | null>(null)
  const handleFieldDragStart = (idx: number) => { fieldDragItem.current = idx }
  const handleFieldDragEnter = (idx: number) => { fieldDragOver.current = idx }
  const handleFieldDragEnd = () => {
    if (fieldDragItem.current === null || fieldDragOver.current === null || fieldDragItem.current === fieldDragOver.current) {
      fieldDragItem.current = null
      fieldDragOver.current = null
      return
    }
    const next = [...editFields]
    const dragged = next.splice(fieldDragItem.current, 1)[0]
    next.splice(fieldDragOver.current, 0, dragged)
    setEditFields(next)
    setFieldsDirty(true)
    fieldDragItem.current = null
    fieldDragOver.current = null
  }
  const saveFields = async () => {
    if (!template) return
    const cleanFields = editFields.map((f) => {
      const field: TemplateField = { label: f.type === "section" ? "---" : f.label.trim(), type: f.type }
      if (f.options) {
        const raw = Array.isArray(f.options) ? f.options.join(", ") : String(f.options)
        field.options = raw.split(",").map((s: string) => s.trim()).filter(Boolean)
      }
      if (f.type === "scale") { field.min = f.min ?? 0; field.max = f.max ?? 3; if (f.scaleLabels && Object.keys(f.scaleLabels).length) field.scaleLabels = f.scaleLabels }
      if (f.type === "matrix") {
        const rawRows = Array.isArray(f.matrixRows) ? f.matrixRows.join(", ") : (f.matrixRows || "")
        const rawCols = Array.isArray(f.matrixColumns) ? f.matrixColumns.join(", ") : (f.matrixColumns || "")
        const rows = (rawRows as string).split(",").map((s: string) => s.trim()).filter(Boolean)
        const cols = (rawCols as string).split(",").map((s: string) => s.trim()).filter(Boolean)
        if (rows.length) field.matrixRows = rows
        if (cols.length) field.matrixColumns = cols
      }
      if (f.placeholder?.trim()) { field.placeholder = f.placeholder.trim() }
      if (f.optional) { field.optional = true }
      if (f.labelWidth && f.labelWidth !== 100) { field.labelWidth = f.labelWidth }
      if (f.type === "checkbox_group" && f.checkboxLayout === "inline") { field.checkboxLayout = "inline" }
      if (f.type === "patient_data" && f.patientProperty) { field.patientProperty = f.patientProperty }
      return field
    })
    setFieldsSaving(true)
    try {
      await updateTemplate(template.id, { fields: cleanFields })
      await fetchTemplate()
      onRefresh()
      setFieldsDirty(false)
    } catch { /* ignore */ }
    setFieldsSaving(false)
  }

  const handleDelete = () => {
    if (!template) return
    setDeleting(true)
    setDeleteError("")
    deleteTemplate(template.id)
      .then(() => { onRefresh(); onBack() })
      .catch((e: unknown) => setDeleteError(e instanceof Error ? e.message : "Delete failed"))
      .finally(() => setDeleting(false))
  }

  const handleArchive = () => {
    if (!template) return
    setArchiving(true)
    setArchiveError("")
    updateTemplate(template.id, { status: "archived" })
      .then(() => { onRefresh(); onBack() })
      .catch((e: unknown) => setArchiveError(e instanceof Error ? e.message : "Archive failed"))
      .finally(() => setArchiving(false))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-destructive">Template not found</p>
        <Button variant="outline" className="mt-3 bg-transparent text-foreground" onClick={onBack}>Back</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Workflows / Templates</p>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            {template.name}
          </h1>
        </div>
        <Badge variant="secondary" className="text-xs capitalize">{template.category}</Badge>
        {canManage && (
          <>
            <TemplateEditorDialog
              existing={template}
              onSaved={() => { fetchTemplate(); onRefresh() }}
              existingCategories={allCategories}
              trigger={
                <Button variant="outline" size="sm" className="bg-transparent text-foreground">
                  <Pencil className="mr-1.5 size-3.5" /> Edit Settings
                </Button>
              }
            />
            {(template.instanceCount ?? 0) > 0 ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="bg-transparent text-foreground border-border/60 hover:bg-muted/40" disabled={archiving}>
                    <Archive className="mr-1.5 size-3.5" /> Archive
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-heading text-foreground">Archive Template?</AlertDialogTitle>
                    <AlertDialogDescription>
                      <strong>{template.name}</strong> has {template.instanceCount} form instance(s) and cannot be deleted.
                      Archiving will hide it from new patient forms but preserve all existing records.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {archiveError && <p className="text-sm text-destructive px-1">{archiveError}</p>}
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-transparent text-foreground">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleArchive}>
                      {archiving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      Archive Template
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10" disabled={deleting}>
                    <Trash2 className="mr-1.5 size-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-heading text-foreground">Delete Template?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{template.name}</strong>. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {deleteError && <p className="text-sm text-destructive px-1">{deleteError}</p>}
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-transparent text-foreground">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleDelete}
                    >
                      {deleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      Delete Template
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        )}
      </div>

      {/* Description */}
      <Card className="border-border/60">
        <CardContent className="p-5">
          <p className="text-sm text-foreground leading-relaxed">{template.description || "No description."}</p>
        </CardContent>
      </Card>

      {/* Completion Gates */}
      {(template.requiredForAdmission || template.requiredForDischarge) && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-heading font-semibold text-foreground">Completion Gates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {template.requiredForAdmission && (
                <Badge variant="secondary" className="text-xs bg-chart-4/10 text-chart-4">Required for Admission</Badge>
              )}
              {template.requiredForDischarge && (
                <Badge variant="secondary" className="text-xs bg-chart-4/10 text-chart-4">Required for Discharge</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Access */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading font-semibold text-foreground flex items-center gap-2">
            <Shield className="size-4" /> Role Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(template.roleAccess || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No role access configured.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(template.roleAccess || []).map((ra: RoleAccess) => (
                <div key={ra.roleId} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{ra.roleDisplayName}</span>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {ra.accessLevel === "sign" ? "Full Access" : ra.accessLevel === "edit" ? "View + Edit + Save" : "View + Print"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template Fields — inline editor */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-heading font-semibold text-foreground">
                Template Fields ({editFields.length})
              </CardTitle>
              <CardDescription>Configure the fields for this form template</CardDescription>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs bg-transparent text-foreground gap-1.5"
                  onClick={() => { setFieldsPreviewing(!fieldsPreviewing); if (!fieldsPreviewing) setPreviewData({}) }}
                >
                  {fieldsPreviewing ? <><PenLine className="size-3" /> Editor</> : <><Eye className="size-3" /> Preview</>}
                </Button>
                {fieldsDirty && (
                  <Button size="sm" className="h-7 text-xs" onClick={saveFields} disabled={fieldsSaving}>
                    {fieldsSaving ? "Saving…" : "Save Fields"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {fieldsPreviewing ? (
            /* ── Live Preview ── */
            <div className="border border-border rounded-lg p-4 bg-muted/20">
              <div className="flex flex-col gap-4">
                {template.name && <h2 className="text-lg font-bold text-foreground">{template.name}</h2>}
                {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
                {(template.name || template.description) && <Separator />}
                {editFields.map((field, idx) => {
                  if (field.type === "section") return <Separator key={idx} className="my-1" />
                  if (field.type === "title") return <h2 key={idx} className="text-xl font-bold text-foreground pt-1">{field.label || "Untitled"}</h2>

                  const opts = field.options
                    ? (Array.isArray(field.options) ? field.options : String(field.options).split(",").map((s: string) => s.trim()).filter(Boolean))
                    : []
                  const resolvedField = { ...field, options: opts }

                  const lw = field.labelWidth && field.labelWidth < 100 ? field.labelWidth : 0
                  return (
                    <div key={idx} className="flex flex-col gap-2">
                      <div className="text-sm font-medium text-foreground">
                        {field.label || "Untitled field"}
                        {field.optional && <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>}
                      </div>
                      <div className={lw ? "flex flex-col gap-1" : "contents"} style={lw ? { width: `${100 - lw}%` } : undefined}>
                      {field.type === "text" && (
                        <Input placeholder={field.placeholder || field.label} value={(previewData[field.label] as string) || ""} onChange={(e) => setPreviewData((p) => ({ ...p, [field.label]: e.target.value }))} />
                      )}
                      {field.type === "textarea" && (
                        <Textarea placeholder={field.placeholder || field.label} className="min-h-[80px]" value={(previewData[field.label] as string) || ""} onChange={(e) => setPreviewData((p) => ({ ...p, [field.label]: e.target.value }))} />
                      )}
                      {field.type === "number" && (
                        <Input type="number" placeholder={field.placeholder || field.label} value={(previewData[field.label] as string) || ""} onChange={(e) => setPreviewData((p) => ({ ...p, [field.label]: e.target.value }))} />
                      )}
                      {field.type === "date" && (
                        <Input type="date" value={(previewData[field.label] as string) || ""} onChange={(e) => setPreviewData((p) => ({ ...p, [field.label]: e.target.value }))} />
                      )}
                      {field.type === "checkbox" && (
                        <div className="flex gap-3">
                          {(resolvedField.options.length > 0 ? resolvedField.options : ["Yes", "No"]).map((o) => (
                            <label key={o} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox checked={previewData[field.label] === o} onCheckedChange={() => setPreviewData((p) => ({ ...p, [field.label]: o }))} />
                              <span className="text-sm text-foreground">{o}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      {field.type === "checkbox_group" && (
                        <div className={field.checkboxLayout === "inline" ? "flex flex-wrap gap-x-4 gap-y-2" : "flex flex-col gap-2"}>
                          {resolvedField.options.map((o) => {
                            const sel = Array.isArray(previewData[field.label]) ? (previewData[field.label] as string[]) : []
                            return (
                              <label key={o} className="flex items-center gap-2 cursor-pointer">
                                <Checkbox
                                  checked={sel.includes(o)}
                                  onCheckedChange={(c) => setPreviewData((p) => ({ ...p, [field.label]: c ? [...sel, o] : sel.filter((s) => s !== o) }))}
                                />
                                <span className="text-sm text-foreground">{o}</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                      {field.type === "select" && (
                        <Select value={(previewData[field.label] as string) || ""} onValueChange={(v) => setPreviewData((p) => ({ ...p, [field.label]: v }))}>
                          <SelectTrigger><SelectValue placeholder={`Select ${field.label.toLowerCase()}`} /></SelectTrigger>
                          <SelectContent>
                            {resolvedField.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {field.type === "multi_select" && (() => {
                        const sel = Array.isArray(previewData[field.label]) ? (previewData[field.label] as string[]) : []
                        return (
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-1.5">
                              {sel.map((s) => (
                                <span key={s} className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                                  {s}
                                  <button type="button" className="hover:text-destructive" onClick={() => setPreviewData((p) => ({ ...p, [field.label]: sel.filter((v) => v !== s) }))}>×</button>
                                </span>
                              ))}
                            </div>
                            <Select value="" onValueChange={(v) => setPreviewData((p) => ({ ...p, [field.label]: [...sel, v] }))}>
                              <SelectTrigger><SelectValue placeholder={`Add ${field.label.toLowerCase()}...`} /></SelectTrigger>
                              <SelectContent>
                                {resolvedField.options.filter((o) => !sel.includes(o)).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        )
                      })()}
                      {field.type === "time" && (
                        <Input type="time" value={(previewData[field.label] as string) || ""} onChange={(e) => setPreviewData((p) => ({ ...p, [field.label]: e.target.value }))} className="w-36" />
                      )}
                      {field.type === "scale" && (() => {
                        const mn = field.min ?? 0
                        const mx = field.max ?? 3
                        const labels = field.scaleLabels || {}
                        const cur = typeof previewData[field.label] === "number" ? (previewData[field.label] as number) : -1
                        return (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {Array.from({ length: mx - mn + 1 }, (_, i) => i + mn).map((n) => (
                                <div key={n} className="flex flex-col items-center gap-1">
                                  <button
                                    type="button"
                                    className={`size-10 rounded-lg border text-sm font-medium transition-colors ${cur === n ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-foreground border-border hover:bg-muted"}`}
                                    onClick={() => setPreviewData((p) => ({ ...p, [field.label]: n }))}
                                  >{n}</button>
                                  {labels[String(n)] && <span className="text-[10px] text-muted-foreground max-w-12 text-center leading-tight">{labels[String(n)]}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                      {field.type === "matrix" && (() => {
                        const rawRows = field.matrixRows
                        const rawCols = field.matrixColumns
                        const rows = Array.isArray(rawRows) ? rawRows : (rawRows ? String(rawRows).split(",").map((s: string) => s.trim()).filter(Boolean) : [])
                        const cols = Array.isArray(rawCols) ? rawCols : (rawCols ? String(rawCols).split(",").map((s: string) => s.trim()).filter(Boolean) : [])
                        const data = (previewData[field.label] as Record<string, Record<string, string>>) || {}
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr>
                                  <th className="text-left p-2 border border-border bg-muted/30 text-xs font-medium text-muted-foreground" />
                                  {cols.map((c) => <th key={c} className="p-2 border border-border bg-muted/30 text-xs font-medium text-center text-foreground">{c}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r) => (
                                  <tr key={r}>
                                    <td className="p-2 border border-border text-sm font-medium text-foreground bg-muted/10">{r}</td>
                                    {cols.map((c) => (
                                      <td key={c} className="p-1 border border-border">
                                        <Input
                                          className="h-8 text-sm text-center border-0 bg-transparent focus-visible:ring-1"
                                          value={data[r]?.[c] || ""}
                                          onChange={(e) => setPreviewData((p) => ({
                                            ...p,
                                            [field.label]: { ...(p[field.label] as Record<string, Record<string, string>> || {}), [r]: { ...((p[field.label] as Record<string, Record<string, string>> || {})[r] || {}), [c]: e.target.value } }
                                          }))}
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(rows.length === 0 || cols.length === 0) && <p className="text-xs text-muted-foreground text-center py-2">Add rows and columns in the editor to see the matrix.</p>}
                          </div>
                        )
                      })()}
                      {field.type === "signature" && (
                        <div className="rounded-md border border-dashed border-border bg-muted/20 h-24 flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">Signature pad — draw to sign</span>
                        </div>
                      )}
                      {field.type === "patient_data" && (
                        <div className="px-3 py-2 rounded-md bg-muted/40 border border-border/50 text-sm text-muted-foreground italic">
                          Auto-populated from patient record ({PATIENT_PROPERTIES.find((p) => p.value === field.patientProperty)?.label || field.patientProperty || "not set"})
                        </div>
                      )}
                      </div>
                    </div>
                  )
                })}
                {editFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No fields to preview.</p>}
              </div>
            </div>
          ) : canManage ? (
            /* ── Field Editor ── */
            <div className="flex flex-col gap-2">
              {editFields.map((field, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col gap-2 p-3 border rounded-lg ${field.type === "section" ? "border-dashed border-muted-foreground/40 bg-muted/20" : "border-border"}`}
                  draggable
                  onDragStart={() => handleFieldDragStart(idx)}
                  onDragEnter={() => handleFieldDragEnter(idx)}
                  onDragEnd={handleFieldDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="size-4 text-muted-foreground cursor-grab shrink-0 mt-6" />
                    <div className="flex-1 min-w-0 flex gap-2">
                      {field.type === "section" ? (
                        <p className="flex-1 text-xs text-muted-foreground italic pt-6">— Section Break —</p>
                      ) : (
                        <div className="flex flex-col gap-1" style={{ width: "60%" }}>
                          <Label className="text-xs text-muted-foreground">Field label</Label>
                          <Input
                            placeholder={field.type === "title" ? "Title text" : ""}
                            value={field.label}
                            onChange={(e) => updateEditField(idx, "label", e.target.value)}
                          />
                        </div>
                      )}
                      <div className="flex flex-col gap-1" style={{ width: "40%" }}>
                        <Label className="text-xs text-muted-foreground">Field type</Label>
                        <Select
                          value={field.type}
                          onValueChange={(val) => updateEditField(idx, "type", val)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            {FIELD_TYPES.map((ft) => (
                              <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  {/* Placeholder text for text-like fields */}
                  {(field.type === "text" || field.type === "textarea") && (
                    <div className="flex flex-col gap-1 ml-1">
                      <Label className="text-xs text-muted-foreground">Placeholder text</Label>
                      <Input
                        placeholder=""
                        value={field.placeholder || ""}
                        onChange={(e) => updateEditField(idx, "placeholder", e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  )}
                  {/* Patient data property picker */}
                  {field.type === "patient_data" && (
                    <div className="flex flex-col gap-1 ml-1">
                      <Label className="text-xs text-muted-foreground">Patient property</Label>
                      <Select
                        value={field.patientProperty || ""}
                        onValueChange={(v) => {
                          updateEditField(idx, "patientProperty", v)
                          // Auto-fill label if empty
                          if (!field.label) {
                            const prop = PATIENT_PROPERTIES.find((p) => p.value === v)
                            if (prop) updateEditField(idx, "label", prop.label)
                          }
                        }}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Select property..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-48">
                          {PATIENT_PROPERTIES.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* Options for checkbox_group, select, multi_select */}
                  {(field.type === "checkbox_group" || field.type === "select" || field.type === "multi_select") && (
                    <div className="flex flex-col gap-1 ml-1">
                      <Label className="text-xs text-muted-foreground">Options (comma-separated)</Label>
                      <Input
                        placeholder="Option 1, Option 2, Option 3"
                        value={Array.isArray(field.options) ? field.options.join(", ") : (field.options || "")}
                        onChange={(e) => updateEditField(idx, "options", e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  )}
                  {/* Checkbox group layout */}
                  {field.type === "checkbox_group" && (
                    <div className="flex items-center gap-2 ml-1">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Options layout</Label>
                      <Select
                        value={field.checkboxLayout || "stacked"}
                        onValueChange={(v) => updateEditField(idx, "checkboxLayout", v)}
                      >
                        <SelectTrigger className="w-44 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stacked">One per line</SelectItem>
                          <SelectItem value="inline">Wrap on one line</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* Scale min/max + labels */}
                  {field.type === "scale" && (
                    <div className="flex flex-col gap-2 ml-1">
                      <div className="flex gap-2">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Min</Label>
                          <Input
                            type="number"
                            value={field.min ?? 0}
                            onChange={(e) => updateEditField(idx, "min", parseInt(e.target.value) || 0)}
                            className="w-20 text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Max</Label>
                          <Input
                            type="number"
                            value={field.max ?? 3}
                            onChange={(e) => updateEditField(idx, "max", parseInt(e.target.value) || 3)}
                            className="w-20 text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Scale labels (e.g. 0=Not at all, 10=Severe)</Label>
                        <Input
                          placeholder="0=Not at all, 5=Moderate, 10=Severe"
                          value={Object.entries(field.scaleLabels || {}).map(([k, v]) => `${k}=${v}`).join(", ")}
                          onChange={(e) => {
                            const labels: Record<string, string> = {}
                            e.target.value.split(",").forEach((s) => {
                              const [k, ...rest] = s.split("=")
                              if (k?.trim() && rest.length) labels[k.trim()] = rest.join("=").trim()
                            })
                            updateEditField(idx, "scaleLabels", labels)
                          }}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  )}
                  {/* Matrix rows/columns */}
                  {field.type === "matrix" && (
                    <div className="flex flex-col gap-2 ml-1">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Row labels (comma-separated)</Label>
                        <Input
                          placeholder="Pain, Nausea, Anxiety, Insomnia"
                          value={Array.isArray(field.matrixRows) ? field.matrixRows.join(", ") : (field.matrixRows || "")}
                          onChange={(e) => updateEditField(idx, "matrixRows", e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Column labels (comma-separated)</Label>
                        <Input
                          placeholder="None, Mild, Moderate, Severe"
                          value={Array.isArray(field.matrixColumns) ? field.matrixColumns.join(", ") : (field.matrixColumns || "")}
                          onChange={(e) => updateEditField(idx, "matrixColumns", e.target.value)}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  )}
                  {/* Label width */}
                  {field.type !== "section" && field.type !== "title" && (
                    <div className="flex items-center gap-2 ml-1">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Layout</Label>
                      <Select
                        value={String(field.labelWidth || 100)}
                        onValueChange={(v) => updateEditField(idx, "labelWidth", v === "100" ? undefined : parseInt(v))}
                      >
                        <SelectTrigger className="w-44 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="100">Full width (default)</SelectItem>
                          <SelectItem value="10">90%</SelectItem>
                          <SelectItem value="25">75%</SelectItem>
                          <SelectItem value="33">67%</SelectItem>
                          <SelectItem value="50">50%</SelectItem>
                          <SelectItem value="67">33%</SelectItem>
                          <SelectItem value="75">25%</SelectItem>
                          <SelectItem value="90">10%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* Optional toggle */}
                  {field.type !== "section" && field.type !== "title" && (
                    <label className="flex items-center gap-2 ml-1 cursor-pointer">
                      <Checkbox checked={!!field.optional} onCheckedChange={(v) => updateEditField(idx, "optional", !!v)} />
                      <span className="text-xs text-muted-foreground">Optional field</span>
                    </label>
                  )}
                  {/* Footer: field ID + delete */}
                  <div className="flex items-center justify-between mt-1 pt-2 border-t border-border/40">
                    <span className="text-[10px] text-muted-foreground/60 font-mono">{field.fieldId ? <>ID: <span className="select-all cursor-text">{field.fieldId}</span></> : `#${idx + 1}`}</span>
                    {editFields.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeEditField(idx)}
                      >
                        <Trash2 className="size-3 mr-1" /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent text-foreground self-start"
                onClick={addEditField}
              >
                <Plus className="mr-1 size-3" />
                Add Field
              </Button>
            </div>
          ) : (
            /* ── Read-only view for non-managers ── */
            <div className="flex flex-col gap-2">
              {template.fields.map((field, idx) => (
                field.type === "section" ? (
                  <Separator key={idx} className="my-1" />
                ) : field.type === "title" ? (
                  <h2 key={idx} className="text-xl font-bold text-foreground pt-1">{field.label}</h2>
                ) : (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-mono w-5">{idx + 1}.</span>
                      <span className="text-sm font-medium text-foreground">
                        {field.label}
                        {field.optional && <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border capitalize">
                      {FIELD_TYPES.find((ft) => ft.value === field.type)?.label || field.type}
                    </Badge>
                  </div>
                )
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ------- Category Manager -------
function CategoryManager({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [defaultCategories, setDefaultCategories] = useState<string[]>([])
  const [newCat, setNewCat] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeBlocked, setRemoveBlocked] = useState<{ cat: string; templates: { id: number; name: string }[] } | null>(null)
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [renaming, setRenaming] = useState(false)
  const dragItem = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      Promise.all([getCategories(), getTemplates()])
        .then(([catResp, templates]) => {
          const merged = [...catResp.categories]
          for (const t of templates) {
            if (t.category && !merged.includes(t.category)) {
              merged.push(t.category)
            }
          }
          setCategories(merged)
          setDefaultCategories(catResp.defaultCategories)
        })
        .catch(() => {})
    }
  }, [open])

  const handleDragStart = (idx: number) => { dragItem.current = idx }
  const handleDragEnter = (idx: number) => { dragOver.current = idx }
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) {
      dragItem.current = null
      dragOver.current = null
      return
    }
    const next = [...categories]
    const dragged = next.splice(dragItem.current, 1)[0]
    next.splice(dragOver.current, 0, dragged)
    setCategories(next)
    dragItem.current = null
    dragOver.current = null
  }

  const addCat = () => {
    const val = newCat.trim().toLowerCase().replace(/\s+/g, "-")
    if (!val) return
    if (categories.includes(val)) { setError(`"${val}" already exists`); return }
    setCategories([...categories, val])
    setNewCat("")
    setError("")
  }

  const handleRemoveCat = (cat: string) => {
    setRemoving(cat)
    setRemoveBlocked(null)
    setError("")
    deleteCategory(cat)
      .then(() => {
        setCategories((prev: string[]) => prev.filter((c: string) => c !== cat))
        onChanged()
      })
      .catch((e: unknown) => {
        const err = e as DeleteCategoryError
        if (err.templates && err.templates.length > 0) {
          setRemoveBlocked({ cat, templates: err.templates })
        } else {
          setError(err.message || "Failed to delete category")
        }
      })
      .finally(() => setRemoving(null))
  }

  const handleRename = (cat: string) => {
    const newName = editValue.trim().toLowerCase().replace(/\s+/g, "-")
    if (!newName || newName === cat) { setEditingCat(null); return }
    setRenaming(true)
    setError("")
    renameCategory(cat, newName)
      .then(() => {
        setCategories((prev) => prev.map((c) => c === cat ? newName : c))
        setEditingCat(null)
        onChanged()
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Rename failed"))
      .finally(() => setRenaming(false))
  }

  const handleSave = () => {
    setSaving(true)
    setError("")
    updateCategories(categories)
      .then(() => { setOpen(false); onChanged() })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to save"))
      .finally(() => setSaving(false))
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { setOpen(v); setRemoveBlocked(null); setError(""); setEditingCat(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-transparent text-foreground">
          <Settings2 className="mr-2 size-4" /> Manage Categories
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">Manage Categories</DialogTitle>
          <DialogDescription>
            Drag to reorder. Click a custom category name to rename it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto py-1">
          {categories.map((cat: string, idx: number) => {
            const isDefault = defaultCategories.includes(cat)
            const isRemoving = removing === cat
            const isEditing = editingCat === cat
            return (
              <div key={cat} className="flex flex-col gap-1">
                <div
                  className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30"
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <GripVertical className="size-4 text-muted-foreground cursor-grab shrink-0" />
                  {isEditing ? (
                    <Input
                      className="h-7 text-sm flex-1"
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(cat); if (e.key === "Escape") setEditingCat(null) }}
                      onBlur={() => handleRename(cat)}
                      disabled={renaming}
                    />
                  ) : (
                    <span
                      className={`flex-1 text-sm capitalize text-foreground ${!isDefault ? "cursor-pointer hover:text-primary" : ""}`}
                      onClick={() => { if (!isDefault) { setEditingCat(cat); setEditValue(cat) } }}
                    >
                      {cat}
                    </span>
                  )}
                  {isDefault ? (
                    <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">default</span>
                  ) : (
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                      onClick={() => handleRemoveCat(cat)}
                      disabled={isRemoving || removing !== null}
                    >
                      {isRemoving ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                    </button>
                  )}
                </div>
                {removeBlocked?.cat === cat && (
                  <div className="ml-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <p className="text-xs font-medium text-destructive mb-1">
                      Cannot delete — {removeBlocked.templates.length} template(s) use this category:
                    </p>
                    <ul className="text-xs text-destructive/80 list-disc list-inside">
                      {removeBlocked.templates.map((t) => (
                        <li key={t.id}>{t.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <Input
            placeholder="New category name…"
            value={newCat}
            onChange={(e) => { setNewCat((e.target as HTMLInputElement).value); setError("") }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCat() } }}
            className="flex-1"
          />
          <Button type="button" variant="outline" className="bg-transparent text-foreground" onClick={addCat}>
            <Plus className="size-4" />
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="bg-transparent text-foreground" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Save Order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ------- Template Card (reusable) -------
function TemplateCard({ template, onClick }: { template: FormTemplate; onClick: () => void }) {
  const signers = (template.roleAccess || []).filter((ra: RoleAccess) => ra.accessLevel === "sign")
  const isArchived = template.status === "archived"

  return (
    <Card
      className={`border-border/60 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${isArchived ? "opacity-60" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-primary shrink-0" />
            <Badge variant="secondary" className="text-[10px] capitalize">{template.category}</Badge>
            {isArchived && (
              <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground border-0">
                <Archive className="size-2.5 mr-1" />Archived
              </Badge>
            )}
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mt-2">{template.name}</h3>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{template.description}</p>
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
          {template.isRecurring && (
            <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-0">
              <Clock className="size-2.5 mr-1" />Recurring
            </Badge>
          )}
          {template.requiredForAdmission && (
            <Badge variant="secondary" className="text-[10px] bg-chart-4/15 text-chart-4 border-0">Admission Required</Badge>
          )}
          {template.requiredForDischarge && (
            <Badge variant="secondary" className="text-[10px] bg-blue-500/15 text-blue-600 border-0">Discharge Required</Badge>
          )}
          {signers.length > 0 && (
            <Badge variant="secondary" className="text-[10px] bg-accent/10 text-foreground border-0">
              <Shield className="size-2.5 mr-1" />
              {signers.map((s: RoleAccess) => s.roleDisplayName).join(", ")}
            </Badge>
          )}
          {!template.isRecurring && !template.requiredForAdmission && !template.requiredForDischarge && signers.length === 0 && (
            <span className="text-[10px] text-muted-foreground">No restrictions</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function TemplateGrid({ templates, onSelect }: { templates: FormTemplate[]; onSelect: (id: number) => void }) {
  if (templates.length === 0) {
    return (
      <Card className="border-border/60 col-span-full">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No templates found.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((t) => (
        <TemplateCard key={t.id} template={t} onClick={() => onSelect(t.id)} />
      ))}
    </div>
  )
}

// ------- Main Workflows View -------
export function WorkflowsView({ userPermissions = [] }: { userPermissions?: string[] }) {
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [activeTab, setActiveTab] = useState("all")

  const fetchCategories = useCallback(async () => {
    getCategories()
      .then((r) => setAllCategories(r.categories))
      .catch(() => {})
  }, [])

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError("")
    getTemplates(showArchived ? "all" : "active")
      .then(setTemplates)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [showArchived])

  useEffect(() => {
    Promise.resolve().then(() => { fetchTemplates(); fetchCategories() })
  }, [fetchTemplates, fetchCategories])

  if (selectedTemplateId) {
    return (
      <TemplateDetailPage
        templateId={selectedTemplateId}
        onBack={() => setSelectedTemplateId(null)}
        onRefresh={fetchTemplates}
        userPermissions={userPermissions}
      />
    )
  }

  const filteredTemplates = templates.filter((t) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
  })

  // Build category tabs from the tenant's configured categories
  const tabCategories = allCategories.length > 0 ? allCategories : DEFAULT_CATEGORIES

  const templatesByTab = activeTab === "all"
    ? filteredTemplates
    : filteredTemplates.filter((t) => t.category === activeTab)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Form templates and their configuration
          </p>
        </div>
        <div className="flex items-center gap-2">
          {userPermissions.includes("workflows.manage") && (
            <>
              <CategoryManager onChanged={() => { fetchTemplates(); fetchCategories() }} />
              <TemplateEditorDialog
                onSaved={(createdId) => { fetchTemplates(); if (createdId) setSelectedTemplateId(createdId) }}
                existingCategories={allCategories}
                trigger={
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Plus className="mr-2 size-4" /> Template
                  </Button>
                }
              />
            </>
          )}
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="mt-3 bg-transparent text-foreground" onClick={fetchTemplates}>Retry</Button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Search + Show Archived */}
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates by name..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                  <Switch checked={showArchived} onCheckedChange={setShowArchived} />
                  <span className="text-sm text-muted-foreground">Show Archived</span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Category Tabs + Template Cards */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
              <TabsTrigger value="all" className="text-xs capitalize">All</TabsTrigger>
              {tabCategories.map((cat) => (
                <TabsTrigger key={cat} value={cat} className="text-xs capitalize">{cat}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              <TemplateGrid templates={templatesByTab} onSelect={setSelectedTemplateId} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}