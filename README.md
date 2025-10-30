# Onboard User API Documentation

## Overview
This API endpoint allows users to onboard by submitting identity information (NIN, full name, and date of birth) along with their connected wallet address. The system extracts the wallet address (DID) automatically from the connected wallet. It generates a Verifiable Credential (VC) for identity verification, optionally pins it to IPFS, and returns the credential details along with a hash and signature for integrity.

- **Endpoint**: `https://welli-record.vercel.app/app/onboard`
- **Method**: `POST`
- **Authentication**: None (relies on connected wallet for DID extraction)
- **Content-Type**: `application/json`


## Request Body
The request body must be a JSON object containing the required identity fields. The `dids` field should be the Ethereum address extracted from the user's connected wallet (e.g., via Web3 provider like MetaMask).

### Schema
| Field       | Type    | Required | Description                                                                 | Example Value                  |
|-------------|---------|----------|-----------------------------------------------------------------------------|--------------------------------|
| `dids`     | string  | Yes      | Ethereum wallet address (DID) extracted from the connected wallet.          | `"0x569bBF1d86D16300A5414d572C7B91b6357ce15C"` |
| `nin`      | string  | Yes      | National Identification Number (NIN).                                       | `"12345678901"`                |
| `fullName` | string  | Yes      | Full name of the user (including spaces).                                   | `"Enoch Promise "`             |
| `dob`      | string  | Yes      | Date of birth in ISO 8601 format (YYYY-MM-DD).                              | `"1998-07-12"`                 |
| `pinToIPFS`| boolean | No       | Flag to pin the generated VC to IPFS. Defaults to `false`.                  | `false`                        |

### Example Request
```json
{
  "dids": "0x569bBF1d86D16300A5414d572C7B91b6357ce15C",
  "nin": "12345678901",
  "fullName": "Enoch Promise ",
  "dob": "1998-07-12",
  "pinToIPFS": false
}
```

## Response
### Success (HTTP 200)
The response includes a `success` flag, the generated Verifiable Credential (`vc`), a hash of the VC (`vcHash`), a digital signature (`signature`), and an optional IPFS CID if pinned.

#### Schema
| Field       | Type     | Description                                                                 |
|-------------|----------|-----------------------------------------------------------------------------|
| `success`  | boolean  | Indicates if the operation was successful (`true`).                         |
| `vc`       | object   | The Verifiable Credential object conforming to W3C standards. Includes context, ID, type, issuer (system DID), issuance date, and credential subject (user details). |
| `vcHash`   | string   | Keccak-256 hash of the serialized VC for integrity verification.            |
| `signature`| string   | ECDSA signature of the VC hash using the issuer's private key.              |
| `ipfsCid`  | string/null | IPFS Content Identifier if `pinToIPFS` was `true`; otherwise `null`.     |

#### Example Response
```json
{
  "success": true,
  "vc": {
    "@context": [
      "https://www.w3.org/2018/credentials/v1"
    ],
    "id": "urn:uuid:f87ea116d1a68b1ba91ff8f60851cc35",
    "type": [
      "VerifiableCredential",
      "IdentityCredential"
    ],
    "issuer": "did:ethr:0x2D1E758AD9172F743FE52741c4804C4F9EE0cBF2",
    "issuanceDate": "2025-10-30T15:36:35.851Z",
    "credentialSubject": {
      "id": "did:ethr:0xC66387aAa227A64C4E596fFf4Be9215c2B8d0830",
      "fullName": "Enoch Promise ",
      "dob": "1998-07-12",
      "nin": "12345678901"
    }
  },
  "vcHash": "0x9deeac57fdd039dffecb33d08463bf43c2f168ea0cf5ed7630cd0cc8111d27f5",
  "signature": "0xf7712c13e9ee5ad22f79333128135cc3a732e0dd044fd2bbfd87b80bbdd36d3c6cc02b676d97322b469267bee409c1e6c54633acf0c97bd898d2783335fee77e1b",
  "ipfsCid": null
}
```

### Error Responses
| HTTP Status | Description                  | Example Body                                      |
|-------------|------------------------------|---------------------------------------------------|
| 400         | Bad Request (invalid input) | `{"success": false, "error": "Invalid NIN format"}` |
| 401         | Unauthorized (no wallet)    | `{"success": false, "error": "Wallet not connected"}` |
| 500         | Internal Server Error       | `{"success": false, "error": "Failed to generate VC"}` |

## Usage Notes
- **Wallet Integration**: Ensure the frontend extracts the user's Ethereum address (e.g., via `window.ethereum.request({ method: 'eth_accounts' })`) and populates the `dids` field.
- **Validation**: 
  - `nin`: 11-digit string (Nigeria NIN standard).
  - `dob`: Must be a valid past date; users under 18 may be rejected (server-side logic).
  - `fullName`: Trimmed and sanitized on server.
- **Security**: The VC is signed by a system issuer DID. Clients should verify the signature using the issuer's public key.
- **IPFS Pinning**: If `true`, the VC is uploaded and pinned to IPFS for decentralized storage. Retrieve via `ipfs://<cid>`.
- **Testing**: Use tools like Postman or curl. Example curl:
  ```
  curl -X POST https://welli-record.vercel.app/app/onboard \
    -H "Content-Type: application/json" \
    -d '{
      "dids": "0x569bBF1d86D16300A5414d572C7B91b6357ce15C",
      "nin": "12345678901",
      "fullName": "Enoch Promise ",
      "dob": "1998-07-12",
      "pinToIPFS": false
    }'
  ```

For questions or updates, contact the development team. This documentation is current as of October 30, 2025.