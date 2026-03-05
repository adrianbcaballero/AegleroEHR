// Mock data for the Aeglero Mental Health EMR

export interface Patient {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  phone: string
  email: string
  status: "active" | "inactive" | "discharged"
  primaryDiagnosis: string
  insurance: string
  lastVisit: string
  nextAppointment: string
  riskLevel: "low" | "moderate" | "high"
  assignedProvider: string
  avatar?: string
  heightCm?: number
  weightKg?: number
  allergies?: string[]
}

export interface Appointment {
  id: string
  patientId: string
  patientName: string
  providerId: string
  providerName: string
  date: string
  time: string
  duration: number
  type: "individual" | "group" | "family" | "intake" | "psychiatric"
  status: "scheduled" | "confirmed" | "in-progress" | "completed" | "cancelled" | "no-show"
  notes?: string
}

export interface ClinicalNote {
  id: string
  patientId: string
  patientName: string
  providerId: string
  providerName: string
  date: string
  type: "progress" | "intake" | "discharge" | "treatment-plan" | "crisis"
  status: "draft" | "signed" | "cosigned" | "amended"
  summary: string
  diagnosis: string[]
}

export interface TreatmentPlan {
  id: string
  patientId: string
  patientName: string
  startDate: string
  reviewDate: string
  goals: {
    id: string
    description: string
    status: "in-progress" | "met" | "partially-met" | "not-met"
    targetDate: string
  }[]
  status: "active" | "completed" | "discontinued"
}

