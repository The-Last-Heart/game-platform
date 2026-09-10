/**
 * Contract package entry.
 *
 * Real-time protocol schemas for LH-002 live under realtime/v1.
 * Flutter/Dart clients should consume generated bindings in a later milestone;
 * do not hand-maintain divergent copies.
 */
export const CONTRACTS_PACKAGE_VERSION = '0.0.0' as const;

export type ContractsPackageMeta = {
  readonly name: '@thelastheart/contracts';
  readonly version: typeof CONTRACTS_PACKAGE_VERSION;
};

export const contractsPackageMeta: ContractsPackageMeta = {
  name: '@thelastheart/contracts',
  version: CONTRACTS_PACKAGE_VERSION,
};

export * from './realtime/v1/protocol';
