<p align="center">
  <img src="assets/aeglero-banner.jpg" alt="AegleroEHR" width="90%">
</p>

<h1 align="center">AegleroEHR</h1>

<p align="center">
  Aeglero is an <b>Electronic Health Record (EHR)</b> platform engineered specifically for Behavioral Health and Substance Use Disorder (SUD) facilities. The system provides specialized modules for <b>clinical withdrawal management</b> and robust technical safeguards to ensure <b>HIPAA</b> and <b>42 CFR Part 2</b> compliance.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-Proprietary-red.svg" alt="License">
  <img src="https://img.shields.io/badge/Frontend-dev-black.svg" alt="Frontend">
  <img src="https://img.shields.io/badge/Backend-dev-lightgrey.svg" alt="Backend">
  <img src="https://img.shields.io/badge/Database-dev-blue.svg" alt="Database">
  <img src="https://img.shields.io/badge/Tests-N/A-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Compliance-dev-blueviolet.svg" alt="Compliance">
  <img src="https://img.shields.io/badge/Documentation-dev-yellow.svg" alt="Documentation">
</p>

---

## Technical Architecture

| Component | Implementation |
|:---|:---|
| **Frontend** | Next.js 14, React, Tailwind CSS |
| **Backend** | Python Flask, Werkzeug, SQLAlchemy |
| **Database** | subdomain-based tenant isolation |
| **Infrastructure** |  |

---

## Core Security Implementations

### Access Control and Authentication
* Role-Based Access Control (RBAC) enforced at middleware and route levels.
* Scoped permissions for Admin, Psychiatrist, and Technician roles.
* Password hashing via Werkzeug with 12+ character complexity requirements.
* Bearer token authentication with 15-minute sliding session expiration.
* Automatic account lockout after 5 consecutive failed login attempts.

### Hardened HTTP Response Headers
The application enforces a strict security policy on every response to prevent PHI leakage:
* **HSTS:** Strict-Transport-Security for enforced HTTPS.
* **CSP:** Content-Security-Policy to mitigate XSS.
* **X-Frame-Options:** Prevention of clickjacking.
* **Cache-Control:** `no-store, no-cache` to prevent PHI storage in browser caches.

### Audit and Compliance Logic
* **Read-Access Logging:** Records every instance of PHI being viewed and edited.
* **Metadata Persistence:** All logs capture Timestamp, Actor ID, IP Address, and Action Type.

---

## Deployment

```bash
# Production build via Docker
docker-compose up --build