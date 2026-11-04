import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:sqflite/sqflite.dart';
import 'package:supermarket_pos/core/database/local_database.dart';
import 'package:supermarket_pos/core/network/api_client.dart';
import 'package:supermarket_pos/core/storage/secure_storage.dart';
import 'package:supermarket_pos/features/products/product_model.dart';

class ProductSyncService {
  Future<int> syncProducts() async {
    final token = await SecureStorage.getAccessToken();

    if (token == null || token.isEmpty) {
      throw Exception('Cashier is not authenticated. Please log in.');
    }

    final db = await LocalDatabase.database;

    const limit = 100;
    var page = 1;
    var totalPages = 1;
    var syncedCount = 0;

    final syncBatchId = DateTime.now()
        .toUtc()
        .microsecondsSinceEpoch
        .toString();

    do {
      final response = await ApiClient.dio.get(
        '/products',
        queryParameters: {'page': page, 'limit': limit, 'isActive': 'true'},
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.data is! Map) {
        throw Exception('Invalid product response from server.');
      }

      final responseData = Map<String, dynamic>.from(response.data as Map);

      final rawProducts = responseData['data'];
      final pagination = responseData['pagination'];

      if (rawProducts is! List || pagination is! Map) {
        throw Exception('Unexpected product response structure.');
      }

      final paginationData = Map<String, dynamic>.from(pagination);

      final parsedTotalPages = paginationData['totalPages'];

      if (parsedTotalPages is! num ||
          parsedTotalPages < 0 ||
          parsedTotalPages % 1 != 0) {
        throw Exception('Invalid pagination information.');
      }

      totalPages = parsedTotalPages.toInt();

      final batch = db.batch();

      for (final item in rawProducts) {
        if (item is! Map) {
          throw Exception('Invalid product record received.');
        }

        final product = Map<String, dynamic>.from(item);
        final productId = product['id'];

        if (productId is! String || productId.isEmpty) {
          throw Exception('A product was received without a valid ID.');
        }

        batch.insert('products', {
          'product_id': productId,
          'product_json': jsonEncode(product),
          'cached_at': DateTime.now().toUtc().toIso8601String(),
          'sync_batch_id': syncBatchId,
        }, conflictAlgorithm: ConflictAlgorithm.replace);
      }

      await batch.commit(noResult: true);

      syncedCount += rawProducts.length;
      page++;
    } while (page <= totalPages);

    // Reconcile only after every page has been downloaded successfully.
    await db.delete(
      'products',
      where: 'sync_batch_id != ? OR sync_batch_id IS NULL',
      whereArgs: [syncBatchId],
    );

    return syncedCount;
  }

  Future<List<Map<String, dynamic>>> getCachedProducts() async {
    final db = await LocalDatabase.database;

    final rows = await db.query('products', orderBy: 'product_id ASC');

    return rows.map((row) {
      return Map<String, dynamic>.from(
        jsonDecode(row['product_json'] as String) as Map,
      );
    }).toList();
  }

  /// Finds an active product by barcode in the local SQLite cache.
  /// This works offline because it does not make an API request.
  Future<ProductModel?> findByBarcode(String barcode) async {
    final normalizedBarcode = barcode.trim();

    if (normalizedBarcode.isEmpty) {
      return null;
    }

    final products = await getCachedProducts();

    for (final json in products) {
      final cachedBarcode = json['barcode']?.toString().trim();

      if (cachedBarcode == normalizedBarcode &&
          (json['isActive'] as bool? ?? false)) {
        return ProductModel.fromJson(json);
      }
    }

    return null;
  }

  Future<ProductModel?> findByPluCode(String pluCode) async {
    final normalizedPlu = pluCode.trim();

    if (normalizedPlu.isEmpty) {
      return null;
    }

    final products = await getCachedProducts();

    for (final json in products) {
      final cachedPlu = json['pluCode']?.toString().trim();

      if (cachedPlu == normalizedPlu && (json['isActive'] as bool? ?? false)) {
        return ProductModel.fromJson(json);
      }
    }

    return null;
  }
}
