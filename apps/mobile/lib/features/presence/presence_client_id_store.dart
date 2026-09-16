import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stable per-install id used to de-duplicate online presence.
class PresenceClientIdStore {
  PresenceClientIdStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const String _key = 'lh_presence_client_id_v1';
  final FlutterSecureStorage _storage;

  Future<String> loadOrCreate() async {
    final String? existing = await _storage.read(key: _key);
    if (existing != null && existing.length >= 8) {
      return existing;
    }
    final String created = _secureId();
    await _storage.write(key: _key, value: created);
    return created;
  }

  static String _secureId() {
    final Random random = Random.secure();
    final StringBuffer buffer = StringBuffer();
    for (int i = 0; i < 16; i++) {
      buffer.write(random.nextInt(256).toRadixString(16).padLeft(2, '0'));
    }
    return buffer.toString();
  }
}
