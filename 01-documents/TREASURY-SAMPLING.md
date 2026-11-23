# Treasury, Securities & Corporate Financing Reconciliation

**Coverage and Sampling Specification**

**System:** Laras — Payment Reconciliation Control Room
**Organisation:** PT Bank Cakrawala Nusantara (BCN), Payment Operations
**Document version:** 1.0
**Status:** Approved for pilot extension
**Date:** 19 November 2026
**Owner:** Head of Payment Operations (Dimas Adiwangsa)
**Author:** Senior Reconciliation Analyst (Rani Prameswari)
**Audit observer:** Internal Audit (Ayu Lestari)

---

## 1. Purpose and scope

The pilot started as a vendor-payment reconciliation control room: invoices, incoming transfers and kuitansi. This addendum extends the same control model to the bank's own book — money market, securities, FX hedging and corporate financing deals — where the counterparty of the reconciliation is not a vendor invoice but a **deal and its supporting documents**.

Scope of this extension:

- **13 product lines**: money market call, time deposit, repo, government bond, corporate bond, FX spot, FX forward, FX swap, interest rate swap, corporate loan, syndicated loan, project finance and trade finance.
- **Deal-level evidence**: every deal is expected to carry a category-specific set of supporting documents (trade confirmations, deal letters, custody statements, loan agreements, LC applications, shipping documents).
- **Cashflow reconciliation**: expected settlement legs are compared with booked legs (principal, interest, coupon, fee, drawdown, repayment, FX near/far legs).
- **Break management**: document, cashflow, date, counterparty and duplicate findings are raised as breaks with severity, exposure and a drill-down to the deal.

Out of scope for this pilot: mark-to-market valuation, accounting entries, regulatory reporting, and automated settlement instruction generation.

---

## 2. Product taxonomy

| Product | Desk | Typical tenor | Currencies | Required supporting documents | Expected legs |
|---|---|---|---|---|---|
| Money market call | Money Market | 1–30 days | IDR | Deal letter, trade confirmation, settlement advice | 1 principal |
| Time deposit | Money Market | 30–365 days | IDR, USD | Deal letter, trade confirmation, settlement advice | Principal + interest |
| Repo | Securities Finance | 7–90 days | IDR | Repo confirmation, settlement advice, custody statement | Principal + repayment |
| Government bond | Securities | 1–10 years | IDR | Bond trade confirmation, settlement advice, custody statement | Settlement principal + coupon |
| Corporate bond | Securities | 1–10 years | IDR, USD | Bond trade confirmation, settlement advice, custody statement | Settlement principal + coupon |
| FX spot | Treasury FX | T+0 to T+2 | USD, SGD, EUR, JPY | FX confirmation, settlement advice | Foreign principal + IDR counter-leg |
| FX forward | Treasury FX | 30–365 days | USD, SGD, EUR | FX confirmation, settlement advice | Foreign principal + IDR counter-leg |
| FX swap | Treasury FX | 7–180 days | USD, SGD, EUR | FX confirmation, settlement advice | FX near leg + FX far leg |
| Interest rate swap | Rates | 1–10 years | IDR, USD | Trade confirmation, rate fixing, payment advice | Fixed interest + floating interest |
| Corporate loan | Corporate Finance | 6 months–7 years | IDR, USD | Loan agreement, drawdown notice, payment advice | Drawdown + interest |
| Syndicated loan | Corporate Finance | 1–10 years | IDR, USD | Loan agreement, drawdown notice, payment advice | Drawdown + interest |
| Project finance | Corporate Finance | 3–15 years | IDR, USD | Loan agreement, drawdown notice, payment advice | Drawdown + interest |
| Trade finance | Trade Finance | 30–180 days | USD, IDR, EUR | LC application, trade confirmation, shipping documents | Principal + fee |

Directions are product-specific (`PLACE`/`TAKE`, `BUY`/`SELL`, `REPO`/`REVERSE_REPO`, `PAY_FIXED`/`RECEIVE_FIXED`, `DRAW`/`REPAY`, `ISSUE`/`ADVISE`, `BUY_SELL`/`SELL_BUY`). The reconciliation engine does not interpret direction economically; it uses it to validate leg orientation and amounts.

---

## 3. Supporting document taxonomy

