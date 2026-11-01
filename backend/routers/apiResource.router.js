import express from 'express';
import authentication from '../middlewares/auth.js';
import { 
  createResource, 
  listResources, 
  getRentedResources,
  proxyRequest, 
  rentResource,
  getUsageStats,
  updateResource,
  deleteResource 
} from '../controllers/apiResource.controller.js';

const router = express.Router();

// Public/Buyer routes
router.get('/', listResources);
router.get('/usage-stats', authentication, getUsageStats);
router.get('/rented', authentication, getRentedResources);
router.post('/rent', authentication, rentResource);
router.post('/proxy/:resourceId', authentication, proxyRequest);

// Host routes
router.post('/register', authentication, createResource);
router.patch('/:resourceId', authentication, updateResource);
router.delete('/:resourceId', authentication, deleteResource);

export default router;
