import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  SecureStorage._();

  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static const String _terminalIdKey = 'terminal_id';
  static const String _terminalTokenKey = 'terminal_token';
  static const String _accessTokenKey = 'access_token';

  static Future<void> saveTerminalCredentials({
    required String terminalId,
    required String terminalToken,
  }) async {
    await _storage.write(key: _terminalIdKey, value: terminalId);

    await _storage.write(key: _terminalTokenKey, value: terminalToken);
  }

  static Future<String?> getTerminalId() {
    return _storage.read(key: _terminalIdKey);
  }

  static Future<String?> getTerminalToken() {
    return _storage.read(key: _terminalTokenKey);
  }

  static Future<void> saveAccessToken(String token) {
    return _storage.write(key: _accessTokenKey, value: token);
  }

  static Future<String?> getAccessToken() {
    return _storage.read(key: _accessTokenKey);
  }

  static Future<void> clearAll() {
    return _storage.deleteAll();
  }

  static Future<void> clearAccessToken() {
    return _storage.delete(key: _accessTokenKey);
  }
}
