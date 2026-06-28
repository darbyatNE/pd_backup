import express from 'express';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { query, buildUpsert, buildInsert } from '../services/db.js';
import { createS3Upload } from '../services/s3.js';

const router = express.Router();

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

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
        Subject: { Data: 'New Onboarding Submission' },
        Body: {
          Text: {
            Data: `A new user has completed onboarding.\n\nUser ID: ${userId}\nPrimary Goal: ${details.primary_goal || '—'}\nLocation: ${locationStr}\nData Center Type: ${details.dc_type || '—'}\n\nReview in the admin dashboard.`,
          },
        },
      },
    }));
  } catch (err) {
    console.error('Failed to send onboarding alert email:', err.message);
  }
}

// GET /api/onboarding/progress/:userId
router.get('/progress/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const { rows } = await query('SELECT * FROM onboarding_details WHERE id = $1', [userId]);
    res.status(200).json({ data: rows[0] ?? null });
  } catch (err) {
    console.error('Error fetching onboarding progress:', err);
    res.status(500).json({ error: 'Failed to fetch onboarding progress' });
  }
});

// POST /api/onboarding/submit
router.post('/submit', async (req, res) => {
  try {
    const { userId, ...details } = req.body;
    console.log('received onboarding details', req.body);

    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const data = { id: userId, ...details, updated_at: new Date() };
    // pg sends JS arrays as PostgreSQL array literals; JSONB columns need a JSON string
    if (Array.isArray(data.facility_profiles)) {
      data.facility_profiles = JSON.stringify(data.facility_profiles);
    }
    const { cols, placeholders, updateSet, values } = buildUpsert(data, 'id');

    const { rows } = await query(
      `INSERT INTO onboarding_details (${cols}) VALUES (${placeholders})
       ON CONFLICT (id) DO UPDATE SET ${updateSet}
       RETURNING *`,
      values
    );

    if (details.completed === true) {
      await query(
        'UPDATE users SET onboarding_completed = true WHERE id = $1',
        [userId]
      );

      // Sync facility profiles into the facilities table so the Profile page can read them
      const profiles = Array.isArray(details.facility_profiles) && details.facility_profiles.length > 0
        ? details.facility_profiles
        : [{
            lp_facility_name: details.lp_facility_name,
            lp_country: details.lp_country,
            lp_state: details.lp_state,
            lp_city: details.lp_city,
            lp_zipcode: details.lp_zipcode,
            lp_iso_rto: details.lp_iso_rto,
          }];

      for (const profile of profiles) {
        const name = profile.lp_facility_name?.trim();
        if (!name) continue;
        await query(
          `INSERT INTO facilities (id, buyer_id, name, country, state, city, zip_code, iso_rto)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (buyer_id, name) DO UPDATE SET
             country = EXCLUDED.country,
             state   = EXCLUDED.state,
             city    = EXCLUDED.city,
             zip_code = EXCLUDED.zip_code,
             iso_rto = EXCLUDED.iso_rto`,
          [
            userId,
            name,
            profile.lp_country || null,
            profile.lp_state   || null,
            profile.lp_city    || null,
            profile.lp_zipcode || null,
            profile.lp_iso_rto || null,
          ]
        );
      }

      sendOnboardingAlert(userId, details);
    }

    res.status(200).json({ message: 'Onboarding completed successfully', data: rows[0] });
  } catch (err) {
    console.error('Internal server error:', err);
    res.status(500).json({ error: 'Failed to submit onboarding details' });
  }
});

const uploadToS3 = createS3Upload('onboarding', 15, {
  allowedFileTypes: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ],
});

// POST /api/onboarding/onboardingdocs
router.post('/onboardingdocs', uploadToS3.array('files', 10), async (req, res) => {
  try {
    const { buyer_id } = req.body;
    const files = req.files;

    if (!buyer_id) return res.status(400).json({ error: 'buyer_id is required' });
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const plans = [];
    for (const file of files) {
      const record = {
        buyer_id,
        plan_type: 'historical',
        facility_type: 'brownfield',
        document_category: 'historical_invoice',
        file_name: file.originalname,
        file_path: file.key,
        file_size: file.size,
        metadata: {
          source: 'onboarding',
          uploaded_at: new Date().toISOString(),
          mime_type: file.mimetype,
          s3_location: file.location || null,
        },
        created_at: new Date().toISOString(),
      };
      const { cols, placeholders, values } = buildInsert(record);
      const { rows } = await query(
        `INSERT INTO power_plans (${cols}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      plans.push(rows[0]);
    }

    res.status(201).json({ message: `Successfully uploaded ${files.length} file(s)`, plans });
  } catch (error) {
    console.error('Onboarding upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload files' });
  }
});

export default router;
