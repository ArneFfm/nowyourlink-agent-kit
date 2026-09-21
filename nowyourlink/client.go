// Package nowyourlink is the official nowyourlink Go SDK for the public advertising Spotlight API
// (https://nowyourlink.com). Documentation: https://nowyourlink.com/developers
//
// The API is anonymous. Every method performs one GET against
// https://nowyourlink.com and returns the JSON envelope decoded into the
// typed structs below. There are no retries, redirects or writes.
// Documentation: https://nowyourlink.com/developers
package nowyourlink

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"time"
)

// DefaultBaseURL is the production origin.
const DefaultBaseURL = "https://nowyourlink.com"

// Spotlight is one settled public advertisement.
type Spotlight struct {
	Day          string `json:"day"`
	Headline     string `json:"headline"`
	Description  string `json:"description"`
	Advertiser   string `json:"advertiser"`
	CanonicalURL string `json:"canonicalUrl"`
	// ContentType is "paid_advertisement" or "house_advertisement".
	ContentType string `json:"contentType"`
}

// Envelope wraps a single Spotlight.
type Envelope struct {
	Data Spotlight `json:"data"`
}

// Page is one page of the settled archive, newest first.
type Page struct {
	Data       []Spotlight `json:"data"`
	NextOffset *int        `json:"nextOffset"`
	NextCursor *string     `json:"nextCursor"`
}

// Error is an HTTP failure (Status > 0) or a transport/JSON failure (Status == 0).
// Err carries the underlying cause for errors.Is and errors.As.
type Error struct {
	Status  int
	Message string
	Err     error
}

func (e *Error) Error() string { return e.Message }

// Unwrap returns the underlying cause, if any.
func (e *Error) Unwrap() error { return e.Err }

const maxBody = 1 << 20

var dayPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// Client reads the public API. The zero value is not usable; call New.
type Client struct {
	origin string
	http   *http.Client
}

// Option configures a Client.
type Option func(*Client) error

// WithBaseURL replaces the origin. It must be an HTTPS origin without
// credentials, path, query or fragment.
func WithBaseURL(base string) Option {
	return func(c *Client) error {
		u, err := url.Parse(base)
		if err != nil || u.Scheme != "https" || u.User != nil || u.RawQuery != "" ||
			u.Fragment != "" || (u.Path != "" && u.Path != "/") || u.Host == "" {
			return errors.New("base URL must be an HTTPS origin without credentials, path, query or fragment")
		}
		c.origin = u.Scheme + "://" + u.Host
		return nil
	}
}

// WithHTTPClient replaces the transport, for example in tests. Redirects stay rejected.
func WithHTTPClient(h *http.Client) Option {
	return func(c *Client) error {
		if h == nil {
			return errors.New("http client must not be nil")
		}
		copied := *h
		copied.CheckRedirect = noRedirect
		if copied.Timeout == 0 {
			copied.Timeout = 10 * time.Second
		}
		c.http = &copied
		return nil
	}
}

func noRedirect(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

// New returns a Client with a 10 second timeout that does not follow redirects.
func New(opts ...Option) (*Client, error) {
	c := &Client{
		origin: DefaultBaseURL,
		http: &http.Client{
			Timeout:       10 * time.Second,
			CheckRedirect: noRedirect,
		},
	}
	for _, o := range opts {
		if err := o(c); err != nil {
			return nil, err
		}
	}
	return c, nil
}

func (c *Client) read(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.origin+path, nil)
	if err != nil {
		return &Error{Message: err.Error(), Err: err}
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "nowyourlink-agent-kit-go/0.2.0 (+https://nowyourlink.com/developers)")
	res, err := c.http.Do(req)
	if err != nil {
		return &Error{Message: "public API request failed: " + err.Error(), Err: err}
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, maxBody+1))
	if err != nil {
		return &Error{Message: "public API response could not be read", Err: err}
	}
	if len(body) > maxBody {
		return &Error{Message: "public API response exceeded the 1 MiB client limit"}
	}
	if res.StatusCode != http.StatusOK {
		msg := fmt.Sprintf("public API returned HTTP %d; see https://nowyourlink.com/developers.md", res.StatusCode)
		if loc := res.Header.Get("Location"); loc != "" && res.StatusCode >= 300 && res.StatusCode < 400 {
			msg = fmt.Sprintf("public API redirected (HTTP %d) to %s; redirects are not followed", res.StatusCode, loc)
		}
		var problem struct {
			Detail string `json:"detail"`
		}
		if json.Unmarshal(body, &problem) == nil && problem.Detail != "" {
			msg += ": " + problem.Detail
		}
		return &Error{Status: res.StatusCode, Message: msg}
	}
	if err := json.Unmarshal(body, out); err != nil {
		return &Error{Message: "public API returned invalid JSON", Err: err}
	}
	return nil
}

// Current returns the Spotlight displayed right now.
func (c *Client) Current(ctx context.Context) (*Envelope, error) {
	var e Envelope
	if err := c.read(ctx, "/api/v1/spotlight", &e); err != nil {
		return nil, err
	}
	return &e, nil
}

// List returns settled Spotlights, newest first. limit is 1–50, offset 0–10000.
func (c *Client) List(ctx context.Context, limit, offset int) (*Page, error) {
	if limit < 1 || limit > 50 {
		return nil, &Error{Message: "limit must be an integer from 1 to 50"}
	}
	if offset < 0 || offset > 10000 {
		return nil, &Error{Message: "offset must be an integer from 0 to 10000"}
	}
	var p Page
	if err := c.read(ctx, fmt.Sprintf("/api/v1/spotlights?limit=%d&offset=%d", limit, offset), &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// Day returns the Spotlight settled for one YYYY-MM-DD date.
func (c *Client) Day(ctx context.Context, day string) (*Envelope, error) {
	if !dayPattern.MatchString(day) {
		return nil, &Error{Message: "day must be a YYYY-MM-DD date"}
	}
	if _, err := time.Parse("2006-01-02", day); err != nil {
		return nil, &Error{Message: "day must be a calendar date"}
	}
	var e Envelope
	if err := c.read(ctx, "/api/v1/spotlights/"+day, &e); err != nil {
		return nil, err
	}
	return &e, nil
}
