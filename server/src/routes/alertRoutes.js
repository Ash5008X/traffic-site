const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const auth = require('../middleware/auth');

router.post('/', auth, alertController.create);
router.get('/active', auth, alertController.getActive);
router.get('/history', auth, alertController.getHistory);
router.get('/my', auth, alertController.getMyAlerts);
router.post('/incident-notify', auth, alertController.sendIncidentNotification);
router.patch('/:id/cancel', auth, alertController.cancel);
router.patch('/:id/update', auth, alertController.update);

module.exports = router;