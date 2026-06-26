# Techstoriess Performance Fixes – Installation Guide

## Quick Install

1. Upload the `performance-plugin/` folder to `wp-content/plugins/techstoriess-performance/`
2. Activate via **Plugins → Installed Plugins**
3. No settings page needed — all fixes are automatic.

---

## What Each Fix Does

### Fix 1 – Elementor CSS Bloat (`inc/elementor-css.php`)

| Problem | Solution |
|---|---|
| Elementor loads its full icon/widget library CSS on every page | Enables "Optimised CSS Loading" (loads only used CSS) |
| Font Awesome loaded even when no FA icons are on the page | Conditionally dequeues FA stylesheets |
| Swiper JS loaded even when no carousel exists | Conditionally dequeues Swiper |
| Per-post CSS file = extra HTTP request | Inlines it in `<style>` if < 20 KB |

**Manual step:** In WP Admin → Elementor → Settings → Performance, also tick:
- ✅ Improved CSS Loading
- ✅ Inline Font Icons

---

### Fix 2 – Google Fonts (render-blocking) (`inc/fonts.php`)

| Problem | Solution |
|---|---|
| `<link rel="stylesheet" href="fonts.googleapis.com/...">` blocks render | Dequeues all Google Fonts enqueued by Elementor/theme |
| No fallback while web font loads → invisible text (FOIT) | Adds `font-display: swap` override |
| Network round-trip to Google before page paints | Async-loads via `rel="preload"` + onload swap |

**Customise the font URL** in your theme's `functions.php`:
```php
add_filter( 'tsperf_google_fonts_url', function() {
    return 'https://fonts.googleapis.com/css2?family=YourFont:wght@400;700&display=swap';
} );
```

---

### Fix 3 – Render-Blocking External CSS/JS (`inc/render-blocking.php`)

| Problem | Solution |
|---|---|
| Third-party scripts block HTML parsing | Adds `defer` attribute to non-critical scripts |
| Dashicons, WP block library loaded on frontend | Deferred with async-CSS pattern |
| No DNS lookup for third-party origins until HTML is parsed | Adds `<link rel="dns-prefetch">` hints |

**Add handles to keep synchronous:**
```php
add_filter( 'tsperf_sync_scripts', function( $handles ) {
    $handles[] = 'my-critical-script';
    return $handles;
} );
```

**Add handles to defer:**
```php
add_filter( 'tsperf_deferred_styles', function( $handles ) {
    $handles[] = 'some-third-party-css';
    return $handles;
} );
```

---

### Fix 4 – Hero Image LCP (`inc/lcp-hero.php`)

| Problem | Solution |
|---|---|
| WordPress adds `loading="lazy"` to ALL images, including hero | Detects first image, sets `loading="eager"` |
| Hero image not prioritised in browser fetch queue | Adds `fetchpriority="high"` attribute |
| Hero starts loading only when parser reaches `<img>` | Emits `<link rel="preload" as="image">` in `<head>` |
| Responsive images not preloaded | Uses `imagesrcset` + `imagesizes` in preload link |

The plugin auto-detects the hero from:
1. First Elementor background/image widget
2. Post featured image
3. Custom field `hero_image_id`

---

### Fix 5 – Cookie Banner CLS (`inc/cookie-cls.php`)

| Problem | Solution |
|---|---|
| Banner injected by JS after first paint → page jumps | Slides in via CSS animation (no layout shift) |
| Banner in normal flow → pushes content down | Forced `position:fixed` on all common banner selectors |
| Banner visible briefly to returning visitors (FOUC) | JS reads cookie on page load, hides banner immediately |
| No space reserved → banner covers content | Adds `padding-bottom: 80px` to `<body>` while banner is active |

**Compatible with:** Cookie Notice & Compliance, CookieConsent (Osano), Complianz, GDPR Cookie Consent (WebToffee), CookieYes.

---

## Expected Core Web Vitals Impact

| Metric | Before | Expected After |
|---|---|---|
| LCP | Poor (lazy hero, render-blocking fonts) | Good (preloaded, eager hero) |
| CLS | Poor (cookie banner shift) | Good (fixed overlay + reserved space) |
| FCP | Poor (blocking fonts/CSS) | Improved (async fonts, deferred CSS) |
| TBT/INP | Moderate | Improved (deferred scripts) |
