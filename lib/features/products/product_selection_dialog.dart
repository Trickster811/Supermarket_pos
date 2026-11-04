import 'package:flutter/material.dart';
import 'package:supermarket_pos/features/products/product_model.dart';

class ProductSelectionDialog extends StatefulWidget {
  final ProductModel product;

  const ProductSelectionDialog({super.key, required this.product});

  static Future<double?> show(BuildContext context, ProductModel product) {
    if (product.sellingMode.toUpperCase() == 'WEIGHT') {
      return showModalBottomSheet<double>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        builder: (_) => _WeightedProductSheet(product: product),
      );
    }

    return showDialog<double>(
      context: context,
      builder: (_) => ProductSelectionDialog(product: product),
    );
  }

  @override
  State<ProductSelectionDialog> createState() => _ProductSelectionDialogState();
}

class _ProductSelectionDialogState extends State<ProductSelectionDialog> {
  late final TextEditingController _quantityController;

  double get _quantity {
    final value = _quantityController.text.trim().replaceAll(',', '.');
    return double.tryParse(value) ?? 0;
  }

  double get _subtotal => widget.product.price * _quantity;

  @override
  void initState() {
    super.initState();
    _quantityController = TextEditingController(text: '1');
  }

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  void _confirm() {
    final quantity = _quantity;

    if (!quantity.isFinite || quantity <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a quantity greater than zero.')),
      );
      return;
    }

    if (quantity % 1 != 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Unit products require whole quantities.'),
        ),
      );
      return;
    }

    Navigator.of(context).pop(quantity);
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final theme = Theme.of(context);

    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: const Text('Add product'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(product.name, style: theme.textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(
            '${product.price.toStringAsFixed(0)} FCFA / ${product.unitOfMeasure}',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 18),
          TextField(
            controller: _quantityController,
            autofocus: true,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Quantity',
              suffixText: product.unitOfMeasure,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Subtotal: ${_subtotal.toStringAsFixed(0)} FCFA',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: theme.colorScheme.primary,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _confirm, child: const Text('Add to cart')),
      ],
    );
  }
}

class _WeightedProductSheet extends StatefulWidget {
  final ProductModel product;

  const _WeightedProductSheet({required this.product});

  @override
  State<_WeightedProductSheet> createState() => _WeightedProductSheetState();
}

class _WeightedProductSheetState extends State<_WeightedProductSheet> {
  String _weightInput = '';

  double get _weight {
    return double.tryParse(_weightInput.replaceAll(',', '.')) ?? 0;
  }

  double get _subtotal => widget.product.price * _weight;

  void _pressKey(String key) {
    setState(() {
      if (key == 'backspace') {
        if (_weightInput.isNotEmpty) {
          _weightInput = _weightInput.substring(0, _weightInput.length - 1);
        }
        return;
      }

      if (key == '.') {
        if (_weightInput.contains('.')) return;

        _weightInput = _weightInput.isEmpty ? '0.' : '$_weightInput.';
        return;
      }

      // Keep weight entry practical and avoid excessively long values.
      if (_weightInput.length >= 8) return;

      _weightInput += key;
    });
  }

  void _confirm() {
    if (!_weight.isFinite || _weight <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a weight greater than zero.')),
      );
      return;
    }

    Navigator.of(context).pop(_weight);
  }

  String _formatPrice(double value) {
    return '${value.toStringAsFixed(0)} FCFA';
  }

  Widget _buildKey(String value) {
    final theme = Theme.of(context);
    final isBackspace = value == 'backspace';

    return Material(
      color: theme.colorScheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _pressKey(value),
        child: SizedBox(
          height: 54,
          child: Center(
            child: isBackspace
                ? Icon(
                    Icons.backspace_outlined,
                    size: 21,
                    color: theme.colorScheme.onSurfaceVariant,
                  )
                : Text(
                    value,
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final product = widget.product;

    final displayedWeight = _weightInput.isEmpty ? '0.000' : _weightInput;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Bottom-sheet handle.
                Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.outlineVariant,
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),

                const SizedBox(height: 20),

                // Product information.
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            product.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${_formatPrice(product.price)} / ${product.unitOfMeasure}',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close',
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // Weight and calculated subtotal.
                Text(
                  '$displayedWeight ${product.unitOfMeasure.toLowerCase()}',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                    fontFeatures: const [],
                  ),
                ),

                const SizedBox(height: 6),

                Text(
                  '= ${_formatPrice(_subtotal)}',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),

                const SizedBox(height: 20),

                // Compact numeric keypad.
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 2.0,
                  children: [
                    _buildKey('1'),
                    _buildKey('2'),
                    _buildKey('3'),
                    _buildKey('4'),
                    _buildKey('5'),
                    _buildKey('6'),
                    _buildKey('7'),
                    _buildKey('8'),
                    _buildKey('9'),
                    _buildKey('.'),
                    _buildKey('0'),
                    _buildKey('backspace'),
                  ],
                ),

                const SizedBox(height: 18),

                // Add-to-cart action.
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: _weight > 0 ? _confirm : null,
                    style: FilledButton.styleFrom(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: Text(
                      'Add · ${_formatPrice(_subtotal)}',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
