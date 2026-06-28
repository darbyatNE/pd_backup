import express from 'express';
import { query, buildInsert, buildUpdateSet, buildUpsert } from '../services/db.js';
import { authenticate } from '../middleware/auth.js';
import { createS3Upload } from '../services/s3.js';

const router = express.Router();

const uploadHistMw = createS3Upload('historical-interval-meter', 50);

router.get('/', async (req, res) => {
  try {
    const { buyer_id, facility_id } = req.query;
    if (!buyer_id) return res.status(400).json({ error: 'buyer_id is required' });

    let sql = 'SELECT * FROM data_centers WHERE buyer_id = $1';
    const params = [buyer_id];

    if (facility_id) {
      sql += ' AND facility_id = $2';
      params.push(facility_id);
    }

    const { rows } = await query(sql, params);
    res.status(200).json({ data: rows });
  } catch (err) {
    console.error('Datacenters fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch datacenters' });
  }
});

router.post('/submit', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received datacenter details:', payload);

    const { cols, placeholders, updateSet, values } = buildUpsert(payload, 'FAC_ID');
    const { rows } = await query(
      `INSERT INTO data_centers (${cols}) VALUES (${placeholders})
       ON CONFLICT ("FAC_ID") DO UPDATE SET ${updateSet} RETURNING *`,
      values
    );

    res.status(200).json({ message: 'Datacenter profile saved successfully', data: rows[0] });
  } catch (err) {
    console.error('Internal server error:', err);
    res.status(500).json({ error: 'Failed to submit datacenter details' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    console.log(`Updating datacenter ${id}:`, payload);

    const { setClause, values } = buildUpdateSet(payload);
    const { rows } = await query(
      `UPDATE data_centers SET ${setClause} WHERE id = $${values.length + 1} RETURNING *`,
      [...values, id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Datacenter not found' });
    res.status(200).json({ message: 'Datacenter profile updated successfully', data: rows[0] });
  } catch (err) {
    console.error('Internal server error:', err);
    res.status(500).json({ error: 'Failed to update datacenter details' });
  }
});

router.post('/:id/hist-mw', authenticate, uploadHistMw.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const { rows } = await query(
      'UPDATE data_centers SET "HIST_MW" = $1 WHERE id = $2 RETURNING *',
      [file.key, id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Datacenter not found' });

    res.status(200).json({
      message: 'Historical interval meter CSV uploaded successfully',
      key: file.key,
      location: file.location,
      data: rows[0],
    });
  } catch (err) {
    console.error('HIST_MW upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload historical meter CSV' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Deleting datacenter ${id}`);

    await query('DELETE FROM data_centers WHERE id = $1', [id]);
    res.status(200).json({ message: 'Datacenter profile deleted successfully' });
  } catch (err) {
    console.error('Internal server error:', err);
    res.status(500).json({ error: 'Failed to delete datacenter details' });
  }
});

export default router;
