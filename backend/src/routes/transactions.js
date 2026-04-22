import express from 'express';
import { supabase, getSupabaseWithUser } from '../services/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /api/transactions - List transactions (filtered by user role)
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getSupabaseWithUser(req.userToken);

    const { data: userData } = await db
      .from('users')
      .select('role')
      .eq('id', req.user.id)
      .single();

    let query = db
      .from('transactions')
      .select('*, project:projects(*), buyer:users!buyer_id(*), seller:users!seller_id(*)');

    if (userData?.role === 'buyer') {
      query = query.eq('buyer_id', req.user.id);
    } else if (userData?.role === 'seller') {
      query = query.eq('seller_id', req.user.id);
    }

    const { data: transactions, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ transactions });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /api/transactions - Submit buyer interest
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      project_id,
      energy_amount_mwh,
      start_date,
      contract_duration_years,
      delivery_date,
      net_neutral_target,
      generation_preference
    } = req.body;

    console.log('POST /api/transactions - Received body:', req.body);
    console.log('POST /api/transactions - project_id:', project_id);

    // Create user-scoped Supabase client to respect RLS
    const userSupabase = getSupabaseWithUser(req.userToken);

    // Get project to find seller_id
    const { data: project, error: projectError } = await userSupabase
      .from('projects')
      .select('seller_id')
      .eq('id', project_id)
      .single();

    console.log('POST /api/transactions - Query result:', { project, projectError });

    if (projectError) {
      console.error('POST /api/transactions - Supabase error:', projectError);
      return res.status(500).json({ error: `Database error: ${projectError.message}` });
    }

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { data: transaction, error } = await userSupabase
      .from('transactions')
      .insert({
        project_id,
        buyer_id: req.user.id,
        seller_id: project.seller_id,
        energy_amount_mwh,
        start_date,
        contract_duration_years,
        delivery_date,
        net_neutral_target,
        generation_preference,
        status: 'submitted'
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ transaction });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id/status - Accept or reject transaction (seller only)
router.put('/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const db = getSupabaseWithUser(req.userToken);

    const { data: transaction } = await db
      .from('transactions')
      .select('seller_id')
      .eq('id', id)
      .single();

    if (!transaction || transaction.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { data: updatedTransaction, error } = await db
      .from('transactions')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ transaction: updatedTransaction });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

export default router;
