import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

class LocalDatabase {
  LocalDatabase._();

  static Database? _database;

  static Future<Database> get database async {
    if (_database != null) return _database!;

    final databasePath = await getDatabasesPath();
    final path = join(databasePath, 'supermarket_pos.db');

    _database = await openDatabase(
      path,
      version: 3,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE pending_sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_uuid TEXT NOT NULL UNIQUE,
            sale_data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            sync_status TEXT NOT NULL DEFAULT 'PENDING'
          )
        ''');

        await _createProductsTable(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await _createProductsTable(db);
        }
        if (oldVersion < 3) {
          await db.execute('''
            ALTER TABLE products
            ADD COLUMN sync_batch_id TEXT
          ''');
        }
      },
    );

    return _database!;
  }

  static Future<void> _createProductsTable(DatabaseExecutor db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS products (
        product_id TEXT PRIMARY KEY,
        product_json TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        sync_batch_id TEXT
      )
    ''');
  }
}
