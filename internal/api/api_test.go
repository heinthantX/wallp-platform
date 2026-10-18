package api_test

import (
	"net/url"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
)

// 1. Setup status needed -> setup creates admin -> setup again 409 setup_done.
func TestSetup(t *testing.T) {
	s := newServer(t)

	// Setup status needed
	status, body := s.do(t, "GET", "/admin/v1/auth/setup", "", nil)
	if status != 200 || body["needed"] != true {
		t.Fatalf("expected needed: true, got status=%d, body=%v", status, body)
	}

	// Setup creates admin
	setupBody := map[string]any{
		"email":    "admin@example.com",
		"name":     "Admin",
		"password": "password12345",
	}
	status, body = s.do(t, "POST", "/admin/v1/auth/setup", "", setupBody)
	if status != 200 {
		t.Fatalf("setup failed: status=%d, body=%v", status, body)
	}
	if body["accessToken"] == nil || body["refreshToken"] == nil {
		t.Fatalf("expected tokens in session, got %v", body)
	}

	// Status now needed: false
	status, body = s.do(t, "GET", "/admin/v1/auth/setup", "", nil)
	if status != 200 || body["needed"] != false {
		t.Fatalf("expected needed: false, got status=%d, body=%v", status, body)
	}

	// Setup again 409 setup_done
	status, body = s.do(t, "POST", "/admin/v1/auth/setup", "", setupBody)
	if status != 409 {
		t.Fatalf("expected 409, got %d (body=%v)", status, body)
	}
	errObj, _ := body["error"].(map[string]any)
	if errObj == nil || errObj["code"] != "setup_done" {
		t.Fatalf("expected error code setup_done, got %v", body)
	}
}

// 2. Login wrong password 401 bad_credentials; error JSON shape {"error":{"code","message"}}.
func TestLoginWrongPassword(t *testing.T) {
	s := newServer(t)

	s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{
		"email":    "admin@example.com",
		"name":     "Admin",
		"password": "password12345",
	})

	status, body := s.do(t, "POST", "/admin/v1/auth/login", "", map[string]any{
		"email":    "admin@example.com",
		"password": "wrongpassword999",
	})
	if status != 401 {
		t.Fatalf("expected 401, got %d", status)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error object, got %v", body)
	}
	if errObj["code"] != "bad_credentials" {
		t.Fatalf("expected code bad_credentials, got %v", errObj["code"])
	}
	if msg, ok := errObj["message"].(string); !ok || msg == "" {
		t.Fatalf("expected non-empty message in error object, got %v", errObj)
	}
}

// 3. Login -> me -> refresh (new tokens) -> old refresh token reused -> 401 token_reused -> the new refresh token is now also rejected (family revoked).
func TestTokenRefreshAndReuse(t *testing.T) {
	s := newServer(t)

	s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{
		"email":    "admin@example.com",
		"name":     "Admin",
		"password": "password12345",
	})

	// Login
	status, body := s.do(t, "POST", "/admin/v1/auth/login", "", map[string]any{
		"email":    "admin@example.com",
		"password": "password12345",
	})
	if status != 200 {
		t.Fatalf("login failed: %d %v", status, body)
	}
	sess, _ := body["session"].(map[string]any)
	if sess == nil {
		t.Fatalf("missing session: %v", body)
	}
	access1 := sess["accessToken"].(string)
	refresh1 := sess["refreshToken"].(string)

	// /admin/v1/auth/me
	status, body = s.do(t, "GET", "/admin/v1/auth/me", access1, nil)
	if status != 200 {
		t.Fatalf("me failed: %d %v", status, body)
	}
	if body["email"] != "admin@example.com" {
		t.Fatalf("expected email admin@example.com, got %v", body["email"])
	}

	// Refresh (new tokens)
	status, body = s.do(t, "POST", "/admin/v1/auth/refresh", "", map[string]any{
		"refreshToken": refresh1,
	})
	if status != 200 {
		t.Fatalf("refresh failed: %d %v", status, body)
	}
	refresh2 := body["refreshToken"].(string)

	// Old refresh token reused -> 401 token_reused
	status, body = s.do(t, "POST", "/admin/v1/auth/refresh", "", map[string]any{
		"refreshToken": refresh1,
	})
	if status != 401 {
		t.Fatalf("expected 401 on token reuse, got %d %v", status, body)
	}
	errObj, _ := body["error"].(map[string]any)
	if errObj == nil || errObj["code"] != "token_reused" {
		t.Fatalf("expected code token_reused, got %v", body)
	}

	// New refresh token is now also rejected (family revoked)
	status, body = s.do(t, "POST", "/admin/v1/auth/refresh", "", map[string]any{
		"refreshToken": refresh2,
	})
	if status != 401 {
		t.Fatalf("expected 401 for revoked family, got %d %v", status, body)
	}
}

