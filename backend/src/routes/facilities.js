import express from 'express';
import { query, buildInsert, buildUpdateSet } from '../services/db.js';

const router = express.Router();

// GET /api/facilities?buyer_id=<uuid>
router.get('/', async (req, res) => {
  const { buyer_id } = req.query;
  if (!buyer_id) return res.status(400).json({ error: 'buyer_id query param required' });

  try {
    const { rows: data } = await query(
      'SELECT * FROM facilities WHERE buyer_id = $1 ORDER BY created_at ASC',
      [buyer_id]
    );
    res.json({ data });
  } catch (err) {
    console.error('Facility list error:', err);
    res.status(500).json({ error: err.message });
  }
});
// GET /api/facilities/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await query('SELECT * FROM facilities WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Facility not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    console.error('Facility fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/facilities
router.post('/', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Creating facility:', payload);

    const { cols, placeholders, values } = buildInsert(payload);
    const { rows } = await query(
      `INSERT INTO facilities (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    console.error('Internal error:', err);
    res.status(500).json({ error: 'Failed to create facility' });
  }
});

// PUT /api/facilities/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body, updated_at: new Date() };
    console.log(`Updating facility ${id}:`, payload);

    const { setClause, values } = buildUpdateSet(payload);
    const { rows } = await query(
      `UPDATE facilities SET ${setClause} WHERE id = $${values.length + 1} RETURNING *`,
      [...values, id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Facility not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    console.error('Internal error:', err);
    res.status(500).json({ error: 'Failed to update facility' });
  }
});

// DELETE /api/facilities/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Deleting facility ${id}`);

    await query('DELETE FROM facilities WHERE id = $1', [id]);
    res.json({ message: 'Facility deleted' });
  } catch (err) {
    console.error('Internal error:', err);
    res.status(500).json({ error: 'Failed to delete facility' });
  }
});

export default router;
