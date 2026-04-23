# Power Dime Energy Market Database Module

This module contains the PostgreSQL schema and architecture for the Power Dime energy market data platform.

## Overview

- **Database**: PostgreSQL 18+ on AWS EC2
- **Purpose**: Store and analyze electricity prices, demand, outages, natural gas prices, and REC futures across PJM and ERCOT markets
- **Architecture**: Multi-tenant design with UTC timestamps, referential integrity, and two-tier ML modeling

## Files

- `schema_iso_market_data.sql`: Complete PostgreSQL DDL schema
- `ARCHITECTURE_v2.md`: Detailed technical architecture documentation
- `ARCHITECTURE_SUMMARY.md`: High-level overview and business context
- `config/ec2-db.example.json`: Template for EC2 database connection (copy and configure locally)

## Setup

1. Copy `config/ec2-db.example.json` to `config/ec2-db.json` and fill in your credentials
2. Ensure SSH access to EC2 instance with the specified key
3. Schema is already deployed to EC2 - see architecture docs for details

## Future Development

- API scripts for data ingestion (PJM Data Miner 2, ICE feeds)
- ML models for price forecasting
- Dashboard for PPA analysis

## Collaboration

This module integrates with the broader Power Dime platform. The ML engineer can access forecasting models and data pipelines here.