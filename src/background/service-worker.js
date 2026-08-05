import { estimateOffset } from '../shared/clock.js';
import { createCoordinator } from './coordinator.js';

const CTU_REGISTRATION_URL = 'https://dkmhfe.ctu.edu.vn/dangkyhocphan/sinhvien/dangkyhocphan*';
const TIME_SOURCES = [
  { url: 'https://timeapi.io/api/Time/current/zone?timeZone=Etc%2FUTC', precision: 'milliseconds' },
  { url: 'https://www.google.com/generate_204', precision: 'seconds' },
];

let coordinator;

coordinator = createCoordinator({
  clock: synchronizeClock,
  createAlarm: (name, info) => chrome.alarms.create(name, info),
  clearAlarm: (name) => chrome.alarms.clear(name),
  clearSaved: () => chrome.storage.local.remove('activeSession'),
  id: () => crypto.randomUUID(),
  save: (session) => chrome.storage.local.set({ activeSession: session }),
  send: sendToRegistrationTab,
});

void restoreSession();

chrome.alarms.onAlarm.addListener((alarm) => {
  void coordinator.handleAlarm(alarm.name).then(reportFailure);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ARM_RUN') {
    coordinator.arm(message.run)
      .then((result) => {
        sendResponse(result);
        reportFailure(result);
      })
      .catch((error) => sendResponse({ ok: false, error: error.message || 'ARM_FAILED' }));
    return true;
  }
  if (message?.type === 'DISARM_RUN') {
    chrome.storage.local.get('activeSession')
      .then(({ activeSession }) => coordinator.disarm(activeSession?.runId))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || 'DISARM_FAILED' }));
    return true;
  }
  return undefined;
});

async function restoreSession() {
  const { activeSession } = await chrome.storage.local.get('activeSession');
  if (activeSession?.runId) {
    coordinator.restore(activeSession);
  }
}

async function sendToRegistrationTab(command) {
  const tabs = await chrome.tabs.query({ url: [CTU_REGISTRATION_URL] });
  if (tabs.length !== 1 || !tabs[0].id) {
    throw new Error('CTU_REGISTRATION_TAB_UNAVAILABLE');
  }

  const response = await chrome.tabs.sendMessage(tabs[0].id, command);
  if (command.type === 'PREPARE') {
    if (!response?.ok) {
      throw new Error(response?.error ?? 'PREPARE_FAILED');
    }
    const prepared = await coordinator.acceptPrepared(command.runId, response.prepared);
    if (!prepared.ok) {
      throw new Error(prepared.error);
    }
    if (prepared.state === 'fallback-submitting') {
      const submitted = await coordinator.submitFallback(command.runId);
      if (!submitted.ok) throw new Error(submitted.error);
    }
  }
  if (command.type === 'SUBMIT') {
    if (response?.status === 'prepared-dry-run') {
      await coordinator.handleOutcome(command.runId, { category: 'success' });
    } else {
      const outcome = await coordinator.handleOutcome(command.runId, response ?? { category: 'ambiguous' });
      if (!outcome.ok) throw new Error(outcome.error);
    }
  }
  return response;
}

async function synchronizeClock() {
  const results = await Promise.allSettled(TIME_SOURCES.map(sampleTimeSource));
  const samples = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  const estimate = estimateOffset(samples);
  const precise = samples.find((sample) => sample.precision === 'milliseconds');
  const coarse = samples.find((sample) => sample.precision === 'seconds');
  if (!estimate.ok || !precise || !coarse || Math.abs(precise.offsetMs - coarse.offsetMs) > 1_500) {
    return { ok: false, error: 'CLOCK_QUORUM_FAILED' };
  }
  return { ok: true, offsetMs: precise.offsetMs };
}

async function sampleTimeSource(source) {
  const sentAt = Date.now();
  const response = await fetch(source.url, { cache: 'no-store' });
  const receivedAt = Date.now();
  if (!response.ok) {
    throw new Error(`TIME_SOURCE_HTTP_${response.status}`);
  }

  const payload = source.precision === 'milliseconds' ? await response.json() : {};
  const serverAt = Date.parse(payload.datetime ?? payload.dateTime ?? response.headers.get('date') ?? '');
  if (!Number.isFinite(serverAt)) {
    throw new Error('TIME_SOURCE_TIMESTAMP_INVALID');
  }

  return {
    offsetMs: serverAt - Math.round((sentAt + receivedAt) / 2),
    rttMs: receivedAt - sentAt,
    precision: source.precision,
  };
}

function reportFailure(result) {
  if (result?.ok !== false) {
    return;
  }
  void chrome.storage.local.set({ lastError: result.error });
}
