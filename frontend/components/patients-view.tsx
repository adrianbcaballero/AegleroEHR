"use client"

import Image from "next/image"
import { useState, useEffect, useCallback } from "react"
import {
  Search,
  Plus,
  ChevronRight,
  PenLine,
  ArrowLeft,
  Users,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Clock,
  Trash2,
  Archive,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Printer,
  LogIn,
  LogOut,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { getPatients, getPatient, updatePatient, getPatientForms, getPatientForm, createPatientForm, updatePatientForm, deletePatientForm, getTemplates, getMe, admitPatient, dischargePatient, getPart2Consents, createPart2Consent, revokePart2Consent, getCategories, listCareTeams } from "@/lib/api"
import type { Patient, PatientDetail, PatientFormEntry, FormTemplate, TemplateField, Part2Consent, CareTeam } from "@/lib/api"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"


// Default categories that always appear as tabs even with 0 forms — cannot be "deleted" by archiving templates
const DEFAULT_CATEGORIES = ["assessment", "clinical", "consent", "discharge", "flowsheet", "intake", "insurance"]

const riskColors: Record<string, string> = {
  low: "bg-accent/10 text-accent border-accent/20",
  moderate: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  high: "bg-destructive/10 text-destructive border-destructive/20",
}

interface FormStatusEntry {
  icon: typeof CheckCircle2
  color: string
  label: string
}

const formStatusConfig: Record<string, FormStatusEntry> = {
  completed: { icon: CheckCircle2, color: "bg-accent/10 text-accent border-accent/20", label: "Completed" },
  draft: { icon: Clock, color: "bg-chart-4/10 text-chart-4 border-chart-4/20", label: "Draft" },
}

// ─── Field Renderer ───
function FormFieldRenderer({ field, value, onChange, disabled }: { field: TemplateField; value: unknown; onChange: (v: string | number | string[]) => void; disabled?: boolean }) {
  switch (field.type) {
    case "text":
      return <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.label} disabled={disabled} />
    case "textarea":
      return <Textarea value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.label} className="min-h-[80px]" disabled={disabled} />
    case "number":
      return <Input type="number" value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.label} disabled={disabled} />
    case "date":
      return <Input type="date" value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />

    case "checkbox": {
      const opts = field.options || ["Yes", "No"]
      const cur = (value as string) || ""
      return (
        <div className="flex gap-3">
          {opts.map((o) => (
            <label key={o} className={`flex items-center gap-2 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
              <Checkbox checked={cur === o} onCheckedChange={() => !disabled && onChange(o)} disabled={disabled} />
              <span className="text-sm text-foreground">{o}</span>
            </label>
          ))}
        </div>
      )
    }

    case "checkbox_group": {
      const opts = field.options || []
      const sel = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="flex flex-col gap-2">
          {opts.map((o) => (
            <label key={o} className={`flex items-center gap-2 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
              <Checkbox
                checked={sel.includes(o)}
                onCheckedChange={(c) => !disabled && onChange(c ? [...sel, o] : sel.filter((s) => s !== o))}
                disabled={disabled}
              />
              <span className="text-sm text-foreground">{o}</span>
            </label>
          ))}
        </div>
      )
    }

    case "select": {
      const opts = field.options || []
      return (
        <Select value={(value as string) || ""} onValueChange={disabled ? undefined : onChange} disabled={disabled}>
          <SelectTrigger><SelectValue placeholder={`Select ${field.label.toLowerCase()}`} /></SelectTrigger>
          <SelectContent>
            {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      )
    }

    case "scale": {
      const mn = field.min ?? 0
      const mx = field.max ?? 3
      const cur = typeof value === "number" ? value : -1
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {Array.from({ length: mx - mn + 1 }, (_, i) => i + mn).map((n) => (
              <button
                key={n} type="button"
                className={`size-10 rounded-lg border text-sm font-medium transition-colors ${cur === n ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-foreground border-border hover:bg-muted"} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                onClick={() => !disabled && onChange(n)}
                disabled={disabled}
              >{n}</button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{mn} = Not at all</span><span>{mx} = Nearly every day</span>
          </div>
        </div>
      )
    }

    case "signature":
      return (
        <div className="flex flex-col gap-2">
          <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder="Type full name as signature" className="italic" disabled={disabled} />
          {!!value && <p className="text-xs text-muted-foreground">Signed electronically on {new Date().toLocaleDateString()}</p>}
        </div>
      )

    default:
      return <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.label} disabled={disabled} />
  }
}

// ─── Form Detail View ───
function FormDetailView({
  formId, patientCode, patientName, onBack, onDeleted,
}: {
  formId: number; patientCode: string; patientName: string; onBack: () => void; onDeleted: () => void
}) {
  const [form, setForm] = useState<PatientFormEntry | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saveMsg, setSaveMsg] = useState("")
  const [showSignConfirm, setShowSignConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [userName, setUserName] = useState("")

  useEffect(() => {
    getMe().then((me) => setUserName(me.username)).catch(() => {})
  }, [])

  useEffect(() => {
    getPatientForm(patientCode, formId)
      .then((f) => { setForm(f); setFormData(f.formData || {}) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [patientCode, formId])

  const handleSave = () => {
    setSaving(true)
    setSaveMsg("")
    updatePatientForm(patientCode, formId, { formData })
      .then((u) => { setForm({ ...u, templateFields: form?.templateFields }); setSaveMsg("Saved!") })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSaving(false))
  }

  const validateFields = (): string[] => {
    const fields = form?.templateFields || []
    const missing: string[] = []
    for (const field of fields) {
      if (field.optional) continue
      const val = formData[field.label]
      if (val === undefined || val === null || val === "") missing.push(field.label)
      else if (Array.isArray(val) && val.length === 0) missing.push(field.label)
      else if (typeof val === "number" && val < 0) missing.push(field.label)
    }
    return missing
  }

  const handleDelete = () => {
    setDeleting(true)
    deletePatientForm(patientCode, formId)
      .then(() => onDeleted())
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Delete failed"))
      .finally(() => setDeleting(false))
  }

  const handleSignComplete = () => {
    setSaving(true)
    setShowSignConfirm(false)
    updatePatientForm(patientCode, formId, { formData, status: "completed" })
      .then(() => onBack())
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSaving(false))
  }

  const handlePrint = () => {
    if (!form) return
    const fields = form.templateFields || []
    const statusLabel = form.status === "completed" ? "Completed" : "Draft"
    const createdDate = form.createdAt ? new Date(form.createdAt).toLocaleString() : "—"
    const updatedDate = form.updatedAt ? new Date(form.updatedAt).toLocaleString() : "—"

    const fieldRows = fields.map((field: TemplateField) => {
      const raw = formData[field.label]
      let display = "—"
      if (Array.isArray(raw)) display = raw.length > 0 ? raw.join(", ") : "—"
      else if (raw !== undefined && raw !== null && raw !== "") display = String(raw)
      return `
        <tr>
          <td class="label">${field.label}</td>
          <td class="value">${display.replace(/\n/g, "<br/>")}</td>
        </tr>`
    }).join("")

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${form.templateName} — ${patientName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 32px; }
    .header { border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { font-size: 18px; font-weight: bold; }
    .header .meta { display: flex; gap: 40px; margin-top: 8px; }
    .header .meta span { font-size: 11px; color: #555; }
    .header .meta strong { color: #111; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    tr { border-bottom: 1px solid #e0e0e0; }
    tr:last-child { border-bottom: none; }
    td { padding: 8px 6px; vertical-align: top; }
    td.label { width: 35%; font-weight: bold; color: #333; padding-right: 16px; }
    td.value { color: #111; }
    .section-title { font-size: 13px; font-weight: bold; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
    .footer { margin-top: 32px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 10px; color: #888; display: flex; justify-content: space-between; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${form.templateName}</h1>
    <div class="meta">
      <span>Patient: <strong>${patientName}</strong></span>
      <span>ID: <strong>${patientCode}</strong></span>
      <span>Category: <strong>${(form.templateCategory || "—").charAt(0).toUpperCase() + (form.templateCategory || "").slice(1)}</strong></span>
      <span>Status: <strong>${statusLabel}</strong></span>
    </div>
    <div class="meta">
      <span>Created: <strong>${createdDate}</strong></span>
      <span>Last Updated: <strong>${updatedDate}</strong></span>
      <span>Filled By: <strong>${form.filledByName || "—"}</strong></span>
    </div>
  </div>

  <div class="section-title">Form Fields</div>
  <table>
    <tbody>${fieldRows}</tbody>
  </table>

  ${form.status === "completed" ? `
  <div style="margin-top: 32px; border-top: 2px solid #222; padding-top: 16px;">
    <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-bottom: 10px;">Electronic Signature</div>
    ${form.signatureImage
      ? `<img src="${form.signatureImage}" alt="Signature" style="height: 60px; display: block; margin-bottom: 6px;" />`
      : `<p style="font-size: 18px; font-family: cursive; color: #1a1a2e; margin-bottom: 6px;">${form.signedByName || ""}</p>`}
    <div style="font-size: 11px; color: #555;">
      Signed by <strong>${form.signedByName || "—"}</strong>
      ${form.signedAt ? ` · ${new Date(form.signedAt).toLocaleString()}` : ""}
    </div>
  </div>` : ""}

  <div class="footer">
    <span>Printed: ${new Date().toLocaleString()}</span>
    <span>Form #${form.id}</span>
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, "_blank")
    if (win) win.addEventListener("afterprint", () => URL.revokeObjectURL(url))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !form) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-destructive">{error || "Form not found"}</p>
        <Button variant="outline" className="mt-3 bg-transparent text-foreground" onClick={onBack}>Back</Button>
      </div>
    )
  }

  const fields = form.templateFields || []
  const cfg = formStatusConfig[form.status] || formStatusConfig["draft"]
  const StatusIcon = cfg.icon
  const canEdit = form.accessLevel === "edit" || form.accessLevel === "sign"
  const canSign = form.accessLevel === "sign"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">{patientName} / Forms</p>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">{form.templateName}</h1>
        </div>
        <Badge variant="secondary" className={`text-xs ${cfg.color}`}>
          <StatusIcon className="mr-1 size-3" />{cfg.label}
        </Badge>
      </div>

      {/* Fields Card */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base font-heading font-semibold text-foreground">Form Fields</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {fields.map((field, idx) => (
            <div key={idx} className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-foreground">
                {idx + 1}. {field.label}
                {field.optional && <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>}
              </Label>
              {field.note && <p className="text-xs text-muted-foreground italic">{field.note}</p>}
              <FormFieldRenderer
                field={field}
                value={formData[field.label]}
                onChange={(val) => { setFormData((p) => ({ ...p, [field.label]: val })); setSaveMsg(""); setValidationErrors([]) }}
                disabled={form.status === "completed" || !canEdit}
              />
            </div>
          ))}
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No fields defined for this template.</p>
          )}

          <Separator />

          <div className="flex items-center gap-3">
            {form.status !== "completed" && canEdit && (
              <Button variant="outline" className="bg-transparent text-foreground" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Draft"}
              </Button>
            )}
            {form.status !== "completed" && canSign && (
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => {
                const errors = validateFields()
                setValidationErrors(errors)
                if (errors.length === 0) setShowSignConfirm(true)
              }} disabled={saving}>
                <PenLine className="mr-2 size-4" />Sign & Complete
              </Button>
            )}
            {form.status !== "completed" && canEdit && (
              <Button variant="outline" className="bg-transparent text-foreground" onClick={() => setShowClearConfirm(true)} disabled={saving}>
                Clear Fields
              </Button>
            )}
            <Button variant="outline" className="bg-transparent text-foreground" onClick={handlePrint}>
              <Printer className="mr-2 size-4" />Print
            </Button>
            {saveMsg && <span className="text-sm text-accent">{saveMsg}</span>}
            <div className="ml-auto">
              {canEdit && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteConfirm(true)} disabled={saving || deleting}>
                  <Trash2 className="mr-1.5 size-3.5" /> Delete
                </Button>
              )}
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm font-medium text-destructive mb-1">Please fill in all fields before signing:</p>
              <p className="text-sm text-destructive/80">{validationErrors.join(", ")}</p>
            </div>
          )}

          {/* Signature block — shown only on completed forms */}
          {form.status === "completed" && (
            <div className="p-4 bg-muted/30 border border-border/50 rounded-lg flex flex-col gap-2">
              {form.signatureImage ? (
                <Image src={form.signatureImage!} alt="Signature" width={440} height={120} unoptimized className="h-16 w-auto object-contain object-left" />
              ) : (
                <p className="text-sm italic text-muted-foreground">{form.signedByName || "—"}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Signed by <span className="font-medium text-foreground">{form.signedByName || "—"}</span></span>
                {form.signedAt && <span>· {new Date(form.signedAt).toLocaleString()}</span>}
              </div>
            </div>
          )}

          {/* Delete Confirmation Dialog */}
          <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="font-heading text-foreground">Delete Form</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete <span className="font-semibold text-foreground">{form.templateName}</span>? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="bg-transparent text-foreground" disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete Form"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Clear Fields Confirmation Dialog */}
          <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="font-heading text-foreground">Clear Form Fields</DialogTitle>
                <DialogDescription>
                  Are you sure you want to clear all fields on <span className="font-semibold text-foreground">{form.templateName}</span>? All entered data will be removed.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowClearConfirm(false)} className="bg-transparent text-foreground">
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => { setFormData({}); setSaveMsg(""); setValidationErrors([]); setShowClearConfirm(false) }}>
                  Clear Fields
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Sign Confirmation Dialog */}
          <Dialog open={showSignConfirm} onOpenChange={setShowSignConfirm}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="font-heading text-foreground">Confirm Signature</DialogTitle>
                <DialogDescription>
                  <span className="font-semibold text-foreground">{userName}</span> will be signing <span className="font-semibold text-foreground">{form.templateName}</span>. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowSignConfirm(false)} className="bg-transparent text-foreground" disabled={saving}>
                  Cancel
                </Button>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSignComplete} disabled={saving}>
                  {saving ? "Signing…" : "Confirm & Sign"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Details Card */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base font-heading font-semibold text-foreground">Form Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Form ID</p>
              <p className="text-sm font-medium font-mono text-foreground mt-1">{form.id}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="flex items-center gap-1.5 mt-1">
                <StatusIcon className="size-3.5" />
                <span className="text-sm font-medium text-foreground">{cfg.label}</span>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="text-sm font-medium text-foreground mt-1 capitalize">{form.templateCategory || "—"}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm font-medium text-foreground mt-1">{form.createdAt ? new Date(form.createdAt).toLocaleString() : "—"}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="text-sm font-medium text-foreground mt-1">{form.updatedAt ? new Date(form.updatedAt).toLocaleString() : "—"}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Filled By</p>
              <p className="text-sm font-medium text-foreground mt-1">{form.filledByName || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── New Form Dialog ───
function NewFormDialog({ patientCode, onCreated, categoryFilter }: { patientCode: string; onCreated: (formId: number) => void; categoryFilter?: string }) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      getTemplates()
        .then((t) => {
          const active = t.filter((tpl) => tpl.status === "active")
          setTemplates(categoryFilter ? active.filter((tpl) => tpl.category === categoryFilter) : active)
        })
        .catch(() => {})
    }
  }, [open, categoryFilter])

  const handleCreate = () => {
    if (!selectedTemplate) {
      setError("Please select a form template")
      return
    }
    setLoading(true)
    setError("")
    createPatientForm(patientCode, { templateId: parseInt(selectedTemplate), formData: {}, status: "draft" })
      .then((form) => {
        setOpen(false)
        setSelectedTemplate("")
        onCreated(form.id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to create"))
      .finally(() => setLoading(false))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 size-3.5" /> Add Form
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">Add Form</DialogTitle>
          <DialogDescription>Select a template to create a new form for this patient.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-foreground">Template</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Select a form template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    <div className="flex items-center gap-2">
                      <span>{t.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">({t.category})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplate && (() => {
            const tpl = templates.find((t) => t.id === parseInt(selectedTemplate))
            if (!tpl) return null
            return (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                  {tpl.isRecurring && (
                    <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
                      Every {tpl.recurrenceValue} {tpl.recurrenceUnit}
                    </Badge>
                  )}
                </div>
                {tpl.description && <p className="text-xs text-muted-foreground mt-1">{tpl.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">{tpl.fields.length} fields</p>
              </div>
            )
          })()}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent text-foreground" disabled={loading}>
              Cancel
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating…" : "Create Form"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ------- 42 CFR Part 2 Consent Section -------
const DEFAULT_SCOPE =
  "Information relating to the patient's diagnosis, prognosis, and treatment for substance use disorder (SUD), " +
  "including but not limited to alcohol and/or drug use treatment records."

function Part2ConsentSection({ patientCode }: { patientCode: string }) {
  const [consents, setConsents] = useState<Part2Consent[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showRevoke, setShowRevoke] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // New consent form state
  const [receivingParty, setReceivingParty] = useState("")
  const [purpose, setPurpose] = useState("")
  const [informationScope, setInformationScope] = useState(DEFAULT_SCOPE)
  const [expiration, setExpiration] = useState("")
  const [patientSignature, setPatientSignature] = useState("")
  const [acknowledged, setAcknowledged] = useState(false)

  // Revoke form state
  const [revokeReason, setRevokeReason] = useState("")

  const load = useCallback(() => {
    setLoading(true)
    getPart2Consents(patientCode)
      .then(setConsents)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [patientCode])

  useEffect(() => { load() }, [load])

  const activeConsent = consents.find((c) => c.status === "active")

  const resetNewForm = () => {
    setReceivingParty("")
    setPurpose("")
    setInformationScope(DEFAULT_SCOPE)
    setExpiration("")
    setPatientSignature("")
    setAcknowledged(false)
    setError("")
  }

  const handleCreate = async () => {
    if (!acknowledged) { setError("Patient must acknowledge their rights before signing."); return }
    setSubmitting(true)
    setError("")
    try {
      await createPart2Consent(patientCode, { receivingParty, purpose, informationScope, expiration, patientSignature })
      setShowNew(false)
      resetNewForm()
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save consent")
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevoke = async () => {
    if (!showRevoke) return
    setSubmitting(true)
    setError("")
    try {
      await revokePart2Consent(patientCode, showRevoke, revokeReason || undefined)
      setShowRevoke(null)
      setRevokeReason("")
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revoke consent")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeConsent
              ? <ShieldCheck className="size-4 text-chart-5" />
              : <ShieldAlert className="size-4 text-destructive" />}
            <CardTitle className="text-sm font-heading font-semibold text-foreground">
              42 CFR Part 2 Consent
            </CardTitle>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs bg-transparent text-foreground" onClick={() => { resetNewForm(); setShowNew(true) }}>
            <Plus className="mr-1 size-3" /> New Consent
          </Button>
        </div>

        {/* Status banner */}
        {!loading && (
          activeConsent ? (
            <div className="mt-2 flex items-start gap-2 rounded-md bg-chart-5/10 border border-chart-5/20 px-3 py-2">
              <ShieldCheck className="size-4 text-chart-5 shrink-0 mt-0.5" />
              <div className="text-xs text-foreground">
                <span className="font-semibold">Active consent on file</span>
                {" — "} Expires: <span className="font-medium">{activeConsent.expiration}</span>
                {" · "} Disclosed to: <span className="font-medium">{activeConsent.receivingParty}</span>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <ShieldAlert className="size-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive font-medium">
                No active 42 CFR Part 2 consent on file. Patient SUD information cannot be disclosed to any third party without written consent.
              </p>
            </div>
          )
        )}
      </CardHeader>

      {/* Consent history table */}
      {consents.length > 0 && (
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-muted-foreground">Receiving Party</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground hidden sm:table-cell">Purpose</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Expires</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {consents.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm font-medium text-foreground">{c.receivingParty}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{c.purpose}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.expiration}</TableCell>
                  <TableCell>
                    {c.status === "active"
                      ? <Badge variant="secondary" className="text-[10px] bg-chart-5/10 text-chart-5 border-chart-5/20">Active</Badge>
                      : <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">Revoked</Badge>}
                  </TableCell>
                  <TableCell>
                    {c.status === "active" && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive px-2"
                        onClick={() => { setShowRevoke(c.id); setError("") }}>
                        <XCircle className="size-3 mr-1" />Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}

      {/* New Consent Dialog */}
      <Dialog open={showNew} onOpenChange={(o) => { if (!o) { setShowNew(false); resetNewForm() } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">New 42 CFR Part 2 Consent</DialogTitle>
            <DialogDescription>
              Federal law (42 CFR Part 2) protects the confidentiality of SUD patient records.
              A separate written consent is required for each disclosure to a third party.
            </DialogDescription>
          </DialogHeader>

          {/* Federal prohibition notice */}
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground mb-1">Federal Prohibition Notice (42 CFR §2.32)</p>
            This information has been disclosed from records protected by federal confidentiality rules (42 CFR Part 2).
            Federal rules prohibit any further disclosure without express written consent of the patient or as otherwise
            permitted by 42 CFR Part 2. This information may not be used to criminally investigate or prosecute any patient.
          </div>

          <div className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-foreground">Receiving Party <span className="text-destructive">*</span></Label>
              <Input placeholder="Name of person or organization receiving information" value={receivingParty}
                onChange={(e) => setReceivingParty(e.target.value)} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-foreground">Purpose of Disclosure <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g., Insurance billing, continuity of care, court order" value={purpose}
                onChange={(e) => setPurpose(e.target.value)} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-foreground">Information to be Disclosed <span className="text-destructive">*</span></Label>
              <Textarea rows={3} value={informationScope} onChange={(e) => setInformationScope(e.target.value)} className="text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-foreground">Consent Expires <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g., 12/31/2026 or Upon completion of treatment" value={expiration}
                onChange={(e) => setExpiration(e.target.value)} className="h-9" />
            </div>

            {/* Patient rights acknowledgment */}
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground mb-1">Patient Rights</p>
              The patient understands they have the right to revoke this consent at any time, except to the extent that
              action has already been taken in reliance on it. Revocation does not affect information already disclosed.
              The patient also understands that treatment is not conditioned on signing this consent.
            </div>

            <div className="flex items-start gap-2">
              <Checkbox id="part2-ack" checked={acknowledged} onCheckedChange={(v) => setAcknowledged(!!v)} className="mt-0.5" />
              <Label htmlFor="part2-ack" className="text-xs text-foreground leading-relaxed cursor-pointer">
                I confirm the patient has read and understood their rights under 42 CFR Part 2 and consents voluntarily.
              </Label>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-foreground">Patient Signature (type full name) <span className="text-destructive">*</span></Label>
              <Input placeholder="Patient's full name as signature" value={patientSignature}
                onChange={(e) => setPatientSignature(e.target.value)} className="h-9 italic" />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="bg-transparent text-foreground" onClick={() => { setShowNew(false); resetNewForm() }} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting || !receivingParty || !purpose || !informationScope || !expiration || !patientSignature}>
              {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Record Consent
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke Consent Dialog */}
      <Dialog open={showRevoke !== null} onOpenChange={(o) => { if (!o) { setShowRevoke(null); setRevokeReason(""); setError("") } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Revoke Consent</DialogTitle>
            <DialogDescription>
              The patient has the right to revoke this consent at any time. Previously disclosed information is not affected.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-foreground">Reason for Revocation (optional)</Label>
              <Input placeholder="Patient-stated reason" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} className="h-9" />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="bg-transparent text-foreground" onClick={() => { setShowRevoke(null); setRevokeReason("") }} disabled={submitting}>Cancel</Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Confirm Revocation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ------- Patient Profile View -------
export function PatientProfileView({
  patientId,
  onBack,
  userRole,
  userPermissions = [],
}: {
  patientId: string
  onBack: () => void
  userRole?: string
  userPermissions?: string[]
}) {
  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [forms, setForms] = useState<PatientFormEntry[]>([])
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [loading, setLoading] = useState(true)
  const [loadingForms, setLoadingForms] = useState(true)
  const [error, setError] = useState("")
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<string>("")
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState("")
  const [showDischarge, setShowDischarge] = useState(false)
  const [dischargeReason, setDischargeReason] = useState("completed")

  const canAdmit = userPermissions.includes("frontdesk.patients.pending")
  const canDischarge = userPermissions.includes("archive.manage")
  const canEdit = userPermissions.includes("patients.edit")

  const [careTeams, setCareTeams] = useState<CareTeam[]>([])
  const [editCareTeamId, setEditCareTeamId] = useState("")

  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState("")

  const startEdit = (section: string, fields: Record<string, string>) => {
    setEditingSection(section)
    setEditForm(fields)
    setEditError("")
  }

  const cancelEdit = () => {
    setEditingSection(null)
    setEditForm({})
    setEditError("")
  }

  const saveEdit = async () => {
    if (!patient) return
    setEditSaving(true)
    setEditError("")
    try {
      const payload: Record<string, unknown> = { ...editForm }
      if (editingSection === "clinical") {
        payload.careTeamId = editCareTeamId && editCareTeamId !== "none" ? parseInt(editCareTeamId) : null
      }
      const updated = await updatePatient(patient.id, payload)
      setPatient((p: PatientDetail | null) => p ? { ...p, ...updated } : null)
      setEditingSection(null)
      setEditForm({})
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to save changes")
    } finally {
      setEditSaving(false)
    }
  }

  const ef = (field: string) => (e: { target: { value: string } }) =>
    setEditForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleAdmit = async () => {
    if (!patient) return
    setActionLoading(true)
    setActionError("")
    try {
      const updated = await admitPatient(patient.id)
      setPatient((p: PatientDetail | null) => p ? { ...p, ...updated } : null)
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed to admit patient")
    } finally {
      setActionLoading(false)
    }
  }

  const handleDischarge = async () => {
    if (!patient) return
    setActionLoading(true)
    setActionError("")
    try {
      const updated = await dischargePatient(patient.id, dischargeReason)
      setPatient((p: PatientDetail | null) => p ? { ...p, ...updated } : null)
      setShowDischarge(false)
      fetchForms()
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed to discharge patient")
      setShowDischarge(false)
    } finally {
      setActionLoading(false)
    }
  }

  const fetchPatient = useCallback(() => {
    getPatient(patientId)
      .then((data) => { setError(""); setPatient(data) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load patient"))
      .finally(() => setLoading(false))
  }, [patientId])

  useEffect(() => {
    fetchPatient()
  }, [fetchPatient])

  useEffect(() => {
    getCategories()
      .then((r) => setCategories(r.categories))
      .catch(() => {})
    listCareTeams().then(setCareTeams).catch(() => {})
  }, [patientId])

  useEffect(() => {
    getTemplates()
      .then((t) => setTemplates(t.filter((tpl) => tpl.status === "active")))
      .catch(() => {})
  }, [patientId])

  const fetchForms = useCallback(async () => {
    setLoadingForms(true)
    getPatientForms(patientId)
      .then(setForms)
      .catch(() => {})
      .finally(() => setLoadingForms(false))
  }, [patientId]);

  useEffect(() => {
    Promise.resolve().then(() => fetchForms())
  }, [patientId, fetchForms])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !patient) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-destructive">{error || "Patient not found"}</p>
        <Button variant="outline" onClick={onBack} className="bg-transparent text-foreground">
          <ArrowLeft className="mr-2 size-4" /> Back
        </Button>
      </div>
    )
  }

  if (selectedFormId) {
    return (
      <FormDetailView
        formId={selectedFormId}
        patientCode={patient.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
        onBack={() => { setSelectedFormId(null); fetchForms(); fetchPatient() }}
        onDeleted={() => { setSelectedFormId(null); fetchForms() }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="size-4" />
        </Button>
        <Avatar className="size-12">
          <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
            {patient.firstName[0]}{patient.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            {patient.firstName} {patient.lastName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {patient.id} &middot; {patient.insurance || "No insurance on file"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {patient.currentLoc && (
            <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
              LOC {patient.currentLoc}
            </Badge>
          )}
          <Badge variant="secondary" className={`text-xs ${riskColors[patient.riskLevel] || ""}`}>
            {patient.riskLevel} risk
          </Badge>
          {canAdmit && patient.status !== "active" && (
            <Button size="sm" onClick={handleAdmit} disabled={actionLoading} className="gap-1.5">
              <LogIn className="size-3.5" />
              {patient.status === "inactive" ? "Re-admit" : "Admit"}
            </Button>
          )}
          {canDischarge && patient.status === "active" && (
            <Button size="sm" variant="outline" onClick={() => setShowDischarge(true)} disabled={actionLoading} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10">
              <LogOut className="size-3.5" />
              Discharge
            </Button>
          )}
        </div>
      </div>
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {/* Discharge Dialog */}
      <Dialog open={showDischarge} onOpenChange={setShowDischarge}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discharge Patient</DialogTitle>
            <DialogDescription>
              Select a discharge reason for {patient.firstName} {patient.lastName}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Discharge Reason</Label>
              <Select value={dischargeReason} onValueChange={setDischargeReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed Program</SelectItem>
                  <SelectItem value="ama">Against Medical Advice (AMA)</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDischarge(false)} disabled={actionLoading}>Cancel</Button>
              <Button variant="destructive" onClick={handleDischarge} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="size-4 animate-spin" /> : "Discharge"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pending banner */}
      {patient.status === "pending" && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-chart-4/30 bg-chart-4/10">
          <AlertTriangle className="size-4 text-chart-4 shrink-0" />
          <p className="text-sm text-chart-4 font-medium">
            Pending Admission — complete intake forms before admitting this patient.
          </p>
        </div>
      )}

      {/* 42 CFR Part 2 Consent */}
      <Part2ConsentSection patientCode={patient.id} />

      {/* Patient Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Basic Info */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-heading font-semibold text-foreground">Basic Information</CardTitle>
            {canEdit && editingSection !== "basic" && (
              <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => startEdit("basic", {
                  firstName: patient.firstName || "",
                  lastName: patient.lastName || "",
                  dateOfBirth: patient.dateOfBirth || "",
                  ssnLast4: patient.ssnLast4 || "",
                  gender: patient.gender || "",
                  pronouns: patient.pronouns || "",
                  maritalStatus: patient.maritalStatus || "",
                  ethnicity: patient.ethnicity || "",
                  preferredLanguage: patient.preferredLanguage || "",
                  employmentStatus: patient.employmentStatus || "",
                })}>
                <PenLine className="size-3.5" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            {editingSection === "basic" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground mb-1">First Name</p><Input className="h-7 text-sm" value={editForm.firstName} onChange={ef("firstName")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Last Name</p><Input className="h-7 text-sm" value={editForm.lastName} onChange={ef("lastName")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Date of Birth</p><Input className="h-7 text-sm" value={editForm.dateOfBirth} onChange={ef("dateOfBirth")} placeholder="YYYY-MM-DD" /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">SSN (Last 4)</p><Input className="h-7 text-sm" value={editForm.ssnLast4} onChange={ef("ssnLast4")} maxLength={4} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Gender</p><Input className="h-7 text-sm" value={editForm.gender} onChange={ef("gender")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Pronouns</p><Input className="h-7 text-sm" value={editForm.pronouns} onChange={ef("pronouns")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Marital Status</p><Input className="h-7 text-sm" value={editForm.maritalStatus} onChange={ef("maritalStatus")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Ethnicity</p><Input className="h-7 text-sm" value={editForm.ethnicity} onChange={ef("ethnicity")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Language</p><Input className="h-7 text-sm" value={editForm.preferredLanguage} onChange={ef("preferredLanguage")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Employment</p><Input className="h-7 text-sm" value={editForm.employmentStatus} onChange={ef("employmentStatus")} /></div>
                </div>
                {editError && <p className="text-xs text-destructive">{editError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs" onClick={saveEdit} disabled={editSaving}>{editSaving ? "Saving…" : "Save"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><p className="text-xs text-muted-foreground">Date of Birth</p><p className="font-medium text-foreground">{patient.dateOfBirth || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">SSN (Last 4)</p><p className="font-medium text-foreground">{patient.ssnLast4 ? `••• ${patient.ssnLast4}` : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Gender</p><p className="font-medium text-foreground">{patient.gender || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Pronouns</p><p className="font-medium text-foreground">{patient.pronouns || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Marital Status</p><p className="font-medium text-foreground">{patient.maritalStatus || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Ethnicity</p><p className="font-medium text-foreground">{patient.ethnicity || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Language</p><p className="font-medium text-foreground">{patient.preferredLanguage || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Employment</p><p className="font-medium text-foreground">{patient.employmentStatus || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><p className="font-medium text-foreground capitalize">{patient.status}</p></div>
                {patient.admittedAt && (
                  <div><p className="text-xs text-muted-foreground">Admitted</p><p className="font-medium text-foreground">{new Date(patient.admittedAt).toLocaleDateString()}</p></div>
                )}
                {patient.dischargedAt && (
                  <div><p className="text-xs text-muted-foreground">Discharged</p><p className="font-medium text-foreground">{new Date(patient.dischargedAt).toLocaleDateString()}</p></div>
                )}
                {patient.dischargeReason && (
                  <div><p className="text-xs text-muted-foreground">Discharge Reason</p><p className="font-medium text-foreground capitalize">{patient.dischargeReason}</p></div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact & Address */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-heading font-semibold text-foreground">Contact & Address</CardTitle>
            {canEdit && editingSection !== "contact" && (
              <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => startEdit("contact", {
                  phone: patient.phone || "",
                  email: patient.email || "",
                  addressStreet: patient.addressStreet || "",
                  addressCity: patient.addressCity || "",
                  addressState: patient.addressState || "",
                  addressZip: patient.addressZip || "",
                })}>
                <PenLine className="size-3.5" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            {editingSection === "contact" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground mb-1">Phone</p><Input className="h-7 text-sm" value={editForm.phone} onChange={ef("phone")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Email</p><Input className="h-7 text-sm" value={editForm.email} onChange={ef("email")} /></div>
                  <div className="col-span-2"><p className="text-xs text-muted-foreground mb-1">Street</p><Input className="h-7 text-sm" value={editForm.addressStreet} onChange={ef("addressStreet")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">City</p><Input className="h-7 text-sm" value={editForm.addressCity} onChange={ef("addressCity")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">State</p><Input className="h-7 text-sm" value={editForm.addressState} onChange={ef("addressState")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Zip</p><Input className="h-7 text-sm" value={editForm.addressZip} onChange={ef("addressZip")} /></div>
                </div>
                {editError && <p className="text-xs text-destructive">{editError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs" onClick={saveEdit} disabled={editSaving}>{editSaving ? "Saving…" : "Save"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium text-foreground">{patient.phone || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium text-foreground">{patient.email || "—"}</p></div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-medium text-foreground">
                    {[patient.addressStreet, patient.addressCity, patient.addressState, patient.addressZip].filter(Boolean).join(", ") || "—"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-heading font-semibold text-foreground">Emergency Contact</CardTitle>
            {canEdit && editingSection !== "emergency" && (
              <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => startEdit("emergency", {
                  emergencyContactName: patient.emergencyContactName || "",
                  emergencyContactPhone: patient.emergencyContactPhone || "",
                  emergencyContactRelationship: patient.emergencyContactRelationship || "",
                })}>
                <PenLine className="size-3.5" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            {editingSection === "emergency" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground mb-1">Name</p><Input className="h-7 text-sm" value={editForm.emergencyContactName} onChange={ef("emergencyContactName")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Relationship</p><Input className="h-7 text-sm" value={editForm.emergencyContactRelationship} onChange={ef("emergencyContactRelationship")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Phone</p><Input className="h-7 text-sm" value={editForm.emergencyContactPhone} onChange={ef("emergencyContactPhone")} /></div>
                </div>
                {editError && <p className="text-xs text-destructive">{editError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs" onClick={saveEdit} disabled={editSaving}>{editSaving ? "Saving…" : "Save"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium text-foreground">{patient.emergencyContactName || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Relationship</p><p className="font-medium text-foreground">{patient.emergencyContactRelationship || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium text-foreground">{patient.emergencyContactPhone || "—"}</p></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clinical */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-heading font-semibold text-foreground">Clinical</CardTitle>
            {canEdit && editingSection !== "clinical" && (
              <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setEditCareTeamId(patient.careTeamId ? String(patient.careTeamId) : "none")
                  startEdit("clinical", {
                    primaryDiagnosis: patient.primaryDiagnosis || "",
                    insurance: patient.insurance || "",
                    referringProvider: patient.referringProvider || "",
                    primaryCarePhysician: patient.primaryCarePhysician || "",
                    pharmacy: patient.pharmacy || "",
                    currentMedications: patient.currentMedications || "",
                    allergies: patient.allergies || "",
                  })
                }}>
                <PenLine className="size-3.5" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            {editingSection === "clinical" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground mb-1">Diagnosis</p><Input className="h-7 text-sm" value={editForm.primaryDiagnosis} onChange={ef("primaryDiagnosis")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Insurance</p><Input className="h-7 text-sm" value={editForm.insurance} onChange={ef("insurance")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Referring Provider</p><Input className="h-7 text-sm" value={editForm.referringProvider} onChange={ef("referringProvider")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Primary Care Physician</p><Input className="h-7 text-sm" value={editForm.primaryCarePhysician} onChange={ef("primaryCarePhysician")} /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Pharmacy</p><Input className="h-7 text-sm" value={editForm.pharmacy} onChange={ef("pharmacy")} /></div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Care Team</p>
                    <Select value={editCareTeamId} onValueChange={setEditCareTeamId}>
                      <SelectTrigger className="h-7 text-sm">
                        <SelectValue placeholder="No care team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No care team (visible to all)</SelectItem>
                        {careTeams.map((ct) => (
                          <SelectItem key={ct.id} value={String(ct.id)}>
                            {ct.name} ({ct.members.length} members)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><p className="text-xs text-muted-foreground mb-1">Current Medications</p><Textarea className="text-sm min-h-[60px]" value={editForm.currentMedications} onChange={ef("currentMedications")} /></div>
                  <div className="col-span-2"><p className="text-xs text-muted-foreground mb-1">Allergies</p><Textarea className="text-sm min-h-[60px]" value={editForm.allergies} onChange={ef("allergies")} /></div>
                </div>
                {editError && <p className="text-xs text-destructive">{editError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs" onClick={saveEdit} disabled={editSaving}>{editSaving ? "Saving…" : "Save"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><p className="text-xs text-muted-foreground">ASAM LOC</p><p className="font-medium text-foreground">{patient.currentLoc ? `LOC ${patient.currentLoc}` : "Not assessed"}</p></div>
                <div><p className="text-xs text-muted-foreground">Diagnosis</p><p className="font-medium text-foreground">{patient.primaryDiagnosis || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Insurance</p><p className="font-medium text-foreground">{patient.insurance || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Care Team</p><p className="font-medium text-foreground">{patient.careTeamName || "Unassigned"}</p></div>
                <div><p className="text-xs text-muted-foreground">Referring Provider</p><p className="font-medium text-foreground">{patient.referringProvider || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Primary Care Physician</p><p className="font-medium text-foreground">{patient.primaryCarePhysician || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Pharmacy</p><p className="font-medium text-foreground">{patient.pharmacy || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Medications</p><p className="font-medium text-foreground whitespace-pre-line">{patient.currentMedications || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Allergies</p><p className="font-medium text-foreground whitespace-pre-line">{patient.allergies || "—"}</p></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category Tabs */}
      {(() => {
        // Use tenant-configured order from API; append any template categories not yet in the list
        const allCategories = [...new Set([...categories, ...templates.map((t: FormTemplate) => t.category)])]
        const visibleCategories = allCategories
        return (
          <Tabs value={activeTab || visibleCategories[0] || ""} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap h-auto gap-1.5 bg-transparent p-0 border-b border-border pb-2">
              {visibleCategories.map((cat: string) => (
                <TabsTrigger
                  key={cat}
                  value={cat}
                  className="capitalize text-xs border rounded-md px-3 py-1.5 transition-all
                    border-primary/25 bg-primary/5 text-foreground/70 hover:bg-primary/10 hover:text-foreground
                    data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:font-medium"
                >
                  {cat}
                  {(() => {
                    const count = forms.filter((f) => f.templateCategory === cat).length
                    return count > 0 ? <span className="ml-1.5 text-[10px] opacity-80">({count})</span> : null
                  })()}
                </TabsTrigger>
              ))}
            </TabsList>

            {visibleCategories.map((cat: string) => {
              const catForms = forms.filter((f) => f.templateCategory === cat)
              return (
                <TabsContent key={cat} value={cat} className="mt-3">
                  <Card className="border-border/60">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-heading font-semibold text-foreground capitalize">
                          {cat} Forms
                          <span className="ml-2 text-sm font-normal text-muted-foreground">({catForms.length})</span>
                        </CardTitle>
                        <NewFormDialog
                          patientCode={patient.id}
                          categoryFilter={cat}
                          onCreated={(formId) => { fetchForms(); setSelectedFormId(formId) }}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {loadingForms ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="text-xs font-semibold text-muted-foreground">Form Name</TableHead>
                              <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                              <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Created</TableHead>
                              <TableHead className="text-xs font-semibold text-muted-foreground hidden lg:table-cell">Last Updated</TableHead>
                              <TableHead className="text-xs font-semibold text-muted-foreground w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {catForms.map((form) => {
                              const fc = formStatusConfig[form.status] || formStatusConfig["draft"]
                              const FIcon = fc.icon
                              return (
                                <TableRow key={form.id} className="cursor-pointer transition-colors" onClick={() => setSelectedFormId(form.id)}>
                                  <TableCell>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-foreground">{form.templateName}</p>
                                        {form.templateCategory === "flowsheet" && (
                                          <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">Recurring</Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground">#{form.id}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary" className={`text-[10px] ${fc.color}`}>
                                      <FIcon className="mr-1 size-3" />{fc.label}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="hidden md:table-cell">
                                    <span className="text-sm text-muted-foreground">
                                      {form.createdAt ? new Date(form.createdAt).toLocaleString() : "—"}
                                    </span>
                                  </TableCell>
                                  <TableCell className="hidden lg:table-cell">
                                    <span className="text-sm text-muted-foreground">
                                      {form.updatedAt ? new Date(form.updatedAt).toLocaleString() : "—"}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <ChevronRight className="size-4 text-muted-foreground" />
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                            {catForms.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                                  No {cat} forms yet for this patient.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )
            })}
          </Tabs>
        )
      })()}

    </div>
  )
}


// ------- Patient Table (reusable) -------
function PatientTable({
  patients,
  onSelect,
  emptyMessage,
}: {
  patients: Patient[]
  onSelect: (id: string) => void
  emptyMessage: string
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-xs font-semibold text-muted-foreground">Patient</TableHead>
          <TableHead className="text-xs font-semibold text-muted-foreground hidden sm:table-cell">Insurance</TableHead>
          <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Care Team</TableHead>
          <TableHead className="text-xs font-semibold text-muted-foreground">Risk</TableHead>
          <TableHead className="text-xs font-semibold text-muted-foreground w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {patients.map((patient) => (
          <TableRow
            key={patient.id}
            className="cursor-pointer transition-colors"
            onClick={() => onSelect(patient.id)}
          >
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {patient.firstName[0]}{patient.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {patient.firstName} {patient.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{patient.id}</p>
                </div>
              </div>
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <span className="text-sm text-foreground">{patient.insurance || "—"}</span>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <span className="text-sm text-muted-foreground">{patient.careTeamName || "Unassigned"}</span>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className={`text-[10px] capitalize ${riskColors[patient.riskLevel] || ""}`}>
                {patient.riskLevel}
              </Badge>
            </TableCell>
            <TableCell>
              <ChevronRight className="size-4 text-muted-foreground" />
            </TableCell>
          </TableRow>
        ))}
        {patients.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

// ------- Main Patients View -------
export function PatientsView({
  initialFilter,
  initialPatientId,
  userRole,
  userPermissions = [],
}: {
  initialFilter?: string | null
  initialPatientId?: string
  userRole?: string
  userPermissions?: string[]
}) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(initialPatientId || null)

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    setError("")
    getPatients()
      .then(setPatients)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => fetchPatients())
  }, [fetchPatients])

  // If viewing a patient profile
  if (selectedPatientId) {
    return (
      <PatientProfileView
        patientId={selectedPatientId}
        onBack={() => { setSelectedPatientId(null); fetchPatients() }}
        userRole={userRole}
        userPermissions={userPermissions}
      />
    )
  }

  // Search filter (applies to both sections)
  const matchesSearch = (p: Patient) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.insurance || "").toLowerCase().includes(q)
    )
  }

  const activePatients = patients.filter((p) => p.status === "active" && matchesSearch(p))

  const activeCount = patients.filter((p) => p.status === "active").length
  const inactiveCount = patients.filter((p) => p.status === "inactive").length
  const highRiskCount = patients.filter((p) => p.riskLevel === "high" && p.status === "active").length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Patients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your patient roster</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="size-3.5 text-primary" />
              <p className="text-xs text-muted-foreground font-medium">Total</p>
            </div>
            <p className="text-xl font-bold font-heading text-foreground">{patients.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="size-3.5 text-accent" />
              <p className="text-xs text-muted-foreground font-medium">Active</p>
            </div>
            <p className="text-xl font-bold font-heading text-accent">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Archive className="size-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Inactive</p>
            </div>
            <p className="text-xl font-bold font-heading text-muted-foreground">{inactiveCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="size-3.5 text-destructive" />
              <p className="text-xs text-muted-foreground font-medium">High Risk</p>
            </div>
            <p className="text-xl font-bold font-heading text-destructive">{highRiskCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, ID, or insurance..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="mt-3 bg-transparent text-foreground" onClick={fetchPatients}>
            Retry
          </Button>
        </div>
      )}

      {/* Active Patients */}
      {!loading && !error && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading font-semibold text-foreground">
              Active Patients ({activePatients.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PatientTable
              patients={activePatients}
              onSelect={setSelectedPatientId}
              emptyMessage={searchQuery ? "No active patients match your search." : "No active patients."}
            />
          </CardContent>
        </Card>
      )}

    </div>
  )
}