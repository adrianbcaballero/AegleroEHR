"use client"

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
  ChevronDown,
  Archive,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { getPatients, getPatient, createPatient, getPatientForms, getPatientForm, createPatientForm, updatePatientForm, deletePatientForm, getTemplates, getMe, updatePatient, getPart2Consents, createPart2Consent, revokePart2Consent, getCategories } from "@/lib/api"
import type { Patient, PatientDetail, PatientFormEntry, FormTemplate, TemplateField, Part2Consent } from "@/lib/api"

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
function FormFieldRenderer({ field, value, onChange }: { field: TemplateField; value: unknown; onChange: (v: string | number | string[]) => void }) {
  switch (field.type) {
    case "text":
      return <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.label} />
    case "textarea":
      return <Textarea value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.label} className="min-h-[80px]" />
    case "number":
      return <Input type="number" value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.label} />
    case "date":
      return <Input type="date" value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />

    case "checkbox": {
      const opts = field.options || ["Yes", "No"]
      const cur = (value as string) || ""
      return (
        <div className="flex gap-3">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={cur === o} onCheckedChange={() => onChange(o)} />
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
            <label key={o} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={sel.includes(o)}
                onCheckedChange={(c) => onChange(c ? [...sel, o] : sel.filter((s) => s !== o))}
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
        <Select value={(value as string) || ""} onValueChange={onChange}>
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
                className={`size-10 rounded-lg border text-sm font-medium transition-colors ${cur === n ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-foreground border-border hover:bg-muted"}`}
                onClick={() => onChange(n)}
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
          <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder="Type full name as signature" className="italic" />
          {!!value && <p className="text-xs text-muted-foreground">Signed electronically on {new Date().toLocaleDateString()}</p>}
        </div>
      )

    default:
      return <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.label} />
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
              <Label className="text-sm font-medium text-foreground">{idx + 1}. {field.label}</Label>
              <FormFieldRenderer
                field={field}
                value={formData[field.label]}
                onChange={(val) => { setFormData((p) => ({ ...p, [field.label]: val })); setSaveMsg(""); setValidationErrors([]) }}
              />
            </div>
          ))}
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No fields defined for this template.</p>
          )}

          <Separator />

          <div className="flex items-center gap-3">
            <Button variant="outline" className="bg-transparent text-foreground" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Draft"}
            </Button>
            {form.status !== "completed" && (
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => {
                const errors = validateFields()
                setValidationErrors(errors)
                if (errors.length === 0) setShowSignConfirm(true)
              }} disabled={saving}>
                <PenLine className="mr-2 size-4" />Sign & Complete
              </Button>
            )}
            {saveMsg && <span className="text-sm text-accent">{saveMsg}</span>}
            <div className="ml-auto">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteConfirm(true)} disabled={saving || deleting}>
                <Trash2 className="mr-1.5 size-3.5" /> Delete
              </Button>
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm font-medium text-destructive mb-1">Please fill in all fields before signing:</p>
              <p className="text-sm text-destructive/80">{validationErrors.join(", ")}</p>
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
              <p className="text-sm font-medium text-foreground mt-1">{form.createdAt ? new Date(form.createdAt).toLocaleDateString() : "—"}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="text-sm font-medium text-foreground mt-1">{form.updatedAt ? new Date(form.updatedAt).toLocaleDateString() : "—"}</p>
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
                <p className="text-sm font-medium text-foreground">{tpl.name}</p>
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
function PatientProfileView({
  patientId,
  onBack,
}: {
  patientId: string
  onBack: () => void
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

  useEffect(() => {
    getPatient(patientId)
      .then((data) => { setError(""); setPatient(data) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load patient"))
      .finally(() => setLoading(false))
  }, [patientId])

  useEffect(() => {
    getCategories()
      .then((r) => setCategories(r.categories))
      .catch(() => {})
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
        onBack={() => { setSelectedFormId(null); fetchForms() }}
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
            {patient.id} &middot; {patient.primaryDiagnosis || "No diagnosis"}
          </p>
        </div>
        <Badge variant="secondary" className={`ml-auto text-xs ${riskColors[patient.riskLevel] || ""}`}>
          {patient.riskLevel} risk
        </Badge>
      </div>

      {/* 42 CFR Part 2 Consent */}
      <Part2ConsentSection patientCode={patient.id} />

      {/* Patient Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Basic Info */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading font-semibold text-foreground">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><p className="text-xs text-muted-foreground">Date of Birth</p><p className="font-medium text-foreground">{patient.dateOfBirth || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">SSN (Last 4)</p><p className="font-medium text-foreground">{patient.ssnLast4 ? `••• ${patient.ssnLast4}` : "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Gender</p><p className="font-medium text-foreground">{patient.gender || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Pronouns</p><p className="font-medium text-foreground">{patient.pronouns || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Marital Status</p><p className="font-medium text-foreground">{patient.maritalStatus || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Ethnicity</p><p className="font-medium text-foreground">{patient.ethnicity || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Language</p><p className="font-medium text-foreground">{patient.preferredLanguage || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Employment</p><p className="font-medium text-foreground">{patient.employmentStatus || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Status</p><p className="font-medium text-foreground capitalize">{patient.status}</p></div>
          </CardContent>
        </Card>

        {/* Contact & Address */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading font-semibold text-foreground">Contact & Address</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium text-foreground">{patient.phone || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium text-foreground">{patient.email || "—"}</p></div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Address</p>
              <p className="font-medium text-foreground">
                {[patient.addressStreet, patient.addressCity, patient.addressState, patient.addressZip].filter(Boolean).join(", ") || "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading font-semibold text-foreground">Emergency Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium text-foreground">{patient.emergencyContactName || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Relationship</p><p className="font-medium text-foreground">{patient.emergencyContactRelationship || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium text-foreground">{patient.emergencyContactPhone || "—"}</p></div>
          </CardContent>
        </Card>

        {/* Clinical */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading font-semibold text-foreground">Clinical</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><p className="text-xs text-muted-foreground">Diagnosis</p><p className="font-medium text-foreground">{patient.primaryDiagnosis || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Insurance</p><p className="font-medium text-foreground">{patient.insurance || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Provider</p><p className="font-medium text-foreground">{patient.assignedProvider || "Unassigned"}</p></div>
            <div><p className="text-xs text-muted-foreground">Referring Provider</p><p className="font-medium text-foreground">{patient.referringProvider || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Primary Care Physician</p><p className="font-medium text-foreground">{patient.primaryCarePhysician || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Pharmacy</p><p className="font-medium text-foreground">{patient.pharmacy || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Medications</p><p className="font-medium text-foreground whitespace-pre-line">{patient.currentMedications || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Allergies</p><p className="font-medium text-foreground whitespace-pre-line">{patient.allergies || "—"}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Category Tabs */}
      {(() => {
        // Use tenant-configured order from API; append any template categories not yet in the list
        const allCategories = [...new Set([...categories, ...templates.map((t: FormTemplate) => t.category)])]
        return (
          <Tabs value={activeTab || allCategories[0] || ""} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap h-auto gap-1.5 bg-transparent p-0 border-b border-border pb-2">
              {allCategories.map((cat: string) => (
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

            {allCategories.map((cat: string) => {
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
                              <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Date</TableHead>
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
                                      <p className="text-sm font-medium text-foreground">{form.templateName}</p>
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
                                      {form.createdAt ? new Date(form.createdAt).toLocaleDateString() : "—"}
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

// ------- New Patient Dialog -------
function NewPatientDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showMore, setShowMore] = useState(false)

  const [form, setForm] = useState({
    firstName: "", lastName: "", dob: "", phone: "", email: "",
    insurance: "", diagnosis: "", gender: "", pronouns: "", ssnLast4: "",
    maritalStatus: "", preferredLanguage: "", ethnicity: "", employmentStatus: "",
    addressStreet: "", addressCity: "", addressState: "", addressZip: "",
    emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelationship: "",
    currentMedications: "", allergies: "", referringProvider: "", primaryCarePhysician: "", pharmacy: "",
  })

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const resetForm = () => {
    setForm({
      firstName: "", lastName: "", dob: "", phone: "", email: "",
      insurance: "", diagnosis: "", gender: "", pronouns: "", ssnLast4: "",
      maritalStatus: "", preferredLanguage: "", ethnicity: "", employmentStatus: "",
      addressStreet: "", addressCity: "", addressState: "", addressZip: "",
      emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelationship: "",
      currentMedications: "", allergies: "", referringProvider: "", primaryCarePhysician: "", pharmacy: "",
    })
    setError("")
    setShowMore(false)
  }

  const handleCreate = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required")
      return
    }

    setLoading(true)
    setError("")

    const payload: Record<string, unknown> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
    }
    if (form.dob) payload.dateOfBirth = form.dob
    if (form.phone.trim()) payload.phone = form.phone.trim()
    if (form.email.trim()) payload.email = form.email.trim()
    if (form.insurance.trim()) payload.insurance = form.insurance.trim()
    if (form.diagnosis.trim()) payload.primaryDiagnosis = form.diagnosis.trim()
    if (form.ssnLast4.trim()) payload.ssnLast4 = form.ssnLast4.trim()
    if (form.gender.trim()) payload.gender = form.gender.trim()
    if (form.pronouns.trim()) payload.pronouns = form.pronouns.trim()
    if (form.maritalStatus.trim()) payload.maritalStatus = form.maritalStatus.trim()
    if (form.preferredLanguage.trim()) payload.preferredLanguage = form.preferredLanguage.trim()
    if (form.ethnicity.trim()) payload.ethnicity = form.ethnicity.trim()
    if (form.employmentStatus.trim()) payload.employmentStatus = form.employmentStatus.trim()
    if (form.addressStreet.trim()) payload.addressStreet = form.addressStreet.trim()
    if (form.addressCity.trim()) payload.addressCity = form.addressCity.trim()
    if (form.addressState.trim()) payload.addressState = form.addressState.trim()
    if (form.addressZip.trim()) payload.addressZip = form.addressZip.trim()
    if (form.emergencyContactName.trim()) payload.emergencyContactName = form.emergencyContactName.trim()
    if (form.emergencyContactPhone.trim()) payload.emergencyContactPhone = form.emergencyContactPhone.trim()
    if (form.emergencyContactRelationship.trim()) payload.emergencyContactRelationship = form.emergencyContactRelationship.trim()
    if (form.currentMedications.trim()) payload.currentMedications = form.currentMedications.trim()
    if (form.allergies.trim()) payload.allergies = form.allergies.trim()
    if (form.referringProvider.trim()) payload.referringProvider = form.referringProvider.trim()
    if (form.primaryCarePhysician.trim()) payload.primaryCarePhysician = form.primaryCarePhysician.trim()
    if (form.pharmacy.trim()) payload.pharmacy = form.pharmacy.trim()

    try {
      await createPatient(payload)
      resetForm()
      setOpen(false)
      onCreated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create patient")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 size-4" />
          New Patient
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">Add New Patient</DialogTitle>
          <DialogDescription>Enter patient information below. Only name is required.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-2">

          {/* Basic Info */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Basic Information</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">First Name *</Label>
                <Input placeholder="First name" value={form.firstName} onChange={set("firstName")} disabled={loading} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">Last Name *</Label>
                <Input placeholder="Last name" value={form.lastName} onChange={set("lastName")} disabled={loading} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">Date of Birth</Label>
                <Input type="date" value={form.dob} onChange={set("dob")} disabled={loading} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">SSN (Last 4)</Label>
                <Input placeholder="0000" maxLength={4} value={form.ssnLast4} onChange={set("ssnLast4")} disabled={loading} />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">Phone</Label>
                <Input placeholder="(555) 000-0000" value={form.phone} onChange={set("phone")} disabled={loading} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">Email</Label>
                <Input type="email" placeholder="patient@email.com" value={form.email} onChange={set("email")} disabled={loading} />
              </div>
            </div>
          </div>

          {/* Clinical */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Clinical</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">Primary Diagnosis</Label>
                <Input placeholder="e.g. Major Depressive Disorder" value={form.diagnosis} onChange={set("diagnosis")} disabled={loading} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">Insurance</Label>
                <Input placeholder="Insurance provider" value={form.insurance} onChange={set("insurance")} disabled={loading} />
              </div>
            </div>
          </div>

          {/* Expandable section */}
          <button
            type="button"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowMore(!showMore)}
          >
            {showMore ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {showMore ? "Hide additional fields" : "Show additional fields (demographics, address, emergency contact, etc.)"}
          </button>

          {showMore && (
            <>
              {/* Demographics */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Demographics</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Gender</Label>
                    <Input placeholder="e.g. Female, Male, Non-binary" value={form.gender} onChange={set("gender")} disabled={loading} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Pronouns</Label>
                    <Input placeholder="e.g. she/her, he/him, they/them" value={form.pronouns} onChange={set("pronouns")} disabled={loading} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Marital Status</Label>
                    <Input placeholder="e.g. Single, Married, Divorced" value={form.maritalStatus} onChange={set("maritalStatus")} disabled={loading} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Ethnicity</Label>
                    <Input placeholder="e.g. Hispanic/Latino" value={form.ethnicity} onChange={set("ethnicity")} disabled={loading} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Preferred Language</Label>
                    <Input placeholder="e.g. English, Spanish" value={form.preferredLanguage} onChange={set("preferredLanguage")} disabled={loading} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Employment Status</Label>
                    <Input placeholder="e.g. Employed, Unemployed, Student" value={form.employmentStatus} onChange={set("employmentStatus")} disabled={loading} />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Address</p>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Street</Label>
                    <Input placeholder="123 Main St" value={form.addressStreet} onChange={set("addressStreet")} disabled={loading} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm font-medium text-foreground">City</Label>
                      <Input placeholder="City" value={form.addressCity} onChange={set("addressCity")} disabled={loading} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm font-medium text-foreground">State</Label>
                      <Input placeholder="CA" value={form.addressState} onChange={set("addressState")} disabled={loading} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm font-medium text-foreground">ZIP</Label>
                      <Input placeholder="90241" value={form.addressZip} onChange={set("addressZip")} disabled={loading} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Emergency Contact</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Name</Label>
                    <Input placeholder="Contact name" value={form.emergencyContactName} onChange={set("emergencyContactName")} disabled={loading} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Phone</Label>
                    <Input placeholder="(555) 000-0000" value={form.emergencyContactPhone} onChange={set("emergencyContactPhone")} disabled={loading} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Relationship</Label>
                    <Input placeholder="e.g. Spouse, Parent" value={form.emergencyContactRelationship} onChange={set("emergencyContactRelationship")} disabled={loading} />
                  </div>
                </div>
              </div>

              {/* Medical */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Medical</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Current Medications</Label>
                    <Textarea placeholder="List current medications" value={form.currentMedications} onChange={set("currentMedications")} disabled={loading} rows={2} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Allergies</Label>
                    <Textarea placeholder="List known allergies" value={form.allergies} onChange={set("allergies")} disabled={loading} rows={2} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Referring Provider</Label>
                    <Input placeholder="Dr. name" value={form.referringProvider} onChange={set("referringProvider")} disabled={loading} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-foreground">Primary Care Physician</Label>
                    <Input placeholder="Dr. name" value={form.primaryCarePhysician} onChange={set("primaryCarePhysician")} disabled={loading} />
                  </div>
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <Label className="text-sm font-medium text-foreground">Pharmacy</Label>
                    <Input placeholder="Pharmacy name and location" value={form.pharmacy} onChange={set("pharmacy")} disabled={loading} />
                  </div>
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Separator />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent text-foreground" disabled={loading}>
              Cancel
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating…" : "Create Patient"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
          <TableHead className="text-xs font-semibold text-muted-foreground hidden sm:table-cell">Diagnosis</TableHead>
          <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Provider</TableHead>
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
              <span className="text-sm text-foreground">{patient.primaryDiagnosis || "—"}</span>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <span className="text-sm text-muted-foreground">{patient.assignedProvider || "Unassigned"}</span>
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
}: {
  initialFilter?: string | null
  initialPatientId?: string
}) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(initialPatientId || null)
  const [archivedOpen, setArchivedOpen] = useState(false)

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
      (p.primaryDiagnosis || "").toLowerCase().includes(q)
    )
  }

  const activePatients = patients.filter((p) => p.status !== "archived" && matchesSearch(p))
  const archivedPatients = patients.filter((p) => p.status === "archived" && matchesSearch(p))

  const activeCount = patients.filter((p) => p.status !== "archived").length
  const archivedCount = patients.filter((p) => p.status === "archived").length
  const highRiskCount = patients.filter((p) => p.riskLevel === "high" && p.status !== "archived").length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Patients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your patient roster</p>
        </div>
        <NewPatientDialog onCreated={fetchPatients} />
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
              <p className="text-xs text-muted-foreground font-medium">Archived</p>
            </div>
            <p className="text-xl font-bold font-heading text-muted-foreground">{archivedCount}</p>
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
          placeholder="Search by name, ID, or diagnosis..."
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

      {/* Archived Patients — Collapsible */}
      {!loading && !error && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <button
              type="button"
              className="flex items-center gap-2 w-full text-left"
              onClick={() => setArchivedOpen(!archivedOpen)}
            >
              {archivedOpen ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
              <CardTitle className="text-base font-heading font-semibold text-muted-foreground">
                Archived Patients ({archivedPatients.length})
              </CardTitle>
            </button>
          </CardHeader>
          {archivedOpen && (
            <CardContent className="p-0">
              <PatientTable
                patients={archivedPatients}
                onSelect={setSelectedPatientId}
                emptyMessage={searchQuery ? "No archived patients match your search." : "No archived patients."}
              />
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}