import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Abstract session persistence for match resume credentials.
abstract class SessionStore {
  Future<void> save(SessionData data);

  Future<SessionData?> load();
  Future<void> clear();
}

/// Persisted session data as one atomic record.
class SessionData {
  const SessionData({
    required this.matchId,
    required this.playerId,
    required this.resumeToken,
    this.pendingResumeCommandId,
  });

  final String matchId;
  final String playerId;
  final String resumeToken;

  /// Stable commandId for the in-flight logical resume attempt, if any.
  final String? pendingResumeCommandId;

  SessionData copyWith({
    String? matchId,
    String? playerId,
    String? resumeToken,
    String? Function()? pendingResumeCommandId,
  }) {
    return SessionData(
      matchId: matchId ?? this.matchId,
      playerId: playerId ?? this.playerId,
      resumeToken: resumeToken ?? this.resumeToken,
      pendingResumeCommandId: pendingResumeCommandId != null
          ? pendingResumeCommandId()
          : this.pendingResumeCommandId,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'matchId': matchId,
    'playerId': playerId,
    'resumeToken': resumeToken,
    if (pendingResumeCommandId != null)
      'pendingResumeCommandId': pendingResumeCommandId,
  };

  factory SessionData.fromJson(Map<String, dynamic> json) {
    return SessionData(
      matchId: json['matchId'] as String,
      playerId: json['playerId'] as String,
      resumeToken: json['resumeToken'] as String,
      pendingResumeCommandId: json['pendingResumeCommandId'] as String?,
    );
  }
}

/// Production [SessionStore] backed by flutter_secure_storage.
///
/// Stores one JSON-encoded record so match/player/token/pending-command
/// cannot partially rotate across crashes.
class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const String _sessionKey = 'lh_session_v1';

  // Legacy multi-key layout from LH-003A — cleared on migrate/load.
  static const String _legacyMatchIdKey = 'lh_match_id';
  static const String _legacyPlayerIdKey = 'lh_player_id';
  static const String _legacyResumeTokenKey = 'lh_resume_token';

  @override
  Future<void> save(SessionData data) async {
    await _storage.write(key: _sessionKey, value: jsonEncode(data.toJson()));
    await _clearLegacyKeys();
  }

  @override
  Future<SessionData?> load() async {
    final String? encoded = await _storage.read(key: _sessionKey);
    if (encoded != null && encoded.isNotEmpty) {
      try {
        final Object? decoded = jsonDecode(encoded);
        if (decoded is Map<String, dynamic>) {
          return SessionData.fromJson(decoded);
        }
        if (decoded is Map) {
          return SessionData.fromJson(Map<String, dynamic>.from(decoded));
        }
      } on FormatException {
        await clear();
        return null;
      }
    }

    // One-time migrate from LH-003A three-key layout.
    final String? matchId = await _storage.read(key: _legacyMatchIdKey);
    final String? playerId = await _storage.read(key: _legacyPlayerIdKey);
    final String? resumeToken = await _storage.read(key: _legacyResumeTokenKey);
    if (matchId != null && playerId != null && resumeToken != null) {
      final SessionData migrated = SessionData(
        matchId: matchId,
        playerId: playerId,
        resumeToken: resumeToken,
      );
      await save(migrated);
      return migrated;
    }
    return null;
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _sessionKey);
    await _clearLegacyKeys();
  }

  Future<void> _clearLegacyKeys() async {
    await _storage.delete(key: _legacyMatchIdKey);
    await _storage.delete(key: _legacyPlayerIdKey);
    await _storage.delete(key: _legacyResumeTokenKey);
  }
}

/// In-memory [SessionStore] for tests.
class MemorySessionStore implements SessionStore {
  SessionData? _data;

  @override
  Future<void> save(SessionData data) async {
    _data = data;
  }

  @override
  Future<SessionData?> load() async => _data;

  @override
  Future<void> clear() async {
    _data = null;
  }
}
