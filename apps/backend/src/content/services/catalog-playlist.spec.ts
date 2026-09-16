import {
  isLiveCatalogEntry,
  pinApprovedVersionInCatalog,
} from './catalog-playlist';

describe('pinApprovedVersionInCatalog', () => {
  const live = {
    templateVersionId: '11111111-1111-4111-8111-111111111111',
    definitionId: 'precision.neon_cable.dev',
    weight: 100,
    repetitionCooldownRounds: 1,
    paused: false,
  };
  const other = {
    templateVersionId: '22222222-2222-4222-8222-222222222222',
    definitionId: 'gesture.fog_wipe.dev',
    weight: 80,
    repetitionCooldownRounds: 0,
    paused: false,
  };
  const revised = {
    ...live,
    templateVersionId: '33333333-3333-4333-8333-333333333333',
  };

  it('swaps the live pin for an already-catalogued definition', () => {
    const result = pinApprovedVersionInCatalog([live, other], revised);
    expect(result.changed).toBe(true);
    expect(result.replaced).toBe(true);
    expect(result.entries[0]?.templateVersionId).toBe(
      revised.templateVersionId,
    );
    expect(result.entries[0]?.weight).toBe(100);
    expect(result.entries[1]).toEqual(other);
  });

  it('does not append a missing definition unless asked', () => {
    const result = pinApprovedVersionInCatalog([other], revised);
    expect(result.changed).toBe(false);
    expect(result.replaced).toBe(false);
    expect(result.entries).toEqual([other]);
  });

  it('appends a missing definition when publishing explicitly', () => {
    const result = pinApprovedVersionInCatalog([other], revised, {
      appendIfMissing: true,
    });
    expect(result.changed).toBe(true);
    expect(result.replaced).toBe(false);
    expect(result.entries).toEqual([other, revised]);
  });

  it('is a no-op when the same version is already pinned', () => {
    const result = pinApprovedVersionInCatalog([live], live);
    expect(result.changed).toBe(false);
    expect(result.replaced).toBe(true);
    expect(result.entries).toEqual([live]);
  });
});

describe('isLiveCatalogEntry', () => {
  it('serves only currently published templates', () => {
    expect(
      isLiveCatalogEntry({ templateStatus: 'published', entryPaused: false }),
    ).toBe(true);
    expect(isLiveCatalogEntry({ templateStatus: 'approved' })).toBe(false);
    expect(isLiveCatalogEntry({ templateStatus: 'paused' })).toBe(false);
    expect(isLiveCatalogEntry({ templateStatus: 'retired' })).toBe(false);
    expect(isLiveCatalogEntry({ templateStatus: null })).toBe(false);
  });

  it('honors an explicit catalog-entry pause', () => {
    expect(
      isLiveCatalogEntry({ templateStatus: 'published', entryPaused: true }),
    ).toBe(false);
  });
});
