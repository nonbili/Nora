import 'ts-node/register'

import { ExpoConfig } from 'expo/config'
import { version, versionCode } from './package.json'

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
    },
    android: {
      versionCode,
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        monochromeImage: './assets/images/monochrome-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: 'jp.nonbili.nora',
      intentFilters: [
        {
          autoVerify: false,
          action: 'VIEW',
          data: [
            {
              scheme: 'https',
              host: 'bsky.app',
            },
            {
              scheme: 'https',
              host: 'm.facebook.com',
            },
            {
              scheme: 'https',
              host: 'www.facebook.com',
            },
            {
              scheme: 'https',
              host: 'www.instagram.com',
            },
            {
              scheme: 'https',
              host: 'www.reddit.com',
            },
            {
              scheme: 'https',
              host: 'www.threads.com',
            },
            {
              scheme: 'https',
              host: 'www.tiktok.com',
            },
            {
              scheme: 'https',
              host: 'www.tumblr.com',
            },
            {
              scheme: 'https',
              host: 'm.vk.com',
            },
            {
              scheme: 'https',
              host: 'x.com',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
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
      [
        'expo-localization',
        {
          supportedLocales: ['ar', 'en', 'fr', 'pl', 'zh-Hans'],
        },
      ],
      'expo-share-intent',
      'expo-web-browser',
    ],
    experiments: {
      typedRoutes: true,
    },
  }
}
