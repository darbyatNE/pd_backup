import { describe, it, expect } from 'vitest';

import { createEmptyPriceSchedule, calculateEscalatedPrices } from './ppa';

describe('createEmptyPriceSchedule', () => {
  it('produces 20 contract years', () => {
    const schedule = createEmptyPriceSchedule();
    expect(schedule).toHaveLength(20);
  });

  it('numbers contract years sequentially from 1 to 20', () => {
    const schedule = createEmptyPriceSchedule();
    expect(schedule[0].contract_year).toBe(1);
    expect(schedule[19].contract_year).toBe(20);
    schedule.forEach((entry, index) => {
      expect(entry.contract_year).toBe(index + 1);
    });
  });

  it('initializes all price/quantity fields to empty strings', () => {
    const schedule = createEmptyPriceSchedule();
    for (const entry of schedule) {
      expect(entry.fixed_settlement_price_per_mwh).toBe('');
      expect(entry.eac_credits_price_per_mwh).toBe('');
      expect(entry.annual_quantity_mwh).toBe('');
    }
  });

  it('returns a fresh array on each call', () => {
    const a = createEmptyPriceSchedule();
    const b = createEmptyPriceSchedule();
    expect(a).not.toBe(b);
    a[0].fixed_settlement_price_per_mwh = '100';
    expect(b[0].fixed_settlement_price_per_mwh).toBe('');
  });
});

describe('calculateEscalatedPrices', () => {
  it('defaults to a 20-year schedule', () => {
    const schedule = calculateEscalatedPrices(50, 1000, 2);
    expect(schedule).toHaveLength(20);
  });

  it('honors a custom year count', () => {
    const schedule = calculateEscalatedPrices(50, 1000, 2, 5);
    expect(schedule).toHaveLength(5);
    expect(schedule.map((s) => s.contract_year)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps year 1 at the base price (no escalation applied yet)', () => {
    const schedule = calculateEscalatedPrices(50, 1000, 10, 3);
    expect(schedule[0].fixed_settlement_price_per_mwh).toBe(50);
  });

  it('escalates the fixed price compounding annually', () => {
    const schedule = calculateEscalatedPrices(100, 1000, 10, 3);
    // year 1: 100, year 2: 110, year 3: 121
    expect(schedule[1].fixed_settlement_price_per_mwh).toBe(110);
    expect(schedule[2].fixed_settlement_price_per_mwh).toBe(121);
  });

  it('rounds escalated prices to two decimal places', () => {
    const schedule = calculateEscalatedPrices(100, 1000, 3.333, 2);
    // year 2 = 100 * 1.03333 = 103.333 -> 103.33
    expect(schedule[1].fixed_settlement_price_per_mwh).toBe(103.33);
  });

  it('holds the annual quantity constant across years and rounds it', () => {
    const schedule = calculateEscalatedPrices(50, 1234.567, 5, 4);
    for (const entry of schedule) {
      expect(entry.annual_quantity_mwh).toBe(1234.57);
    }
  });

  it('always sets the EAC credits price to zero', () => {
    const schedule = calculateEscalatedPrices(50, 1000, 5, 4);
    for (const entry of schedule) {
      expect(entry.eac_credits_price_per_mwh).toBe(0);
    }
  });

  it('leaves prices flat when the escalator is zero', () => {
    const schedule = calculateEscalatedPrices(75, 500, 0, 5);
    for (const entry of schedule) {
      expect(entry.fixed_settlement_price_per_mwh).toBe(75);
    }
  });

  it('handles a negative escalator (price de-escalation)', () => {
    const schedule = calculateEscalatedPrices(100, 1000, -10, 2);
    expect(schedule[1].fixed_settlement_price_per_mwh).toBe(90);
  });

  it('returns an empty schedule when years is zero', () => {
    expect(calculateEscalatedPrices(100, 1000, 5, 0)).toEqual([]);
  });
});
