import { estimateOffset } from '../shared/clock.js';
import { createCoordinator } from './coordinator.js';

const CTU_REGISTRATION_URL = 'https://dkmhfe.ctu.edu.vn/dangkyhocphan/sinhvien/dangkyhocphan*';
const TIME_SOURCES = [
  'https://worldtimeapi.org/api/timezone/Etc/UTC',
  'https://timeapi.io/api/Time/current/zone?timeZone=Etc%2FUTC',
];

let coordinator;

coordinator = createCoordinator({
  clock: synchronizeClock,
  createAlarm: (name, info) => chrome.alarms.create(name, info),
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
  }
  return response;
}

async function synchronizeClock() {
  const results = await Promise.allSettled(TIME_SOURCES.map(sampleTimeSource));
  const samples = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  return estimateOffset(samples);
}

async function sampleTimeSource(url) {
  const sentAt = Date.now();
  const response = await fetch(url, { cache: 'no-store' });
  const receivedAt = Date.now();
  if (!response.ok) {
    throw new Error(`TIME_SOURCE_HTTP_${response.status}`);
  }

  const payload = await response.json();
  const serverAt = Date.parse(payload.datetime ?? payload.dateTime ?? response.headers.get('date') ?? '');
  if (!Number.isFinite(serverAt)) {
    throw new Error('TIME_SOURCE_TIMESTAMP_INVALID');
  }

  return {
    offsetMs: serverAt - Math.round((sentAt + receivedAt) / 2),
    rttMs: receivedAt - sentAt,
  };
}

function reportFailure(result) {
  if (result?.ok !== false) {
    return;
  }
  void chrome.storage.local.set({ lastError: result.error });
}
