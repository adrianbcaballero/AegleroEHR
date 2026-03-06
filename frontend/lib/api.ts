// frontend/lib/api.ts
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionToken) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
  }
  return headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders(),
    body: data ? JSON.stringify(data) : undefined,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `PUT ${path} failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

export function getHealth() {
  return apiGet<{ ok: boolean }>("/health");
}

// Auth API calls
export interface LoginResponse {
  user_id: number;
  username: string;
  full_name: string | null;
  role: "psychiatrist" | "technician" | "admin";
  tenant_id: number;
  tenant_name: string;
  session_id: string;
}

export function login(username: string, password: string) {
  return apiPost<LoginResponse>("/api/auth/login", { username, password });
}

export function logout() {
  return apiPost<{ ok: boolean }>("/api/auth/logout");
}

export function getMe() {
  return apiGet<{ user_id: number; username: string; role: string }>("/api/auth/me");
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
  assignedProvider: string | null
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

export interface TreatmentPlanData {
  id: number
  patientId: number
  startDate: string | null
  reviewDate: string | null
  goals: { goal: string; target: string }[]
  status: string
  updatedAt: string | null
}

export interface PatientDetail extends Patient {
  treatmentPlan: TreatmentPlanData | null
}


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
  role: string
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

export function lockUser(userId: number) {
  return apiPost<{ ok: boolean }>(`/api/users/${userId}/lock`, {})
}

export function updateUser(userId: number, data: { username?: string; role?: string; full_name?: string }) {
  return apiPut<{ ok: boolean; user: SystemUser }>(`/api/users/${userId}`, data)
}

export function createUser(data: { username: string; password: string; role: string; full_name?: string }) {
  return apiPost<{ ok: boolean; user: SystemUser }>("/api/users", data)
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

  // Use fetch with auth header, then trigger download
  return fetch(url, {
    method: "GET",
    headers: authHeaders(),
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

// Treatment Plans
export interface TreatmentPlanGoal {
  id: string
  description: string
  status: string
  targetDate: string
}

export interface TreatmentPlanListItem {
  id: number
  patientId: number
  patientName: string
  patientCode: string
  patientStatus: string
  startDate: string | null
  reviewDate: string | null
  goals: TreatmentPlanGoal[]
  status: string
  updatedAt: string | null
}

export function getTreatmentPlans() {
  return apiGet<TreatmentPlanListItem[]>("/api/patients/treatment-plans")
}

export function upsertTreatmentPlan(
  patientId: string,
  data: { startDate?: string; reviewDate?: string; goals?: TreatmentPlanGoal[]; status?: string }
) {
  return apiPost<{ created: boolean; treatmentPlan: TreatmentPlanListItem }>(
    `/api/patients/${patientId}/treatment-plan`,
    data
  )
}

export function getTreatmentPlan(patientCode: string) {
  return apiGet<{ treatmentPlan: TreatmentPlanListItem | null }>(
    `/api/patients/${patientCode}/treatment-plan`
  )
}


// Form Templates
export interface TemplateField {
  label: string
  type: string
  options?: string[]
  min?: number
  max?: number
}

export interface FormTemplate {
  id: number
  name: string
  category: string
  description: string | null
  fields: TemplateField[]
  allowedRoles: string[]
  status: string
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
  templateFields?: TemplateField[]
  createdAt: string | null
  updatedAt: string | null
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
  allowedRoles: string[]
}) {
  return apiPost<FormTemplate>("/api/templates", data)
}

export function updateTemplate(templateId: number, data: {
  name?: string
  category?: string
  description?: string
  fields?: TemplateField[]
  allowedRoles?: string[]
  status?: string
}) {
  return apiPut<FormTemplate>(`/api/templates/${templateId}`, data)
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
    headers: authHeaders(),
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

