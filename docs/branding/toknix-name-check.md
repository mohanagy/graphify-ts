# Toknix Name Check

Date checked: 2026-05-22

Recommendation: **proceed with caution**

## Executive summary

`Toknix` currently looks **available enough on npm, GitHub, and the sampled domain set** to keep as a live candidate:

- the exact npm package names checked returned `404 Not Found`;
- `github.com/mohanagy/toknix` and the `toknix` GitHub user/org path both returned `404` at check time;
- `toknix.dev`, `toknix.io`, `toknix.app`, and `toknix.ai` all returned NXDOMAIN / `ENOTFOUND` in DNS checks.

The main risk is **brand contamination**, not package/path occupancy. Web search surfaced a crypto-trading entity using the string **Primehill Toknix**, and Sweden's Finansinspektionen has published an investor warning for that entity. That means the name is not clean in web search even if the exact developer-tool slots are still open.

## Go / no-go recommendation

Current recommendation: **proceed with caution**, not a full green light.

Why:

1. **Positive**: the developer-surface checks are favorable enough to reserve names now.
2. **Negative**: the public-web/search risk is real because `Toknix` already appears in association with a regulator warning on a crypto/scam-adjacent brand.
3. **Implication**: if the project wants to keep `Toknix` alive as a candidate, reserve the package/domain/GitHub surfaces quickly, but do **not** treat this issue as legal clearance or proof the brand is clean for launch.

## Surfaces checked

### npm exact-name checks

Commands used:

```bash
npm view toknix --json
npm view @toknix/cli --json
npm view @toknix/core --json
npm view @mohammednagy/toknix --json
```

Results:

| Package | Result | Notes |
| --- | --- | --- |
| `toknix` | 404 / not found | No published exact package found at check time |
| `@toknix/cli` | 404 / not found | Scoped CLI package appears available |
| `@toknix/core` | 404 / not found | Scoped core package appears available |
| `@mohammednagy/toknix` | 404 / not found | Owner-scoped fallback appears available |

Preferred reservation order if the brand stays in play:

1. `@toknix/cli`
2. `toknix`
3. `@mohammednagy/toknix`
4. `@toknix/core`

Rationale:

- `@toknix/cli` gives the cleanest long-term namespace if the product becomes a multi-package ecosystem.
- `toknix` is the best end-user install name, but is also the most desirable exact package to lose.
- `@mohammednagy/toknix` is the safest fallback if the `@toknix` scope cannot be claimed immediately.
- `@toknix/core` matters, but it is not the first package to reserve if only one package can be claimed quickly.

### GitHub checks

Checks used:

- `GET https://api.github.com/users/toknix`
- `GET https://api.github.com/repos/mohanagy/toknix`
- `GET https://api.github.com/search/repositories?q=toknix`

Results:

| Surface | Result | Notes |
| --- | --- | --- |
| `github.com/toknix` | API returned `404 Not Found` | Appears unused at check time, but should be claimed quickly if desired |
| `github.com/mohanagy/toknix` | API returned `404 Not Found` | Repo path appears available |
| GitHub repo search for `toknix` | Matches found | Existing repos include `Zefirka659/Toknix` and `ligenchang/toknix` |

Conclusion:

- the exact owner/repo path `mohanagy/toknix` appears open;
- the bare `toknix` GitHub account/org path also appears open from the public API check;
- the name is not unique on GitHub search, so the brand is not globally uncontested.

### Domain checks

Checks used:

```text
DNS lookup via dns.google resolve API
HTTPS HEAD request
```

Exact queries:

- `https://dns.google/resolve?name=toknix.dev&type=A`
- `https://dns.google/resolve?name=toknix.io&type=A`
- `https://dns.google/resolve?name=toknix.app&type=A`
- `https://dns.google/resolve?name=toknix.ai&type=A`

Results:

| Domain | DNS result | HTTPS result | Interpretation |
| --- | --- | --- | --- |
| `toknix.dev` | `Status: 3` / no A record | `ENOTFOUND` | Unresolved at check time |
| `toknix.io` | `Status: 3` / no A record | `ENOTFOUND` | Unresolved at check time |
| `toknix.app` | `Status: 3` / no A record | `ENOTFOUND` | Unresolved at check time |
| `toknix.ai` | `Status: 3` / no A record | `ENOTFOUND` | Unresolved at check time |

Important caveat: **NXDOMAIN is not proof of registrar availability**. It only shows the domains were not actively resolving during this check.

Recommended reservation order:

1. `toknix.dev`
2. `toknix.io`
3. `toknix.app`
4. `toknix.ai`

### Social / directory checks

Searches used:

- `Toknix site:producthunt.com OR site:linkedin.com/company OR site:twitter.com OR site:mcpdirectory.com`

Observed result:

- no exact `Toknix` match was surfaced in the sampled Product Hunt, LinkedIn/company, X/Twitter, or MCP-directory-oriented search results;
- `mcpdirectory.com` itself resolves, but no `Toknix` entry surfaced from the sampled search.

Conclusion:

- no obvious exact-match handle/listing conflict surfaced in this lightweight pass;
- this is still weaker than checking each platform directly while signed in.

### Trademark / legal-risk note

Searches used:

- `Toknix trademark USPTO WIPO EUIPO`
- official database entry points reviewed:
  - `https://www.uspto.gov/trademarks/search`
  - `https://tmsearch.uspto.gov/search/search-results`
  - `https://www.euipo.europa.eu/en/search-ip`
  - `https://branddb.wipo.int/`

Observed result:

- no exact-match `Toknix` trademark surfaced in the sampled web results pointing to USPTO, EUIPO, or WIPO tools.

Important caveat:

- this is **not** formal trademark clearance;
- a manual exact-word search in the official databases should still be done before any public rename or launch campaign.

## Negative web-search risk

Searches used:

- `Toknix`
- `Primehill Toknix blacklisted regulator warning`

Material finding:

- the strongest public-web signal attached to the string `Toknix` was **Primehill Toknix**, which is the subject of an investor warning from **Finansinspektionen** (Sweden's financial regulator).

Relevant references:

- Finansinspektionen warning page: `https://www.fi.se/en/our-registers/investor-alerts/investor-alerts/2026/mars/primehill-toknix/`
- IOSCO investor alerts portal: `https://www.iosco.org/investor_alerts/`

Interpretation:

- the exact developer-tool package/repo/domain surfaces do not appear occupied;
- however, the broader search reputation of the string is already polluted by a high-risk finance/scam-adjacent usage;
- that makes `Toknix` a weaker brand than a truly clean coined name.

## Final recommendation

Recommendation status: **proceed with caution**

Suggested next action:

1. If `Toknix` remains the preferred brand, reserve the npm/GitHub/domain assets immediately.
2. Treat issue #241 as a migration-planning issue only after those reservations are complete.
3. Before public launch, run a stronger manual trademark/database pass and decide whether the Primehill Toknix association is acceptable.

## Fallback candidates if `Toknix` is rejected

These are placeholder fallback candidates to check before any broader rename decision:

1. keep `graphify-ts` until a cleaner replacement is chosen
2. `context-compiler`
3. `repo-context`
4. `context-pack`

These are **not approved brand picks**; they are only contingency placeholders if the Toknix risk profile is considered too high in issue #241.
