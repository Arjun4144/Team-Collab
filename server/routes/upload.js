const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryHelper');

// Multer Setup: Memory Storage
const storage = multer.memoryStorage();

// File Validation: Only images allowed, max size 2MB
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed!'), false);
    }
  },
});

/**
 * @route   POST /api/upload/test
 * @desc    Test image upload to Cloudinary
 * @access  Public (for testing purposes)
 */
router.post('/test', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image file' });
    }

    const result = await uploadToCloudinary(req.file.buffer);
    
    res.status(200).json({
      message: 'Image uploaded successfully',
      data: {
        url: result.url,
        public_id: result.public_id,
      },
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({
      message: 'Failed to upload image',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/upload/delete-test
 * @desc    Test image deletion from Cloudinary
 * @access  Public (for testing purposes)
 */
router.post('/delete-test', async (req, res) => {
  const { public_id } = req.body;
  
  if (!public_id) {
    return res.status(400).json({ message: 'public_id is required' });
  }

  try {
    const result = await deleteFromCloudinary(public_id);
    res.status(200).json({
      message: 'Image deleted successfully',
      result,
    });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({
      message: 'Failed to delete image',
      error: error.message,
    });
  }
});

module.exports = router;