// 4. TOTP: setup -> enable with totp.GenerateCode(secret, time.Now()) -> login returns mfaRequired + mfaToken -> mfa with wrong code 401 bad_code -> correct code gives session.
func TestTOTP(t *testing.T) {
	s := newServer(t)

	_, body := s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{
		"email":    "admin@example.com",
		"name":     "Admin",
		"password": "password12345",
	})
	token := body["accessToken"].(string)

	// Setup TOTP
	status, body := s.do(t, "POST", "/admin/v1/auth/totp/setup", token, nil)
	if status != 200 {
		t.Fatalf("totp setup failed: %d %v", status, body)
	}
	secret := body["secret"].(string)

	// Enable TOTP with code
	code, err := totp.GenerateCode(secret, time.Now())
	if err != nil {
		t.Fatalf("generate totp code failed: %v", err)
	}
	status, body = s.do(t, "POST", "/admin/v1/auth/totp/enable", token, map[string]any{
		"code": code,
	})
	if status != 200 || body["totpEnabled"] != true {
		t.Fatalf("totp enable failed: %d %v", status, body)
	}

	// Login returns mfaRequired + mfaToken
	status, body = s.do(t, "POST", "/admin/v1/auth/login", "", map[string]any{
		"email":    "admin@example.com",
		"password": "password12345",
	})
	if status != 200 || body["mfaRequired"] != true || body["mfaToken"] == nil {
		t.Fatalf("expected mfaRequired, got %d %v", status, body)
	}
	mfaToken := body["mfaToken"].(string)

	// MFA with wrong code 401 bad_code
	status, body = s.do(t, "POST", "/admin/v1/auth/mfa", "", map[string]any{
		"mfaToken": mfaToken,
		"code":     "000000",
	})
	if status != 401 {
		t.Fatalf("expected 401 on bad mfa code, got %d %v", status, body)
	}
	errObj, _ := body["error"].(map[string]any)
	if errObj == nil || errObj["code"] != "bad_code" {
		t.Fatalf("expected error code bad_code, got %v", body)
	}

	// Correct code gives session
	code, err = totp.GenerateCode(secret, time.Now())
	if err != nil {
		t.Fatalf("generate code: %v", err)
	}
	status, body = s.do(t, "POST", "/admin/v1/auth/mfa", "", map[string]any{
		"mfaToken": mfaToken,
		"code":     code,
	})
	if status != 200 || body["accessToken"] == nil {
		t.Fatalf("mfa verification failed: %d %v", status, body)
	}
}

// 5. Roles: admin creates viewer; viewer GET /admin/v1/users -> 403; viewer GET /admin/v1/auth/me -> 200.
func TestRoles(t *testing.T) {
	s := newServer(t)

	_, setupBody := s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{
		"email":    "admin@example.com",
		"name":     "Admin",
		"password": "password12345",
	})
	adminToken := setupBody["accessToken"].(string)

	// Admin creates viewer
	status, body := s.do(t, "POST", "/admin/v1/users", adminToken, map[string]any{
		"email":    "viewer@example.com",
		"name":     "Viewer",
		"password": "password12345",
		"role":     "viewer",
	})
	if status != 201 {
		t.Fatalf("create viewer failed: %d %v", status, body)
	}

	// Viewer login
	status, body = s.do(t, "POST", "/admin/v1/auth/login", "", map[string]any{
		"email":    "viewer@example.com",
		"password": "password12345",
	})
	if status != 200 {
		t.Fatalf("viewer login failed: %d %v", status, body)
	}
	sess := body["session"].(map[string]any)
	viewerToken := sess["accessToken"].(string)

	// Viewer GET /admin/v1/users -> 403
	status, body = s.do(t, "GET", "/admin/v1/users", viewerToken, nil)
	if status != 403 {
		t.Fatalf("expected 403 for viewer accessing /users, got %d %v", status, body)
	}

	// Viewer GET /admin/v1/auth/me -> 200
	status, body = s.do(t, "GET", "/admin/v1/auth/me", viewerToken, nil)
	if status != 200 {
		t.Fatalf("viewer get /auth/me failed: %d %v", status, body)
	}
	if body["role"] != "viewer" {
		t.Fatalf("expected role viewer, got %v", body["role"])
	}
}

