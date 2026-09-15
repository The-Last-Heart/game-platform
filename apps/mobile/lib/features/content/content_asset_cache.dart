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
  final Map<String, _AssetMeta> _manifest = <String, _AssetMeta>{};
  String? _baseUrl;
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

  /// Ensures [assetId] is on disk, re-fetching from the last synced backend if needed.
  Future<File?> ensureAsset(String assetId) async {
    final File? existing = await localFile(assetId);
    if (existing != null) {
      final _AssetMeta? meta = _manifest[assetId];
      if (meta == null || await existing.length() == meta.bytes) {
        return existing;
      }
    }
    final String? base = _baseUrl;
    final _AssetMeta? meta = _manifest[assetId];
    if (base == null || meta == null) {
      return existing;
    }
    final HttpClient client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 12);
    try {
      return await _downloadAsset(client, base, meta);
    } catch (error, stack) {
      debugPrint('ContentAssetCache ensureAsset $assetId failed: $error\n$stack');
      return existing;
    } finally {
      client.close(force: true);
    }
  }

  /// Sync pinned content pack from [backendBaseUrl].
  /// Returns true only when every manifest asset is present and verified.
  Future<bool> sync({
    required String backendBaseUrl,
    void Function(double progress)? onProgress,
  }) async {
    final String base = backendBaseUrl.replaceAll(RegExp(r'/+$'), '');
    _baseUrl = base;
    try {
      onProgress?.call(0.05);
      final HttpClient client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 12);
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
      final List<_AssetMeta> assets = <_AssetMeta>[];
      for (final Object? entry in assetsRaw) {
        if (entry is! Map) continue;
        final Map<String, dynamic> meta = entry.map(
          (Object? k, Object? v) => MapEntry(k.toString(), v),
        );
        final String? assetId = meta['assetId'] as String?;
        final String? sha256Hex = meta['sha256'] as String?;
        final int? bytes = (meta['bytes'] as num?)?.toInt();
        if (assetId == null || sha256Hex == null || bytes == null) {
          continue;
        }
        final _AssetMeta parsed = _AssetMeta(
          assetId: assetId,
          sha256Hex: sha256Hex,
          bytes: bytes,
        );
        assets.add(parsed);
        _manifest[assetId] = parsed;
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

      for (int pass = 0; pass < 2; pass++) {
        for (int i = 0; i < assets.length; i++) {
          final _AssetMeta meta = assets[i];
          final File out = File('${assetsDir.path}/${meta.assetId}.bin');
          final File? mem = _byId[meta.assetId];
          if (mem != null &&
              await mem.exists() &&
              await mem.length() == meta.bytes) {
            final Digest digest = sha256.convert(await mem.readAsBytes());
            if (digest.toString() == meta.sha256Hex) {
              onProgress?.call((i + 1) / assets.length);
              continue;
            }
          }
          final bool reuse =
              await out.exists() && await out.length() == meta.bytes;
          if (reuse) {
            final Digest digest = sha256.convert(await out.readAsBytes());
            if (digest.toString() == meta.sha256Hex) {
              _byId[meta.assetId] = out;
              onProgress?.call((i + 1) / assets.length);
              continue;
            }
          }
          _byId.remove(meta.assetId);
          try {
            await _downloadAsset(client, base, meta);
          } catch (error) {
            debugPrint('ContentAssetCache asset ${meta.assetId}: $error');
          }
          onProgress?.call((i + 1) / assets.length);
        }
        if (assets.every((m) => _byId.containsKey(m.assetId))) {
          break;
        }
      }

      client.close(force: true);
      _ready = assets.every((m) => _byId.containsKey(m.assetId));
      if (!_ready) {
        final List<String> missing = assets
            .where((m) => !_byId.containsKey(m.assetId))
            .map((m) => m.assetId)
            .toList();
        debugPrint('ContentAssetCache incomplete pack, missing: $missing');
      }
      onProgress?.call(1);
      return _ready;
    } catch (error, stack) {
      debugPrint('ContentAssetCache sync failed: $error\n$stack');
      onProgress?.call(1);
      return false;
    }
  }

  Future<File> _downloadAsset(
    HttpClient client,
    String base,
    _AssetMeta meta,
  ) async {
    final Directory root = await _ensureRoot();
    final File out = File('${root.path}/assets/${meta.assetId}.bin');
    final Uri assetUri = Uri.parse(
      '$base/v1/content/pack/assets/${Uri.encodeComponent(meta.assetId)}',
    );
    final HttpClientRequest req = await client.getUrl(assetUri);
    final HttpClientResponse res = await req.close();
    if (res.statusCode != 200) {
      throw StateError('HTTP ${res.statusCode}');
    }
    final BytesBuilder builder = BytesBuilder(copy: false);
    await for (final List<int> chunk in res) {
      builder.add(chunk);
    }
    final Uint8List body = builder.takeBytes();
    if (body.lengthInBytes != meta.bytes) {
      throw StateError(
        'size mismatch (${body.lengthInBytes} != ${meta.bytes})',
      );
    }
    final Digest digest = sha256.convert(body);
    if (digest.toString() != meta.sha256Hex) {
      throw StateError('hash mismatch');
    }
    await out.writeAsBytes(body, flush: true);
    _byId[meta.assetId] = out;
    return out;
  }
}

class _AssetMeta {
  const _AssetMeta({
    required this.assetId,
    required this.sha256Hex,
    required this.bytes,
  });

  final String assetId;
  final String sha256Hex;
  final int bytes;
}
