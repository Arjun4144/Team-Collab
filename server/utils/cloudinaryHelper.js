const cloudinary = require('../config/cloudinary');

/**
 * Uploads a file buffer to Cloudinary using upload_stream
 * @param {Buffer} fileBuffer - The file buffer from multer
 * @returns {Promise<{url: string, public_id: string}>}
 */
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'nexus_uploads',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    uploadStream.end(fileBuffer);
  });
};

/**
 * Deletes an image from Cloudinary using its public_id
 * @param {string} public_id - The public_id of the image to delete
 * @returns {Promise<any>}
 */
const deleteFromCloudinary = async (public_id) => {
  try {
    const result = await cloudinary.uploader.destroy(public_id);
    return result;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
};