| Document | Issued by | Evidence used in matching |
|---|---|---|
| Deal letter | Bank / counterparty | Notional, rate, value date, counterparty |
| Trade confirmation | Counterparty / broker | Notional, rate or price, trade date, value date, maturity |
| Settlement advice | Custodian / payment ops | Notional, settlement date, settlement account |
| Repo confirmation | Counterparty | Repo notional, repo rate, maturity, collateral reference |
| Custody statement | Custodian | Security position, notional, price, valuation date |
| Bond trade confirmation | Broker | Nominal, price, coupon, settlement date |
| FX confirmation | Counterparty | Currency pair, FX rate, near/far value dates |
| Rate fixing | Calculation agent | Fixing rate, fixing date |
| Payment advice | Counterparty | Interest or fee amount, payment date |
| Loan agreement | Bank legal / counterparty | Facility amount, rate, maturity, covenants |
| Drawdown notice | Borrower | Drawdown amount, drawdown date |
| LC application | Corporate client | LC amount, tenor, beneficiary |
| Shipping documents | Exporter / carrier | Shipment value, goods description, dates |

Every document row stores `doc_number`, `doc_version`, `source` (EMAIL, SFTP, PORTAL, CUSTODIAN), `file_name`, `sha256` and the machine-extracted payload (`extracted_json`) used as the evidence trail. The reconciliation never trusts free text: it reads the extracted payload, which in production would come from OCR/IDP and in this pilot is generated deterministically.

---

## 4. Reconciliation rules

### 4.1 Document completeness

1. The required document set is derived from the deal category.
2. A required document that is not present, or whose status is not `RECEIVED`, raises `MISSING_SUPPORTING_DOCUMENT`.
3. Extra documents beyond the required set do not create breaks.

### 4.2 Document field agreement

For each received document, the following fields are compared with the deal:

| Field | Break raised | Tolerance |
|---|---|---|
| Notional | `DOC_NOTIONAL_MISMATCH` (custody statements: `CUSTODY_POSITION_MISMATCH`) | Exact to the minor unit |
| Rate (bps) | `DOC_RATE_MISMATCH` | Exact |
| Price | `DOC_PRICE_MISMATCH` | Exact |
| FX rate | `DOC_FX_RATE_MISMATCH` | Exact |
| Value date | `DOC_DATE_MISMATCH` | Exact |
| Maturity date | `DOC_MATURITY_MISMATCH` | Exact |
| Counterparty | `DOC_COUNTERPARTY_MISMATCH` | Exact ID |
| Currency | `DOC_CURRENCY_MISMATCH` | Exact |

Fields that the product does not use (for example `rate_bps` on a bond, or `price` on a money market call) are skipped rather than treated as missing.

### 4.3 Cashflow reconciliation

1. Each product has an expected leg count (`REQUIRED_LEGS`).
2. Fewer booked legs than expected raises `MISSING_CASHFLOW`.
3. A leg with status `FAILED` raises `UNSETTLED_CASHFLOW`.
4. The full expected cashflow schedule is recomputed from the deal with the calculation rules in 4.7: principal or dirty settlement, interest, coupon, repo repayment, forward counter-value, swap far leg, IRS fixed and floating legs, and trade finance fee.
5. Each booked leg is compared by leg number with the expected amount; a difference above 5×10⁻⁵ relative raises `CASHFLOW_AMOUNT_MISMATCH`.
6. A booked leg whose value date differs from the expected schedule raises `SETTLEMENT_DATE_MISMATCH`.

### 4.4 Duplicate detection

Deals are grouped by `economic_key = category | counterparty | direction | notional | value date | instrument`. A group with more than one deal raises `DUPLICATE_DEAL` on every member of the group. The seeded duplicate deals additionally carry `duplicate_of` for drill-down.

### 4.5 Match status and confidence

| Status | Condition | Confidence |
|---|---|---|
| `FULL` | No breaks, all required docs received, all expected legs present | 100 |
| `PARTIAL` | At least one document or leg matched, but breaks remain | max(45, 90 − 10 × breaks) |
| `UNMATCHED` | No documents and no legs | 30 |

### 4.6 Break severity matrix

| Break | Severity |
|---|---|
| `DUPLICATE_DEAL` | CRITICAL |
| Missing / failed / mismatched cashflow | CRITICAL when deal notional ≥ IDR 100bn, else HIGH |
| Missing supporting document, custody position mismatch | HIGH when ≥ IDR 100bn, else MEDIUM |
| Document notional / rate / price / FX rate mismatch | HIGH when ≥ IDR 50bn, else MEDIUM |
| Document date, settlement date, maturity mismatch | MEDIUM |
| Counterparty, currency mismatch | HIGH |
| Any other product-specific break | HIGH for project finance, else MEDIUM |

