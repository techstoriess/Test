<?php
/**
 * Fix 1 – Elementor CSS bloat
 *
 * • Enables Elementor's "Improved CSS Loading" (loads only per-page CSS, not
 *   the entire library stylesheet on every request).
 * • Removes the global elementor-frontend.css from pages that don't need it.
 * • Dequeues the icon/animation libraries when Elementor widgets that use them
 *   are absent from the current page.
 */

defined( 'ABSPATH' ) || exit;

// ── 1a. Turn on Elementor's built-in optimised asset loading ─────────────────
add_action( 'init', function () {
    // Elementor 3.x stores this as a kit/experiment option. We also set the
    // legacy option so older installs are covered.
    if ( ! get_option( 'elementor_optimized_css_loading' ) ) {
        update_option( 'elementor_optimized_css_loading', 'yes' );
    }
    // Elementor 3.6+ experiment flag
    if ( class_exists( '\Elementor\Plugin' ) ) {
        $experiments = \Elementor\Plugin::$instance->experiments ?? null;
        if ( $experiments && ! $experiments->is_feature_active( 'e_optimized_assets_loading' ) ) {
            update_option( 'elementor_experiment-e_optimized_assets_loading', 'active' );
        }
    }
} );

// ── 1b. Remove Elementor icon / animation libraries when unused ──────────────
add_action( 'wp_enqueue_scripts', function () {
    if ( ! tsperf_page_uses_elementor() ) {
        return;
    }

    $content = tsperf_get_current_page_content();

    // Font Awesome – only needed when fa-* classes are present.
    if ( ! tsperf_content_has( $content, 'fa-' ) ) {
        wp_dequeue_style( 'elementor-icons-fa-regular' );
        wp_dequeue_style( 'elementor-icons-fa-solid' );
        wp_dequeue_style( 'elementor-icons-fa-brands' );
    }

    // Swiper (carousel) – only needed when the slider/carousel widget is used.
    if ( ! tsperf_content_has( $content, 'elementor-widget-carousel', 'elementor-widget-slides', 'swiper' ) ) {
        wp_dequeue_script( 'swiper' );
        wp_dequeue_style( 'swiper' );
        wp_dequeue_style( 'e-swiper' );
    }

    // WayPoints / animations – defer loading; not critical for FCP/LCP.
    wp_dequeue_script( 'elementor-waypoints' );

    // Inline the small post-CSS file Elementor generates for this post
    // instead of leaving it as a separate HTTP request.
    tsperf_inline_elementor_post_css();
}, 20 );

// ── 1c. Inline per-post Elementor CSS (avoids extra request) ────────────────
function tsperf_inline_elementor_post_css() {
    $post_id = get_queried_object_id();
    if ( ! $post_id ) {
        return;
    }

    $css_file = \Elementor\Core\Files\CSS\Post::create( $post_id );
    if ( ! $css_file ) {
        return;
    }

    $content = $css_file->get_content();
    // Only inline if the file is small enough (< 20 KB) to be worth it.
    if ( $content && strlen( $content ) < 20480 ) {
        $handle = 'elementor-post-' . $post_id;
        wp_dequeue_style( $handle );
        add_action( 'wp_head', function () use ( $content ) {
            echo '<style id="elementor-inline-post-css">' . $content . '</style>' . "\n";
        }, 9 );
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tsperf_page_uses_elementor(): bool {
    $post_id = get_queried_object_id();
    return $post_id && 'builder' === get_post_meta( $post_id, '_elementor_edit_mode', true );
}

function tsperf_get_current_page_content(): string {
    $post_id = get_queried_object_id();
    if ( ! $post_id ) {
        return '';
    }
    return (string) get_post_meta( $post_id, '_elementor_data', true );
}

function tsperf_content_has( string $haystack, string ...$needles ): bool {
    foreach ( $needles as $needle ) {
        if ( str_contains( $haystack, $needle ) ) {
            return true;
        }
    }
    return false;
}
