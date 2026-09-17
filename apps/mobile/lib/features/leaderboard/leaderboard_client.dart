import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// One ranked row from `GET /v1/leaderboard`.
@immutable
class LeaderboardEntry {
  const LeaderboardEntry({
    required this.rank,
    required this.displayName,
    required this.countryCode,
    required this.avatarColor,
    required this.totalPoints,
    required this.challengesPlayed,
    required this.playlistsCompleted,
  });

  final int rank;
  final String displayName;
  final String countryCode;
  final String avatarColor;
  final int totalPoints;
  final int challengesPlayed;
  final int playlistsCompleted;

  factory LeaderboardEntry.fromJson(Map<String, dynamic> json) {
    return LeaderboardEntry(
      rank: (json['rank'] as num).toInt(),
      displayName: json['displayName'] as String,
      countryCode: json['countryCode'] as String,
      avatarColor: json['avatarColor'] as String,
      totalPoints: (json['totalPoints'] as num).toInt(),
      challengesPlayed: (json['challengesPlayed'] as num?)?.toInt() ?? 0,
      playlistsCompleted: (json['playlistsCompleted'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Fetches the public Quick Survival top-100 leaderboard.
class LeaderboardClient {
  Future<List<LeaderboardEntry>> fetchTop({
    required String backendBaseUrl,
    int limit = 100,
  }) async {
    final String base = backendBaseUrl.replaceAll(RegExp(r'/+$'), '');
    final Uri uri = Uri.parse('$base/v1/leaderboard').replace(
      queryParameters: <String, String>{'limit': '$limit'},
    );
    final HttpClient client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 12);
    try {
      final HttpClientRequest request = await client.getUrl(uri);
      final HttpClientResponse response = await request.close().timeout(
        const Duration(seconds: 12),
      );
      final String body = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StateError('leaderboard_http_${response.statusCode}');
      }
      final Object? decoded = jsonDecode(body);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('leaderboard_invalid_body');
      }
      final Object? entries = decoded['entries'];
      if (entries is! List<dynamic>) {
        throw const FormatException('leaderboard_missing_entries');
      }
      return entries
          .map(
            (Object? row) =>
                LeaderboardEntry.fromJson(row as Map<String, dynamic>),
          )
          .toList(growable: false);
    } finally {
      client.close(force: true);
    }
  }
}
