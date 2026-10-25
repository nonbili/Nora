// The background tasks are defined here, ahead of the app: a run the system starts in the
// background loads this file but not the routes, which are only read when the app is shown.
import '@/lib/i18n'
import '@/lib/mention-notifications'
import '@/lib/watch-feed'
import 'expo-router/entry'
