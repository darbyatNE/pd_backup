#!/usr/bin/env node
/**
 * Sync Sites & Projects from Supabase
 *
 * Reads from:
 *   - public.data_centers   (sites / load profiles)
 *   - public.projects       (generation projects)
 *
 * Uses VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env
 *
 * Run: node scripts/sync-sites-and-projects.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Data Centers — site / load profile data ─────────────────────────────────
// Key jsonb fields: hist_mw (load profile), contracts (existing hedges), delta_cap
const DATA_CENTER_COLUMNS = [
  'id',
  'buyer_id',
  'facility_name',
  'data_center_name',
  'physical_address',
  'point_of_contact',
  'total_facility_size_sq_ft',
  'it_space_sq_ft',
  'uptime_tier',
  'primary_business_type',
  'data_collection_start',
  'data_collection_end',
  'it_load',
  'pue',
  'hist_mw',
  'g_it',
  'delta_cap',
  'contracts',
  'created_at',
  'updated_at',
  'raw_workbook',
  'poc_title',
  'poc_phone',
  'poc_email',
  'total_facility_size_unit',
  'it_space_unit',
  'utility_service_voltage',
  'utility_service_capacity',
  'utility_service_capacity_unit',
  'ups_capacity',
  'ups_capacity_unit',
  'generator_capacity',
  'generator_capacity_unit',
  'max_it_load_design_kw',
  'current_peak_it_load_kw',
  'current_peak_it_load_at',
  'total_annual_electricity_kwh',
  'op_summer_high_f',
  'op_summer_low_f',
  'op_winter_high_f',
  'op_winter_low_f',
  'op_avg_humidity',
  'key_load_fluctuations',
  'site_plan_file_name',
  'auth_signature',
  'auth_printed_name',
  'auth_title',
  'auth_date',
  'eta_ups',
];

// ─── Projects — seller generation listings ───────────────────────────────────
const PROJECT_COLUMNS = [
  'id',
  'seller_id',
  'name',
  'generation_type',
  'capacity_mw',
  'location',
  'iso',
  'zone',
  'status',
  'fixed_price_per_mwh',
  'eac_price_per_mwh',
  'price_currency',
  'annual_escalator_percent',
  'floating_price_source',
  'expected_nameplate_capacity_mw',
  'buyer_share_percent',
  'expected_cod',
  'guaranteed_cod',
  'earliest_cod_date',
  'delivery_term_years',
  'development_security_per_mw',
  'operational_security_per_mw',
  'credit_rating_required',
  'delay_damages_per_mw_day',
  'delay_damages_cap',
  'early_termination_fee',
  'capacity_shortfall_rate_per_kw',
  'guaranteed_availability_year1_percent',
  'guaranteed_availability_ongoing_percent',
  'availability_damages_rate',
  'eac_scheme',
  'eac_transfer_deadline_days',
  'settlement_point',
  'payment_period_days',
  'generation_modules',
  'connection_point',
  'major_equipment_description',
  'vppa_terms',
  'price_schedule',
  'metadata',
  'created_at',
  'updated_at',
];

// ─── Buyer Projects — buyer RFPs / procurement requirements ──────────────────
const BUYER_PROJECT_COLUMNS = [
  'id',
  'buyer_id',
  'project_type',
  'name',
  'location',
  'metadata',
  'created_at',
  'updated_at',
  'target_capacity_mw',
  'target_annual_quantity_mwh',
  'preferred_term_years',
  'equity_share_percent',
  'target_cod',
  'no_earlier_than_date',
  'outside_cod_date',
  'max_fixed_price_per_mwh',
  'max_eac_price_per_mwh',
  'preferred_escalator_percent',
  'price_currency',
  'preferred_settlement_type',
  'preferred_settlement_point',
  'settlement_zone',
  'preferred_generation_types',
  'required_eac_scheme',
  'scope2_emissions_target_mt',
  'net_neutral_target_year',
  'renewable_percentage_target',
  'buyer_credit_rating',
  'buyer_security_per_mw',
  'min_guaranteed_availability_percent',
  'processing_status',
  'extracted_data',
  'processing_notes',
  'processed_at',
  'processed_by',
  'rfp_requirements',
  'requested_price_schedule',
];

async function fetchProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS.join(', '));

  if (error) {
    console.error('Projects fetch error:', error.message);
    return [];
  }
  console.log(`Fetched ${data?.length ?? 0} projects`);
  return data ?? [];
}

async function fetchDataCenters() {
  const { data, error } = await supabase
    .from('data_centers')
    .select(DATA_CENTER_COLUMNS.join(', '));

  if (error) {
    console.error('Data centers fetch error:', error.message);
    return [];
  }
  console.log(`Fetched ${data?.length ?? 0} data centers`);
  return data ?? [];
}

async function fetchBuyerProjects() {
  const { data, error } = await supabase
    .from('buyer_projects')
    .select(BUYER_PROJECT_COLUMNS.join(', '));

  if (error) {
    console.error('Buyer projects fetch error:', error.message);
    return [];
  }
  console.log(`Fetched ${data?.length ?? 0} buyer projects`);
  return data ?? [];
}

async function main() {
  console.log('Connecting to:', supabaseUrl);

  const [projects, dataCenters, buyerProjects] = await Promise.all([
    fetchProjects(),
    fetchDataCenters(),
    fetchBuyerProjects(),
  ]);

  console.log('\n--- SELLER PROJECTS SAMPLE ---');
  if (projects.length) {
    console.log(JSON.stringify(projects[0], null, 2));
  } else {
    console.log('No seller projects found.');
  }

  console.log('\n--- DATA CENTERS SAMPLE ---');
  if (dataCenters.length) {
    const sample = dataCenters[0];
    console.log(JSON.stringify(sample, null, 2));
    if (sample.hist_mw) {
      console.log('\n-> hist_mw keys:', Object.keys(sample.hist_mw).slice(0, 10));
    }
    if (sample.contracts) {
      console.log('-> contracts count:', Array.isArray(sample.contracts) ? sample.contracts.length : 'not array');
    }
  } else {
    console.log('No data centers found.');
  }

  console.log('\n--- BUYER PROJECTS SAMPLE ---');
  if (buyerProjects.length) {
    console.log(JSON.stringify(buyerProjects[0], null, 2));
  } else {
    console.log('No buyer projects found.');
  }

  // TODO: integrate with your downstream logic here
  // e.g., map data_centers.hist_mw -> load profiles for TryOn overlay
  //       map data_centers.contracts -> existing hedge contracts
}

main().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
