1. Chain-of-thought reasoning per check
The current prompt goes straight to a verdict. Adding a reasoning field forces the model to "show its work" before deciding PASS/FAIL/WARNING, which dramatically reduces hallucinated verdicts.

For each check, first state the relevant application value, then the policy requirement,
then reason step-by-step whether the requirement is met, THEN assign the status.

Add a "reasoning" string field to the check schema (before "status").

2. Explicit numeric comparison instructions
Mortgage policies are full of thresholds (LTV ≤ 100%, income ratios, age limits). The LLM can stumble on comparisons. Be explicit:

When a policy involves a numeric threshold (LTV, LTI, age, income, etc.):
- State the exact numeric value found in the application.
- State the exact threshold from the policy.
- Perform the comparison explicitly (e.g., "85% ≤ 100% → PASS").
- Do NOT round values unless the policy explicitly allows it.


3. Ground checks to specific policy codes
The current prompt says "evaluate against ALL active policies" but doesn't enforce 1:1 mapping. Add:

You MUST produce exactly one check result per policy code provided. 
If a policy cannot be evaluated due to missing data, it must still appear as a WARNING.
The total count of passedChecks + failedChecks + warnings MUST equal the number of policies provided.

This eliminates the common issue of the LLM silently skipping policies.

4. Domain glossary / terminology anchoring
The prompt says "understand BKR, NHG, LTV" but doesn't define them. Ambiguity leads to inconsistency:

Key definitions for your evaluation:
- LTV (Loan-to-Value) = total mortgage / marktwaarde × 100
- LTI (Loan-to-Income) = total mortgage / gross annual household income
- NHG = Nationale Hypotheek Garantie, applicable when mortgage ≤ NHG limit
- BKR = Bureau Krediet Registratie, credit registration codes (A/1/2 = negative)
- AOW = state pension age (currently 67 in the Netherlands)
- Marktwaarde = market value of the property as appraised

5. Handling anonymized fields explicitly in the system prompt
The anonymization instructions are only in the user prompt. Moving them to the system prompt ensures they're treated as a persistent rule:

IMPORTANT: Certain fields have been anonymized for privacy:
- "ageInYears" replaces dateOfBirth — use this for age-based policy checks
- Zone classifications (NL/EU_EEA/NON_EU) replace nationality/country — use for residency policies
- "yearsEmployed" replaces startDate — use for employment tenure checks
Never flag these transformations as "missing data".

6. Few-shot examples
Adding 1-2 example check results in the prompt dramatically improves output consistency:

Example check:
{
  "policyCode": "MUNT-004",
  "policyTitle": "Maximum LTV ratio",
  "status": "PASS",
  "reasoning": "LTV = 320000 / 380000 × 100 = 84.2%. Policy requires LTV ≤ 100%.",
  "reason": "LTV is 84.2%, within the maximum of 100%.",
  "submittedValue": "84.2%",
  "requiredValue": "≤ 100%"
}

7. Verdict calibration rules
The current "REJECTED = one or more critical checks fail" is vague. Which checks are "critical"? Add:
- REJECTED: Any check with status FAIL where the policy category is "Acceptatie", "Inkomen", or "Zekerheden".
- MANUAL_REVIEW: Any FAIL in other categories, OR ≥ 3 WARNINGs.
- APPROVED: All checks PASS or WARNING (max 2 warnings).

Priority orde