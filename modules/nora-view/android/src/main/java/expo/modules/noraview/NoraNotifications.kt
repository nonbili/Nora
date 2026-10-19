package expo.modules.noraview

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

// Notifications posted without expo-notifications, which the F-Droid build goes without: it
// brings in Firebase. Tapping one opens its url in Nora, through the same VIEW intent a link
// from another app arrives with.
object NoraNotifications {
  fun areEnabled(context: Context): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled()

  fun post(
    context: Context,
    channelId: String,
    channelName: String,
    highImportance: Boolean,
    id: Int,
    title: String,
    body: String,
    url: String?,
  ): Boolean {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val importance = if (highImportance) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT
      manager.createNotificationChannel(NotificationChannel(channelId, channelName, importance))
    }

    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return false
    if (url != null) {
      intent.action = Intent.ACTION_VIEW
      intent.data = Uri.parse(url)
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    val pendingIntent = PendingIntent.getActivity(context, id, intent, flags)

    val smallIcon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon
    val notification = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(smallIcon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .build()
    manager.notify(id, notification)
    return true
  }
}
