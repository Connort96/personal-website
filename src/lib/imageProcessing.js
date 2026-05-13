import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

/**
 * Downloads an image from a URL, compresses it to save space, and uploads it to Supabase storage.
 * @param {string} openLibraryUrl - The URL of the image to download (e.g., from OpenLibrary).
 * @param {string} isbn - The ISBN of the book, used for naming the file.
 * @returns {Promise<string|null>} - The public URL of the uploaded image, or the original URL/null if it fails.
 */
export async function processAndUploadCover(openLibraryUrl, isbn) {
  if (!openLibraryUrl) return null;

  try {
    // 1. Download the image as a Blob
    // OpenLibrary usually supports CORS, but if not this might fail and hit the catch block.
    const response = await fetch(openLibraryUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const blob = await response.blob();

    // 2. Compress the Blob
    const options = {
      maxSizeMB: 0.05, // 50KB target
      maxWidthOrHeight: 800,
      useWebWorker: true,
    };
    
    const compressedBlob = await imageCompression(blob, options);

    // 3. Upload to Supabase Storage
    const fileName = `covers/${isbn || 'unknown'}-${Date.now()}.jpg`;
    
    // We assume there is a 'book-covers' bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('book-covers')
      .upload(fileName, compressedBlob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg'
      });

    if (uploadError) throw uploadError;

    // 4. Return the public URL
    const { data: publicUrlData } = supabase.storage
      .from('book-covers')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;

  } catch (err) {
    console.warn(`[ImageProcessing] Failed to process and upload cover for ${isbn}. Falling back to original URL.`, err);
    // Graceful fallback: return the original URL if anything goes wrong
    return openLibraryUrl;
  }
}
