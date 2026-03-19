# FloorEye v2.0 Security Investigation Report

**Investigator:** SECURITY_INVESTIGATOR
**Date:** 2026-03-18
**Scope:** All authentication, authorization, encryption, org isolation, input validation, and infrastructure security

---

## Executive Summary

The FloorEye security implementation is **competent for a pilot/MVP** but has **7 VULNERABLE**, **6 WEAK**, and **4 MISSING** findings that must be addressed before production hardening. The core JWT + RBAC + org isolation architecture is sound, but critical gaps exist in token revocation, password policy, audit logging, and camera credential encryption.

---

## 1. JWT Implementation

### Q1: Planned
- Access token: JWT HS256, 15-minute expiry (SRD D1)
- Refresh token: JWT HS256, 7-day expiry, httpOnly cookie (SRD D1)
- Edge agent token: separate JWT with `type: "edge_agent"`, 180-day expiry (SRD D1)

### Q2-Q3: Implementation Status

**File:** `backend/app/core/security.py`

| Feature | Status | Details |
|---------|--------|---------|
| HS256 algorithm | SECURE | Line 9: `ALGORITHM = "HS256"` hardcoded, verified in encode + decode |
| Access token expiry | SECURE | Line 29: uses `settings.ACCESS_TOKEN_EXPIRE_MINUTES` (default 15) |
| Refresh token expiry | SECURE | Line 42: uses `settings.REFRESH_TOKEN_EXPIRE_DAYS` (default 7) |
| Token type claim | SECURE | Lines 27, 39: `type: "access"` and `type: "refresh"` claims separate token types |
| Token validation | SECURE | `dependencies.py` line 33: checks `type == "access"` before accepting |

### Q4: Vulnerabilities

**[VULNERABLE] Edge tokens have NO expiry claim**
- **File:** `backend/app/services/edge_service.py`, lines 36-42
- The payload has `sub`, `org_id`, `store_id`, `type`, `iat` but **no `exp` field**
- SRD requires 180-day expiry (`EDGE_TOKEN_EXPIRE_DAYS=180`)
- `settings.EDGE_TOKEN_EXPIRE_DAYS` exists in config.py (line 48) but is NEVER USED
- Impact: Edge tokens are valid FOREVER once issued. A compromised edge device can never have its token expired.
- Fix: Add `"exp": now + timedelta(days=settings.EDGE_TOKEN_EXPIRE_DAYS)` to payload

**[WEAK] No token revocation / blacklist mechanism**
- Logout clears the cookie (auth.py line 71) but does NOT invalidate the refresh token server-side
- No `token_blacklist` collection or Redis-based revocation
- A stolen refresh token remains valid for its full 7-day lifetime
- Fix: Store active refresh tokens in DB/Redis; check on refresh; delete on logout

**[SECURE] Secret key validation for production**
- **File:** `backend/app/core/config.py`, lines 94-102
- Production startup blocks if `SECRET_KEY`, `EDGE_SECRET_KEY`, or `ENCRYPTION_KEY` are set to insecure defaults
- Uses `sys.exit(1)` -- cannot be bypassed

---

## 2. Password Hashing

### Implementation

**File:** `backend/app/core/security.py`

| Feature | Status | Details |
|---------|--------|---------|
| bcrypt hashing | SECURE | Line 14: `bcrypt.gensalt(rounds=10)` -- industry standard |
| Timing-safe comparison | SECURE | Line 18: `bcrypt.checkpw()` is constant-time |
| Password stored as hash | SECURE | `auth_service.py` line 78: stores `password_hash` |

### Vulnerability

**[VULNERABLE] No password complexity/length validation**
- **File:** `backend/app/schemas/auth.py`
- `LoginRequest.password`: `str` -- no constraints (line 9)
- `UserCreate.password`: `str` -- no constraints (line 34)
- `ProfileUpdate.password`: `Optional[str]` -- no constraints (line 57)
- A user can set password to "1" or empty string
- Fix: Add `min_length=8` and regex validator for complexity

---

