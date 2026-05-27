// app/lib/filterValidator.ts
//
// Centralized validation rules for Any Kind of Filter inputs.
// Mirrors the validation logic from the Rails Product model.

export const VALID_CATEGORIES = [
  "merv",
  "padframe",
  "pad",
  "electro_perm_washable",
  "practical_pleat",
] as const;

export type Category = (typeof VALID_CATEGORIES)[number];

export const VALID_QUALITIES = [8, 11, 13] as const;
export type Quality = (typeof VALID_QUALITIES)[number];

export const MERV_CODES: Record<Quality, string> = {
  8: "DQPA40",
  11: "MQPA",
  13: "GQPA",
};

const DEPTHS_BY_CATEGORY: Record<Category, number[]> = {
  merv: [1, 2, 4],
  padframe: [0.75, 1, 2],
  pad: [0.75, 1, 2],
  electro_perm_washable: [1],
  practical_pleat: [5],
};

const MIN_DIM = 6;
const MAX_DIM = 36.875;

export interface FilterInput {
  category?: string | null;
  length?: number | null;
  width?: number | null;
  depth?: number | null;
  quality?: number | null;
}

export interface ValidatedFilter {
  category: Category;
  length: number;
  width: number;
  depth: number;
  quality?: Quality;
  mervCode?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; data: ValidatedFilter }
  | { ok: false; errors: ValidationError[] };

function isEighthIncrement(v: number): boolean {
  // Multiply by 8 and check that the result is a whole number.
  // Use a small epsilon to avoid float precision artifacts.
  const scaled = v * 8;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

export function validateFilter(input: FilterInput): ValidationResult {
  const errors: ValidationError[] = [];

  // Category whitelist
  if (
    !input.category ||
    !VALID_CATEGORIES.includes(input.category as Category)
  ) {
    errors.push({
      field: "category",
      message: `must be one of: ${VALID_CATEGORIES.join(", ")}`,
    });
    return { ok: false, errors };
  }
  const category = input.category as Category;

  // Length and width bounds plus 1/8" increment check
  for (const dim of ["length", "width"] as const) {
    const v = input[dim];
    if (v == null || Number.isNaN(v)) {
      errors.push({ field: dim, message: "is required" });
    } else if (v < MIN_DIM || v > MAX_DIM) {
      errors.push({
        field: dim,
        message: `must be between ${MIN_DIM} and ${MAX_DIM} inches`,
      });
    } else if (!isEighthIncrement(v)) {
      errors.push({ field: dim, message: 'must be in 1/8" increments' });
    }
  }

  // Depth check is category-dependent
  const validDepths = DEPTHS_BY_CATEGORY[category];
  if (input.depth == null || !validDepths.includes(input.depth)) {
    errors.push({
      field: "depth",
      message: `must be one of: ${validDepths.join(", ")}`,
    });
  }

  // MERV-specific quality check
  let quality: Quality | undefined;
  let mervCode: string | undefined;
  if (category === "merv") {
    if (
      input.quality == null ||
      !VALID_QUALITIES.includes(input.quality as Quality)
    ) {
      errors.push({ field: "quality", message: "must be 8, 11, or 13" });
    } else {
      quality = input.quality as Quality;
      mervCode = MERV_CODES[quality];
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Normalize: width must be greater than or equal to length
  let length = input.length as number;
  let width = input.width as number;
  if (width < length) {
    [length, width] = [width, length];
  }

  return {
    ok: true,
    data: {
      category,
      length,
      width,
      depth: input.depth as number,
      quality,
      mervCode,
    },
  };
}