export const patients: Patient[] = [
  {
    id: "PT-001",
    firstName: "Sarah",
    lastName: "Mitchell",
    dateOfBirth: "1988-03-15",
    gender: "Female",
    phone: "(555) 234-5678",
    email: "s.mitchell@email.com",
    status: "active",
    primaryDiagnosis: "Major Depressive Disorder",
    insurance: "Blue Cross Blue Shield",
    lastVisit: "2026-02-03",
    nextAppointment: "2026-02-10",
    riskLevel: "moderate",
    assignedProvider: "Dr. Emily Chen",
    heightCm: 165,
    weightKg: 68,
    allergies: ["Penicillin"],
    avatar: "/patients/sarah-mitchell.jpg",
  },
  {
    id: "PT-002",
    firstName: "James",
    lastName: "Rodriguez",
    dateOfBirth: "1975-11-22",
    gender: "Male",
    phone: "(555) 345-6789",
    email: "j.rodriguez@email.com",
    status: "active",
    primaryDiagnosis: "Generalized Anxiety Disorder",
    insurance: "Aetna",
    lastVisit: "2026-02-05",
    nextAppointment: "2026-02-12",
    riskLevel: "low",
    assignedProvider: "Dr. Michael Torres",
    heightCm: 178,
    weightKg: 82,
    allergies: [],
    avatar: "/patients/james-rodriguez.jpg",
  },
  {
    id: "PT-003",
    firstName: "Aisha",
    lastName: "Patel",
    dateOfBirth: "1992-07-08",
    gender: "Female",
    phone: "(555) 456-7890",
    email: "a.patel@email.com",
    status: "active",
    primaryDiagnosis: "PTSD",
    insurance: "UnitedHealthcare",
    lastVisit: "2026-02-01",
    nextAppointment: "2026-02-08",
    riskLevel: "high",
    assignedProvider: "Dr. Emily Chen",
    heightCm: 160,
    weightKg: 58,
    allergies: ["None"],
    avatar: "/patients/aisha-patel.jpg",
  },
  {
    id: "PT-004",
    firstName: "David",
    lastName: "Kim",
    dateOfBirth: "2001-01-30",
    gender: "Male",
    phone: "(555) 567-8901",
    email: "d.kim@email.com",
    status: "active",
    primaryDiagnosis: "Bipolar II Disorder",
    insurance: "Cigna",
    lastVisit: "2026-01-28",
    nextAppointment: "2026-02-11",
    riskLevel: "moderate",
    assignedProvider: "Dr. Lisa Hoffman",
    heightCm: 175,
    weightKg: 72,
    allergies: [],
    avatar: "/patients/david-kim.jpg",
  },
  {
    id: "PT-005",
    firstName: "Maria",
    lastName: "Santos",
    dateOfBirth: "1965-09-12",
    gender: "Female",
    phone: "(555) 678-9012",
    email: "m.santos@email.com",
    status: "active",
    primaryDiagnosis: "Alcohol Use Disorder",
    insurance: "Medicare",
    lastVisit: "2026-02-06",
    nextAppointment: "2026-02-13",
    riskLevel: "high",
    assignedProvider: "Dr. Michael Torres",
    heightCm: 158,
    weightKg: 70,
    allergies: ["Shellfish"],
    avatar: "/patients/maria-santos.jpg",
  },
  {
    id: "PT-006",
    firstName: "Ryan",
    lastName: "O'Brien",
    dateOfBirth: "1998-04-18",
    gender: "Male",
    phone: "(555) 789-0123",
    email: "r.obrien@email.com",
    status: "active",
    primaryDiagnosis: "ADHD",
    insurance: "Blue Cross Blue Shield",
    lastVisit: "2026-02-04",
    nextAppointment: "2026-02-18",
    riskLevel: "low",
    assignedProvider: "Dr. Lisa Hoffman",
    heightCm: 180,
    weightKg: 75,
    allergies: [],
    avatar: "/patients/ryan-obrien.jpg",
  },
  {
    id: "PT-007",
    firstName: "Elena",
    lastName: "Volkov",
    dateOfBirth: "1983-12-05",
    gender: "Female",
    phone: "(555) 890-1234",
    email: "e.volkov@email.com",
    status: "inactive",
    primaryDiagnosis: "Eating Disorder - Bulimia",
    insurance: "Aetna",
    lastVisit: "2026-01-15",
    nextAppointment: "",
    riskLevel: "moderate",
    assignedProvider: "Dr. Emily Chen",
    heightCm: 170,
    weightKg: 62,
    allergies: ["Peanuts"],
    avatar: "/patients/elena-volkov.jpg",
  },
  {
    id: "PT-008",
    firstName: "Marcus",
    lastName: "Johnson",
    dateOfBirth: "1970-06-25",
    gender: "Male",
    phone: "(555) 901-2345",
    email: "m.johnson@email.com",
    status: "active",
    primaryDiagnosis: "Opioid Use Disorder",
    insurance: "Medicaid",
    lastVisit: "2026-02-07",
    nextAppointment: "2026-02-10",
    riskLevel: "high",
    assignedProvider: "Dr. Michael Torres",
    heightCm: 182,
    weightKg: 90,
    allergies: [],
    avatar: "/patients/marcus-johnson.jpg",
  },
]

