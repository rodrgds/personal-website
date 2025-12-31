<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { settings } from "./storage";
  import { fetchListings } from "./api";
  import { calculateDynamicRequiredPercent, formatCurrency } from "./utils";
  import type { Listing, LogEntry } from "./types";
  import Input from "./Input.svelte";
  import Label from "./Label.svelte";
  import Tabs from "../../common/Tabs.svelte";
  import Button from "../../common/Button.svelte";
  import Checkbox from "../../common/Checkbox.svelte";

  // -- CONSTANTS --
  const HARD_MIN_INTERVAL = 18.0;
  const LONG_DELAY_INTERVAL = 60.0;
  const NEW_ITEMS_SLOW_THRESHOLD = 5;
  const TARGET_OVERLAP = 4;

  let isRunning = false;
  let logs: LogEntry[] = [];
  let stats = {
    requests: 0,
    dealsFound: 0,
    lastCheck: "Never",
    status: "Idle",
    distinctSeen: 0,
  };

  let timeoutId: any = null;
  let lastSeenIds = new Set<string>();
  let countdown = 0;
  let targetSleep = 0;
  let countdownInterval: any = null;

  // Audio
  let audio: HTMLAudioElement;

  // Tabs
  let activeTab = "general";
  const tabs = [
    { label: "General", value: "general" },
    { label: "Filters", value: "filters" },
    { label: "Notifications", value: "notifications" },
    { label: "Performance", value: "performance" },
  ];

  onMount(() => {
    settings.load();
    audio = new Audio("/sounds/notification.mp3");
  });

  onDestroy(() => {
    stopMonitor();
  });

  function addLog(
    message: string,
    type: LogEntry["type"] = "info",
    link?: string,
    id?: string,
    meta?: { isCheck?: boolean; overlaps?: number }
  ) {
    logs = [
      {
        id: id || Math.random().toString(36),
        timestamp: new Date(),
        message,
        type,
        link,
        ...meta,
      },
      ...logs,
    ].slice(0, 500);
  }

  async function notify(title: string, body: string, link: string) {
    const {
      enableBrowserNotifications,
      enableNtfyNotifications,
      ntfyServer,
      ntfyTopic,
    } = $settings;

    // Browser Notifications
    if (enableBrowserNotifications) {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission !== "denied") {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          new Notification(title, { body });
        }
      }
    }

    // Ntfy
    if (enableNtfyNotifications && ntfyServer && ntfyTopic) {
      try {
        const baseUrl = ntfyServer.replace(/\/+$/, "");
        const url = `${baseUrl}/${ntfyTopic}`;

        const res = await fetch(url, {
          method: "POST",
          body: body,
          headers: {
            Title: title,
            Click: link,
            Tags: "moneybag",
          },
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error("Ntfy failed with status:", res.status, errorText);
          addLog(`Ntfy failed: ${res.status}`, "error");
        }
      } catch (e: any) {
        console.error("Ntfy exception", e);
        addLog(`Ntfy Error: ${e.message || "Unknown error"}`, "error");
      }
    }
  }

  async function testNtfy() {
    addLog("Sending test ntfy notification...", "info");
    await notify(
      "Test Notification",
      "If you see this, your ntfy configuration is working correctly!",
      "https://csfloat.com"
    );
  }

  $: groupedLogs = logs.reduce((acc, log) => {
    if (log.isCheck) {
      const allChecks = logs.filter((l) => l.isCheck);
      const checkIndex = allChecks.findIndex((l) => l.id === log.id);

      if (checkIndex >= 5) {
        const prevGroup = acc[acc.length - 1];
        if (prevGroup && prevGroup.type === "check-summary") {
          prevGroup.count++;
          return acc;
        } else {
          acc.push({
            id: "summary-" + log.id,
            timestamp: log.timestamp,
            type: "check-summary",
            count: 1,
          });
          return acc;
        }
      }
    }
    acc.push(log);
    return acc;
  }, [] as any[]);

  function startMonitor() {
    if (isRunning) return;
    isRunning = true;
    addLog("🚀 CSFloat Monitor Started", "info");
    loop();
  }

  function stopMonitor() {
    isRunning = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    countdown = 0;
    targetSleep = 0;
    stats.status = "Stopped";
    addLog("🛑 Monitor Stopped", "warning");
  }

  async function loop() {
    if (!isRunning) return;

    stats.status = "Fetching...";
    const currentSettings = $settings;

    try {
      const { listings, status, resetTime } =
        await fetchListings(currentSettings);
      stats.requests++;
      stats.lastCheck = new Date().toLocaleTimeString();

      if (status === 429) {
        const waitTime = Math.max(120, (resetTime || 30) * 2);
        stats.status = `Rate Limited. Waiting ${waitTime}s`;
        addLog(`⛔ Rate Limit Hit! Cooldown ${waitTime}s`, "error");
        timeoutId = setTimeout(loop, waitTime * 1000);
        return;
      }

      if (status !== 200) {
        addLog(`API Error: ${status}`, "error");
        timeoutId = setTimeout(loop, 10000); // Wait 10s on error
        return;
      }

      let newItemsCount = 0;
      let overlapsFound = 0;

      for (const listing of listings) {
        if (lastSeenIds.has(listing.id)) {
          overlapsFound++;
          continue;
        }

        // New Item
        newItemsCount++;
        lastSeenIds.add(listing.id);
        stats.distinctSeen = lastSeenIds.size;

        // Logic to check for deals
        if (listing.reference) {
          const refPriceCents =
            listing.reference.predicted_price || listing.reference.base_price;
          if (refPriceCents) {
            const refPriceUsd = refPriceCents / 100.0;
            const priceUsd = listing.price / 100.0;

            // Dynamic Calculation
            const reqPercent = calculateDynamicRequiredPercent(refPriceUsd, {
              DYN_DISCOUNT_BASE_PRICE: currentSettings.dynDiscountBasePrice,
              DYN_DISCOUNT_MIN_PERCENT: currentSettings.dynDiscountMinPercent,
              DYN_DISCOUNT_MAX_PERCENT: currentSettings.dynDiscountMaxPercent,
            });

            const percentTarget = refPriceUsd * (1.0 - reqPercent);

            if (priceUsd <= percentTarget) {
              const discountPercent =
                ((refPriceUsd - priceUsd) / refPriceUsd) * 100;

              stats.dealsFound++;
              const msg = `DEAL: ${listing.item.market_hash_name} | $${priceUsd.toFixed(2)} (Ref: $${refPriceUsd.toFixed(2)}) | -${discountPercent.toFixed(1)}%`;
              const link = `https://csfloat.com/item/${listing.id}`;
              addLog(msg, "success", link, listing.id);
              notify("CSFloat Deal Found!", msg, link);

              try {
                audio.play();
              } catch (e) {}
            }
          }
        }
      }

      // Trim cache
      if (lastSeenIds.size > 2000) {
        const arr = Array.from(lastSeenIds);
        lastSeenIds = new Set(arr.slice(arr.length - 1000));
        stats.distinctSeen = lastSeenIds.size;
      }

      // Log results
      if (listings.length > 0) {
        addLog(
          `Checked ${listings.length} items. Newest: ${listings[0].item.market_hash_name} (${listings[0].id.slice(0, 8)}...)`,
          "info",
          undefined,
          undefined,
          { isCheck: true, overlaps: overlapsFound }
        );
      } else {
        addLog(`Checked 0 items.`, "warning", undefined, undefined, {
          isCheck: true,
          overlaps: overlapsFound,
        });
      }

      // Calculate sleep time (Adaptive logic)
      let sleepTime = currentSettings.baseInterval;

      if (overlapsFound < TARGET_OVERLAP) {
        if (overlapsFound === 0) {
          sleepTime = Math.max(HARD_MIN_INTERVAL, sleepTime * 0.85);
        } else {
          sleepTime = Math.max(HARD_MIN_INTERVAL, sleepTime * 0.85);
        }
      } else if (overlapsFound > TARGET_OVERLAP * 3) {
        sleepTime = Math.min(
          LONG_DELAY_INTERVAL,
          Math.max(currentSettings.baseInterval, sleepTime * 1.1)
        );
      } else if (newItemsCount > NEW_ITEMS_SLOW_THRESHOLD) {
        sleepTime = Math.min(
          LONG_DELAY_INTERVAL,
          Math.max(currentSettings.baseInterval, sleepTime * 1.05)
        );
      } else {
        sleepTime = Math.max(currentSettings.baseInterval, sleepTime * 0.95);
      }

      const finalSleep =
        Math.max(HARD_MIN_INTERVAL, sleepTime) + Math.random() * 2;
      targetSleep = Math.ceil(finalSleep);

      // Start countdown
      countdown = targetSleep;
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      countdownInterval = setInterval(() => {
        if (countdown > 0) {
          countdown--;
        } else {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
      }, 1000);

      if (isRunning) {
        timeoutId = setTimeout(loop, finalSleep * 1000);
      }
    } catch (e) {
      console.error(e);
      addLog("Crash detected in loop", "error");
      timeoutId = setTimeout(loop, 10000);
    }
  }

  function handleReset() {
    if (confirm("Are you sure you want to reset all settings?")) {
      settings.reset();
    }
  }
</script>

<div class="monitor-container p-4">
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- Sidebar / Settings -->
    <div class="lg:col-span-4 space-y-6">
      <!-- Controls -->
      <div class="panel p-5 rounded-lg border shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold section-title">Monitor Status</h2>
          <div class="flex items-center gap-2">
            <div
              class="h-2 w-2 rounded-full {isRunning
                ? 'bg-green-500 animate-pulse'
                : 'bg-gray-400'}"
            ></div>
            <span
              class="text-xs font-medium {isRunning
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-500'}"
            >
              {isRunning ? "Active" : "Idle"}
            </span>
          </div>
        </div>

        {#if isRunning}
          <div
            class="mb-5 p-4 bg-blue-50/20 dark:bg-blue-900/10 rounded-xl border border-blue-100/30 dark:border-blue-800/20 relative"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex flex-col">
                <span
                  class="text-[10px] uppercase font-bold tracking-widest text-blue-500/70 dark:text-blue-400/70 mb-1"
                  >Scanning Market</span
                >
                {#if countdown > 0}
                  <div class="flex items-baseline gap-1">
                    <span
                      class="text-4xl font-black font-mono tracking-tighter text-blue-600 dark:text-blue-400"
                      >{countdown}</span
                    >
                    <span
                      class="text-[10px] font-bold text-blue-400/60 uppercase ml-1"
                      >sec left</span
                    >
                    <span class="text-[10px] text-gray-400 ml-1 opacity-70"
                      >of {targetSleep}s</span
                    >
                  </div>
                {:else}
                  <span
                    class="text-xl font-bold text-blue-600 dark:text-blue-400 animate-pulse"
                    >Syncing...</span
                  >
                {/if}
              </div>
            </div>
            <div
              class="w-full bg-blue-100/30 dark:bg-zinc-800/50 rounded-full h-1 relative overflow-hidden"
            >
              <div
                class="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-1000 ease-linear shadow-[0_0_8px_rgba(37,99,235,0.3)]"
                style="width: {targetSleep > 0
                  ? (countdown / targetSleep) * 100
                  : 0}%"
              ></div>
            </div>
          </div>
        {/if}

        <div class="stats-grid">
          <div class="stat-card-compact border-blue-500/10">
            <span class="stat-label-mini">Reqs</span>
            <span class="stat-value-mini">{stats.requests}</span>
          </div>
          <div class="stat-card-compact border-green-500/20">
            <span class="stat-label-mini text-green-500 font-bold">Deals</span>
            <span class="stat-value-mini text-green-500"
              >{stats.dealsFound}</span
            >
          </div>
          <div class="stat-card-compact border-gray-500/10">
            <span class="stat-label-mini">Seen</span>
            <span class="stat-value-mini">{stats.distinctSeen}</span>
          </div>
          <div class="stat-card-compact border-gray-500/10">
            <span class="stat-label-mini">Last Check</span>
            <span class="stat-value-mini text-[10px] opacity-70"
              >{stats.lastCheck}</span
            >
          </div>
        </div>

        {#if isRunning}
          <Button variant="danger" fullWidth on:click={stopMonitor}>
            Stop Monitor
          </Button>
        {:else}
          <Button variant="success" fullWidth on:click={startMonitor}>
            Start Monitor
          </Button>
        {/if}
      </div>

      <!-- Settings -->
      <div
        class="panel p-5 rounded-lg border shadow-sm flex flex-col h-[500px]"
      >
        <div class="flex justify-between items-baseline mb-4">
          <h2 class="text-xl font-bold section-title">Settings</h2>
        </div>

        <Tabs items={tabs} bind:activeTab />

        <div class="flex-1 overflow-y-auto pr-2 space-y-4">
          <!-- GENERAL -->
          {#if activeTab === "general"}
            <div class="space-y-4">
              <div>
                <Label forId="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Public API (Limited)"
                  bind:value={$settings.apiKey}
                />
              </div>
              <div>
                <Label forId="proxyUrl">CORS Proxy</Label>
                <Input
                  id="proxyUrl"
                  placeholder="https://corsproxy.io/?"
                  bind:value={$settings.proxyUrl}
                />
                <span class="text-[10px] text-gray-400 mt-1 block"
                  >Needed for client-side functionality.</span
                >
              </div>
            </div>
          {/if}

          <!-- FILTERS -->
          {#if activeTab === "filters"}
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <Label forId="minPrice">Min Price ($)</Label>
                  <Input
                    id="minPrice"
                    type="number"
                    value={$settings.minPrice / 100}
                    on:input={(e) =>
                      ($settings.minPrice =
                        parseFloat(e.currentTarget.value || 0) * 100)}
                  />
                </div>
                <div>
                  <Label forId="maxPrice">Max Price ($)</Label>
                  <Input
                    id="maxPrice"
                    type="number"
                    value={$settings.maxPrice / 100}
                    on:input={(e) =>
                      ($settings.maxPrice =
                        parseFloat(e.currentTarget.value || 0) * 100)}
                  />
                </div>
              </div>
              <div>
                <Label forId="limit">Listing Limit</Label>
                <Input id="limit" type="number" bind:value={$settings.limit} />
              </div>
            </div>
          {/if}

          <!-- NOTIFICATIONS -->
          {#if activeTab === "notifications"}
            <div class="space-y-4">
              <Checkbox
                id="browserNotif"
                label="Browser Notifications"
                bind:checked={$settings.enableBrowserNotifications}
              />

              <hr class="border-gray-100 dark:border-gray-700/50" />

              <Checkbox
                id="ntfyNotif"
                label="Ntfy Notifications"
                bind:checked={$settings.enableNtfyNotifications}
              >
                <span
                  slot="description"
                  class="text-xs text-gray-400 block mt-1"
                  >Send alerts to your phone via ntfy app.</span
                >
              </Checkbox>

              {#if $settings.enableNtfyNotifications}
                <div
                  class="space-y-3 pl-4 border-l-2 border-gray-100 dark:border-gray-700"
                >
                  <div>
                    <Label forId="ntfyServer">Ntfy Server</Label>
                    <Input
                      id="ntfyServer"
                      placeholder="https://ntfy.sh"
                      bind:value={$settings.ntfyServer}
                    />
                  </div>
                  <div>
                    <Label forId="ntfyTopic">Topic</Label>
                    <Input
                      id="ntfyTopic"
                      placeholder="topic-name"
                      bind:value={$settings.ntfyTopic}
                    />
                  </div>
                  <div class="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      on:click={testNtfy}
                    >
                      Test Ntfy Notification
                    </Button>
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <!-- PERFORMANCE -->
          {#if activeTab === "performance"}
            <div class="space-y-4">
              <h3
                class="text-sm font-semibold text-gray-400 uppercase tracking-wide"
              >
                Polling
              </h3>
              <div>
                <Label forId="baseInterval">Base Interval (s)</Label>
                <Input
                  id="baseInterval"
                  type="number"
                  bind:value={$settings.baseInterval}
                />
              </div>

              <hr class="border-gray-100 dark:border-gray-700/50" />

              <h3
                class="text-sm font-semibold text-gray-400 uppercase tracking-wide"
              >
                Dynamic Discount Logic
              </h3>
              <div>
                <Label forId="basePrice">Discount Base Price ($)</Label>
                <Input
                  id="basePrice"
                  type="number"
                  bind:value={$settings.dynDiscountBasePrice}
                />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <Label forId="minDisc">Min % Discount</Label>
                  <Input
                    id="minDisc"
                    type="number"
                    step="0.01"
                    bind:value={$settings.dynDiscountMinPercent}
                  />
                </div>
                <div>
                  <Label forId="maxDisc">Max % Discount</Label>
                  <Input
                    id="maxDisc"
                    type="number"
                    step="0.01"
                    bind:value={$settings.dynDiscountMaxPercent}
                  />
                </div>
              </div>
            </div>
          {/if}
        </div>

        <div class="mt-4 pt-4 border-t">
          <Button variant="outline" size="sm" fullWidth on:click={handleReset}>
            Reset All Settings
          </Button>
        </div>
      </div>
    </div>

    <!-- Main Content / Logs -->
    <div class="lg:col-span-8">
      <div
        class="panel h-[800px] flex flex-col rounded-lg border shadow-sm overflow-hidden"
      >
        <div
          class="p-4 border-b bg-gray-50/50 dark:bg-zinc-900/50 flex justify-between items-center"
        >
          <h2 class="font-bold section-title flex items-center gap-2">
            <span>Activity Feed</span>
            <div
              class="h-2 w-2 rounded-full {isRunning
                ? 'bg-green-500 animate-pulse'
                : 'bg-gray-300'}"
            ></div>
          </h2>
          <span class="text-xs text-gray-500 font-mono">Live Logs</span>
        </div>

        <div
          class="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm log-container"
        >
          {#if logs.length === 0}
            <div
              class="h-full flex flex-col items-center justify-center text-gray-400 space-y-2"
            >
              <span class="text-4xl">📡</span>
              <p>Ready to monitor.</p>
            </div>
          {/if}

          {#each groupedLogs as log (log.id)}
            {#if log.type === "check-summary"}
              <div
                class="text-[9px] text-gray-500/40 py-0.5 px-4 italic flex items-center gap-2"
              >
                <div
                  class="h-[1px] flex-1 bg-gray-200/50 dark:bg-gray-800/30"
                ></div>
                {log.count} more market scans archived
                <div
                  class="h-[1px] flex-1 bg-gray-200/50 dark:bg-gray-800/30"
                ></div>
              </div>
            {:else}
              <div
                class="log-entry rounded border-l-4 flex gap-3 transition-all
                  {log.isCheck ? 'log-check py-1 px-3 text-[11px]' : 'p-3'} 
                  {log.type === 'error'
                  ? 'log-error'
                  : log.type === 'success'
                    ? 'log-success'
                    : log.type === 'warning'
                      ? 'log-warning'
                      : 'log-info'}"
              >
                <span class="text-[9px] opacity-40 shrink-0 pt-0.5 font-mono"
                  >{log.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}</span
                >

                <div
                  class="flex-1 break-all flex items-center justify-between gap-2"
                >
                  <span>{log.message}</span>
                  {#if log.isCheck}
                    <span
                      class="px-1.5 py-0.5 rounded bg-black/10 dark:bg-black/40 text-[9px] font-bold text-gray-400 whitespace-nowrap"
                    >
                      OVERLAP: {log.overlaps}
                    </span>
                  {/if}
                </div>

                {#if log.link}
                  <a
                    href={log.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="link-btn"
                  >
                    OPEN
                  </a>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  :global(.panel) {
    background-color: var(--background-color);
    border-color: var(--border-color);
  }

  :global(.section-title) {
    color: var(--heading-color);
  }

  /* Logs */
  .log-container {
    background-color: var(--background-color);
  }

  .log-entry {
    border-width: 1px;
    border-left-width: 4px;
  }

  .log-info {
    background-color: rgba(240, 240, 240, 0.5);
    border-color: #e5e7eb;
    border-left-color: #9ca3af;
    color: var(--text-color);
  }
  :global(.dark) .log-info {
    background-color: rgba(30, 30, 30, 0.4);
    border-color: #333;
    border-left-color: #555;
  }

  .log-check {
    background-color: rgba(0, 0, 0, 0.08);
    border-color: rgba(0, 0, 0, 0.1);
    border-left-color: #ccc;
    color: #777;
    opacity: 0.9;
  }
  :global(.dark) .log-check {
    background-color: rgba(0, 0, 0, 0.6);
    border-color: rgba(255, 255, 255, 0.02);
    border-left-color: #444;
    color: #999;
  }

  .log-success {
    background-color: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.2);
    border-left-color: #22c55e;
    color: #15803d;
  }
  :global(.dark) .log-success {
    color: #4ade80;
  }

  .log-warning {
    background-color: rgba(234, 179, 8, 0.1);
    border-color: rgba(234, 179, 8, 0.2);
    border-left-color: #eab308;
    color: #a16207;
  }
  :global(.dark) .log-warning {
    color: #facc15;
  }

  .log-error {
    background-color: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.2);
    border-left-color: #ef4444;
    color: #b91c1c;
  }
  :global(.dark) .log-error {
    color: #f87171;
  }

  .link-btn {
    font-size: 0.7rem;
    font-weight: bold;
    padding: 0.1rem 0.4rem;
    border-radius: 0.25rem;
    background-color: var(--link-color);
    color: white;
    align-self: flex-start;
    margin-top: 0.1rem;
    text-decoration: none;
    display: inline-block;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .stat-card-compact {
    display: flex;
    flex-direction: column;
    padding: 0.6rem 0.75rem;
    background: rgba(240, 240, 240, 0.4);
    border-radius: 0.6rem;
    border: 1px solid var(--border-color);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  }

  :global(.dark) .stat-card-compact {
    background: rgba(25, 25, 25, 0.6);
  }

  .stat-label-mini {
    font-size: 8px;
    text-transform: uppercase;
    font-weight: 800;
    color: var(--gray-color);
    opacity: 0.7;
    letter-spacing: 0.1em;
    margin-bottom: 2px;
  }

  .stat-value-mini {
    font-family: "JetBrains Mono", "Courier New", monospace;
    font-size: 1rem;
    font-weight: 800;
    color: var(--heading-color);
  }
</style>
