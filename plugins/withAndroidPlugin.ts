import { ConfigPlugin } from '@expo/config-plugins'
import { withAppBuildGradle } from '@expo/config-plugins/build/plugins/android-plugins.js'

const withAndroidSigningConfig: ConfigPlugin = (config) => {
  return withAppBuildGradle(config, (config) => {
    // https://www.reddit.com/r/expo/comments/1j4v323/comment/mit9b2a/
    config.modResults.contents = config.modResults.contents.replace(
      /buildTypes \{([\s\S]*?)release \{([\s\S]*?)signingConfig signingConfigs\.debug/,
      `buildTypes {$1release { `,
    )

    config.modResults.contents = config.modResults.contents.replace(
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
            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
        }
    }`,
    )

    return config
  })
}

export default withAndroidSigningConfig
