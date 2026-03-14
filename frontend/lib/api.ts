// frontend/lib/api.ts
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

// Session is managed via httpOnly cookie — no client-side token storage needed.
// These are kept as no-ops so call sites don't need to change.
export function setSessionToken(_token: string | null) {}
export function getSessionToken(): string | null { return null; }

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: JSON_HEADERS,
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `GET ${path} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, data?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: JSON_HEADERS,
    credentials: "include",
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST ${path} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, data?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    credentials: "include",
    body: data ? JSON.stringify(data) : undefined,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `PUT ${path} failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

export async function apiPatch<T>(path: string, data?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    credentials: "include",
    body: data ? JSON.stringify(data) : undefined,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `PATCH ${path} failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

// Auth API calls
export interface LoginResponse {
  user_id: number;
  username: string;
  full_name: string | null;
  role: "psychiatrist" | "technician" | "admin";
  permissions: string[];
  tenant_id: number;
  tenant_name: string;
  is_first_login: boolean;
  requires_terms_agreement: boolean;
}

export function login(username: string, password: string) {
  return apiPost<LoginResponse>("/api/auth/login", { username, password });
}

export function logout() {
  return apiPost<{ ok: boolean }>("/api/auth/logout");
}

export function acceptTerms() {
  return apiPost<{ ok: boolean }>("/api/auth/accept-terms");
}

export function getMe() {
  return apiGet<{ user_id: number; username: string; full_name: string | null; role: string; permissions: string[]; tenant_name: string; signature_data: string | null }>("/api/auth/me");
}

export function saveSignature(signatureData: string | null) {
  return apiPut<{ ok: boolean }>("/api/auth/me/signature", { signature_data: signatureData })
}


// Patient API calls
export function getPatients() {
  return apiGet<Patient[]>("/api/patients")
}

export function getPatient(patientId: string) {
  return apiGet<PatientDetail>(`/api/patients/${patientId}`)
}

export function createPatient(data: Record<string, unknown>) {
  return apiPost<Patient>("/api/patients", data)
}

export function updatePatient(patientCode: string, data: Record<string, unknown>) {
  return apiPut<Patient>(`/api/patients/${patientCode}`, data)
}

export function admitPatient(patientCode: string) {
  return apiPost<Patient>(`/api/patients/${patientCode}/admit`)
}

export function dischargePatient(patientCode: string, reason: string) {
  return apiPost<Patient>(`/api/patients/${patientCode}/discharge`, { reason })
}

export function searchArchive(params: { q?: string; ssn?: string }) {
  const query = new URLSearchParams()
  if (params.q) query.set("q", params.q)
  if (params.ssn) query.set("ssn", params.ssn)
  return apiGet<Patient[]>(`/api/patients/archive/search?${query.toString()}`)
}

// Shared types
export interface Patient {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  phone: string | null
  email: string | null
  status: string
  primaryDiagnosis: string | null
  insurance: string | null
  riskLevel: string
  currentLoc: string | null
  admittedAt: string | null
  dischargedAt: string | null
  dischargeReason: string | null
  assignedProvider: string | null
  careTeamId: number | null
  careTeamName: string | null
  ssnLast4: string | null
  gender: string | null
  pronouns: string | null
  maritalStatus: string | null
  preferredLanguage: string | null
  ethnicity: string | null
  employmentStatus: string | null
  addressStreet: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emergencyContactRelationship: string | null
  currentMedications: string | null
  allergies: string | null
  referringProvider: string | null
  primaryCarePhysician: string | null
  pharmacy: string | null
}

export interface PatientDetail extends Patient {}


// Admin audit API calls
export interface AuditLogEntry {
  id: number
  timestamp: string
  userId: number | null
  username: string | null
  action: string
  resource: string
  ipAddress: string | null
  status: string
  description: string | null
}

export interface AuditLogsResponse {
  total: number
  nextBeforeId: number | null
  items: AuditLogEntry[]
}

export interface AuditStats {
  total_logins_today: number
  failed_logins_today: number
  not_authenticated_today: number
  unauthorized_attempts_today: number
  server_errors_today: number
  active_sessions: number
}

export function getAuditLogs(params?: {
  action?: string
  status?: string
  limit?: number
  before_id?: number
  date_from?: string
  date_to?: string
  user_id?: number
}) {
  const query = new URLSearchParams()
  if (params?.action) query.set("action", params.action)
  if (params?.status) query.set("status", params.status)
  if (params?.user_id) query.set("user_id", String(params.user_id))
  if (params?.limit) query.set("limit", String(params.limit))
  if (params?.before_id) query.set("before_id", String(params.before_id))
  if (params?.date_from) query.set("date_from", params.date_from)
  if (params?.date_to) query.set("date_to", params.date_to)
  const qs = query.toString()
  return apiGet<AuditLogsResponse>(`/api/audit/logs${qs ? `?${qs}` : ""}`)
}

export function getAuditStats() {
  return apiGet<AuditStats>("/api/audit/stats")
}


// User management API calls
export interface SystemUser {
  id: number
  username: string
  roleId: number
  roleName: string
  roleDisplayName: string
  credentials: string[]
  careTeamIds: number[]
  full_name: string | null
  failed_attempts: number
  is_locked: boolean
  permanently_locked: boolean
  locked_until: string | null
  last_login: string | null
}

export function getUsers() {
  return apiGet<SystemUser[]>("/api/users")
}

export function getUsersPicker() {
  return apiGet<{ id: number; username: string; full_name: string | null }[]>("/api/users/picker")
}

export function lockUser(userId: number) {
  return apiPost<{ ok: boolean }>(`/api/users/${userId}/lock`, {})
}

export function updateUser(userId: number, data: { username?: string; roleId?: number; full_name?: string; credentials?: string[] }) {
  return apiPut<{ ok: boolean; user: SystemUser }>(`/api/users/${userId}`, data)
}

export function createUser(data: { username: string; password: string; roleId: number; full_name?: string; credentials?: string[] }) {
  return apiPost<{ ok: boolean; user: SystemUser }>("/api/users", data)
}

export function setUserCareTeams(userId: number, teamIds: number[]) {
  return apiPut<{ ok: boolean }>(`/api/users/${userId}/careteams`, { teamIds })
}

export function unlockUser(userId: number) {
  return apiPost<{ ok: boolean; user: SystemUser }>(`/api/users/${userId}/unlock`)
}

export function resetUserPassword(userId: number, newPassword: string) {
  return apiPut<{ ok: boolean }>(`/api/users/${userId}/reset-password`, {
    new_password: newPassword,
  })
}

export function getDashboardPatients() {
  return apiGet<Patient[]>("/api/patients")
}

// Audit export — returns a file download
export async function exportAuditLogs(params?: {
  status?: string
  date_from?: string
  date_to?: string
  user_id?: number
}) {
  const query = new URLSearchParams()
  if (params?.status) query.set("status", params.status)
  if (params?.date_from) query.set("date_from", params.date_from)
  if (params?.date_to) query.set("date_to", params.date_to)
  if (params?.user_id) query.set("user_id", String(params.user_id))
  const qs = query.toString()
  const url = `${API_BASE_URL}/api/audit/export${qs ? `?${qs}` : ""}`

  return fetch(url, {
    method: "GET",
    headers: JSON_HEADERS,
    credentials: "include",
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Export failed: ${res.status}`)
    }
    const blob = await res.blob()
    const disposition = res.headers.get("Content-Disposition") || ""
    const match = disposition.match(/filename=(.+)/)
    const filename = match ? match[1] : "audit_logs.csv"

    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  })
}


