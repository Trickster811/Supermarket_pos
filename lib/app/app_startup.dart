
import 'package:flutter/material.dart';
import 'package:supermarket_pos/core/storage/secure_storage.dart';
import 'package:supermarket_pos/features/pairing/pairing_screen.dart';
import 'package:supermarket_pos/features/pairing/terminal_home_screen.dart';

class AppStartup extends StatefulWidget {
  const AppStartup({super.key});

  @override
  State<AppStartup> createState() => _AppStartupState();
}

class _AppStartupState extends State<AppStartup> {
  late final Future<bool> _credentialsExist;

  @override
  void initState() {
    super.initState();
    _credentialsExist = _checkCredentials();
  }

  Future<bool> _checkCredentials() async {
    final terminalId = await SecureStorage.getTerminalId();
    final terminalToken = await SecureStorage.getTerminalToken();

    return terminalId != null &&
        terminalId.isNotEmpty &&
        terminalToken != null &&
        terminalToken.isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<bool>(
      future: _credentialsExist,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: Center(
              child: CircularProgressIndicator(),
            ),
          );
        }

        if (snapshot.hasError) {
          return const Scaffold(
            body: Center(
              child: Text('Unable to load terminal credentials.'),
            ),
          );
        }

        if (snapshot.data == true) {
          return const TerminalHomeScreen();
        }

        return const PairingScreen();
      },
    );
  }
}
