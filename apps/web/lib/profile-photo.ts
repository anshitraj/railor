const PHOTO = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;
export const PHOTO_MAX_LENGTH = 90_000;

/** An uploaded profile photo stored inline (a data URL), as opposed to a Google or GitHub photo URL. */
export function isUploadedPhoto(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith("data:"));
}

/** A small, real JPG, PNG or WebP — its bytes must match the type it claims. */
export function validProfilePhoto(dataUrl: string): boolean {
  if (dataUrl.length > PHOTO_MAX_LENGTH) return false;
  const match = PHOTO.exec(dataUrl);
  if (!match) return false;
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length < 100) return false;
  const kind = match[1];
  if (kind === "png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (kind === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}
