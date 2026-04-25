const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const auth = require('../middleware/auth');

router.get('/', auth, reportController.getReports);
router.get('/team', auth, reportController.getTeamReport);
router.get('/timeline', auth, reportController.getTimeline);
router.get('/export/pdf', auth, reportController.exportPdf);
router.get('/export/csv', auth, reportController.exportCsv);

module.exports = router;