// Form Templates
export interface TemplateField {
  label: string
  type: string
  options?: string[]
  min?: number
  max?: number
  optional?: boolean
  note?: string
}

export interface RoleAccess {
  roleId: number
  roleName: string
  roleDisplayName: string
  accessLevel: "view" | "edit" | "sign"
}

export interface FormTemplate {
  id: number
  name: string
  category: string
  description: string | null
  fields: TemplateField[]
  allowedRoles: string[]
  roleAccess: RoleAccess[]
  status: string
  isRecurring: boolean
  recurrenceValue: number | null
  recurrenceUnit: string | null
  requiredForAdmission: boolean
  requiredForDischarge: boolean
  createdBy: number | null
  createdAt: string | null
  updatedAt: string | null
  instanceCount?: number
}

export interface PatientFormEntry {
  id: number
  patientId: number
  templateId: number
  templateName: string | null
  templateCategory: string | null
  formData: Record<string, unknown>
  status: string
  filledBy: number | null
  filledByName: string | null
  signatureImage: string | null
  signedByName: string | null
  signedAt: string | null
  templateFields?: TemplateField[]
  createdAt: string | null
  updatedAt: string | null
  accessLevel: "view" | "edit" | "sign" | null
}

export function getTemplates() {
  return apiGet<FormTemplate[]>("/api/templates")
}