## 3. RBAC Role Hierarchy

### Implementation

**File:** `backend/app/core/permissions.py` + `backend/app/core/constants.py`

| Feature | Status | Details |
|---------|--------|---------|
| Role hierarchy | SECURE | constants.py lines 130-137: `viewer < store_owner < operator < ml_engineer < org_admin < super_admin` |
| Role check dependency | SECURE | permissions.py: `require_role()` returns FastAPI dependency that validates `user_index >= min_index` |
| Unknown role rejection | SECURE | permissions.py line 19-23: unknown roles get 403 |

### Q6: Endpoint Role Assignments (Sampled)

| Router | Min Role Required | Matches SRD? |
|--------|-------------------|--------------|
| `stores.py` GET | viewer | Yes (SRD: Viewer+) |
| `stores.py` POST/PUT/DELETE | org_admin | Yes (SRD: Admin+) |
| `cameras.py` GET | viewer | Yes (SRD: Viewer+) |
| `cameras.py` POST/PUT/DELETE | org_admin | Yes (SRD: Admin+) |
| `cameras.py` test/quality | operator | Yes (SRD: Operator+) |
| `detection.py` run | operator | Yes (SRD: Operator+) |
| `detection.py` history | viewer | Yes (SRD: Viewer+) |
| `detection.py` flagged | org_admin | Yes (SRD: Admin+) |
| `edge.py` admin endpoints | org_admin | Yes (SRD: Admin+) |
| `integrations.py` CRUD | org_admin | Yes (SRD: Admin+) |
| `integrations.py` /status | viewer | Acceptable |
| `mobile.py` all endpoints | store_owner | Yes (SRD: Store Owner) |
| `auth.py` register/users | org_admin | Yes (SRD: Admin+) |

**Verdict: SECURE** -- All sampled endpoints match SRD role requirements.

### Vulnerability

**[WEAK] Privilege escalation via user creation**
- **File:** `backend/app/services/auth_service.py`, line 64-89
- An `org_admin` can create a user with `role: "super_admin"` in their org
- The `UserCreate` schema (auth.py line 35-38) allows ALL roles including `super_admin`
- Fix: `create_user` should reject if `data.role` is higher than the caller's role

---

## 4. Org Isolation

### Implementation

**File:** `backend/app/core/org_filter.py`

```python
def org_query(org_id: str | None, **extra: object) -> dict:
    q: dict = {}
    if org_id:
        q["org_id"] = org_id
    q.update(extra)
    return q
```

When `org_id` is falsy (empty string or None), the filter is OMITTED, allowing super_admin to see all orgs.

### Q5: Org Isolation Enforcement

| Service/Router | Org Filter? | Status |
|----------------|-------------|--------|
| `store_service.py` | Yes -- `_org_filter(org_id)` on all queries | SECURE |
| `camera_service.py` | Yes -- passes org_id to all queries | SECURE |
| `auth_service.py` update_user/deactivate | Yes -- `org_query(org_id)` | SECURE |
| `auth_service.py` list_users | Yes -- filters by org_id | SECURE |
| `integration_service.py` | Yes -- `org_query(org_id)` on all queries | SECURE |
| `edge_service.py` | Yes -- `org_query(org_id)` on all queries | SECURE |
| `mobile_service.py` | Yes -- passes org_id | SECURE |

### Vulnerabilities

**[WEAK] Super_admin org_id is empty string, not None**
- **File:** `backend/app/routers/stores.py`, line 74
- `org_id = current_user.get("org_id", "")` -- returns `""` for super_admin
- `org_filter.py` line 7: `if org_id:` -- empty string is falsy, so filter is omitted (correct behavior)
- BUT: `stores.py` line 76: `await db.stores.count_documents({"org_id": org_id})` -- queries for `org_id: ""` which matches NOTHING
- The `/stores/stats` endpoint is broken for super_admin -- returns all zeros
- Not a security vulnerability but a functional bug

