<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { settings } from "./storage";
  import { fetchListings } from "./api";
  import { calculateDynamicRequiredPercent, formatCurrency } from "./utils";
  import type { Listing, LogEntry } from "./types";
  import Input from "../../ui/Input.svelte";
  import Label from "../../ui/Label.svelte";
  import Select from "../../ui/Select.svelte";
  import SearchableSelect from "../../ui/SearchableSelect.svelte";
  import Tabs from "../../common/Tabs.svelte";
  import Button from "../../common/Button.svelte";
  import Checkbox from "../../common/Checkbox.svelte";
  import { fetchSchemas, rarities, paints, definitions, items } from "./schema";

  // -- CONSTANTS --
  const HARD_MIN_INTERVAL = 15.0;
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
  let countdownMs = 0;
  let targetSleep = 0;
  let targetSleepMs = 0;
  let countdownInterval: any = null;
  let countdownEndTs = 0;
  let firstFetchAfterStart = false;

  // Audio
  let audio: HTMLAudioElement;

  // Tabs
  let activeTab = "general";
  const tabs = [
    { label: "General", value: "general" },
    { label: "Filters", value: "filters" },
    { label: "Notifications", value: "notifications" },
    { label: "Discount", value: "discount" },
    { label: "Performance", value: "performance" },
  ];

  onMount(() => {
    settings.load();
    // Migration for old settings: if max discount is likely < 1, multiply by 100
    if ($settings.dynDiscountMaxPercent <= 1.0) {
      $settings.dynDiscountMaxPercent *= 100;
      $settings.dynDiscountMinPercent *= 100;
      $settings.minDiscountPercent *= 100;
    }

    // Migration for proxy settings (string[] -> ProxyConfig[])
    // Use 'any' cast to access old removed properties if they exist in local storage
    const current = get(settings) as any;
    if (!current.proxies && current.proxyUrls) {
      // Convert old string array to new object array
      const direct = current.useDirectProxy || false;
      current.proxies = current.proxyUrls.map((url: string) => ({
        url,
        isDirect: direct,
      }));
      settings.set(current);
    } else if (!current.proxies) {
      // Init default if completely missing
      current.proxies = [
        { url: "http://localhost:8010/proxy", isDirect: true },
      ];
      settings.set(current);
    }

    audio = new Audio("/sounds/notification.mp3");
    fetchSchemas();
  });

  onDestroy(() => {
    stopMonitor();
  });

  function addLog(
    message: string,
    type: LogEntry["type"] = "info",
    link?: string,
    id?: string,
    meta?: { isCheck?: boolean; overlaps?: number; limit?: number }
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
    firstFetchAfterStart = true;
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
    countdownMs = 0;
    targetSleep = 0;
    targetSleepMs = 0;
    stats.status = "Stopped";
    addLog("🛑 Monitor Stopped", "warning");
  }

  async function loop() {
    if (!isRunning) return;

    stats.status = "Fetching...";
    const currentSettings = $settings;

    try {
      const { listings, status, resetTime, proxyUsed, error } =
        await fetchListings(currentSettings);
      stats.requests++;
      stats.lastCheck = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      if (error) {
        addLog(error, "warning");
      }

      if (status === 429) {
        const waitTime = Math.max(120, (resetTime || 30) * 2);
        stats.status = `Rate Limited. Waiting ${waitTime}s`;
        addLog(
          `⛔ Rate Limit Hit via ${proxyUsed}! Cooldown ${waitTime}s`,
          "error"
        );
        timeoutId = setTimeout(loop, waitTime * 1000);
        return;
      }

      if (status !== 200) {
        addLog(`API Error via ${proxyUsed}: ${status}`, "error");
        // Continue monitoring even on error - don't give up!
        if (isRunning) {
          timeoutId = setTimeout(loop, 10000); // Wait 10s on error, then retry
        }
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

        if (!currentSettings.enableDiscountChecking) {
          if (!firstFetchAfterStart) {
            const priceUsd = listing.price / 100.0;
            const msg = `New Item: ${listing.item.market_hash_name} | $${priceUsd.toFixed(2)}`;
            const link = `https://csfloat.com/item/${listing.id}`;
            addLog(msg, "success", link, listing.id);
            notify("New Item Found!", msg.replace("New Item: ", ""), link); // Shorter title
            try {
              audio.play();
            } catch {}
          }
          continue;
        }

        // Logic to check for deals
        if (listing.reference) {
          const refPriceCents =
            listing.reference.predicted_price || listing.reference.base_price;
          if (refPriceCents) {
            const refPriceUsd = refPriceCents / 100.0;
            const priceUsd = listing.price / 100.0;

            let reqPercent = 0;
            if (currentSettings.useSingleDiscount) {
              reqPercent = currentSettings.singleDiscountPercent / 100.0;
            } else {
              // Dynamic Calculation
              // Inputs are now in 0-100 range, need 0-1 for util
              reqPercent = calculateDynamicRequiredPercent(refPriceUsd, {
                DYN_DISCOUNT_BASE_PRICE: currentSettings.dynDiscountBasePrice,
                DYN_DISCOUNT_MIN_PERCENT:
                  currentSettings.dynDiscountMinPercent / 100.0,
                DYN_DISCOUNT_MAX_PERCENT:
                  currentSettings.dynDiscountMaxPercent / 100.0,
                DYN_MAX_PRICE: currentSettings.maxPrice / 100.0,
              });
            }

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

      if (listings.length > 0) {
        firstFetchAfterStart = false;
      }

      // Trim cache
      if (lastSeenIds.size > 2000) {
        const arr = Array.from(lastSeenIds);
        lastSeenIds = new Set(arr.slice(arr.length - 1000));
        stats.distinctSeen = lastSeenIds.size;
      }

      // Log results
      const proxyDomain = proxyUsed
        ? proxyUsed
            .replace("https://", "")
            .replace("http://", "")
            .split("/")[0]
            .split("?")[0]
        : "Direct";

      if (listings.length > 0) {
        addLog(
          `[${proxyDomain}] Market Scan | Newest: ${listings[0].item.market_hash_name}`,
          "info",
          undefined,
          undefined,
          { isCheck: true, overlaps: overlapsFound, limit: listings.length }
        );
      } else {
        addLog(
          `[${proxyDomain}] Market Scan | No items found`,
          "warning",
          undefined,
          undefined,
          {
            isCheck: true,
            overlaps: 0,
            limit: 0,
          }
        );
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
      targetSleepMs = Math.round(finalSleep * 1000);

      countdownMs = targetSleepMs;
      countdownEndTs = Date.now() + targetSleepMs;
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      countdownInterval = setInterval(() => {
        const remaining = countdownEndTs - Date.now();
        if (remaining > 0) {
          countdownMs = remaining;
        } else {
          countdownMs = 0;
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
      }, 10);

      if (isRunning) {
        timeoutId = setTimeout(loop, finalSleep * 1000);
      }
    } catch (e: any) {
      addLog(
        `Crash detected in loop: ${e.message || "Unknown error"}`,
        "error"
      );
      // Continue monitoring even on crash - retry with next proxy
      if (isRunning) {
        timeoutId = setTimeout(loop, 10000);
      }
    }
  }

  function handleReset() {
    if (confirm("Are you sure you want to reset all settings?")) {
      settings.reset();
    }
  }

  onMount(() => {
    // Migration for discount percentages from 0.0-1.0 to 0-100
    const currentSettings = get(settings);
    let changed = false;

    if (currentSettings.useSingleDiscount) {
      if (currentSettings.singleDiscountPercent < 1.0) {
        currentSettings.singleDiscountPercent *= 100;
        changed = true;
      }
    } else {
      if (currentSettings.dynDiscountMinPercent < 1.0) {
        currentSettings.dynDiscountMinPercent *= 100;
        changed = true;
      }
      if (currentSettings.dynDiscountMaxPercent < 1.0) {
        currentSettings.dynDiscountMaxPercent *= 100;
        changed = true;
      }
    }

    if (changed) {
      settings.set(currentSettings);
      console.log("Migrated discount percentage settings to 0-100 range.");
    }
  });
</script>

<div class="monitor-container">
  <div class="layout-grid">
    <!-- Sidebar / Settings -->
    <div class="sidebar">
      <!-- Controls -->
      <div class="panel controls-panel">
        <div class="status-header">
          <h2 class="section-title">Monitor Status</h2>
          <div class="status-indicator">
            <div
              class={isRunning ? "status-dot active" : "status-dot idle"}
            ></div>
            <span
              class={isRunning ? "status-label active" : "status-label idle"}
            >
              {isRunning ? "Active" : "Idle"}
            </span>
          </div>
        </div>

        {#if isRunning}
          <div class="countdown-card">
            <div class="countdown-header">
              <div class="countdown-title">Scanning Market</div>
              {#if countdownMs > 0}
                <div class="countdown-row">
                  <span class="countdown-number"
                    >{(countdownMs / 1000).toFixed(2)}</span
                  >
                  <span class="countdown-subtext">sec left</span>
                  <span class="countdown-hint">of {targetSleep}s</span>
                </div>
              {:else}
                <span class="syncing">Syncing...</span>
              {/if}
            </div>
            <div class="progress">
              <div
                class="progress-fill"
                style="width: {targetSleepMs > 0
                  ? (countdownMs / targetSleepMs) * 100
                  : 0}%"
              ></div>
            </div>
          </div>
        {/if}

        <div class="stats-grid">
          <div class="stat-card-compact stat--requests">
            <span class="stat-label-mini">Reqs</span>
            <span class="stat-value-mini">{stats.requests}</span>
          </div>
          <div class="stat-card-compact stat--deals">
            <span class="stat-label-mini">Deals</span>
            <span class="stat-value-mini">{stats.dealsFound}</span>
          </div>
          <div class="stat-card-compact stat--seen">
            <span class="stat-label-mini">Seen</span>
            <span class="stat-value-mini">{stats.distinctSeen}</span>
          </div>
          <div class="stat-card-compact stat--lastcheck">
            <span class="stat-label-mini">Last Check</span>
            <span class="stat-value-mini small">{stats.lastCheck}</span>
          </div>
        </div>
      </div>

      <!-- Settings -->
      <div class="panel settings-panel">
        <div class="settings-header">
          <h2 class="section-title">Settings</h2>
        </div>

        <Tabs items={tabs} bind:activeTab />

        <div class="settings-content">
          <!-- GENERAL -->
          {#if activeTab === "general"}
            <div class="form-section">
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
                <div class="proxy-header-row">
                  <Label>CORS Proxies</Label>
                  <span class="help-text-header"
                    >Check "Direct" for local proxies (e.g. lcp)</span
                  >
                </div>
                <div class="proxies-list">
                  {#each $settings.proxies as proxy, i}
                    <div class="proxy-row">
                      <div class="proxy-url-input">
                        <Input
                          id={`proxy-${i}`}
                          placeholder={proxy.isDirect
                            ? "http://localhost:8010/proxy"
                            : "https://corsproxy.io/?"}
                          bind:value={proxy.url}
                        />
                      </div>
                      <div class="proxy-config">
                        <div
                          class="checkbox-wrapper"
                          title="Direct Proxy Mode?"
                        >
                          <Checkbox
                            id={`direct-${i}`}
                            bind:checked={proxy.isDirect}
                          />
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          class="narrow-btn"
                          on:click={() => {
                            $settings.proxies = $settings.proxies.filter(
                              (_, idx) => idx !== i
                            );
                          }}>✕</Button
                        >
                      </div>
                    </div>
                  {/each}
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    on:click={() => {
                      $settings.proxies = [
                        ...$settings.proxies,
                        { url: "", isDirect: false },
                      ];
                    }}
                  >
                    + Add Proxy
                  </Button>
                </div>
                <span class="help-text"
                  >Rotation & automatic retry on failure.</span
                >
                <div class="tip-box">
                  <strong>Option 1: Local Proxy (Best Performance)</strong>
                  <ol>
                    <li>
                      Install Node.js then run: <code
                        >npm i -g local-cors-proxy</code
                      >
                    </li>
                    <li>
                      Start: <code>lcp --proxyUrl https://csfloat.com</code>
                    </li>
                    <li>
                      Use <code>http://localhost:8010/proxy</code> (Check "Direct").
                    </li>
                  </ol>
                  <p class="tip-text" style="margin-top: 0.5rem; opacity: 0.9;">
                    <strong>Windows Users:</strong> Download
                    <a href="/tools/csfloat-monitor.cmd" download
                      >csfloat-monitor.cmd</a
                    > - it automatically starts the proxy and opens this page in one
                    click!
                  </p>

                  <hr class="tip-divider" />

                  <strong>Option 2: Cloud Proxy (Easiest)</strong>
                  <p class="tip-text">
                    Use <code>https://corsproxy.io/?</code> (Uncheck "Direct"). No
                    setup required, but may encounter rate limits.
                  </p>

                  <p
                    class="tip-text"
                    style="margin-top: 0.5rem; opacity: 0.8; font-style: italic;"
                  >
                    <strong>Pro Tip:</strong> Keep both in the list for maximum resilience.
                    The monitor will automatically retry with backup proxies if one
                    fails.
                  </p>
                </div>
              </div>
            </div>
          {/if}

          <!-- FILTERS -->
          {#if activeTab === "filters"}
            <div class="form-section">
              <div class="two-col-grid">
                <div>
                  <Label forId="minPrice">Min Price ($)</Label>
                  <Input
                    id="minPrice"
                    type="number"
                    value={$settings.minPrice / 100}
                    on:input={(e) => {
                      const target = e.target as any;
                      $settings.minPrice =
                        parseFloat(target.value || "0") * 100;
                    }}
                  />
                </div>
                <div>
                  <Label forId="maxPrice">Max Price ($)</Label>
                  <Input
                    id="maxPrice"
                    type="number"
                    value={$settings.maxPrice / 100}
                    on:input={(e) => {
                      const target = e.target as any;
                      $settings.maxPrice =
                        parseFloat(target.value || "0") * 100;
                    }}
                  />
                </div>
              </div>

              <div class="two-col-grid">
                <Select
                  id="category"
                  label="Category"
                  bind:value={$settings.category}
                  options={[
                    { value: 0, label: "Any" },
                    { value: 1, label: "Normal" },
                    { value: 2, label: "StatTrak™" },
                    { value: 3, label: "Souvenir" },
                  ]}
                />
                <Select
                  id="type"
                  label="Listing Type"
                  bind:value={$settings.type}
                  options={[
                    { value: "any", label: "Any" },
                    { value: "buy_now", label: "Buy Now" },
                    { value: "auction", label: "Auction" },
                  ]}
                />
              </div>

              <div class="two-col-grid">
                <Select
                  id="rarity"
                  label="Rarity"
                  bind:value={$settings.rarity}
                  options={[
                    { value: -1, label: "Any" },
                    ...Object.entries($rarities).map(([k, v]) => ({
                      value: parseInt(k),
                      label: v.name || v.weapon || `Rarity ${k}`, // Handle schema variations
                    })),
                  ]}
                />
              </div>

              <SearchableSelect
                id="defIndex"
                label="Weapon / Item"
                bind:value={$settings.defIndex}
                placeholder="Search for weapon..."
                options={[
                  { value: -1, label: "Any" },
                  ...Object.entries($definitions).map(([k, v]) => ({
                    value: parseInt(k),
                    label: v.name,
                  })),
                ]}
                on:change={(e) => ($settings.defIndex = e.detail.value)}
              />

              <div class="two-col-grid">
                <SearchableSelect
                  id="paintIndex"
                  label="Paint Kit"
                  bind:value={$settings.paintIndex}
                  placeholder="Search paint..."
                  options={[
                    { value: -1, label: "Any" },
                    ...(() => {
                      // Filter paints based on selected defIndex if valid
                      let allowedPaints: Set | null = null;

                      if ($settings.defIndex !== -1) {
                        allowedPaints = new Set();
                        const defIdStr = $settings.defIndex.toString();
                        Object.values($items).forEach((item: any) => {
                          if (item.def === defIdStr && item.paint) {
                            allowedPaints!.add(parseInt(item.paint));
                          }
                        });
                      }

                      return Object.entries($paints)
                        .filter(([k, v]) => {
                          if (!allowedPaints) return true;
                          return allowedPaints.has(parseInt(k));
                        })
                        .map(([k, v]) => ({
                          value: parseInt(k),
                          label: `${v.name} (${k})`,
                        }));
                    })(),
                  ]}
                  on:change={(e) => ($settings.paintIndex = e.detail.value)}
                />
                <div>
                  <Label forId="paintSeed">Paint Seed</Label>
                  <Input
                    id="paintSeed"
                    type="number"
                    bind:value={$settings.paintSeed}
                    placeholder="-1 for Any"
                  />
                </div>
              </div>

              <div class="two-col-grid">
                <div>
                  <Label forId="minFloat">Min Float</Label>
                  <Input
                    id="minFloat"
                    type="number"
                    step="0.00000000000001"
                    bind:value={$settings.minFloat}
                  />
                </div>
                <div>
                  <Label forId="maxFloat">Max Float</Label>
                  <Input
                    id="maxFloat"
                    type="number"
                    step="0.00000000000001"
                    bind:value={$settings.maxFloat}
                  />
                </div>
              </div>

              <div class="two-col-grid">
                <div>
                  <Label forId="minBlue">Min Blue %</Label>
                  <Input
                    id="minBlue"
                    type="number"
                    step="0.01"
                    bind:value={$settings.minBlue}
                  />
                </div>
                <div>
                  <Label forId="maxBlue">Max Blue %</Label>
                  <Input
                    id="maxBlue"
                    type="number"
                    step="0.01"
                    bind:value={$settings.maxBlue}
                  />
                </div>
              </div>

              <div class="two-col-grid">
                <div>
                  <Label forId="minFade">Min Fade %</Label>
                  <Input
                    id="minFade"
                    type="number"
                    step="0.01"
                    bind:value={$settings.minFade}
                  />
                </div>
                <div>
                  <Label forId="maxFade">Max Fade %</Label>
                  <Input
                    id="maxFade"
                    type="number"
                    step="0.01"
                    bind:value={$settings.maxFade}
                  />
                </div>
              </div>

              <div>
                <Label forId="minRefQty">Min Ref Qty</Label>
                <Input
                  id="minRefQty"
                  type="number"
                  bind:value={$settings.minRefQty}
                  placeholder="0"
                />
              </div>

              <div class="two-col-grid">
                <div>
                  <Label forId="userId">Seller SteamID64</Label>
                  <Input
                    id="userId"
                    bind:value={$settings.userId}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label forId="marketHashName">Market Hash Name</Label>
                  <Input
                    id="marketHashName"
                    bind:value={$settings.marketHashName}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>
          {/if}

          <!-- NOTIFICATIONS -->
          {#if activeTab === "notifications"}
            <div class="form-section">
              <Checkbox
                id="browserNotif"
                label="Browser Notifications"
                bind:checked={$settings.enableBrowserNotifications}
              />

              <hr class="divider" />

              <Checkbox
                id="ntfyNotif"
                label="Ntfy Notifications"
                bind:checked={$settings.enableNtfyNotifications}
              >
                <span slot="description" class="help-text"
                  >Send alerts to your phone via ntfy app.</span
                >
              </Checkbox>

              {#if $settings.enableNtfyNotifications}
                <div class="nested-config">
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
                  <div class="nested-actions">
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

          <!-- DISCOUNT -->
          {#if activeTab === "discount"}
            <div class="form-section">
              <div class="checkbox-row">
                <Checkbox
                  id="enableDiscountChecking"
                  bind:checked={$settings.enableDiscountChecking}
                  label="Enable Discount Checking"
                />
              </div>

              {#if $settings.enableDiscountChecking}
                <div class="checkbox-row">
                  <Checkbox
                    id="useSingleDiscount"
                    bind:checked={$settings.useSingleDiscount}
                    label="Use Single Minimum Discount"
                  />
                </div>

                {#if $settings.useSingleDiscount}
                  <div>
                    <Label forId="singleDiscount">Min Discount %</Label>
                    <Input
                      id="singleDiscount"
                      type="number"
                      step={0.5}
                      bind:value={$settings.singleDiscountPercent}
                    />
                  </div>
                {:else}
                  <div class="two-col-grid">
                    <div>
                      <Label forId="minDisc"
                        >Min % Discount (at high price)</Label
                      >
                      <Input
                        id="minDisc"
                        type="number"
                        step={0.1}
                        bind:value={$settings.dynDiscountMinPercent}
                      />
                    </div>
                    <div>
                      <Label forId="maxDisc"
                        >Max % Discount (at base price)</Label
                      >
                      <Input
                        id="maxDisc"
                        type="number"
                        step={0.1}
                        bind:value={$settings.dynDiscountMaxPercent}
                      />
                    </div>
                  </div>
                  <div>
                    <Label forId="basePrice">Discount Base Price ($)</Label>
                    <Input
                      id="basePrice"
                      type="number"
                      bind:value={$settings.dynDiscountBasePrice}
                    />
                  </div>

                  <!-- Visualization: Examples -->
                  <div class="visualization-container">
                    <Label>Discount Threshold Examples</Label>
                    <div class="examples-list">
                      {#key `${$settings.dynDiscountMinPercent}-${$settings.dynDiscountMaxPercent}-${$settings.dynDiscountBasePrice}-${$settings.minPrice}-${$settings.maxPrice}`}
                        {#each (() => {
                          const steps = 4;
                          const minP = ($settings.minPrice || 0) / 100;
                          const maxP = Math.min(($settings.maxPrice || 100000) / 100, 5000);
                          const range = maxP - minP;
                          const examples = [];

                          if (maxP > minP) {
                            // Use bounds for geometric visualization
                            const safeMinP = Math.max(minP, 0.01);
                            const ratio = Math.pow(maxP / safeMinP, 1 / steps);

                            for (let i = 0; i <= steps; i++) {
                              let price;
                              if (i === 0) price = safeMinP;
                              else if (i === steps) price = maxP;
                              else price = safeMinP * Math.pow(ratio, i);

                              // Use the actual configured max price for calculation logic to get correct curve end
                              const calcMaxPrice = ($settings.maxPrice || 100000) / 100.0;

                              const req = calculateDynamicRequiredPercent( price, { DYN_DISCOUNT_BASE_PRICE: $settings.dynDiscountBasePrice || 10, DYN_DISCOUNT_MIN_PERCENT: ($settings.dynDiscountMinPercent || 3) / 100, DYN_DISCOUNT_MAX_PERCENT: ($settings.dynDiscountMaxPercent || 10) / 100, DYN_MAX_PRICE: calcMaxPrice } );
                              examples.push( { price: price, discount: (req * 100).toFixed(2) } );
                            }
                          }
                          return examples;
                        })() as example}
                          <div class="example-row">
                            <span class="ex-price"
                              >${example.price.toFixed(2)}</span
                            >
                            <span class="ex-arrow">→</span>
                            <span class="ex-disc">{example.discount}%</span>
                          </div>
                        {/each}
                      {/key}
                    </div>
                  </div>
                {/if}
              {:else}
                <p class="text-sm text-gray-400 mt-2">
                  Notification mode: You will receive notifications for <strong
                    >all</strong
                  > new items that match your filters, regardless of price.
                </p>
              {/if}
            </div>
          {/if}
          {#if activeTab === "performance"}
            <div class="form-section">
              <div class="two-col-grid">
                <div>
                  <Label forId="baseInterval">Base Interval (s)</Label>
                  <Input
                    id="baseInterval"
                    type="number"
                    bind:value={$settings.baseInterval}
                  />
                </div>
                <div>
                  <Label forId="limit">Listing Limit</Label>
                  <Input
                    id="limit"
                    type="number"
                    bind:value={$settings.limit}
                  />
                </div>
              </div>
            </div>
          {/if}
        </div>

        <div class="settings-footer">
          <Button variant="outline" size="sm" fullWidth on:click={handleReset}>
            Reset All Settings
          </Button>
        </div>
      </div>
    </div>

    <!-- Main Content / Logs -->
    <div class="main">
      <div class="panel logs-panel">
        <div class="logs-header">
          <h2 class="section-title">
            <span>Activity Feed</span>
            <div
              class={isRunning ? "status-dot active" : "status-dot idle"}
            ></div>
          </h2>
          <div class="header-actions">
            {#if isRunning}
              <Button variant="danger" size="sm" on:click={stopMonitor}>
                Stop Monitor
              </Button>
            {:else}
              <Button variant="success" size="sm" on:click={startMonitor}>
                Start Monitor
              </Button>
            {/if}
          </div>
        </div>

        <div class="log-container">
          {#if logs.length === 0}
            <div class="empty-state">
              <span class="big-icon">📡</span>
              <p>Ready to monitor.</p>
            </div>
          {/if}

          {#each groupedLogs as log (log.id)}
            {#if log.type === "check-summary"}
              <div class="check-summary">
                <div class="hline"></div>
                {log.count} more market scans archived
                <div class="hline"></div>
              </div>
            {:else}
              <div
                class="log-entry {log.isCheck
                  ? 'log-check log-small'
                  : 'log-normal'} {log.type === 'error'
                  ? 'log-error'
                  : log.type === 'success'
                    ? 'log-success'
                    : log.type === 'warning'
                      ? 'log-warning'
                      : 'log-info'}"
              >
                <span class="log-timestamp"
                  >{log.timestamp.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}</span
                >

                <div class="log-message-row">
                  <span>{log.message}</span>
                  {#if log.isCheck}
                    <span class="overlap-badge">
                      OVERLAP: {log.overlaps}{log.limit ? `/${log.limit}` : ""}
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
    border: 1px solid var(--border-color);
    border-radius: 10px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    padding: 16px;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--heading-color);
  }

  /* Logs */

  .log-entry {
    border-width: 1px;
    border-left-width: 4px;
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

  .log-info {
    background-color: rgba(240, 240, 240, 0.5);
    border-color: #e5e7eb;
    border-left-color: #9ca3af;
    color: var(--text-color);
  }

  .log-check {
    background-color: rgba(0, 0, 0, 0.08);
    border-color: rgba(0, 0, 0, 0.1);
    border-left-color: #ccc;
    color: #777;
    opacity: 0.9;
  }

  @media (prefers-color-scheme: dark) {
    .log-info {
      background-color: #2a2a2a !important;
      border-color: #333 !important;
      border-left-color: #444 !important;
    }
  }

  @media (prefers-color-scheme: dark) {
    .log-check {
      background-color: #222222 !important;
      border-color: #2a2a2a !important;
      border-left-color: #333 !important;
      color: #999 !important;
    }
  }

  .log-success {
    background-color: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.2);
    border-left-color: #22c55e;
    color: #15803d;
  }

  .log-warning {
    background-color: rgba(234, 179, 8, 0.1);
    border-color: rgba(234, 179, 8, 0.2);
    border-left-color: #eab308;
    color: #a16207;
  }

  .log-error {
    background-color: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.2);
    border-left-color: #ef4444;
    color: #b91c1c;
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
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (prefers-color-scheme: dark) {
    .stat-card-compact {
      background-color: #2a2a2a !important;
      border-color: #333 !important;
    }
  }

  .stat--requests {
    border-left: 4px solid rgba(59, 130, 246, 0.3);
  }
  .stat--deals {
    border-left: 4px solid rgba(34, 197, 94, 0.4);
  }
  .stat--seen {
    border-left: 4px solid rgba(107, 114, 128, 0.3);
  }
  .stat--lastcheck {
    border-left: 4px solid rgba(107, 114, 128, 0.3);
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

  :global(.dark) .stat-value-mini {
    color: #fafafa;
  }
  .stat-value-mini.small {
    font-size: 10px;
    opacity: 0.7;
  }

  .proxy-list {
    width: 100%;
    min-height: 120px;
    padding: 0.5rem;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    border-radius: 0.4rem;
    color: var(--text-color);
    font-family: var(--font-family-mono);
    font-size: 0.8rem;
    resize: vertical;
  }

  @media (prefers-color-scheme: dark) {
    .log-success {
      color: #4ade80 !important;
    }
    .log-warning {
      color: #facc15 !important;
    }
    .log-error {
      color: #f87171 !important;
    }
    .stat-label-mini {
      color: #ffffff !important;
      opacity: 1 !important;
    }
    .stat-value-mini.small {
      opacity: 0.5 !important;
    }
    .proxy-list {
      background: #2a2a2a !important;
      border-color: #333 !important;
    }
    .section-title {
      color: #eee !important;
    }
    .form-section {
      background: transparent !important;
      border-color: #2a2a2a !important;
    }
    .activity-feed {
      background-color: transparent !important;
      border-color: #2a2a2a !important;
    }
    .log-container {
      background: transparent !important;
      border: none !important;
    }
    .check-summary {
      color: rgba(255, 255, 255, 0.5) !important;
    }
    .hline {
      background: rgba(255, 255, 255, 0.1) !important;
    }
  }

  .monitor-container {
    padding: 16px;
  }

  .layout-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .sidebar {
    display: flex;
    flex-direction: column;
  }
  @media (min-width: 1024px) {
    .layout-grid {
      grid-template-columns: repeat(12, 1fr);
      align-items: stretch;
    }
    .sidebar {
      grid-column: span 4;
      height: 75vh;
      min-height: 600px;
    }
    .main {
      grid-column: span 8;
    }
  }

  .controls-panel {
    margin-bottom: 12px;
  }

  .status-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #9ca3af;
  }
  .status-dot.active {
    background: #22c55e;
    animation: pulse 1.5s infinite ease-in-out;
  }
  .status-label {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
  }
  :global(.dark) .status-label.active {
    color: #34d399;
  }

  @keyframes pulse {
    0% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.6;
    }
  }

  .countdown-card {
    margin-bottom: 20px;
    padding: 12px;
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 12px;
    position: relative;
    background: rgba(37, 99, 235, 0.08);
  }
  :global(.dark) .countdown-card {
    background: rgba(30, 64, 175, 0.12);
    border-color: rgba(30, 64, 175, 0.25);
  }
  .countdown-header {
    margin-bottom: 8px;
  }
  .countdown-title {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(37, 99, 235, 0.8);
    margin-bottom: 4px;
  }
  :global(.dark) .countdown-title {
    color: rgba(96, 165, 250, 0.8);
  }
  .countdown-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .countdown-number {
    font-size: 32px;
    font-weight: 900;
    font-family: "JetBrains Mono", monospace;
    color: #2563eb;
  }
  :global(.dark) .countdown-number {
    color: #60a5fa;
  }
  .countdown-subtext {
    font-size: 10px;
    font-weight: 700;
    color: #60a5fa;
    text-transform: uppercase;
  }
  .countdown-hint {
    font-size: 10px;
    color: #9aa0a6;
    opacity: 0.7;
  }
  .syncing {
    font-size: 18px;
    font-weight: 700;
    color: #2563eb;
  }
  :global(.dark) .syncing {
    color: #60a5fa;
    animation: pulse 1.2s infinite;
  }
  .proxy-header-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
  }

  .help-text-header {
    font-size: 0.75rem;
    color: var(--gray-color);
  }

  .checkbox-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.narrow-btn) {
    padding-left: 0.5rem !important;
    padding-right: 0.5rem !important;
    min-width: 0 !important;
  }

  .tip-box {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: rgba(37, 99, 235, 0.05); /* Blue tint */
    border: 1px solid rgba(37, 99, 235, 0.1);
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--text-color);
  }
  :global(.dark) .tip-box {
    background: rgba(37, 99, 235, 0.1);
    border-color: rgba(37, 99, 235, 0.2);
  }
  .tip-box ol {
    margin: 0.5rem 0 0 1.2rem;
    padding: 0;
  }
  .tip-box li {
    margin-bottom: 0.25rem;
  }
  .tip-divider {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 0.75rem 0;
    opacity: 0.5;
  }
  .tip-text {
    margin: 0.25rem 0 0 0;
    line-height: 1.4;
  }
  .progress {
    width: 100%;
    height: 4px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(59, 130, 246, 0.2);
  }
  :global(.dark) .progress {
    background: rgba(24, 24, 27, 0.6);
  }
  .progress-fill {
    height: 100%;
    border-radius: 999px;
    background: #2563eb;
    transition: width 100ms linear;
    box-shadow: 0 0 8px rgba(37, 99, 235, 0.3);
  }
  :global(.dark) .progress-fill {
    background: #60a5fa;
  }
  .proxies-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .proxy-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .proxy-url-input {
    flex: 1;
  }

  .proxy-config {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .code-bg {
    background: rgba(0, 0, 0, 0.1);
    padding: 0 4px;
    border-radius: 4px;
    font-family: var(--font-family-mono);
  }

  :global(.dark) .code-bg {
    background: rgba(255, 255, 255, 0.15);
  }

  .settings-header {
    margin-bottom: 0.75rem;
  }

  .checkbox-row {
    margin-bottom: 0.75rem;
  }

  .visualization-container {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
  }

  .chart-wrapper {
    margin-top: 0.5rem;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 6px;
    padding: 10px;
    border: 1px solid var(--border-color);
  }

  :global(.dark) .chart-wrapper {
    background: rgba(0, 0, 0, 0.2);
  }

  .chart-svg {
    width: 100%;
    height: 100px;
    overflow: visible;
  }

  .chart-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    font-size: 0.75rem;
    color: var(--gray-color);
    font-family: var(--font-family-mono);
  }

  .center-label {
    font-size: 0.7rem;
    opacity: 0.7;
    text-transform: uppercase;
  }

  .examples-list {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .example-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 4px;
    font-size: 0.8rem;
    font-family: var(--font-family-mono);
  }

  :global(.dark) .example-row {
    background: rgba(255, 255, 255, 0.05);
  }

  .ex-price {
    font-weight: 600;
  }
  .ex-arrow {
    color: var(--gray-color);
    font-size: 0.7rem;
  }
  .ex-disc {
    color: var(--primary-color);
    font-weight: 700;
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding-right: 8px;
  }
  .form-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .help-text {
    font-size: 10px;
    color: #9aa0a6;
    margin-top: 4px;
    display: block;
  }
  :global(.dark) .help-text {
    color: #9ca3af;
  }
  .two-col-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .divider {
    border: 0;
    border-top: 1px solid var(--border-color);
    margin: 12px 0;
  }
  .nested-config {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-left: 12px;
    border-left: 2px solid var(--border-color);
  }
  :global(.dark) .nested-config {
    border-left-color: #374151;
  }
  .nested-actions {
    padding-top: 8px;
  }
  .settings-footer {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }

  .logs-panel {
    height: 75vh;
    min-height: 600px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .logs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-color);
  }
  :global(.dark) .logs-header {
    background: rgba(24, 24, 27, 0.5);
  }
  .log-subtitle {
    font-size: 12px;
    color: #6b7280;
    font-family: "JetBrains Mono", monospace;
  }
  :global(.dark) .log-subtitle {
    color: #9ca3af;
  }
  .log-container {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  :global(.dark) .log-container {
    background: transparent;
    border: none;
  }
  .empty-state {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    gap: 6px;
  }
  .big-icon {
    font-size: 2.25rem;
  }
  .check-summary {
    font-size: 9px;
    color: rgba(107, 114, 128, 0.4);
    padding: 2px 12px;
    font-style: italic;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hline {
    height: 1px;
    flex: 1;
    background: rgba(229, 231, 235, 0.5);
  }

  .log-entry {
    display: flex;
    gap: 12px;
    border-radius: 8px;
    border-width: 1px;
    border-left-width: 4px;
  }
  .log-small {
    padding: 4px 12px;
    font-size: 11px;
  }
  .log-normal {
    padding: 12px;
  }
  .log-timestamp {
    font-size: 9px;
    opacity: 0.4;
    flex-shrink: 0;
    padding-top: 2px;
    font-family: "JetBrains Mono", monospace;
  }
  .log-message-row {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    word-break: break-all;
  }
  .overlap-badge {
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.1);
    color: #9ca3af;
    font-size: 9px;
    font-weight: 700;
    white-space: nowrap;
  }
  :global(.dark) .overlap-badge {
    background: rgba(0, 0, 0, 0.4);
  }
</style>
