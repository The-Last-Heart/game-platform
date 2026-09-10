import 'package:flutter/material.dart';

/// Full-screen background widget using the app background asset.
class LhBackground extends StatelessWidget {
  const LhBackground({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: <Widget>[
        Image.asset(
          'assets/backgrounds/app-background.png',
          fit: BoxFit.cover,
          errorBuilder:
              (BuildContext context, Object error, StackTrace? stackTrace) {
                // Graceful fallback if asset fails to load.
                return const ColoredBox(color: Color(0xFF030914));
              },
        ),
        child,
      ],
    );
  }
}
