import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
  CatalogMediaEntry,
  OverviewResponse,
} from "../../src/shared/types";
import {
  catalogImageObjectKeyForVariant,
  catalogImageStoredObjectKeys,
} from "../../src/worker/catalog-images";

const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function validPng(): Uint8Array {
  return Uint8Array.from(atob(VALID_PNG_BASE64), (value) =>
    value.charCodeAt(0),
  );
}

async function firstCatalogId(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT id FROM card_catalog ORDER BY id LIMIT 1",
  ).first<{ id: number }>();
  if (!row) throw new Error("seeded catalog is empty");
  return row.id;
}

async function secondCatalogId(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT id FROM card_catalog ORDER BY id LIMIT 1 OFFSET 1",
  ).first<{ id: number }>();
  if (!row) throw new Error("seeded catalog has fewer than two entries");
  return row.id;
}

async function listMedia(): Promise<CatalogMediaEntry[]> {
  const response = await SELF.fetch(
    "https://example.com/api/admin/catalog-media",
  );
  expect(response.status).toBe(200);
  return response.json<CatalogMediaEntry[]>();
}

async function upload(
  catalogId: number,
  bytes: Uint8Array,
  contentType = "image/png",
  filename = "正面卡圖.png",
): Promise<Response> {
  return SELF.fetch(
    `https://example.com/api/admin/catalog/${catalogId}/image`,
    {
      method: "PUT",
      headers: {
        "content-type": contentType,
        "x-card-image-size": String(bytes.byteLength),
        "x-card-image-filename": encodeURIComponent(filename),
      },
      body: bytes,
    },
  );
}

