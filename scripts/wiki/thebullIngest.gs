/**
 * TheBull → the vault (doc/ai-open-models-wiki.md § 5.2). A Google Apps Script that lives in the
 * owner's Gmail, not in the app: the app never gets an OAuth grant on the mailbox.
 *
 * Setup (once), at script.google.com → New project, paste this file, then:
 *   1. Project Settings → Time zone: Europe/Rome.
 *   2. Project Settings → Script properties:
 *        INGEST_URL          https://<app domain>/api/wiki/ingest
 *        WIKI_INGEST_SECRET  the same value as the app's env var
 *   3. Run `installWeeklyTrigger` once (Gmail and external-request permissions are asked then).
 *   4. For the archive: run `startBackfill` once; it re-schedules itself every 10 minutes and
 *      removes its own trigger when no unlabelled issue is left.
 *
 * A message is labelled `wiki-ingested` only after the app answered 200 (duplicate) or 201
 * (ingested — compiled or pending: the app retries the compilation itself). Anything else leaves
 * it unlabelled, so the next run sends it again; the endpoint is idempotent on the issue's date,
 * so a request that timed out here but completed there is simply a `duplicate` next time.
 */

var SENDER = 'newsletter@thebull.it';
var LABEL = 'wiki-ingested';
/** Apps Script stops a run at 6 minutes; one ingestion (a model call) can take a minute. */
var RUN_BUDGET_MS = 4.5 * 60 * 1000;

/** Every Sunday: the issues of the last week not yet ingested. */
function ingestLatest() {
  ingestMatching_('from:' + SENDER + ' -label:' + LABEL + ' newer_than:7d');
}

/** Starts the one-off archive recovery: a trigger every 10 minutes until nothing is left. */
function startBackfill() {
  removeTriggers_('backfillArchive');
  ScriptApp.newTrigger('backfillArchive').timeBased().everyMinutes(10).create();
  backfillArchive();
}

/** One batch of the archive, OLDEST first, so the month pages build up in order. */
function backfillArchive() {
  var remaining = ingestMatching_('from:' + SENDER + ' -label:' + LABEL);
  if (remaining === 0) {
    removeTriggers_('backfillArchive');
    console.log('backfill done: every issue is labelled ' + LABEL);
  }
}

function installWeeklyTrigger() {
  removeTriggers_('ingestLatest');
  // The issue lands at ~08:30 Rome time; 10–11 leaves a margin.
  ScriptApp.newTrigger('ingestLatest').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(10).create();
}

/** Sends every matching message, oldest first, within the run budget; returns how many are left. */
function ingestMatching_(query) {
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('INGEST_URL');
  var secret = props.getProperty('WIKI_INGEST_SECRET');
  if (!url || !secret) throw new Error('Set INGEST_URL and WIKI_INGEST_SECRET in the script properties');
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);

  var messages = [];
  for (var start = 0; ; start += 100) {
    var threads = GmailApp.search(query, start, 100);
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        if (message.getFrom().indexOf(SENDER) !== -1) messages.push({ thread: thread, message: message });
      });
    });
    if (threads.length < 100) break;
  }
  messages.sort(function (a, b) { return a.message.getDate() - b.message.getDate(); });

  var sent = 0;
  for (var i = 0; i < messages.length; i++) {
    if (Date.now() - started > RUN_BUDGET_MS) break;
    var message = messages[i].message;
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify({
        source: 'thebull',
        receivedAt: message.getDate().toISOString(),
        subject: message.getSubject(),
        text: message.getPlainBody(),
      }),
      muteHttpExceptions: true,
    });
    var status = response.getResponseCode();
    console.log(message.getDate().toISOString() + ' ' + message.getSubject() + ' → ' + status + ' ' + response.getContentText());
    if (status === 200 || status === 201) {
      messages[i].thread.addLabel(label);
      sent++;
    } else if (status === 401 || status === 503) {
      throw new Error('The app refused the ingestion (' + status + '): check the secret and the vault settings');
    }
  }
  return messages.length - sent;
}

function removeTriggers_(handler) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  });
}
