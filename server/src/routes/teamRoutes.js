const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const auth = require('../middleware/auth');

router.get('/', auth, teamController.getAll);
router.get('/my', auth, teamController.getByAdmin);
router.get('/unassigned', auth, teamController.getUnassignedFieldUnits);
router.get('/:id', auth, teamController.getTeamDetails);
router.post('/', auth, teamController.create);
router.post('/:id/members', auth, teamController.addMembers);
router.patch('/:id/remove-member', auth, teamController.removeMember);
router.delete('/:id', auth, teamController.deleteTeam);

module.exports = router;
