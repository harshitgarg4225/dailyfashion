import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell configuration.
 *
 * The native builds are not a distribution convenience — they remove the two
 * real limitations the web version could not solve:
 *
 *  1. **The reminder actually fires.** On the web the nudge is a timer inside a
 *     page, so it only works if the app was opened that day and the tab is
 *     still resident. `LocalNotifications` schedules with the operating system,
 *     which means the evening question arrives whether or not the app has been
 *     touched — and on Android it arrives with inline actions, so a rating is
 *     genuinely two taps from the lock screen as J2 always intended.
 *
 *  2. **Storage stops being evictable.** A packaged app's WebView storage is
 *     not subject to the browser's cache-pressure eviction, so a year of
 *     history can no longer vanish because the OS wanted space back. That was
 *     the single largest risk to a local-only product.
 *
 * Everything else stays exactly as it is. No cloud, no account, no analytics.
 * The privacy promise is unchanged by packaging — if anything it is stronger,
 * because the app store listing has to declare data collection and this one
 * declares none.
 */
const config: CapacitorConfig = {
  appId: 'com.dailyfashion.app',
  appName: 'Daily Fashion',
  webDir: 'dist',

  // No `server.url`. The bundle is shipped inside the app and loaded from
  // disk, so the packaged build makes no network request to start either.
  android: {
    // Matches the app's paper, so the WebView never flashes a different shade.
    backgroundColor: '#FFFFFF',
  },
  ios: {
    backgroundColor: '#FFFFFF',
    // The camera and journal both want the full screen.
    contentInset: 'never',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#FFFFFF',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      splashFullScreen: true,
      splashImmersive: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_notification',
      iconColor: '#111111',
    },
  },
}

export default config
