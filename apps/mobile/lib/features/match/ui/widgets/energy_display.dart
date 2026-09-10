import 'package:flutter/material.dart';

import '../../../../theme/lh_tokens.dart';

/// Displays the player's energy count.
class EnergyDisplay extends StatelessWidget {
  const EnergyDisplay({required this.energy, super.key});

  final int energy;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$energy energy',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Icon(Icons.bolt, color: LhColors.warning, size: 24),
          const SizedBox(width: 4),
          Text(
            '$energy',
            style: Theme.of(
              context,
            ).textTheme.labelLarge?.copyWith(color: LhColors.warning),
          ),
        ],
      ),
    );
  }
}
