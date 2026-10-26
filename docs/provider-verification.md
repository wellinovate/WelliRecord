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
- **Reviewers have a second sign-in step** (see "Reviewer second step" below). Not run against a real authenticator app and database from this repo.

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

## Gate on the website's own routes

`PROVIDER_VERIFICATION_ENFORCE_WEB=true` turns on the eligibility check (`start_consultation`) for the provider side of `POST /telehealth/appointments/:id/token` and for `POST /mobile-booking/visits/:id/video-token`. Code: `modules/provider-verification/web_gate.js`.

- Default is off, so doctors already using video visits are not locked out when this deploys. Turn it on after each clinician has applied and been approved.
- The person is matched by their account id (`sub`) against `pv_providers.staffUserId` or `linkedStaffIds`. Denial returns 403 `PROVIDER_NOT_VERIFIED`; every consultation start and denial is written to the audit log by `canPerform`.
- With the flag on and the gate not wired, the route returns 503 (fails closed). `PROVIDER_VERIFICATION_ENFORCE=false` still turns the whole gate off.
- Patients are never gated. Not gated: other clinician reads and writes on the website.

## Reviewer second step

Reviewer roles (`reviewer`, `senior_reviewer`, `compliance_admin`) need an authenticator-app code on top of the normal login. Code: `reviewer_totp.js` (RFC 6238, port of the mobile backend's), `reviewer_mfa.js`, `requireStaff` in `verification_routes.js`. Model `pv_mfa`.

- The website login is not changed. After signing in, the reviewer proves the second factor and gets a step-up token (2 hours), sent on every reviewer request as `x-step-up-token`. `requireStaff` refuses reviewer routes without it: 403 `mfa_enrol_required` (never set up) or `mfa_required` (not proved this session). Applicant routes are unaffected.
- Routes (reviewer role, no step-up needed): `GET /staff/verification/mfa/status`, `POST .../mfa/setup` (returns the secret and an `otpauth://` link once), `POST .../mfa/enable {code}` (returns 8 recovery codes once and a step-up token), `POST .../mfa/verify {code}` or `{recoveryCode}`. `POST .../mfa/reset/:accountId` needs a compliance admin with the step-up token and cannot be used on yourself.
- Secrets are sealed with AES-256-GCM using `MFA_SECRET_KEY` (falls back to `JWT_SECRET_KEY`). Set `MFA_SECRET_KEY` before anyone enrols and do not change it: changing it locks every reviewer out of their second step. The step-up token is signed with a key derived from `JWT_SECRET_KEY`, separate from login tokens.
- Five wrong codes lock that person for 15 minutes. A used code step cannot be replayed. Recovery codes are single-use and stored as HMACs. Setup is refused once on; a reset deletes the record, so tokens from before it stop working.
- Lost phone and no recovery codes: another compliance admin calls the reset route, or run `node scripts/reset-reviewer-mfa.js <email>` as a Render one-off job. The first compliance admin has no one to reset them, so use the script.
- `REVIEWER_MFA_REQUIRED=false` turns the requirement off. It exists only so the first reviewer can be promoted and enrol on a fresh deploy without being locked out; there is none needed after that. Boot warns while it is set.
- Setup start, enable, verify and reset are written to `pv_audit`. Failed codes are not.
- Not built: a page in the website for this. The routes exist; the website front end needs a code prompt that stores the step-up token and sends the header. Until then reviewers cannot use the tools from the browser.