export function getTemplate(templateId: number) {
  return apiGet<FormTemplate>(`/api/templates/${templateId}`)
}

export function createTemplate(data: {
  name: string
  category: string
  description?: string
  fields: TemplateField[]
  roleAccess: { roleId: number; accessLevel: string }[]
  isRecurring?: boolean
  recurrenceValue?: number | null
  recurrenceUnit?: string | null
  requiredForAdmission?: boolean
  requiredForDischarge?: boolean
}) {
  return apiPost<FormTemplate>("/api/templates", data)
}

export function updateTemplate(templateId: number, data: {
  name?: string
  category?: string
  description?: string
  fields?: TemplateField[]
  roleAccess?: { roleId: number; accessLevel: string }[]
  status?: string
  isRecurring?: boolean
  recurrenceValue?: number | null
  recurrenceUnit?: string | null
  requiredForAdmission?: boolean
  requiredForDischarge?: boolean
}) {
  return apiPut<FormTemplate>(`/api/templates/${templateId}`, data)
}

export function deleteTemplate(templateId: number) {
  return apiDelete<{ ok: boolean }>(`/api/templates/${templateId}`)
}

export function getPatientForms(patientCode: string) {
  return apiGet<PatientFormEntry[]>(`/api/patients/${patientCode}/forms`)
}

export function getPatientForm(patientCode: string, formId: number) {
  return apiGet<PatientFormEntry>(`/api/patients/${patientCode}/forms/${formId}`)
}

export function createPatientForm(patientCode: string, data: {
  templateId: number
  formData: Record<string, unknown>
  status?: string
}) {
  return apiPost<PatientFormEntry>(`/api/patients/${patientCode}/forms`, data)
}

