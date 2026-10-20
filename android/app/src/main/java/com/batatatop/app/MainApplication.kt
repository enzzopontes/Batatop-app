package com.batatatop.app

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)

    // Garante que o canal 'new-orders' seja criado nativamente no Android
    // com o som 'new_order.mp3' e alta prioridade para tocar mesmo com tela bloqueada
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      try {
        val channelId = "new-orders"
        val channelName = "Novos Pedidos"
        val importance = android.app.NotificationManager.IMPORTANCE_HIGH
        val channel = android.app.NotificationChannel(channelId, channelName, importance).apply {
          description = "Alertas de novos pedidos recebidos"
          enableLights(true)
          lightColor = android.graphics.Color.parseColor("#FFB800")
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 400, 250, 400)
          lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
          setShowBadge(true)

          val soundUri = android.net.Uri.parse("android.resource://" + packageName + "/" + R.raw.new_order)
          val audioAttributes = android.media.AudioAttributes.Builder()
            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
            .build()
          setSound(soundUri, audioAttributes)
        }
        val notificationManager = getSystemService(android.app.NotificationManager::class.java)
        notificationManager?.createNotificationChannel(channel)
      } catch (e: Exception) {
        android.util.Log.w("MainApplication", "Falha ao registrar NotificationChannel nativo", e)
      }
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
