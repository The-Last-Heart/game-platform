import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Lightweight local player identity for RC1 (no consumer auth).
@immutable
class PlayerIdentity {
  const PlayerIdentity({
    required this.displayName,
    required this.avatarColor,
  });

  final String displayName;
  final String avatarColor;

  Map<String, dynamic> toCommandPayload() => <String, dynamic>{
    'displayName': displayName,
    'avatarColor': avatarColor,
  };

  PlayerIdentity copyWith({String? displayName, String? avatarColor}) {
    return PlayerIdentity(
      displayName: displayName ?? this.displayName,
      avatarColor: avatarColor ?? this.avatarColor,
    );
  }
}

/// Approved abstract avatar colors from the reference language.
const List<String> kApprovedAvatarColors = <String>[
  '#FF3045',
  '#22E7F2',
  '#FFC247',
  '#4C8DFF',
  '#B36BFF',
  '#3DDC97',
];

class IdentityStore {
  IdentityStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const String _key = 'lh_player_identity_v1';
  final FlutterSecureStorage _storage;

  Future<PlayerIdentity?> load() async {
    final String? raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) {
      return null;
    }
    try {
      final Map<String, dynamic> json =
          jsonDecode(raw) as Map<String, dynamic>;
      final String? name = json['displayName'] as String?;
      final String? color = json['avatarColor'] as String?;
      if (name == null || name.trim().length < 2 || color == null) {
        return null;
      }
      return PlayerIdentity(displayName: name.trim(), avatarColor: color);
    } catch (_) {
      return null;
    }
  }

  Future<void> save(PlayerIdentity identity) async {
    await _storage.write(
      key: _key,
      value: jsonEncode(<String, String>{
        'displayName': identity.displayName.trim(),
        'avatarColor': identity.avatarColor,
      }),
    );
  }
}

class EntryPreferencesStore {
  EntryPreferencesStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const String _onboardingKey = 'lh_onboarding_completed_v1';
  final FlutterSecureStorage _storage;

  Future<bool> isOnboardingCompleted() async {
    final String? raw = await _storage.read(key: _onboardingKey);
    return raw == '1';
  }

  Future<void> setOnboardingCompleted(bool value) async {
    await _storage.write(key: _onboardingKey, value: value ? '1' : '0');
  }
}
