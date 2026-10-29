# TrustPrompt — Code Architecture

**Version:** 0.0.5  
**Last Updated:** Current Session  
**Purpose:** Privacy disclosure risk assessment for AI assistant prompts

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Detection Pipeline](#detection-pipeline)
4. [Risk Scoring Engine](#risk-scoring-engine)
5. [User Interface](#user-interface)
6. [Extension Infrastructure](#extension-infrastructure)
7. [Data Flow](#data-flow)
8. [File Reference](#file-reference)

---

## System Overview

### Mission
TrustPrompt is a Chrome extension that scans user prompts in real-time before sending them to AI assistants (Claude, ChatGPT) and detects sensitive personal information (PII/SPI) according to Philippine Data Privacy Act (RA 10173) standards.

### Core Principles
- **Local processing** — All scanning happens in-browser; no data leaves the user's machine
- **Real-time feedback** — Scan results shown within 400ms (debounce window)
- **User autonomy** — System warns but never blocks; user always has final say
- **Regulatory alignment** — Risk classification based on NIST SP 800-122 + RA 10173

### Design Standards
- **NIST SP 800-122**: Confidentiality impact levels (Low/Moderate/High)
- **RA 10173 (Philippine DPA)**: Personal Information (PI) and Sensitive Personal Information (SPI) categories
- **Zero-trust validation**: Every detection must pass both pattern match + validation

---

## Component Architecture