describe("catalog media", () => {
  it("lists missing slots, uploads and replaces a front image, then deletes it", async () => {
    const catalogId = await firstCatalogId();
    const initial = await listMedia();
    const initialEntry = initial.find((entry) => entry.catalogId === catalogId);
    expect(initialEntry).toMatchObject({ catalogId, front: null });
    const initialOverview = await SELF.fetch(
      "https://example.com/api/overview",
    ).then((response) => response.json<OverviewResponse>());
    expect(
      initialOverview.cells.find((cell) => cell.catalogId === catalogId)?.image,
    ).toBeNull();

    const firstBytes = validPng();
    const firstUpload = await upload(catalogId, firstBytes);
    expect(firstUpload.status).toBe(200);
    await expect(firstUpload.json()).resolves.toEqual({
      ok: true,
      revision: 1,
    });

    const afterFirst = await listMedia();
    const saved = afterFirst.find((entry) => entry.catalogId === catalogId);
    expect(saved?.front).toMatchObject({
      side: "front",
      contentType: "image/webp",
      originalFilename: "正面卡圖.png",
      revision: 1,
    });
    expect(saved?.front?.byteSize).toBeGreaterThan(0);
    expect(saved?.front?.url).toBe(
      `/api/catalog/${catalogId}/image?side=front&variant=card&v=1`,
    );
    expect(saved?.front?.thumbnailUrl).toBe(
      `/api/catalog/${catalogId}/image?side=front&variant=thumb&v=1`,
    );
    expect(
      (
        await SELF.fetch(
          `https://example.com/api/catalog/${catalogId}/image?side=front&variant=card&v=999`,
        )
      ).status,
    ).toBe(404);

    const publicOverview = await SELF.fetch(
      "https://example.com/api/overview",
    ).then((response) => response.json<OverviewResponse>());
    const publicCell = publicOverview.cells.find(
      (cell) => cell.catalogId === catalogId,
    );
    expect(publicCell?.image).toEqual({
      url: `/api/catalog/${catalogId}/image?side=front&variant=card&v=1`,
      thumbnailUrl: `/api/catalog/${catalogId}/image?side=front&variant=thumb&v=1`,
    });
    expect(Object.keys(publicCell?.image ?? {})).toEqual([
      "url",
      "thumbnailUrl",
    ]);

    const publicImage = await SELF.fetch(
      `https://example.com${saved?.front?.url}`,
    );
    expect(publicImage.status).toBe(200);
    expect(publicImage.headers.get("content-type")).toBe("image/webp");
    expect(publicImage.headers.get("cache-control")).toContain("immutable");
    expect(publicImage.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await publicImage.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const etag = publicImage.headers.get("etag");
    expect(etag).toBeTruthy();

    const thumbnail = await SELF.fetch(
      `https://example.com${saved?.front?.thumbnailUrl}`,
    );
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get("content-type")).toBe("image/webp");
    expect(thumbnail.headers.get("cache-control")).toContain("immutable");
    expect((await thumbnail.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const notModified = await SELF.fetch(
      `https://example.com${saved?.front?.url}`,
      { headers: { "if-none-match": etag ?? "" } },
    );
    expect(notModified.status).toBe(304);

    const oldMetadata = await env.DB.prepare(
      "SELECT object_key AS objectKey FROM catalog_media WHERE catalog_id = ? AND side = 'front'",
    )
      .bind(catalogId)
      .first<{ objectKey: string }>();
    expect(oldMetadata).not.toBeNull();
    expect(oldMetadata?.objectKey).toMatch(/\/card\.webp$/);
    const oldObjectKeys = catalogImageStoredObjectKeys(
      oldMetadata?.objectKey ?? "missing",
    );
    expect(oldObjectKeys).toHaveLength(2);
    const storedObjects = await env.CARD_IMAGES.list({
      prefix: `catalog/${catalogId}/front/`,
    });
    expect(storedObjects.objects.map((object) => object.key).sort()).toEqual(
      [...oldObjectKeys].sort(),
    );
    expect(
      await env.CARD_IMAGES.get(
        catalogImageObjectKeyForVariant(
          oldMetadata?.objectKey ?? "missing",
          "thumb",
        ),
      ),
    ).not.toBeNull();

    const secondBytes = validPng();
    const replacement = await upload(
      catalogId,
      secondBytes,
      "image/png",
      "replacement.png",
    );
    expect(replacement.status).toBe(200);
    await expect(replacement.json()).resolves.toEqual({
      ok: true,
      revision: 2,
    });
    expect(
      await Promise.all(oldObjectKeys.map((key) => env.CARD_IMAGES.get(key))),
    ).toEqual([null, null]);

    const afterReplacement = await listMedia();
    const replaced = afterReplacement.find(
      (entry) => entry.catalogId === catalogId,
    );
    expect(replaced?.front).toMatchObject({
      contentType: "image/webp",
      originalFilename: "replacement.png",
      revision: 2,
    });

    const currentMetadata = await env.DB.prepare(
      "SELECT object_key AS objectKey FROM catalog_media WHERE catalog_id = ? AND side = 'front'",
    )
      .bind(catalogId)
      .first<{ objectKey: string }>();
    const deleted = await SELF.fetch(
      `https://example.com/api/admin/catalog/${catalogId}/image`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toEqual({ ok: true });
    const currentObjectKeys = catalogImageStoredObjectKeys(
      currentMetadata?.objectKey ?? "missing",
    );
    expect(
      await Promise.all(
        currentObjectKeys.map((key) => env.CARD_IMAGES.get(key)),
      ),
    ).toEqual([null, null]);
    expect(
      await env.DB.prepare(
        "SELECT 1 FROM catalog_media WHERE catalog_id = ? AND side = 'front'",
      )
        .bind(catalogId)
        .first(),
    ).toBeNull();
    expect(
      (
        await SELF.fetch(
          `https://example.com/api/catalog/${catalogId}/image?side=front&v=2`,
        )
      ).status,
    ).toBe(404);
    const deletedOverview = await SELF.fetch(
      "https://example.com/api/overview",
    ).then((response) => response.json<OverviewResponse>());
    expect(
      deletedOverview.cells.find((cell) => cell.catalogId === catalogId)?.image,
    ).toBeNull();
  });

  it("rejects unsupported, invalid, oversized, and unknown-slot uploads", async () => {
    const catalogId = await firstCatalogId();

    expect(
      (await upload(catalogId, new Uint8Array([1]), "image/svg+xml")).status,
    ).toBe(415);
    expect((await upload(catalogId, new Uint8Array())).status).toBe(400);
    expect(
      (await upload(catalogId, new Uint8Array([0xff, 0xd8, 0xff, 0xd9])))
        .status,
    ).toBe(422);

    expect(
      (
        await SELF.fetch(
          `https://example.com/api/catalog/${catalogId}/image?variant=original`,
        )
      ).status,
    ).toBe(400);

    const oversized = await SELF.fetch(
      `https://example.com/api/admin/catalog/${catalogId}/image`,
      {
        method: "PUT",
        headers: {
          "content-type": "image/jpeg",
          "x-card-image-size": String(15 * 1024 * 1024 + 1),
        },
        body: new Uint8Array([1]),
      },
    );
    expect(oversized.status).toBe(413);

    const mismatchedSize = await SELF.fetch(
      `https://example.com/api/admin/catalog/${catalogId}/image`,
      {
        method: "PUT",
        headers: {
          "content-type": "image/jpeg",
          "x-card-image-size": "2",
        },
        body: new Uint8Array([1]),
      },
    );
    expect(mismatchedSize.status).toBe(400);

    expect((await upload(999_999, new Uint8Array([1]))).status).toBe(404);
  });

  it("caches immutable optimized variants before reading R2 again", async () => {
    const catalogId = await secondCatalogId();
    expect((await upload(catalogId, validPng())).status).toBe(200);
    const media = (await listMedia()).find(
      (entry) => entry.catalogId === catalogId,
    );
    expect(media?.front).not.toBeNull();

    const first = await SELF.fetch(`https://example.com${media?.front?.url}`);
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const stored = await env.DB.prepare(
      "SELECT object_key AS objectKey FROM catalog_media WHERE catalog_id = ? AND side = 'front'",
    )
      .bind(catalogId)
      .first<{ objectKey: string }>();
    expect(stored).not.toBeNull();
    await env.CARD_IMAGES.delete(
      catalogImageStoredObjectKeys(stored?.objectKey ?? "missing"),
    );

    const cached = await SELF.fetch(`https://example.com${media?.front?.url}`, {
      headers: { "if-none-match": etag ?? "" },
    });
    expect(cached.status).toBe(304);
  });

  it("prevents a series edit from orphaning an uploaded image", async () => {
    const created = await SELF.fetch("https://example.com/api/admin/series", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "MEDIA SERIES",
        volume: 4,
        characters: ["Alice", "Bob"],
        rarities: ["R"],
      }),
    });
    expect(created.status).toBe(201);

    const alice = await env.DB.prepare(
      "SELECT id FROM card_catalog WHERE series = ? AND character = ? AND rarity = ?",
    )
      .bind("MEDIA SERIES", "Alice", "R")
      .first<{ id: number }>();
    expect(alice).not.toBeNull();
    expect((await upload(alice?.id ?? 0, validPng())).status).toBe(200);

    const removeAlice = await SELF.fetch(
      "https://example.com/api/admin/series/MEDIA%20SERIES",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          volume: 4,
          characters: ["Bob"],
          rarities: ["R"],
        }),
      },
    );
    expect(removeAlice.status).toBe(409);
    await expect(removeAlice.json()).resolves.toMatchObject({
      error: expect.stringContaining("卡圖"),
    });
    expect(
      await env.DB.prepare(
        "SELECT 1 FROM catalog_media WHERE catalog_id = ? AND side = 'front'",
      )
        .bind(alice?.id ?? 0)
        .first(),
    ).not.toBeNull();
  });
});
