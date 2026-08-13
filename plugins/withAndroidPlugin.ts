import { ConfigPlugin, withGradleProperties, withMainActivity } from '@expo/config-plugins'
import { withAppBuildGradle } from '@expo/config-plugins/build/plugins/android-plugins.js'

const googlePlayBuild = !!process.env.GOOGLE_PLAY_BUILD

const SECONDARY_MOUSE_CLICK_BRIDGE = `
  private var lastSecondaryMouseClickTime = -1L

  private fun emitSecondaryMouseClick(event: android.view.MotionEvent) {
    val isSecondary = event.actionButton == android.view.MotionEvent.BUTTON_SECONDARY ||
      event.buttonState and android.view.MotionEvent.BUTTON_SECONDARY != 0
    val isClickStart = event.actionMasked == android.view.MotionEvent.ACTION_DOWN ||
      event.actionMasked == android.view.MotionEvent.ACTION_BUTTON_PRESS
    if (!isSecondary || !isClickStart || event.eventTime == lastSecondaryMouseClickTime) return

    lastSecondaryMouseClickTime = event.eventTime
    val density = resources.displayMetrics.density.toDouble()
    val contentLocation = IntArray(2)
    window.decorView.findViewById<android.view.View>(android.R.id.content)?.getLocationInWindow(contentLocation)
    val payload = com.facebook.react.bridge.Arguments.createMap().apply {
      putDouble("x", (event.x.toDouble() - contentLocation[0]) / density)
      putDouble("y", (event.y.toDouble() - contentLocation[1]) / density)
    }
    (application as? com.facebook.react.ReactApplication)?.reactHost?.currentReactContext
      ?.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit("noraSecondaryMouseClick", payload)
  }

  override fun dispatchTouchEvent(event: android.view.MotionEvent): Boolean {
    emitSecondaryMouseClick(event)
    return super.dispatchTouchEvent(event)
  }

  override fun dispatchGenericMotionEvent(event: android.view.MotionEvent): Boolean {
    emitSecondaryMouseClick(event)
    return super.dispatchGenericMotionEvent(event)
  }
`

// React Native seeds DisplayMetricsHolder from the *application* context
// (ReactRootView.init, ReactHostImpl.onConfigurationChanged), which always
// reports the default display. When the activity runs on a secondary display --
// an external monitor in desktop mode -- the density it records is the phone's,
// not the monitor's. PixelUtil derives every dp/sp -> px conversion from those
// metrics, so all text (icon fonts included) rasterises at the wrong scale while
// Fabric lays out at the correct one. Re-point the holder at this activity's
// display once React Native has initialised it.
const DISPLAY_METRICS_FIX = `
  private fun syncDisplayMetricsToCurrentDisplay() {
    val activityMetrics = resources.displayMetrics
    val screenMetrics = android.util.DisplayMetrics()
    screenMetrics.setTo(activityMetrics)
    try {
      @Suppress("DEPRECATION")
      (getSystemService(android.content.Context.WINDOW_SERVICE) as android.view.WindowManager)
        .defaultDisplay
        .getRealMetrics(screenMetrics)
    } catch (e: Exception) {
      // Non-visual context; the copy made above is a good enough fallback.
    }
    // getRealMetrics() reports real pixel bounds but the *default* display's
    // density, so keep its bounds and take the density from this activity.
    screenMetrics.density = activityMetrics.density
    screenMetrics.densityDpi = activityMetrics.densityDpi
    @Suppress("DEPRECATION")
    screenMetrics.scaledDensity = activityMetrics.scaledDensity
    screenMetrics.xdpi = activityMetrics.xdpi
    screenMetrics.ydpi = activityMetrics.ydpi
    com.facebook.react.uimanager.DisplayMetricsHolder.setScreenDisplayMetrics(screenMetrics)
    com.facebook.react.uimanager.DisplayMetricsHolder.setWindowDisplayMetrics(activityMetrics)
  }

  override fun onResume() {
    super.onResume()
    syncDisplayMetricsToCurrentDisplay()
  }

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    syncDisplayMetricsToCurrentDisplay()
    window?.decorView?.requestLayout()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      syncDisplayMetricsToCurrentDisplay()
    }
  }
`

