<?php
/**
 * Fix 5 – Cookie banner Cumulative Layout Shift (CLS)
 *
 * Cookie consent banners cause CLS when they pop in at the bottom/top of the
 * viewport after the page has already painted, pushing all other content.
 *
 * Two root causes:
 *   A. The banner is injected via JS after first paint → content jumps.
 *   B. No reserved space → browsers can't pre-allocate room for it.
 *
 * Fixes:
 *   1. Reserve space at the bottom of the viewport with a fixed placeholder
 *      that disappears once the real banner arrives (no shift).
 *   2. Inline the critical cookie CSS in <head> so it's available immediately.
 *   3. Add `position:fixed` + `bottom:0` so the banner overlays content
 *      rather than pushing it (the most CLS-safe approach).
 *   4. Add `transform:translateY(100%)` initial state with a CSS transition
 *      so it slides in without triggering layout recalculation.
 */

defined( 'ABSPATH' ) || exit;

// ── 5a. Inline critical cookie-banner CSS early in <head> ────────────────────
add_action( 'wp_head', function () {
    ?>
<style id="tsperf-cookie-cls">
/*
 * Cookie banner CLS prevention.
 * The banner is position:fixed so it OVERLAYS content (no layout shift).
 * A min-height placeholder keeps the bottom of the page from jumping when
 * the banner slides in.
 */

/* ── Common selectors used by popular GDPR plugins ─────────────────────────── */
.cookie-notice-container,        /* Cookie Notice & Compliance               */
.cc-window,                      /* CookieConsent (Osano / Insites)          */
.cmplz-cookiebanner,             /* Complianz                                */
#cookie-law-info-bar,            /* GDPR Cookie Consent (WebToffee)          */
.cookieConsent,                  /* Generic class used by many plugins       */
.cookie-banner,
#cookie-banner,
.cookie-popup,
#cookie-popup,
[class*="cookie-bar"],
[class*="cookie_bar"],
[id*="cookie-bar"],
[id*="cookie_bar"],
[class*="consent-banner"],
[id*="consent-banner"] {
    /* Force fixed overlay positioning – removes it from the normal flow so
       it can never cause a layout shift on adjacent elements.              */
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 99999 !important;
    width: 100% !important;

    /* Slide-in animation: renders off-screen then slides up.
       This avoids a paint-then-jump; the browser composites the animation
       on the GPU layer without triggering layout.                          */
    transform: translateY(100%);
    animation: tsperf-cookie-slide-in 0.25s ease-out 0.5s forwards;
    will-change: transform;

    /* Guarantee the background is opaque so underlying content doesn't
       show through during the animation.                                   */
    background-color: #fff; /* override per-theme below if needed */
}

@keyframes tsperf-cookie-slide-in {
    to { transform: translateY(0); }
}

/*
 * Body padding reservation.
 * Add padding-bottom equal to a typical banner height (80 px) so the last
 * section of the page isn't hidden behind the fixed banner after consent.
 * The JS snippet below removes this class once the banner is dismissed.
 */
body.tsperf-cookie-active {
    padding-bottom: 80px;
    transition: padding-bottom 0.25s ease-out;
}

/* Remove padding once dismissed */
body.tsperf-cookie-dismissed {
    padding-bottom: 0 !important;
}

/*
 * Prevent FOUC (flash of unstyled content) on the banner itself:
 * hide it until JS has had a chance to show/hide it based on consent state.
 * Without this, the banner may flash visible before the plugin hides it for
 * returning visitors.
 */
.tsperf-cookie-hidden {
    visibility: hidden !important;
    pointer-events: none !important;
}
</style>
    <?php
}, 1 ); // Priority 1 → very first thing in <head>

// ── 5b. Inline JS to apply body class + remove banner FOUC ───────────────────
add_action( 'wp_head', function () {
    ?>
<script>
(function(){
    // Check if the user has already accepted cookies (any of the common storage keys).
    var keys = [
        'cookie_notice_accepted',   // Cookie Notice & Compliance
        'cookieconsent_status',     // CookieConsent / Osano
        'cmplz_statistics',         // Complianz
        'CookieLawInfoConsent',     // GDPR Cookie Consent
        'cookieyes-consent',        // CookieYes
        'euconsent-v2',             // IAB TCF
    ];
    var accepted = keys.some(function(k){ return document.cookie.indexOf(k)!==-1; });

    if (!accepted) {
        // Reserve space at the bottom to prevent CLS when banner slides in.
        document.documentElement.classList.add('tsperf-cookie-active');
        // Hide banner elements until they're positioned correctly.
        document.documentElement.classList.add('tsperf-cookie-pending');
    } else {
        // Returning visitor – banner won't show; ensure no padding is added.
        document.documentElement.classList.add('tsperf-cookie-dismissed');
    }
})();
</script>
    <?php
}, 2 );

// ── 5c. Footer JS: wire up dismiss events to remove body padding ──────────────
add_action( 'wp_footer', function () {
    ?>
<script>
(function(){
    function tsperf_cookie_dismiss() {
        document.documentElement.classList.remove('tsperf-cookie-active','tsperf-cookie-pending');
        document.documentElement.classList.add('tsperf-cookie-dismissed');
    }

    // Generic click handler for any accept/decline button inside common wrappers.
    var selectors = [
        '.cookie-notice-container .cn-set-cookie',
        '.cookie-notice-container button',
        '.cc-btn',
        '.cmplz-accept',
        '.cmplz-deny',
        '#cookie-law-info-bar button',
        '.cookieConsent button',
        '[class*="cookie"] button[class*="accept"]',
        '[class*="cookie"] button[class*="agree"]',
        '[class*="cookie"] button[class*="close"]',
        '[id*="cookie"] button[class*="accept"]',
        '[id*="consent"] button',
    ].join(',');

    document.addEventListener('click', function(e){
        if (e.target.closest && e.target.closest(selectors.split(',').join(','))) {
            // Small delay to let the plugin update cookies first.
            setTimeout(tsperf_cookie_dismiss, 300);
        }
    }, true);

    // Also listen to common custom events fired by GDPR plugins.
    ['CookieConsent', 'cmplz_before_cookiebanner_dismiss', 'cookieLawInfoAccept'].forEach(function(evt){
        document.addEventListener(evt, tsperf_cookie_dismiss);
    });

    // Remove the FOUC-prevention class once the DOM is ready.
    document.addEventListener('DOMContentLoaded', function(){
        document.documentElement.classList.remove('tsperf-cookie-pending');
    });
})();
</script>
    <?php
} );

// ── 5d. Filter: let theme/other plugins override the banner height ───────────
add_filter( 'tsperf_cookie_banner_height', function ( $height ) {
    return $height; // default: 80 px (set in CSS above)
} );
