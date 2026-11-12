# NIN identity check (2AM Connect)

A patient can confirm their identity with their National Identification Number. The backend asks 2AM Connect to look
the NIN up and compares the first name, last name and date of birth on the record with the patient's profile. When
both match, the profile gets `identityVerifiedAt`, `identityVerifiedBy: "system"` and `identityVerifiedMethod: "nin_2am"`.

## What is stored

- On the profile: the three fields above. Nothing else from the NIN record.
- In `NinAttempt` (90 days): account id, outcome (`verified`, `mismatch`, `not_found`, `provider_error`), 2AM's request id,
  the time the patient agreed.
- Never stored or logged: the NIN, the name, date of birth, photo, address or any other field returned by 2AM.
  `nin_client.js` drops everything except first name, last name, middle name, date of birth and request id before it
  returns, and the controller logs only the error message, never the request body.

## Routes (patient token)

- `POST /api/v1/user/identity/nin` body `{ nin, consent: true }`. 10 requests an hour per IP.
- `GET /api/v1/user/identity/nin/status` returns `{ verified, verifiedAt, method, available }`.

Responses carry a `code`: `not_available` (503), `consent_required`, `invalid_nin`, `profile_incomplete` (422, no paid
lookup is made), `not_found` (422), `mismatch` (422), `too_many_attempts` (429), `provider_error` (502).
A mismatch never says which field differed or echoes anything from the record.

## Settings (Render, backend service)

- `TWOAM_API_KEY`: the 2AM key. `nv_test_` keys are sandbox, `nv_live_` keys are live and bill the 2AM wallet.
- `TWOAM_REQUEST_REASON`: a key from `GET https://nin-api.2am.ng/v1/verify/request-reasons` that honestly describes
  the purpose. The feature stays off until this is set; there is no default.
- `TWOAM_API_URL`: optional, default `https://nin-api.2am.ng`.
- `TWOAM_DAILY_LIMIT`: optional cap on lookups across all accounts per 24 hours, default 200.

## Limits that protect the 2AM wallet

3 counted attempts per account per 24 hours (verified, mismatch and not-found count; 2AM outages do not), the daily cap
above, the route limit, and no lookup when the profile has no full name or date of birth. A verified profile is never
looked up again.

## Not covered

- The 2AM error body format is not documented to us. Errors are mapped by HTTP status only: 401/403 auth, 402 balance,
  404 not found, 429 rate limited, 5xx down. If 2AM reports "NIN not found" with another status it shows as a
  provider error and does not use up an attempt.
- The same NIN can verify more than one account. Preventing that needs a stored keyed hash of the NIN, which is a
  decision about what we keep.
- Names are matched on first and last name tokens, ignoring accents and case. A patient who uses a different name
  from the one on the NIN will see a mismatch and must correct their profile.
