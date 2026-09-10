import 'package:flutter/material.dart';

import '../../../../theme/lh_tokens.dart';

/// Displays a row of heart icons indicating remaining lives.
class HeartsDisplay extends StatelessWidget {
  const HeartsDisplay({required this.hearts, this.maxHearts = 3, super.key});

  final int hearts;
  final int maxHearts;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$hearts hearts remaining',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List<Widget>.generate(maxHearts, (int index) {
          final bool filled = index < hearts;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Icon(
              filled ? Icons.favorite : Icons.favorite_border,
              color: filled ? LhColors.primary : LhColors.disabled,
              size: 28,
            ),
          );
        }),
      ),
    );
  }
}
