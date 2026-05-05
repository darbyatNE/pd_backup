## Subject: Follow-Up: Demo / Showcase Plan and Required Components

Hi all,

Following up on our workshop discussion, I wanted to outline a draft plan for how the demo/showcase could proceed, along with the components that should be completed in advance to make the experience cohesive and effective.

The overall platform vision is broader than what we are likely to complete prior to the demo. While the outline below describes the intended end-to-end experience, I have not yet broken out which specific functions should be pushed past the demo deadline. Defining that scope cut remains an important next step and a high-priority task, as we need to align on which features must be completed for the showcase versus which can be simulated, simplified, or deferred.

The demo/showcase centers around the three core modules:

- **Onboarding**
- **Planning**
- **Contracting**

The existing UI will be further developed to connect these three modules into a single end-to-end workflow, showing how a user can move from portfolio setup, to opportunity analysis, to transaction initiation within one integrated platform experience.

---

## 1. Proposed Demo / Showcase Flow

### A. Onboarding

The demo can begin with a user logging in and immediately seeing their existing profile / portfolio, which connects into the Planning module.

From there, the user will be able to:

- View, add, or modify existing load sites
- Include new data fields such as:
  - Location
  - Pricing Node ID
  - Additional fields to be finalized by Satya

The user will also be able to:

- View, add, or modify existing generation-side contracts
- Include fields such as:
  - Location
  - Pricing Node ID
  - REC Type
  - Amount
  - Tracking Agency

This gives the audience a clear understanding that the platform begins with portfolio setup and normalization of customer-specific load and supply data.

---

### B. Transition into Planning

Once the user’s load sites and existing contracts are established, the demo moves into the **Planning** module, which will feature the platform’s translation engine.

This translation engine will use two primary proprietary modeling layers:

- **Shape-aware load forecasting model**
- **Location-based hourly price forecasting model**

The price forecasting model will be trained to identify expected forward price shapes at each relevant **location (Zone/Hub)**. Forecasts are produced across multiple dimensions, including:

- **Location**
  - Zone / Hub
- **Day type**
  - Weekday
  - Weekend
  - Holiday
- **Hour**
  - Hour Ending 1 through Hour Ending 24
  - HE1 through HE24

In other words, each forecast is not just a single forward price curve, but a location-specific hourly view of expected price shape by day type and hour ending.

This module should demonstrate how the platform translates customer load and available market offers into comparable economic and risk-adjusted profiles.

---

### C. Market Opportunity Visualization

Within the Planning module, existing offers and RFQ opportunities *(simulated for the demo)* can be displayed on a map.

The map should ideally:

- Be limited to **PJM** for the demo
- Show:
  - Generation contract locations
  - Load asset pricing locations
  - ISO context
- Allow users to click on locations to view additional details

#### Popup / detail view should include:
- Contract-level details similar to existing portfolio records
- Term
- Generation type
- Generation profile
- Location
- Pricing node
- REC characteristics

#### Filters should include:
- Generation type
- Generation profile
- Term

This allows the user to quickly narrow visible opportunities and understand available supply options visually.

---

### D. Offer Evaluation / Expanded Analysis Screen

When the user selects a generation opportunity, it should expand into a deeper analysis screen where they can:

- View detailed commercial and structural information
- Compare the selected generation profile against selected load site(s)
- Evaluate fit for:
  - Null energy targets
  - REC targets
  - Existing generation contracts already associated with the selected site(s)

The screen should also show:

- Listed pricing at the **Zone/Hub** where ownership transfer occurs
- Forecast price / fair market value at the customer location and relevant dates
- A comparison derived from the translation engine considering:
  - Term
  - Shape
  - Basis

This is a critical part of the demo because it shows how the platform converts raw offers into location-aware, shape-aware decision support.

---

### E. Favorability / Risk Scoring Display

The selected offer analysis should also display favorability tags or ratings using either a numeric scale or slider-style visual.

#### Existing metrics:
- Cost score
- Renewable %
- Time to contract
- Price certainty

#### Additional / blended metrics:
- Overall effectiveness
- Expected delivered cost
- Basis congestion exposure
- Cost stability
- Carry-forward unhedged risks

This helps demonstrate that the platform is not just displaying market data, but actively translating it into actionable portfolio decision metrics.

---

### F. Transition into Contracting

Once the user identifies a preferred option, they can initiate the **Contracting** module.

This should include an action such as:

- Issue RFQ
- Contact seller
- Initiate negotiation / contract finalization

At that point, the selected generation profile should update in the hedged load view as **pending**, indicating that the transaction has been initiated but not yet executed.

Once deal execution is confirmed, the contract status and visualization can be updated accordingly.

This closes the loop and shows the integrated progression from opportunity identification to commercial action.

---

## 2. Conceptual Demo Narrative

A possibility to conceptualize framing the end-to-end demo story.

### Portfolio Gap Resolution Story

Show a customer logging in, reviewing their current load and existing generation portfolio, then identifying a future hedge gap. From there, they use the Planning module to evaluate available supply options and ultimately launch an RFQ through the Contracting module.


### Next Steps

I welcome feedback on both the proposed demo flow and the overall scope. In particular, the most important next step is to align on which capabilities should be prioritized for completion before the demo versus which can be simulated, simplified, or deferred.

It's possible we can use this as a starting point for a follow-up working session to sharpen our focus.
