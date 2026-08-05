import { validateClockQuorum } from '../shared/clock.js';
import { createCoordinator } from './coordinator.js';

const CTU_REGISTRATION_URL = 'https://dkmhfe.ctu.edu.vn/dangkyhocphan/sinhvien/dangkyhocphan*';
const CTU_REGISTRATION_PREFIX = 'https://dkmhfe.ctu.edu.vn/dangkyhocphan/sinhvien/dangkyhocphan';
const TIME_SOURCES = [
  { url: 'https://www.google.com/generate_204', precision: 'seconds' },
  { url: 'https://www.cloudflare.com/cdn-cgi/trace', precision: 'seconds' },
  { url: 'https://www.microsoft.com', precision: 'seconds' },
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
  void coordinator.handleAlarm(alarm.name)
    .then(reportFailure)
    .catch((error) => reportFailure({ ok: false, error: error.message || 'ALARM_FAILED' }));
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
  if (message?.type === 'GET_STATUS') {
    chrome.storage.local.get(['activeSession', 'lastError']).then(sendResponse);
    return true;
  }
  if (message?.type === 'SCAN_COURSES') {
    sendToRegistrationTab({ type: 'SCAN_COURSES' })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || 'SCAN_FAILED' }));
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
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeCtuTabs = activeTabs.filter((tab) => tab.url?.startsWith(CTU_REGISTRATION_PREFIX));
  const tabs = activeCtuTabs.length === 1
    ? activeCtuTabs
    : await chrome.tabs.query({ url: [CTU_REGISTRATION_URL] });
  const ctuTabs = tabs.filter((tab) => tab.url?.startsWith(CTU_REGISTRATION_PREFIX));
  if (ctuTabs.length !== 1 || !ctuTabs[0].id) {
    throw new Error('CTU_REGISTRATION_TAB_UNAVAILABLE');
  }

  const response = await chrome.tabs.sendMessage(ctuTabs[0].id, command);
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
  if (command.type === 'CLICK_REGISTER') {
    const outcome = await coordinator.handleClickOutcome(command.runId, response ?? { category: 'ambiguous' });
    if (!outcome.ok) throw new Error(outcome.error);
  }
  return response;
}

async function synchronizeClock() {
  const results = await Promise.allSettled(TIME_SOURCES.map(sampleTimeSource));
  const samples = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  return validateClockQuorum(samples);
}

async function sampleTimeSource(source) {
  const sentAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let response;
  try {
    response = await fetch(source.url, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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