### 4.7 Calculation conventions

Interest and cashflow amounts are recomputed from deal terms so that document, cashflow and accrual figures are internally consistent.

| Product area | Day count | Formula and notes |
|---|---|---|
| IDR money market, deposits, repo, loans, bonds | ACT/365 | `notional × rate × days / 365`; day count excludes the first day |
| FX and USD-denominated products | ACT/360 | `notional × rate × days / 360` |
| Bond coupon | ACT/365 IDR, ACT/360 FX | Semi-annual fixed coupon; settlement = clean price × face + accrued coupon since the previous coupon date; next coupon date drives the coupon leg |
| Repo | ACT/365 | Repayment = principal + repo interest; direction depends on repo vs reverse repo |
| FX spot | T+2 business days | Foreign principal and IDR counter-leg at the spot rate |
| FX forward and FX swap | ACT/365 premium | Forward = `spot × (1 + IDR rate × days/365) / (1 + foreign rate × days/360)`; forward and far legs settle on maturity |
| IRS | ACT/365 | Fixed rate versus IndONIA 5.35%; two interest legs, opposite directions |
| Loans and project finance | ACT/365 IDR, ACT/360 FX | Drawdown plus the first quarterly interest payment |
| Trade finance | ACT/360 | Facility fee accrued over the LC tenor |
| Money | Minor units (1/100) | Rounded half-up once at the final amount; no intermediate rounding |

FX reference rates used by the generator: IDR 5.75%, USD 4.35%, SGD 3.20%, EUR 3.75%, JPY 0.60%. Spot reference levels: USD 16,250, SGD 12,050, EUR 17,650, JPY 108.

### 4.8 Month-end accrual and journal

The accrual report values, per deal, the income or expense earned in a calendar month and posts it as a balanced double-entry journal. It is computed on demand from the live book; nothing is stored, so it always agrees with the current deal, leg and rate data.

- Scope: deals live at month-end (`value_date <= month-end` and `maturity_date > month-end`), duplicates excluded, period defaulting to the current month.
- Accrual start = later of month start and value date; accrual end = month-end (clipped at maturity inside the period).
- Product treatment:
  - money market, deposits, repo and loans: interest accrual, income or expense by direction;
  - bonds held long: coupon accrual;
  - FX forwards and swaps: linear amortisation of forward points over the tenor, expense for buy-side, income for sell-side;
  - IRS: net fixed-versus-floating accrual on the notional;
  - trade finance: fee accrual.
- Journal accounts: `1201/2101/4101/5101` interest, `1202/4102` coupon, `1205/2105/4105/5105` swap, `1206/4106` fee, `1207/2107/4107/5107` forward points. Every item debits one account and credits another for the same IDR amount, so total debits equal total credits by construction.
- The report is exposed at `GET /api/treasury/accrual?period=YYYY-MM` (paged items, totals, category summary and journal), as a CSV at `GET /api/treasury/accrual/export?period=YYYY-MM`, and in the console under **Treasury → Month-end accrual** with the formula for every entry.
- Verification: the API returns `balanced: true`; the journal can be tied back to the general ledger by posting the account totals for the period. Worked examples for 13 representative deals are in [TREASURY-WORKED-EXAMPLES.md](TREASURY-WORKED-EXAMPLES.md).

---

## 5. Break taxonomy

| Break type | Meaning | Primary owner |
|---|---|---|
| `MISSING_SUPPORTING_DOCUMENT` | Required document not received or not in `RECEIVED` state | Documentation / Trade support |
| `DOC_NOTIONAL_MISMATCH` | Document notional differs from deal notional | Trade support |
| `DOC_RATE_MISMATCH` | Rate on document differs from deal rate | Treasury middle office |
| `DOC_PRICE_MISMATCH` | Bond price differs | Securities operations |
| `DOC_DATE_MISMATCH` | Value date differs | Settlements |
| `DOC_MATURITY_MISMATCH` | Maturity differs | Trade support |
| `DOC_COUNTERPARTY_MISMATCH` | Document names a different counterparty | Counterparty onboarding |
| `DOC_CURRENCY_MISMATCH` | Document currency differs | Settlements |
| `DOC_FX_RATE_MISMATCH` | FX rate differs | Treasury FX |
| `MISSING_CASHFLOW` | Expected leg not booked | Payments / settlement |
| `CASHFLOW_AMOUNT_MISMATCH` | Booked principal differs from expected | Payments |
| `SETTLEMENT_DATE_MISMATCH` | Principal value date differs | Payments |
| `UNSETTLED_CASHFLOW` | Leg exists but failed | Payments incident desk |
| `DUPLICATE_DEAL` | Same economic key booked twice | Front office |
| `CUSTODY_POSITION_MISMATCH` | Custody statement position differs | Custody operations |

