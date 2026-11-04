
import 'package:supermarket_pos/core/network/api_client.dart';

class PairingService {
  Future<Map<String, dynamic>> pair({
    required String terminalCode,
    required String pairingCode,
  }) async {
    final response = await ApiClient.dio.post(
      '/terminals/pair',
      data: {
        'terminalCode': terminalCode.trim(),
        'pairingCode': pairingCode.trim(),
      },
    );

    if (response.data is! Map) {
      throw Exception('Unexpected response from the server.');
    }

    return Map<String, dynamic>.from(response.data as Map);
  }
}
