# Local Wealth Allocation Tracker

A local Python + TypeScript dashboard for monthly tracking of where money is allocated.

## Run

```bash
python3 backend/server.py
```

Then open `http://127.0.0.1:8000`.

The Python server serves the dashboard and writes data to a local SQLite database at `local-data/wealth.db`. That folder is ignored by git.

## TypeScript

The editable TypeScript source is in `frontend/app.ts`, and the compiled browser file is `dist/app.js`.

If TypeScript is installed:

```bash
npm run build
```

## Privacy Notes

- The app talks only to the local Python server at `127.0.0.1`.
- No financial data is written into source files.
- The SQLite database is stored under `local-data/`, which is ignored by git.

## Tracked Fields

- Institution
- Asset Key, generated from Institution, Category, Ticker/Product, and sometimes Cost Basis
- Category
- Ticker/Product
- Current Value
- Whether Current Value was entered as unrealized gain
- Whether a Charles Schwab ETF, mutual fund, or CD was matured/sold
- Cost Basis, not used for High yield saving, Cash, 401k, Roth, or HSA
- Notes
- Month

Supported institution/category combinations:

- Wealthfront: High yield saving
- Charles Schwab: Cash, ETF, Mutual Fund, CD
- Fidelity: 401k, Roth
- Alight: HSA

Account-style categories use one stable asset key even when money is added or withdrawn: High yield saving, Cash, 401k, Roth, HSA.
Investment-style categories include Cost Basis in the asset key: ETF, Mutual Fund, CD.

High yield saving, Cash, 401k, Roth, and HSA are excluded from Total Cost Basis and Unrealized Gain/Loss calculations.
The main Allocation dashboard excludes 401k, Roth, and HSA and shows them in a separate Retirement view.

For existing High yield saving, Cash, 401k, and HSA assets, the form includes an account movement UI:
set the new balance directly, add money to the previous balance, or withdraw money from the previous balance.

## Sold Assets

For a Charles Schwab ETF, Mutual Fund, or CD, enter the proceeds in `Current Value` and check `Matured/Sold`.
The app saves the asset at `0` for the month and creates or updates a Charles Schwab `Cash` row for the same month.
