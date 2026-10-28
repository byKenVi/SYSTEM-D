import test from "node:test";
import assert from "node:assert/strict";
import { projectWebUrl } from "./zoho-projects";

test("project link opens the project page, not the API", () => {
  assert.equal(
    projectWebUrl("us", "servicessystemed", "2705625000000342006"),
    "https://projects.zoho.com/portal/servicessystemed#zp/projects/2705625000000342006/dashboard",
  );
  assert.equal(
    projectWebUrl("ca", "servicessystemed", "1"),
    "https://projects.zohocloud.ca/portal/servicessystemed#zp/projects/1/dashboard",
  );
});
