import { supabase } from '../supabase-client.js';

const VIDEO_BUCKET = 'test-videos';

/**
 * Normalize a stored video reference to a bucket object path.
 * Accepts both the new form (raw storage path, e.g. "userId/run_x.webm")
 * and the legacy form (full public URL containing "/test-videos/").
 */
export function toVideoStoragePath(stored: string): string {
  if (stored.includes('/test-videos/')) {
    const tail = stored.split('/test-videos/')[1] || '';
    return decodeURIComponent(tail.split('?')[0] || '');
  }
  return stored;
}

/**
 * Produce a short-lived signed URL for a stored video reference.
 * Returns null when signing fails so callers can degrade gracefully.
 */
export async function signVideoUrl(
  stored: string | undefined | null,
  expiresIn = 3600
): Promise<string | null> {
  if (!stored) return null;
  const objectPath = toVideoStoragePath(stored);
  if (!objectPath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(objectPath, expiresIn);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