**[VULNERABLE] stores.py /{store_id}/stats missing org isolation**
- **File:** `backend/app/routers/stores.py`, lines 87-129
- Line 97: `store = await db.stores.find_one({"org_id": org_id, "id": store_id})` -- correct
- BUT lines 103-114: subsequent queries use `store_id` directly WITHOUT `org_id` filter:
  - `db.cameras.count_documents({"store_id": store_id})` (line 103)
  - `db.events.count_documents({"store_id": store_id})` (line 112)
  - `db.edge_agents.find_one({"store_id": store_id})` (line 117)
- If the store lookup passes (which it will due to org_id check), the data is scoped correctly since store_id is unique per org. **Low risk** but violates defense-in-depth.

**[VULNERABLE] WebSocket live-frame channel has no org scoping**
- **File:** `backend/app/routers/websockets.py`, lines 236-248
- Channel is `f"live-frame:{camera_id}"` -- any authenticated user can subscribe to ANY camera's live frames
- Compare with `live-detections` (line 226) which correctly uses `f"live-detections:{org_id}"`
- Fix: Look up camera's org_id and verify it matches the user's org_id before connecting

**[VULNERABLE] WebSocket training-job channel has no org scoping**
- **File:** `backend/app/routers/websockets.py`, lines 283-295
- Channel is `f"training-job:{job_id}"` -- any authenticated user can watch any training job
- Fix: Verify job belongs to user's org before subscribing

**[WEAK] WebSocket auth does not verify user exists/is active**
- **File:** `backend/app/routers/websockets.py`, lines 200-213
- `_validate_ws_token()` only decodes the JWT -- does not check if user is still active or exists in DB
- A deactivated user with a valid (non-expired) access token can still receive WebSocket data
- Fix: Query the users collection to verify `is_active: True`

---

## 5. AES-256-GCM Encryption

### Implementation

**File:** `backend/app/core/encryption.py`

| Feature | Status | Details |
|---------|--------|---------|
| AES-256-GCM algorithm | SECURE | Line 39: uses `cryptography.hazmat.primitives.ciphers.aead.AESGCM` |
| Random nonce | SECURE | Line 40: `os.urandom(12)` -- 96-bit random nonce per encryption |
| Nonce + ciphertext storage | SECURE | Line 44: `base64(nonce + ciphertext)` |
| Key length validation | SECURE | Line 23: validates key is exactly 32 bytes |
| Secret masking | SECURE | Lines 58-70: masks sensitive fields when returning configs |

### Vulnerabilities

**[WEAK] SHA-256 fallback for invalid keys**
- **File:** `backend/app/core/encryption.py`, lines 26-33
- If `ENCRYPTION_KEY` is not valid base64, falls back to `hashlib.sha256(key.encode()).digest()`
- In development this means the default `CHANGE_ME_BASE64_32_BYTE_KEY` string gets SHA-256'd into a deterministic key
- Production is protected by config.py line 95-102 exit guard, but dev/staging may use weak key
- Fix: Remove fallback; always require valid base64 key

**[MISSING] Camera stream_url encryption**
- **SRD I3:** "Camera stream URLs encrypted — AES-256-GCM at rest"
- **Actual:** `camera_service.py` stores `stream_url` as plaintext in MongoDB
- `stream_url` field in camera documents is never encrypted/decrypted
- Integration credentials ARE encrypted; camera credentials are NOT
- Fix: Apply encrypt_config/decrypt_config to camera `stream_url` and `credentials` fields

---

## 6. Rate Limiting

### Implementation

**File:** `backend/app/middleware/rate_limiter.py`

| Feature | Status | Details |
|---------|--------|---------|
| Auth endpoint: 10/min | SECURE | Line 20: `/api/v1/auth/login: (10, 60)` |
| Forgot/reset: 5/min | SECURE | Lines 21-22 |
| Detection: 60/min | SECURE | Line 23: `/api/v1/detection/run: (60, 60)` |
| Default: 1000/min | SECURE | Line 27 |
| Redis-backed (shared) | SECURE | Lines 70-91: sliding window with sorted set |
| In-memory fallback | SECURE | Lines 93-108: per-worker fallback if Redis is down |

