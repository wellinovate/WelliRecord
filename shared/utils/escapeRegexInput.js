// Escapes regex special characters in user-supplied search text before
// it goes into `new RegExp(...)`. Without this, a search term with any
// of these characters throws (a name like "O'Brien (Jr.)" — very
// ordinary input — crashes the search with a regex SyntaxError instead
// of matching), and a deliberately crafted pattern can trigger
// catastrophic backtracking (ReDoS), tying up the request for a long
// time on a small, authenticated-only blast radius but still worth
// closing off. Used anywhere a raw `search` query param builds a
// MongoDB regex filter — see local_customer_service.js,
// membership_services.js, patient_service.js.
export const escapeRegexInput = (text) =>
  String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