---

## 6. Data model and volumes

Five tables carry the extension:

- `treasury_counterparties` — 39 legal entities: 12 banks, 16 corporates, 3 government, 4 brokers, 2 custodians, 2 multilaterals.
- `treasury_deals` — one row per deal, with `economic_key` and `duplicate_of`.
- `treasury_legs` — expected and booked settlement cashflows, unique per `(deal_id, leg_no)`.
- `treasury_documents` — received evidence with hash and extracted payload.
- `treasury_runs`, `treasury_matches`, `treasury_breaks` — run history, per-deal outcome and findings.

Seed configuration (`TREASURY_PER_CATEGORY`, default 1,200 per product, seed 2026-11-19). The reference run below uses `TREASURY_PER_CATEGORY=5000`:

| Metric | Value |
|---|---|
| Product lines | 13 |
| Base deals | 65,000 |
| Duplicate deals (sampled) | 214 |
| Total deals | 65,214 |
| Cashflow legs | 124,821 |
| Supporting documents | 179,813 |
| Counterparties | 39 |
| Full matches | 61,508 (94.3%) |
| Partial matches | 3,706 |
| Open breaks | 4,626 (1,010 critical, 2,841 high, 775 medium) |
| Seed and reconciliation time | ~8 seconds |
| Database size | 206 MB |

| Product | Deals | Full | Partial | Open breaks | Notional (IDR) |
|---|---|---|---|---|---|
| Money market call | 5,018 | 4,785 | 233 | 317 | 1,016.1T |
| Time deposit | 5,018 | 4,765 | 253 | 303 | 1,916.7T |
| Repurchase agreement | 5,018 | 4,731 | 287 | 355 | 2,589.7T |
| Government bond | 5,014 | 4,729 | 285 | 365 | 3,770.8T |
| Corporate bond | 5,014 | 4,718 | 296 | 377 | 1,247.4T |
| FX spot | 5,024 | 4,736 | 288 | 336 | 1,266.3T |
| FX forward | 5,014 | 4,731 | 283 | 330 | 1,900.8T |
| FX swap | 5,017 | 4,748 | 269 | 311 | 2,517.8T |
| Interest rate swap | 5,022 | 4,684 | 338 | 444 | 5,098.7T |
| Corporate loan | 5,013 | 4,747 | 266 | 332 | 5,104.3T |
| Syndicated loan | 5,018 | 4,703 | 315 | 421 | 13,202.4T |
| Project finance | 5,011 | 4,737 | 274 | 336 | 21,353.9T |
| Trade finance | 5,013 | 4,694 | 319 | 399 | 751.0T |

The notional column is a synthetic stress portfolio: it deliberately repeats large-ticket facilities to exercise aggregation and pagination at scale, and should not be read as an accounting balance.

Break distribution in the reference run:

| Break type | Count |
|---|---|
| Document notional mismatch | 1,334 |
| Missing supporting document | 774 |
| Missing cashflow leg | 589 |
| Document date mismatch | 397 |
| Cashflow amount mismatch | 310 |
| Document rate mismatch | 273 |
| Duplicate deal | 214 |
| Document counterparty mismatch | 212 |
| Document maturity mismatch | 198 |
| Custody position mismatch | 166 |
| Document FX rate mismatch | 159 |

---

## 7. Sampling plan and scenarios

The generator is a deterministic pseudo-random process (`mulberry32`, seed 2026-11-19). Every run of `npm run seed:treasury` reproduces the same deals, documents, anomalies and reconciliation outcome, which makes the dataset usable as a fixed test fixture.

### 7.1 Anomaly injection

Each deal draws one anomaly from a weighted table; impossible anomalies are downgraded to clean:

| Anomaly | Weight | Scenario exercised |
|---|---|---|
| None | 93.5% | Clean deal, full match |
| Missing document | 1.2% | Completeness control |
| Document notional | 0.8% | Notional tie-out |
| Missing leg | 0.9% | Cashflow completeness |
| Document rate | 0.7% | Rate tie-out |
| Document date | 0.6% | Settlement date tie-out |
| Cashflow amount | 0.5% | Principal recomputation |
| FX rate | 0.5% | FX confirmation tie-out |
| Custody | 0.4% | Custody statement position |
| Duplicate | 0.3% | Economic-key duplication |
| Counterparty | 0.3% | Counterparty identity |
| Maturity | 0.3% | Maturity date tie-out |

