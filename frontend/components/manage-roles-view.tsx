"use client"

import { useState, useEffect } from "react"
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
  getRoles,
  getPermissions,
  createRole,
  updateRole,
  deleteRole,
} from "@/lib/api"
import type { Role } from "@/lib/api"

// ─── Permission display metadata ───────────────────────────────────────────

const PERMISSION_GROUPS: { label: string; permissions: { key: string; label: string; description: string }[] }[] = [
  {
    label: "Patients",
    permissions: [
      { key: "patients.view", label: "View Patients", description: "View patient list and records (scoped to assigned if no view_all)" },
      { key: "patients.view_all", label: "View All Patients", description: "View all patients regardless of assignment" },
      { key: "patients.create", label: "Create Patients", description: "Create new patient records" },
      { key: "patients.edit", label: "Edit Patients", description: "Update patient demographics and fields" },
      { key: "patients.admit", label: "Admit Patients", description: "Admit a patient to the facility" },
      { key: "patients.discharge", label: "Discharge Patients", description: "Discharge a patient from the facility" },
    ],
  },
  {
    label: "Forms",
    permissions: [
      { key: "forms.view", label: "View Forms", description: "View patient form instances" },
      { key: "forms.edit", label: "Fill Out Forms", description: "Fill out and save draft forms" },
      { key: "forms.sign", label: "Sign & Complete Forms", description: "Complete and sign forms — makes them legal records" },
    ],
  },
  {
    label: "Templates",
    permissions: [
      { key: "templates.view", label: "View Templates", description: "View form templates" },
      { key: "templates.manage", label: "Manage Templates", description: "Create, edit, and delete form templates" },
    ],
  },
  {
    label: "Administration",
    permissions: [
      { key: "users.manage", label: "Manage Users", description: "Create, edit, lock, and unlock user accounts" },
      { key: "roles.manage", label: "Manage Roles", description: "Create, edit, and delete custom roles" },
      { key: "categories.manage", label: "Manage Categories", description: "Manage form categories for the tenant" },
      { key: "consent.manage", label: "Manage 42 CFR Part 2 Consents", description: "Create and revoke patient consent records" },
      { key: "audit.view", label: "View Audit Logs", description: "View system access logs and security stats" },
    ],
  },
]

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
  const toggle = (key: string) => {
    if (selected.includes(key)) {
      onChange(selected.filter((p) => p !== key))
    } else {
      onChange([...selected, key])
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.label}</p>
          <div className="flex flex-col gap-2">
            {group.permissions.map((perm) => (
              <div key={perm.key} className="flex items-start gap-3">
                <Checkbox
                  id={perm.key}
                  checked={selected.includes(perm.key)}
                  onCheckedChange={() => toggle(perm.key)}
                  disabled={disabled}
                  className="mt-0.5"
                />
                <label htmlFor={perm.key} className="flex flex-col gap-0.5 cursor-pointer">
                  <span className="text-sm font-medium text-foreground leading-none">{perm.label}</span>
                  <span className="text-xs text-muted-foreground">{perm.description}</span>
                </label>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main view ─────────────────────────────────────────────────────────────

export function ManageRolesView() {
  const [roles, setRoles] = useState<Role[]>([])
  const [allPermissions, setAllPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Edit dialog
  const [editRole, setEditRole] = useState<Role | null>(null)
  const [editDisplayName, setEditDisplayName] = useState("")
  const [editPermissions, setEditPermissions] = useState<string[]>([])
  const [editError, setEditError] = useState("")
  const [editLoading, setEditLoading] = useState(false)

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createDisplayName, setCreateDisplayName] = useState("")
  const [createPermissions, setCreatePermissions] = useState<string[]>([])
  const [createError, setCreateError] = useState("")
  const [createLoading, setCreateLoading] = useState(false)

  // Delete
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null)

  const fetchAll = () => {
    setLoading(true)
    setError("")
    Promise.all([getRoles(), getPermissions()])
      .then(([rolesData, permsData]) => {
        setRoles(rolesData)
        setAllPermissions(permsData.permissions)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const openEdit = (role: Role) => {
    setEditRole(role)
    setEditDisplayName(role.displayName)
    setEditPermissions([...role.permissions])
    setEditError("")
  }

  const handleSaveEdit = async () => {
    if (!editRole) return
    if (!editDisplayName.trim()) {
      setEditError("Display name is required")
      return
    }
    setEditLoading(true)
    setEditError("")
    try {
      await updateRole(editRole.id, {
        displayName: editDisplayName.trim(),
        ...(editRole.name !== "admin" ? { permissions: editPermissions } : {}),
      })
      setEditRole(null)
      fetchAll()
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setEditLoading(false)
    }
  }

  const openCreate = () => {
    setCreateName("")
    setCreateDisplayName("")
    setCreatePermissions([])
    setCreateError("")
    setShowCreate(true)
  }

  const handleCreate = async () => {
    if (!createName.trim()) {
      setCreateError("Role name is required")
      return
    }
    if (!createDisplayName.trim()) {
      setCreateError("Display name is required")
      return
    }
    setCreateLoading(true)
    setCreateError("")
    try {
      await createRole({
        name: createName.trim(),
        displayName: createDisplayName.trim(),
        permissions: createPermissions,
      })
      setShowCreate(false)
      fetchAll()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create role")
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDelete = async (role: Role) => {
    setDeleteLoading(role.id)
    try {
      await deleteRole(role.id)
      fetchAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete role")
    } finally {
      setDeleteLoading(null)
    }
  }

  const systemRoles = roles.filter((r) => r.isSystemDefault)
  const customRoles = roles.filter((r) => !r.isSystemDefault)

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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield className="size-3.5 text-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Total Roles</p>
            </div>
            <p className="text-xl font-bold font-heading text-foreground">{roles.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <ShieldCheck className="size-3.5 text-primary" />
              <p className="text-xs text-muted-foreground font-medium">System Roles</p>
            </div>
            <p className="text-xl font-bold font-heading text-primary">{systemRoles.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="size-3.5 text-accent" />
              <p className="text-xs text-muted-foreground font-medium">Custom Roles</p>
            </div>
            <p className="text-xl font-bold font-heading text-accent">{customRoles.length}</p>
          </CardContent>
        </Card>
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
          <Button variant="outline" className="mt-3 bg-transparent text-foreground" onClick={fetchAll}>
            Retry
          </Button>
        </div>
      )}

      {/* Roles Table */}
      {!loading && !error && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading font-semibold text-foreground">
              All Roles ({roles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold text-muted-foreground">Role</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Type</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground hidden sm:table-cell">Permissions</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Users</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{role.displayName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{role.name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {role.isSystemDefault ? (
                        <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                          <ShieldCheck className="mr-1 size-3" />
                          System
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] bg-accent/10 text-accent">
                          Custom
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-sm text-muted-foreground">{role.permissions.length} / {allPermissions.length}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{role.userCount}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(role)}
                        >
                          <Pencil className="size-3.5" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        {!role.isSystemDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(role)}
                            disabled={deleteLoading === role.id}
                          >
                            {deleteLoading === role.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                            <span className="sr-only">Delete</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {roles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                      No roles found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Role Dialog */}
      <Dialog open={!!editRole} onOpenChange={(open) => { if (!open) setEditRole(null) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              Edit Role — {editRole?.displayName}
            </DialogTitle>
            <DialogDescription>
              {editRole?.isSystemDefault
                ? "System roles can have their display name and permissions updated, but the role name slug is locked."
                : "Update this custom role's display name and permissions."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Role Name (slug)</Label>
              <Input value={editRole?.name || ""} disabled className="disabled:opacity-60 font-mono text-sm bg-muted/40" />
              <p className="text-xs text-muted-foreground">The internal identifier — cannot be changed.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Display Name</Label>
              <Input
                placeholder="e.g. Licensed Counselor"
                value={editDisplayName}
                onChange={(e) => { setEditDisplayName(e.target.value); setEditError("") }}
                disabled={editLoading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-foreground">Permissions</Label>
                {editRole?.name === "admin" && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ShieldCheck className="size-3" /> Locked — admin always has full access
                  </span>
                )}
              </div>
              <div className="rounded-lg border border-border p-4 bg-muted/20">
                <PermissionCheckboxes
                  selected={editPermissions}
                  onChange={setEditPermissions}
                  disabled={editLoading || editRole?.name === "admin"}
                />
              </div>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="bg-transparent text-foreground"
                onClick={() => setEditRole(null)}
                disabled={editLoading}
              >
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSaveEdit}
                disabled={editLoading}
              >
                {editLoading ? <><Loader2 className="mr-2 size-4 animate-spin" />Saving…</> : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Role Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Create Role</DialogTitle>
            <DialogDescription>
              Create a custom role for this clinic. Choose a unique name slug and select the permissions to grant.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Role Name (slug)</Label>
              <Input
                placeholder="e.g. counselor or case_manager"
                value={createName}
                onChange={(e) => { setCreateName(e.target.value.toLowerCase().replace(/\s+/g, "_")); setCreateError("") }}
                disabled={createLoading}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Lowercase, underscores only. Used internally.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Display Name</Label>
              <Input
                placeholder="e.g. Licensed Counselor"
                value={createDisplayName}
                onChange={(e) => { setCreateDisplayName(e.target.value); setCreateError("") }}
                disabled={createLoading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-foreground">Permissions</Label>
              <div className="rounded-lg border border-border p-4 bg-muted/20">
                <PermissionCheckboxes
                  selected={createPermissions}
                  onChange={setCreatePermissions}
                  disabled={createLoading}
                />
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="bg-transparent text-foreground"
                onClick={() => setShowCreate(false)}
                disabled={createLoading}
              >
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleCreate}
                disabled={createLoading}
              >
                {createLoading ? <><Loader2 className="mr-2 size-4 animate-spin" />Creating…</> : "Create Role"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
