# WelliPay partner API

WelliPay asks WelliRecord to prove that a person controls a WR-ID. WelliPay never receives the person's phone or email. A WR-ID is a reference. Proving control of it does not give WelliPay access to any record.

Set `WELLIPAY_PARTNER_KEY` in Render. It must equal `RECORD_INTEGRATION_WELLIRECORD_API_KEY` on the wellipay-api service. If it is unset, every call is refused with 503.

## Calls

Both calls are `POST` with JSON and these headers:

- `Authorization: Bearer <key>`
- `X-WelliPay-Timestamp`: Unix seconds. Calls more than 5 minutes off are refused.
- `X-WelliPay-Signature`: `sha256=` plus the hex HMAC-SHA256 of `<timestamp>.<raw body>`, keyed with the same key.

### Start

`POST /wellipay/v1/verifications` with `{ "requestId": "...", "reference": "WR-2291-ABCD" }`

Always answers `202`. If the WR-ID belongs to a patient with a phone number, an SMS code (6 digits) is sent. Nothing in the answer says whether the WR-ID exists. At most 3 codes go to one WR-ID in 10 minutes.

### Confirm

`POST /wellipay/v1/verifications/:requestId/confirm` with `{ "code": "123456" }`

- `200 { "verified": true, "reference": "WR-2291-ABCD" }` when the code is right.
- `200 { "verified": false }` for a wrong, expired, used or unknown code.

A code lasts 10 minutes, allows 5 tries and works once. Only a hash of it is stored.

## Not covered

A patient with no phone number on file gets no code. An email fallback is not built.