Guards: `CUSTODY` only applies to products requiring a custody statement (repo, bonds); `DOC_RATE` only to products with a rate; `FX_RATE` only to non-IDR products.

### 7.2 Representative scenarios

| # | Product | Scenario | Expected finding |
|---|---|---|---|
| S-01 | Money market call, IDR 250bn, 7 days | Deal letter, trade confirmation and settlement advice all agree | Full match, 100% confidence |
| S-02 | Time deposit, USD 40m, 90 days | Settlement advice not received | `MISSING_SUPPORTING_DOCUMENT`, HIGH |
| S-03 | Repo, IDR 500bn, 30 days | Custody statement shows 1.5% less collateral | `CUSTODY_POSITION_MISMATCH`, HIGH |
| S-04 | Government bond FR0090, IDR 1.2tn | Trade confirmation price differs by 0.4 | `DOC_PRICE_MISMATCH`, HIGH |
| S-05 | Corporate bond, USD 25m | Coupon date on confirmation differs from deal maturity | `DOC_MATURITY_MISMATCH`, MEDIUM |
| S-06 | FX spot USD/IDR 15m | Confirmation FX rate off by 0.3% | `DOC_FX_RATE_MISMATCH`, MEDIUM |
| S-07 | FX swap EUR/IDR 60m, 90 days | Far-leg cashflow not booked | `MISSING_CASHFLOW`, HIGH |
| S-08 | IRS IDR 800bn, 3 years | Fixed-leg interest leg 0.6% short | `CASHFLOW_AMOUNT_MISMATCH`, HIGH |
| S-09 | Corporate loan IDR 400bn | Drawdown leg value date shifted by one day | `SETTLEMENT_DATE_MISMATCH`, MEDIUM |
| S-10 | Syndicated loan USD 180m | Confirmation names a different participant | `DOC_COUNTERPARTY_MISMATCH`, HIGH |
| S-11 | Project finance IDR 2tn | Facility booked twice with identical economic key | `DUPLICATE_DEAL`, CRITICAL |
| S-12 | Trade finance LC USD 3m | Shipping documents not received | `MISSING_SUPPORTING_DOCUMENT`, MEDIUM/HIGH |

### 7.3 Volume sampling

| Sampling dimension | Setting |
|---|---|
| Deals per product | 5,000 in the reference run; default 1,200 (configurable via `TREASURY_PER_CATEGORY`) |
| Duplicate sampling | One duplicate created per sampled duplicate anomaly |
| Document volume | Two to three documents per deal, per product requirement |
| Temporal spread | Trade dates spread over the 90 days before the run date |
| Currency mix | Product-defined; IDR, USD, SGD, EUR, JPY |
| Counterparty mix | Product-restricted (government for SBN, corporate for loans, banks/brokers for repo) |

To exercise a different scale, set `TREASURY_PER_CATEGORY` (for example `300` for a laptop demo or `5000` for a load test) and re-run `npm run seed:treasury`. Candidate indexes on category, counterparty, economic key, value date and maturity keep list and drill-down queries responsive at five-digit deal counts.

---

## 8. Controls, audit and limitations

- Every run is recorded in `treasury_runs` with trigger (`SEED`, `CLI`, `MANUAL`), period, stats and actor.
- Per-deal outcomes and breaks are scoped to the latest completed run, so repeated runs do not double-count exposure.
- Break drill-down exposes the expected value, the actual value, the document source and the SHA-256 of the evidence file.
- Role rules mirror the payment control room: analysts and supervisors may run reconciliation; auditors are read-only.
- Limitations: valuations, accruals and accounting entries are out of scope; the extracted document payload is synthetic in this pilot and must be replaced by a real IDP feed before production; the synthetic notional volume is a stress fixture, not a balance.

---

## 9. Operating the dataset

```bash
# from 02-source/backend, with Node 24 on PATH
npm run seed:treasury     # regenerate deals, documents, legs and run reconciliation
npm run recon:treasury    # re-run reconciliation only
npm run dev               # API on http://127.0.0.1:4100
```

In the web console, open **Treasury** in the workspace navigation to see coverage by product, the deal register, the break queue and the document drill-down for each deal.
