import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'package:supermarket_pos/app/app_startup.dart';
import 'package:supermarket_pos/app/app_settings.dart';
import 'package:supermarket_pos/app/app_theme.dart';
import 'package:supermarket_pos/features/cart/cart_controller.dart';
import 'package:supermarket_pos/features/cart/cart_scope.dart';

class SupermarketApp extends StatefulWidget {
  const SupermarketApp({super.key});

  @override
  State<SupermarketApp> createState() => _SupermarketAppState();
}

class _SupermarketAppState extends State<SupermarketApp> {
  final AppSettings _settings = AppSettings();
  final CartController _cartController = CartController();

  @override
  void initState() {
    super.initState();
    _settings.loadSettings();
  }

  @override
  void dispose() {
    _settings.dispose();
    _cartController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppSettingsScope(
      settings: _settings,
      child: CartScope(
        controller: _cartController,
        child: ListenableBuilder(
          listenable: _settings,
          builder: (context, child) {
            return MaterialApp(
              title: 'Supermarket POS',
              debugShowCheckedModeBanner: false,
              theme: AppTheme.lightTheme,
              darkTheme: AppTheme.darkTheme,
              themeMode: _settings.themeMode,
              locale: _settings.locale,
              supportedLocales: const [Locale('en'), Locale('fr')],
              localizationsDelegates: const [
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: const AppStartup(),
            );
          },
        ),
      ),
    );
  }
}
