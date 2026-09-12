import 'package:flutter/material.dart';

/// Full-screen background widget using the app background asset.
class LhBackground extends StatelessWidget {
  const LhBackground({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final TextStyle defaultStyle =
        Theme.of(context).textTheme.bodyLarge ??
        const TextStyle(color: Color(0xFFF7FAFC), fontSize: 16);

    return Stack(
      fit: StackFit.expand,
      children: <Widget>[
        Image.asset(
          'assets/backgrounds/app-background.png',
          fit: BoxFit.cover,
          errorBuilder:
              (BuildContext context, Object error, StackTrace? stackTrace) {
                return const ColoredBox(color: Color(0xFF030914));
              },
        ),
        Material(
          type: MaterialType.transparency,
          child: DefaultTextStyle.merge(
            style: defaultStyle,
            child: child,
          ),
        ),
      ],
    );
  }
}