export const archivedPatients: Patient[] = [
  {
    id: "PT-100",
    firstName: "Linda",
    lastName: "Park",
    dateOfBirth: "1978-05-20",
    gender: "Female",
    phone: "(555) 111-2233",
    email: "l.park@email.com",
    status: "discharged",
    primaryDiagnosis: "Adjustment Disorder",
    insurance: "Cigna",
    lastVisit: "2025-08-14",
    nextAppointment: "",
    riskLevel: "low",
    assignedProvider: "Dr. Emily Chen",
  },
  {
    id: "PT-101",
    firstName: "Robert",
    lastName: "Hayes",
    dateOfBirth: "1960-02-14",
    gender: "Male",
    phone: "(555) 222-3344",
    email: "r.hayes@email.com",
    status: "discharged",
    primaryDiagnosis: "Panic Disorder",
    insurance: "Medicare",
    lastVisit: "2025-09-28",
    nextAppointment: "",
    riskLevel: "low",
    assignedProvider: "Dr. Michael Torres",
  },
  {
    id: "PT-102",
    firstName: "Sophie",
    lastName: "Tran",
    dateOfBirth: "1995-11-03",
    gender: "Female",
    phone: "(555) 333-4455",
    email: "s.tran@email.com",
    status: "discharged",
    primaryDiagnosis: "Social Anxiety Disorder",
    insurance: "UnitedHealthcare",
    lastVisit: "2025-07-12",
    nextAppointment: "",
    riskLevel: "low",
    assignedProvider: "Dr. Lisa Hoffman",
  },
  {
    id: "PT-103",
    firstName: "Charles",
    lastName: "Washington",
    dateOfBirth: "1972-08-30",
    gender: "Male",
    phone: "(555) 444-5566",
    email: "c.washington@email.com",
    status: "discharged",
    primaryDiagnosis: "Insomnia Disorder",
    insurance: "Aetna",
    lastVisit: "2025-10-05",
    nextAppointment: "",
    riskLevel: "low",
    assignedProvider: "Dr. Emily Chen",
  },
]

export const appointments: Appointment[] = [
  {
    id: "APT-001",
    patientId: "PT-001",
    patientName: "Sarah Mitchell",
    providerId: "PRV-001",
    providerName: "Dr. Emily Chen",
    date: "2026-02-10",
    time: "09:00",
    duration: 50,
    type: "individual",
    status: "confirmed",
  },
  {
    id: "APT-002",
    patientId: "PT-008",
    patientName: "Marcus Johnson",
    providerId: "PRV-002",
    providerName: "Dr. Michael Torres",
    date: "2026-02-10",
    time: "09:00",
    duration: 50,
    type: "individual",
    status: "confirmed",
  },
  {
    id: "APT-003",
    patientId: "PT-003",
    patientName: "Aisha Patel",
    providerId: "PRV-001",
    providerName: "Dr. Emily Chen",
    date: "2026-02-10",
    time: "10:00",
    duration: 50,
    type: "individual",
    status: "scheduled",
  },
  {
    id: "APT-004",
    patientId: "PT-002",
    patientName: "James Rodriguez",
    providerId: "PRV-002",
    providerName: "Dr. Michael Torres",
    date: "2026-02-10",
    time: "10:30",
    duration: 30,
    type: "psychiatric",
    status: "scheduled",
  },
  {
    id: "APT-005",
    patientId: "PT-004",
    patientName: "David Kim",
    providerId: "PRV-003",
    providerName: "Dr. Lisa Hoffman",
    date: "2026-02-10",
    time: "11:00",
    duration: 50,
    type: "individual",
    status: "in-progress",
  },
  {
    id: "APT-006",
    patientId: "PT-005",
    patientName: "Maria Santos",
    providerId: "PRV-002",
    providerName: "Dr. Michael Torres",
    date: "2026-02-10",
    time: "13:00",
    duration: 50,
    type: "individual",
    status: "scheduled",
  },
  {
    id: "APT-007",
    patientId: "PT-006",
    patientName: "Ryan O'Brien",
    providerId: "PRV-003",
    providerName: "Dr. Lisa Hoffman",
    date: "2026-02-10",
    time: "14:00",
    duration: 30,
    type: "psychiatric",
    status: "scheduled",
  },
  {
    id: "APT-008",
    patientId: "PT-001",
    patientName: "Sarah Mitchell",
    providerId: "PRV-001",
    providerName: "Dr. Emily Chen",
    date: "2026-02-11",
    time: "09:00",
    duration: 90,
    type: "intake",
    status: "scheduled",
  },
  {
    id: "APT-009",
    patientId: "PT-002",
    patientName: "James Rodriguez",
    providerId: "PRV-002",
    providerName: "Dr. Michael Torres",
    date: "2026-02-12",
    time: "10:00",
    duration: 50,
    type: "individual",
    status: "scheduled",
  },
  {
    id: "APT-010",
    patientId: "PT-003",
    patientName: "Aisha Patel",
    providerId: "PRV-001",
    providerName: "Dr. Emily Chen",
    date: "2026-02-12",
    time: "14:00",
    duration: 50,
    type: "family",
    status: "scheduled",
  },
]

