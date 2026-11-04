import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:supermarket_pos/features/cart/cart_scope.dart';

class BarcodeScannerScreen extends StatefulWidget {
  final String cashierName;
  final bool? isOnline;
  final int pendingSyncCount;

  /// Look up the barcode in the local product catalogue and add it to the cart.
  /// Return the product name when successful, or null if not found.
  final Future<String?> Function(String barcode) onBarcodeDetected;

  final VoidCallback onOpenCart;
  final VoidCallback? onSearchProduct;
  final VoidCallback? onCheckout;

  const BarcodeScannerScreen({
    super.key,
    required this.cashierName,
    required this.onBarcodeDetected,
    required this.onOpenCart,
    this.isOnline,
    this.pendingSyncCount = 0,
    this.onSearchProduct,
    this.onCheckout,
  });

  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  late final MobileScannerController _scannerController;

  bool _isPaused = false;
  bool _handlingScan = false;
  String? _lastScannedProduct;
  String? _lastScannedBarcode;
  String? _scanError;

  @override
  void initState() {
    super.initState();

    _scannerController = MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      facing: CameraFacing.back,
      torchEnabled: false,
    );
  }

  @override
  void dispose() {
    _scannerController.dispose();
    super.dispose();
  }

  bool get _isFrench => Localizations.localeOf(context).languageCode == 'fr';

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

  Future<void> _handleDetection(BarcodeCapture capture) async {
    if (_handlingScan || _isPaused) return;

    String? barcode;

    for (final item in capture.barcodes) {
      final value = item.rawValue?.trim();
      if (value != null && value.isNotEmpty) {
        barcode = value;
        break;
      }
    }

    if (barcode == null) return;

    setState(() {
      _handlingScan = true;
      _scanError = null;
    });

    try {
      final productName = await widget.onBarcodeDetected(barcode);

      if (!mounted) return;

      if (productName != null) {
        setState(() {
          _lastScannedProduct = productName;
          _lastScannedBarcode = barcode;
        });
      } else {
        setState(() {
          _scanError = _text(
            'Product not found: $barcode',
            'Produit introuvable : $barcode',
          );
        });
      }
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _scanError = _text(
          'Could not process this barcode.',
          'Impossible de traiter ce code-barres.',
        );
      });
    } finally {
      if (mounted) {
        await Future.delayed(const Duration(milliseconds: 900));
        if (mounted) {
          setState(() => _handlingScan = false);
        }
      }
    }
  }

  Future<void> _toggleScanner() async {
    if (_isPaused) {
      await _scannerController.start();
      if (mounted) setState(() => _isPaused = false);
    } else {
      await _scannerController.stop();
      if (mounted) setState(() => _isPaused = true);
    }
  }

  Future<void> _enterBarcodeManually() async {
    final textController = TextEditingController();

    final barcode = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(_text('Enter barcode', 'Saisir le code-barres')),
          content: TextField(
            controller: textController,
            autofocus: true,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              hintText: _text('Barcode number', 'Numéro du code-barres'),
              border: const OutlineInputBorder(),
            ),
            onSubmitted: (value) {
              Navigator.pop(dialogContext, value.trim());
            },
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(_text('Cancel', 'Annuler')),
            ),
            FilledButton(
              onPressed: () {
                Navigator.pop(dialogContext, textController.text.trim());
              },
              child: Text(_text('Continue', 'Continuer')),
            ),
          ],
        );
      },
    );

    textController.dispose();

    if (barcode != null && barcode.isNotEmpty) {
      await _handleManualBarcode(barcode);
    }
  }

  Future<void> _handleManualBarcode(String barcode) async {
    if (_handlingScan) return;

    setState(() {
      _handlingScan = true;
      _scanError = null;
    });

    try {
      final productName = await widget.onBarcodeDetected(barcode);

      if (!mounted) return;

      setState(() {
        if (productName != null) {
          _lastScannedProduct = productName;
          _lastScannedBarcode = barcode;
        } else {
          _scanError = _text(
            'Product not found: $barcode',
            'Produit introuvable : $barcode',
          );
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _scanError = _text(
          'Could not process this barcode.',
          'Impossible de traiter ce code-barres.',
        );
      });
    } finally {
      if (mounted) {
        setState(() => _handlingScan = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cart = CartScope.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final orange = const Color(0xFFF15A0A);
    final pageBackground = theme.scaffoldBackgroundColor;
    final muted = isDark ? const Color(0xFFAAA39B) : const Color(0xFF918A82);

    final statusColor = widget.isOnline == null
        ? muted
        : widget.isOnline!
        ? const Color(0xFF218653)
        : const Color(0xFFFFB74D);

    final statusText = widget.pendingSyncCount > 0
        ? _isFrench
              ? '${widget.pendingSyncCount} en attente'
              : '${widget.pendingSyncCount} pending'
        : widget.isOnline == null
        ? _text('Unknown', 'Inconnu')
        : widget.isOnline!
        ? _text('Online', 'En ligne')
        : _text('Offline', 'Hors ligne');

    return Scaffold(
      backgroundColor: pageBackground,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.cashierName,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontSize: 24,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    Container(
                      width: 11,
                      height: 11,
                      decoration: BoxDecoration(
                        color: statusColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      statusText,
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: muted,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
              ),

              // Camera preview and scanner controls
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      MobileScanner(
                        controller: _scannerController,
                        onDetect: _handleDetection,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error) {
                          return _cameraErrorView(theme);
                        },
                      ),

                      // Dark overlay and scanning guides
                      ColoredBox(color: Colors.black.withValues(alpha: 0.10)),

                      Positioned(
                        top: 10,
                        left: 0,
                        right: 0,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            _scannerAction(
                              icon: Icons.search,
                              onTap: widget.onSearchProduct,
                            ),
                            _scannerAction(
                              label: '123',
                              onTap: _enterBarcodeManually,
                            ),
                            _scannerAction(
                              icon: _isPaused ? Icons.play_arrow : Icons.pause,
                              onTap: _toggleScanner,
                            ),
                            const SizedBox(width: 18),
                          ],
                        ),
                      ),

                      Positioned(
                        top: 80,
                        left: 0,
                        right: 0,
                        child: Text(
                          _isPaused
                              ? _text('Scanner paused', 'Scanner en pause')
                              : _text(
                                  'Scan a barcode',
                                  'Scanner un code-barres',
                                ),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Color(0xFFD0CBC6),
                            fontSize: 18,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                      ),

                      Center(
                        child: SizedBox(
                          width: 320,
                          height: 200,
                          child: CustomPaint(painter: _ScannerFramePainter()),
                        ),
                      ),

                      if (_scanError != null)
                        Positioned(
                          left: 20,
                          right: 20,
                          bottom: 90,
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFF4B2525),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              _scanError!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),

                      // Last successfully scanned product
                      Positioned(
                        left: 14,
                        right: 14,
                        bottom: 14,
                        child: Container(
                          height: 54,
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          decoration: BoxDecoration(
                            color: const Color(0xFF292929),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.check,
                                color: Color(0xFF48D69A),
                                size: 27,
                              ),
                              const SizedBox(width: 15),
                              Expanded(
                                child: Text(
                                  _lastScannedProduct ??
                                      _text('Ready to scan', 'Prêt à scanner'),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 18,
                                  ),
                                ),
                              ),
                              if (_lastScannedProduct != null)
                                Text(
                                  '×1',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 19,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Cart and checkout buttons
              Row(
                children: [
                  GestureDetector(
                    onTap: widget.onOpenCart,
                    child: Container(
                      height: 70,
                      width: 100,
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: isDark ? Colors.white : Colors.black,
                          width: 2,
                        ),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.shopping_cart_outlined,
                            size: 24,
                            color: theme.colorScheme.onSurface,
                          ),
                          const SizedBox(width: 12),
                          Text(
                            '${cart.itemCount}',
                            style: TextStyle(
                              fontSize: 18,
                              color: theme.colorScheme.onSurface,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 18),
                  Expanded(
                    child: SizedBox(
                      height: 70,
                      child: FilledButton(
                        onPressed: cart.isEmpty ? null : widget.onCheckout,
                        style: FilledButton.styleFrom(
                          backgroundColor: orange,
                          disabledBackgroundColor: orange.withValues(
                            alpha: 0.4,
                          ),
                          foregroundColor: isDark ? Colors.black : Colors.white,
                          disabledForegroundColor: Colors.white70,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            '${_text('Charge', 'Encaisser')} · '
                            '${_formatMoney(cart.total)} FCFA',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _scannerAction({
    IconData? icon,
    String? label,
    required VoidCallback? onTap,
  }) {
    return SizedBox(
      width: 48,
      height: 44,
      child: IconButton(
        onPressed: onTap,
        tooltip: label,
        icon: label != null
            ? Text(
                label,
                style: const TextStyle(
                  color: Color(0xFFEAE6E2),
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              )
            : Icon(icon, color: const Color(0xFFEAE6E2), size: 25),
      ),
    );
  }

  Widget _cameraErrorView(ThemeData theme) {
    return Container(
      color: const Color(0xFF151515),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.no_photography_outlined,
            color: Colors.white70,
            size: 48,
          ),
          const SizedBox(height: 16),
          Text(
            _text(
              'Camera unavailable. Check camera permission.',
              'Caméra indisponible. Vérifiez son autorisation.',
            ),
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white70, fontSize: 16),
          ),
        ],
      ),
    );
  }
}

class _ScannerFramePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const color = Colors.white;
    const lineWidth = 4.0;
    const cornerLength = 48.0;
    const radius = 14.0;

    final paint = Paint()
      ..color = color
      ..strokeWidth = lineWidth
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.square;

    final path = Path();

    // Top-left
    path.moveTo(0, cornerLength);
    path.lineTo(0, radius);
    path.quadraticBezierTo(0, 0, radius, 0);
    path.lineTo(cornerLength, 0);

    // Top-right
    path.moveTo(size.width - cornerLength, 0);
    path.lineTo(size.width - radius, 0);
    path.quadraticBezierTo(size.width, 0, size.width, radius);
    path.lineTo(size.width, cornerLength);

    // Bottom-left
    path.moveTo(0, size.height - cornerLength);
    path.lineTo(0, size.height - radius);
    path.quadraticBezierTo(0, size.height, radius, size.height);
    path.lineTo(cornerLength, size.height);

    // Bottom-right
    path.moveTo(size.width - cornerLength, size.height);
    path.lineTo(size.width - radius, size.height);
    path.quadraticBezierTo(
      size.width,
      size.height,
      size.width,
      size.height - radius,
    );
    path.lineTo(size.width, size.height - cornerLength);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
