"""
ASAM Patient Placement Criteria — Level of Care scoring engine.

Each of the 6 dimensions is scored 0-4 by the clinician.
The highest dimension score drives the minimum recommended LOC,
with special medical necessity rules for D1 (withdrawal) and D2 (biomedical).

References: ASAM Criteria 3rd Edition, SAMHSA TIP 63
"""

ASAM_TEMPLATE_NAME = "ASAM Level of Care Assessment"

# These labels must exactly match the field labels in the seeded FormTemplate
DIMENSION_LABELS = [
    "D1: Acute Intoxication / Withdrawal Risk",
    "D2: Biomedical Conditions",
    "D3: Emotional / Behavioral / Cognitive",
    "D4: Readiness to Change",
    "D5: Relapse / Continued Use Risk",
    "D6: Recovery / Living Environment",
]

LOC_OVERRIDE_LABEL = "LOC Override"


def compute_loc(scores: list) -> str:
    """
    Given 6 dimension scores (integers 0-4), return the recommended ASAM LOC string.

    LOC codes:
        1.0  — Standard Outpatient
        2.1  — Intensive Outpatient (IOP)
        2.5  — Partial Hospitalization (PHP)
        3.1  — Clinically Managed Low-Intensity Residential
        3.5  — Clinically Managed High-Intensity Residential (RTC)
        3.7  — Medically Monitored Intensive Inpatient (detox)
        4.0  — Medically Managed Intensive Inpatient (hospital detox)
    """
    if len(scores) != 6:
        return "Unknown"

    d1, d2, d3, d4, d5, d6 = [max(0, min(4, int(s))) for s in scores]
    max_score = max(d1, d2, d3, d4, d5, d6)

    # D1 withdrawal drives medical necessity — always requires nursing/physician oversight
    if d1 == 4 or (d1 >= 3 and d2 >= 2):
        return "4.0"  # Medically Managed Intensive Inpatient

    if d1 >= 3:
        return "3.7"  # Medically Monitored Intensive Inpatient

    # Non-medical levels — driven by the highest dimension score
    if max_score == 4:
        return "3.5"  # Clinically Managed High-Intensity Residential

    if max_score == 3:
        count_high = sum(1 for s in [d1, d2, d3, d4, d5, d6] if s >= 3)
        if count_high >= 2:
            return "3.5"
        # High relapse risk or unsafe environment suggests residential step-down
        if d5 >= 3 or d6 >= 3:
            return "3.1"  # Clinically Managed Low-Intensity Residential
        return "2.5"  # Partial Hospitalization

    if max_score == 2:
        count_mod = sum(1 for s in [d1, d2, d3, d4, d5, d6] if s >= 2)
        if count_mod >= 3:
            return "2.1"  # Intensive Outpatient

    return "1.0"  # Standard Outpatient


LOC_LABELS = {
    "1.0": "Outpatient",
    "2.1": "IOP",
    "2.5": "PHP",
    "3.1": "Low-Intensity Residential",
    "3.5": "RTC",
    "3.7": "Medically Monitored Inpatient",
    "4.0": "Medically Managed Inpatient",
}
