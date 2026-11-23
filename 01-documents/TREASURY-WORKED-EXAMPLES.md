# Treasury worked examples — realistic deals, calculations and month-end accrual

Reference portfolio as of **2026-11-30** · 13 deals · reconciled from deal, document and cashflow records.

## 1. Calculation conventions

| Rule | Convention |
| --- | --- |
| IDR interest and repo | Actual/365, simple interest, day count excludes the first day |
| FX and USD-denominated interest | Actual/360 |
| Bond coupon | Semi-annual fixed coupon, accrued on ACT/365 (IDR) or ACT/360 (FX) |
| Bond settlement | Clean price × face + accrued coupon since the previous coupon date |
| FX spot | T+2 business-day value date |
| FX forward and swap | Forward rate = spot × (1 + IDR rate × days/365) ÷ (1 + foreign rate × days/360); premium accrues linearly over the tenor |
| IRS | Fixed 6.10% vs IndONIA 5.35%, net accrual on the notional |
| Trade finance | Fee accrual ACT/360 on the facility amount |
| Rounding | Minor units (1/100), half-up at the final calculation only |

## 2. Sample deals

| Deal | Product | Counterparty | Currency | Notional | Rate / price | Value date | Maturity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MM-CALL-2026-900001 | Money market call | Bank Nusantara Persada | IDR | IDR 250,000,000,000.00 | 5.80% | 2026-11-18 | 2026-12-02 |
| TIME-DEPOSIT-2026-900002 | Time deposit | Bank Samudra Andalan | IDR | IDR 500,000,000,000.00 | 6.15% | 2026-10-15 | 2027-01-13 |
| REPO-2026-900003 | Repurchase agreement | Bank Cakrawala Internasional | IDR | IDR 1,000,000,000,000.00 | 5.60% | 2026-11-10 | 2026-12-10 |
| GOV-BOND-2026-900004 | Government bond | Mandiri Sekuritas Nusantara | IDR | IDR 500,000,000,000.00 | coupon 6.50% @ 98.75 | 2026-11-05 | 2030-03-15 |
| CORP-BOND-2026-900005 | Corporate bond | Asia Pacific Securities | USD | USD 25,000,000.00 | coupon 6.75% @ 101.25 | 2026-11-09 | 2031-06-30 |
| FX-SPOT-2026-900006 | FX spot | Bank Asia Pasifik | USD | USD 10,000,000.00 | — | 2026-11-19 | 2026-11-19 |
| FX-FORWARD-2026-900007 | FX forward | Bank Hudson Trust | USD | USD 25,000,000.00 | — | 2026-11-04 | 2027-02-02 |
| FX-SWAP-2026-900008 | FX swap | Bank Selat Malaka | USD | USD 50,000,000.00 | — | 2026-11-12 | 2026-12-12 |
| IRS-2026-900009 | Interest rate swap | Bank Rhine Capital | IDR | IDR 2,000,000,000,000.00 | 6.10% | 2026-11-06 | 2031-11-06 |
| CORPORATE-LOAN-2026-900010 | Corporate loan | PT Energi Nusantara Abadi | IDR | IDR 750,000,000,000.00 | 9.25% | 2026-09-30 | 2029-09-30 |
| SYNDICATED-LOAN-2026-900011 | Syndicated loan | PT Telekomunikasi Cakrawala | IDR | IDR 2,500,000,000,000.00 | 8.75% | 2026-10-20 | 2031-10-20 |
| PROJECT-FINANCE-2026-900012 | Project finance | PT Ketenagalistrikan Nasional | IDR | IDR 4,000,000,000,000.00 | 10.50% | 2026-10-31 | 2034-10-31 |
| TRADE-FINANCE-2026-900013 | Trade finance | PT Kimia Nusantara | USD | USD 3,000,000.00 | 0.85% | 2026-11-04 | 2027-02-02 |

## 3. Worked examples

### MM-CALL-2026-900001 — Money market call

