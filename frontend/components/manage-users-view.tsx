"use client"

import { useState, useEffect } from "react"
import {
  Search,
  UserCog,
  Shield,
  CheckCircle2,
  Lock,
  Unlock,
  MoreHorizontal,
  Loader2,
  AlertTriangle,
  KeyRound,
  Pencil,
  Plus,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { getUsers, lockUser, unlockUser, updateUser, createUser, resetUserPassword } from "@/lib/api"
import type { SystemUser } from "@/lib/api"

const roleColors: Record<string, string> = {
  admin: "bg-destructive/10 text-destructive",
  psychiatrist: "bg-primary/10 text-primary",
  technician: "bg-accent/10 text-accent",
}

function getInitials(user: SystemUser): string {
  if (user.full_name) {
    return user.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
  }
  return user.username.slice(0, 2).toUpperCase()
}

export function ManageUsersView() {
  const [users, setUsers] = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [resetDialogUser, setResetDialogUser] = useState<SystemUser | null>(null)
  const [editDialogUser, setEditDialogUser] = useState<SystemUser | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createUsername, setCreateUsername] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createRole, setCreateRole] = useState("technician")
  const [createFullName, setCreateFullName] = useState("")
  const [createError, setCreateError] = useState("")
  const [createLoading, setCreateLoading] = useState(false)
  const [editUsername, setEditUsername] = useState("")
  const [editRole, setEditRole] = useState("")
  const [editFullName, setEditFullName] = useState("")
  const [editError, setEditError] = useState("")
  const [editLoading, setEditLoading] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [resetError, setResetError] = useState("")
  const [resetLoading, setResetLoading] = useState(false)

  const fetchUsers = () => {
    setLoading(true)
    setError("")
    getUsers()
      .then(setUsers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleLock = async (userId: number) => {
    setActionLoading(userId)
    try {
      await lockUser(userId)
      fetchUsers()
    } catch {
      // silently fail, user can retry
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnlock = async (userId: number) => {
    setActionLoading(userId)
    try {
      await unlockUser(userId)
      fetchUsers()
    } catch {
      // silently fail, user can retry
    } finally {
      setActionLoading(null)
    }
  }

  const openCreateDialog = () => {
    setCreateUsername("")
    setCreatePassword("")
    setCreateRole("technician")
    setCreateFullName("")
    setCreateError("")
    setShowCreateDialog(true)
  }

  const handleCreateUser = async () => {
    if (!createUsername.trim() || createUsername.trim().length < 3) {
      setCreateError("Username must be at least 3 characters")
      return
    }
    if (!createPassword || createPassword.length < 8) {
      setCreateError("Password must be at least 8 characters")
      return
    }

    setCreateLoading(true)
    setCreateError("")

    try {
      await createUser({
        username: createUsername.trim(),
        password: createPassword,
        role: createRole,
        full_name: createFullName.trim() || undefined,
      })
      setShowCreateDialog(false)
      fetchUsers()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user")
    } finally {
      setCreateLoading(false)
    }
  }

  const openEditDialog = (user: SystemUser) => {
    setEditDialogUser(user)
    setEditUsername(user.username)
    setEditRole(user.role)
    setEditFullName(user.full_name || "")
    setEditError("")
  }

  const handleEditUser = async () => {
    if (!editDialogUser) return
    if (!editUsername.trim() || editUsername.trim().length < 3) {
      setEditError("Username must be at least 3 characters")
      return
    }

    setEditLoading(true)
    setEditError("")

    const updates: { username?: string; role?: string; full_name?: string } = {}
    if (editUsername !== editDialogUser.username) updates.username = editUsername.trim()
    if (editRole !== editDialogUser.role) updates.role = editRole
    if (editFullName !== (editDialogUser.full_name || "")) updates.full_name = editFullName.trim()

    if (Object.keys(updates).length === 0) {
      setEditDialogUser(null)
      setEditLoading(false)
      return
    }

    try {
      await updateUser(editDialogUser.id, updates)
      setEditDialogUser(null)
      fetchUsers()
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update user")
    } finally {
      setEditLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetDialogUser || !newPassword || newPassword.length < 8) {
      setResetError("Password must be at least 8 characters")
      return
    }

    setResetLoading(true)
    setResetError("")

    try {
      await resetUserPassword(resetDialogUser.id, newPassword)
      setResetDialogUser(null)
      setNewPassword("")
      fetchUsers()
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "Failed to reset password")
    } finally {
      setResetLoading(false)
    }
  }

  const filteredUsers = users.filter((user) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      user.username.toLowerCase().includes(q) ||
      (user.full_name || "").toLowerCase().includes(q) ||
      user.role.toLowerCase().includes(q)
    )
  })

  const activeCount = users.filter((u) => !u.is_locked).length
  const lockedCount = users.filter((u) => u.is_locked).length
  const totalRoles = new Set(users.map((u) => u.role)).size

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">Manage Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            User accounts, lockout status, and access management
          </p>
        </div>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={openCreateDialog}
        >
          <Plus className="mr-2 size-4" />
          Create User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <UserCog className="size-3.5 text-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Total Users</p>
            </div>
            <p className="text-xl font-bold font-heading text-foreground">{users.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="size-3.5 text-accent" />
              <p className="text-xs text-muted-foreground font-medium">Active</p>
            </div>
            <p className="text-xl font-bold font-heading text-accent">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Lock className="size-3.5 text-destructive" />
              <p className="text-xs text-muted-foreground font-medium">Locked</p>
            </div>
            <p className="text-xl font-bold font-heading text-destructive">{lockedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield className="size-3.5 text-primary" />
              <p className="text-xs text-muted-foreground font-medium">Roles</p>
            </div>
            <p className="text-xl font-bold font-heading text-primary">{totalRoles}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name, username, or role..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="mt-3 bg-transparent text-foreground" onClick={fetchUsers}>
            Retry
          </Button>
        </div>
      )}

      {/* Users Table */}
      {!loading && !error && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading font-semibold text-foreground">
              All Users ({filteredUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold text-muted-foreground">User</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Role</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Failed Attempts</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground hidden lg:table-cell">Locked Until</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {getInitials(user)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {user.full_name || user.username}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.username}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary" className={`text-[10px] capitalize ${roleColors[user.role] || "bg-muted text-muted-foreground"}`}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.permanently_locked ? (
                        <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">
                          <Lock className="mr-1 size-3" />
                          Permanently Locked
                        </Badge>
                      ) : user.is_locked ? (
                        <Badge variant="secondary" className="text-[10px] bg-chart-4/10 text-chart-4">
                          <Lock className="mr-1 size-3" />
                          Temp Locked
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] bg-accent/10 text-accent">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className={`text-sm ${user.failed_attempts > 0 ? "text-chart-4 font-medium" : "text-muted-foreground"}`}>
                        {user.failed_attempts}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {user.locked_until ? new Date(user.locked_until).toLocaleString() : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {user.is_locked ? (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleUnlock(user.id)}
                                disabled={actionLoading === user.id}
                              >
                                <Unlock className="mr-2 size-4" />
                                {actionLoading === user.id ? "Unlocking…" : "Unlock Account"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleLock(user.id)}
                                disabled={actionLoading === user.id}
                                className="text-destructive focus:text-destructive"
                              >
                                <Lock className="mr-2 size-4" />
                                {actionLoading === user.id ? "Locking…" : "Lock Account"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem onClick={() => openEditDialog(user)}>
                            <Pencil className="mr-2 size-4" />
                            Edit User
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setResetDialogUser(user)
                              setNewPassword("")
                              setResetError("")
                            }}
                          >
                            <KeyRound className="mr-2 size-4" />
                            Reset Password
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Reset Password Dialog */}
      <Dialog open={!!resetDialogUser} onOpenChange={(open) => { if (!open) setResetDialogUser(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetDialogUser?.full_name || resetDialogUser?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">New Password</Label>
              <Input
                type="password"
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setResetError("") }}
                disabled={resetLoading}
              />
            </div>
            {resetError && <p className="text-sm text-destructive">{resetError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="bg-transparent text-foreground"
                onClick={() => setResetDialogUser(null)}
                disabled={resetLoading}
              >
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleResetPassword}
                disabled={resetLoading}
              >
                {resetLoading ? "Resetting…" : "Reset Password"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Edit User Dialog */}
      <Dialog open={!!editDialogUser} onOpenChange={(open) => { if (!open) setEditDialogUser(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Edit User</DialogTitle>
            <DialogDescription>
              Update account details for {editDialogUser?.full_name || editDialogUser?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Full Name</Label>
              <Input
                placeholder="Full name"
                value={editFullName}
                onChange={(e) => { setEditFullName(e.target.value); setEditError("") }}
                disabled={editLoading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Username</Label>
              <Input
                placeholder="Username (min 3 characters)"
                value={editUsername}
                onChange={(e) => { setEditUsername(e.target.value); setEditError("") }}
                disabled={editLoading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="psychiatrist">Psychiatrist</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="bg-transparent text-foreground"
                onClick={() => setEditDialogUser(null)}
                disabled={editLoading}
              >
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleEditUser}
                disabled={editLoading}
              >
                {editLoading ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Create User</DialogTitle>
            <DialogDescription>
              Add a new user account to the system.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Full Name</Label>
              <Input
                placeholder="Full name"
                value={createFullName}
                onChange={(e) => { setCreateFullName(e.target.value); setCreateError("") }}
                disabled={createLoading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Username</Label>
              <Input
                placeholder="Username (min 3 characters)"
                value={createUsername}
                onChange={(e) => { setCreateUsername(e.target.value); setCreateError("") }}
                disabled={createLoading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Password</Label>
              <Input
                type="password"
                placeholder="Password (min 8 characters)"
                value={createPassword}
                onChange={(e) => { setCreatePassword(e.target.value); setCreateError("") }}
                disabled={createLoading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-foreground">Role</Label>
              <Select value={createRole} onValueChange={setCreateRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="psychiatrist">Psychiatrist</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="bg-transparent text-foreground"
                onClick={() => setShowCreateDialog(false)}
                disabled={createLoading}
              >
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleCreateUser}
                disabled={createLoading}
              >
                {createLoading ? "Creating…" : "Create User"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}