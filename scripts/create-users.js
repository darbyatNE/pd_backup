#!/usr/bin/env node
/**
 * Create Test Users via Supabase Admin API
 *
 * This script properly creates users in Supabase Auth, which will
 * automatically sync to the public.users table via the database trigger.
 *
 * Usage:
 *   node scripts/create-users.js
 *
 * Prerequisites:
 *   1. Run setup-database.sql
 *   2. Run setup-auth-sync.sql
 *   3. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  console.error('   You can find these in your Supabase project settings.');
  process.exit(1);
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test users to create
const testUsers = [
  // Buyers
  {
    email: 'buyer1@techdc.com',
    password: 'PowerDime2025!',
    user_metadata: {
      role: 'buyer',
      company_name: 'Tech Data Center Inc',
      contact_person: 'Alice Johnson',
      phone: '+1-555-0101'
    }
  },
  {
    email: 'buyer2@cloudcorp.com',
    password: 'PowerDime2025!',
    user_metadata: {
      role: 'buyer',
      company_name: 'Cloud Computing Corp',
      contact_person: 'Bob Smith',
      phone: '+1-555-0102'
    }
  },
  {
    email: 'buyer3@greenmfg.com',
    password: 'PowerDime2025!',
    user_metadata: {
      role: 'buyer',
      company_name: 'Green Manufacturing Co',
      contact_person: 'Carol Williams',
      phone: '+1-555-0103'
    }
  },
  {
    email: 'buyer4@urbanenergy.com',
    password: 'PowerDime2025!',
    user_metadata: {
      role: 'buyer',
      company_name: 'Urban Energy Solutions',
      contact_person: 'David Brown',
      phone: '+1-555-0104'
    }
  },
  {
    email: 'buyer5@sustainable.com',
    password: 'PowerDime2025!',
    user_metadata: {
      role: 'buyer',
      company_name: 'Sustainable Industries Ltd',
      contact_person: 'Emma Davis',
      phone: '+1-555-0105'
    }
  },
  // Sellers
  {
    email: 'seller1@solarpro.com',
    password: 'PowerDime2025!',
    user_metadata: {
      role: 'seller',
      company_name: 'SolarPro Energy',
      contact_person: 'Frank Martinez',
      phone: '+1-555-0201'
    }
  },
  {
    email: 'seller2@windpower.com',
    password: 'PowerDime2025!',
    user_metadata: {
      role: 'seller',
      company_name: 'WindPower Systems',
      contact_person: 'Grace Wilson',
      phone: '+1-555-0202'
    }
  }
];

async function createUsers() {
  console.log('🚀 Creating test users...\n');

  const results = {
    created: [],
    errors: [],
    existing: []
  };

  for (const userData of testUsers) {
    try {
      console.log(`📧 Creating user: ${userData.email}...`);

      const { data, error } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true, // Auto-confirm email
        user_metadata: userData.user_metadata
      });

      if (error) {
        if (error.message.includes('already registered')) {
          console.log(`   ⚠️  User already exists: ${userData.email}`);
          results.existing.push(userData.email);
        } else {
          throw error;
        }
      } else {
        console.log(`   ✅ Created: ${userData.email} (ID: ${data.user.id})`);
        results.created.push(userData.email);

        // Update public.users with additional metadata
        const { error: updateError } = await supabase
          .from('users')
          .update({
            company_name: userData.user_metadata.company_name,
            contact_person: userData.user_metadata.contact_person,
            phone: userData.user_metadata.phone
          })
          .eq('id', data.user.id);

        if (updateError) {
          console.log(`   ⚠️  Could not update user metadata: ${updateError.message}`);
        }
      }
    } catch (error) {
      console.error(`   ❌ Error creating ${userData.email}:`, error.message);
      results.errors.push({ email: userData.email, error: error.message });
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log('='.repeat(50));
  console.log(`✅ Created: ${results.created.length}`);
  console.log(`⚠️  Already existed: ${results.existing.length}`);
  console.log(`❌ Errors: ${results.errors.length}`);
  console.log('='.repeat(50));

  if (results.created.length > 0) {
    console.log('\n🎉 Test Accounts Created:');
    console.log('   Password for all: PowerDime2025!');
    console.log('\nBuyers:');
    testUsers.filter(u => u.user_metadata.role === 'buyer').forEach(u => {
      console.log(`   - ${u.email}`);
    });
    console.log('\nSellers:');
    testUsers.filter(u => u.user_metadata.role === 'seller').forEach(u => {
      console.log(`   - ${u.email}`);
    });
  }

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(({ email, error }) => {
      console.log(`   - ${email}: ${error}`);
    });
  }

  console.log('\n✨ Done!\n');
}

// Run the script
createUsers().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
