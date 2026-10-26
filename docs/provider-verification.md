# Provider verification

Checks that a provider's licence is real and current before clinical functions work. Pilot scope: category `doctor`, with `radiologist` as a specialty tier. Other categories share the schema and stay inactive (`ACTIVATED_CATEGORIES` in `verification_core.js`).

Code: `modules/provider-verification/`
- `verification_core.js`: rules, no database (states, transitions, eligibility, expiry, two-person rule, metrics).
- `verification_models.js`: collections prefixed `pv_`. The mobile backend (`wellinovate/WellIRecordMobileApp`) reads the same collections for its gate. Keep both copies of the core and the models in step.
- `verification_service.js`: routes, the gate (`canPerform`), the hourly job.
- `doc_storage.js`: S3 storage with SigV4 presign, file type check, ClamAV adapter.
- `verification_routes.js`: wiring (who is a provider, who is a reviewer, email, mount).

## People and roles
- A provider is a website account of type `user` with role `doctor`, `provider_admin` or `provider`. Organisation accounts cannot apply.
- Reviewers use the new `Account.role` values `reviewer`, `senior_reviewer`, `compliance_admin`. Promote an existing account: `node scripts/set-reviewer-role.js <email> <role>` (Render one-off job).
- Only `senior_reviewer` or `compliance_admin` can approve, never their own case or one assigned to them, and a check by another person must exist.
- **No second sign-in step exists on the website.** Reviewers sign in with a password only. Add a second step before giving these roles to anyone beyond a small trusted group.

## States
`application_pending`, `further_evidence_required`, `verified_active`, `renewal_due`, `expired`, `on_hold`. `verified_active` and `renewal_due` grant clinical functions. Rejection is a case decision. Every transition writes an audit row.

## Routes (mounted at `/api/v1`)
- Provider: `POST /provider/verification/apply`, `GET .../me`, `POST .../documents` (presigned PUT), `POST .../documents/:id/complete`, `DELETE .../documents/:id`, `POST .../evidence`, `POST .../restrictions/:id/appeal`.
- Reviewer (`/staff/verification/...`): `cases`, `cases/:id`, `assign`, `check`, `request-evidence`, `approve`, `reject`, `documents/:id/url`, `renewals`, `rechecks`, `rechecks/:id/complete`, `providers/:id/link-organization`, `providers/:id/link-staff`, `restrictions`, `complaints`, `metrics`.
- Patient: `POST /provider-complaints`.
- `link-staff` ties a person in the mobile clinic console (their staff id) to the verified provider, so the mobile gate can find the record.

## Environment
`DOC_STORAGE_ENDPOINT`, `DOC_STORAGE_BUCKET`, `DOC_STORAGE_REGION`, `DOC_STORAGE_ACCESS_KEY`, `DOC_STORAGE_SECRET_KEY`, optional `DOC_STORAGE_PATH_STYLE=true`, `DOC_STORAGE_SSE`; `CLAMD_HOST`, `CLAMD_PORT`; `AUDIT_MONGO_URI`; `PROVIDER_VERIFICATION_ENFORCE` (default on; `false` turns the gate off and warns at boot); `PROVIDER_DOC_RETENTION_DAYS` (default 2555, needs legal confirmation); `PROVIDER_VERIFICATION_ALERT_EMAIL`; `RESEND_API_KEY` for emails.
Without storage, uploads return 503 and nobody can be approved. Without `CLAMD_HOST`, files stay `pending` and block approval.

## Audit
`pv_audit` refuses update and delete in the app. For database-level protection, create an Atlas user with insert and find only on `pv_audit`, put its connection string in `AUDIT_MONGO_URI`, and build the indexes with an admin user.

## Not built / not gated
- This backend does not yet call the gate on its own telehealth or booking routes. Only the mobile backend does, through the shared collections.
- Admin dashboard page, provider onboarding screen, regulator adapters, resumable upload, MDCN scraping, patient-facing badge (held for legal review).
- Needs review: registration level terms, the imaging-requires-specialist rule, provider terms wording (`PROVIDER_TERMS_VERSION` draft-1), document retention.
- Never run against live storage, ClamAV or a restricted Mongo user from this repo.
