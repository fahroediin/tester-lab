import { supabase } from '../supabase-client.js';

const ATTACHMENT_BUCKET = 'feedback-attachments';

/**
 * Produce a short-lived signed URL for a feedback attachment stored in the
 * (private) Supabase bucket. Returns null when signing fails so the caller can
 * degrade gracefully instead of leaking a non-working public URL.
 */
export async function resolveAttachmentUrl(attachment: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(attachment, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    // fall through to null on signing failure
  }
  return null;
}
