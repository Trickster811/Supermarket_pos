import 'package:flutter/material.dart';
import 'package:supermarket_pos/core/storage/secure_storage.dart';
import 'package:supermarket_pos/features/authentication/auth_service.dart';
import 'package:supermarket_pos/features/authentication/cashier_home_screen.dart';
import 'package:supermarket_pos/features/authentication/login_screen.dart';
import 'package:supermarket_pos/features/pairing/terminal_heartbeat_service.dart';

class TerminalHomeScreen extends StatefulWidget {
  const TerminalHomeScreen({super.key});

  @override
  State<TerminalHomeScreen> createState() => _TerminalHomeScreenState();
}

class _TerminalHomeScreenState extends State<TerminalHomeScreen> {
  late final TerminalHeartbeatService _heartbeatService;

  bool _isOnline = false;
  bool _hasReceivedFirstHeartbeat = false;

  @override
  void initState() {
    super.initState();

    _heartbeatService = TerminalHeartbeatService();

    _heartbeatService.start(
      onStatusChanged: (isOnline) {
        if (!mounted) return;

        setState(() {
          _isOnline = isOnline;
          _hasReceivedFirstHeartbeat = true;
        });
      },
    );
  }

  @override
  void dispose() {
    _heartbeatService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Supermarket POS')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.point_of_sale, size: 72),
              const SizedBox(height: 24),
              const Text(
                'Checkout terminal',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    _isOnline ? Icons.wifi : Icons.wifi_off,
                    color: _isOnline ? Colors.green : Colors.red,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    !_hasReceivedFirstHeartbeat
                        ? 'Connecting to server...'
                        : _isOnline
                        ? 'Connected to server'
                        : 'Server unavailable',
                    style: TextStyle(
                      fontSize: 16,
                      color: _isOnline ? Colors.green : Colors.red,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Terminal heartbeat is active.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: () async {
                  final token = await SecureStorage.getAccessToken();

                  if (!context.mounted) return;

                  if (token == null) {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const LoginScreen()),
                    );
                  } else {
                    try {
                      final user = await AuthService().getCurrentUser();

                      if (!context.mounted) return;

                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                          builder: (_) => CashierHomeScreen(user: user),
                        ),
                      );
                    } catch (_) {
                      await AuthService().logout();

                      if (!context.mounted) return;

                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                      );
                    }
                  }
                },
                icon: const Icon(Icons.login),
                label: const Text('Cashier login'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
