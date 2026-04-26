import express from 'express';
import { supabase } from '../services/supabase.js';

const router = express.Router();

// POST /api/onboarding/submit
router.post('/submit', async (req, res) => {
    try {
        const { userId, ...details } = req.body;
        console.log("received onboarding details", req.body);

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const { data, error } = await supabase
            .from('onboarding_details')
            .upsert({
                id: userId,
                ...details,
                updated_at: new Date()
            }, { onConflict: 'id' })
            .select()
            .single();

        if (error) {
            console.error('Submission error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Update user record to mark onboarding as completed
        await supabase
            .from('users')
            .update({ onboarding_completed: true })
            .eq('id', userId);

        res.status(200).json({ message: 'Onboarding completed successfully', data });
    } catch (err) {
        console.error('Internal server error:', err);
        res.status(500).json({ error: 'Failed to submit onboarding details' });
    }
});

export default router;
