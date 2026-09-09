/**
 * Contract package entry.
 *
 * LH-001 ships only the package foundation. Gameplay events and challenge
 * payloads are intentionally not defined yet.
 */
export const CONTRACTS_PACKAGE_VERSION = "0.0.0" as const;

export type ContractsPackageMeta = {
  readonly name: "@thelastheart/contracts";
  readonly version: typeof CONTRACTS_PACKAGE_VERSION;
};

export const contractsPackageMeta: ContractsPackageMeta = {
  name: "@thelastheart/contracts",
  version: CONTRACTS_PACKAGE_VERSION,
};
