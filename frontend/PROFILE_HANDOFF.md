# Profile Feature - Developer Handoff Document

## Overview
This document provides integration guidance for developers implementing the Profile feature in the PowerDime dashboard.

## Current Integration Status

### ✅ What's Already Set Up
1. **Dashboard Tab** - "Profile" tab added to main navigation (left of "Plan")
2. **Route/Component** - `src/pages/Profile.tsx` renders when Profile tab is active
3. **Contexts Available**:
   - `useAuth()` - User data (name, email, role, organization, company_name)
   - `useScopeContext()` - Site management (selectedSites, addSite, removeSite)

## Your Integration Surface

### File to Modify
```
src/pages/Profile.tsx
```

This file contains 3 clearly marked sections for you to replace:

### Section 1: User Profile Card
**Location:** Lines 79-109  
**Marker:** `[PROFILE_DEV_SECTION_1_UI]`  
**Current:** Basic user info display (Name, Email, Role, Organization)  
**Replace with:** Your user profile component  
**Available Data:** `user` object from `useAuth()`

### Section 2: Site Management  
**Location:** Lines 111-163  
**Marker:** `[PROFILE_DEV_SECTION_2_UI]`  
**Current:** Site list with add/remove functionality  
**Replace with:** Your site management component  
**Available Data:** `selectedSites`, `addSite()`, `removeSite()` from `useScopeContext()`

### Section 3: Additional Content Area
**Location:** Lines 166-173  
**Marker:** `[PROFILE_DEV_SECTION_3]`  
**Current:** Blank placeholder box  
**Replace with:** Any additional profile components you need

## Recommended File Structure

Create a dedicated folder for your components:
```
src/
  components/
    profile/
      UserProfileCard.tsx    # Section 1 replacement
      SiteManager.tsx        # Section 2 replacement
      ProfileSettings.tsx    # Section 3 or additional
      index.ts               # Export barrel
  pages/
    Profile.tsx              # Integration surface (this file)
```

## Available Contexts

### useAuth()
```typescript
const { user } = useAuth();
// user: {
//   name: string
//   email: string
//   role: 'buyer' | 'seller' | 'admin'
//   organization: string
//   company_name: string
// }
```

### useScopeContext()
```typescript
const { selectedSites, addSite, removeSite } = useScopeContext();
// selectedSites: string[]  // e.g., ['ashburn-dc', 'sterling-hyperscale']
// addSite: (siteKey: string) => void
// removeSite: (siteKey: string) => void
```

## Integration Steps

1. **Create your components** in `src/components/profile/`
2. **Import them** at the top of `src/pages/Profile.tsx`
3. **Replace the marked sections** with your components
4. **Pass required props** from the available contexts
5. **Test** by clicking the "Profile" tab in the dashboard

## Testing

- Profile tab is visible in the dashboard navigation
- Clicking it renders your components
- Your components have access to auth and scope contexts
- Changes to sites reflect across the app (shared scope context)

## Need Help?

Contact the original developer for questions about:
- Context behavior
- Existing scope/auth integration
- Dashboard layout constraints

## Current Placeholder UI

The current implementation shows:
- User Profile card with basic info
- Site Management with add/remove
- Blank area for your content

All of this is placeholder - replace it entirely with your implementation.
