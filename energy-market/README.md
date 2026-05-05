# Power Dime Energy Market Database Module

This module contains the PostgreSQL schema and architecture for the Power Dime energy market data platform.

## Overview

- **Database**: PostgreSQL 18+ on Supabase
- **Purpose**: Store and analyze electricity prices, demand, outages, natural gas prices, and REC futures across PJM, MISO, and ERCOT markets
- **Architecture**: Multi-ISO design with UUID-based registry, UTC timestamps, referential integrity, and two-tier ML modeling
- **Coverage**: All pricing nodes (pnodes) loaded for PJM, MISO, and ERCOT — tracked in the `iso_lmps` registry table

## Files

- `schema_iso_market_data.sql`: Complete PostgreSQL DDL schema
- `ARCHITECTURE_v2.md`: Detailed technical architecture documentation
- `ARCHITECTURE_SUMMARY.md`: High-level overview and business context
- `config/supabase-db.example.json`: Template for Supabase database connection (copy and configure local only)

## Quick Start for Team

**For basic understanding**: Read this README
**For business context**: See `ARCHITECTURE_SUMMARY.md`
**For technical details**: Refer to `ARCHITECTURE_v2.md`

## Setup

1. Copy `config/supabase-db.example.json` to `config/supabase-db.json` and fill in your credentials
2. Ensure you have your Supabase project URL and service role key configured
3. Schema is already deployed to Supabase - see architecture docs for details

## Future Development

- ML models for price forecasting
- Dashboard for PPA analysis
- Expansion to additional ISOs (NYISO, CAISO, SPP)

## Collaboration

This module integrates with the broader Power Dime platform. The ML engineer can access forecasting models and data pipelines here.