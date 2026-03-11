import { ConfigPlugin } from '@expo/config-plugins'
import { withAppBuildGradle } from '@expo/config-plugins/build/plugins/android-plugins.js'

const googlePlayBuild = !!process.env.GOOGLE_PLAY_BUILD

const withAndroidSigningConfig: ConfigPlugin = (config) => {
  return withAppBuildGradle(config, (config) => {
    // https://www.reddit.com/r/expo/comments/1j4v323/comment/mit9b2a/
    let contents = config.modResults.contents
      .replace(
        'android {',
        `ext.abiCodes = [x86_64:2, 'armeabi-v7a':3, 'arm64-v8a': 4]

android {`,
      )
      .replace('zh-Hans', 'b+zh+Hans')
      .replace('zh-Hant', 'b+zh+Hant')
      .replace(
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
