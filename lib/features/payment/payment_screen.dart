import 'package:flutter/material.dart';
import 'package:supermarket_pos/features/cart/cart_scope.dart';
import 'package:supermarket_pos/features/payment/sale_result_screen.dart';
import 'package:supermarket_pos/features/payment/sale_service.dart';
import 'package:uuid/uuid.dart';

enum PaymentMethod { cash, mobileMoney }

enum MobileMoneyProvider { mtnMomo, orangeMoney }

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  PaymentMethod _method = PaymentMethod.cash;
  MobileMoneyProvider _provider = MobileMoneyProvider.mtnMomo;

  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _referenceController = TextEditingController();

  double _amountReceived = 0;

  final SaleService _saleService = SaleService();

  bool _isSubmitting = false;
  String? _transactionUuid;

  @override
  void initState() {
    super.initState();

    // The initial value will be set from the cart in build().
  }

  @override
  void dispose() {
    _amountController.dispose();
    _referenceController.dispose();
    super.dispose();
  }

  double _parseAmount(String value) {
    return double.tryParse(value.trim().replaceAll(' ', '')) ?? 0;
  }

  String _formatMoney(double amount) {
    final rounded = amount.round();
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

  void _setAmount(double amount) {
    setState(() {
      _amountReceived = amount;
      _amountController.text = amount == 0 ? '' : amount.round().toString();
    });
  }

  void _selectMethod(PaymentMethod method) {
    setState(() {
      _method = method;
    });
  }

  Future<void> _submitPayment() async {
    if (_isSubmitting) return;

    final cart = CartScope.of(context);

    if (cart.isEmpty) return;

    if (_method == PaymentMethod.cash && _amountReceived < cart.total) {
      return;
    }

    setState(() {
      _isSubmitting = true;
      _transactionUuid ??= const Uuid().v4();
    });

    try {
      final sale = await _saleService.createSale(
        transactionUuid: _transactionUuid!,
        items: cart.items,
        paymentMethod: _method == PaymentMethod.cash ? 'CASH' : 'MOBILE_MONEY',
        amountReceived: _amountReceived,
        mobileMoneyProvider: _method == PaymentMethod.mobileMoney
            ? (_provider == MobileMoneyProvider.mtnMomo
                  ? 'MTN_MOMO'
                  : 'ORANGE_MONEY')
            : null,
        paymentReference: _method == PaymentMethod.mobileMoney
            ? _referenceController.text.trim()
            : null,
      );

      if (!mounted) return;

      final navigator = Navigator.of(context);

      navigator.pushReplacement(
        MaterialPageRoute(
          builder: (_) => SaleResultScreen(
            sale: sale,
            onNextCustomer: () {
              cart.clear();

              // Return to the existing cashier scanner screen.
              navigator.popUntil((route) => route.isFirst);
            },
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString().replaceFirst('Exception: ', '')),
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = CartScope.of(context);
    final total = cart.total;
    final change = _amountReceived - total;
    final canConfirm = _method == PaymentMethod.cash
        ? _amountReceived >= total
        : true;

    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Payment',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        centerTitle: false,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 20),
                children: [
                  _buildMethodSelector(colors, isDark),

                  const SizedBox(height: 24),

                  Text(
                    'TOTAL TO PAY',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: colors.onSurfaceVariant,
                      letterSpacing: 1.1,
                      fontWeight: FontWeight.w600,
                    ),
                  ),

                  const SizedBox(height: 7),

                  Text(
                    '${_formatMoney(total)} FCFA',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.5,
                    ),
                  ),

                  const SizedBox(height: 28),

                  if (_method == PaymentMethod.cash)
                    _buildCashSection(total, change, colors, theme)
                  else
                    _buildMobileMoneySection(colors, theme),
                ],
              ),
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
                child: FilledButton(
                  onPressed: canConfirm && !_isSubmitting
                      ? _submitPayment
                      : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFF28C28),
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: colors.onSurface.withValues(
                      alpha: 0.08,
                    ),
                    disabledForegroundColor: colors.onSurface.withValues(
                      alpha: 0.38,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(13),
                    ),
                    elevation: 0,
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          _method == PaymentMethod.cash
                              ? 'Confirm payment'
                              : 'Mark as paid',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
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

  Widget _buildMethodSelector(ColorScheme colors, bool isDark) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surfaceContainerHighest.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          _methodTab(
            label: 'Cash',
            icon: Icons.payments_outlined,
            method: PaymentMethod.cash,
          ),
          _methodTab(
            label: 'Mobile Money',
            icon: Icons.phone_android_rounded,
            method: PaymentMethod.mobileMoney,
          ),
        ],
      ),
    );
  }

  Widget _methodTab({
    required String label,
    required IconData icon,
    required PaymentMethod method,
  }) {
    final selected = _method == method;
    final colors = Theme.of(context).colorScheme;

    return Expanded(
      child: GestureDetector(
        onTap: () => _selectMethod(method),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 8),
          decoration: BoxDecoration(
            color: selected ? colors.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 5,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 17,
                color: selected
                    ? const Color(0xFFF28C28)
                    : colors.onSurfaceVariant,
              ),
              const SizedBox(width: 7),
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                    color: selected
                        ? colors.onSurface
                        : colors.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCashSection(
    double total,
    double change,
    ColorScheme colors,
    ThemeData theme,
  ) {
    final quickAmounts = <double>{
      total,
      if (total <= 10000) 10000,
      20000,
    }.toList()..sort();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Customer gives',
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),

        const SizedBox(height: 10),

        TextField(
          controller: _amountController,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (value) {
            setState(() {
              _amountReceived = _parseAmount(value);
            });
          },
          decoration: InputDecoration(
            hintText: 'Enter amount received',
            suffixText: 'FCFA',
            filled: true,
            fillColor: colors.surfaceContainerHighest.withValues(alpha: 0.35),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 15,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.outlineVariant),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.outlineVariant),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(
                color: Color(0xFFF28C28),
                width: 1.5,
              ),
            ),
          ),
        ),

        const SizedBox(height: 12),

        Row(
          children: quickAmounts.map((amount) {
            final selected = _amountReceived == amount;

            return Expanded(
              child: Padding(
                padding: EdgeInsets.only(
                  right: amount == quickAmounts.last ? 0 : 8,
                ),
                child: OutlinedButton(
                  onPressed: () => _setAmount(amount),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 11),
                    side: BorderSide(
                      color: selected
                          ? const Color(0xFFF28C28)
                          : colors.outlineVariant,
                    ),
                    backgroundColor: selected
                        ? const Color(0xFFF28C28).withValues(alpha: 0.08)
                        : Colors.transparent,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: Text(
                    amount == total ? 'Exact' : _formatMoney(amount),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: selected
                          ? const Color(0xFFF28C28)
                          : colors.onSurface,
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),

        const SizedBox(height: 24),

        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: change >= 0
                ? const Color(0xFF16A36A).withValues(alpha: 0.08)
                : colors.surfaceContainerHighest.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(13),
            border: Border.all(
              color: change >= 0
                  ? const Color(0xFF16A36A).withValues(alpha: 0.2)
                  : colors.outlineVariant.withValues(alpha: 0.5),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Change to give back',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    change >= 0
                        ? '${_formatMoney(change)} FCFA'
                        : 'Insufficient amount',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: change >= 0
                          ? const Color(0xFF16A36A)
                          : colors.error,
                    ),
                  ),
                ],
              ),
              Icon(
                Icons.payments_outlined,
                color: change >= 0
                    ? const Color(0xFF16A36A)
                    : colors.onSurfaceVariant,
                size: 25,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildMobileMoneySection(ColorScheme colors, ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Select provider',
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),

        const SizedBox(height: 10),

        _providerTile(
          title: 'MTN Mobile Money',
          subtitle: 'MTN MoMo',
          provider: MobileMoneyProvider.mtnMomo,
          color: const Color(0xFFFFCC00),
        ),

        const SizedBox(height: 9),

        _providerTile(
          title: 'Orange Money',
          subtitle: 'Orange',
          provider: MobileMoneyProvider.orangeMoney,
          color: const Color(0xFFFF7900),
        ),

        const SizedBox(height: 22),

        Text(
          'Transaction reference (optional)',
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),

        const SizedBox(height: 9),

        TextField(
          controller: _referenceController,
          textCapitalization: TextCapitalization.characters,
          maxLength: 100,
          decoration: InputDecoration(
            hintText: 'Enter transaction reference',
            counterText: '',
            prefixIcon: const Icon(Icons.receipt_long_outlined),
            filled: true,
            fillColor: colors.surfaceContainerHighest.withValues(alpha: 0.35),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.outlineVariant),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.outlineVariant),
            ),
          ),
        ),

        const SizedBox(height: 12),

        Text(
          'Confirm only after verifying that the customer has completed the transfer. Entering a reference does not verify the payment automatically.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: colors.onSurfaceVariant,
            height: 1.4,
          ),
        ),
      ],
    );
  }

  Widget _providerTile({
    required String title,
    required String subtitle,
    required MobileMoneyProvider provider,
    required Color color,
  }) {
    final selected = _provider == provider;
    final colors = Theme.of(context).colorScheme;

    return InkWell(
      onTap: () {
        setState(() {
          _provider = provider;
        });
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? color
                : colors.outlineVariant.withValues(alpha: 0.7),
            width: selected ? 1.5 : 1,
          ),
          color: selected ? color.withValues(alpha: 0.07) : colors.surface,
        ),
        child: Row(
          children: [
            Container(
              width: 37,
              height: 37,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                Icons.account_balance_wallet_outlined,
                color: color,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 11,
                      color: colors.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? color : colors.onSurfaceVariant,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}
