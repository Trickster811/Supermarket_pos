
import 'package:dio/dio.dart';
import 'package:supermarket_pos/core/network/api_client.dart';
import 'package:supermarket_pos/core/storage/secure_storage.dart';

class AuthService {
  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
  }) async {
    final response = await ApiClient.dio.post(
      '/auth/login',
      data: {
        'username': username.trim(),
        'password': password,
      },
    );

    if (response.data is! Map) {
      throw Exception('Unexpected login response.');
    }

    final data = Map<String, dynamic>.from(response.data as Map);
    final accessToken = data['accessToken'];

    if (accessToken is! String || accessToken.isEmpty) {
      throw Exception('The server did not return a valid access token.');
    }

    await SecureStorage.saveAccessToken(accessToken);

    final user = data['user'];

    if (user is! Map) {
      await SecureStorage.clearAccessToken();
      throw Exception('The server did not return user information.');
    }

    return Map<String, dynamic>.from(user);
  }

  Future<Map<String, dynamic>> getCurrentUser() async {
    final token = await SecureStorage.getAccessToken();

    if (token == null || token.isEmpty) {
      throw Exception('No cashier session found.');
    }

    final response = await ApiClient.dio.get(
      '/auth/me',
      options: Options(
        headers: {
          'Authorization': 'Bearer $token',
        },
      ),
    );

    if (response.data is! Map || response.data['user'] is! Map) {
      throw Exception('Unexpected authentication response.');
    }

    return Map<String, dynamic>.from(response.data['user'] as Map);
  }

  Future<void> logout() async {
    await SecureStorage.clearAccessToken();
  }
}
