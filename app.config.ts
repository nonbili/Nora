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
      predictiveBackGestureEnabled: true,
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
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
      'expo-asset',
      'expo-font',
      'expo-share-intent',
      'expo-web-browser',
      './plugins/withAndroidPlugin.ts',
    ],
    experiments: {
      typedRoutes: true,
    },
  }
}
