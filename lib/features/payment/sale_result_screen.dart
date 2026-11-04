import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'package:supermarket_pos/features/payment/receipt_generator.dart';

class SaleResultScreen extends StatefulWidget {
  final Map<String, dynamic> sale;
  final VoidCallback onNextCustomer;

  const SaleResultScreen({
    super.key,
    required this.sale,
    required this.onNextCustomer,
  });

  @override
  State<SaleResultScreen> createState() => _SaleResultScreenState();
}

class _SaleResultScreenState extends State<SaleResultScreen> {
  String _formatMoney(dynamic value) {
    final amount = double.tryParse(value?.toString() ?? '') ?? 0;
    final digits = amount.round().toString();
    final buffer = StringBuffer();

    for (var i = 0; i < digits.length; i++) {
      buffer.write(digits[i]);

      final remaining = digits.length - i - 1;
      if (remaining > 0 && remaining % 3 == 0) {
        buffer.write(' ');
      }
    }

    return '${buffer.toString()} FCFA';
  }

  Future<void> _printReceipt() async {
    try {
      final bytes = await ReceiptGenerator.generate(widget.sale);

      await Printing.layoutPdf(
        onLayout: (_) async => bytes,
        name: 'TEXACO_Center_Receipt.pdf',
      );
    } catch (e) {
      debugPrint('Receipt printing error: $e');

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Impossible d’imprimer le reçu / Unable to print receipt',
          ),
        ),
      );
    }
  }

  Future<void> _shareReceipt() async {
    try {
      final bytes = await ReceiptGenerator.generate(widget.sale);

      final receipt = widget.sale['receipt'] is Map
          ? Map<String, dynamic>.from(widget.sale['receipt'])
          : <String, dynamic>{};

      final receiptNumber = receipt['receiptNumber']?.toString() ?? 'receipt';

      await Printing.sharePdf(
        bytes: bytes,
        filename: 'TEXACO_Center_$receiptNumber.pdf',
      );
    } catch (e) {
      debugPrint('Receipt sharing error: $e');

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Impossible de partager le reçu / Unable to share receipt',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    final receipt = widget.sale['receipt'] is Map
        ? Map<String, dynamic>.from(widget.sale['receipt'] as Map)
        : <String, dynamic>{};

    final receiptNumber = receipt['receiptNumber']?.toString() ?? 'N/A';

    final items = receipt['items'] is List
        ? receipt['items'] as List
        : (widget.sale['items'] is List ? widget.sale['items'] as List : []);

    final total = widget.sale['total'] ?? receipt['total'] ?? 0;
    final paymentMethod = widget.sale['paymentMethod']?.toString() ?? '';
    final provider = widget.sale['mobileMoneyProvider']?.toString();

    final amountReceived = widget.sale['amountReceived'];
    final changeAmount = widget.sale['changeAmount'];

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text(
          'Sale completed',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(18),
                children: [
                  const SizedBox(height: 12),

                  Center(
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: const Color(0xFF16A36A).withValues(alpha: 0.10),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check_circle_rounded,
                        color: Color(0xFF16A36A),
                        size: 40,
                      ),
                    ),
                  ),

                  const SizedBox(height: 14),

                  Text(
                    'Payment successful',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),

                  const SizedBox(height: 5),

                  Text(
                    'The sale has been recorded successfully.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceVariant,
                    ),
                  ),

                  const SizedBox(height: 24),

                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: colors.surfaceContainerHighest.withValues(
                        alpha: 0.35,
                      ),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: colors.outlineVariant.withValues(alpha: 0.6),
                      ),
                    ),
                    child: Column(
                      children: [
                        Text(
                          'RECEIPT NUMBER',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: colors.onSurfaceVariant,
                            letterSpacing: 1,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 7),
                        SelectableText(
                          receiptNumber,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 18),
                        Text(
                          _formatMoney(total),
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Total paid',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: colors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 22),

                  Text(
                    'PAYMENT DETAILS',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: colors.onSurfaceVariant,
                      letterSpacing: 1,
                      fontWeight: FontWeight.w600,
                    ),
                  ),

                  const SizedBox(height: 10),

                  _detailRow(
                    context,
                    'Payment method',
                    paymentMethod == 'CASH' ? 'Cash' : 'Mobile Money',
                  ),

                  if (provider != null)
                    _detailRow(
                      context,
                      'Provider',
                      provider == 'MTN_MOMO'
                          ? 'MTN Mobile Money'
                          : 'Orange Money',
                    ),

                  if (paymentMethod == 'CASH') ...[
                    _detailRow(
                      context,
                      'Amount received',
                      _formatMoney(amountReceived),
                    ),
                    _detailRow(context, 'Change', _formatMoney(changeAmount)),
                  ],

                  const SizedBox(height: 22),

                  Text(
                    'PURCHASED ITEMS',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: colors.onSurfaceVariant,
                      letterSpacing: 1,
                      fontWeight: FontWeight.w600,
                    ),
                  ),

                  const SizedBox(height: 10),

                  if (items.isEmpty)
                    Text(
                      'Item details are not available in the receipt response.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceVariant,
                      ),
                    )
                  else
                    ...items.map((rawItem) {
                      if (rawItem is! Map) {
                        return const SizedBox.shrink();
                      }

                      final item = Map<String, dynamic>.from(rawItem);

                      final name =
                          item['productName'] ??
                          item['name'] ??
                          item['product']?['name'] ??
                          'Product';

                      final quantity = item['quantity'] ?? 0;

                      final subtotal =
                          item['subtotal'] ??
                          item['lineTotal'] ??
                          item['total'] ??
                          0;

                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    name.toString(),
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    'Qty: $quantity',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: colors.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 12),
                            Text(
                              _formatMoney(subtotal),
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                ],
              ),
            ),

            OutlinedButton.icon(
              onPressed: _printReceipt,
              icon: const Icon(Icons.print_outlined),
              label: const Text('Imprimer / Print'),
            ),

            OutlinedButton.icon(
              onPressed: _shareReceipt,
              icon: const Icon(Icons.share_outlined),
              label: const Text('Partager / Share'),
            ),

            Container(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 16),
              decoration: BoxDecoration(
                color: colors.surface,
                border: Border(
                  top: BorderSide(
                    color: colors.outlineVariant.withValues(alpha: 0.5),
                  ),
                ),
              ),
              child: SizedBox(
                width: double.infinity,
                height: 50,
                child: FilledButton.icon(
                  onPressed: widget.onNextCustomer,
                  icon: const Icon(Icons.qr_code_scanner_rounded),
                  label: const Text(
                    'Next customer',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFF28C28),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(13),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(BuildContext context, String label, String value) {
    final colors = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 13, color: colors.onSurfaceVariant),
          ),
          Text(
            value,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
