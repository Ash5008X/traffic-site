const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const auth = require('../middleware/auth');

router.post('/', auth, incidentController.create);
router.get('/', auth, incidentController.getAll);
router.get('/nearby', auth, incidentController.nearby);
router.get('/stats', auth, incidentController.getStats);
router.get('/heatmap', auth, incidentController.getHeatmap);
router.get('/dashboard-stats', auth, incidentController.dashboardStats);
router.get('/:id', auth, incidentController.getById);
router.patch('/:id/status', auth, incidentController.updateStatus);
router.patch('/:id/accept', auth, incidentController.accept);
router.patch('/:id/dismiss', auth, incidentController.dismiss);
router.post('/:id/chat', auth, incidentController.addChat);
router.post('/:id/actions', auth, incidentController.addAction);
router.post('/:id/backup-request', auth, incidentController.backupRequest);
router.post('/:id/request-assignment', auth, incidentController.requestAssignment);

module.exports = router;
