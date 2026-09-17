import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'identity_store.dart';
import '../../presence/presence_client_id_store.dart';

/// Claims a globally unique display name for this install on the backend.
class PlayerClaimClient {
  PlayerClaimClient({PresenceClientIdStore? presenceClientIdStore})
    : _presenceClientIdStore =
          presenceClientIdStore ?? PresenceClientIdStore();

  final PresenceClientIdStore _presenceClientIdStore;

  /// Returns `null` on success, or an `errors.*` / `identity.*` translation key.
  Future<String?> claim({
    required String backendBaseUrl,
    required PlayerIdentity identity,
  }) async {
    final String base = backendBaseUrl.replaceAll(RegExp(r'/+$'), '');
    if (base.isEmpty) {
      return 'errors.service_unavailable';
    }
    final String playerId = await _presenceClientIdStore.loadOrCreate();
    final Uri uri = Uri.parse('$base/v1/players/claim');
    final HttpClient client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 12);
    try {
      final HttpClientRequest request = await client.postUrl(uri);
      request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      request.add(
        utf8.encode(
          jsonEncode(<String, String>{
            'playerId': playerId,
            'displayName': identity.displayName,
            'avatarColor': identity.avatarColor,
            'countryCode': identity.countryCode,
          }),
        ),
      );
      final HttpClientResponse response = await request.close().timeout(
        const Duration(seconds: 12),
      );
      final String body = await response.transform(utf8.decoder).join();
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return null;
      }
      if (response.statusCode == 409) {
        return 'errors.identity.name_taken';
      }
      try {
        final Object? decoded = jsonDecode(body);
        if (decoded is Map<String, dynamic>) {
          final Object? message = decoded['message'];
          if (message is Map<String, dynamic>) {
            final Object? key = message['key'];
            if (key is String && key.isNotEmpty) {
              return key;
            }
            final Object? code = message['code'];
            if (code == 'DISPLAY_NAME_TAKEN') {
              return 'errors.identity.name_taken';
            }
          }
        }
      } catch (_) {
        // Fall through to generic error.
      }
      return 'errors.service_unavailable';
    } on SocketException {
      return 'errors.offline';
    } on TimeoutException {
      return 'errors.connection_timeout';
    } catch (_) {
      return 'errors.service_unavailable';
    } finally {
      client.close(force: true);
    }
  }
}
