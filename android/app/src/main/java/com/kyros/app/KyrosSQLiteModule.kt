package com.kyros.app

import android.database.Cursor
import android.database.DatabaseErrorHandler
import android.database.sqlite.SQLiteCursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteProgram
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.util.concurrent.Executors

class KyrosSQLiteModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  // Android tracks transactions per thread, including across calls from JavaScript.
  private val executor = Executors.newSingleThreadExecutor()
  private var database: SQLiteDatabase? = null

  override fun getName() = "KyrosSQLite"

  @ReactMethod
  fun openDatabase(name: String, promise: Promise) = enqueue(promise) {
    if (name != "kyros.sqlite") throw IllegalArgumentException("Unsupported database name")
    val directory = File(reactApplicationContext.filesDir, "SQLite")
    if (!directory.exists() && !directory.mkdirs()) {
      throw IllegalStateException("Could not create database directory")
    }
    val file = File(directory, name)
    if (database == null || !database!!.isOpen) {
      database = SQLiteDatabase.openDatabase(
        file.path,
        null,
        SQLiteDatabase.CREATE_IF_NECESSARY,
        DatabaseErrorHandler { corrupted -> corrupted.close() }
      )
    }
    null
  }

  @ReactMethod
  fun execAsync(source: String, promise: Promise) = enqueue(promise) {
    sqlite().execSQL(source)
    null
  }

  @ReactMethod
  fun runAsync(source: String, params: ReadableArray, promise: Promise) = enqueue(promise) {
    val statement = sqlite().compileStatement(source)
    try {
      bind(statement, params)
      val rowId = statement.executeInsert()
      val result = Arguments.createMap()
      result.putDouble("lastInsertRowId", if (rowId < 0) 0.0 else rowId.toDouble())
      result.putDouble("changes", if (rowId < 0) 0.0 else 1.0)
      result
    } finally {
      statement.close()
    }
  }

  @ReactMethod
  fun getAllAsync(source: String, params: ReadableArray, promise: Promise) = enqueue(promise) {
    val cursor = query(source, params)
    try {
      Arguments.createArray().apply {
        while (cursor.moveToNext()) pushMap(cursor.toWritableMap())
      }
    } finally {
      cursor.close()
    }
  }

  @ReactMethod
  fun getFirstAsync(source: String, params: ReadableArray, promise: Promise) = enqueue(promise) {
    query(source, params).use { cursor ->
      if (cursor.moveToFirst()) cursor.toWritableMap() else null
    }
  }

  private fun query(source: String, params: ReadableArray): Cursor =
    sqlite().rawQueryWithFactory(
      { _, driver, editTable, query ->
        for (index in 0 until params.size()) bind(query, index + 1, params, index)
        SQLiteCursor(driver, editTable, query)
      },
      source,
      emptyArray(),
      null
    )

  private fun bind(statement: SQLiteProgram, params: ReadableArray) {
    for (index in 0 until params.size()) bind(statement, index + 1, params, index)
  }

  private fun bind(statement: SQLiteProgram, sqlIndex: Int, params: ReadableArray, index: Int) {
    when (params.getType(index)) {
      ReadableType.Null -> statement.bindNull(sqlIndex)
      ReadableType.Boolean -> statement.bindLong(sqlIndex, if (params.getBoolean(index)) 1L else 0L)
      ReadableType.Number -> {
        val value = params.getDouble(index)
        if (value.isFinite() && value % 1.0 == 0.0 && kotlin.math.abs(value) <= 9_007_199_254_740_991.0) {
          statement.bindLong(sqlIndex, value.toLong())
        } else {
          statement.bindDouble(sqlIndex, value)
        }
      }
      ReadableType.String -> statement.bindString(sqlIndex, params.getString(index)!!)
      else -> throw IllegalArgumentException("Unsupported SQLite parameter type")
    }
  }

  private fun Cursor.toWritableMap(): WritableMap = Arguments.createMap().apply {
    for (column in 0 until columnCount) {
      val name = getColumnName(column)
      when (getType(column)) {
        Cursor.FIELD_TYPE_NULL -> putNull(name)
        Cursor.FIELD_TYPE_INTEGER -> putDouble(name, getLong(column).toDouble())
        Cursor.FIELD_TYPE_FLOAT -> putDouble(name, getDouble(column))
        Cursor.FIELD_TYPE_STRING -> putString(name, getString(column))
        Cursor.FIELD_TYPE_BLOB -> throw IllegalArgumentException("SQLite BLOB values are unsupported")
      }
    }
  }

  private fun sqlite() = database?.takeIf { it.isOpen }
    ?: throw IllegalStateException("SQLite database is not open")

  private fun enqueue(promise: Promise, operation: () -> Any?) {
    executor.execute {
      try {
        promise.resolve(operation())
      } catch (error: Throwable) {
        promise.reject("E_SQLITE", error.message, error)
      }
    }
  }

  override fun invalidate() {
    executor.execute {
      database?.let { db ->
        try {
          if (db.inTransaction()) db.endTransaction()
        } finally {
          db.close()
          database = null
        }
      }
    }
    executor.shutdown()
    super.invalidate()
  }
}
