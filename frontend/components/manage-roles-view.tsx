"use client"

import { useState, useEffect } from "react"
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ShieldCheck,
  ArrowLeft,
  X,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
} from "@/lib/api"
import type { Role } from "@/lib/api"

// ─── Page bundle definitions ────────────────────────────────────────────────

type Bundle = { key: string; label: string; description: string; permissions: string[] }
type BundleGroup = { label: string; bundles: Bundle[] }

const BUNDLE_GROUPS: BundleGroup[] = [
  {
    label: "Patients",
    bundles: [
      {
        key: "patients.view",
        label: "View Patients",
        description: "Access the patients page and view assigned patient records",
        permissions: ["patients.view"],
      },
      {
        key: "patients.view.all",
        label: "View All Patients",
        description: "See all patients regardless of care team or assignment",
        permissions: ["patients.view.all"],
      },
      {
        key: "patients.edit",
        label: "Edit Patient Records",
        description: "Update patient demographics, notes, and assignments",
        permissions: ["patients.edit"],
      },
      {
        key: "patients.consent",
        label: "Consent Management",
        description: "Create and revoke 42 CFR Part 2 patient consent records",
        permissions: ["consent.manage"],
      },
    ],
  },
  {
    label: "Front Desk",
    bundles: [
      {
        key: "frontdesk.view",
        label: "View Front Desk",
        description: "Access the front desk page (admissions + bed board)",
        permissions: ["frontdesk.view"],
      },
      {
        key: "frontdesk.beds.manage",
        label: "Manage Beds",
        description: "Access the Manage Beds page to create, edit, and delete bed inventory",
        permissions: ["frontdesk.beds.manage"],
      },
      {
        key: "frontdesk.patients.create",
        label: "Add Patients via Front Desk",
        description: "Register new patients directly from the front desk",
        permissions: ["frontdesk.patients.create"],
      },
      {
        key: "frontdesk.patients.pending",
        label: "Work Pending Patients",
        description: "Admit, readmit, and reject pending patients; assign, transfer, and manage beds on the bed board",
        permissions: ["frontdesk.patients.pending"],
      },
    ],
  },
  {
    label: "Archive",
    bundles: [
      {
        key: "archive.view",
        label: "View Archive",
        description: "Access the archive page and search discharged / inactive patients",
        permissions: ["archive.view"],
      },
      {
        key: "archive.manage",
        label: "Manage Archive",
        description: "Discharge and reactivate patients from the archive",
        permissions: ["archive.manage"],
      },
      {
        key: "archive.export",
        label: "Export Records",
        description: "Export patient records from the archive",
        permissions: ["archive.export"],
      },
      {
        key: "archive.forms.manage",
        label: "Manage Archived Forms",
        description: "Add, edit, and delete forms on archived or discharged patients",
        permissions: ["archive.forms.manage"],
      },
    ],
  },
  {
    label: "Workflows",
    bundles: [
      {
        key: "workflows.manage",
        label: "Manage Workflows",
        description: "Access the workflows page; create, edit, and archive templates and categories",
        permissions: ["workflows.manage"],
      },
    ],
  },
  {
    label: "Forms",
    bundles: [
      {
        key: "forms.delete_completed",
        label: "Delete Completed Forms",
        description: "Allow deletion of signed, completed forms (legal medical records)",
        permissions: ["forms.delete_completed"],
      },
    ],
  },
  {
    label: "Administration",
    bundles: [
      {
        key: "admin.users.manage",
        label: "Manage Users",
        description: "View user list; create, edit, lock, and unlock user accounts",
        permissions: ["users.manage"],
      },
      {
        key: "admin.roles",
        label: "Manage Roles & Permissions",
        description: "Create and edit custom roles and their permissions",
        permissions: ["roles.manage"],
      },
      {
        key: "admin.logs",
        label: "System Logs",
        description: "View audit logs and security stats",
        permissions: ["audit.view"],
      },
      {
        key: "admin.careteam",
        label: "Care Teams",
        description: "Create and assign care teams to patients",
        permissions: ["careteam.manage"],
      },
      {
        key: "admin.settings",
        label: "Manage Settings",
        description: "Manage tenant settings such as MFA requirements and security policies",
        permissions: ["settings.manage"],
      },
    ],
  },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function bundleIsChecked(bundle: Bundle, selected: string[]): boolean {
  return bundle.permissions.every((p) => selected.includes(p))
}

function toggleBundle(bundle: Bundle, selected: string[]): string[] {
  if (bundleIsChecked(bundle, selected)) {
    return selected.filter((p) => !bundle.permissions.includes(p))
  }
  const merged = new Set([...selected, ...bundle.permissions])
  return Array.from(merged)
}

function groupCheckedCount(group: BundleGroup, selected: string[]): number {
  return group.bundles.filter((b) => bundleIsChecked(b, selected)).length
}

function groupIsAllChecked(group: BundleGroup, selected: string[]): boolean {
  return group.bundles.every((b) => bundleIsChecked(b, selected))
}

function toggleGroup(group: BundleGroup, selected: string[]): string[] {
  const allPerms = group.bundles.flatMap((b) => b.permissions)
  if (groupIsAllChecked(group, selected)) {
    return selected.filter((p) => !allPerms.includes(p))
  }
  const merged = new Set([...selected, ...allPerms])
  return Array.from(merged)
}

// ─── Permission Checkboxes ──────────────────────────────────────────────────

function PermissionCheckboxes({
  selected,
  onChange,
  disabled,
}: {
  selected: string[]
  onChange: (perms: string[]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-6">
      {BUNDLE_GROUPS.map((group) => {
        const checked = groupCheckedCount(group, selected)
        const total = group.bundles.length
        const allChecked = groupIsAllChecked(group, selected)
        const someChecked = checked > 0 && !allChecked

        return (
          <div key={group.label}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={() => onChange(toggleGroup(group, selected))}
                  disabled={disabled}
                />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">{checked}/{total}</span>
            </div>
            <div className="flex flex-col gap-2 pl-7">
              {group.bundles.map((bundle) => (
                <div key={bundle.key} className="flex items-start gap-3">
                  <Checkbox
                    id={bundle.key}
                    checked={bundleIsChecked(bundle, selected)}
                    onCheckedChange={() => onChange(toggleBundle(bundle, selected))}
                    disabled={disabled}
                    className="mt-0.5"
                  />
                  <label htmlFor={bundle.key} className="flex flex-col gap-0.5 cursor-pointer">
                    <span className="text-sm font-medium text-foreground leading-none">{bundle.label}</span>
                    <span className="text-xs text-muted-foreground">{bundle.description}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Role List Item ─────────────────────────────────────────────────────────

function RoleListItem({
  role,
  isSelected,
  onSelect,
  onDelete,
  deleteLoading,
}: {
  role: Role
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  deleteLoading: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
        isSelected ? "bg-muted/60" : "hover:bg-muted/30"
      }`}
      onClick={onSelect}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{role.displayName}</span>
          {role.isSystemDefault ? (
            <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary shrink-0">
              <ShieldCheck className="mr-1 size-3" />
              System
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] bg-zinc-200 text-zinc-900 border border-zinc-300 shrink-0">
              Custom
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono">{role.name}</span>
          <span>{role.permissions.length} permissions</span>
          <span>{role.userCount} {role.userCount === 1 ? "user" : "users"}</span>
        </div>
      </div>
      {!role.isSystemDefault && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0 ml-2"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          disabled={deleteLoading}
        >
          {deleteLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      )}
    </div>
  )
}

// ─── Right Panel: Edit / Create ─────────────────────────────────────────────

function RoleEditorPanel({
  role,
  isCreate,
  onClose,
  onSaved,
}: {
  role: Role | null
  isCreate: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [displayName, setDisplayName] = useState("")
  const [name, setName] = useState("")
  const [permissions, setPermissions] = useState<string[]>([])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isCreate) {
      setName("")
      setDisplayName("")
      setPermissions([])
    } else if (role) {
      setName(role.name)
      setDisplayName(role.displayName)
      setPermissions([...role.permissions])
    }
    setError("")
  }, [role, isCreate])

  const isAdmin = !isCreate && role?.name === "admin"

  const handleSave = async () => {
    if (isCreate) {
      if (!name.trim()) { setError("Role name is required"); return }
      if (!displayName.trim()) { setError("Display name is required"); return }
    } else {
      if (!displayName.trim()) { setError("Display name is required"); return }
    }

    setSaving(true)
    setError("")
    try {
      if (isCreate) {
        await createRole({
          name: name.trim(),
          displayName: displayName.trim(),
          permissions,
        })
      } else if (role) {
        await updateRole(role.id, {
          displayName: displayName.trim(),
          ...(role.name !== "admin" ? { permissions } : {}),
        })
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 md:hidden" onClick={onClose}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h2 className="text-base font-heading font-semibold text-foreground">
              {isCreate ? "Create Role" : `Edit — ${role?.displayName}`}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isCreate
                ? "Choose a name and select permissions for the new role."
                : isAdmin
                  ? "Admin always has full access. You can update the display name."
                  : "Update display name and permissions."}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hidden md:flex" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
        {/* Name fields */}
        {isCreate && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-foreground">Role Name (slug)</Label>
            <Input
              placeholder="e.g. counselor or case_manager"
              value={name}
              onChange={(e) => { setName(e.target.value.toLowerCase().replace(/\s+/g, "_")); setError("") }}
              disabled={saving}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Lowercase, underscores only. Used internally.</p>
          </div>
        )}

        {!isCreate && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-foreground">Role Name (slug)</Label>
            <Input value={role?.name || ""} disabled className="disabled:opacity-60 font-mono text-sm bg-muted/40" />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-foreground">Display Name</Label>
          <Input
            placeholder="e.g. Licensed Counselor"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setError("") }}
            disabled={saving}
          />
        </div>

        <Separator />

        {/* Permissions */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">Permissions</Label>
            {isAdmin && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="size-3" /> Locked — full access
              </span>
            )}
          </div>
          <PermissionCheckboxes
            selected={permissions}
            onChange={setPermissions}
            disabled={saving || isAdmin}
          />
        </div>
      </div>

      {/* Panel footer */}
      <div className="border-t border-border/60 px-5 py-4 flex items-center justify-between gap-3">
        {error ? <p className="text-sm text-destructive truncate">{error}</p> : <div />}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" className="bg-transparent text-foreground" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 size-4 animate-spin" />{isCreate ? "Creating…" : "Saving…"}</> : isCreate ? "Create Role" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main view ─────────────────────────────────────────────────────────────

export function ManageRolesView() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Panel state: either editing a role, creating, or closed
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const panelOpen = !!selectedRole || isCreating

  // Delete
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null)

  const fetchAll = () => {
    setLoading(true)
    setError("")
    getRoles()
      .then(setRoles)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [])

  const openEdit = (role: Role) => {
    setIsCreating(false)
    setSelectedRole(role)
  }

  const openCreate = () => {
    setSelectedRole(null)
    setIsCreating(true)
  }

  const closePanel = () => {
    setSelectedRole(null)
    setIsCreating(false)
  }

  const handleSaved = () => {
    closePanel()
    fetchAll()
  }

  const handleDelete = async (role: Role) => {
    setDeleteLoading(role.id)
    try {
      await deleteRole(role.id)
      if (selectedRole?.id === role.id) closePanel()
      fetchAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete role")
    } finally {
      setDeleteLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage system and custom roles. Each role is a bundle of permissions.
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          New Role
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="mt-3 bg-transparent text-foreground" onClick={fetchAll}>
            Retry
          </Button>
        </div>
      )}

      {/* Two-panel layout */}
      {!loading && !error && (
        <Card className="border-border/60 overflow-hidden">
          <div className="flex min-h-[600px]">
            {/* Left: Role list */}
            <div className={`${panelOpen ? "hidden md:flex" : "flex"} flex-col w-full md:w-[340px] md:min-w-[340px] border-r border-border/60`}>
              <div className="px-4 py-3 border-b border-border/40">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">All Roles ({roles.length})</p>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-border/40">
                {roles.map((role) => (
                  <RoleListItem
                    key={role.id}
                    role={role}
                    isSelected={selectedRole?.id === role.id}
                    onSelect={() => openEdit(role)}
                    onDelete={() => handleDelete(role)}
                    deleteLoading={deleteLoading === role.id}
                  />
                ))}
                {roles.length === 0 && (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    No roles found.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Editor panel */}
            {panelOpen ? (
              <div className="flex-1 flex flex-col min-w-0">
                <RoleEditorPanel
                  role={selectedRole}
                  isCreate={isCreating}
                  onClose={closePanel}
                  onSaved={handleSaved}
                />
              </div>
            ) : (
              <div className="hidden md:flex flex-1 items-center justify-center">
                <div className="text-center">
                  <Pencil className="size-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Select a role to edit its permissions</p>
                  <p className="text-xs text-muted-foreground mt-1">or create a new one</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
