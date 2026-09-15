# Who can create beacon join requests

## What the scan flagged

The scanner noticed there is no rule saying who may create a join request row, and warned that creation might be unrestricted.

## What is actually true today

I checked the database directly:

- Signed-in accounts and signed-out visitors have **no create permission at all** on the join-requests table. Only the server's own trusted key can write to it.
- Signed-in accounts can only *read* a limited set of columns (pairing word, device label, status, timestamps) — never the secret join code hash.

So join requests can only be created by the phone-enrolment endpoint, which already caps the pending queue at 25 requests. The warning is a false positive: the protection exists as a permission, not as a policy, so the scanner cannot see it.

## Proposed change

1. Add an explicit, self-documenting rule to the join-requests table that blocks creation by any signed-in or signed-out account (an always-false create policy). This changes no behaviour — it only makes the existing restriction visible to the scanner and to anyone reading the schema later.
2. Re-run the security scan and mark this warning resolved.

No app code changes, no change to how the Android app joins.

## Technical detail

Migration on `public.beacon_enrollments`:

```sql
CREATE POLICY "No client inserts" ON public.beacon_enrollments
FOR INSERT TO authenticated, anon WITH CHECK (false);
```

`INSERT` remains ungranted for `authenticated`/`anon`; `service_role` keeps full access and bypasses RLS, so `src/routes/api/public/beacon-enroll.ts` continues to work unchanged.
