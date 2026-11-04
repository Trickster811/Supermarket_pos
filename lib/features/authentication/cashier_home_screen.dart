import 'package:flutter/material.dart';

import 'package:supermarket_pos/features/authentication/auth_service.dart';
import 'package:supermarket_pos/features/authentication/login_screen.dart';
import 'package:supermarket_pos/features/cart/cart_screen.dart';
import 'package:supermarket_pos/features/cart/cart_scope.dart';
import 'package:supermarket_pos/features/payment/payment_screen.dart';
import 'package:supermarket_pos/features/products/product_catalogue_screen.dart';
import 'package:supermarket_pos/features/products/product_model.dart';
import 'package:supermarket_pos/features/products/product_sync_service.dart';
import 'package:supermarket_pos/features/products/product_sync_test_screen.dart';
import 'package:supermarket_pos/features/scanner/barcode_scanner_screen.dart';
import 'package:supermarket_pos/features/settings/settings_screen.dart';

class CashierHomeScreen extends StatefulWidget {
  final Map<String, dynamic> user;

  const CashierHomeScreen({super.key, required this.user});

  @override
  State<CashierHomeScreen> createState() => _CashierHomeScreenState();
}

class _CashierHomeScreenState extends State<CashierHomeScreen> {
  final ProductSyncService _productSyncService = ProductSyncService();

  String get _cashierName {
    final fullName = widget.user['fullName'] as String?;
    final username = widget.user['username'] as String?;

    if (fullName != null && fullName.trim().isNotEmpty) {
      return fullName;
    }

    return username ?? 'Cashier';
  }

  Future<String?> _handleBarcode(String barcode) async {
    final cachedProducts = await _productSyncService.getCachedProducts();

    for (final rawProduct in cachedProducts) {
      final product = ProductModel.fromJson(rawProduct);

      if (product.barcode != barcode || !product.isActive) {
        continue;
      }

      // Barcode scanning is reserved for unit-selling products.
      // Weighted products must be selected manually from the catalogue.
      if (product.sellingMode.toUpperCase() != 'UNIT') {
        return null;
      }

      CartScope.of(context).addProduct(product, quantity: 1);
      return product.name;
    }

    return null;
  }

  void _openCart() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CartScreen(
          onCheckout: () {
            Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const PaymentScreen()));
          },
        ),
      ),
    );
  }

  void _openProductCatalogue() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const ProductCatalogueScreen()));
  }

  void _openProductSync() {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => const ProductSyncTestScreen()));
  }

  void _openSettings() {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => const SettingsScreen()));
  }

  Future<void> _logout() async {
    await AuthService().logout();

    if (!mounted) return;

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  void _handleMenuSelection(String value) {
    switch (value) {
      case 'catalogue':
        _openProductCatalogue();
        break;
      case 'sync':
        _openProductSync();
        break;
      case 'settings':
        _openSettings();
        break;
      case 'logout':
        _logout();
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return BarcodeScannerScreen(
      cashierName: _cashierName,
      onBarcodeDetected: _handleBarcode,
      onOpenCart: _openCart,
      onSearchProduct: _openProductCatalogue,
      onCheckout: _openCart,
    );
  }
}
