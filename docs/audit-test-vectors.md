# Audit RNG test vectors

Domain UTF-8: `draw-down-rng-v1`

## Seed / commitment
- Seed (hex): `00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff`
- Commitment SHA-256(seed): compute with any SHA-256 tool; verifier must match `seedCommitment` in package.

## Unbiased index algorithm
1. `block = SHA-256(seed || uint64be(counter) || domain)`
2. `value = first 4 bytes as uint32 BE`
3. `limit = floor(2^32 / n) * n`
4. If `value < limit`, index = `value % n`, else increment counter and retry.

## Replay check
Given the same seed and the `eligibleSorted` arrays stored on each `draw_selection.rng`, replaying from counter `0` must reproduce each `ticket` in order.

Automated coverage: `npm run test:audit`
