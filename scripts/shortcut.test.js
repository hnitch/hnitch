import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await fs.readFile(new URL("../shortcuts/workflow.json", import.meta.url), "utf8"));
const actions = manifest.WFWorkflowActions;
const parameters = (index) => actions[index].WFWorkflowActionParameters;

test("shortcut backup contains no credential and uses the flat fresh book feed", () => {
  const raw = JSON.stringify(manifest);
  assert.match(raw, /Bearer REPLACE_WITH_FINE_GRAINED_TOKEN/);
  assert.doesNotMatch(raw, /github_pat_|gh[pousr]_/);
  assert.doesNotMatch(raw, /goodreads\.current/);
  assert.equal(parameters(0).WFURLActionURL, "https://hnitch-discord-card.haarshaan.workers.dev/reading.json");
  assert.equal(parameters(2).WFDictionaryKey, "bookId");
  assert.equal(parameters(3).WFCondition, 101); // Does not have any value.
  assert.equal(parameters(3).WFInput.Variable.Value.OutputUUID, parameters(2).UUID);
  assert.equal(actions[5].WFWorkflowActionIdentifier, "is.workflow.actions.exit");
  assert.equal(parameters(8).WFDictionaryKey, "shortcutPrompt");
  assert.equal(parameters(10).WFDictionaryKey, "bookId");
});

test("save request sends main, the actual input variables, and requests a run acknowledgement", () => {
  const post = parameters(15);
  assert.equal(post.WFHTTPMethod, "POST");
  const fields = Object.fromEntries(post.WFJSONValues.Value.WFDictionaryFieldValueItems.map(item => [item.WFKey.Value.string, item]));
  assert.equal(fields.ref.WFValue.Value.string, "main");
  assert.equal(fields.return_run_details.WFItemType, 4);
  assert.equal(fields.return_run_details.WFValue.Value, true);
  const inputs = fields.inputs.WFValue.Value.Value.WFDictionaryFieldValueItems;
  assert.deepEqual(inputs.map(item => [item.WFKey.Value.string, Object.values(item.WFValue.Value.attachmentsByRange)[0].VariableName]), [["reading_book_id", "BookID"], ["reading_progress", "ProgressInput"]]);
});

test("confirmation requires a real run ID; rejection exits before success", () => {
  assert.equal(parameters(16).WFDictionaryKey, "workflow_run_id");
  assert.equal(parameters(16).WFInput.Value.OutputUUID, parameters(15).UUID);
  assert.equal(parameters(17).WFCondition, 101);
  assert.equal(parameters(17).WFControlFlowMode, 0);
  assert.equal(parameters(17).WFInput.Variable.Value.OutputUUID, parameters(16).UUID);
  assert.match(parameters(18).WFAlertActionMessage, /did not accept/);
  assert.equal(actions[19].WFWorkflowActionIdentifier, "is.workflow.actions.exit");
  assert.equal(parameters(21).WFControlFlowMode, 2);
  assert.equal(parameters(22).WFAlertActionTitle, "Update queued ✓");
  assert.equal(parameters(22).WFAlertActionCancelButtonShown, false);
  assert.equal(manifest.WFWorkflowName, "Read Me Book Progress");
});

test("clean book prompt and dismissible acknowledgement never send a notification", () => {
  assert.equal(parameters(12).WFAskActionPrompt.Value.string, "\uFFFC");
  assert.equal(parameters(12).WFAskActionPrompt.Value.attachmentsByRange["{0, 1}"].VariableName, "BookTitle");
  assert.equal(parameters(9).WFInput.Value.OutputUUID, parameters(8).UUID);
  assert.match(parameters(22).WFAlertActionMessage, /waiting to save/);
  assert.ok(actions.every(action => !/notification/.test(action.WFWorkflowActionIdentifier)));
  const headers = parameters(1).WFHTTPHeaders.Value.WFDictionaryFieldValueItems;
  assert.ok(headers.every(item => item.WFKey.Value.string.length > 0));
});
