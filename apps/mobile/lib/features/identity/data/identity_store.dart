import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'countries.dart';
import 'display_name_moderation.dart';
import 'app_package_info.dart';

/// Lightweight local player identity for RC1 (no consumer auth).
@immutable
class PlayerIdentity {
  const PlayerIdentity({
    required this.displayName,
    required this.avatarColor,
    required this.countryCode,
  });

  final String displayName;
  final String avatarColor;
  final String countryCode;

  Map<String, dynamic> toCommandPayload({
    required String playerId,
    ClientRuntimeMetadata? runtime,
  }) =>
      <String, dynamic>{
        'displayName': displayName,
        'avatarColor': avatarColor,
        'countryCode': countryCode,
        'playerId': playerId,
        if (runtime != null) ...runtime.toJson(),
      };

  PlayerIdentity copyWith({
    String? displayName,
    String? avatarColor,
    String? countryCode,
  }) {
    return PlayerIdentity(
      displayName: displayName ?? this.displayName,
      avatarColor: avatarColor ?? this.avatarColor,
      countryCode: countryCode ?? this.countryCode,
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
      final Map<String, dynamic> json = jsonDecode(raw) as Map<String, dynamic>;
      final String? name = json['displayName'] as String?;
      final String? color = json['avatarColor'] as String?;
      final String? country = json['countryCode'] as String?;
      if (name == null ||
          color == null ||
          country == null ||
          !isPlayerCountryCode(country) ||
          !isValidDisplayNameFormat(name)) {
        return null;
      }
      return PlayerIdentity(
        displayName: normalizeDisplayNameFormat(name),
        avatarColor: color,
        countryCode: country,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> save(PlayerIdentity identity) async {
    await _storage.write(
      key: _key,
      value: jsonEncode(<String, String>{
        'displayName': normalizeDisplayNameFormat(identity.displayName),
        'avatarColor': identity.avatarColor,
        'countryCode': identity.countryCode,
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

/// In-memory identity for widget/unit tests.
class MemoryIdentityStore extends IdentityStore {
  MemoryIdentityStore({this.identity});

  PlayerIdentity? identity;

  @override
  Future<PlayerIdentity?> load() async => identity;

  @override
  Future<void> save(PlayerIdentity identity) async {
    this.identity = identity;
  }
}

/// In-memory onboarding flag for widget/unit tests.
class MemoryEntryPreferencesStore extends EntryPreferencesStore {
  MemoryEntryPreferencesStore({this.completed = false});

  bool completed;

  @override
  Future<bool> isOnboardingCompleted() async => completed;

  @override
  Future<void> setOnboardingCompleted(bool value) async {
    completed = value;
  }
}
