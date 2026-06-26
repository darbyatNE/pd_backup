import express from 'express';
import { query } from '../services/db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /api/transactions
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows: userRows } = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    const role = userRows[0]?.role;

    let sql = `
      SELECT t.*,
        (SELECT row_to_json(p) FROM (SELECT * FROM projects WHERE id = t.project_id) p) AS project,
        (SELECT row_to_json(u) FROM (SELECT * FROM users WHERE id = t.buyer_id) u) AS buyer,
        (SELECT row_to_json(s) FROM (SELECT * FROM users WHERE id = t.seller_id) s) AS seller
      FROM transactions t
    `;
    const params = [];

    if (role === 'buyer') {
      sql += ' WHERE t.buyer_id = $1';
      params.push(req.user.id);
    } else if (role === 'seller') {
      sql += ' WHERE t.seller_id = $1';
      params.push(req.user.id);
    }

    sql += ' ORDER BY t.created_at DESC';

    const { rows: transactions } = await query(sql, params);
    res.json({ transactions });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /api/transactions
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      project_id, energy_amount_mwh, start_date, contract_duration_years,
      delivery_date, net_neutral_target, generation_preference,
    } = req.body;

    console.log('POST /api/transactions - Received body:', req.body);

    const { rows: projectRows } = await query(
      'SELECT seller_id FROM projects WHERE id = $1',
      [project_id]
    );

    if (!projectRows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { rows } = await query(
      `INSERT INTO transactions
        (project_id, buyer_id, seller_id, energy_amount_mwh, start_date,
         contract_duration_years, delivery_date, net_neutral_target, generation_preference, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted')
       RETURNING *`,
      [
        project_id, req.user.id, projectRows[0].seller_id,
        energy_amount_mwh, start_date, contract_duration_years,
        delivery_date, net_neutral_target, generation_preference,
      ]
    );

    res.status(201).json({ transaction: rows[0] });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id/status
router.put('/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { rows: txRows } = await query(
      'SELECT seller_id FROM transactions WHERE id = $1',
      [id]
    );

    if (!txRows[0] || txRows[0].seller_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { rows } = await query(
      'UPDATE transactions SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    res.json({ transaction: rows[0] });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

export default router;
