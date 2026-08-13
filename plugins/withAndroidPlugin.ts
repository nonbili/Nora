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
    val visibleWindowFrame = android.graphics.Rect()
    window.decorView.getWindowVisibleDisplayFrame(visibleWindowFrame)
    val payload = com.facebook.react.bridge.Arguments.createMap().apply {
      // Fabric measureInWindow coordinates are relative to this same visible
      // frame, including in edge-to-edge, split-screen and freeform windows.
      putDouble("x", (event.x.toDouble() - visibleWindowFrame.left) / density)
      putDouble("y", (event.y.toDouble() - visibleWindowFrame.top) / density)
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
    const secondaryMouseBridgePattern =
      /\n[ \t]*private var lastSecondaryMouseClickTime[\s\S]*?override fun dispatchGenericMotionEvent\(event: android\.view\.MotionEvent\): Boolean \{[\s\S]*?return super\.dispatchGenericMotionEvent\(event\)\n[ \t]*}\n(?:[ \t]*\n)*/
    if (config.modResults.contents.includes('emitSecondaryMouseClick')) {
      if (!secondaryMouseBridgePattern.test(config.modResults.contents)) {
        throw new Error('withSecondaryDisplayMetricsFix could not replace the existing secondary mouse bridge')
      }
      config.modResults.contents = config.modResults.contents.replace(
        secondaryMouseBridgePattern,
        `${SECONDARY_MOUSE_CLICK_BRIDGE}\n`,
      )
    } else {
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

    // This was an abandoned pointer-event experiment. Leaving it behind changes
    // event dispatch globally and conflicts with the scoped mouse bridge above.
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
    const existingItem = existingIndex === -1 ? undefined : config.modResults[existingIndex]
    if (existingItem?.type === 'property') {
      existingItem.value = '-Xmx4096m -XX:MaxMetaspaceSize=1024m'
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

    const resourceConfigurationLines = new Set<string>()
    contents = contents.replace(/^\s*resourceConfigurations \+= \[[^\n]*\]$/gm, (line) => {
      const normalized = line.trim()
      if (resourceConfigurationLines.has(normalized)) return ''
      resourceConfigurationLines.add(normalized)
      return line
    })

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
