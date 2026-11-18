// A lab's own price list. Pure: no database.

const clean = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Catalog tests are keyed by testKey, anything typed in by name by the lower-cased name.
export const priceKey = (testKey, testName) => (testKey ? `k:${String(testKey).trim()}` : `n:${clean(testName)}`);

export const cleanPrice = (input = {}) => {
  const errors = [];
  const testName = String(input.testName || "").trim().slice(0, 250);
  const testKey = input.testKey ? String(input.testKey).trim().slice(0, 80) : "";
  const price = Number(input.price);
  if (!testName && !testKey) errors.push("Choose the test.");
  if (!(Number.isFinite(price) && price >= 0 && price <= 100000000)) errors.push("Enter a price of zero or more.");
  return { value: { testName, testKey, price: Math.round(price * 100) / 100, key: priceKey(testKey, testName) }, errors };
};

// The price to use for a new order: what the user typed if above zero, else the price list, else zero.
export const resolvePrice = (typed, list, testKey, testName) => {
  const t = Number(typed);
  if (Number.isFinite(t) && t > 0) return t;
  const hit = (list || []).find((p) => p.key === priceKey(testKey, testName)) || (testKey ? (list || []).find((p) => p.key === priceKey("", testName)) : null);
  return hit ? hit.price : 0;
};