**Terms.** IDR call placement, PLACE, Bank Nusantara Persada (AA+, ID). Notional IDR 250,000,000,000.00, value 2026-11-18, maturity 2026-12-02.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | PRINCIPAL | PAY | IDR 250,000,000,000.00 | 2026-11-18 |

**Month-end accrual (1–30 Nov 2026).**
- INTEREST: IDR 250,000,000,000.00 × 5.80% × 12/365 (ACT/365) = **Rp 476,712,329** → Dr 1201 / Cr 4101 (income).

### TIME-DEPOSIT-2026-900002 — Time deposit

**Terms.** IDR time deposit, PLACE, Bank Samudra Andalan (AA-, ID). Notional IDR 500,000,000,000.00, value 2026-10-15, maturity 2027-01-13.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | PRINCIPAL | PAY | IDR 500,000,000,000.00 | 2026-10-15 |
| 2 | INTEREST | RECEIVE | IDR 7,582,191,780.82 | 2027-01-13 |

**Month-end accrual (1–30 Nov 2026).**
- INTEREST: IDR 500,000,000,000.00 × 6.15% × 29/365 (ACT/365) = **Rp 2,443,150,685** → Dr 1201 / Cr 4101 (income).

### REPO-2026-900003 — Repurchase agreement

**Terms.** FR-series repo, REPO, Bank Cakrawala Internasional (AA, ID). Notional IDR 1,000,000,000,000.00, value 2026-11-10, maturity 2026-12-10.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | PRINCIPAL | RECEIVE | IDR 1,000,000,000,000.00 | 2026-11-10 |
| 2 | REPAYMENT | PAY | IDR 1,004,602,739,726.03 | 2026-12-10 |

**Month-end accrual (1–30 Nov 2026).**
- INTEREST: IDR 1,000,000,000,000.00 × 5.60% × 20/365 (repo rate, ACT/365) = **Rp 3,068,493,151** → Dr 5101 / Cr 2101 (expense).

### GOV-BOND-2026-900004 — Government bond

**Terms.** FR0090, BUY, Mandiri Sekuritas Nusantara (AA-, ID). Notional IDR 500,000,000,000.00, value 2026-11-05, maturity 2030-03-15.
Coupon 6.50% paid semi-annually; clean price 98.75; settlement includes accrued coupon (coupon schedule anchored on maturity).

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | PRINCIPAL | PAY | IDR 498,291,095,890.41 | 2026-11-05 |
| 2 | COUPON | RECEIVE | IDR 16,250,000,000.00 | 2027-03-15 |

**Month-end accrual (1–30 Nov 2026).**
- COUPON: IDR 500,000,000,000.00 × 6.50% × 25/365 (coupon accrual, ACT/365) = **Rp 2,226,027,397** → Dr 1202 / Cr 4102 (income).

### CORP-BOND-2026-900005 — Corporate bond

**Terms.** AA corporate bond, BUY, Asia Pacific Securities (AA-, SG). Notional USD 25,000,000.00 (Rp 406,250,000,000 at 16250.00), value 2026-11-09, maturity 2031-06-30.
Coupon 6.75% paid semi-annually; clean price 101.25; settlement includes accrued coupon (coupon schedule anchored on maturity).

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | PRINCIPAL | PAY | USD 25,931,250.00 | 2026-11-09 |
| 2 | COUPON | RECEIVE | USD 843,750.00 | 2026-12-30 |

**Month-end accrual (1–30 Nov 2026).**
- COUPON: USD 25,000,000.00 × 6.75% × 21/360 (coupon accrual, ACT/360) = **Rp 1,599,609,375** → Dr 1202 / Cr 4102 (income).

### FX-SPOT-2026-900006 — FX spot

**Terms.** USD/IDR, BUY, Bank Asia Pasifik (AA, SG). Notional USD 10,000,000.00 (Rp 162,500,000,000 at 16250.00), value 2026-11-19, maturity 2026-11-19.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | PRINCIPAL | PAY | USD 10,000,000.00 | 2026-11-19 |
| 2 | PRINCIPAL | RECEIVE | IDR 162,500,000,000.00 | 2026-11-19 |

