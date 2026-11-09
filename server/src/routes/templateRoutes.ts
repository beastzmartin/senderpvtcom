import { Router } from 'express';
import { TemplateController } from '../controllers/templateController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new TemplateController();

router.use(requireAuth);

router.get('/', controller.listTemplates);
router.post('/', controller.createTemplate);
router.get('/:id', controller.getTemplate);
router.put('/:id', controller.updateTemplate);
router.delete('/:id', controller.deleteTemplate);

export default router;