export const clinicalNotes: ClinicalNote[] = [
  {
    id: "CN-001",
    patientId: "PT-001",
    patientName: "Sarah Mitchell",
    providerId: "PRV-001",
    providerName: "Dr. Emily Chen",
    date: "2026-02-03",
    type: "progress",
    status: "signed",
    summary: "Patient reports improved mood stability with current medication regimen. Sleep patterns normalizing. Discussed coping strategies for workplace stress triggers.",
    diagnosis: ["F33.1 Major Depressive Disorder, Recurrent, Moderate"],
  },
  {
    id: "CN-002",
    patientId: "PT-003",
    patientName: "Aisha Patel",
    providerId: "PRV-001",
    providerName: "Dr. Emily Chen",
    date: "2026-02-01",
    type: "progress",
    status: "signed",
    summary: "Continued EMDR processing of index trauma. Patient tolerated session well. Reported decrease in intrusive thoughts this past week. PHQ-9 score: 12.",
    diagnosis: ["F43.10 Post-Traumatic Stress Disorder"],
  },
  {
    id: "CN-003",
    patientId: "PT-005",
    patientName: "Maria Santos",
    providerId: "PRV-002",
    providerName: "Dr. Michael Torres",
    date: "2026-02-06",
    type: "progress",
    status: "draft",
    summary: "Patient maintaining sobriety (45 days). Attended 3 AA meetings this week. Discussed relapse prevention plan and identified high-risk situations.",
    diagnosis: ["F10.20 Alcohol Use Disorder, Moderate"],
  },
  {
    id: "CN-004",
    patientId: "PT-008",
    patientName: "Marcus Johnson",
    providerId: "PRV-002",
    providerName: "Dr. Michael Torres",
    date: "2026-02-07",
    type: "progress",
    status: "signed",
    summary: "MAT follow-up. Buprenorphine dose stable at 16mg/day. No cravings reported. Urine drug screen negative. Engaged in individual counseling.",
    diagnosis: ["F11.20 Opioid Use Disorder, Moderate"],
  },
  {
    id: "CN-005",
    patientId: "PT-004",
    patientName: "David Kim",
    providerId: "PRV-003",
    providerName: "Dr. Lisa Hoffman",
    date: "2026-01-28",
    type: "treatment-plan",
    status: "cosigned",
    summary: "Updated treatment plan with revised goals. Adding mood charting as homework assignment. Lithium levels within therapeutic range.",
    diagnosis: ["F31.81 Bipolar II Disorder"],
  },
  {
    id: "CN-006",
    patientId: "PT-002",
    patientName: "James Rodriguez",
    providerId: "PRV-002",
    providerName: "Dr. Michael Torres",
    date: "2026-02-05",
    type: "progress",
    status: "signed",
    summary: "GAD-7 score improved from 14 to 10. CBT techniques showing positive results. Progressive muscle relaxation practice discussed. Buspirone well tolerated.",
    diagnosis: ["F41.1 Generalized Anxiety Disorder"],
  },
]

