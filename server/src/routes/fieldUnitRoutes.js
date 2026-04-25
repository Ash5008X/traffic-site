const express = require('express');

const router = express.Router();
const fieldUnitController = require('../controllers/fieldUnitController');
const auth = require('../middleware/auth');

router.get('/profile/stats', auth, fieldUnitController.getProfileStats);
router.get('/dashboard/stats', auth, fieldUnitController.getDashboardStats);
router.get('/incidents/data', auth, fieldUnitController.getIncidentsPageData);
router.patch('/me/arrived', auth, fieldUnitController.markArrivedMe);
router.get('/:id', auth, fieldUnitController.getById);
router.patch('/:id/status', auth, fieldUnitController.updateStatus);
router.patch('/:id/arrived', auth, fieldUnitController.markArrived);
router.patch('/:id/location', auth, fieldUnitController.updateLocation);
router.get('/:id/assigned', auth, fieldUnitController.getAssigned);
router.get('/:id/updates', auth, fieldUnitController.getUpdates);

module.exports = router;