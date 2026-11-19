import { describe, expect, it } from "vitest";
import { isUploadedPhoto, validProfilePhoto } from "./profile-photo";

const png = (extra = 200) => `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra)]).toString("base64")}`;

describe("profile photo uploads", () => {
  it("accepts a real PNG, JPEG or WebP", () => {
    expect(validProfilePhoto(png())).toBe(true);
    expect(validProfilePhoto(`data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(200)]).toString("base64")}`)).toBe(true);
    expect(validProfilePhoto(`data:image/webp;base64,${Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(200)]).toString("base64")}`)).toBe(true);
  });

  it("rejects a file whose bytes don't match its type, an SVG, or anything too large", () => {
    expect(validProfilePhoto(`data:image/png;base64,${Buffer.alloc(300).toString("base64")}`)).toBe(false);
    expect(validProfilePhoto(`data:image/svg+xml;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`)).toBe(false);
    expect(validProfilePhoto(png(80_000))).toBe(false);
    expect(validProfilePhoto("https://example.com/me.png")).toBe(false);
  });

  it("tells an uploaded photo from a Google one", () => {
    expect(isUploadedPhoto(png())).toBe(true);
    expect(isUploadedPhoto("https://lh3.googleusercontent.com/a/x")).toBe(false);
    expect(isUploadedPhoto(null)).toBe(false);
  });
});
