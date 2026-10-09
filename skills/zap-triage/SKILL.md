---
name: zap-triage
description: Triage ZAP alerts using the OWASP Risk Rating Methodology and write a clear security report. Use after zap_get_alerts, or when asked to triage, rate, or report on web security scan findings.
---

# ZAP triage and report

Turn raw ZAP alerts into a short report a developer can act on. Be honest about what a passive scan can and cannot show.

## 1. Gather

- Call `zap_get_alerts` (use `baseurl` to scope, `min_risk: "Informational"` if asked for everything).
- Note the target, the date, and **what was exercised** (pages and flows browsed). Passive scanning only sees traffic that went through the proxy; say so.

## 2. Classify each finding

For every distinct alert, decide one of:

- **Real**: a genuine weakness in this app.
- **Noise**: true but irrelevant here (for example a missing header on a static asset, a timestamp that is just a timestamp).
- **Needs verification**: plausible, but a passive scan cannot confirm it. Say what to check by hand.

Never present a passive finding as a confirmed exploit.

## 3. Rate with OWASP Risk Rating

Follow the [OWASP Risk Rating Methodology](https://owasp.org/www-community/OWASP_Risk_Rating_Methodology). Rate **Likelihood** and **Impact** each as LOW (0 to <3), MEDIUM (3 to <6) or HIGH (6 to 9), using these factors:

- Likelihood, threat agent: skill level, motive, opportunity, population size.
- Likelihood, vulnerability: ease of discovery, ease of exploit, awareness, intrusion detection.
- Impact, technical: loss of confidentiality, integrity, availability, accountability.
- Impact, business: financial damage, reputation damage, non-compliance, privacy violation.

Overall severity:

| Likelihood \ Impact | LOW | MEDIUM | HIGH |
|---|---|---|---|
| HIGH | Medium | High | Critical |
| MEDIUM | Low | Medium | High |
| LOW | Note | Low | Medium |

Do not copy ZAP's own risk label. It rates the *type* of issue; you rate it *in this app's context*. Say when your rating differs and why. Estimate factors from what you saw; state assumptions instead of inventing precision. One-line justification per finding is enough.

## 4. Write the report

Use exactly this structure:

1. **Summary**: two or three sentences, the overall posture, and the one thing to fix first.
2. **Scope and limits**: target, date, flows covered, passive only, what was not tested.
3. **Findings**, ordered by severity. For each:
   - Title and OWASP severity (Likelihood / Impact)
   - Classification (real, noise, needs verification)
   - Evidence: URLs and the exact header, parameter or value seen
   - Why it matters in this app, in plain language
   - Fix: a concrete change, not "improve security"
4. **Noise**: findings dismissed, one line each with the reason.
5. **Next steps**: what to verify manually, and what an active scan or manual test should cover.

Rules: group duplicates, cite evidence, keep it under two pages, no scare language, no raw alert dumps.
