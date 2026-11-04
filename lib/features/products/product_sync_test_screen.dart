import 'package:flutter/material.dart';
import 'package:supermarket_pos/features/products/product_sync_service.dart';

class ProductSyncTestScreen extends StatefulWidget {
  const ProductSyncTestScreen({super.key});

  @override
  State<ProductSyncTestScreen> createState() => _ProductSyncTestScreenState();
}

class _ProductSyncTestScreenState extends State<ProductSyncTestScreen> {
  final ProductSyncService _syncService = ProductSyncService();

  List<Map<String, dynamic>> _products = [];
  bool _isLoading = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _loadCachedProducts();
  }

  Future<void> _loadCachedProducts() async {
    try {
      final products = await _syncService.getCachedProducts();

      if (!mounted) return;

      setState(() {
        _products = products;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _message = 'Could not load local products: $e';
      });
    }
  }

  Future<void> _synchronizeProducts() async {
    setState(() {
      _isLoading = true;
      _message = null;
    });

    try {
      final count = await _syncService.syncProducts();
      await _loadCachedProducts();

      if (!mounted) return;

      setState(() {
        _message = '$count products synchronized successfully.';
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _message = 'Synchronization failed: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Product synchronization test')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ElevatedButton.icon(
              onPressed: _isLoading ? null : _synchronizeProducts,
              icon: _isLoading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.sync),
              label: Text(
                _isLoading ? 'Synchronizing...' : 'Synchronize products',
              ),
            ),
            const SizedBox(height: 12),
            if (_message != null)
              Text(
                _message!,
                style: TextStyle(
                  color: _message!.startsWith('Synchronization failed')
                      ? Colors.red
                      : Colors.green,
                ),
              ),
            const SizedBox(height: 16),
            Text(
              'Locally cached products: ${_products.length}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const Divider(),
            Expanded(
              child: _products.isEmpty
                  ? const Center(child: Text('No products cached yet.'))
                  : ListView.builder(
                      itemCount: _products.length,
                      itemBuilder: (context, index) {
                        final product = _products[index];

                        return ListTile(
                          title: Text(
                            product['name']?.toString() ?? 'Unnamed product',
                          ),
                          subtitle: Text(
                            'SKU: ${product['sku'] ?? '-'}\n'
                            'ID: ${product['id'] ?? '-'}',
                          ),
                          isThreeLine: true,
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
