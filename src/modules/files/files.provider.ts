import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type FilesClient = {
  upload(
    buffer: Buffer,
    mime: string,
    filename: string,
    assetId?: string,
    tenantKeyOverride?: string,
  ): Promise<{ url: string; public_id: string }>;

  delete(
    publicId: string,
    tenantKeyOverride?: string,
  ): Promise<{ message: string }>;

  list(
    tenantKeyOverride?: string,
  ): Promise<Array<{ url: string; public_id: string }>>;
};

type UrlsResponse = {
  imageId: string;
  assetId?: string;
  version?: number;
  originalUrl: string;
  variants?: { w320?: string; w800?: string; w1600?: string };
  status?: string;
};

type LatestResponse = {
  id: string; // imageId
  assetId: string;
  version: number;
};

type CreateUploadResponse = {
  imageId: string;
  assetId: string;
  version: number;
  originalKey: string;
  uploadUrl: string;
  headers?: Record<string, string>;
};

function extFromMime(mime: string): 'png' | 'jpg' | 'jpeg' | 'webp' | 'pdf' {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpeg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'application/pdf') return 'pdf';
  // fallback safe
  return 'jpeg';
}

function parseCsv(v?: string): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export const FilesProvider: Provider = {
  provide: 'FILES',
  useFactory: (config: ConfigService): FilesClient => {
    // ✅ “FILES_*” primero, fallback a “IMAGES_*” para compat
    const base =
      config.get<string>('FILES_API_BASE') ??
      config.get<string>('IMAGES_API_BASE');
    const apiKey =
      config.get<string>('FILES_API_KEY') ??
      config.get<string>('IMAGES_API_KEY');
    const tenantKeyDefault =
      config.get<string>('FILES_TENANT_KEY') ??
      config.get<string>('IMAGES_TENANT_KEY');

    const cdnBase =
      config.get<string>('FILES_CDN_BASE') ??
      config.get<string>('IMAGES_CLOUDFRONT_BASE');

    const maxBytes = Number(config.get('FILES_MAX_BYTES') ?? 15 * 1024 * 1024);
    const allowedMime = parseCsv(config.get<string>('FILES_ALLOWED_MIME'));

    if (!base) throw new Error('Missing FILES_API_BASE (or IMAGES_API_BASE)');
    if (!apiKey) throw new Error('Missing FILES_API_KEY (or IMAGES_API_KEY)');
    if (!tenantKeyDefault)
      throw new Error('Missing FILES_TENANT_KEY (or IMAGES_TENANT_KEY)');

    function authHeaders(tenantKeyOverride?: string): Record<string, string> {
      return {
        'x-tenant-key': tenantKeyOverride ?? tenantKeyDefault!,
        'x-api-key': apiKey!,
      };
    }

    return {
      async upload(buffer, mime, filename, assetId, tenantKeyOverride) {
        // ✅ validaciones de seguridad en el provider también
        if (!buffer?.length) throw new Error('Missing file buffer');
        if (buffer.length > maxBytes)
          throw new Error(`File too large (max ${maxBytes} bytes)`);
        if (allowedMime.length > 0 && !allowedMime.includes(mime)) {
          throw new Error(`Mime not allowed: ${mime}`);
        }

        const ext = extFromMime(mime);
        const bytes = buffer.length;

        // 1) createUpload (presigned PUT)
        const createRes = await fetch(`${base}/v1/images/upload`, {
          method: 'POST',
          headers: {
            ...authHeaders(tenantKeyOverride),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ext, mime, bytes }),
        });

        const createText = await createRes.text().catch(() => '');
        if (!createRes.ok) {
          throw new Error(
            `createUpload failed: ${createRes.status} ${createText}`,
          );
        }

        const created = JSON.parse(createText) as CreateUploadResponse;

        // 2) PUT to S3 (presigned)
        const putRes = await fetch(created.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mime },
          body: buffer as any,
        });

        if (!putRes.ok) {
          const text = await putRes.text().catch(() => '');
          throw new Error(`S3 PUT failed: ${putRes.status} ${text}`);
        }

        // 3) complete
        const completeRes = await fetch(
          `${base}/v1/images/${created.imageId}/complete`,
          {
            method: 'POST',
            headers: {
              ...authHeaders(tenantKeyOverride),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          },
        );

        if (!completeRes.ok) {
          const text = await completeRes.text().catch(() => '');
          throw new Error(`complete failed: ${completeRes.status} ${text}`);
        }

        // 4) urls
        const urlsRes = await fetch(
          `${base}/v1/images/${created.imageId}/urls`,
          {
            headers: {
              ...authHeaders(tenantKeyOverride),
              'Content-Type': 'application/json',
            },
          },
        );

        if (!urlsRes.ok) {
          const text = await urlsRes.text().catch(() => '');
          throw new Error(`urls failed: ${urlsRes.status} ${text}`);
        }

        const urls = (await urlsRes.json()) as UrlsResponse;

        return {
          url: urls.variants?.w800 ?? urls.originalUrl,
          public_id: created.assetId, // estable como cloudinary public_id
        };
      },

      async delete(publicId, tenantKeyOverride) {
        // publicId = assetId → borramos latest del asset
        const latestRes = await fetch(
          `${base}/v1/images/assets/${publicId}/latest`,
          {
            headers: {
              ...authHeaders(tenantKeyOverride),
              'Content-Type': 'application/json',
            },
          },
        );

        if (!latestRes.ok) {
          const text = await latestRes.text().catch(() => '');
          throw new Error(`latest failed: ${latestRes.status} ${text}`);
        }

        const latest = (await latestRes.json()) as LatestResponse;

        const delRes = await fetch(`${base}/v1/images/${latest.id}`, {
          method: 'DELETE',
          headers: {
            ...authHeaders(tenantKeyOverride),
            'Content-Type': 'application/json',
          },
        });

        if (!delRes.ok) {
          const text = await delRes.text().catch(() => '');
          throw new Error(`delete failed: ${delRes.status} ${text}`);
        }

        return { message: 'File deleted successfully' };
      },

      async list(tenantKeyOverride) {
        const res = await fetch(`${base}/v1/images`, {
          headers: {
            ...authHeaders(tenantKeyOverride),
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`list failed: ${res.status} ${text}`);
        }

        const rows = (await res.json()) as any[];

        // ✅ igual que tu provider: armamos URL w800 directo si hay CDN
        return rows.map((img) => {
          const url = cdnBase
            ? `${cdnBase}/tenants/${img.tenantKey}/assets/${img.assetId}/v_${img.version}/${img.id}/w_800.webp`
            : (img.originalUrl ?? '');

          return { url, public_id: img.assetId };
        });
      },
    };
  },
  inject: [ConfigService],
};
