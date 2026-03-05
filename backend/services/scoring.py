# scoring risk level
from models import Patient


# diagnoses that tend to be higher baseline risk
HIGH_SEVERITY_DIAG = {
    "bipolar", "schizophrenia", "psychosis", "major depressive disorder",
    "mdd", "ptsd", "borderline", "substance use", "opioid use"
}

MODERATE_SEVERITY_DIAG = {
    "gad", "generalized anxiety", "anxiety", "panic", "adhd", "depression"
}


def calculate_risk_level(patient_id: int) -> str:
    """
    Diagnosis-based risk scoring.
    Returns 'high', 'moderate', or 'low'.
    """
    patient = Patient.query.get(patient_id)
    if not patient:
        return "low"

    diagnosis = (patient.primary_diagnosis or "").lower()

    if any(k in diagnosis for k in HIGH_SEVERITY_DIAG):
        return "high"
    if any(k in diagnosis for k in MODERATE_SEVERITY_DIAG):
        return "moderate"
    return "low"