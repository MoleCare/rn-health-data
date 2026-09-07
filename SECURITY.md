# Security Policy

## Supported versions

Security fixes are applied to the latest release on `main`.

## Reporting a vulnerability

Email **security@molecare.co.uk** (or open a private GitHub Security Advisory on this repo).

Do **not** open public issues for vulnerabilities.

## Publishing rules for this org

- Never commit API keys, tokens, JWTs, `.env`, Firebase plists, Mapbox secrets, or patient/clinical images.
- Prefer injectable config over hardcoded product IDs or backend hosts.
- Health data stays on-device via HealthKit / Health Connect — do not add remote sync hosts to this package.
- This repository is **private** until an explicit public-release checklist is completed.
