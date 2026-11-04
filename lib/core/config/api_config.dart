class ApiConfig {
  ApiConfig._();

  static const String emulatorUrl = 'http://10.0.2.2:3000';
  static const String physicalDeviceUrl = 'http://10.181.28.48:3000';

  static const String baseUrl = physicalDeviceUrl; // Switch to physicalDeviceUrl when testing on a physical device

  static const Duration connectionTimeout = Duration(seconds: 10);

  static const Duration receiveTimeout = Duration(seconds: 15);
}
