import 'package:dio/dio.dart';

import 'package:supermarket_pos/core/network/api_client.dart';
import 'package:supermarket_pos/core/storage/secure_storage.dart';
import 'package:supermarket_pos/features/cart/cart_item.dart';

class SaleService {
  String _formatQuantity(double quantity) {
    return quantity.toStringAsFixed(3).replaceFirst(RegExp(r'\.?0+$'), '');
  }

  Future<Map<String, dynamic>> createSale({
    required String transactionUuid,
    required List<CartItem> items,
    required String paymentMethod,
    required double amountReceived,
    String? mobileMoneyProvider,
    String? paymentReference,
  }) async {
    if (items.isEmpty) {
      throw Exception('Cannot submit an empty sale.');
    }

    final accessToken = await SecureStorage.getAccessToken();
    final terminalId = await SecureStorage.getTerminalId();
    final terminalToken = await SecureStorage.getTerminalToken();

    if (accessToken == null || accessToken.isEmpty) {
      throw Exception('Cashier authentication is required.');
    }

    if (terminalId == null || terminalId.isEmpty) {
      throw Exception('Terminal ID is missing.');
    }

    if (terminalToken == null || terminalToken.isEmpty) {
      throw Exception('Terminal authentication is required.');
    }

    final requestData = <String, dynamic>{
      'transactionUuid': transactionUuid,
      'terminalId': terminalId,
      'deviceCreatedAt': DateTime.now().toUtc().toIso8601String(),
      'items': items.map((item) {
        return {
          'productId': item.product.id,
          'quantity': _formatQuantity(item.quantity),
        };
      }).toList(),
      'paymentMethod': paymentMethod,
    };

    if (paymentMethod == 'CASH') {
      requestData['amountReceived'] = amountReceived.toStringAsFixed(2);
    } else {
      requestData['mobileMoneyProvider'] = mobileMoneyProvider;

      if (paymentReference != null && paymentReference.trim().isNotEmpty) {
        requestData['paymentReference'] = paymentReference.trim();
      }
    }

    try {
      final response = await ApiClient.dio.post(
        '/sales',
        data: requestData,
        options: Options(
          headers: {
            'Authorization': 'Bearer $accessToken',
            'x-terminal-id': terminalId,
            'x-terminal-token': terminalToken,
          },
        ),
      );

      if (response.data is! Map || response.data['sale'] is! Map) {
        throw Exception('Unexpected sale response from server.');
      }

      return Map<String, dynamic>.from(response.data['sale'] as Map);
    } on DioException catch (error) {
      final responseData = error.response?.data;

      if (responseData is Map && responseData['message'] is String) {
        throw Exception(responseData['message'] as String);
      }

      if (error.response == null) {
        throw Exception(
          'Unable to reach the server. Please check your connection.',
        );
      }

      throw Exception('Could not complete the sale.');
    }
  }
}
