// Base64 expands binary uploads by about one third. Keep JSON below Vercel's 4.5 MB limit.
export const MAX_IMAGE_BASE64 = 3_200_000;
export const MAX_REQUEST_BYTES = 3_600_000;
