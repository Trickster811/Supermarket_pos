import 'dart:async';

import 'package:dio/dio.dart';
import 'package:supermarket_pos/core/network/api_client.dart';
import 'package:supermarket_pos/core/storage/secure_storage.dart';

class TerminalHeartbeatService {
  Timer? _timer;
  bool _isSending = false;
  bool _isDisposed = false;

  void Function(bool isOnline)? onStatusChanged;

  static const Duration heartbeatInterval = Duration(seconds: 15);

  Future<void> start({
    required void Function(bool isOnline) onStatusChanged,
  }) async {
    if (_timer != null) return;

    this.onStatusChanged = onStatusChanged;

    // Send the first heartbeat immediately.
    await _sendHeartbeat();

    if (_isDisposed) return;

    _timer = Timer.periodic(heartbeatInterval, (_) {
      _sendHeartbeat();
    });
  }

  Future<void> _sendHeartbeat() async {
    if (_isSending || _isDisposed) return;

    _isSending = true;

    try {
      final terminalId = await SecureStorage.getTerminalId();
      final terminalToken = await SecureStorage.getTerminalToken();

      if (terminalId == null || terminalToken == null) {
        onStatusChanged?.call(false);
        return;
      }

      await ApiClient.dio.post(
        '/terminals/heartbeat',
        data: {},
        options: Options(
          headers: {
            'X-Terminal-ID': terminalId,
            'X-Terminal-Token': terminalToken,
          },
        ),
      );

      if (!_isDisposed) {
        onStatusChanged?.call(true);
      }
    } on DioException {
      if (!_isDisposed) {
        onStatusChanged?.call(false);
      }
    } catch (_) {
      if (!_isDisposed) {
        onStatusChanged?.call(false);
      }
    } finally {
      _isSending = false;
    }
  }

  void dispose() {
    _isDisposed = true;
    _timer?.cancel();
    _timer = null;
  }
}