No accrual at month-end (settled or matured before the reporting date).

### FX-FORWARD-2026-900007 — FX forward

**Terms.** USD/IDR forward, SELL, Bank Hudson Trust (A+, US). Notional USD 25,000,000.00 (Rp 406,250,000,000 at 16250.00), value 2026-11-04, maturity 2027-02-02.
Forward rate 16305.50 for 90 days against spot 16250.00.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | PRINCIPAL | RECEIVE | USD 25,000,000.00 | 2027-02-02 |
| 2 | PRINCIPAL | PAY | IDR 407,637,500,000.00 | 2027-02-02 |

**Month-end accrual (1–30 Nov 2026).**
- FX_POINTS: USD 25,000,000.00 × (16305.50 − 16250.00) × 26/90 (forward points) = **Rp 400,833,333** → Dr 1207 / Cr 4107 (income).

### FX-SWAP-2026-900008 — FX swap

**Terms.** USD/IDR FX swap, BUY_SELL, Bank Selat Malaka (AA-, ID). Notional USD 50,000,000.00 (Rp 812,500,000,000 at 16250.00), value 2026-11-12, maturity 2026-12-12.
Forward rate 16268.63 for 30 days against spot 16250.00.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | FX_NEAR | RECEIVE | USD 50,000,000.00 | 2026-11-12 |
| 2 | FX_FAR | PAY | IDR 813,431,500,000.00 | 2026-12-12 |

**Month-end accrual (1–30 Nov 2026).**
- FX_POINTS: USD 50,000,000.00 × (16268.63 − 16250.00) × 18/30 (forward points) = **Rp 558,900,000** → Dr 5107 / Cr 2107 (expense).

### IRS-2026-900009 — Interest rate swap

**Terms.** IDR fixed vs IndONIA, PAY_FIXED, Bank Rhine Capital (AA-, DE). Notional IDR 2,000,000,000,000.00, value 2026-11-06, maturity 2031-11-06.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | INTEREST | PAY | IDR 610,334,246,575.34 | 2031-11-06 |
| 2 | INTEREST | RECEIVE | IDR 535,293,150,684.93 | 2031-11-06 |

**Month-end accrual (1–30 Nov 2026).**
- SWAP_NET: IDR 2,000,000,000,000.00 × (6.10% fixed − 5.35% floating) × 24/365 = **Rp 986,301,370** → Dr 5105 / Cr 2105 (expense).

### CORPORATE-LOAN-2026-900010 — Corporate loan

**Terms.** Term loan, DRAW, PT Energi Nusantara Abadi (AA, ID). Notional IDR 750,000,000,000.00, value 2026-09-30, maturity 2029-09-30.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | DRAWDOWN | PAY | IDR 750,000,000,000.00 | 2026-09-30 |
| 2 | INTEREST | RECEIVE | IDR 17,296,232,876.71 | 2026-12-30 |

**Month-end accrual (1–30 Nov 2026).**
- INTEREST: IDR 750,000,000,000.00 × 9.25% × 29/365 (ACT/365) = **Rp 5,511,986,301** → Dr 1201 / Cr 4101 (income).

### SYNDICATED-LOAN-2026-900011 — Syndicated loan

**Terms.** Syndicated term loan, DRAW, PT Telekomunikasi Cakrawala (AA-, ID). Notional IDR 2,500,000,000,000.00, value 2026-10-20, maturity 2031-10-20.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | DRAWDOWN | PAY | IDR 2,500,000,000,000.00 | 2026-10-20 |
| 2 | INTEREST | RECEIVE | IDR 55,136,986,301.37 | 2027-01-20 |

**Month-end accrual (1–30 Nov 2026).**
- INTEREST: IDR 2,500,000,000,000.00 × 8.75% × 29/365 (ACT/365) = **Rp 17,380,136,986** → Dr 1201 / Cr 4101 (income).

