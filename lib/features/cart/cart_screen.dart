import 'package:flutter/material.dart';
import 'package:supermarket_pos/features/cart/cart_item.dart';
import 'package:supermarket_pos/features/cart/cart_scope.dart';

class CartScreen extends StatefulWidget {
  /// Set this from the app's actual server connection state when available.
  /// Null means the connection state has not been determined.
  final bool? isOnline;

  /// Connect this to the checkout flow when that screen is ready.
  final VoidCallback? onCheckout;

  const CartScreen({super.key, this.isOnline, this.onCheckout});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  bool _searching = false;
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String get _locale =>
      Localizations.localeOf(context).languageCode.toLowerCase();

  bool get _isFrench => _locale == 'fr';

  String _text(String english, String french) => _isFrench ? french : english;

  String _formatMoney(double value) {
    final rounded = value.round();
    final digits = rounded.toString();
    final buffer = StringBuffer();

    for (var i = 0; i < digits.length; i++) {
      buffer.write(digits[i]);

      final remaining = digits.length - i - 1;
      if (remaining > 0 && remaining % 3 == 0) {
        buffer.write(' ');
      }
    }

    return buffer.toString();
  }

  String _formatQuantity(double value) {
    if (value == value.roundToDouble()) {
      return value.toInt().toString();
    }

    return value
        .toStringAsFixed(3)
        .replaceAll(RegExp(r'0+$'), '')
        .replaceAll(RegExp(r'\.$'), '');
  }