### Vulnerabilities

**[WEAK] Rate limit key is too coarse**
- **File:** `backend/app/middleware/rate_limiter.py`, line 67
- Key: `f"rl:{client_ip}:{path.split('/')[4] if len(path.split('/')) > 4 else 'default'}"`
- This groups ALL requests to the same path prefix segment, not per-endpoint
- For example, `/api/v1/auth/login` and `/api/v1/auth/logout` both map to key `rl:{ip}:auth`
- The 10 req/min limit for login applies to ALL auth endpoints combined
- Fix: Use the full matched prefix as the key, not just segment [4]

**[MISSING] Rate limiting per org for standard endpoints**
- SRD D1: "Standard endpoints: 1000 requests/minute per org"
- Actual: Rate limiting is per IP, not per org
- Fix: Extract org_id from JWT and use as rate limit key for authenticated endpoints

---

## 7. CORS Configuration

### Implementation

**File:** `backend/app/main.py`, lines 73-79

```python
CORSMiddleware(
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
```

| Feature | Status | Details |
|---------|--------|---------|
| Origin whitelist | SECURE | Not `*`; uses configurable list from env var |
| Credentials allowed | SECURE | Required for httpOnly cookie auth |
| Methods restricted | SECURE | Only needed methods |
| Headers restricted | SECURE | Only `Authorization` and `Content-Type` |

**[SECURE] TrustedHostMiddleware in production**
- main.py lines 82-86: Enabled when `ENVIRONMENT == "production"`

**Verdict: SECURE**

---

## 8. Cookie Security

### Implementation

**File:** `backend/app/core/security.py`, lines 50-59

| Feature | Status | Details |
|---------|--------|---------|
| httpOnly | SECURE | Line 54: `httponly=True` |
| secure flag | SECURE | Line 55: `secure=True` in non-dev environments |
| sameSite | SECURE | Line 56: `samesite="lax"` prevents CSRF |
| path scoping | SECURE | Line 58: `path="/api/v1/auth"` -- cookie only sent to auth endpoints |
| max_age | SECURE | Line 57: matches refresh token expiry |
| Clear on logout | SECURE | Lines 62-69: `clear_refresh_cookie` with matching attributes |

**Verdict: SECURE**

---

## 9. Edge Token Authentication

### Implementation

**File:** `backend/app/routers/edge.py`, lines 35-53

| Feature | Status | Details |
|---------|--------|---------|
| Separate signing key | SECURE | Line 44: uses `settings.EDGE_SECRET_KEY` (different from main SECRET_KEY) |
| Type claim check | SECURE | Line 47: `payload.get("type") != "edge_agent"` |
| Agent existence check | SECURE | Line 50: verifies agent exists in DB |
| Admin endpoints protected | SECURE | All admin edge endpoints require `require_role("org_admin")` |

### Vulnerabilities

**[VULNERABLE] Edge token never expires** (see Section 1)

**[VULNERABLE] Edge token hash stored but never verified**
- `edge_service.py` line 44: `token_hash = hash_password(token)` -- stores bcrypt hash
- `edge.py` `get_edge_agent()`: NEVER checks `token_hash` against the presented token
- The hash serves no purpose; a valid JWT is sufficient
- This means if the JWT signing key is compromised, all edge agents are compromised with no additional protection

---

## 10. Input Validation

### Implementation

| Feature | Status | Details |
|---------|--------|---------|
| Pydantic request schemas | SECURE | All endpoints use typed Pydantic models |
| EmailStr validation | SECURE | auth.py schemas use `EmailStr` for email fields |
| Enum validation | SECURE | Literal types for role, platform, etc. |
| Pagination bounds | SECURE | `Query(20, ge=1, le=100)` on all list endpoints |
| Edge config whitelist | SECURE | edge.py lines 339-351: `_ALLOWED_CONFIG_FIELDS` set |

### Vulnerabilities

**[MISSING] Password validation** (see Section 2)

