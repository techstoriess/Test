<?php
/**
 * Fix 3 – Render-blocking external CSS & JS
 *
 * • Defers non-critical JavaScript.
 * • Converts non-critical stylesheets to load asynchronously (print→all swap).
 * • Adds resource hints (preload / prefetch / dns-prefetch) for critical assets.
 * • Moves scripts to the footer where possible.
 */

defined( 'ABSPATH' ) || exit;

// ── 3a. Add defer/async to non-critical scripts ───────────────────────────────
add_filter( 'script_loader_tag', function ( $tag, $handle, $src ) {
    // Scripts that MUST be synchronous (jQuery, Elementor core, etc.)
    $sync_handles = apply_filters( 'tsperf_sync_scripts', [
        'jquery',
        'jquery-core',
        'jquery-migrate',
        'elementor-frontend',
        'elementor-pro-frontend',
        'wp-embed',
    ] );

    if ( in_array( $handle, $sync_handles, true ) ) {
        return $tag;
    }

    // Add defer to everything else (defer preserves execution order, async does not).
    if ( ! str_contains( $tag, ' defer' ) && ! str_contains( $tag, ' async' ) ) {
        $tag = str_replace( ' src=', ' defer src=', $tag );
    }

    return $tag;
}, 10, 3 );

// ── 3b. Async-load non-critical stylesheets ───────────────────────────────────
// The "media=print → onload → media=all" trick makes CSS non-render-blocking.
add_filter( 'style_loader_tag', function ( $tag, $handle ) {
    $critical_handles = apply_filters( 'tsperf_critical_styles', [
        'elementor-frontend',  // Elementor base styles (keep sync)
        'elementor-post-',     // Per-post generated CSS
        'tsperf-cookie-cls',   // Our own CLS fix (must be sync)
    ] );

    foreach ( $critical_handles as $critical ) {
        if ( str_starts_with( $handle, $critical ) ) {
            return $tag; // Leave critical CSS synchronous.
        }
    }

    // Known non-critical handles to defer
    $deferred_handles = apply_filters( 'tsperf_deferred_styles', [
        'dashicons',
        'wp-block-library',
        'elementor-icons',
        'elementor-icons-fa-regular',
        'elementor-icons-fa-solid',
        'elementor-icons-fa-brands',
        'elementor-icons-shared',
        'font-awesome',
        'font-awesome-5-all',
    ] );

    if ( ! in_array( $handle, $deferred_handles, true ) ) {
        return $tag; // Only defer explicitly listed handles.
    }

    // Replace rel="stylesheet" with async-load pattern.
    $async_tag = str_replace(
        "rel='stylesheet'",
        "rel='preload' as='style' onload=\"this.onload=null;this.rel='stylesheet'\"",
        $tag
    );
    // noscript fallback
    $async_tag .= '<noscript>' . $tag . '</noscript>';

    return $async_tag;
}, 10, 2 );

// ── 3c. Preload critical above-the-fold CSS ───────────────────────────────────
add_action( 'wp_head', function () {
    // Add dns-prefetch for common third-party origins used by the site.
    $origins = apply_filters( 'tsperf_dns_prefetch_origins', [
        '//cdnjs.cloudflare.com',
        '//ajax.googleapis.com',
        '//www.google-analytics.com',
        '//www.googletagmanager.com',
        '//connect.facebook.net',
    ] );

    foreach ( $origins as $origin ) {
        printf( '<link rel="dns-prefetch" href="%s">' . "\n", esc_url( $origin ) );
    }
}, 1 );

// ── 3d. Move jQuery to footer (Elementor safe variant) ───────────────────────
// Elementor requires jQuery in the head; skip if Elementor is active.
add_action( 'init', function () {
    if ( ! class_exists( '\Elementor\Plugin' ) && ! is_admin() ) {
        wp_scripts()->add_data( 'jquery', 'group', 1 );
        wp_scripts()->add_data( 'jquery-core', 'group', 1 );
        wp_scripts()->add_data( 'jquery-migrate', 'group', 1 );
    }
} );
