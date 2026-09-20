import {
  VERTICAL_REFLECTION_TEMPLATE_IDS,
  VERTICAL_REFLECTION_GEOMETRY_TOLERANCE,
  buildDefaultVerticalReflectionBank,
  buildVerticalReflectionTemplateCatalog,
  canonicalizeShape,
  cloneShape,
  generateVerticalReflectionCandidates,
  getVerticalReflectionTemplate,
  isVerticallySymmetric,
  listVerticalReflectionTemplateIds,
  markersLieInsideSilhouette,
  materializeVerticalReflectionQuestion,
  polygonArea,
  reflectPointVertical,
  reflectShapeHorizontal,
  reflectShapeVertical,
  rotateShape180,
  shapesEqual,
  validateReflectionShape,
} from '@thelastheart/contracts';

describe('vertical reflection geometry', () => {
  it('exposes at least 12 distinct templates and is not arrow-only', () => {
    const ids = listVerticalReflectionTemplateIds();
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(ids).toEqual([...VERTICAL_REFLECTION_TEMPLATE_IDS]);
    const catalog = buildVerticalReflectionTemplateCatalog();
    const canons = new Set(ids.map((id) => canonicalizeShape(catalog[id]!)));
    expect(canons.size).toBe(ids.length);
    expect(ids.filter((id) => id === 'asymmetric_arrow_notch')).toHaveLength(1);
  });

  it('reflects points, polygons, and markers across the vertical axis', () => {
    expect(reflectPointVertical({ x: 0.2, y: 0.4 })).toEqual({
      x: 0.8,
      y: 0.4,
    });
    const source = getVerticalReflectionTemplate('asymmetric_arrow_notch');
    const reflected = reflectShapeVertical(source);
    expect(reflected.markers[0]!.center.x).toBeCloseTo(
      1 - source.markers[0]!.center.x,
      6,
    );
    expect(reflected.markers[0]!.center.y).toBeCloseTo(
      source.markers[0]!.center.y,
      6,
    );
    expect(polygonArea(reflected.polygons[0]!.points)).toBeCloseTo(
      polygonArea(source.polygons[0]!.points),
      6,
    );
  });

  it('does not confuse vertical reflection with horizontal or 180 rotation', () => {
    const source = getVerticalReflectionTemplate('lightning_zigzag');
    const vertical = reflectShapeVertical(source);
    expect(shapesEqual(vertical, reflectShapeHorizontal(source))).toBe(false);
    expect(shapesEqual(vertical, rotateShape180(source))).toBe(false);
  });

  it('rejects vertically symmetric sources and accepts asymmetric markers', () => {
    const symmetric = {
      polygons: [
        {
          closed: true as const,
          points: [
            { x: 0.2, y: 0.2 },
            { x: 0.8, y: 0.2 },
            { x: 0.8, y: 0.8 },
            { x: 0.2, y: 0.8 },
          ],
        },
      ],
      markers: [
        {
          id: 'm',
          type: 'dot' as const,
          center: { x: 0.5, y: 0.5 },
          size: 0.05,
          colorRole: 'accent' as const,
        },
      ],
    };
    expect(isVerticallySymmetric(symmetric)).toBe(true);
    expect(() =>
      generateVerticalReflectionCandidates({
        sourceShape: symmetric,
        generationSeed: 'sym',
      }),
    ).toThrow(/symmetric/i);

    const asymmetricMarker = cloneShape(symmetric);
    asymmetricMarker.markers[0]!.center = { x: 0.3, y: 0.35 };
    expect(isVerticallySymmetric(asymmetricMarker)).toBe(false);
    expect(
      generateVerticalReflectionCandidates({
        sourceShape: asymmetricMarker,
        generationSeed: 'asym-marker',
      }).candidates,
    ).toHaveLength(4);
  });

  it('generates four distinct candidates with exactly one correct reflection', () => {
    const source = getVerticalReflectionTemplate('mechanical_plate');
    const result = generateVerticalReflectionCandidates({
      sourceShape: source,
      generationSeed: 'plate-seed',
    });
    expect(result.candidates).toHaveLength(4);
    const expected = reflectShapeVertical(source);
    const matches = result.candidates.filter((c) =>
      shapesEqual(c.shape, expected),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(result.correctCandidateId);
    for (let i = 0; i < 4; i += 1) {
      for (let j = i + 1; j < 4; j += 1) {
        expect(
          shapesEqual(result.candidates[i]!.shape, result.candidates[j]!.shape),
        ).toBe(false);
      }
    }
  });

  it('is deterministic for a seed', () => {
    const source = getVerticalReflectionTemplate('key_silhouette');
    const a = generateVerticalReflectionCandidates({
      sourceShape: source,
      generationSeed: 'stable-seed',
    });
    const b = generateVerticalReflectionCandidates({
      sourceShape: source,
      generationSeed: 'stable-seed',
    });
    expect(a.correctCandidateId).toBe(b.correctCandidateId);
    expect(a.candidates.map((c) => c.id)).toEqual(b.candidates.map((c) => c.id));
    expect(a.candidates.map((c) => canonicalizeShape(c.shape))).toEqual(
      b.candidates.map((c) => canonicalizeShape(c.shape)),
    );
  });

  it('uses documented floating-point tolerance', () => {
    const source = getVerticalReflectionTemplate('fish_abstract');
    const tweaked = cloneShape(source);
    tweaked.polygons[0]!.points[0]!.x +=
      VERTICAL_REFLECTION_GEOMETRY_TOLERANCE / 10;
    expect(shapesEqual(source, tweaked)).toBe(true);
  });

  it('keeps every candidate marker inside a well-formed silhouette', () => {
    for (const id of listVerticalReflectionTemplateIds()) {
      const source = getVerticalReflectionTemplate(id);
      const result = generateVerticalReflectionCandidates({
        sourceShape: source,
        generationSeed: `well-formed-${id}`,
      });
      for (const candidate of result.candidates) {
        expect(validateReflectionShape(candidate.shape)).toEqual([]);
        expect(markersLieInsideSilhouette(candidate.shape)).toBe(true);
      }
      const expected = reflectShapeVertical(source);
      expect(
        result.candidates.some((c) => shapesEqual(c.shape, expected)),
      ).toBe(true);
    }
  });

  it('builds a solvable default bank', () => {
    const bank = buildDefaultVerticalReflectionBank();
    expect(bank.questions.length).toBeGreaterThanOrEqual(12);
    for (const q of bank.questions) {
      expect(validateReflectionShape(q.sourceShape)).toEqual([]);
      const materialized = materializeVerticalReflectionQuestion(q);
      expect(materialized.candidates).toHaveLength(4);
    }
  });
});
