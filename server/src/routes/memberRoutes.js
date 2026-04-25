const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

/**
 * Route for field unit members to update their live location.
 * Handled by the generic updateLocation controller which is role-aware.
 */
router.get('/field-units', auth, authController.getFieldUnits);
router.patch('/update-location', auth, authController.updateLocation);

module.exports = router;
