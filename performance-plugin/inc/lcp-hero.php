<?php
/**
 * Fix 4 – Hero image LCP risk (lazy-loaded above-the-fold image)
 *
 * WordPress 5.5+ adds loading="lazy" to ALL images by default, including the
 * hero. The browser won't start fetching a lazy image until it's in the
 * viewport, which delays LCP significantly.
 *
 * Fixes applied:
 *   A. Remove lazy from the first image Elementor renders in the hero widget.
 *   B. Add fetchpriority="high" so the browser treats it as a high-priority fetch.
 *   C. Add a <link rel="preload"> in <head> for the hero image so it starts
 *      loading before the HTML parser reaches the <img> tag.
 *   D. Emit correct srcset-based preload using imagesrcset / imagesizes.
 */

defined( 'ABSPATH' ) || exit;

// ── 4a. Output a <link rel="preload"> for the hero image ─────────────────────
add_action( 'wp_head', function () {
    $hero = tsperf_get_hero_image();
    if ( ! $hero ) {
        return;
    }

    $src     = esc_url( $hero['src'] );
    $srcset  = ! empty( $hero['srcset'] ) ? esc_attr( $hero['srcset'] ) : '';
    $sizes   = ! empty( $hero['sizes'] ) ? esc_attr( $hero['sizes'] ) : '100vw';
    $type    = ! empty( $hero['mime'] ) ? ' type="' . esc_attr( $hero['mime'] ) . '"' : '';

    if ( $srcset ) {
        printf(
            '<link rel="preload" as="image" href="%s" imagesrcset="%s" imagesizes="%s"%s fetchpriority="high">' . "\n",
            $src, $srcset, $sizes, $type
        );
    } else {
        printf(
            '<link rel="preload" as="image" href="%s"%s fetchpriority="high">' . "\n",
            $src, $type
        );
    }
}, 1 ); // Priority 1 = as early as possible in <head>

// ── 4b. Strip lazy-loading & inject fetchpriority on the hero <img> ──────────
add_filter( 'the_content', 'tsperf_fix_hero_img_attrs', 5 );
add_filter( 'elementor/widget/render_content', 'tsperf_fix_hero_img_attrs', 5 );

function tsperf_fix_hero_img_attrs( string $content ): string {
    static $done = false;
    if ( $done ) {
        return $content;
    }

    // Match the first <img> tag in the content.
    if ( ! preg_match( '/<img\s[^>]+>/i', $content, $match, PREG_OFFSET_CAPTURE ) ) {
        return $content;
    }

    $original = $match[0][0];
    $offset   = $match[0][1];

    // Remove loading="lazy" / loading='lazy'
    $fixed = preg_replace( '/\s+loading=["\']lazy["\']/i', '', $original );

    // Remove any existing fetchpriority before we add our own.
    $fixed = preg_replace( '/\s+fetchpriority=["\'][^"\']*["\']/i', '', $fixed );

    // Add loading="eager" and fetchpriority="high" before the closing >.
    $fixed = preg_replace( '/>$/', ' loading="eager" fetchpriority="high">', $fixed );

    $content = substr_replace( $content, $fixed, $offset, strlen( $original ) );

    $done = true;
    return $content;
}

// ── 4c. Also disable lazy on wp_get_attachment_image for hero slot ───────────
add_filter( 'wp_lazy_loading_enabled', function ( $default, $tag_name, $context ) {
    // Never lazy-load in the hero Elementor section (context passed by our hook).
    if ( 'tsperf_hero' === $context ) {
        return false;
    }
    return $default;
}, 10, 3 );

// ── 4d. Resolve hero image data from post meta ────────────────────────────────
function tsperf_get_hero_image(): array {
    $post_id = get_queried_object_id();
    if ( ! $post_id ) {
        return [];
    }

    // Try Elementor background image first (most common hero pattern).
    $elementor_data = get_post_meta( $post_id, '_elementor_data', true );
    if ( $elementor_data ) {
        $data = json_decode( $elementor_data, true );
        if ( $data ) {
            $image_id = tsperf_find_first_background_image( $data );
            if ( $image_id ) {
                return tsperf_image_data( $image_id );
            }
        }
    }

    // Fallback: featured image.
    $thumb_id = get_post_thumbnail_id( $post_id );
    if ( $thumb_id ) {
        return tsperf_image_data( $thumb_id );
    }

    // Fallback: custom field 'hero_image_id'.
    $hero_id = (int) get_post_meta( $post_id, 'hero_image_id', true );
    if ( $hero_id ) {
        return tsperf_image_data( $hero_id );
    }

    return [];
}

function tsperf_find_first_background_image( array $elements ): int {
    foreach ( $elements as $element ) {
        // Check background image set in section/column style settings.
        $bg_id = $element['settings']['background_image']['id'] ?? 0;
        if ( $bg_id ) {
            return (int) $bg_id;
        }
        // Check image widget.
        $img_id = $element['settings']['image']['id'] ?? 0;
        if ( $img_id ) {
            return (int) $img_id;
        }
        // Recurse into children.
        if ( ! empty( $element['elements'] ) ) {
            $found = tsperf_find_first_background_image( $element['elements'] );
            if ( $found ) {
                return $found;
            }
        }
    }
    return 0;
}

function tsperf_image_data( int $image_id ): array {
    $full = wp_get_attachment_image_src( $image_id, 'full' );
    if ( ! $full ) {
        return [];
    }

    $srcset = wp_get_attachment_image_srcset( $image_id, 'full' );
    $sizes  = wp_get_attachment_image_sizes( $image_id, 'full' );
    $mime   = get_post_mime_type( $image_id );

    return [
        'src'    => $full[0],
        'srcset' => $srcset ?: '',
        'sizes'  => $sizes  ?: '100vw',
        'mime'   => $mime   ?: '',
    ];
}
