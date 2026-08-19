import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { escapeHtml, sanitizeEmailSubject } from "./resend";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const serverIndex = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("les valeurs dynamiques des e-mails sont échappées", () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script> & 'test'`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;test&#39;",
  );
  assert.equal(sanitizeEmailSubject("Sujet\r\nBcc: attacker@example.com"), "Sujet Bcc: attacker@example.com");
});

test("les uploads exigent un formulaire autorisé et une signature valide", () => {
  assert.match(routes, /formSubmissionId and fieldKey are required/);
  assert.match(routes, /uploadSignatureMatches/);
  assert.match(routes, /storage\.createFormUpload/);
  assert.doesNotMatch(routes, /app\.post\("\/api\/forms\/:id\/uploads"/);
});

test("les journaux API ne contiennent pas les corps JSON", () => {
  assert.doesNotMatch(serverIndex, /capturedJsonResponse/);
  assert.doesNotMatch(serverIndex, /JSON\.stringify\(capturedJsonResponse\)/);
});