export const treatmentPlans: TreatmentPlan[] = [
  {
    id: "TP-001",
    patientId: "PT-001",
    patientName: "Sarah Mitchell",
    startDate: "2025-11-15",
    reviewDate: "2026-02-15",
    goals: [
      {
        id: "G-001",
        description: "Reduce PHQ-9 score from 16 to below 10",
        status: "in-progress",
        targetDate: "2026-03-15",
      },
      {
        id: "G-002",
        description: "Establish consistent sleep schedule (7-8 hrs/night)",
        status: "partially-met",
        targetDate: "2026-02-28",
      },
      {
        id: "G-003",
        description: "Develop 5 healthy coping strategies for stress",
        status: "in-progress",
        targetDate: "2026-04-01",
      },
    ],
    status: "active",
  },
  {
    id: "TP-002",
    patientId: "PT-003",
    patientName: "Aisha Patel",
    startDate: "2025-10-01",
    reviewDate: "2026-02-01",
    goals: [
      {
        id: "G-004",
        description: "Reduce frequency of nightmares to < 2/week",
        status: "partially-met",
        targetDate: "2026-03-01",
      },
      {
        id: "G-005",
        description: "Complete EMDR processing of primary trauma",
        status: "in-progress",
        targetDate: "2026-04-15",
      },
      {
        id: "G-006",
        description: "Engage in 3 social activities per week",
        status: "not-met",
        targetDate: "2026-03-15",
      },
    ],
    status: "active",
  },
  {
    id: "TP-003",
    patientId: "PT-005",
    patientName: "Maria Santos",
    startDate: "2025-12-20",
    reviewDate: "2026-03-20",
    goals: [
      {
        id: "G-007",
        description: "Maintain sobriety for 90 consecutive days",
        status: "in-progress",
        targetDate: "2026-03-20",
      },
      {
        id: "G-008",
        description: "Attend minimum 3 AA meetings per week",
        status: "met",
        targetDate: "2026-02-20",
      },
      {
        id: "G-009",
        description: "Rebuild relationship with adult children",
        status: "in-progress",
        targetDate: "2026-06-01",
      },
    ],
    status: "active",
  },
]

export interface PatientForm {
  id: string
  patientId: string
  name: string
  category: "intake" | "assessment" | "consent" | "insurance" | "discharge" | "clinical"
  status: "completed" | "pending" | "in-progress" | "overdue"
  assignedDate: string
  completedDate?: string
  dueDate: string
  notes?: string
}

