import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

class ReceiptGenerator {
  ReceiptGenerator._();

  static const String storeName = 'TEXACO Center';
  static const String storeAddress = 'Ngaoundéré, Cameroun / Cameroon';

  // Add the real telephone number here when available.
  static const String storePhone = '';

  static Future<Uint8List> generate(
    Map<String, dynamic> sale, {
    double paperWidthMm = 80,
  }) async {
    final receipt = _asMap(sale['receipt']);
    final content = _asMap(receipt['content']);
    final payment = _asMap(content['payment']);

    final rawItems = content['items'] ?? sale['items'];

    final items = rawItems is List
        ? rawItems.map(_asMap).toList()
        : <Map<String, dynamic>>[];

    final receiptNumber =
        _firstValue([
          receipt['receiptNumber'],
          content['receiptNumber'],
          sale['receiptNumber'],
          sale['transactionUuid'],
        ]) ??
        'N/A';

    final dateValue = _firstValue([
      content['issuedAt'],
      receipt['issuedAt'],
      receipt['createdAt'],
      sale['createdAt'],
      sale['deviceCreatedAt'],
    ]);

    final date = _formatDate(dateValue);

    final paymentMethod =
        _firstValue([payment['method'], sale['paymentMethod']]) ?? 'N/A';

    final provider = _firstValue([
      payment['mobileMoneyProvider'],
      sale['mobileMoneyProvider'],
    ]);

    final total = _number(
      _firstValue([content['totalAmount'], sale['totalAmount']]),
    );

    final subtotalAmount = _number(
      _firstValue([content['subtotalAmount'], sale['subtotalAmount']]),
    );

    final taxAmount = _number(
      _firstValue([content['taxAmount'], sale['taxAmount']]),
    );

    final amountReceived = _number(payment['amountReceived']);

    final change = _number(payment['changeAmount']);

    final cashier = _firstValue([content['cashierId'], sale['cashierId']]);

    final terminalId = _firstValue([content['terminalId'], sale['terminalId']]);

    final width = paperWidthMm * PdfPageFormat.mm;

    // Estimate receipt height from the number of products.
    // Longer names may wrap, so some additional space is reserved.
    final estimatedHeight = (125 + (items.length * 24)) * PdfPageFormat.mm;

    final document = pw.Document();

    document.addPage(
      pw.Page(
        pageFormat: PdfPageFormat(
          width,
          estimatedHeight,
          marginAll: 4 * PdfPageFormat.mm,
        ),
        build: (context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: [
              _centerText(storeName, fontSize: 17, bold: true),
              pw.SizedBox(height: 3),
              _centerText('Ngaoundéré, Cameroun', fontSize: 8),
              if (storePhone.isNotEmpty) ...[
                pw.SizedBox(height: 2),
                _centerText('Tel: $storePhone', fontSize: 8),
              ],

              pw.SizedBox(height: 10),
              _separator(),

              _bilingualText(
                'REÇU',
                'RECEIPT',
                frenchSize: 11,
                englishSize: 9,
                bold: true,
                align: pw.TextAlign.center,
              ),

              pw.SizedBox(height: 6),
              _detailRow(
                _bilingualText(
                  'N° reçu',
                  'Receipt No.',
                  frenchSize: 8,
                  englishSize: 7,
                ),
                receiptNumber,
              ),

              _detailRow(
                _bilingualText('Date', 'Date', frenchSize: 8, englishSize: 7),
                date,
              ),

              if (cashier != null)
                _detailRow(
                  _bilingualText(
                    'Caissier',
                    'Cashier',
                    frenchSize: 8,
                    englishSize: 7,
                  ),
                  cashier,
                ),

              if (terminalId != null)
                _detailRow(
                  _bilingualText(
                    'Caisse',
                    'Cash Register',
                    frenchSize: 8,
                    englishSize: 7,
                  ),
                  terminalId,
                ),

              pw.SizedBox(height: 7),
              _separator(),

              // Product table header.
              pw.Row(
                children: [
                  pw.Expanded(
                    flex: 5,
                    child: _bilingualText(
                      'Article',
                      'Item',
                      frenchSize: 8,
                      englishSize: 6,
                      bold: true,
                    ),
                  ),
                  pw.Expanded(
                    flex: 2,
                    child: _bilingualText(
                      'Qté',
                      'Qty',
                      frenchSize: 8,
                      englishSize: 6,
                      bold: true,
                      align: pw.TextAlign.right,
                    ),
                  ),
                  pw.Expanded(
                    flex: 3,
                    child: _bilingualText(
                      'Total',
                      'Total',
                      frenchSize: 8,
                      englishSize: 6,
                      bold: true,
                      align: pw.TextAlign.right,
                    ),
                  ),
                ],
              ),
              _separator(),

              ...items.map((item) {
                final product = _asMap(item['product']);

                final name =
                    _firstValue([
                      item['productName'],
                      item['name'],
                      product['name'],
                    ]) ??
                    'Article / Item';

                final quantity = _number(_firstValue([item['quantity']]));

                final unitPrice = _number(
                  _firstValue([
                    item['unitPrice'],
                    item['price'],
                    product['price'],
                  ]),
                );

                final grossAmount = _number(
                  _firstValue([
                    item['grossAmount'],
                    item['lineTotal'],
                    item['total'],
                    item['subtotal'],
                  ]),
                );

                final unit = _firstValue([
                  item['unitOfMeasure'],
                  product['unitOfMeasure'],
                ]);

                final quantityLabel =
                    '${_formatQuantity(quantity)}'
                    '${unit == null ? '' : ' $unit'}';

                return pw.Padding(
                  padding: const pw.EdgeInsets.symmetric(vertical: 3),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                    children: [
                      pw.Text(name, style: const pw.TextStyle(fontSize: 8)),
                      pw.SizedBox(height: 2),
                      pw.Row(
                        children: [
                          pw.Expanded(
                            flex: 5,
                            child: _tableText(
                              '${_formatMoney(unitPrice)} / unité',
                            ),
                          ),
                          pw.Expanded(
                            flex: 2,
                            child: _tableText(
                              quantityLabel,
                              align: pw.TextAlign.right,
                            ),
                          ),
                          pw.Expanded(
                            flex: 3,
                            child: _tableText(
                              _formatMoney(grossAmount),
                              align: pw.TextAlign.right,
                              bold: true,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              }),

              _separator(),

              pw.SizedBox(height: 5),

              _detailRow(
                _bilingualText(
                  'Sous-total HT',
                  'Net subtotal',
                  frenchSize: 8,
                  englishSize: 7,
                ),
                _formatMoney(subtotalAmount),
              ),
              _detailRow(
                _bilingualText(
                  'TVA incluse',
                  'VAT included',
                  frenchSize: 8,
                  englishSize: 7,
                ),
                _formatMoney(taxAmount),
              ),

              pw.SizedBox(height: 3),

              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  _bilingualText(
                    'TOTAL À PAYER',
                    'TOTAL DUE',
                    frenchSize: 8,
                    englishSize: 7,
                  ),
                  pw.Text(
                    _formatMoney(total),
                    style: pw.TextStyle(
                      fontSize: 12,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                ],
              ),
              pw.SizedBox(height: 8),
              _separator(),

              _detailRow(
                _bilingualText(
                  'Mode de paiement',
                  'Payment method',
                  frenchSize: 8,
                  englishSize: 7,
                ),
                _paymentMethodLabel(paymentMethod, provider),
              ),

              if (paymentMethod.toUpperCase() == 'CASH' ||
                  paymentMethod.toUpperCase() == 'CASH_RECEIVED') ...[
                _detailRow(
                  _bilingualText(
                    'Montant reçu',
                    'Amount received',
                    frenchSize: 8,
                    englishSize: 7,
                  ),
                  _formatMoney(amountReceived),
                ),
                _detailRow(
                  _bilingualText(
                    'Monnaie rendue',
                    'Change',
                    frenchSize: 8,
                    englishSize: 7,
                  ),
                  _formatMoney(change),
                ),
              ],

              pw.SizedBox(height: 12),
              _separator(),
              _centerText('MERCI POUR VOTRE ACHAT', fontSize: 10, bold: true),
              pw.Text(
                'THANK YOU FOR SHOPPING WITH US',
                textAlign: pw.TextAlign.center,
                style: pw.TextStyle(
                  fontSize: 7,
                  fontStyle: pw.FontStyle.italic,
                  color: PdfColors.grey600,
                ),
              ),
              pw.SizedBox(height: 5),
              _bilingualText(
                'À bientôt !',
                'See you again!',
                frenchSize: 8,
                englishSize: 6,
                align: pw.TextAlign.center,
              ),
            ],
          );
        },
      ),
    );

    return document.save();
  }

  static pw.Widget _bilingualText(
    String french,
    String english, {
    double frenchSize = 8,
    double englishSize = 7,
    bool bold = false,
    pw.TextAlign align = pw.TextAlign.left,
  }) {
    return pw.Column(
      crossAxisAlignment: align == pw.TextAlign.center
          ? pw.CrossAxisAlignment.center
          : align == pw.TextAlign.right
          ? pw.CrossAxisAlignment.end
          : pw.CrossAxisAlignment.start,
      children: [
        pw.Text(
          french,
          textAlign: align,
          style: pw.TextStyle(
            fontSize: frenchSize,
            fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
            color: PdfColors.black,
          ),
        ),
        pw.Text(
          english,
          textAlign: align,
          style: pw.TextStyle(
            fontSize: englishSize,
            fontStyle: pw.FontStyle.italic,
            color: PdfColors.grey600,
          ),
        ),
      ],
    );
  }

  static pw.Widget _centerText(
    String value, {
    double fontSize = 8,
    bool bold = false,
  }) {
    return pw.Text(
      value,
      textAlign: pw.TextAlign.center,
      style: pw.TextStyle(
        fontSize: fontSize,
        fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
      ),
    );
  }

  static pw.Widget _tableText(
    String value, {
    bool bold = false,
    pw.TextAlign align = pw.TextAlign.left,
  }) {
    return pw.Text(
      value,
      textAlign: align,
      style: pw.TextStyle(
        fontSize: 7,
        fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
      ),
    );
  }

  static pw.Widget _detailRow(pw.Widget label, String value) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Expanded(child: label),
          pw.SizedBox(width: 5),
          pw.Text(
            value,
            textAlign: pw.TextAlign.right,
            style: const pw.TextStyle(fontSize: 8),
          ),
        ],
      ),
    );
  }

  static pw.Widget _separator() {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 4),
      child: pw.Container(height: 0.5, color: PdfColors.grey600),
    );
  }

  static Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return Map<String, dynamic>.from(value);
    }
    return {};
  }

  static String? _firstValue(List<dynamic> values) {
    for (final value in values) {
      if (value != null && value.toString().trim().isNotEmpty) {
        return value.toString();
      }
    }
    return null;
  }

  static double _number(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  static String _formatMoney(double value) {
    final fixed = value.toStringAsFixed(2);
    final parts = fixed.split('.');

    final amount = parts[0];
    final buffer = StringBuffer();

    for (var i = 0; i < amount.length; i++) {
      buffer.write(amount[i]);

      final remaining = amount.length - i - 1;
      if (remaining > 0 && remaining % 3 == 0) {
        buffer.write(' ');
      }
    }

    return '${buffer.toString()},${parts[1]} FCFA';
  }

  static String _formatQuantity(double value) {
    return value.toStringAsFixed(3).replaceFirst(RegExp(r'\.?0+$'), '');
  }

  static String _formatDate(dynamic value) {
    final date = value == null
        ? DateTime.now()
        : DateTime.tryParse(value.toString()) ?? DateTime.now();

    final local = date.toLocal();

    String twoDigits(int number) => number.toString().padLeft(2, '0');

    return '${twoDigits(local.day)}/'
        '${twoDigits(local.month)}/'
        '${local.year} '
        '${twoDigits(local.hour)}:${twoDigits(local.minute)}';
  }

  static String _paymentMethodLabel(String method, String? provider) {
    switch (method.toUpperCase()) {
      case 'CASH':
      case 'CASH_RECEIVED':
        return 'Espèces / Cash';

      case 'MOBILE_MONEY':
        if (provider == null) {
          return 'Mobile Money';
        }

        final normalized = provider.toUpperCase();

        if (normalized == 'MTN_MOMO') {
          return 'MTN Mobile Money';
        }

        if (normalized == 'ORANGE_MONEY') {
          return 'Orange Money';
        }

        return 'Mobile Money';

      default:
        return method;
    }
  }
}
