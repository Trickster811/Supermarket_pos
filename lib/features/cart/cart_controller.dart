import 'package:flutter/foundation.dart';
import 'package:supermarket_pos/features/cart/cart_item.dart';
import 'package:supermarket_pos/features/products/product_model.dart';

class CartController extends ChangeNotifier {
  final Map<String, CartItem> _items = {};

  List<CartItem> get items => List.unmodifiable(_items.values);

  int get itemCount => _items.length;

  double get total {
    return _items.values.fold(0, (sum, item) => sum + item.subtotal);
  }

  bool get isEmpty => _items.isEmpty;

  void addProduct(ProductModel product, {required double quantity}) {
    if (!quantity.isFinite || quantity <= 0) {
      throw ArgumentError('Quantity must be greater than zero.');
    }

    if (product.sellingMode == 'UNIT' && (quantity % 1 != 0)) {
      throw ArgumentError('Unit products require whole quantities.');
    }

    final existing = _items[product.id];

    if (existing != null) {
      _items[product.id] = existing.copyWith(
        quantity: existing.quantity + quantity,
      );
    } else {
      _items[product.id] = CartItem(product: product, quantity: quantity);
    }

    notifyListeners();
  }

  void updateQuantity(String productId, double quantity) {
    final item = _items[productId];

    if (item == null) return;

    if (!quantity.isFinite || quantity <= 0) {
      removeProduct(productId);
      return;
    }

    if (item.product.sellingMode == 'UNIT' && quantity % 1 != 0) {
      throw ArgumentError('Unit products require whole quantities.');
    }

    _items[productId] = item.copyWith(quantity: quantity);
    notifyListeners();
  }

  void removeProduct(String productId) {
    _items.remove(productId);
    notifyListeners();
  }

  void clear() {
    _items.clear();
    notifyListeners();
  }
}
