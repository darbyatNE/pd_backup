import express from 'express';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { supabase } from '../services/supabase.js';
import { createS3Upload, generatePresignedUrl, deleteFile } from '../services/s3.js';

const router = express.Router();

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

// ONBOARDING_ALERT_EMAILS — comma-separated list set in ECS task env (e.g. "ben@example.com,felix@example.com,harleen@example.com")
// ONBOARDING_ALERT_SENDER — verified SES sender address set in ECS task env
const ALERT_RECIPIENTS = (process.env.ONBOARDING_ALERT_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
const ALERT_SENDER = process.env.ONBOARDING_ALERT_SENDER || '';

async function sendOnboardingAlert(userId, details) {
    if (!ALERT_RECIPIENTS.length || !ALERT_SENDER) return;
    try {
        const locationStr = [details.location_continent, details.location_iso, details.location_node]
            .filter(Boolean).join(' / ') || details.locations || '—';
        await sesClient.send(new SendEmailCommand({
            Source: ALERT_SENDER,
            Destination: { ToAddresses: ALERT_RECIPIENTS },
            Message: {
                Subject: { Data: `New Onboarding Submission` },
                Body: {
                    Text: {
                        Data: `A new user has completed onboarding.\n\nUser ID: ${userId}\nPrimary Goal: ${details.primary_goal || '—'}\nLocation: ${locationStr}\nData Center Type: ${details.dc_type || '—'}\n\nReview in the admin dashboard.`
                    }
                }
            }
        }));
    } catch (err) {
        console.error('Failed to send onboarding alert email:', err.message);
    }
}

// GET /api/onboarding/progress/:userId — fetch saved onboarding progress
router.get('/progress/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const { data, error } = await supabase
            .from('onboarding_details')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(200).json({ data: null });
            }
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({ data });
    } catch (err) {
        console.error('Error fetching onboarding progress:', err);
        res.status(500).json({ error: 'Failed to fetch onboarding progress' });
    }
});

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

        // Only mark complete and send alert on final submission, not auto-saves
        if (details.completed === true) {
            await supabase
                .from('users')
                .update({ onboarding_completed: true })
                .eq('id', userId);

            sendOnboardingAlert(userId, details);
        }

        res.status(200).json({ message: 'Onboarding completed successfully', data });
    } catch (err) {
        console.error('Internal server error:', err);
        res.status(500).json({ error: 'Failed to submit onboarding details' });
    }
});

// Configure multer for S3 uploads (max 15MB, stored under onboarding/ prefix)
// Onboarding accepts documents beyond the default pdf/csv/tsv — e.g. Word docs, Excel files
const uploadToS3 = createS3Upload('onboarding', 15, {
    allowedFileTypes: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/msword',                                                        // .doc
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        // .xlsx
        'application/vnd.ms-excel',                                                 // .xls
    ],
});

// POST /api/onboarding/onboardingdocs — Upload onboarding documents
// No auth required because the user just signed up and may not have a session yet as session expires in 15 minutes.
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