// 6. Disable: admin disables viewer -> viewer's existing access token -> 401 on /auth/me.
func TestDisableUser(t *testing.T) {
	s := newServer(t)

	_, setupBody := s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{
		"email":    "admin@example.com",
		"name":     "Admin",
		"password": "password12345",
	})
	adminToken := setupBody["accessToken"].(string)

	// Create viewer
	_, vBody := s.do(t, "POST", "/admin/v1/users", adminToken, map[string]any{
		"email":    "viewer@example.com",
		"name":     "Viewer",
		"password": "password12345",
		"role":     "viewer",
	})
	viewerID := vBody["id"].(string)

	// Login as viewer to obtain access token
	_, lBody := s.do(t, "POST", "/admin/v1/auth/login", "", map[string]any{
		"email":    "viewer@example.com",
		"password": "password12345",
	})
	sess := lBody["session"].(map[string]any)
	viewerToken := sess["accessToken"].(string)

	// Admin disables viewer
	status, body := s.do(t, "PATCH", "/admin/v1/users/"+viewerID, adminToken, map[string]any{
		"disabled": true,
	})
	if status != 200 {
		t.Fatalf("disable viewer failed: %d %v", status, body)
	}

	// Viewer's existing access token -> 401 on /auth/me
	status, body = s.do(t, "GET", "/admin/v1/auth/me", viewerToken, nil)
	if status != 401 {
		t.Fatalf("expected 401 on /auth/me for disabled viewer, got %d %v", status, body)
	}
}

// 7. Last admin: own role change 422; 2nd admin disables the 1st; self-disable 422.
func TestLastAdmin(t *testing.T) {
	s := newServer(t)

	_, setupBody := s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{
		"email":    "admin1@example.com",
		"name":     "Admin 1",
		"password": "password12345",
	})
	admin1Token := setupBody["accessToken"].(string)
	user1 := setupBody["user"].(map[string]any)
	admin1ID := user1["id"].(string)

	// Admin 1 PATCH own role -> 422
	status, body := s.do(t, "PATCH", "/admin/v1/users/"+admin1ID, admin1Token, map[string]any{
		"role": "viewer",
	})
	if status != 422 {
		t.Fatalf("expected 422 for patching own role, got %d %v", status, body)
	}

	// Create 2nd admin
	status, body = s.do(t, "POST", "/admin/v1/users", admin1Token, map[string]any{
		"email":    "admin2@example.com",
		"name":     "Admin 2",
		"password": "password12345",
		"role":     "admin",
	})
	if status != 201 {
		t.Fatalf("create admin 2 failed: %d %v", status, body)
	}
	admin2ID := body["id"].(string)

	// Login as admin 2
	status, body = s.do(t, "POST", "/admin/v1/auth/login", "", map[string]any{
		"email":    "admin2@example.com",
		"password": "password12345",
	})
	if status != 200 {
		t.Fatalf("login admin 2 failed: %d %v", status, body)
	}
	sess2 := body["session"].(map[string]any)
	admin2Token := sess2["accessToken"].(string)

	// Disable first admin via second admin -> ok (200)
	status, body = s.do(t, "PATCH", "/admin/v1/users/"+admin1ID, admin2Token, map[string]any{
		"disabled": true,
	})
	if status != 200 {
		t.Fatalf("disable admin 1 via admin 2 failed: %d %v", status, body)
	}

	// The only remaining admin can't disable themself (self-guard; last_admin is a backstop).
	status, body = s.do(t, "PATCH", "/admin/v1/users/"+admin2ID, admin2Token, map[string]any{
		"disabled": true,
	})
	if status != 422 {
		t.Fatalf("expected 422 for self-disable, got %d %v", status, body)
	}
	errObj, _ := body["error"].(map[string]any)
	if errObj == nil || errObj["field"] != "disabled" {
		t.Fatalf("expected field disabled, got %v", body)
	}
}

