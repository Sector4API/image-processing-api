/**
 * Image processing service for handling various image operations
 */

/**
 * Resizes an image to fit within the specified dimensions while maintaining aspect ratio
 * @param {File} imageFile - The original image file
 * @param {number} targetWidth - The target width in pixels
 * @param {number} targetHeight - The target height in pixels
 * @returns {Promise<File>} - A promise that resolves to the resized image as a File
 */
export const resizeImage = (imageFile, targetWidth = 500, targetHeight = 500) => {
  return new Promise((resolve, reject) => {
    // Create a FileReader to read the image file
    const reader = new FileReader();
    
    reader.onload = (event) => {
      // Create an image element to load the image data
      const img = new Image();
      
      img.onload = () => {
        // Calculate the scaling ratio to maintain aspect ratio
        const originalWidth = img.width;
        const originalHeight = img.height;
        
        // Determine if we need to scale up or down
        let scaleFactor;
        let newWidth, newHeight;
        
        // Calculate the aspect ratios
        const targetAspectRatio = targetWidth / targetHeight;
        const originalAspectRatio = originalWidth / originalHeight;
        
        if (originalAspectRatio > targetAspectRatio) {
          // Image is wider than the target aspect ratio
          newWidth = targetWidth;
          newHeight = targetWidth / originalAspectRatio;
        } else {
          // Image is taller than the target aspect ratio
          newHeight = targetHeight;
          newWidth = targetHeight * originalAspectRatio;
        }
        
        // Create a canvas element to perform the resizing
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        // Get the canvas context and fill with white background
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        
        // Calculate centering position
        const offsetX = (targetWidth - newWidth) / 2;
        const offsetY = (targetHeight - newHeight) / 2;
        
        // Draw the resized image centered on the canvas
        ctx.drawImage(img, offsetX, offsetY, newWidth, newHeight);
        
        // Convert the canvas to a Blob
        canvas.toBlob((blob) => {
          if (blob) {
            // Create a new file with the same name but resized
            const resizedFile = new File(
              [blob], 
              imageFile.name, 
              { type: imageFile.type, lastModified: Date.now() }
            );
            resolve(resizedFile);
          } else {
            reject(new Error('Failed to resize image'));
          }
        }, imageFile.type);
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      // Set the source of the image to the FileReader result
      img.src = event.target.result;
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };
    
    // Read the image file as a data URL
    reader.readAsDataURL(imageFile);
  });
};

/**
 * Process multiple images with resizing
 * @param {File[]} imageFiles - Array of image files to process
 * @param {number} width - Target width for resizing
 * @param {number} height - Target height for resizing
 * @returns {Promise<{original: File, processed: File}[]>} - Array of processed image results
 */
export const batchResizeImages = async (imageFiles, width = 500, height = 500) => {
  const results = [];
  
  for (const file of imageFiles) {
    try {
      const resizedImage = await resizeImage(file, width, height);
      results.push({
        original: file,
        processed: resizedImage,
        success: true
      });
    } catch (error) {
      console.error(`Error processing ${file.name}:`, error);
      results.push({
        original: file,
        error: error.message,
        success: false
      });
    }
  }
  
  return results;
};