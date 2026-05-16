import express from 'express';
import { supabase } from '../services/supabase.js';

const router = express.Router();

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

export default router;
