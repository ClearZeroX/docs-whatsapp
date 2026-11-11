const BRIDGE_URL = "http://127.0.0.1:18765";
const BRIDGE_TOKEN = "idn-prod-log-bridge-v1";
const KIBANA_ORIGIN = "https://log.rupiahcepatweb.com";
const KIBANA_PAGE = `${KIBANA_ORIGIN}/app/discover`;
const POLL_MS = 250;

async function getOrCreateLogTab() {
  const tabs = await chrome.tabs.query({url: `${KIBANA_ORIGIN}/*`});
  if (tabs.length > 0) {
    return tabs[0];
  }
  return chrome.tabs.create({url: KIBANA_PAGE, active: false});
}

async function waitForTabReady(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") {
    return;
  }
  await new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function executeReadOnlyFetch(tabId, request) {
  await waitForTabReady(tabId);
  return chrome.scripting.executeScript({
    target: {tabId},
    world: "MAIN",
    func: async (url, payload, headers) => {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(payload)
      });
      let body;
      try {
        body = await response.json();
      } catch (error) {
        body = {error: "Kibana returned a non-JSON response"};
      }
      return {status: response.status, body};
    },
    args: [request.url, request.payload, request.headers]
  });
}

async function pollBridge() {
  const response = await fetch(`${BRIDGE_URL}/next`, {headers: {"X-IDN-Bridge-Token": BRIDGE_TOKEN}});
  if (response.status === 204) {
    return;
  }
  if (!response.ok) {
    throw new Error(`Bridge poll failed: ${response.status}`);
  }
  const request = await response.json();
  const tab = await getOrCreateLogTab();
  let result;
  try {
    result = (await executeReadOnlyFetch(tab.id, request))[0].result;
  } catch (error) {
    result = {status: 0, error: `Browser log request failed: ${error.message}`};
  }
  await fetch(`${BRIDGE_URL}/complete`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-IDN-Bridge-Token": BRIDGE_TOKEN},
    body: JSON.stringify({id: request.id, status: result.status, body: result.body, error: result.error})
  });
}

chrome.alarms.create("idn-production-log-bridge", {periodInMinutes: 0.5});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "idn-production-log-bridge") {
    pollBridge().catch(() => {});
  }
});
chrome.runtime.onStartup.addListener(() => pollBridge().catch(() => {}));
chrome.runtime.onInstalled.addListener(() => pollBridge().catch(() => {}));

setInterval(() => pollBridge().catch(() => {}), POLL_MS);
