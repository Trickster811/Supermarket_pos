import 'package:supermarket_pos/features/products/product_model.dart';

class CartItem {
  final ProductModel product;
  final double quantity;

  const CartItem({required this.product, required this.quantity});

  bool get isWeighted => product.sellingMode == 'WEIGHT';

  double get subtotal => product.price * quantity;

  CartItem copyWith({double? quantity}) {
    return CartItem(product: product, quantity: quantity ?? this.quantity);
  }
}
