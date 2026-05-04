/**
 * Compresses an image file, resizing it to a maximum width while maintaining aspect ratio,
 * and converting it to WebP format.
 *
 * @param {File} file - The original image file.
 * @param {number} maxWidth - The maximum width in pixels.
 * @param {number} quality - The quality of the WebP output (0 to 1).
 * @returns {Promise<File>} A promise that resolves to the compressed WebP File.
 */
export async function compressImage(file, maxWidth = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type.match(/image.*/)) {
      reject(new Error('File is not an image'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        let width = image.width;
        let height = image.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas is empty'));
              return;
            }
            // Create a new File object
            const fileName = file.name.split('.')[0] + '.webp';
            const compressedFile = new File([blob], fileName, {
              type: 'image/webp',
              lastModified: Date.now(),
            });
            resolve({ file: compressedFile, width, height });
          },
          'image/webp',
          quality
        );
      };
      image.onerror = (err) => reject(err);
      image.src = readerEvent.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
