"""Provenance of annual_series.csv (doc/montecarlo/README.md § 14.13, RQ10).

Turns the raw daily/monthly files archived in /mnt/project-files/montecarlo/ (listed with their SHA-256 in
manifest.json) into the ONE derived file the repo keeps: nominal annual returns in EUR per class (and hedged where a
hedge exists) plus the European CPI. Same method as R0-bis b0_load.py / b4_corr.py: monthly = last close of the month,
annual = compounded months of the full calendar years inside the class window. Run once, by hand, when the research
files change; the app and the tests never run it.

    python3 data/montecarlo/build_annual.py /mnt/project-files/montecarlo data/montecarlo/annual_series.csv
"""
import sys
import numpy as np
import pandas as pd

root, out = sys.argv[1], sys.argv[2]
D, V = f'{root}/r0-dati-2/', f'{root}/r0-validazione/'


def load(name):
    s = pd.read_csv(D + name + '.csv', encoding='utf-8-sig')
    s.columns = ['d', 'v']
    return s.set_index(pd.to_datetime(s.d)).v.astype(float)


def fix_carry(v):
    """Drops the splice jump of 24/01/2020 (R0-validazione § 5bis.5)."""
    r = v.pct_change()
    r.loc[pd.Timestamp('2020-01-24')] = 0.0
    return (1 + r.fillna(0)).cumprod() * v.iloc[0]


def series(t, cur):
    v = load(f'{t}_{cur}')
    return fix_carry(v) if t == 'ueqcsim' else v


def monthly(v):
    return v.resample('ME').last().pct_change().dropna()


def fred(path):
    x = pd.read_csv(path)
    x.columns = ['d', 'v']
    x = x[pd.to_numeric(x.v, errors='coerce').notna()]
    return x.set_index(pd.to_datetime(x.d)).v.astype(float)


def to_annual(m):
    return (1 + m).groupby(m.index.year).prod() - 1


def full_years(m, y0, y1):
    m = m.loc[str(y0):str(y1)]
    c = m.groupby(m.index.year).size()
    return m[m.index.year.isin(c[c == 12].index)]


cash_eur, cash_usd = monthly(load('casheur_eur')), monthly(load('cashx_usd'))


def hedged(t):
    return (monthly(series(t, 'usd')) + cash_eur - cash_usd).dropna()


# Bund 10 anni a scadenza costante, mensile, dal rendimento FRED IRLTLT01DEM156N (OECD)
y = fred(V + 'fred_IRLTLT01DEM156N.csv') / 100


def price(c, yy, n):
    return (c / yy) * (1 - (1 + yy) ** -n) + (1 + yy) ** -n if abs(yy) > 1e-9 else 1 + c * n


bund_m = pd.Series([price(y[p], y[q], 10 - 1 / 12) - 1 + y[p] / 12 for p, q in zip(y.index[:-1], y.index[1:])], index=y.index[1:])
bund_m.index = bund_m.index + pd.offsets.MonthEnd(0)

# (colonna, serie mensile, primo anno) — l'ultimo anno è sempre il 2025
SRC = [
    ('equity', monthly(series('vtsim', 'eur')), 1972), ('equity_hedged', hedged('vtsim'), 1972),
    ('bonds', bund_m, 1972),
    ('gold', monthly(series('gldsim', 'eur')), 1981), ('gold_hedged', hedged('gldsim'), 1981),
    ('commodity', monthly(series('gsgsim', 'eur')), 1980),
    ('cash', cash_eur, 1972),
    ('trend', monthly(series('dbmfsim', 'eur')), 2001), ('trend_hedged', hedged('dbmfsim'), 2001),
    ('carry', monthly(series('ueqcsim', 'eur')), 2002), ('carry_hedged', hedged('ueqcsim'), 2002),
]
cols = {name: to_annual(full_years(m, y0, 2025)) for name, m, y0 in SRC}
cpi = pd.read_csv(V + 'cpi_eur_annual.csv', index_col=0).iloc[:, 0]
df = pd.DataFrame(cols)
df.insert(0, 'cpi_eur', cpi.reindex(df.index))
df.index.name = 'year'
df.to_csv(out, float_format='%.6f')
print(df.shape, df.index.min(), df.index.max())
