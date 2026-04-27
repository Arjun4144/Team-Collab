const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
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
 * @access  Private (Admin only)
 */
router.post('/test', auth, upload.single('image'), async (req, res) => {
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
    res.status(500).json({
      message: 'Failed to upload image',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/upload/delete-test
 * @desc    Test image deletion from Cloudinary
 * @access  Private (Admin only)
 */
router.post('/delete-test', auth, async (req, res) => {
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
    res.status(500).json({
      message: 'Failed to delete image',
      error: error.message,
    });
  }
});

module.exports = router;
