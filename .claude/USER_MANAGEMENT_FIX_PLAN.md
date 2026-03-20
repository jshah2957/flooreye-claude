# USER MANAGEMENT FIX PLAN
# FloorEye — Fix All 12 Issues from User Management Audit
# Created: 2026-03-20
# Status: PENDING APPROVAL — DO NOT IMPLEMENT

---

## CONTEXT

Cloud app is admin-only. Separate client app connects later. Focus on admin security, audit compliance, and operational features.

---

## SESSION 1: Audit Logging (CRITICAL) — ~2 hrs

Wire audit_log.py model (already exists) to actual logging across the system.

1. **Create `backend/app/services/audit_service.py`**:
   - `log_action(db, user_id, user_email, action, resource_type, resource_id, details, request)` — writes to `audit_logs` collection
   - Extracts IP + user_agent from request

2. **Wire to auth events**:
   - Login success/failure → `audit_service.log_action("login"/"login_failed")`
   - Logout → `audit_service.log_action("logout")`
   - User created → `audit_service.log_action("user_created")`
   - User updated → `audit_service.log_action("user_updated")`
   - User deactivated → `audit_service.log_action("user_deactivated")`
   - Role changed → `audit_service.log_action("role_changed")`
   - Password reset → `audit_service.log_action("password_reset")`

3. **Wire to critical operations**:
   - Camera created/deleted → log
   - Store created/deleted → log
   - Detection settings changed → log
   - Model promoted → log
   - Edge agent provisioned/deleted → log

4. **Update LogsPage or create AuditLogPage** to read from `audit_logs` collection

---

## SESSION 2: Token Revocation + Session Management (CRITICAL/HIGH) — ~2.5 hrs

1. **Token blacklist collection** in MongoDB:
   - `token_blacklist`: `{token_jti, user_id, expires_at, revoked_at}`
   - TTL index on `expires_at` (auto-cleanup)
   - Check blacklist in `get_current_user()` dependency

2. **Add `jti` (JWT ID) to all tokens**:
   - `security.py`: include `jti: uuid4()` in token payload
   - `get_current_user()`: check if jti is blacklisted

3. **Session tracking collection**:
   - `user_sessions`: `{id, user_id, jti, device_info, ip, created_at, last_active, is_active}`
   - Created on login, updated on each authenticated request

4. **New endpoints**:
   - `GET /api/v1/auth/sessions` — list my active sessions
   - `DELETE /api/v1/auth/sessions/{session_id}` — revoke specific session
   - `POST /api/v1/auth/logout-all` — revoke all sessions for current user

5. **Logout properly revokes token**:
   - Add jti to blacklist on logout

---

## SESSION 3: Account Lockout (HIGH) — ~1 hr

1. **Track failed attempts** on user document:
   - `failed_login_attempts: int = 0`
   - `locked_until: datetime | None = None`

2. **Lock after 5 consecutive failures**:
   - Lock for 15 minutes
   - Reset counter on successful login
   - Audit log: "account_locked"

3. **Check lock before auth**:
   - In `authenticate_user()`: if `locked_until > now`, reject with "Account locked" message
   - Include remaining lockout time in response

---

## SESSION 4: Role Escalation Fix + store_access Enforcement (MEDIUM) — ~1 hr

1. **Fix update_user()** in auth_service.py:
   - Add same role hierarchy check as create_user()
   - Prevent user from changing own role
   - Prevent escalation beyond current user's rank

2. **Enforce store_access**:
   - Update `list_cameras()` to filter by user's `store_access` if not admin
   - Update `list_stores()` same way
   - Update `list_devices()` same way
   - Only apply for non-admin roles (operator, store_owner, viewer)

---

## SESSION 5: UsersPage Edit Form + Idle Timeout (MEDIUM) — ~1.5 hrs

1. **Add edit user modal** to UsersPage:
   - Click user row → edit modal (name, email, role, store_access, password reset)
   - Save calls PUT /auth/users/{id}
   - Show last_login time
   - Role dropdown respects hierarchy (can't assign higher role than own)

2. **Idle timeout** (frontend):
   - Track last activity timestamp
   - After 30 min of no activity → auto-logout
   - Warning dialog at 25 min: "Session expiring in 5 minutes"
   - Reset on any user interaction

---

## SESSION 6: Verification — ~30 min

- All 12 issues addressed
- Backend imports clean
- Frontend builds clean
- Audit log writes verified
- Token revocation flow verified

---

## SESSION SUMMARY

| Session | Issues Fixed | Effort |
|---------|-------------|--------|
| 1 | #1 (audit logging) | 2 hrs |
| 2 | #2 (token revocation), #3 (session mgmt) | 2.5 hrs |
| 3 | #4 (account lockout) | 1 hr |
| 4 | #6 (role escalation), #7 (store_access) | 1 hr |
| 5 | #9 (edit form), #8 (idle timeout) | 1.5 hrs |
| 6 | Verification | 0.5 hr |
| **Total** | **9 of 12** | **~8.5 hrs** |

## DEFERRED ITEMS (Not in this plan)

| # | Issue | Why Deferred |
|---|-------|-------------|
| 5 | 2FA/MFA | Requires TOTP library + enrollment flow. Plan separately. |
| 10 | Forgot/reset password | Requires SMTP. Plan separately. |
| 11 | Password history | Low priority. Track in future sprint. |
| 12 | Email verification | Requires SMTP. Same dependency as password reset. |

---

## APPROVAL CHECKLIST

- [ ] Audit logging approach (write to existing audit_logs collection)
- [ ] Token blacklist via MongoDB collection + TTL index
- [ ] Session tracking (list/revoke sessions)
- [ ] Account lockout (5 failures → 15 min lock)
- [ ] Role escalation fix on update
- [ ] store_access enforcement on camera/store/device lists
- [ ] User edit modal on UsersPage
- [ ] Idle timeout (30 min, frontend-side)
- [ ] Defer 2FA, SMTP, password history

**AWAITING HUMAN APPROVAL BEFORE ANY IMPLEMENTATION**
