"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { listCareTeams, createCareTeam, updateCareTeam, deleteCareTeam, getUsersPicker } from "@/lib/api"
import type { CareTeam } from "@/lib/api"

type PickerUser = { id: number; username: string; full_name: string | null }

// ─── Member selector ────────────────────────────────────────────────────────

function MemberSelector({
  selected,
  onChange,
  users,
  disabled,
}: {
  selected: number[]
  onChange: (ids: number[]) => void
  users: PickerUser[]
  disabled?: boolean
}) {
  const [search, setSearch] = useState("")
  const [focused, setFocused] = useState(false)
  const selectedUsers = users.filter((u) => selected.includes(u.id))
  const available = users.filter((u) => !selected.includes(u.id))
  const filtered = available.filter(
    (u) =>
      !search || (u.full_name || u.username).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-2">
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsers.map((u) => (
            <Badge key={u.id} variant="secondary" className="text-xs bg-primary/10 text-primary gap-1">
              {u.full_name || u.username}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((id) => id !== u.id))}
                  className="ml-0.5 hover:text-destructive transition-colors"
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="flex flex-col gap-1">
          <Input
            placeholder="Search users to add..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            className="h-8 text-sm"
          />
          {focused && filtered.length > 0 && (
            <div className="rounded-md border border-border bg-card max-h-48 overflow-y-auto">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                  onClick={() => { onChange([...selected, u.id]); setSearch("") }}
                >
                  {u.full_name ? `${u.full_name} (${u.username})` : u.username}
                </button>
              ))}
            </div>
          )}
          {focused && search && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">No matching users</p>
          )}
        </div>
      )}
      {selectedUsers.length === 0 && !focused && (
        <p className="text-xs text-muted-foreground">No members added. Click above to add.</p>
      )}
    </div>
  )
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function ManageCareTeamsView() {
  const [teams, setTeams] = useState<CareTeam[]>([])
  const [users, setUsers] = useState<PickerUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null)

  // Edit dialog
  const [editTeam, setEditTeam] = useState<CareTeam | null>(null)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editLeadUserId, setEditLeadUserId] = useState<number | null>(null)
  const [editMemberIds, setEditMemberIds] = useState<number[]>([])
  const [editError, setEditError] = useState("")
  const [editLoading, setEditLoading] = useState(false)

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createDescription, setCreateDescription] = useState("")
  const [createLeadUserId, setCreateLeadUserId] = useState<number | null>(null)
  const [createMemberIds, setCreateMemberIds] = useState<number[]>([])
  const [createError, setCreateError] = useState("")
  const [createLoading, setCreateLoading] = useState(false)

  const fetchAll = () => {
    setLoading(true)
    setError("")
    Promise.all([listCareTeams(), getUsersPicker()])
      .then(([teamsData, usersData]) => {
        setTeams(teamsData)
        setUsers(usersData)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const openEdit = (team: CareTeam) => {
    setEditTeam(team)
    setEditName(team.name)
    setEditDescription(team.description || "")
    setEditLeadUserId(team.leadUserId)
    setEditMemberIds(team.members.map((m) => m.userId))
    setEditError("")
  }

  const handleSaveEdit = async () => {
    if (!editTeam) return
    if (!editName.trim()) {
      setEditError("Team name is required")
      return
    }
    setEditLoading(true)
    setEditError("")
    try {
      await updateCareTeam(editTeam.id, { name: editName.trim(), description: editDescription.trim(), leadUserId: editLeadUserId, memberIds: editMemberIds })
      setEditTeam(null)
      fetchAll()
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setEditLoading(false)
    }
  }

  const openCreate = () => {
    setCreateName("")
    setCreateDescription("")
    setCreateLeadUserId(null)
    setCreateMemberIds([])
    setCreateError("")
    setShowCreate(true)
  }

  const handleCreate = async () => {
    if (!createName.trim()) {
      setCreateError("Team name is required")
      return
    }
    setCreateLoading(true)
    setCreateError("")
    try {
      await createCareTeam({ name: createName.trim(), description: createDescription.trim() || undefined, leadUserId: createLeadUserId, memberIds: createMemberIds })
      setShowCreate(false)
      fetchAll()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create care team")
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDelete = async (team: CareTeam) => {
    setDeleteLoading(team.id)
    setError("")
    try {
      await deleteCareTeam(team.id)
      fetchAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete care team")
    } finally {
      setDeleteLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Care Teams</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage care teams and their members. Patients on a care team can only be seen by team members.
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          New Care Team
        </Button>
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

      {/* Teams Table */}
      {!loading && !error && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading font-semibold text-foreground">
              All Care Teams ({teams.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold text-muted-foreground">Team</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Team Lead</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Members</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Active Patients</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell>
                      <p className="text-sm font-medium text-foreground">{team.name}</p>
                      {team.description && <p className="text-xs text-muted-foreground mt-0.5 max-w-[250px] break-words whitespace-normal">{team.description}</p>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{team.leadUserName || "—"}</span>
                    </TableCell>
                    <TableCell>
                      {team.members.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {team.members.slice(0, 3).map((m) => (
                            <Badge key={m.userId} variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
                              {m.fullName || m.username}
                            </Badge>
                          ))}
                          {team.members.length > 3 && (
                            <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
                              +{team.members.length - 3} more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No members</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{team.patientCount}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(team)}
                        >
                          <Pencil className="size-3.5" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(team)}
                          disabled={deleteLoading === team.id || team.patientCount > 0}
                          title={team.patientCount > 0 ? `Cannot delete — ${team.patientCount} patient(s) assigned` : "Delete team"}
                        >
                          {deleteLoading === team.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {teams.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                      No care teams yet. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editTeam} onOpenChange={(open) => { if (!open) setEditTeam(null) }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Edit Care Team</DialogTitle>
            <DialogDescription>
              Update the name and members of this care team.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Team Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Morning Shift Team"
                value={editName}
                onChange={(e) => { setEditName(e.target.value); setEditError("") }}
                disabled={editLoading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Description</Label>
              <Textarea
                placeholder="Brief description of this team's role"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={editLoading}
                rows={2}
                maxLength={150}
                className="resize-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Team Lead</Label>
              <Select
                value={editLeadUserId?.toString() || "none"}
                onValueChange={(v) => setEditLeadUserId(v === "none" ? null : Number(v))}
                disabled={editLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a team lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No lead assigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.full_name ? `${u.full_name} (${u.username})` : u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Members</Label>
              <MemberSelector
                selected={editMemberIds}
                onChange={setEditMemberIds}
                users={users}
                disabled={editLoading}
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="bg-transparent text-foreground"
                onClick={() => setEditTeam(null)}
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

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">New Care Team</DialogTitle>
            <DialogDescription>
              Create a new care team and add members to it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Team Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Morning Shift Team"
                value={createName}
                onChange={(e) => { setCreateName(e.target.value); setCreateError("") }}
                disabled={createLoading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Description</Label>
              <Textarea
                placeholder="Brief description of this team's role"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                disabled={createLoading}
                rows={2}
                maxLength={150}
                className="resize-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Team Lead</Label>
              <Select
                value={createLeadUserId?.toString() || "none"}
                onValueChange={(v) => setCreateLeadUserId(v === "none" ? null : Number(v))}
                disabled={createLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a team lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No lead assigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.full_name ? `${u.full_name} (${u.username})` : u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Members</Label>
              <MemberSelector
                selected={createMemberIds}
                onChange={setCreateMemberIds}
                users={users}
                disabled={createLoading}
              />
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
                {createLoading ? <><Loader2 className="mr-2 size-4 animate-spin" />Creating…</> : "Create Team"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
