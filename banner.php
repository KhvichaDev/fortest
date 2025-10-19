<?php
/**
 * Plugin Name:       Simple Blue Banner
 * Description:       Displays a simple blue banner with "see more" text at the bottom of the page.
 * Version:           1.0.0
 * Author:            Your Name
 * License:           GPL-2.0+
 * License URI:       http://www.gnu.org/licenses/gpl-2.0.txt
 * Text Domain:       simple-blue-banner
 */

// If this file is called directly, abort.
if ( ! defined( 'WPINC' ) ) {
	die;
}

/**
 * Adds the banner's CSS styles to the website's head section.
 */
function sbb_enqueue_banner_styles() {
	?>
	<style type="text/css">
		.sbb-simple-banner {
			position: fixed;
			bottom: 0;
			left: 0;
			width: 100%;
			padding: 16px 0;
			background-color: #0073e6; /* Bright Blue */
			color: #ffffff; /* White Text */
			text-align: center;
			z-index: 10000;
			box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
			font-size: 16px;
		}

		.sbb-simple-banner a {
			color: #ffffff;
			font-weight: bold;
			text-decoration: underline;
		}
	</style>
	<?php
}
add_action( 'wp_head', 'sbb_enqueue_banner_styles' );

/**
 * Adds the banner's HTML content to the website's footer.
 */
function sbb_render_banner_html() {
	// You can change the '#' to any URL you want.
	$see_more_url = '#'; 
	?>
	<div class="sbb-simple-banner">
		<a href="<?php echo esc_url( $see_more_url ); ?>">see more</a>
	</div>
	<?php
}
add_action( 'wp_footer', 'sbb_render_banner_html' );
