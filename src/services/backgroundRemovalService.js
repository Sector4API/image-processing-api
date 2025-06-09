/**
 * Background removal service using rembg
 */

// For a React frontend with Node.js backend approach
import axios from 'axios';

/**
 * Removes the background from an image using rembg
 * @param {File} imageFile - The image file to process
 * @returns {Promise<File>} - A promise that resolves to the processed image as a File
 */
export const removeBackground = async (file) => {
  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await axios.post('/api/process-image', formData, {
      responseType: 'blob',
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    // Create a new File object from the response blob
    return new File([response.data], `processed_${file.name}`, {
      type: 'image/png'
    });
  } catch (error) {
    if (error.response) {
      throw new Error(`Server error: ${error.response.data}`);
    } else if (error.request) {
      throw new Error('No response from server');
    } else {
      throw new Error(`Error: ${error.message}`);
    }
  }
};

/**
 * Process multiple images with background removal
 * @param {File[]} imageFiles - Array of image files to process
 * @returns {Promise<{original: File, processed: File}[]>} - Array of processed image results
 */
export const batchRemoveBackground = async (files) => {
  const results = [];
  
  for (let i = 0; i < files.length; i++) {
    try {
      const result = await removeBackground(files[i]);
      results.push({
        original: files[i],
        processed: result,
        success: true
      });
    } catch (error) {
      console.error('Error processing file:', files[i].name, error);
      results.push({
        original: files[i],
        error: error.message,
        success: false
      });
    }
  }
  
  return results;
};