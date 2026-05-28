import express from 'express';
import { supabase } from '../services/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { createS3Upload } from '../services/s3.js';

const router = express.Router();

const uploadHistMw = createS3Upload('historical-interval-meter', 50);

router.post('/submit', async (req, res) => {
    try {
        const payload = req.body;
        console.log("Received datacenter details:", payload);

        // Map frontend fields (which are named as the symbols) to the data_centers table.
        const { data, error } = await supabase
            .from('data_centers')
            .insert([payload])
            .select()
            .single();

        if (error) {
            console.error('Submission error:', error);
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({ message: 'Datacenter profile saved successfully', data });
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

        const { data, error } = await supabase
            .from('data_centers')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Update error:', error);
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({ message: 'Datacenter profile updated successfully', data });
    } catch (err) {
        console.error('Internal server error:', err);
        res.status(500).json({ error: 'Failed to update datacenter details' });
    }
});

router.post('/:id/hist-mw', authenticate, uploadHistMw.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { data, error } = await supabase
            .from('data_centers')
            .update({ HIST_MW: file.key })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('HIST_MW DB update error:', error);
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({
            message: 'Historical interval meter CSV uploaded successfully',
            key: file.key,
            location: file.location,
            data,
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

        const { error } = await supabase
            .from('data_centers')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Delete error:', error);
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({ message: 'Datacenter profile deleted successfully' });
    } catch (err) {
        console.error('Internal server error:', err);
        res.status(500).json({ error: 'Failed to delete datacenter details' });
    }
});

export default router;
