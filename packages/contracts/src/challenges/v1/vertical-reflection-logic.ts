/**
 * Mirror of Deception (مرآة الخداع) — vertical reflection visual reasoning.
 *
 * Shared by match authority and Challenge Studio. Flutter only renders
 * server-issued normalized geometry; correctness stays server-side.
 *
 * Product challenge type: `vertical_reflection`
 * Engine id (dotted registry): `focus.vertical_reflection`
 */

import { z } from "zod";

export const VERTICAL_REFLECTION_ENGINE_ID =
  "focus.vertical_reflection" as const;
/** Product / public challenge type alias. */
export const VERTICAL_REFLECTION_CHALLENGE_TYPE = "vertical_reflection" as const;

/** Generator contract version — bump when distractor / template rules change. */
export const VERTICAL_REFLECTION_GENERATOR_VERSION = 2 as const;

/** Documented floating-point tolerance for canonical geometry comparison. */
export const VERTICAL_REFLECTION_GEOMETRY_TOLERANCE = 1e-4;

export const VERTICAL_REFLECTION_MAX_POLYGONS = 4;
export const VERTICAL_REFLECTION_MAX_VERTICES_PER_POLYGON = 32;
export const VERTICAL_REFLECTION_MAX_MARKERS = 6;
export const VERTICAL_REFLECTION_CANDIDATE_COUNT = 4;

export const VERTICAL_REFLECTION_TITLE_COPY = {
  ar: "مرآة الخداع",
  en: "Mirror of Deception",
} as const;

export const VERTICAL_REFLECTION_INSTRUCTION_COPY = {
  ar: "اختر الانعكاس الصحيح حول المحور العمودي",
  en: "Choose the correct reflection across the vertical axis",
} as const;

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

export const normalizedPointSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();
export type NormalizedPoint = z.infer<typeof normalizedPointSchema>;

export const shapePolygonSchema = z
  .object({
    points: z
      .array(normalizedPointSchema)
      .min(3)
      .max(VERTICAL_REFLECTION_MAX_VERTICES_PER_POLYGON),
    closed: z.literal(true),
  })
  .strict();
export type ShapePolygon = z.infer<typeof shapePolygonSchema>;

export const SHAPE_MARKER_TYPES = [
  "dot",
  "ring",
  "short_line",
  "small_triangle",
] as const;
export type ShapeMarkerType = (typeof SHAPE_MARKER_TYPES)[number];
export const shapeMarkerTypeSchema = z.enum(SHAPE_MARKER_TYPES);

export const SHAPE_MARKER_COLOR_ROLES = [
  "primary",
  "secondary",
  "accent",
] as const;
export type ShapeMarkerColorRole = (typeof SHAPE_MARKER_COLOR_ROLES)[number];
export const shapeMarkerColorRoleSchema = z.enum(SHAPE_MARKER_COLOR_ROLES);

export const shapeMarkerSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: shapeMarkerTypeSchema,
    center: normalizedPointSchema,
    size: z.number().finite().positive().max(0.35),
    colorRole: shapeMarkerColorRoleSchema,
    /** Optional direction for short_line / small_triangle (unit vector, normalized). */
    direction: normalizedPointSchema.optional(),
  })
  .strict();
export type ShapeMarker = z.infer<typeof shapeMarkerSchema>;

export const reflectionShapeSchema = z
  .object({
    polygons: z
      .array(shapePolygonSchema)
      .min(1)
      .max(VERTICAL_REFLECTION_MAX_POLYGONS),
    markers: z.array(shapeMarkerSchema).max(VERTICAL_REFLECTION_MAX_MARKERS),
  })
  .strict();
export type ReflectionShape = z.infer<typeof reflectionShapeSchema>;

export const DISTRACTOR_TRANSFORMS = [
  "unchanged",
  "horizontal_reflection",
  "rotate_180",
  "source_marker_reseat",
  "correct_marker_reseat",
] as const;
export type DistractorTransform = (typeof DISTRACTOR_TRANSFORMS)[number];
export const distractorTransformSchema = z.enum(DISTRACTOR_TRANSFORMS);

export const VERTICAL_REFLECTION_TEMPLATE_IDS = [
  "asymmetric_arrow_notch",
  "stepped_polygon",
  "key_silhouette",
  "irregular_flag",
  "asymmetric_shield",
  "lightning_zigzag",
  "boot_hook",
  "offset_chevron",
  "l_block_notch",
  "irregular_crown",
  "mechanical_plate",
  "maze_silhouette",
  "fish_abstract",
  "hand_silhouette",
  "crystal_concave",
] as const;
export type VerticalReflectionTemplateId =
  (typeof VERTICAL_REFLECTION_TEMPLATE_IDS)[number];
export const verticalReflectionTemplateIdSchema = z.enum(
  VERTICAL_REFLECTION_TEMPLATE_IDS,
);

const opaqueQuestionId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]{0,126}$/i);

