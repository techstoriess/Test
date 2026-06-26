<?php
/**
 * Plugin Name: Techstoriess Performance Fixes
 * Description: Fixes Elementor CSS bloat, render-blocking fonts/CSS, hero LCP, and cookie banner CLS.
 * Version: 1.0.0
 * Author: Techstoriess
 */

defined( 'ABSPATH' ) || exit;

define( 'TSPERF_DIR', plugin_dir_path( __FILE__ ) );
define( 'TSPERF_URL', plugin_dir_url( __FILE__ ) );

require_once TSPERF_DIR . 'inc/elementor-css.php';
require_once TSPERF_DIR . 'inc/fonts.php';
require_once TSPERF_DIR . 'inc/render-blocking.php';
require_once TSPERF_DIR . 'inc/lcp-hero.php';
require_once TSPERF_DIR . 'inc/cookie-cls.php';