  Future<void> _editWeight(BuildContext context, CartItem item) async {
    final controller = CartScope.of(context);
    final quantityController = TextEditingController(
      text: _formatQuantity(item.quantity),
    );

    final result = await showDialog<double>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(_text('Edit weight', 'Modifier le poids')),
          content: TextField(
            controller: quantityController,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: _text('Weight (kg)', 'Poids (kg)'),
              suffixText: 'kg',
              border: const OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(_text('Cancel', 'Annuler')),
            ),
            FilledButton(
              onPressed: () {
                final value = double.tryParse(
                  quantityController.text.trim().replaceAll(',', '.'),
                );

                if (value == null || !value.isFinite || value <= 0) {
                  return;
                }

                Navigator.pop(dialogContext, value);
              },
              child: Text(_text('Save', 'Enregistrer')),
            ),
          ],
        );
      },
    );

    quantityController.dispose();

    if (result != null) {
      controller.updateQuantity(item.product.id, result);
    }
  }

  void _changeUnitQuantity(CartItem item, int difference) {
    final controller = CartScope.of(context);
    final newQuantity = item.quantity + difference;

    if (newQuantity <= 0) {
      controller.removeProduct(item.product.id);
    } else {
      controller.updateQuantity(item.product.id, newQuantity);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = CartScope.of(context);
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    final allItems = cart.items;
    final query = _searchController.text.trim().toLowerCase();

    final items = allItems.where((item) {
      if (query.isEmpty) return true;

      final product = item.product;
      return product.name.toLowerCase().contains(query) ||
          product.sku.toLowerCase().contains(query) ||
          (product.barcode?.toLowerCase().contains(query) ?? false) ||
          (product.pluCode?.toLowerCase().contains(query) ?? false);
    }).toList();

    final background = theme.scaffoldBackgroundColor;
    final secondaryText = colors.onSurface.withValues(alpha: 0.55);
    final dividerColor = colors.onSurface.withValues(alpha: 0.10);
    final orange = const Color(0xFFF15A0A);

    final statusColor = widget.isOnline == null
        ? secondaryText
        : widget.isOnline!
        ? const Color(0xFF218653)
        : const Color(0xFFFFB74D);

    final statusText = widget.isOnline == null
        ? _text('Status unknown', 'État inconnu')
        : widget.isOnline!
        ? _text('Online', 'En ligne')
        : _text('Offline', 'Hors ligne');

    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    IconButton(
                      onPressed: () => Navigator.maybePop(context),
                      icon: const Icon(Icons.arrow_back),
                      iconSize: 24,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 42,
                        minHeight: 42,
                      ),
                    ),
                    const SizedBox(width: 17),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (_searching)
                            TextField(
                              controller: _searchController,
                              autofocus: true,
                              onChanged: (_) => setState(() {}),
                              decoration: InputDecoration(
                                hintText: _text(
                                  'Search cart',
                                  'Rechercher dans le panier',
                                ),
                                border: InputBorder.none,
                                isDense: true,
                              ),
                            )
                          else
                            Text(
                              _text('Cart', 'Panier'),
                              style: theme.textTheme.headlineMedium?.copyWith(
                                fontWeight: FontWeight.w500,
                                fontSize: 24,
                              ),
                            ),
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              Text(
                                _isFrench
                                    ? '${cart.itemCount} articles'
                                    : '${cart.itemCount} items',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  color: secondaryText,
                                  fontSize: 14,
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                ),
                                child: Text(
                                  '·',
                                  style: TextStyle(
                                    color: secondaryText,
                                    fontSize: 20,
                                  ),
                                ),
                              ),
                              Container(
                                width: 10,
                                height: 10,
                                decoration: BoxDecoration(
                                  color: statusColor,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 9),
                              Text(
                                statusText,
                                style: theme.textTheme.titleMedium?.copyWith(
                                  color: secondaryText,
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () {
                        setState(() {
                          if (_searching) {
                            _searchController.clear();
                            _searching = false;
                          } else {
                            _searching = true;
                          }
                        });
                      },
                      icon: Icon(
                        _searching ? Icons.close : Icons.search,
                        size: 24,
                      ),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 42,
                        minHeight: 42,
                      ),
                    ),
                  ],
                ),
              ),

              // Cart items
              Expanded(
                child: cart.isEmpty
                    ? _buildEmptyCart(theme, secondaryText)
                    : items.isEmpty
                    ? Center(
                        child: Text(
                          _text('No matching products', 'Aucun produit trouvé'),
                          style: TextStyle(color: secondaryText),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                        itemCount: items.length,
                        separatorBuilder: (_, _) => Divider(
                          height: 1,
                          thickness: 1,
                          color: dividerColor,
                        ),
                        itemBuilder: (context, index) {
                          final item = items[index];
                          return _buildCartItem(
                            context,
                            item,
                            theme,
                            secondaryText,
                          );
                        },
                      ),
              ),

              Container(
                color: background,
                padding: const EdgeInsets.fromLTRB(22, 12, 22, 18),
                child: Column(
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Text(
                          _text('Total', 'Total'),
                          style: theme.textTheme.titleLarge?.copyWith(
                            color: secondaryText,
                            fontSize: 16,
                          ),
                        ),
                        const Spacer(),
                        Flexible(
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerRight,
                            child: Text(
                              '${_formatMoney(cart.total)} FCFA',
                              style: theme.textTheme.headlineLarge?.copyWith(
                                fontSize: 30,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      height: 70,
                      child: FilledButton(
                        onPressed: cart.isEmpty ? null : widget.onCheckout,
                        style: FilledButton.styleFrom(
                          backgroundColor: orange,
                          disabledBackgroundColor: orange.withValues(
                            alpha: 0.35,
                          ),
                          foregroundColor: Colors.white,
                          disabledForegroundColor: Colors.white70,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Text(
                          _text('Charge', 'Encaisser'),
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCartItem(
    BuildContext context,
    CartItem item,
    ThemeData theme,
    Color secondaryText,
  ) {
    final product = item.product;
    final isWeighted = item.isWeighted;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                _formatMoney(item.subtotal),
                style: theme.textTheme.titleLarge?.copyWith(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  isWeighted
                      ? '${_formatMoney(product.price)} / ${_isFrench ? 'kg' : 'kg'}'
                      : '${_formatMoney(product.price)} ${_text('each', 'l’unité')}',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: secondaryText,
                    fontSize: 14,
                  ),
                ),
              ),
              if (isWeighted)
                InkWell(
                  onTap: () => _editWeight(context, item),
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 2,
                    ),
                    child: Row(
                      children: [
                        Text(
                          '${_formatQuantity(item.quantity)} kg',
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Icon(
                          Icons.edit_outlined,
                          size: 18,
                          color: secondaryText,
                        ),
                      ],
                    ),
                  ),
                )
              else
                Row(
                  children: [
                    _quantityButton(
                      context,
                      icon: Icons.remove,
                      onTap: () => _changeUnitQuantity(item, -1),
                      color: secondaryText,
                    ),
                    SizedBox(
                      width: 43,
                      child: Center(
                        child: Text(
                          _formatQuantity(item.quantity),
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                    _quantityButton(
                      context,
                      icon: Icons.add,
                      onTap: () => _changeUnitQuantity(item, 1),
                      color: secondaryText,
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _quantityButton(
    BuildContext context, {
    required IconData icon,
    required VoidCallback onTap,
    required Color color,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: SizedBox(
        width: 32,
        height: 32,
        child: Icon(icon, size: 20, color: color),
      ),
    );
  }

  Widget _buildEmptyCart(ThemeData theme, Color secondaryText) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.shopping_cart_outlined, size: 48, color: secondaryText),
          const SizedBox(height: 24),
          Text(
            _text('Your cart is empty', 'Votre panier est vide'),
            style: theme.textTheme.titleLarge?.copyWith(color: secondaryText),
          ),
        ],
      ),
    );
  }
}
