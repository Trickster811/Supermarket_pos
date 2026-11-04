import 'package:flutter/material.dart';
import 'package:supermarket_pos/features/cart/cart_scope.dart';
import 'package:supermarket_pos/features/cart/cart_screen.dart';
import 'package:supermarket_pos/features/products/product_selection_dialog.dart';

import 'product_model.dart';
import 'product_sync_service.dart';

class ProductCatalogueScreen extends StatefulWidget {
  const ProductCatalogueScreen({super.key});

  @override
  State<ProductCatalogueScreen> createState() => _ProductCatalogueScreenState();
}

class _ProductCatalogueScreenState extends State<ProductCatalogueScreen> {
  final ProductSyncService _syncService = ProductSyncService();
  final TextEditingController _searchController = TextEditingController();

  List<ProductModel> _products = [];
  String _selectedCategory = 'ALL';
  String _searchQuery = '';

  bool _isLoading = true;
  bool _isSyncing = false;
  String? _message;
  bool _syncError = false;

  bool get _isFrench => Localizations.localeOf(context).languageCode == 'fr';

  String tr(String english, String french) => _isFrench ? french : english;

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadProducts() async {
    try {
      final cachedProducts = await _syncService.getCachedProducts();

      final products = cachedProducts
          .map(ProductModel.fromJson)
          .where((product) => product.isActive)
          .toList();

      if (!mounted) return;

      setState(() {
        _products = products;
        _isLoading = false;

        if (_selectedCategory != 'ALL' &&
            !_categories.contains(_selectedCategory)) {
          _selectedCategory = 'ALL';
        }
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
        _message = 'Could not load local products: $e';
        _syncError = true;
      });
    }
  }

  Future<void> _synchronizeProducts() async {
    if (_isSyncing) return;

    setState(() {
      _isSyncing = true;
      _message = null;
    });

    try {
      final count = await _syncService.syncProducts();

      await _loadProducts();

      if (!mounted) return;

      setState(() {
        _message = tr(
          '$count products synchronized successfully.',
          '$count produits synchronisés avec succès.',
        );
        _syncError = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _message = tr(
          'Synchronization failed. Cached products are still available.',
          'Échec de la synchronisation. Les produits enregistrés restent disponibles.',
        );
        _syncError = true;
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSyncing = false;
        });
      }
    }
  }

  List<String> get _categories {
    final categories = _products
        .map((product) => product.categoryName)
        .whereType<String>()
        .where((name) => name.isNotEmpty)
        .toSet()
        .toList();

    categories.sort();
    return categories;
  }

  List<ProductModel> get _filteredProducts {
    final query = _searchQuery.trim().toLowerCase();

    return _products.where((product) {
      final matchesCategory =
          _selectedCategory == 'ALL' ||
          product.categoryName == _selectedCategory;

      final matchesSearch =
          query.isEmpty ||
          product.name.toLowerCase().contains(query) ||
          product.sku.toLowerCase().contains(query) ||
          (product.barcode?.toLowerCase().contains(query) ?? false) ||
          (product.pluCode?.toLowerCase().contains(query) ?? false);

      return matchesCategory && matchesSearch;
    }).toList();
  }

  String _formatPrice(double price) {
    return '${price.toStringAsFixed(0)} FCFA';
  }

  String _unitLabel(ProductModel product) {
    switch (product.unitOfMeasure) {
      case 'KG':
        return tr('per kg', 'par kg');
      case 'GRAM':
        return tr('per gram', 'par gramme');
      case 'LITRE':
        return tr('per litre', 'par litre');
      case 'PIECE':
        return tr('per piece', 'par pièce');
      case 'PACKET':
        return tr('per packet', 'par paquet');
      case 'BOTTLE':
        return tr('per bottle', 'par bouteille');
      case 'BOX':
        return tr('per box', 'par boîte');
      default:
        return product.unitOfMeasure;
    }
  }

  Widget _buildCategoryFilters() {
    final categories = ['ALL', ..._categories];

    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final category = categories[index];
          final selected = category == _selectedCategory;

          return ChoiceChip(
            label: Text(
              category == 'ALL'
                  ? tr('All products', 'Tous les produits')
                  : category,
            ),
            selected: selected,
            onSelected: (_) {
              setState(() {
                _selectedCategory = category;
              });
            },
            selectedColor: Theme.of(context).colorScheme.primaryContainer,
          );
        },
      ),
    );
  }

  Widget _buildProductCard(ProductModel product) {
    final isWeighted = product.sellingMode == 'WEIGHT';

    return Card(
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: () async {
          final quantity = await ProductSelectionDialog.show(context, product);

          if (!context.mounted || quantity == null) return;

          try {
            CartScope.of(context).addProduct(product, quantity: quantity);

            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('${product.name} added to cart'),
                duration: const Duration(seconds: 2),
              ),
            );
          } on ArgumentError catch (error) {
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(SnackBar(content: Text(error.message.toString())));
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    isWeighted
                        ? Icons.scale_outlined
                        : Icons.inventory_2_outlined,
                    size: 22,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const Spacer(),
                  if (isWeighted)
                    _buildModeBadge(tr('WEIGHT', 'POIDS'))
                  else
                    _buildModeBadge(tr('UNIT', 'UNITÉ')),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                product.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              Text(
                _formatPrice(product.price),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                _unitLabel(product),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              Text(
                product.sku,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              if (product.categoryName != null)
                Text(
                  product.categoryName!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildModeBadge(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredProducts = _filteredProducts;

    return Scaffold(
      appBar: AppBar(
        title: Text(tr('Products', 'Produits')),
        actions: [
          IconButton(
            tooltip: tr('Synchronize', 'Synchroniser'),
            onPressed: _isSyncing ? null : _synchronizeProducts,
            icon: _isSyncing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
          ),
          IconButton(
            tooltip: 'Shopping cart',
            icon: const Icon(Icons.shopping_cart_outlined),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const CartScreen()),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
              decoration: InputDecoration(
                hintText: tr(
                  'Search products, SKU, barcode or PLU...',
                  'Rechercher produit, SKU, code-barres ou PLU...',
                ),
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        onPressed: () {
                          _searchController.clear();
                          setState(() {
                            _searchQuery = '';
                          });
                        },
                        icon: const Icon(Icons.clear),
                      )
                    : null,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _buildCategoryFilters(),
          ),
          if (_message != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                _message!,
                style: TextStyle(
                  color: _syncError
                      ? Theme.of(context).colorScheme.error
                      : Colors.green,
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                Text(
                  '${filteredProducts.length} ${tr('products', 'produits')}',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const Spacer(),
                Text(
                  tr('Available offline', 'Disponible hors ligne'),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(width: 5),
                const Icon(Icons.cloud_done_outlined, size: 16),
              ],
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filteredProducts.isEmpty
                ? Center(
                    child: Text(
                      _products.isEmpty
                          ? tr(
                              'No cached products. Synchronize to load products.',
                              'Aucun produit enregistré. Synchronisez pour charger les produits.',
                            )
                          : tr('No products found.', 'Aucun produit trouvé.'),
                      textAlign: TextAlign.center,
                    ),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: filteredProducts.length,
                    gridDelegate:
                        const SliverGridDelegateWithMaxCrossAxisExtent(
                          maxCrossAxisExtent: 220,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          mainAxisExtent: 190,
                        ),
                    itemBuilder: (context, index) {
                      return _buildProductCard(filteredProducts[index]);
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