func TestSQLInjection(t *testing.T) {
	s := newServer(t)

	_, setupBody := s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{
		"email":    "admin@example.com",
		"name":     "Admin",
		"password": "password12345",
	})
	adminToken := setupBody["accessToken"].(string)

	// 1. GET /admin/v1/users?q=' OR 1=1 -- -> 200, 0 items
	status, body := s.do(t, "GET", "/admin/v1/users?q="+url.QueryEscape("' OR 1=1 --"), adminToken, nil)
	if status != 200 {
		t.Fatalf("expected 200 for q=' OR 1=1 --, got %d %v", status, body)
	}
	items, _ := body["items"].([]any)
	if len(items) != 0 {
		t.Fatalf("expected 0 items for injection q, got %d", len(items))
	}

	// 2. ?q=% -> 0 items (escaped LIKE) when no email contains %
	status, body = s.do(t, "GET", "/admin/v1/users?q="+url.QueryEscape("%"), adminToken, nil)
	if status != 200 {
		t.Fatalf("expected 200 for q=%%, got %d %v", status, body)
	}
	items, _ = body["items"].([]any)
	if len(items) != 0 {
		t.Fatalf("expected 0 items for q=%%, got %d", len(items))
	}

	// 3. ?sort=name;DROP TABLE admin_users -> 422
	status, body = s.do(t, "GET", "/admin/v1/users?sort="+url.QueryEscape("name;DROP TABLE admin_users"), adminToken, nil)
	if status != 422 {
		t.Fatalf("expected 422 for sort injection, got %d %v", status, body)
	}

	// 4. ?role=admin' OR '1'='1 -> 422
	status, body = s.do(t, "GET", "/admin/v1/users?role="+url.QueryEscape("admin' OR '1'='1"), adminToken, nil)
	if status != 422 {
		t.Fatalf("expected 422 for role injection, got %d %v", status, body)
	}

	// 5. GET /admin/v1/audit?itemType=x' OR '1'='1 -> 0 items
	status, body = s.do(t, "GET", "/admin/v1/audit?itemType="+url.QueryEscape("x' OR '1'='1"), adminToken, nil)
	if status != 200 {
		t.Fatalf("expected 200 for audit itemType injection, got %d %v", status, body)
	}
	items, _ = body["items"].([]any)
	if len(items) != 0 {
		t.Fatalf("expected 0 items for audit injection, got %d", len(items))
	}

	// 6. app login with email a@b.c' OR '1'='1 -> 401/422
	status, body = s.do(t, "POST", "/v1/auth/login", "", map[string]any{
		"email":    "a@b.c' OR '1'='1",
		"password": "password12345",
	})
	if status != 401 && status != 422 {
		t.Fatalf("expected 401 or 422 for app login injection, got %d %v", status, body)
	}

	// 7. Afterwards login still works (table intact)
	status, body = s.do(t, "POST", "/admin/v1/auth/login", "", map[string]any{
		"email":    "admin@example.com",
		"password": "password12345",
	})
	if status != 200 || body["session"] == nil {
		t.Fatalf("login should still work after injection attempts, got %d %v", status, body)
	}
}

// 9. Audit: after create-user, /admin/v1/audit?itemType=user has a create entry whose after has no passwordHash/password_hash key.
func TestAudit(t *testing.T) {
	s := newServer(t)

	_, setupBody := s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{
		"email":    "admin@example.com",
		"name":     "Admin",
		"password": "password12345",
	})
	adminToken := setupBody["accessToken"].(string)

	// Create user
	status, _ := s.do(t, "POST", "/admin/v1/users", adminToken, map[string]any{
		"email":    "auditee@example.com",
		"name":     "Auditee",
		"password": "password12345",
		"role":     "reviewer",
	})
	if status != 201 {
		t.Fatalf("expected 201 on create user, got %d", status)
	}

	// Check audit log
	status, body := s.do(t, "GET", "/admin/v1/audit?itemType=user", adminToken, nil)
	if status != 200 {
		t.Fatalf("expected 200 on get audit, got %d %v", status, body)
	}
	items, _ := body["items"].([]any)
	if len(items) == 0 {
		t.Fatalf("expected audit entries, got 0")
	}

	foundCreate := false
	for _, it := range items {
		entry, _ := it.(map[string]any)
		if entry["action"] == "create" {
			foundCreate = true
			after, ok := entry["after"].(map[string]any)
			if !ok {
				t.Fatalf("expected after to be a map, got %v", entry["after"])
			}
			if _, exists := after["passwordHash"]; exists {
				t.Fatalf("audit after should NOT contain passwordHash: %v", after)
			}
			if _, exists := after["password_hash"]; exists {
				t.Fatalf("audit after should NOT contain password_hash: %v", after)
			}
		}
	}
	if !foundCreate {
		t.Fatalf("did not find create action in audit entries: %v", items)
	}
}

