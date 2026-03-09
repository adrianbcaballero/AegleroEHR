"use client"

import { useState, useEffect, useCallback} from "react"
import {
  GitBranch,
  Search,
  ArrowLeft,
  FileText,
  CheckCircle2,
  Clock,
  ChevronRight,
  ClipboardList,
  Plus,
  Loader2,
  Shield,
  Pencil,
  ChevronUp,
  ChevronDown,
  X,
  Settings2,
  Trash2,
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
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, getCategories, updateCategories, getRolesPicker } from "@/lib/api"
import type { FormTemplate, TemplateField, RoleAccess } from "@/lib/api"

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
  { value: "signature", label: "Signature" },
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
  onSaved: () => void
  trigger: React.ReactNode
  existingCategories?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  const [fields, setFields] = useState<TemplateField[]>([{ label: "", type: "text" }])
  const [roleAccess, setRoleAccess] = useState<Record<number, AccessLevel>>({})
  const [availableRoles, setAvailableRoles] = useState<{ id: number; name: string; displayName: string }[]>([])
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceValue, setRecurrenceValue] = useState("8")
  const [recurrenceUnit, setRecurrenceUnit] = useState("hours")
  const [requiredForAdmission, setRequiredForAdmission] = useState(false)
  const [requiredForDischarge, setRequiredForDischarge] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

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
          // New template — default all roles to "sign" (full access)
          const map: Record<number, AccessLevel> = {}
          availableRoles.forEach((r: { id: number; name: string; displayName: string }) => { map[r.id] = "sign" })
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
    if (fields.some((f) => !f.label.trim())) { setError("All fields need a label"); return }
    if (isRecurring && (!recurrenceValue || parseInt(recurrenceValue) < 1)) { setError("Recurring interval must be at least 1"); return }

    setLoading(true)
    setError("")

    const cleanFields = fields.map((f) => {
      const field: TemplateField = { label: f.label.trim(), type: f.type }
      if (f.options) {
        const raw = Array.isArray(f.options) ? f.options.join(", ") : String(f.options)
        field.options = raw.split(",").map((s: string) => s.trim()).filter(Boolean)
      }
      if (f.type === "scale") { field.min = f.min ?? 0; field.max = f.max ?? 3 }
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
      fields: cleanFields,
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
      .then(() => {
        setOpen(false)
        onSaved()
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
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...DEFAULT_CATEGORIES, ...existingCategories])].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-2 py-0.5 rounded-md text-xs border transition-colors ${
                    category === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Select a category. To add custom categories use <span className="font-medium text-foreground">Manage Categories</span> on the Workflows page.
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

          <Separator />

          {/* Fields */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-foreground">Fields</Label>
            {fields.map((field, idx) => (
              <div key={idx} className="flex flex-col gap-2 p-3 border border-border rounded-lg">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Field label"
                    value={field.label}
                    onChange={(e) => updateField(idx, "label", e.target.value)}
                    className="flex-1"
                  />
                  <Select
                    value={field.type}
                    onValueChange={(val) => updateField(idx, "type", val)}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((ft) => (
                        <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fields.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive shrink-0"
                      onClick={() => removeField(idx)}
                    >
                      ×
                    </Button>
                  )}
                </div>
                {/* Options for checkbox_group, select, checkbox */}
                {(field.type === "checkbox_group" || field.type === "select" || field.type === "checkbox") && (
                  <div className="flex flex-col gap-1 ml-1">
                    <Label className="text-xs text-muted-foreground">Options (comma-separated)</Label>
                    <Input
                      placeholder={field.type === "checkbox" ? "Yes, No" : "Option 1, Option 2, Option 3"}
                      value={Array.isArray(field.options) ? field.options.join(", ") : (field.options || "")}
                      onChange={(e) => updateField(idx, "options", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                )}
                {/* Scale min/max */}
                {field.type === "scale" && (
                  <div className="flex gap-2 ml-1">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Min</Label>
                      <Input
                        type="number"
                        value={field.min ?? 0}
                        onChange={(e) => updateField(idx, "min", parseInt(e.target.value) || 0)}
                        className="w-20 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Max</Label>
                      <Input
                        type="number"
                        value={field.max ?? 3}
                        onChange={(e) => updateField(idx, "max", parseInt(e.target.value) || 3)}
                        className="w-20 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent text-foreground self-start"
              onClick={() => setFields([...fields, { label: "", type: "text" }])}
            >
              <Plus className="mr-1 size-3" />
              Add Field
            </Button>
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
  userRole,
}: {
  templateId: number
  onBack: () => void
  onRefresh: () => void
  userRole?: string
}) {
  const [template, setTemplate] = useState<FormTemplate | null>(null)
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const fetchTemplate = useCallback(async () => {
    setLoading(true)
    getTemplates()
      .then((templates) => {
        const found = templates.find((t) => t.id === templateId)
        setTemplate(found || null)
        setAllCategories([...new Set(templates.map((t) => t.category))])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [templateId])

  useEffect(() => {
    Promise.resolve().then(() => fetchTemplate())
  }, [templateId, fetchTemplate])

  const canManage = userRole === "admin" || userRole === "psychiatrist"

  const handleDelete = () => {
    if (!template) return
    setDeleting(true)
    setDeleteError("")
    deleteTemplate(template.id)
      .then(() => { onRefresh(); onBack() })
      .catch((e: unknown) => setDeleteError(e instanceof Error ? e.message : "Delete failed"))
      .finally(() => setDeleting(false))
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
                  <Pencil className="mr-1.5 size-3.5" /> Edit
                </Button>
              }
            />
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
                    This will permanently delete <strong>{template.name}</strong>.
                    {(template.instanceCount ?? 0) > 0
                      ? ` This template has ${template.instanceCount} form instance(s) and cannot be deleted — archive it instead.`
                      : " This action cannot be undone."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError && <p className="text-sm text-destructive px-1">{deleteError}</p>}
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-transparent text-foreground">Cancel</AlertDialogCancel>
                  {(template.instanceCount ?? 0) === 0 && (
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleDelete}
                    >
                      {deleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      Delete Template
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>

      {/* Description */}
      <Card className="border-border/60">
        <CardContent className="p-5">
          <p className="text-sm text-foreground leading-relaxed">{template.description || "No description."}</p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/60">
          <CardContent className="p-4 text-center">
            <p className="text-lg font-bold font-heading text-foreground">{template.fields.length}</p>
            <p className="text-xs text-muted-foreground">Fields</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4 text-center">
            <p className="text-lg font-bold font-heading text-primary">{template.instanceCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">Instances</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4 text-center">
            <p className="text-lg font-bold font-heading text-accent">{template.allowedRoles.length}</p>
            <p className="text-xs text-muted-foreground">Roles</p>
          </CardContent>
        </Card>
      </div>

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

      {/* Template Fields */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading font-semibold text-foreground">
            Template Fields ({template.fields.length})
          </CardTitle>
          <CardDescription>The structure and fields used in this form template</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {template.fields.map((field, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-mono w-5">{idx + 1}.</span>
                  <div>
                    <span className="text-sm font-medium text-foreground">{field.label}</span>
                    {field.options && field.options.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Options: {field.options.join(", ")}
                      </p>
                    )}
                    {field.type === "scale" && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Range: {field.min ?? 0} – {field.max ?? 3}
                      </p>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-border capitalize">
                  {FIELD_TYPES.find((ft) => ft.value === field.type)?.label || field.type}
                </Badge>
              </div>
            ))}
          </div>
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

  useEffect(() => {
    if (open) {
      getCategories()
        .then((r) => { setCategories(r.categories); setDefaultCategories(r.defaultCategories) })
        .catch(() => {})
    }
  }, [open])

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...categories]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setCategories(next)
  }

  const addCat = () => {
    const val = newCat.trim().toLowerCase().replace(/\s+/g, "-")
    if (!val) return
    if (categories.includes(val)) { setError(`"${val}" already exists`); return }
    setCategories([...categories, val])
    setNewCat("")
    setError("")
  }

  const removeCat = (cat: string) => {
    setCategories(categories.filter((c: string) => c !== cat))
    setError("")
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-transparent text-foreground">
          <Settings2 className="mr-2 size-4" /> Manage Categories
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">Manage Categories</DialogTitle>
          <DialogDescription>
            Reorder categories using the arrows. Add custom categories or remove ones you created.
            Default categories cannot be removed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto py-1">
          {categories.map((cat: string, idx: number) => {
            const isDefault = defaultCategories.includes(cat)
            return (
              <div key={cat} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                  >
                    <ChevronUp className="size-3.5 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                    onClick={() => move(idx, 1)}
                    disabled={idx === categories.length - 1}
                  >
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
                <span className="flex-1 text-sm capitalize text-foreground">{cat}</span>
                {isDefault ? (
                  <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">default</span>
                ) : (
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => removeCat(cat)}
                  >
                    <X className="size-3.5" />
                  </button>
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
            onKeyDown={(e) => { if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); addCat() } }}
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

// ------- Main Workflows View -------
export function WorkflowsView({ userRole }: { userRole?: string }) {
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError("")
    getTemplates()
      .then(setTemplates)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => fetchTemplates())
  }, [fetchTemplates])

  if (selectedTemplateId) {
    return (
      <TemplateDetailPage
        templateId={selectedTemplateId}
        onBack={() => setSelectedTemplateId(null)}
        onRefresh={fetchTemplates}
        userRole={userRole}
      />
    )
  }

  const filteredTemplates = templates.filter((t) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
  })

  const totalInstances = templates.reduce((acc, t) => acc + (t.instanceCount || 0), 0)
  const activeTemplates = templates.filter((t) => t.status === "active").length

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
          {(userRole === "admin" || userRole === "psychiatrist") && (
            <>
              <CategoryManager onChanged={fetchTemplates} />
              <TemplateEditorDialog
                onSaved={fetchTemplates}
                existingCategories={[...new Set(templates.map((t: FormTemplate) => t.category))] as string[]}
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
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <ClipboardList className="size-3.5 text-primary" />
                  <p className="text-xs text-muted-foreground font-medium">Templates</p>
                </div>
                <p className="text-xl font-bold font-heading text-foreground">{templates.length}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="size-3.5 text-accent" />
                  <p className="text-xs text-muted-foreground font-medium">Active</p>
                </div>
                <p className="text-xl font-bold font-heading text-accent">{activeTemplates}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <FileText className="size-3.5 text-foreground" />
                  <p className="text-xs text-muted-foreground font-medium">Total Forms</p>
                </div>
                <p className="text-xl font-bold font-heading text-foreground">{totalInstances}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield className="size-3.5 text-chart-4" />
                  <p className="text-xs text-muted-foreground font-medium">Role-Restricted</p>
                </div>
                <p className="text-xl font-bold font-heading text-chart-4">
                  {templates.filter((t) => t.allowedRoles.length < 3).length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates by name or category..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Template Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                className="border-border/60 cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
                onClick={() => setSelectedTemplateId(template.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <GitBranch className="size-4 text-primary shrink-0" />
                      <Badge variant="secondary" className="text-[10px] capitalize">{template.category}</Badge>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mt-2">{template.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{template.description}</p>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                    <span>{template.fields.length} fields</span>
                    <span>&middot;</span>
                    <span>{template.instanceCount || 0} instances</span>
                    {template.allowedRoles.length < 3 && (
                      <>
                        <span>&middot;</span>
                        <span className="flex items-center gap-1">
                          <Shield className="size-3" /> Restricted
                        </span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredTemplates.length === 0 && (
              <Card className="border-border/60 col-span-full">
                <CardContent className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">No templates found.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}