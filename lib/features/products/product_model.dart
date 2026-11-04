import 'dart:convert';

class ProductModel {
  final String id;
  final String sku;
  final String name;
  final String? description;
  final String? barcode;
  final String? pluCode;
  final String sellingMode;
  final String unitOfMeasure;
  final double price;
  final bool isActive;
  final bool trackInventory;
  final String? categoryId;
  final String? categoryName;

  const ProductModel({
    required this.id,
    required this.sku,
    required this.name,
    this.description,
    this.barcode,
    this.pluCode,
    required this.sellingMode,
    required this.unitOfMeasure,
    required this.price,
    required this.isActive,
    required this.trackInventory,
    this.categoryId,
    this.categoryName,
  });

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    final category = json['category'];

    return ProductModel(
      id: json['id'] as String,
      sku: json['sku'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      barcode: json['barcode'] as String?,
      pluCode: json['pluCode'] as String?,
      sellingMode: json['sellingMode'] as String,
      unitOfMeasure: json['unitOfMeasure'] as String,
      price: double.parse(json['price'].toString()),
      isActive: json['isActive'] as bool? ?? false,
      trackInventory: json['trackInventory'] as bool? ?? true,
      categoryId: json['categoryId'] as String?,
      categoryName: category is Map
          ? category['name'] as String?
          : null,
    );
  }

  factory ProductModel.fromJsonString(String jsonString) {
    return ProductModel.fromJson(
      Map<String, dynamic>.from(
        jsonDecode(jsonString) as Map,
      ),
    );
  }
}