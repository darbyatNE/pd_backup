import express from 'express';
import { supabase } from '../services/supabase.js';
import { createS3Upload, generatePresignedUrl, deleteFile } from '../services/s3.js';

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

// Configure multer for S3 uploads (max 15MB, stored under onboarding/ prefix)
const uploadToS3 = createS3Upload('onboarding', 15);

// POST /api/onboarding/onboardingdocs — Upload onboarding documents
// No auth required because the user just signed up and may not have a session yet.
router.post('/onboardingdocs', uploadToS3.array('files', 10), async (req, res) => {
    try {
        const { buyer_id } = req.body;
        const files = req.files;

        if (!buyer_id) {
            return res.status(400).json({ error: 'buyer_id is required' });
        }

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        // Build power_plans records tagged with source: 'onboarding'
        const planRecords = files.map((file) => ({
            buyer_id,
            plan_type: 'historical',
            facility_type: 'brownfield',           // sensible default for onboarding
            document_category: 'historical_invoice', // sensible default for onboarding
            file_name: file.originalname,
            file_path: file.key,                    // S3 key
            file_size: file.size,
            metadata: {
                source: 'onboarding',               // ← tag used by Documents page to group
                uploaded_at: new Date().toISOString(),
                mime_type: file.mimetype,
                s3_location: file.location || null,
            },
            created_at: new Date().toISOString(),
        }));

        const { data, error } = await supabase
            .from('power_plans')
            .insert(planRecords)
            .select();

        if (error) {
            console.error('Error inserting onboarding documents:', error);
            return res.status(500).json({ error: 'Failed to save document records' });
        }

        res.status(201).json({
            message: `Successfully uploaded ${files.length} file(s)`,
            plans: data,
        });
    } catch (error) {
        console.error('Onboarding upload error:', error);
        res.status(500).json({ error: error.message || 'Failed to upload files' });
    }
});

export default router;
