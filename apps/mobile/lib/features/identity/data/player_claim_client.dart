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
      final String? fromBody = claimErrorKeyFromBody(body);
      if (fromBody != null) {
        return fromBody;
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

/// Maps Nest claim-error JSON to a catalog key.
///
/// Accepts both top-level `{ code, key }` (current API) and nested
/// `{ message: { code, key } }` shapes.
String? claimErrorKeyFromBody(String body) {
  try {
    final Object? decoded = jsonDecode(body);
    if (decoded is! Map) {
      return null;
    }
    final Map<Object?, Object?> root = decoded;
    final Object? nested = root['message'];
    final Map<Object?, Object?> payload = nested is Map
        ? nested
        : root;

    final Object? key = payload['key'] ?? root['key'];
    if (key is String && key.isNotEmpty) {
      return key;
    }

    final Object? code = payload['code'] ?? root['code'];
    switch (code) {
      case 'DISPLAY_NAME_TAKEN':
        return 'errors.identity.name_taken';
      case 'DISPLAY_NAME_PROHIBITED':
        return 'errors.identity.name_prohibited';
      case 'DISPLAY_NAME_INVALID':
        return 'errors.identity.name_invalid';
      default:
        return null;
    }
  } catch (_) {
    return null;
  }
}
