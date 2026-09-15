import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// Downloads and caches server content-pack assets (challenge SFX, etc.).
///
/// Challenge assets must never be embedded in the app bundle — only chrome UI
/// sounds (e.g. [LhUiSound]) may ship with the APK.
class ContentAssetCache {
  ContentAssetCache._();

  static final ContentAssetCache instance = ContentAssetCache._();

  Directory? _root;
  final Map<String, File> _byId = <String, File>{};
  bool _ready = false;

  bool get isReady => _ready;

  Future<Directory> _ensureRoot() async {
    final Directory? existing = _root;
    if (existing != null) return existing;
    final Directory support = await getApplicationSupportDirectory();
    final Directory root = Directory('${support.path}/content-pack');
    if (!await root.exists()) {
      await root.create(recursive: true);
    }
    _root = root;
    return root;
  }

  /// Local cached file for [assetId], or null if not synced yet.
  Future<File?> localFile(String assetId) async {
    final File? cached = _byId[assetId];
    if (cached != null && await cached.exists()) return cached;
    final Directory root = await _ensureRoot();
    final File file = File('${root.path}/assets/$assetId.bin');
    if (await file.exists()) {
      _byId[assetId] = file;
      return file;
    }
    return null;
  }

  /// Sync pinned content pack from [backendBaseUrl]. Fail-soft: returns false
  /// on network errors so the app can continue with haptic-only fallbacks.
  Future<bool> sync({
    required String backendBaseUrl,
    void Function(double progress)? onProgress,
  }) async {
    final String base = backendBaseUrl.replaceAll(RegExp(r'/+$'), '');
    try {
      onProgress?.call(0.05);
      final HttpClient client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 8);
      final Uri manifestUri = Uri.parse('$base/v1/content/pack/manifest');
      final HttpClientRequest manifestReq = await client.getUrl(manifestUri);
      final HttpClientResponse manifestRes = await manifestReq.close();
      if (manifestRes.statusCode != 200) {
        debugPrint('ContentAssetCache manifest HTTP ${manifestRes.statusCode}');
        client.close(force: true);
        return false;
      }
      final String manifestBody = await manifestRes.transform(utf8.decoder).join();
      final Object? decoded = jsonDecode(manifestBody);
      if (decoded is! Map<String, dynamic>) {
        client.close(force: true);
        return false;
      }
      final Object? assetsRaw = decoded['assets'];
      if (assetsRaw is! List) {
        client.close(force: true);
        return false;
      }
      final List<Map<String, dynamic>> assets = <Map<String, dynamic>>[];
      for (final Object? entry in assetsRaw) {
        if (entry is Map) {
          assets.add(
            entry.map(
              (Object? k, Object? v) => MapEntry(k.toString(), v),
            ),
          );
        }
      }
      if (assets.isEmpty) {
        client.close(force: true);
        _ready = true;
        onProgress?.call(1);
        return true;
      }

      final Directory root = await _ensureRoot();
      final Directory assetsDir = Directory('${root.path}/assets');
      if (!await assetsDir.exists()) {
        await assetsDir.create(recursive: true);
      }

      for (int i = 0; i < assets.length; i++) {
        final Map<String, dynamic> meta = assets[i];
        final String? assetId = meta['assetId'] as String?;
        final String? sha256Hex = meta['sha256'] as String?;
        final int? bytes = (meta['bytes'] as num?)?.toInt();
        if (assetId == null || sha256Hex == null || bytes == null) {
          continue;
        }
        final File out = File('${assetsDir.path}/$assetId.bin');
        final bool reuse = await out.exists() && await out.length() == bytes;
        if (reuse) {
          final Digest digest = sha256.convert(await out.readAsBytes());
          if (digest.toString() == sha256Hex) {
            _byId[assetId] = out;
            onProgress?.call((i + 1) / assets.length);
            continue;
          }
        }

        final Uri assetUri = Uri.parse(
          '$base/v1/content/pack/assets/${Uri.encodeComponent(assetId)}',
        );
        final HttpClientRequest req = await client.getUrl(assetUri);
        final HttpClientResponse res = await req.close();
        if (res.statusCode != 200) {
          debugPrint('ContentAssetCache asset $assetId HTTP ${res.statusCode}');
          continue;
        }
        final BytesBuilder builder = BytesBuilder(copy: false);
        await for (final List<int> chunk in res) {
          builder.add(chunk);
        }
        final Uint8List body = builder.takeBytes();
        if (body.lengthInBytes != bytes) {
          debugPrint(
            'ContentAssetCache size mismatch for $assetId '
            '(${body.lengthInBytes} != $bytes)',
          );
          continue;
        }
        final Digest digest = sha256.convert(body);
        if (digest.toString() != sha256Hex) {
          debugPrint('ContentAssetCache hash mismatch for $assetId');
          continue;
        }
        await out.writeAsBytes(body, flush: true);
        _byId[assetId] = out;
        onProgress?.call((i + 1) / assets.length);
      }

      client.close(force: true);
      _ready = _byId.isNotEmpty;
      onProgress?.call(1);
      return _ready;
    } catch (error, stack) {
      debugPrint('ContentAssetCache sync failed: $error\n$stack');
      onProgress?.call(1);
      return false;
    }
  }
}