export const patientForms: PatientForm[] = [
  // PT-001 Sarah Mitchell - 4 forms, 3 completed
  { id: "F-001", patientId: "PT-001", name: "New Patient Intake Form", category: "intake", status: "completed", assignedDate: "2025-11-10", completedDate: "2025-11-12", dueDate: "2025-11-15" },
  { id: "F-002", patientId: "PT-001", name: "PHQ-9 Depression Screening", category: "assessment", status: "completed", assignedDate: "2026-02-01", completedDate: "2026-02-03", dueDate: "2026-02-05" },
  { id: "F-003", patientId: "PT-001", name: "Informed Consent for Treatment", category: "consent", status: "completed", assignedDate: "2025-11-10", completedDate: "2025-11-10", dueDate: "2025-11-10" },
  { id: "F-004", patientId: "PT-001", name: "GAD-7 Anxiety Assessment", category: "assessment", status: "pending", assignedDate: "2026-02-08", dueDate: "2026-02-14", notes: "Requested by Dr. Chen for next session" },

  // PT-002 James Rodriguez - 3 forms, 3 completed
  { id: "F-005", patientId: "PT-002", name: "New Patient Intake Form", category: "intake", status: "completed", assignedDate: "2025-09-01", completedDate: "2025-09-02", dueDate: "2025-09-05" },
  { id: "F-006", patientId: "PT-002", name: "GAD-7 Anxiety Assessment", category: "assessment", status: "completed", assignedDate: "2026-02-03", completedDate: "2026-02-05", dueDate: "2026-02-07" },
  { id: "F-007", patientId: "PT-002", name: "Insurance Authorization Form", category: "insurance", status: "completed", assignedDate: "2025-09-01", completedDate: "2025-09-01", dueDate: "2025-09-05" },

  // PT-003 Aisha Patel - 5 forms, 2 completed, 2 pending, 1 overdue
  { id: "F-008", patientId: "PT-003", name: "New Patient Intake Form", category: "intake", status: "completed", assignedDate: "2025-10-01", completedDate: "2025-10-01", dueDate: "2025-10-05" },
  { id: "F-009", patientId: "PT-003", name: "PTSD Checklist (PCL-5)", category: "assessment", status: "completed", assignedDate: "2026-01-28", completedDate: "2026-02-01", dueDate: "2026-02-03" },
  { id: "F-010", patientId: "PT-003", name: "Consent for EMDR Therapy", category: "consent", status: "pending", assignedDate: "2026-02-05", dueDate: "2026-02-12" },
  { id: "F-011", patientId: "PT-003", name: "Safety Plan Worksheet", category: "clinical", status: "overdue", assignedDate: "2026-01-15", dueDate: "2026-01-22", notes: "Must complete before next session" },
  { id: "F-012", patientId: "PT-003", name: "Insurance Re-Authorization", category: "insurance", status: "pending", assignedDate: "2026-02-06", dueDate: "2026-02-20" },

  // PT-004 David Kim - 4 forms, 2 completed, 1 in-progress, 1 pending
  { id: "F-013", patientId: "PT-004", name: "New Patient Intake Form", category: "intake", status: "completed", assignedDate: "2025-08-15", completedDate: "2025-08-16", dueDate: "2025-08-20" },
  { id: "F-014", patientId: "PT-004", name: "Mood Disorder Questionnaire", category: "assessment", status: "completed", assignedDate: "2026-01-25", completedDate: "2026-01-28", dueDate: "2026-01-30" },
  { id: "F-015", patientId: "PT-004", name: "Medication Side Effects Checklist", category: "clinical", status: "in-progress", assignedDate: "2026-02-05", dueDate: "2026-02-12", notes: "Partially filled out" },
  { id: "F-016", patientId: "PT-004", name: "Annual Consent Renewal", category: "consent", status: "pending", assignedDate: "2026-02-08", dueDate: "2026-02-22" },

  // PT-005 Maria Santos - 5 forms, 3 completed, 1 pending, 1 overdue
  { id: "F-017", patientId: "PT-005", name: "New Patient Intake Form", category: "intake", status: "completed", assignedDate: "2025-12-15", completedDate: "2025-12-16", dueDate: "2025-12-20" },
  { id: "F-018", patientId: "PT-005", name: "AUDIT Alcohol Screening", category: "assessment", status: "completed", assignedDate: "2026-02-01", completedDate: "2026-02-06", dueDate: "2026-02-08" },
  { id: "F-019", patientId: "PT-005", name: "Informed Consent for MAT", category: "consent", status: "completed", assignedDate: "2025-12-15", completedDate: "2025-12-15", dueDate: "2025-12-15" },
  { id: "F-020", patientId: "PT-005", name: "Relapse Prevention Plan", category: "clinical", status: "overdue", assignedDate: "2026-01-20", dueDate: "2026-02-01", notes: "Critical - provider follow-up needed" },
  { id: "F-021", patientId: "PT-005", name: "Family Contact Authorization", category: "consent", status: "pending", assignedDate: "2026-02-06", dueDate: "2026-02-15" },

  // PT-006 Ryan O'Brien - 3 forms, all completed
  { id: "F-022", patientId: "PT-006", name: "New Patient Intake Form", category: "intake", status: "completed", assignedDate: "2025-07-10", completedDate: "2025-07-10", dueDate: "2025-07-15" },
  { id: "F-023", patientId: "PT-006", name: "ADHD Self-Report Scale (ASRS)", category: "assessment", status: "completed", assignedDate: "2026-02-01", completedDate: "2026-02-04", dueDate: "2026-02-07" },
  { id: "F-024", patientId: "PT-006", name: "Informed Consent for Treatment", category: "consent", status: "completed", assignedDate: "2025-07-10", completedDate: "2025-07-10", dueDate: "2025-07-10" },

  // PT-007 Elena Volkov - 4 forms, 2 completed, 2 pending
  { id: "F-025", patientId: "PT-007", name: "New Patient Intake Form", category: "intake", status: "completed", assignedDate: "2025-06-01", completedDate: "2025-06-02", dueDate: "2025-06-05" },
  { id: "F-026", patientId: "PT-007", name: "EDE-Q Eating Disorder Assessment", category: "assessment", status: "completed", assignedDate: "2026-01-10", completedDate: "2026-01-15", dueDate: "2026-01-17" },
  { id: "F-027", patientId: "PT-007", name: "Return to Active Care Form", category: "clinical", status: "pending", assignedDate: "2026-02-05", dueDate: "2026-02-15", notes: "Required to resume sessions" },
  { id: "F-028", patientId: "PT-007", name: "Updated Insurance Information", category: "insurance", status: "pending", assignedDate: "2026-02-05", dueDate: "2026-02-15" },

  // PT-008 Marcus Johnson - 5 forms, 3 completed, 1 in-progress, 1 overdue
  { id: "F-029", patientId: "PT-008", name: "New Patient Intake Form", category: "intake", status: "completed", assignedDate: "2025-11-01", completedDate: "2025-11-01", dueDate: "2025-11-05" },
  { id: "F-030", patientId: "PT-008", name: "Opioid Risk Assessment Tool", category: "assessment", status: "completed", assignedDate: "2026-02-01", completedDate: "2026-02-07", dueDate: "2026-02-08" },
  { id: "F-031", patientId: "PT-008", name: "MAT Treatment Agreement", category: "consent", status: "completed", assignedDate: "2025-11-01", completedDate: "2025-11-01", dueDate: "2025-11-01" },
  { id: "F-032", patientId: "PT-008", name: "Weekly Check-In Questionnaire", category: "clinical", status: "in-progress", assignedDate: "2026-02-07", dueDate: "2026-02-10", notes: "Due today" },
  { id: "F-033", patientId: "PT-008", name: "Drug Screening Consent Renewal", category: "consent", status: "overdue", assignedDate: "2026-01-25", dueDate: "2026-02-01", notes: "Expired - needs immediate renewal" },
]

