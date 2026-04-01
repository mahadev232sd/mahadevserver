import { Router } from 'express';
import { writeAllUsersExcel } from '../utils/writeUsersExcel.js';

/**
 * No auth — paste URL in Chrome to download users Excel.
 * Anyone who can reach this URL gets the export; protect with firewall / VPN in production if needed.
 */
const router = Router();

router.get('/users', async (req, res) => {
  try {
    await writeAllUsersExcel(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ message: 'Export failed' });
  }
});

export default router;