const withSecondaryDisplayMetricsFix: ConfigPlugin = (config) =>
  withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('withSecondaryDisplayMetricsFix expects a Kotlin MainActivity')
    }
    const anchor = 'class MainActivity : ReactActivity() {'
    if (!config.modResults.contents.includes('emitSecondaryMouseClick')) {
      if (!config.modResults.contents.includes(anchor)) {
        throw new Error('withSecondaryDisplayMetricsFix could not find the MainActivity class declaration')
      }
      config.modResults.contents = config.modResults.contents.replace(
        anchor,
        `${anchor}\n${SECONDARY_MOUSE_CLICK_BRIDGE}`,
      )
    }
    if (!config.modResults.contents.includes('syncDisplayMetricsToCurrentDisplay')) {
      if (!config.modResults.contents.includes(anchor)) {
        throw new Error('withSecondaryDisplayMetricsFix could not find the MainActivity class declaration')
      }
      config.modResults.contents = config.modResults.contents.replace(anchor, `${anchor}\n${DISPLAY_METRICS_FIX}`)
    }

    config.modResults.contents = config.modResults.contents.replace(
      'reactNativeHost.reactInstanceManager.currentReactContext',
      '(application as? com.facebook.react.ReactApplication)?.reactHost?.currentReactContext',
    )
    if (
      config.modResults.contents.includes('emitSecondaryMouseClick') &&
      !config.modResults.contents.includes('contentLocation = IntArray(2)')
    ) {
      config.modResults.contents = config.modResults.contents
        .replace(
          '    val density = resources.displayMetrics.density.toDouble()\n    val payload =',
          `    val density = resources.displayMetrics.density.toDouble()
    val contentLocation = IntArray(2)
    window.decorView.findViewById<android.view.View>(android.R.id.content)?.getLocationInWindow(contentLocation)
    val payload =`,
        )
        .replace(
          /\s*putDouble\("x", event\.x\.toDouble\(\) \/ density\)[\s\S]*?putInt\("action", event\.actionMasked\)/,
          `
      putDouble("x", (event.x.toDouble() - contentLocation[0]) / density)
      putDouble("y", (event.y.toDouble() - contentLocation[1]) / density)`,
        )
    }

    config.modResults.contents = config.modResults.contents.replace(
      /\n\s*com\.facebook\.react\.config\.ReactFeatureFlags\.dispatchPointerEvents = true/,
      '',
    )
    return config
  })

const withAndroidSigningConfig: ConfigPlugin = (config) => {
  config = withSecondaryDisplayMetricsFix(config)

  config = withGradleProperties(config, (config) => {
    const existingIndex = config.modResults.findIndex(
      (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs',
    )
    if (existingIndex !== -1) {
      config.modResults[existingIndex].value = '-Xmx4096m -XX:MaxMetaspaceSize=1024m'
    } else {
      config.modResults.push({
        type: 'property',
        key: 'org.gradle.jvmargs',
        value: '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
      })
    }
    return config
  })

  return withAppBuildGradle(config, (config) => {
    // https://www.reddit.com/r/expo/comments/1j4v323/comment/mit9b2a/
    let contents = config.modResults.contents

    if (!contents.includes('ext.abiCodes =')) {
      contents = contents.replace(
        'android {',
        `ext.abiCodes = ['armeabi-v7a':3, 'arm64-v8a': 4]

android {
    flavorDimensions "distribution"
    productFlavors {
        full {
            dimension "distribution"
        }
        foss {
            dimension "distribution"
        }
    }`,
      )
    }

    contents = contents
      .replaceAll('pt-BR', 'b+pt+BR')
      .replaceAll('zh-Hans', 'b+zh+Hans')
      .replaceAll('zh-Hant', 'b+zh+Hant')
      // expo-localization looks for its unmodified locale line on every
      // prebuild, while the replacements above necessarily change it.
      .replace(/^(\s*resourceConfigurations \+= \[[^\n]*\])(?:\n\1)+/gm, '$1')

    if (!contents.includes('dependenciesInfo {')) {
      contents = contents.replace(
        /androidResources \{([\s\S]*?)}/,
        `androidResources {$1}
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }
    splits {
        abi {
            reset()
            enable true
            universalApk false
            include project.ext.abiCodes.keySet() as String[]
        }
    }
    android.applicationVariants.configureEach { variant ->
        variant.outputs.each { output ->
            def baseAbiVersionCode = project.ext.abiCodes.get(output.getFilter(com.android.build.OutputFile.ABI))
            if (baseAbiVersionCode != null) {
                output.versionCodeOverride = (100 * project.android.defaultConfig.versionCode) + baseAbiVersionCode
            }
        }
    }`,
      )
    }

    if (googlePlayBuild) {
      contents = contents
        .replace(
          /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\n\s*}\s*)/,
          `$1
        release {
            storeFile file(NB_UPLOAD_STORE_FILE)
            storePassword NB_UPLOAD_STORE_PASSWORD
            keyAlias NB_UPLOAD_KEY_ALIAS
            keyPassword NB_UPLOAD_KEY_PASSWORD
        }
`,
        )
        .replace(
          /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
          '$1signingConfig signingConfigs.release',
        )
    } else {
      contents = contents.replace(
        /buildTypes \{([\s\S]*?)release \{([\s\S]*?)signingConfig signingConfigs\.debug/,
        `buildTypes {$1release {`,
      )
    }

    config.modResults.contents = contents

    return config
  })
}

export default withAndroidSigningConfig
