package nowyourlink

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestClient(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewTLSServer(h)
	t.Cleanup(srv.Close)
	c, err := New(WithBaseURL(srv.URL), WithHTTPClient(srv.Client()))
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestReadsAndValidates(t *testing.T) {
	var gotPath string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.RequestURI()
		switch r.URL.Path {
		case "/api/v1/spotlights":
			w.Write([]byte(`{"data":[{"day":"2026-09-01","headline":"h","description":"d","advertiser":"a","canonicalUrl":"https://x.example","contentType":"paid_advertisement"}],"nextOffset":1,"nextCursor":"2026-09-01"}`))
		case "/api/v1/spotlights/2026-09-02":
			http.Error(w, `{"status":404}`, http.StatusNotFound)
		default:
			w.Write([]byte(`{"data":{"day":"2026-09-03","headline":"now","description":"","advertiser":"","canonicalUrl":"https://x.example","contentType":"house_advertisement"}}`))
		}
	})
	ctx := context.Background()
	cur, err := c.Current(ctx)
	if err != nil || cur.Data.Headline != "now" || gotPath != "/api/v1/spotlight" {
		t.Fatalf("current: %v %+v %s", err, cur, gotPath)
	}
	page, err := c.List(ctx, 5, 0)
	if err != nil || len(page.Data) != 1 || *page.NextOffset != 1 || gotPath != "/api/v1/spotlights?limit=5&offset=0" {
		t.Fatalf("list: %v %+v %s", err, page, gotPath)
	}
	_, err = c.Day(ctx, "2026-09-02")
	var apiErr *Error
	if !errors.As(err, &apiErr) || apiErr.Status != 404 {
		t.Fatalf("day 404: %v", err)
	}
	for _, bad := range []func() error{
		func() error { _, e := c.List(ctx, 0, 0); return e },
		func() error { _, e := c.List(ctx, 1, 10001); return e },
		func() error { _, e := c.Day(ctx, "2026-02-30"); return e },
		func() error { _, e := c.Day(ctx, "bad"); return e },
	} {
		if err := bad(); err == nil {
			t.Fatal("expected validation error")
		}
	}
	if _, err := New(WithBaseURL("http://nowyourlink.com")); err == nil {
		t.Fatal("expected https-only base URL error")
	}
	if _, err := New(WithBaseURL("https://nowyourlink.com/path")); err == nil {
		t.Fatal("expected origin-only base URL error")
	}
}

func TestRejectsRedirectsAndBadJSON(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/spotlight" {
			http.Redirect(w, r, "/elsewhere", http.StatusFound)
			return
		}
		w.Write([]byte("not json"))
	})
	var apiErr *Error
	if _, err := c.Current(context.Background()); !errors.As(err, &apiErr) || apiErr.Status != 302 {
		t.Fatalf("redirect should surface as HTTP error: %v", err)
	}
	if _, err := c.Day(context.Background(), "2026-09-01"); !errors.As(err, &apiErr) || apiErr.Status != 0 {
		t.Fatalf("bad json: %v", err)
	}
}