const localeCopySchema = z
  .object({
    ar: z.string().min(1).max(500),
    en: z.string().min(1).max(500).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Seeded RNG (deterministic across Node / browsers)
// ---------------------------------------------------------------------------

export function hashSeedToUint32(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — returns [0, 1). Named to avoid clashing with laser-routing RNG. */
export function createVerticalReflectionSeededRng(seed: string): () => number {
  let state = hashSeedToUint32(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffleVerticalReflection<T>(
  items: readonly T[],
  seed: string,
): T[] {
  const rng = createVerticalReflectionSeededRng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry math
// ---------------------------------------------------------------------------

function roundCoord(n: number): number {
  const inv = 1 / VERTICAL_REFLECTION_GEOMETRY_TOLERANCE;
  return Math.round(n * inv) / inv;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function reflectPointVertical(p: NormalizedPoint): NormalizedPoint {
  return { x: clamp01(1 - p.x), y: p.y };
}

export function reflectPointHorizontal(p: NormalizedPoint): NormalizedPoint {
  return { x: p.x, y: clamp01(1 - p.y) };
}

export function rotatePoint180(p: NormalizedPoint): NormalizedPoint {
  return { x: clamp01(1 - p.x), y: clamp01(1 - p.y) };
}

/** Reflect a direction vector across the vertical axis (x flips). */
function reflectDirectionVertical(
  d: NormalizedPoint | undefined,
): NormalizedPoint | undefined {
  if (!d) return undefined;
  return { x: clamp01(1 - d.x), y: d.y };
}

function reflectDirectionHorizontal(
  d: NormalizedPoint | undefined,
): NormalizedPoint | undefined {
  if (!d) return undefined;
  return { x: d.x, y: clamp01(1 - d.y) };
}

function rotateDirection180(
  d: NormalizedPoint | undefined,
): NormalizedPoint | undefined {
  if (!d) return undefined;
  return { x: clamp01(1 - d.x), y: clamp01(1 - d.y) };
}

function polygonSignedArea(points: readonly NormalizedPoint[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

export function polygonArea(points: readonly NormalizedPoint[]): number {
  return Math.abs(polygonSignedArea(points));
}

function orient(
  a: NormalizedPoint,
  b: NormalizedPoint,
  c: NormalizedPoint,
): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(
  a: NormalizedPoint,
  b: NormalizedPoint,
  c: NormalizedPoint,
): boolean {
  return (
    Math.min(a.x, c.x) - VERTICAL_REFLECTION_GEOMETRY_TOLERANCE <= b.x &&
    b.x <= Math.max(a.x, c.x) + VERTICAL_REFLECTION_GEOMETRY_TOLERANCE &&
    Math.min(a.y, c.y) - VERTICAL_REFLECTION_GEOMETRY_TOLERANCE <= b.y &&
    b.y <= Math.max(a.y, c.y) + VERTICAL_REFLECTION_GEOMETRY_TOLERANCE
  );
}

function segmentsIntersect(
  p1: NormalizedPoint,
  q1: NormalizedPoint,
  p2: NormalizedPoint,
  q2: NormalizedPoint,
): boolean {
  const o1 = orient(p1, q1, p2);
  const o2 = orient(p1, q1, q2);
  const o3 = orient(p2, q2, p1);
  const o4 = orient(p2, q2, q1);
  const eps = VERTICAL_REFLECTION_GEOMETRY_TOLERANCE;
  if (o1 * o2 < -eps && o3 * o4 < -eps) return true;
  if (Math.abs(o1) <= eps && onSegment(p1, p2, q1)) return true;
  if (Math.abs(o2) <= eps && onSegment(p1, q2, q1)) return true;
  if (Math.abs(o3) <= eps && onSegment(p2, p1, q2)) return true;
  if (Math.abs(o4) <= eps && onSegment(p2, q1, q2)) return true;
  return false;
}

/** True when non-adjacent edges cross (self-intersecting simple-polygon test). */
export function polygonSelfIntersects(
  points: readonly NormalizedPoint[],
): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    const a1 = points[i]!;
    const a2 = points[(i + 1) % n]!;
    for (let j = i + 1; j < n; j += 1) {
      // Skip adjacent edges and the closing pair that shares a vertex.
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if ((j + 1) % n === i) continue;
      const b1 = points[j]!;
      const b2 = points[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function reverseWinding(points: readonly NormalizedPoint[]): NormalizedPoint[] {
  return [...points].reverse();
}

function mapPolygon(
  polygon: ShapePolygon,
  mapPoint: (p: NormalizedPoint) => NormalizedPoint,
  reverseAfter: boolean,
): ShapePolygon {
  const mapped = polygon.points.map(mapPoint);
  return {
    points: reverseAfter ? reverseWinding(mapped) : mapped,
    closed: true,
  };
}

function mapMarker(
  marker: ShapeMarker,
  mapCenter: (p: NormalizedPoint) => NormalizedPoint,
  mapDirection: (d: NormalizedPoint | undefined) => NormalizedPoint | undefined,
): ShapeMarker {
  const next: ShapeMarker = {
    id: marker.id,
    type: marker.type,
    center: mapCenter(marker.center),
    size: marker.size,
    colorRole: marker.colorRole,
  };
  const dir = mapDirection(marker.direction);
  if (dir) next.direction = dir;
  return next;
}

export function reflectShapeVertical(shape: ReflectionShape): ReflectionShape {
  // Vertical reflection reverses winding — restore for consistent Flutter fills.
  return {
    polygons: shape.polygons.map((poly) =>
      mapPolygon(poly, reflectPointVertical, true),
    ),
    markers: shape.markers.map((m) =>
      mapMarker(m, reflectPointVertical, reflectDirectionVertical),
    ),
  };
}

export function reflectShapeHorizontal(shape: ReflectionShape): ReflectionShape {
  return {
    polygons: shape.polygons.map((poly) =>
      mapPolygon(poly, reflectPointHorizontal, true),
    ),
    markers: shape.markers.map((m) =>
      mapMarker(m, reflectPointHorizontal, reflectDirectionHorizontal),
    ),
  };
}

export function rotateShape180(shape: ReflectionShape): ReflectionShape {
  // 180° rotation preserves winding.
  return {
    polygons: shape.polygons.map((poly) =>
      mapPolygon(poly, rotatePoint180, false),
    ),
    markers: shape.markers.map((m) =>
      mapMarker(m, rotatePoint180, rotateDirection180),
    ),
  };
}

export function cloneShape(shape: ReflectionShape): ReflectionShape {
  return {
    polygons: shape.polygons.map((p) => ({
      points: p.points.map((pt) => ({ x: pt.x, y: pt.y })),
      closed: true as const,
    })),
    markers: shape.markers.map((m) => {
      const copy: ShapeMarker = {
        id: m.id,
        type: m.type,
        center: { x: m.center.x, y: m.center.y },
        size: m.size,
        colorRole: m.colorRole,
      };
      if (m.direction) {
        copy.direction = { x: m.direction.x, y: m.direction.y };
      }
      return copy;
    }),
  };
}

/**
 * Canonical string for equality checks — sorts polygons/markers and rounds
 * coordinates with {@link VERTICAL_REFLECTION_GEOMETRY_TOLERANCE}.
 */
export function canonicalizeShape(shape: ReflectionShape): string {
  const polys = shape.polygons.map((poly) => {
    const pts = poly.points.map(
      (p) => `${roundCoord(p.x)},${roundCoord(p.y)}`,
    );
    // Normalize winding: start at lexicographically smallest point, prefer CW encoding.
    let best = 0;
    for (let i = 1; i < pts.length; i += 1) {
      if (pts[i]! < pts[best]!) best = i;
    }
    const rotated = [...pts.slice(best), ...pts.slice(0, best)];
    const rotatedRev = [
      rotated[0]!,
      ...[...rotated.slice(1)].reverse(),
    ];
    const forward = rotated.join(";");
    const backward = rotatedRev.join(";");
    return forward <= backward ? forward : backward;
  });
  polys.sort();
  const markers = shape.markers
    .map((m) => {
      const dir = m.direction
        ? `@${roundCoord(m.direction.x)},${roundCoord(m.direction.y)}`
        : "";
      return `${m.id}|${m.type}|${roundCoord(m.center.x)},${roundCoord(
        m.center.y,
      )}|${roundCoord(m.size)}|${m.colorRole}${dir}`;
    })
    .sort();
  return `P[${polys.join("|")}]M[${markers.join("|")}]`;
}

export function shapesEqual(
  a: ReflectionShape,
  b: ReflectionShape,
): boolean {
  return canonicalizeShape(a) === canonicalizeShape(b);
}

export type ShapeValidationIssue = {
  code: string;
  message: string;
  path?: Array<string | number>;
};

/** Ray-casting point-in-polygon (normalized coords). */
export function pointInPolygon(
  point: NormalizedPoint,
  polygon: readonly NormalizedPoint[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersect =
      pi.y > point.y !== pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y + Number.EPSILON) +
          pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonCentroid(points: readonly NormalizedPoint[]): NormalizedPoint {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, points.length);
  return { x: x / n, y: y / n };
}

/**
 * True when every marker center lies safely inside some polygon
 * (inset so markers are not glued to edges).
 */
export function markersLieInsideSilhouette(
  shape: ReflectionShape,
  inset = 0.04,
): boolean {
  if (shape.polygons.length === 0) return false;
  for (const marker of shape.markers) {
    const margin = Math.max(inset, marker.size * 0.65);
    let ok = false;
    for (const poly of shape.polygons) {
      if (!pointInPolygon(marker.center, poly.points)) continue;
      const c = polygonCentroid(poly.points);
      // Pull slightly toward centroid and require that point stays inside —
      // rejects centers sitting on a thin spike / tooth tip.
      const pulled = {
        x: marker.center.x + (c.x - marker.center.x) * margin,
        y: marker.center.y + (c.y - marker.center.y) * margin,
      };
      if (pointInPolygon(pulled, poly.points)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  return true;
}

export function validateReflectionShape(
  shape: ReflectionShape,
): ShapeValidationIssue[] {
  const issues: ShapeValidationIssue[] = [];
  if (shape.polygons.length === 0) {
    issues.push({ code: "empty_polygons", message: "shape needs polygons" });
  }
  shape.polygons.forEach((poly, pi) => {
    if (polygonArea(poly.points) < VERTICAL_REFLECTION_GEOMETRY_TOLERANCE) {
      issues.push({
        code: "zero_area",
        message: `polygon ${pi} has zero area`,
        path: ["polygons", pi],
      });
    }
    if (polygonSelfIntersects(poly.points)) {
      issues.push({
        code: "self_intersecting",
        message: `polygon ${pi} is self-intersecting`,
        path: ["polygons", pi],
      });
    }
  });
  const markerIds = new Set<string>();
  shape.markers.forEach((m, mi) => {
    if (markerIds.has(m.id)) {
      issues.push({
        code: "duplicate_marker_id",
        message: `duplicate marker id ${m.id}`,
        path: ["markers", mi, "id"],
      });
    }
    markerIds.add(m.id);
    if (
      m.center.x < 0 ||
      m.center.x > 1 ||
      m.center.y < 0 ||
      m.center.y > 1
    ) {
      issues.push({
        code: "marker_out_of_bounds",
        message: `marker ${m.id} center out of bounds`,
        path: ["markers", mi, "center"],
      });
    }
  });
  if (
    shape.markers.length > 0 &&
    !markersLieInsideSilhouette(shape) &&
    !issues.some((i) => i.code === "empty_polygons")
  ) {
    issues.push({
      code: "marker_outside_silhouette",
      message: "marker lies outside or on the edge of the silhouette",
    });
  }
  return issues;
}

/**
 * Reject sources whose vertical reflection is visually identical to the
 * original (ambiguous: unchanged vs reflected cannot be distinguished).
 */
export function isVerticallySymmetric(shape: ReflectionShape): boolean {
  return shapesEqual(shape, reflectShapeVertical(shape));
}

// ---------------------------------------------------------------------------
// Shape templates (normalized silhouettes — not image assets)
// ---------------------------------------------------------------------------

function poly(points: Array<[number, number]>): ShapePolygon {
  return {
    closed: true,
    points: points.map(([x, y]) => ({ x, y })),
  };
}

function marker(
  id: string,
  type: ShapeMarkerType,
  x: number,
  y: number,
  size = 0.06,
  colorRole: ShapeMarkerColorRole = "accent",
): ShapeMarker {
  return { id, type, center: { x, y }, size, colorRole };
}

/**
 * Build the catalog of initial templates. At most one matches the concept
 * arrow; the rest are substantially different silhouettes.
 */
export function buildVerticalReflectionTemplateCatalog(): Record<
  VerticalReflectionTemplateId,
  ReflectionShape
> {
  return {
    asymmetric_arrow_notch: {
      // Concept-inspired arrow pointing right with bottom-left Z-notch + UL marker.
      polygons: [
        poly([
          [0.12, 0.28],
          [0.52, 0.28],
          [0.52, 0.16],
          [0.88, 0.5],
          [0.52, 0.84],
          [0.52, 0.72],
          [0.28, 0.72],
          [0.22, 0.66],
          [0.28, 0.6],
          [0.12, 0.6],
        ]),
      ],
      markers: [marker("m1", "dot", 0.28, 0.4, 0.07, "accent")],
    },
    stepped_polygon: {
      polygons: [
        poly([
          [0.1, 0.75],
          [0.1, 0.55],
          [0.28, 0.55],
          [0.28, 0.35],
          [0.48, 0.35],
          [0.48, 0.18],
          [0.78, 0.18],
          [0.78, 0.42],
          [0.62, 0.42],
          [0.62, 0.75],
        ]),
      ],
      markers: [marker("m1", "ring", 0.36, 0.48, 0.05, "primary")],
    },
    key_silhouette: {
      polygons: [
        poly([
          [0.18, 0.22],
          [0.42, 0.22],
          [0.42, 0.38],
          [0.78, 0.38],
          [0.78, 0.48],
          [0.68, 0.48],
          [0.68, 0.58],
          [0.78, 0.58],
          [0.78, 0.68],
          [0.42, 0.68],
          [0.42, 0.82],
          [0.18, 0.82],
          [0.18, 0.62],
          [0.28, 0.62],
          [0.28, 0.42],
          [0.18, 0.42],
        ]),
      ],
      markers: [marker("m1", "dot", 0.28, 0.32, 0.055, "accent")],
    },
    irregular_flag: {
      polygons: [
        poly([
          [0.12, 0.15],
          [0.72, 0.15],
          [0.62, 0.32],
          [0.78, 0.42],
          [0.58, 0.55],
          [0.74, 0.72],
          [0.12, 0.72],
          [0.12, 0.58],
          [0.22, 0.58],
          [0.22, 0.28],
          [0.12, 0.28],
        ]),
      ],
      markers: [
        marker("m1", "small_triangle", 0.32, 0.35, 0.06, "secondary"),
      ],
    },
    asymmetric_shield: {
      polygons: [
        poly([
          [0.22, 0.12],
          [0.72, 0.12],
          [0.82, 0.28],
          [0.78, 0.55],
          [0.55, 0.88],
          [0.35, 0.72],
          [0.18, 0.5],
          [0.18, 0.28],
        ]),
      ],
      markers: [marker("m1", "ring", 0.42, 0.32, 0.06, "accent")],
    },
    lightning_zigzag: {
      polygons: [
        poly([
          [0.42, 0.08],
          [0.72, 0.08],
          [0.48, 0.38],
          [0.78, 0.38],
          [0.28, 0.92],
          [0.38, 0.55],
          [0.18, 0.55],
        ]),
      ],
      markers: [marker("m1", "dot", 0.52, 0.22, 0.05, "primary")],
    },
    boot_hook: {
      polygons: [
        poly([
          [0.2, 0.15],
          [0.48, 0.15],
          [0.48, 0.48],
          [0.78, 0.48],
          [0.78, 0.72],
          [0.55, 0.72],
          [0.55, 0.85],
          [0.2, 0.85],
          [0.2, 0.62],
          [0.32, 0.62],
          [0.32, 0.35],
          [0.2, 0.35],
        ]),
      ],
      markers: [marker("m1", "short_line", 0.35, 0.25, 0.07, "accent")],
    },
    offset_chevron: {
      polygons: [
        poly([
          [0.18, 0.22],
          [0.48, 0.08],
          [0.82, 0.28],
          [0.68, 0.4],
          [0.5, 0.28],
          [0.35, 0.42],
          [0.55, 0.55],
          [0.35, 0.72],
          [0.18, 0.58],
          [0.32, 0.48],
          [0.18, 0.38],
        ]),
      ],
      markers: [marker("m1", "dot", 0.55, 0.22, 0.05, "secondary")],
    },
    l_block_notch: {
      polygons: [
        poly([
          [0.15, 0.2],
          [0.45, 0.2],
          [0.45, 0.5],
          [0.72, 0.5],
          [0.72, 0.62],
          [0.55, 0.62],
          [0.55, 0.78],
          [0.15, 0.78],
          [0.15, 0.55],
          [0.28, 0.55],
          [0.28, 0.38],
          [0.15, 0.38],
        ]),
      ],
      markers: [marker("m1", "ring", 0.3, 0.3, 0.05, "accent")],
    },
    irregular_crown: {
      polygons: [
        poly([
          [0.12, 0.7],
          [0.12, 0.42],
          [0.22, 0.42],
          [0.28, 0.18],
          [0.4, 0.38],
          [0.5, 0.12],
          [0.62, 0.35],
          [0.75, 0.15],
          [0.82, 0.42],
          [0.88, 0.42],
          [0.88, 0.7],
          [0.7, 0.7],
          [0.7, 0.55],
          [0.3, 0.55],
          [0.3, 0.7],
        ]),
      ],
      markers: [marker("m1", "dot", 0.5, 0.48, 0.05, "primary")],
    },
    mechanical_plate: {
      polygons: [
        poly([
          [0.15, 0.25],
          [0.55, 0.18],
          [0.82, 0.3],
          [0.75, 0.55],
          [0.85, 0.72],
          [0.55, 0.82],
          [0.28, 0.75],
          [0.18, 0.55],
          [0.32, 0.45],
          [0.22, 0.35],
        ]),
      ],
      markers: [
        marker("m1", "dot", 0.4, 0.35, 0.045, "accent"),
        marker("m2", "ring", 0.62, 0.55, 0.04, "secondary"),
      ],
    },
    maze_silhouette: {
      polygons: [
        poly([
          [0.12, 0.15],
          [0.78, 0.15],
          [0.78, 0.35],
          [0.55, 0.35],
          [0.55, 0.5],
          [0.78, 0.5],
          [0.78, 0.85],
          [0.45, 0.85],
          [0.45, 0.65],
          [0.28, 0.65],
          [0.28, 0.85],
          [0.12, 0.85],
          [0.12, 0.55],
          [0.35, 0.55],
          [0.35, 0.35],
          [0.12, 0.35],
        ]),
      ],
      markers: [marker("m1", "small_triangle", 0.65, 0.25, 0.05, "accent")],
    },
    fish_abstract: {
      polygons: [
        poly([
          [0.12, 0.5],
          [0.28, 0.28],
          [0.55, 0.22],
          [0.78, 0.35],
          [0.9, 0.28],
          [0.82, 0.5],
          [0.9, 0.72],
          [0.78, 0.65],
          [0.55, 0.78],
          [0.28, 0.72],
          [0.22, 0.58],
        ]),
      ],
      markers: [marker("m1", "dot", 0.35, 0.42, 0.05, "primary")],
    },
    hand_silhouette: {
      polygons: [
        poly([
          [0.22, 0.78],
          [0.22, 0.48],
          [0.18, 0.28],
          [0.28, 0.22],
          [0.35, 0.42],
          [0.4, 0.15],
          [0.5, 0.15],
          [0.52, 0.4],
          [0.58, 0.18],
          [0.68, 0.2],
          [0.65, 0.42],
          [0.78, 0.32],
          [0.85, 0.42],
          [0.7, 0.55],
          [0.72, 0.78],
        ]),
      ],
      markers: [marker("m1", "ring", 0.45, 0.6, 0.05, "accent")],
    },
    crystal_concave: {
      polygons: [
        poly([
          [0.5, 0.08],
          [0.78, 0.28],
          [0.7, 0.48],
          [0.88, 0.62],
          [0.58, 0.9],
          [0.42, 0.7],
          [0.2, 0.78],
          [0.18, 0.45],
          [0.35, 0.38],
          [0.28, 0.22],
        ]),
      ],
      markers: [marker("m1", "dot", 0.48, 0.35, 0.05, "secondary")],
    },
  };
}

export function getVerticalReflectionTemplate(
  templateId: VerticalReflectionTemplateId,
): ReflectionShape {
  const catalog = buildVerticalReflectionTemplateCatalog();
  return cloneShape(catalog[templateId]);
}

export function listVerticalReflectionTemplateIds(): VerticalReflectionTemplateId[] {
  return [...VERTICAL_REFLECTION_TEMPLATE_IDS];
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

export type VerticalReflectionCandidate = {
  id: string;
  shape: ReflectionShape;
  /** Admin-only diagnostics — never in public player payload. */
  transform?: "correct_vertical" | DistractorTransform;
};

export type VerticalReflectionGenerationResult = {
  sourceShape: ReflectionShape;
  candidates: VerticalReflectionCandidate[];
  correctCandidateId: string;
  distractorTransforms: DistractorTransform[];
};

function reseatMarkersTowardCentroid(
  shape: ReflectionShape,
  t: number,
): ReflectionShape {
  const next = cloneShape(shape);
  for (const marker of next.markers) {
    let host = next.polygons[0]!;
    for (const poly of next.polygons) {
      if (pointInPolygon(marker.center, poly.points)) {
        host = poly;
        break;
      }
    }
    const c = polygonCentroid(host.points);
    marker.center = {
      x: clamp01(marker.center.x + (c.x - marker.center.x) * t),
      y: clamp01(marker.center.y + (c.y - marker.center.y) * t),
    };
  }
  return next;
}

function reseatMarkersAlongAxis(
  shape: ReflectionShape,
  dx: number,
  dy: number,
): ReflectionShape {
  const next = cloneShape(shape);
  for (const marker of next.markers) {
    const candidate = {
      x: clamp01(marker.center.x + dx),
      y: clamp01(marker.center.y + dy),
    };
    // Only accept if the new center still sits safely inside.
    const probe: ReflectionShape = {
      polygons: next.polygons,
      markers: [{ ...marker, center: candidate }],
    };
    if (markersLieInsideSilhouette(probe)) {
      marker.center = candidate;
    } else {
      // Fall back toward centroid so the distractor stays well-formed.
      let host = next.polygons[0]!;
      for (const poly of next.polygons) {
        if (pointInPolygon(marker.center, poly.points)) {
          host = poly;
          break;
        }
      }
      const c = polygonCentroid(host.points);
      marker.center = {
        x: clamp01(marker.center.x * 0.55 + c.x * 0.45),
        y: clamp01(marker.center.y * 0.55 + c.y * 0.45),
      };
    }
  }
  return next;
}

function isUsableDistractor(
  shape: ReflectionShape,
  correct: ReflectionShape,
  already: readonly ReflectionShape[],
): boolean {
  if (shapesEqual(shape, correct)) return false;
  if (already.some((s) => shapesEqual(s, shape))) return false;
  if (validateReflectionShape(shape).length > 0) return false;
  return true;
}

function pickDistinctDistractors(
  source: ReflectionShape,
  correct: ReflectionShape,
  seed: string,
): Array<{ transform: DistractorTransform; shape: ReflectionShape }> {
  // Only full-shape transforms — never paste markers onto a foreign outline
  // (that produced the "glued to tooth tip" deformations).
  const pool: Array<{ transform: DistractorTransform; shape: ReflectionShape }> =
    [
      { transform: "unchanged", shape: cloneShape(source) },
      {
        transform: "horizontal_reflection",
        shape: reflectShapeHorizontal(source),
      },
      { transform: "rotate_180", shape: rotateShape180(source) },
      {
        transform: "source_marker_reseat",
        shape: reseatMarkersAlongAxis(source, 0.1, -0.08),
      },
      {
        transform: "source_marker_reseat",
        shape: reseatMarkersTowardCentroid(source, 0.35),
      },
      {
        transform: "correct_marker_reseat",
        shape: reseatMarkersAlongAxis(correct, -0.1, 0.08),
      },
      {
        transform: "correct_marker_reseat",
        shape: reseatMarkersTowardCentroid(correct, 0.4),
      },
      {
        transform: "horizontal_reflection",
        shape: reflectShapeHorizontal(correct),
      },
      {
        transform: "rotate_180",
        shape: rotateShape180(correct),
      },
    ];

  const shuffled = seededShuffleVerticalReflection(pool, `${seed}:distractors`);
  const picked: Array<{
    transform: DistractorTransform;
    shape: ReflectionShape;
  }> = [];

  for (const entry of shuffled) {
    if (
      !isUsableDistractor(
        entry.shape,
        correct,
        picked.map((p) => p.shape),
      )
    ) {
      continue;
    }
    picked.push(entry);
    if (picked.length === 3) break;
  }

  // Deterministic interior reseats if the geometric pool was thin.
  let fallbackIndex = 0;
  while (picked.length < 3 && fallbackIndex < 16) {
    const baseOuter = fallbackIndex % 2 === 0 ? source : correct;
    const transform: DistractorTransform =
      fallbackIndex % 2 === 0
        ? "source_marker_reseat"
        : "correct_marker_reseat";
    const t = 0.2 + (fallbackIndex % 5) * 0.12;
    const dx = ((fallbackIndex % 3) - 1) * 0.09;
    const dy = (((fallbackIndex + 1) % 3) - 1) * 0.09;
    const shape =
      fallbackIndex % 2 === 0
        ? reseatMarkersTowardCentroid(
            reseatMarkersAlongAxis(baseOuter, dx, dy),
            t,
          )
        : reseatMarkersAlongAxis(
            reseatMarkersTowardCentroid(baseOuter, t),
            dx,
            dy,
          );
    if (
      isUsableDistractor(
        shape,
        correct,
        picked.map((p) => p.shape),
      )
    ) {
      picked.push({ transform, shape });
    }
    fallbackIndex += 1;
  }

  if (picked.length < 3) {
    throw new Error("unable to generate three distinct well-formed distractors");
  }
  return picked.slice(0, 3);
}

/**
 * Build four candidates (1 correct vertical reflection + 3 distractors),
 * shuffled deterministically by seed. Correctness is derived from geometry.
 */
export function generateVerticalReflectionCandidates(input: {
  sourceShape: ReflectionShape;
  generationSeed: string;
  optionIdPrefix?: string;
}): VerticalReflectionGenerationResult {
  const sourceIssues = validateReflectionShape(input.sourceShape);
  if (sourceIssues.length > 0) {
    throw new Error(
      `invalid source shape: ${sourceIssues.map((i) => i.message).join("; ")}`,
    );
  }
  if (isVerticallySymmetric(input.sourceShape)) {
    throw new Error(
      "source shape is vertically symmetric — reflection is ambiguous",
    );
  }

  const correctShape = reflectShapeVertical(input.sourceShape);
  const correctIssues = validateReflectionShape(correctShape);
  if (correctIssues.length > 0) {
    throw new Error(
      `invalid reflected shape: ${correctIssues.map((i) => i.message).join("; ")}`,
    );
  }

  const distractors = pickDistinctDistractors(
    input.sourceShape,
    correctShape,
    input.generationSeed,
  );

  const prefix = input.optionIdPrefix ?? "vr.opt";
  const correctId = `${prefix}.correct`;
  const raw: VerticalReflectionCandidate[] = [
    {
      id: correctId,
      shape: correctShape,
      transform: "correct_vertical",
    },
    ...distractors.map((d, i) => {
      const entry: VerticalReflectionCandidate = {
        id: `${prefix}.d${i + 1}`,
        shape: d.shape,
        transform: d.transform,
      };
      return entry;
    }),
  ];

  const shuffled = seededShuffleVerticalReflection(
    raw,
    `${input.generationSeed}:order`,
  );
  // Re-assign stable option keys by shuffled slot so reconnect order is seed-stable.
  const candidates: VerticalReflectionCandidate[] = shuffled.map(
    (c, index) => {
      const next: VerticalReflectionCandidate = {
        id: `${prefix}.${index}`,
        shape: c.shape,
      };
      if (c.transform) next.transform = c.transform;
      return next;
    },
  );
  const correct = candidates.find((c) =>
    shapesEqual(c.shape, correctShape),
  );
  if (!correct) {
    throw new Error("correct candidate missing after shuffle");
  }

  // Final uniqueness + well-formed gate.
  for (let i = 0; i < candidates.length; i += 1) {
    if (validateReflectionShape(candidates[i]!.shape).length > 0) {
      throw new Error(`candidate ${i} failed shape validation`);
    }
    for (let j = i + 1; j < candidates.length; j += 1) {
      if (shapesEqual(candidates[i]!.shape, candidates[j]!.shape)) {
        throw new Error("duplicate candidates after generation");
      }
    }
  }

  return {
    sourceShape: cloneShape(input.sourceShape),
    candidates,
    correctCandidateId: correct.id,
    distractorTransforms: distractors.map((d) => d.transform),
  };
}

export function assertVerticalReflectionSolvable(input: {
  sourceShape: ReflectionShape;
  candidates: Array<{ id: string; shape: ReflectionShape }>;
  correctCandidateId: string;
}): void {
  const sourceIssues = validateReflectionShape(input.sourceShape);
  if (sourceIssues.length > 0) {
    throw new Error(sourceIssues[0]!.message);
  }
  if (isVerticallySymmetric(input.sourceShape)) {
    throw new Error("source shape is vertically symmetric");
  }
  if (input.candidates.length !== VERTICAL_REFLECTION_CANDIDATE_COUNT) {
    throw new Error("exactly four candidates required");
  }
  const expected = reflectShapeVertical(input.sourceShape);
  const matches = input.candidates.filter((c) =>
    shapesEqual(c.shape, expected),
  );
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "no candidate equals the vertical reflection"
        : "multiple candidates equal the vertical reflection",
    );
  }
  if (matches[0]!.id !== input.correctCandidateId) {
    throw new Error("correctCandidateId must match geometry-derived answer");
  }
  for (let i = 0; i < input.candidates.length; i += 1) {
    for (let j = i + 1; j < input.candidates.length; j += 1) {
      if (
        shapesEqual(input.candidates[i]!.shape, input.candidates[j]!.shape)
      ) {
        throw new Error("duplicate candidates");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Question / configs
// ---------------------------------------------------------------------------

export const verticalReflectionQuestionSchema = z
  .object({
    questionId: opaqueQuestionId,
    internalName: z.string().min(1).max(200).optional(),
    templateId: verticalReflectionTemplateIdSchema.optional(),
    sourceShape: reflectionShapeSchema,
    generatorVersion: z
      .number()
      .int()
      .positive()
      .default(VERTICAL_REFLECTION_GENERATOR_VERSION),
    generationSeed: z.string().min(1).max(128),
    candidates: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            shape: reflectionShapeSchema,
          })
          .strict(),
      )
      .length(VERTICAL_REFLECTION_CANDIDATE_COUNT)
      .optional(),
    correctCandidateId: z.string().min(1).max(64).optional(),
    /** Source side of the board for v1 — prefer left. */
    sourceSide: z.enum(["left", "right"]).default("left"),
    titleCopy: localeCopySchema.optional(),
    instructionCopy: localeCopySchema.optional(),
    durationMs: z.number().int().positive().max(60_000).optional(),
    difficulty: z.string().min(1).max(64).optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
    selectionWeight: z.number().positive().max(1000).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
export type VerticalReflectionQuestion = z.infer<
  typeof verticalReflectionQuestionSchema
>;

export const verticalReflectionPublicCandidateSchema = z
  .object({
    id: z.string().min(1).max(64),
    shape: reflectionShapeSchema,
  })
  .strict();
export type VerticalReflectionPublicCandidate = z.infer<
  typeof verticalReflectionPublicCandidateSchema
>;

export const verticalReflectionClientConfigSchema = z
  .object({
    categoryKey: z.string().min(1).max(256),
    promptKey: z.string().min(1).max(256),
    titleKey: z.string().min(1).max(256).optional(),
    titleText: z.string().min(1).max(200).optional(),
    instructionKey: z.string().min(1).max(256).optional(),
    instructionText: z.string().min(1).max(500).optional(),
    footerKey: z.string().min(1).max(256).optional(),
    questionId: opaqueQuestionId.optional(),
    sourceShape: reflectionShapeSchema.optional(),
    sourceSide: z.enum(["left", "right"]).optional(),
    candidates: z
      .array(verticalReflectionPublicCandidateSchema)
      .length(VERTICAL_REFLECTION_CANDIDATE_COUNT)
      .optional(),
    optionKeys: z.array(z.string().min(1).max(64)).min(2).max(6).optional(),
  })
  .strict();
export type VerticalReflectionClientConfig = z.infer<
  typeof verticalReflectionClientConfigSchema
>;

export const verticalReflectionServerConfigSchema = z
  .object({
    questions: z.array(verticalReflectionQuestionSchema).min(1).max(64),
    /** Pinned after materialize — never mirrored into clientConfig. */
    questionId: opaqueQuestionId.optional(),
    sourceShape: reflectionShapeSchema.optional(),
    sourceSide: z.enum(["left", "right"]).optional(),
    generationSeed: z.string().min(1).max(128).optional(),
    generatorVersion: z.number().int().positive().optional(),
    candidates: z
      .array(verticalReflectionPublicCandidateSchema)
      .length(VERTICAL_REFLECTION_CANDIDATE_COUNT)
      .optional(),
    correctCandidateId: z.string().min(1).max(64).optional(),
    /** Alias for shared MC evaluators / tooling. */
    correctOptionKey: z.string().min(1).max(64).optional(),
    optionKeys: z.array(z.string().min(1).max(64)).min(2).max(6).optional(),
  })
  .strict();
export type VerticalReflectionServerConfig = z.infer<
  typeof verticalReflectionServerConfigSchema
>;

/** Reuses the authenticated multiple-choice submission convention. */
export const verticalReflectionAnswerSchema = z
  .object({
    chosenOptionKey: z.string().min(1).max(64),
  })
  .strict();
export type VerticalReflectionAnswer = z.infer<
  typeof verticalReflectionAnswerSchema
>;

export function parseVerticalReflectionClientConfig(input: unknown) {
  return verticalReflectionClientConfigSchema.parse(input);
}
export function parseVerticalReflectionServerConfig(input: unknown) {
  return verticalReflectionServerConfigSchema.parse(input);
}
export function parseVerticalReflectionAnswer(input: unknown) {
  return verticalReflectionAnswerSchema.parse(input);
}

/**
 * Ensure candidates exist (generate if missing) and geometry validates.
 * Publish gate — drafts may omit candidates until preview/regenerate.
 */
export function materializeVerticalReflectionQuestion(
  question: VerticalReflectionQuestion,
): VerticalReflectionQuestion & {
  candidates: VerticalReflectionPublicCandidate[];
  correctCandidateId: string;
} {
  // Always regenerate from seed so Studio/catalog never ships hybrid
  // "wrong marker on foreign outline" distractors from older generator versions.
  const generated = generateVerticalReflectionCandidates({
    sourceShape: question.sourceShape,
    generationSeed: question.generationSeed,
    optionIdPrefix: `vr.${question.questionId}`,
  });

  assertVerticalReflectionSolvable({
    sourceShape: generated.sourceShape,
    candidates: generated.candidates,
    correctCandidateId: generated.correctCandidateId,
  });

  return {
    ...question,
    sourceShape: generated.sourceShape,
    sourceSide: question.sourceSide ?? "left",
    generatorVersion: VERTICAL_REFLECTION_GENERATOR_VERSION,
    candidates: generated.candidates.map((c) => ({
      id: c.id,
      shape: c.shape,
    })),
    correctCandidateId: generated.correctCandidateId,
  };
}

export function assertVerticalReflectionQuestionSolvable(
  question: VerticalReflectionQuestion,
): void {
  materializeVerticalReflectionQuestion(question);
}

export function assertVerticalReflectionBankSolvable(
  questions: readonly VerticalReflectionQuestion[],
): void {
  for (const question of questions) {
    if (question.enabled === false) continue;
    assertVerticalReflectionQuestionSolvable(question);
  }
}

/** Strip admin diagnostics / private fields from a candidate list. */
export function toPublicVerticalReflectionCandidates(
  candidates: readonly VerticalReflectionCandidate[],
): VerticalReflectionPublicCandidate[] {
  return candidates.map((c) => ({ id: c.id, shape: cloneShape(c.shape) }));
}

export function buildVerticalReflectionQuestion(input: {
  questionId: string;
  templateId: VerticalReflectionTemplateId;
  generationSeed: string;
  internalName?: string;
  difficulty?: string;
  durationMs?: number;
  tags?: string[];
  selectionWeight?: number;
  titleCopy?: { ar: string; en?: string };
  instructionCopy?: { ar: string; en?: string };
}): VerticalReflectionQuestion & {
  candidates: VerticalReflectionPublicCandidate[];
  correctCandidateId: string;
} {
  const sourceShape = getVerticalReflectionTemplate(input.templateId);
  const base: VerticalReflectionQuestion = {
    questionId: input.questionId,
    templateId: input.templateId,
    sourceShape,
    generatorVersion: VERTICAL_REFLECTION_GENERATOR_VERSION,
    generationSeed: input.generationSeed,
    sourceSide: "left",
    enabled: true,
    titleCopy: input.titleCopy ?? {
      ar: VERTICAL_REFLECTION_TITLE_COPY.ar,
      en: VERTICAL_REFLECTION_TITLE_COPY.en,
    },
    instructionCopy: input.instructionCopy ?? {
      ar: VERTICAL_REFLECTION_INSTRUCTION_COPY.ar,
      en: VERTICAL_REFLECTION_INSTRUCTION_COPY.en,
    },
  };
  if (input.internalName) base.internalName = input.internalName;
  if (input.difficulty) base.difficulty = input.difficulty;
  if (input.durationMs != null) base.durationMs = input.durationMs;
  if (input.tags) base.tags = input.tags;
  if (input.selectionWeight != null) base.selectionWeight = input.selectionWeight;
  return materializeVerticalReflectionQuestion(base);
}

/** Reference bank — 12+ distinct templates for Studio defaults / fixtures. */
export function buildDefaultVerticalReflectionBank(): {
  questions: Array<
    VerticalReflectionQuestion & {
      candidates: VerticalReflectionPublicCandidate[];
      correctCandidateId: string;
    }
  >;
} {
  const questions = VERTICAL_REFLECTION_TEMPLATE_IDS.map((templateId, index) =>
    buildVerticalReflectionQuestion({
      questionId: `vertical_reflection.q.${templateId}`,
      templateId,
      generationSeed: `vr-default-${templateId}-v1`,
      internalName: templateId,
      difficulty: index < 5 ? "easy" : index < 10 ? "medium" : "hard",
      selectionWeight: 1,
    }),
  );
  return { questions };
}

export const VERTICAL_REFLECTION_REFERENCE_QUESTION =
  buildVerticalReflectionQuestion({
    questionId: "vertical_reflection.q.reference_arrow",
    templateId: "asymmetric_arrow_notch",
    generationSeed: "vr-reference-arrow-v1",
    internalName: "Reference — asymmetric arrow",
    difficulty: "easy",
  });