### PROJECT-FINANCE-2026-900012 — Project finance

**Terms.** Project finance facility, DRAW, PT Ketenagalistrikan Nasional (AAA, ID). Notional IDR 4,000,000,000,000.00, value 2026-10-31, maturity 2034-10-31.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | DRAWDOWN | PAY | IDR 4,000,000,000,000.00 | 2026-10-31 |
| 2 | INTEREST | RECEIVE | IDR 105,863,013,698.63 | 2027-01-31 |

**Month-end accrual (1–30 Nov 2026).**
- INTEREST: IDR 4,000,000,000,000.00 × 10.50% × 29/365 (ACT/365) = **Rp 33,369,863,014** → Dr 1201 / Cr 4101 (income).

### TRADE-FINANCE-2026-900013 — Trade finance

**Terms.** Usance LC, ISSUE, PT Kimia Nusantara (A, ID). Notional USD 3,000,000.00 (Rp 48,750,000,000 at 16250.00), value 2026-11-04, maturity 2027-02-02.

| Leg | Type | Direction | Amount | Value date |
| --- | --- | --- | --- | --- |
| 1 | PRINCIPAL | PAY | USD 3,000,000.00 | 2026-11-04 |
| 2 | FEE | RECEIVE | USD 6,375.00 | 2026-11-04 |

**Month-end accrual (1–30 Nov 2026).**
- FEE: USD 3,000,000.00 × 0.85% × 26/360 (fee accrual, ACT/360) = **Rp 29,927,138** → Dr 1206 / Cr 4106 (income).

## 4. Month-end accrual report

Income Rp 63,438,246,558 · expense Rp 4,613,694,521 · net Rp 58,824,552,038 across 12 deals.

| Account | Name | Debit | Credit |
| --- | --- | --- | --- |
| 1201 | Interest receivable | Rp 59,181,849,315 | — |
| 1202 | Coupon receivable | Rp 3,825,636,772 | — |
| 1206 | Fee receivable | Rp 29,927,138 | — |
| 1207 | Forward points receivable | Rp 400,833,333 | — |
| 2101 | Interest payable | — | Rp 3,068,493,151 |
| 2105 | Accrued swap payable | — | Rp 986,301,370 |
| 2107 | Forward points payable | — | Rp 558,900,000 |
| 4101 | Interest income | — | Rp 59,181,849,315 |
| 4102 | Coupon income | — | Rp 3,825,636,772 |
| 4106 | Fee income | — | Rp 29,927,138 |
| 4107 | Forward points income | — | Rp 400,833,333 |
| 5101 | Interest expense | Rp 3,068,493,151 | — |
| 5105 | Swap interest expense | Rp 986,301,370 | — |
| 5107 | Forward points expense | Rp 558,900,000 | — |
| | **Total** | **Rp 68,051,941,079** | **Rp 68,051,941,079** |

The journal is balanced: total debits equal total credits.

## 5. Verification

```bash
cd 02-source/backend
npm run seed:treasury                       # regenerate the full book
curl -s -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:4100/api/treasury/accrual?period=2026-11" | jq .totals
curl -s -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:4100/api/treasury/accrual/export?period=2026-11" -o accrual-2026-11.csv
```

The console exposes the same report under **Treasury → Month-end accrual**, including the double-entry journal and per-deal formula.

## 6. Data-quality notes

- The showcase deals are synthetic reference data; names and amounts are fictitious but the calculation logic is the same code used by the seeded book.
- Accruals are computed for deals that are live at month-end (`value_date <= month-end < maturity_date`); duplicate deals are excluded.
- FX forward point accrual is a linear premium amortisation for reporting; fair-value revaluation is out of scope for the pilot.
- Day-count conventions follow the pilot rule set; real contracts can specify 30/360 or modified following and must be mapped in the deal capture.
- IRS and loan records carry one representative cashflow leg per direction in this reference set; the production schedule would carry every periodic fixing and payment date.
