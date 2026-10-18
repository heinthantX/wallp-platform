package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/model"
)

// Token types inside the JWT.
const (
	TypeAccess = "access"
	TypeMFA    = "mfa" // passed the password step, waiting for the TOTP code
)

type Claims struct {
	Kind string `json:"knd"` // model.SubjectAdmin or model.SubjectApp
	Type string `json:"typ"`
	Role string `json:"rol,omitempty"`
	Name string `json:"nam,omitempty"`
	jwt.RegisteredClaims
}

type Tokens struct {
	AccessToken  string    `json:"accessToken"`
	RefreshToken string    `json:"refreshToken"`
	ExpiresAt    time.Time `json:"expiresAt" doc:"When the access token expires"`
}

type Service struct {
	DB         *bun.DB
	Secret     []byte
	AccessTTL  time.Duration
	RefreshTTL time.Duration
	Issuer     string
	Now        func() time.Time
}

var (
	ErrInvalidToken = errors.New("invalid or expired token")
	ErrTokenReused  = errors.New("refresh token reused; all sessions of this login were signed out")
)

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now().UTC()
}

func (s *Service) sign(c Claims, ttl time.Duration) (string, time.Time, error) {
	now := s.now()
	exp := now.Add(ttl)
	c.Issuer = s.Issuer
	c.IssuedAt = jwt.NewNumericDate(now)
	c.ExpiresAt = jwt.NewNumericDate(exp)
	c.ID = uuid.NewString()
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(s.Secret)
	return tok, exp, err
}

// Parse checks the signature, expiry and the expected token type.
func (s *Service) Parse(token, wantType string) (*Claims, error) {
	c := &Claims{}
	_, err := jwt.ParseWithClaims(token, c, func(t *jwt.Token) (any, error) {
		return s.Secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(s.Issuer),
		jwt.WithTimeFunc(s.now), jwt.WithExpirationRequired())
	if err != nil || c.Type != wantType {
		return nil, ErrInvalidToken
	}
	return c, nil
}

// MFAToken is the short-lived ticket between the password and TOTP steps.
func (s *Service) MFAToken(userID string) (string, error) {
	tok, _, err := s.sign(Claims{Kind: model.SubjectAdmin, Type: TypeMFA,
		RegisteredClaims: jwt.RegisteredClaims{Subject: userID}}, 5*time.Minute)
	return tok, err
}

type Meta struct{ UserAgent, IP string }

// Issue starts a new login (new refresh-token family).
func (s *Service) Issue(ctx context.Context, kind, userID, role, name string, m Meta) (*Tokens, error) {
	return s.issue(ctx, s.DB, kind, userID, role, name, uuid.NewString(), m)
}

func (s *Service) issue(ctx context.Context, db bun.IDB, kind, userID, role, name, family string, m Meta) (*Tokens, error) {
	access, exp, err := s.sign(Claims{Kind: kind, Type: TypeAccess, Role: role, Name: name,
		RegisteredClaims: jwt.RegisteredClaims{Subject: userID}}, s.AccessTTL)
	if err != nil {
		return nil, err
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	refresh := base64.RawURLEncoding.EncodeToString(raw)
	rt := &model.RefreshToken{
		ID: uuid.NewString(), SubjectKind: kind, UserID: userID, FamilyID: family,
		TokenHash: HashToken(refresh), ExpiresAt: s.now().Add(s.RefreshTTL),
		UserAgent: truncate(m.UserAgent, 300), IP: truncate(m.IP, 64), CreatedAt: s.now(),
	}
	if _, err := db.NewInsert().Model(rt).Exec(ctx); err != nil {
		return nil, err
	}
	return &Tokens{AccessToken: access, RefreshToken: refresh, ExpiresAt: exp}, nil
}

// Lookup is how Refresh learns a user's current role and whether they may
// still sign in; it returns ok=false for disabled or deleted users.
type Lookup func(ctx context.Context, db bun.IDB, userID string) (role, name string, ok bool, err error)

// Refresh rotates a refresh token. Using an already-rotated token revokes
// the whole family (stolen-token detection).
func (s *Service) Refresh(ctx context.Context, kind, refresh string, m Meta, lookup Lookup) (*Tokens, error) {
	var out *Tokens
	var reusedFamily string
	err := s.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		rt := new(model.RefreshToken)
		err := tx.NewSelect().Model(rt).
			Where("token_hash = ?", HashToken(refresh)).
			Where("subject_kind = ?", kind).
			Scan(ctx)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrInvalidToken
		}
		if err != nil {
			return err
		}
		now := s.now()
		if rt.RevokedAt != nil {
			reusedFamily = rt.FamilyID
			return ErrTokenReused
		}
		if now.After(rt.ExpiresAt) {
			return ErrInvalidToken
		}
		role, name, ok, err := lookup(ctx, tx, rt.UserID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrInvalidToken
		}
		if _, err := tx.NewUpdate().Model(rt).Set("revoked_at = ?", now).WherePK().Exec(ctx); err != nil {
			return err
		}
		out, err = s.issue(ctx, tx, kind, rt.UserID, role, name, rt.FamilyID, m)
		return err
	})
	if reusedFamily != "" {
		// Outside the tx: the error above rolled it back.
		if rerr := s.RevokeFamily(ctx, reusedFamily); rerr != nil {
			return nil, rerr
		}
	}
	return out, err
}

// Revoke signs out one login (the refresh token's family).
func (s *Service) Revoke(ctx context.Context, kind, refresh string) error {
	rt := new(model.RefreshToken)
	err := s.DB.NewSelect().Model(rt).Where("token_hash = ?", HashToken(refresh)).
		Where("subject_kind = ?", kind).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return s.RevokeFamily(ctx, rt.FamilyID)
}

func (s *Service) RevokeFamily(ctx context.Context, family string) error {
	_, err := s.DB.NewUpdate().Model((*model.RefreshToken)(nil)).
		Set("revoked_at = ?", s.now()).
		Where("family_id = ?", family).Where("revoked_at IS NULL").Exec(ctx)
	return err
}

// RevokeUser signs a user out everywhere (password change, disable).
func (s *Service) RevokeUser(ctx context.Context, db bun.IDB, kind, userID string) error {
	_, err := db.NewUpdate().Model((*model.RefreshToken)(nil)).
		Set("revoked_at = ?", s.now()).
		Where("subject_kind = ?", kind).Where("user_id = ?", userID).Where("revoked_at IS NULL").
		Exec(ctx)
	return err
}

func HashToken(t string) string {
	h := sha256.Sum256([]byte(t))
	return hex.EncodeToString(h[:])
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