// Dashboard KPI data
export const dashboardStats = {
  totalPatients: 156,
  activePatients: 142,
  appointmentsToday: 18,
  completedToday: 6,
  pendingNotes: 4,
  noShows: 1,
  weeklyRevenue: 24750,
  monthlyRevenue: 98400,
}

// Chart data
export const appointmentTrend = [
  { month: "Sep", appointments: 312, completed: 289, noShows: 23 },
  { month: "Oct", appointments: 340, completed: 318, noShows: 22 },
  { month: "Nov", appointments: 298, completed: 276, noShows: 22 },
  { month: "Dec", appointments: 265, completed: 248, noShows: 17 },
  { month: "Jan", appointments: 352, completed: 332, noShows: 20 },
  { month: "Feb", appointments: 186, completed: 172, noShows: 14 },
]

export const diagnosisDistribution = [
  { name: "Depressive Disorders", value: 38, fill: "hsl(var(--chart-1))" },
  { name: "Anxiety Disorders", value: 28, fill: "hsl(var(--chart-2))" },
  { name: "Substance Use", value: 18, fill: "hsl(var(--chart-3))" },
  { name: "PTSD/Trauma", value: 12, fill: "hsl(var(--chart-4))" },
  { name: "Other", value: 4, fill: "hsl(var(--chart-5))" },
]

export const revenueByPayer = [
  { payer: "BCBS", amount: 32400 },
  { payer: "Aetna", amount: 21600 },
  { payer: "UHC", amount: 18900 },
  { payer: "Cigna", amount: 12500 },
  { payer: "Medicare", amount: 8400 },
  { payer: "Medicaid", amount: 4600 },
]
