import 'ts-node/register'

import { ExpoConfig } from 'expo/config'
import { version, versionCode, buildNumber } from './package.json'

const intentFilters = [
  {
    autoVerify: false,
    action: 'VIEW',
    data: [
      'bsky.app',
      'm.facebook.com',
      'www.facebook.com',
      'www.linkedin.com',
      'www.instagram.com',
      'www.reddit.com',
      'www.threads.com',
      'www.tiktok.com',
      'www.tumblr.com',
      'm.vk.com',
      'x.com',
    ].map((host) => ({ scheme: 'https', host })),
    category: ['BROWSABLE', 'DEFAULT'],
  },
]

module.exports = ({ config }: { config: ExpoConfig }) => {
  return {
    name: 'Nora',
    slug: 'nora',
    version,
    icon: './assets/images/icon.png',
    scheme: 'nora',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'jp.nonbili.nora',
      buildNumber,
      infoPlist: {
        NSMicrophoneUsageDescription: 'Allow $(PRODUCT_NAME) to use the microphone.',
        NSPhotoLibraryAddUsageDescription: 'Allow $(PRODUCT_NAME) to save photos to your library.',
        NSPhotoLibraryUsageDescription: 'Allow $(PRODUCT_NAME) to access your photo library.',
      },
    },
    android: {
      versionCode,
      permissions: ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'POST_NOTIFICATIONS'],
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        monochromeImage: './assets/images/monochrome-icon.png',
        backgroundColor: '#ffffff',
      },
      predictiveBackGestureEnabled: false,
      package: 'jp.nonbili.nora',
      intentFilters,
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: true,
          },
          ios: {
            deploymentTarget: '17.0',
          },
        },
      ],
      './plugins/withAndroidPlugin.ts',
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#f9fafb',
          dark: {
            image: './assets/images/splash-icon.png',
            backgroundColor: '#27272a',
          },
        },
      ],
      'expo-asset',
      'expo-font',
      'expo-image',
      [
        'expo-localization',
        {
          supportedLocales: [
            'ar',
            'el',
            'en',
            'es',
            'fr',
            'it',
            'ko',
            'lv',
            'pl',
            'pt-BR',
            'sv',
            'tr',
            'zh-Hans',
            'zh-Hant',
          ],
        },
      ],
      ['expo-share-intent', { iosAppGroupIdentifier: 'group.g.jp.nonbili.nora' }],
      'expo-web-browser',
      'expo-notifications',
      'expo-background-task',
    ],
    experiments: {
      typedRoutes: true,
    },
  }
}
