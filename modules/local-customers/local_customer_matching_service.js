import { UserProfile } from "../users/user_profile_model.js";

// ─── Levenshtein distance helper ─────────────────────────────────────────────
// Used for fuzzy name matching at Level 3+.
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalizeName(name) {
  return (name || "").toLowerCase().replace(/[^a-z\s]/g, "").trim();
}

function nameSimilar(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  // Exact or distance ≤ 2 on full name, or one is a substring of the other
  return (
    na === nb ||
    levenshtein(na, nb) <= 2 ||
    na.includes(nb) ||
    nb.includes(na)
  );
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.slice(-9); // last 9 digits, same logic as patient_service.js
}

// ─── Main matching function ───────────────────────────────────────────────────
// Returns: { status, userId, confidence, matchedOn, candidates }
// status: "matched" | "possible_match" | "new" | "failed"
export async function matchCustomer({ phone, email, fullName, firstName, lastName, dob }) {
  try {
    const name = fullName || [firstName, lastName].filter(Boolean).join(" ");
    const candidates = [];

    // ── Level 1: Phone ────────────────────────────────────────────────────────
    if (phone) {
      const last9 = normalizePhone(phone);
      if (last9.length >= 7) {
        const byPhone = await UserProfile.find({
          phone: new RegExp(`${last9}$`),
        })
          .select("_id fullName firstName lastName email phone dateOfBirth")
          .limit(5)
          .lean();

        if (byPhone.length === 1) {
          return { status: "matched", userId: byPhone[0]._id, confidence: 95, matchedOn: ["phone"], candidates: [] };
        }
        if (byPhone.length > 1) {
          candidates.push(
            ...byPhone.map((u) => ({ userId: u._id, score: 90, matchedOn: ["phone"] }))
          );
        }
      }
    }

    // ── Level 2: Email ────────────────────────────────────────────────────────
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const byEmail = await UserProfile.find({ email: normalizedEmail })
        .select("_id fullName firstName lastName email phone dateOfBirth")
        .limit(5)
        .lean();

      if (byEmail.length === 1) {
        return { status: "matched", userId: byEmail[0]._id, confidence: 90, matchedOn: ["email"], candidates: [] };
      }
      if (byEmail.length > 1) {
        candidates.push(
          ...byEmail.map((u) => ({ userId: u._id, score: 85, matchedOn: ["email"] }))
        );
      }
    }

    // ── Level 3: Phone + Name ─────────────────────────────────────────────────
    if (phone && name) {
      const last9 = normalizePhone(phone);
      if (last9.length >= 7) {
        const byPhone = await UserProfile.find({
          phone: new RegExp(`${last9}$`),
        })
          .select("_id fullName firstName lastName email phone dateOfBirth")
          .limit(20)
          .lean();

        const nameMatches = byPhone.filter((u) =>
          nameSimilar(name, u.fullName) ||
          nameSimilar(name, [u.firstName, u.lastName].filter(Boolean).join(" "))
        );

        if (nameMatches.length === 1) {
          return { status: "matched", userId: nameMatches[0]._id, confidence: 82, matchedOn: ["phone", "name"], candidates: [] };
        }
        if (nameMatches.length > 1) {
          candidates.push(
            ...nameMatches.map((u) => ({ userId: u._id, score: 78, matchedOn: ["phone", "name"] }))
          );
        }
      }
    }

    // ── Level 4: DOB + Name ───────────────────────────────────────────────────
    if (dob && name) {
      const dobDate = new Date(dob);
      if (!isNaN(dobDate.getTime())) {
        const dobStart = new Date(dobDate);
        dobStart.setHours(0, 0, 0, 0);
        const dobEnd = new Date(dobDate);
        dobEnd.setHours(23, 59, 59, 999);

        const byDob = await UserProfile.find({
          dateOfBirth: { $gte: dobStart, $lte: dobEnd },
        })
          .select("_id fullName firstName lastName email phone dateOfBirth")
          .limit(20)
          .lean();

        const nameMatches = byDob.filter((u) =>
          nameSimilar(name, u.fullName) ||
          nameSimilar(name, [u.firstName, u.lastName].filter(Boolean).join(" "))
        );

        if (nameMatches.length === 1) {
          return { status: "matched", userId: nameMatches[0]._id, confidence: 77, matchedOn: ["dob", "name"], candidates: [] };
        }
        if (nameMatches.length > 1) {
          candidates.push(
            ...nameMatches.map((u) => ({ userId: u._id, score: 73, matchedOn: ["dob", "name"] }))
          );
        }
      }
    }

    // ── Evaluate accumulated candidates ───────────────────────────────────────
    if (candidates.length > 0) {
      // Deduplicate by userId
      const seen = new Set();
      const unique = candidates.filter((c) => {
        const key = String(c.userId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const best = unique.sort((a, b) => b.score - a.score)[0];

      if (best.score >= 90) {
        return { status: "matched", userId: best.userId, confidence: best.score, matchedOn: best.matchedOn, candidates: [] };
      }
      return {
        status: "possible_match",
        userId: null,
        confidence: best.score,
        matchedOn: best.matchedOn,
        candidates: unique.slice(0, 5),
      };
    }

    return { status: "new", userId: null, confidence: 0, matchedOn: [], candidates: [] };
  } catch (err) {
    console.error("[matchCustomer] error:", err.message);
    return { status: "failed", userId: null, confidence: 0, matchedOn: [], candidates: [] };
  }
}
