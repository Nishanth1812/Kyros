package com.kyros.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class KyrosFileModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pendingCreatePromise: Promise? = null
  private var pendingCreateContent: String? = null
  private var pendingOpenPromise: Promise? = null

  companion object {
    private const val REQUEST_CREATE_DOCUMENT = 9001
    private const val REQUEST_OPEN_DOCUMENT = 9002
  }

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName() = "KyrosFile"

  @ReactMethod
  fun createDocument(suggestedName: String, mimeType: String, content: String, promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("E_ACTIVITY_UNAVAILABLE", "Activity is not available")
      return
    }

    if (pendingCreatePromise != null) {
      promise.reject("E_CONCURRENT_REQUEST", "Another document creation is already in progress")
      return
    }

    pendingCreatePromise = promise
    pendingCreateContent = content

    try {
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = mimeType
        putExtra(Intent.EXTRA_TITLE, suggestedName)
      }
      reactApplicationContext.startActivityForResult(intent, REQUEST_CREATE_DOCUMENT, Bundle())
    } catch (e: Exception) {
      pendingCreatePromise = null
      pendingCreateContent = null
      promise.reject("E_CREATE_DOCUMENT_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun openDocument(mimeType: String, promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("E_ACTIVITY_UNAVAILABLE", "Activity is not available")
      return
    }

    if (pendingOpenPromise != null) {
      promise.reject("E_CONCURRENT_REQUEST", "Another document selection is already in progress")
      return
    }

    pendingOpenPromise = promise

    try {
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = mimeType
      }
      reactApplicationContext.startActivityForResult(intent, REQUEST_OPEN_DOCUMENT, Bundle())
    } catch (e: Exception) {
      pendingOpenPromise = null
      promise.reject("E_OPEN_DOCUMENT_FAILED", e.message, e)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    when (requestCode) {
      REQUEST_CREATE_DOCUMENT -> {
        val promise = pendingCreatePromise
        val content = pendingCreateContent
        pendingCreatePromise = null
        pendingCreateContent = null

        if (promise == null) return

        if (resultCode == Activity.RESULT_OK && data?.data != null) {
          val uri = data.data!!
          try {
            reactApplicationContext.contentResolver.openOutputStream(uri)?.use { output ->
              output.write((content ?: "").toByteArray(Charsets.UTF_8))
              output.flush()
            }
            promise.resolve(true)
          } catch (e: Exception) {
            promise.reject("E_WRITE_FAILED", e.message, e)
          }
        } else {
          promise.resolve(false)
        }
      }

      REQUEST_OPEN_DOCUMENT -> {
        val promise = pendingOpenPromise
        pendingOpenPromise = null

        if (promise == null) return

        if (resultCode == Activity.RESULT_OK && data?.data != null) {
          val uri = data.data!!
          try {
            val text = reactApplicationContext.contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use {
              it.readText()
            }
            promise.resolve(text)
          } catch (e: Exception) {
            promise.reject("E_READ_FAILED", e.message, e)
          }
        } else {
          promise.resolve(null)
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {}
}
