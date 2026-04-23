# Power Dime Energy Market Database Architecture

---

## What Problem Does This Solve?

Energy markets are fragmented. Different regions have different operators (like PJM on the East Coast, ERCOT in Texas), and each publishes their own pricing and demand data. 

**The Challenge**: 
- Data comes from multiple sources
- Similar information has different formats and labels
- Need to compare prices and trends across regions
- Must track historical information for forecasting

**The Solution**: 
A single database that stores all this data in a consistent, organized way so our ML engineer(s) can analyze it together.

---

## What Does the Database Store?

### 1. **Electricity Prices by Location** (da_lmp table)

**Example**: 
- On April 22 at 2 PM, electricity in Philadelphia cost $45.50/MWh
- Same day, same time, it cost $43.20/MWh in Pittsburgh
- Database stores each price with exact time and location

### 2. **Electricity Demand by Region** (zonal_load table)
Daily forecast and actual measurements of how much power each region needs.

**Example**:
- PJM's eastern zone will use 15,000 MW tomorrow at peak hours
- Actual usage was 14,750 MW (for comparison against forecast)

### 3. **Power Line Outages** (transmission_outage table)
When transmission lines go down for maintenance or emergency, we track it.

**Example**:
- Columbus transformer offline April 22, 10 AM → April 23, 3 AM
- Expected to impact 500 MW of power flow

### 5. **Renewable Energy Certificates** (pjm_rec_futures & ercot_rec_futures tables)
PJM and ERCOT REC futures prices for renewable energy trading.

**Example**:
- PJM REC Q2 2026: $12.50/MWh
- ERCOT REC Front Half 2026: $8.75/MWh

---

## How Is It Organized? 

### **Reference Folders** (Look-Up Tables)
These are like master lists that everything else refers to:
- **ISO Operators**: PJM, ERCOT (who runs each market)
- **Geographic Zones**: East zone, West zone, South zone (areas within PJM)
- **Specific Locations (Buses)**: Philadelphia station, Pittsburgh station (exact points where prices are measured)
- **Gas Trading Hubs**: Henry Hub, Pennsylvania hub, Texas hub

### **Data Folders** (Actual Measurements)
- **Hourly Prices**: LMP data for every bus, every hour
- **Daily Demand**: Zonal load forecasts and actuals
- **Outages**: When equipment is down and for how long
- **Gas Markets**: Daily futures and basis prices
- **REC Markets**: Renewable energy certificate futures

### **Audit Trail**
- Logs showing when data was loaded, from where, and if anything failed

---

## Key Design Features

### 1. **Handles Daylight Saving Time Correctly**
Problem: In fall, 1:30 AM happens twice (when clocks "fall back")
- Old systems would get confused and create duplicate records
- Our solution: Use absolute UTC time (like a global clock) so every moment is unique
- Result: No data conflicts or duplicates during DST transitions

### 2. **Prevents Orphaned Data**
Problem: Someone accidentally deletes PJM from the system, what happens to all the PJM prices?
- Our solution: Set up rules that prevent deletions if they would break data
- Result: Data integrity—you can't accidentally lose interconnected information

### 3. **Built to Scale**
Problem: What if we add MISO (Midwest) or NYISO (New York)?
- Our solution: New ISOs fit into the same structure without redesign
- Result: Easy expansion to new markets

### 6. **Fast Data Retrieval**
Problem: "Show me all prices in PJM for the last 30 days"—scanning billions of records would be slow
- Our solution: Strategic indexes
- Result: Complex queries run in seconds, not hours

## The Core Purpose: Building the PPA Translation Engine

This database feeds the **Expected Value Model**—the intelligent engine that powers fair and accurate PPA (Power Purchase Agreement) comparisons across all PJM regions.

### **How It Works**:

1. **Train a Forecasting Model**: Feed historical electricity prices, demand, gas costs, and outages into a machine learning model
2. **Generate Expected Values**: For each future time period (hour, day, month, year), the model predicts the expected electricity price at every:
   - **Zone** (East, West, South)
   - **Bus** (specific generator or load location)
   - **Gas Hub** (Henry Hub, Pennsylvania basis, Texas basis, etc.)
   - **Transmission Interface** (power flow corridors between zones)

3. **Compare PPA Offers Intelligently**: When someone offers you a Power Purchase Agreement ("Pay us $45/MWh for the next 5 years"), the translation engine uses these expected values to instantly answer:
   - Is $45/MWh a good deal in the East zone compared to what we expect?
   - How does it compare to the West or South zone offers?
   - What about natural gas-linked alternatives?
   - Which location, hub, or interface offers the best economic value?
   - How does this compare to historical trends?

### **Why This Matters for PPA Decisions**:

| Scenario | Without Model | With Model |
|----------|---|---|
| **Vendor offers $50/MWh in Eastern PA** | Guess based on gut feeling or last year's data | Compare to expected value of $48/MWh → **Deal is $2/MWh worse than forecast** → Negotiate |
| **Comparing two regional offers** | Difficult—different zones have different price baselines | Normalize all offers to expected value per zone → **Clear winner** |
| **Long-term PPA (5 years)** | Highly uncertain about future prices | Model trend over time with seasonal patterns → **Better forecast confidence** |
| **Gas-indexed contract vs. fixed** | Hard to value the flexibility | Model both scenarios through expected values → **Choose optimal structure** |

### **Real Example**:
- **Offer A**: $45/MWh for power in the Philadelphia zone
- **Offer B**: $42/MWh for power in the Pittsburgh zone  
- **Offer C**: Henry Hub gas + $3.50/MWh spread in Pennsylvania

**Without the translation engine**: 
- Which is cheaper? Unclear—different zones, different structures, hard to compare.
- Decision: Guess or take the lowest number (which may be a bad deal).

**With the translation engine**:
- Expected value in Philadelphia = $44/MWh → Offer A is $1/MWh **better** → Good deal ✓
- Expected value in Pittsburgh = $41/MWh → Offer B is $1/MWh **worse** → Avoid ✗  
- Expected value of gas + spread = $44.80/MWh → Offer C is $2.80/MWh **worse** → Avoid ✗
- **Decision**: Take Offer A—saves $1/MWh vs. expected value, other offers would lose money.

### **The Translation Engine Delivers**:

**Hourly expected values** for each zone, bus, hub, and interface  
**Automatic PPA scoring** — is this deal above or below fair expected value?  
**Regional normalization** — compare $40/MWh in Pittsburgh to $50/MWh in Philly apples-to-apples  
**Multi-year analysis** — trend forecast to value long-term commitments  
**Confidence levels** — how certain are we about this forecast? (reduces risk)  
**Gas/Price indexing options** — compare fixed vs. indexed PPA structures automatically  

---

## Current Status

Database is deployed on Amazon EC2  
All tables created and ready for data  
Foundation includes PJM and ERCOT structure  
Supports 6 natural gas basis markets (Henry Hub + regional hubs)   
Includes REC futures tables for PJM and ERCOT renewable energy trading  
Designed to prevent common data problems (duplicates, orphaned records, timezone confusion)  
Two-tier modeling strategy implemented for scalable ML forecasting