**[MISSING] No request body size limit**
- FastAPI default allows unlimited request body size
- The `frame_base64` field in edge frame uploads could be arbitrarily large
- Fix: Add request size middleware or field-level validators

---

## 11. NoSQL Injection Prevention

### Implementation

| Feature | Status | Details |
|---------|--------|---------|
| Motor driver | SECURE | Parameterized queries via dict construction |
| Pydantic input parsing | SECURE | Request bodies parsed to typed models before DB queries |
| No raw string interpolation | SECURE | All query construction uses dict literals |
| org_query helper | SECURE | Builds filter dict safely |

**Verdict: SECURE** -- MongoDB + Motor + Pydantic provides strong injection prevention.

---

## 12. Audit Logging

### SRD Requirement
- I3: "Every user action logged to audit_logs"
- Collection `audit_logs` defined in SRD G1

### Implementation

**[MISSING] Audit logging is NOT implemented**
- `backend/app/db/indexes.py` lines 161-162: Creates indexes on `audit_logs` collection
- **No service, router, or middleware writes to `audit_logs`**
- No `audit_service.py` file exists
- User actions (login, create, update, delete) are not logged
- Config changes are not logged
- This is a compliance gap for enterprise customers

---

## Summary Table

### SECURE (12 items)
1. JWT HS256 algorithm and token type separation
2. Access/refresh token expiry configuration
3. bcrypt password hashing (10 rounds, constant-time)
4. RBAC role hierarchy enforcement
5. Endpoint role assignments match SRD
6. Org isolation on all primary CRUD services
7. AES-256-GCM encryption for integration credentials
8. CORS configuration (whitelist, not wildcard)
9. Cookie security (httpOnly, secure, sameSite, path-scoped)
10. Pydantic input validation on all endpoints
11. NoSQL injection prevention (Motor + Pydantic)
12. Production secret validation (blocks startup with defaults)

### WEAK (6 items)
1. No token revocation mechanism (logout only clears cookie)
2. Privilege escalation: org_admin can create super_admin users
3. Super_admin /stores/stats returns zeros (functional bug)
4. WebSocket auth doesn't verify user is active in DB
5. AES encryption SHA-256 fallback for invalid keys in dev
6. Rate limit key grouping is too coarse

### VULNERABLE (7 items)
1. **Edge tokens have NO expiry** -- valid forever once issued
2. **Edge token hash stored but never verified** -- defense-in-depth bypassed
3. **No password complexity validation** -- allows single-character passwords
4. **WebSocket /ws/live-frame/{camera_id} has no org isolation** -- cross-tenant data leak
5. **WebSocket /ws/training-job/{job_id} has no org isolation** -- cross-tenant data leak
6. **Camera stream_url not encrypted at rest** -- SRD requires AES-256-GCM
7. **/{store_id}/stats sub-queries skip org_id filter** -- defense-in-depth violation

### MISSING (4 items)
1. **Audit logging** -- SRD requires every user action logged; nothing is logged
2. **Password policy enforcement** -- no min length, complexity, or history
3. **Rate limiting per org** -- SRD requires per-org limits; implementation is per-IP only
4. **Request body size limits** -- no protection against oversized payloads

---

## Priority Fix Order

### P0 -- Fix Before Production (Security Breaches)
1. Add `exp` to edge JWT payload (edge_service.py line 42)
2. Add org isolation to WebSocket live-frame and training-job channels
3. Add password minimum length validation (8+ chars)
4. Encrypt camera stream_url and credentials at rest

### P1 -- Fix Soon (Defense in Depth)
5. Implement token revocation (Redis set or DB collection)
6. Prevent org_admin from creating super_admin users
7. Verify user is_active in WebSocket auth
8. Fix rate limit key to use full path prefix

### P2 -- Implement for Compliance
9. Implement audit_logs service (log all CRUD and auth events)
10. Add per-org rate limiting for standard endpoints
11. Add request body size limits
12. Remove AES encryption SHA-256 fallback

---

*Report generated by SECURITY_INVESTIGATOR agent, 2026-03-18*