export function updatePatientForm(patientCode: string, formId: number, data: {
  formData?: Record<string, unknown>
  status?: string
}) {
  return apiPut<PatientFormEntry>(`/api/patients/${patientCode}/forms/${formId}`, data)
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: JSON_HEADERS,
    credentials: "include",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `DELETE ${path} failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function deletePatientForm(patientCode: string, formId: number) {
  return apiDelete<{ ok: boolean }>(`/api/patients/${patientCode}/forms/${formId}`)
}


// 42 CFR Part 2 Consent
export interface Part2Consent {
  id: number
  patientId: number
  receivingParty: string
  purpose: string
  informationScope: string
  expiration: string
  status: "active" | "revoked"
  patientSignature: string | null
  signedAt: string | null
  revokedAt: string | null
  revokedBy: number | null
  revocationReason: string | null
  createdBy: number | null
  createdAt: string | null
}

export function getPart2Consents(patientCode: string) {
  return apiGet<Part2Consent[]>(`/api/patients/${patientCode}/part2-consents`)
}

export function createPart2Consent(patientCode: string, data: {
  receivingParty: string
  purpose: string
  informationScope: string
  expiration: string
  patientSignature: string
}) {
  return apiPost<Part2Consent>(`/api/patients/${patientCode}/part2-consents`, data)
}

export function revokePart2Consent(patientCode: string, consentId: number, reason?: string) {
  return apiPost<Part2Consent>(`/api/patients/${patientCode}/part2-consents/${consentId}/revoke`, { reason })
}


// Tenant info
export interface TenantInfo {
  name: string
  npi: string
  phone: string
  email: string
  address: string
  mfaRequired: boolean
}

export function getTenant() {
  return apiGet<TenantInfo>("/api/tenant")
}

export function toggleTenantMfa(mfaRequired: boolean) {
  return apiPatch<{ mfaRequired: boolean }>("/api/tenant/mfa", { mfaRequired })
}


// Role management
export interface Role {
  id: number
  name: string
  displayName: string
  isSystemDefault: boolean
  permissions: string[]
  userCount: number
}

export function getRoles() {
  return apiGet<Role[]>("/api/roles")
}

export function getRolesPicker() {
  return apiGet<{ id: number; name: string; displayName: string }[]>("/api/roles/picker")
}

export function getPermissions() {
  return apiGet<{ permissions: string[] }>("/api/roles/permissions")
}

export function createRole(data: { name: string; displayName: string; permissions: string[] }) {
  return apiPost<Role>("/api/roles", data)
}

export function updateRole(roleId: number, data: { displayName?: string; permissions?: string[] }) {
  return apiPut<Role>(`/api/roles/${roleId}`, data)
}

export function deleteRole(roleId: number) {
  return apiDelete<{ ok: boolean }>(`/api/roles/${roleId}`)
}


// Bed management
export interface BedPatient {
  id: string
  firstName: string
  lastName: string
  admittedAt: string | null
  primaryDiagnosis: string | null
  insurance: string | null
  riskLevel: string
}

export interface Bed {
  id: number
  unit: string | null
  room: string | null
  bedLabel: string | null
  displayName: string
  notes: string | null
  status: "available" | "occupied" | "cleaning" | "out_of_service"
  isActive: boolean
  sortOrder: number
  patient: BedPatient | null
}

export function getBeds() {
  return apiGet<Bed[]>("/api/beds")
}

export function assignBed(bedId: number, patientCode: string | null) {
  return apiPut<Bed>(`/api/beds/${bedId}/assign`, patientCode ? { patientCode } : {})
}

export function getAllBeds() {
  return apiGet<Bed[]>("/api/beds/all")
}

export function createBed(data: {
  unit?: string
  room?: string
  bedLabel?: string
  displayName: string
  notes?: string
  sortOrder?: number
}) {
  return apiPost<Bed>("/api/beds", data)
}

export function updateBed(bedId: number, data: {
  unit?: string
  room?: string
  bedLabel?: string
  displayName?: string
  notes?: string
  sortOrder?: number
  status?: string
  isActive?: boolean
}) {
  return apiPut<Bed>(`/api/beds/${bedId}`, data)
}

export function deleteBed(bedId: number) {
  return apiDelete<{ ok: boolean }>(`/api/beds/${bedId}`)
}


// Category management
export interface CategoriesResponse {
  categories: string[]
  defaultCategories: string[]
}

export function getCategories() {
  return apiGet<CategoriesResponse>("/api/categories")
}

export function updateCategories(categories: string[]) {
  return apiPut<CategoriesResponse>("/api/categories", { categories })
}

export interface DeleteCategoryError extends Error {
  templates?: { id: number; name: string }[]
}

// Care team management
export interface CareTeamMember {
  userId: number
  username: string | null
  fullName: string | null
}

export interface CareTeam {
  id: number
  name: string
  members: CareTeamMember[]
  patientCount: number
}

export function listCareTeams() {
  return apiGet<CareTeam[]>("/api/careteams")
}

export function createCareTeam(data: { name: string; memberIds?: number[] }) {
  return apiPost<CareTeam>("/api/careteams", data)
}

export function updateCareTeam(teamId: number, data: { name?: string; memberIds?: number[] }) {
  return apiPut<CareTeam>(`/api/careteams/${teamId}`, data)
}

export function deleteCareTeam(teamId: number) {
  return apiDelete<Record<string, never>>(`/api/careteams/${teamId}`)
}


export async function deleteCategory(category: string): Promise<CategoriesResponse> {
  const res = await fetch(`${API_BASE_URL}/api/categories/${encodeURIComponent(category)}`, {
    method: "DELETE",
    headers: JSON_HEADERS,
    credentials: "include",
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || `DELETE /api/categories/${category} failed: ${res.status}`) as DeleteCategoryError
    if (body.templates) err.templates = body.templates
    throw err
  }
  return body
}

