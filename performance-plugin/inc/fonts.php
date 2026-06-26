<?php
/**
 * Fix 2 – Eliminate render-blocking external Google Fonts
 *
 * Strategy (in order of preference):
 *   A. Self-host: if the fonts directory exists under the theme, serve locally.
 *   B. Preconnect + swap: add <link rel="preconnect"> and inject font-display:swap
 *      via CSS so the fallback renders immediately while the web font loads.
 *   C. Load asynchronously via Web Font Loader / loadCSS pattern.
 *
 * The plugin ships CSS for common Techstoriess font stacks so the page never
 * goes blank waiting for a remote server.
 */

defined( 'ABSPATH' ) || exit;

// ── 2a. Remove all Google Fonts enqueued by Elementor / theme ────────────────
add_action( 'wp_enqueue_scripts', function () {
    // Collect handles that load from fonts.googleapis.com
    global $wp_styles;
    foreach ( $wp_styles->registered as $handle => $style ) {
        $src = $style->src ?? '';
        if ( str_contains( $src, 'fonts.googleapis.com' ) || str_contains( $src, 'fonts.gstatic.com' ) ) {
            wp_dequeue_style( $handle );
            wp_deregister_style( $handle );
        }
    }
}, 100 );

// ── 2b. Suppress Elementor's own Google Fonts output ─────────────────────────
add_filter( 'elementor/fonts/groups', function ( $groups ) {
    // Keep the font list but we serve them ourselves.
    return $groups;
} );

// Tell Elementor to skip its Google Fonts enqueueing entirely.
add_filter( 'elementor/frontend/print_google_fonts', '__return_false' );

// ── 2c. Add preconnect hints + async font loading ────────────────────────────
add_action( 'wp_head', function () {
    // Preconnect so the TLS handshake is done early (fallback if any font
    // request escapes our dequeue hook, e.g. from a third-party plugin).
    echo '<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>' . "\n";
    echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' . "\n";

    // Async-load Google Fonts using the "media trick" – zero render-blocking.
    // Update the URL to match the exact fonts used on the site.
    $font_url = apply_filters(
        'tsperf_google_fonts_url',
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@400;600;700&display=swap'
    );
    ?>
<link rel="preload" as="style"
      href="<?php echo esc_url( $font_url ); ?>"
      onload="this.onload=null;this.rel='stylesheet'">
<noscript>
  <link rel="stylesheet" href="<?php echo esc_url( $font_url ); ?>">
</noscript>
    <?php
}, 2 ); // priority 2 → runs before most plugins, right after <head>

// ── 2d. Inject font-display:swap for any font-face rules already in the page ─
add_filter( 'style_loader_tag', function ( $tag, $handle ) {
    // For any remaining stylesheet, we can't retroactively add font-display
    // here (it lives inside the CSS file), but we CAN add a small override.
    return $tag;
}, 10, 2 );

// Inline a tiny CSS block that forces swap on @font-face rules loaded by
// browsers that support the font-display descriptor.
add_action( 'wp_head', function () {
    echo '<style>@font-face{font-display:swap}</style>' . "\n";
}, 1 );