// 10. App accounts: register -> me -> add favourite -> put favourites (replace) -> list -> remove -> delete account -> login fails. Admin token on /v1/me -> 401; app token on /admin/v1/auth/me -> 401.
func TestAppAccounts(t *testing.T) {
	s := newServer(t)

	// 1. Register
	status, body := s.do(t, "POST", "/v1/auth/register", "", map[string]any{
		"email":       "user@example.com",
		"password":    "password12345",
		"displayName": "User",
	})
	if status != 201 {
		t.Fatalf("register failed: %d %v", status, body)
	}
	appToken := body["accessToken"].(string)

	// 2. Me
	status, body = s.do(t, "GET", "/v1/me", appToken, nil)
	if status != 200 || body["email"] != "user@example.com" {
		t.Fatalf("app me failed: %d %v", status, body)
	}

	// Link install
	installID := "11111111-1111-1111-1111-111111111111"
	status, _ = s.do(t, "POST", "/v1/me/installs", appToken, map[string]any{
		"installId":  installID,
		"appVersion": "1.0.0",
	})
	if status != 204 {
		t.Fatalf("app link install failed: %d", status)
	}

	// 3. Add favourite
	status, _ = s.do(t, "POST", "/v1/me/favourites", appToken, map[string]any{
		"itemType": "wallpaper",
		"itemId":   "wp-01",
	})
	if status != 204 {
		t.Fatalf("add favourite failed: %d", status)
	}

	// 4. Put favourites (replace)
	putBody := map[string]any{
		"items": []map[string]any{
			{"itemType": "theme", "itemId": "theme-dark"},
			{"itemType": "font", "itemId": "font-inter"},
		},
	}
	status, body = s.do(t, "PUT", "/v1/me/favourites", appToken, putBody)
	if status != 200 {
		t.Fatalf("put favourites failed: %d %v", status, body)
	}
	items, _ := body["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("expected 2 replaced favourites, got %d (%v)", len(items), items)
	}

	// 5. List favourites
	status, body = s.do(t, "GET", "/v1/me/favourites", appToken, nil)
	if status != 200 {
		t.Fatalf("list favourites failed: %d %v", status, body)
	}
	items, _ = body["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("expected 2 favourites in list, got %d (%v)", len(items), items)
	}

	// 6. Remove favourite
	status, _ = s.do(t, "DELETE", "/v1/me/favourites/theme/theme-dark", appToken, nil)
	if status != 204 {
		t.Fatalf("remove favourite failed: %d", status)
	}
	// Verify removed
	status, body = s.do(t, "GET", "/v1/me/favourites", appToken, nil)
	items, _ = body["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("expected 1 favourite after remove, got %d (%v)", len(items), items)
	}

	// 7. Delete account
	status, _ = s.do(t, "DELETE", "/v1/me", appToken, map[string]any{
		"password": "password12345",
	})
	if status != 204 {
		t.Fatalf("delete account failed: %d", status)
	}

	// 8. Login fails
	status, body = s.do(t, "POST", "/v1/auth/login", "", map[string]any{
		"email":    "user@example.com",
		"password": "password12345",
	})
	if status != 401 {
		t.Fatalf("expected 401 login after delete, got %d %v", status, body)
	}

	// Setup admin to test cross-auth rejection
	_, adminSetup := s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{
		"email":    "admin@example.com",
		"name":     "Admin",
		"password": "password12345",
	})
	adminToken := adminSetup["accessToken"].(string)

	// Register another app user
	_, newApp := s.do(t, "POST", "/v1/auth/register", "", map[string]any{
		"email":       "user2@example.com",
		"password":    "password12345",
		"displayName": "User 2",
	})
	appToken2 := newApp["accessToken"].(string)

	// Admin token on /v1/me -> 401
	status, _ = s.do(t, "GET", "/v1/me", adminToken, nil)
	if status != 401 {
		t.Fatalf("expected 401 for admin token on /v1/me, got %d", status)
	}

	// App token on /admin/v1/auth/me -> 401
	status, _ = s.do(t, "GET", "/admin/v1/auth/me", appToken2, nil)
	if status != 401 {
		t.Fatalf("expected 401 for app token on /admin/v1/auth/me, got %d", status)
	}
}
