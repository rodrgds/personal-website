<script>
  import { onMount } from "svelte";
  import favoritesData from "../data/favorites.json";

  // Reactive state
  let activeFilters = new Set();
  let expandedItems = new Set();
  let filterLogic = "AND"; // "AND" or "OR"
  let isMobile = false;
  let sortBy = "alpha"; // "alpha", "alpha-desc", "rating", "rating-desc"
  let mounted = false;

  // Default icons for sections
  const getDefaultIcon = (section) => {
    switch (section) {
      case "movies":
        return "🎬";
      case "shows":
        return "📺";
      case "podcasts":
        return "🎧";
      case "books":
        return "📚";
      case "blogs":
        return "✍️";
      case "articles":
        return "📄";
      case "videos":
        return "▶️";
      case "cool":
        return "⭐";
      default:
        return "⭐";
    }
  };

  // Reactive computed values
  $: showClearButton = activeFilters.size > 0;

  // Get all available categories
  $: allCategories = (() => {
    const categories = new Set();
    Object.values(favoritesData).forEach((items) => {
      items.forEach((item) => {
        if (item.categories) {
          item.categories.forEach((cat) => categories.add(cat));
        }
      });
    });
    return Array.from(categories).sort();
  })();

  $: visibleSections = Object.entries(favoritesData).map(([section, items]) => {
    const visibleItems = items.filter((item) => {
      if (activeFilters.size === 0) return true;

      if (filterLogic === "AND") {
        return Array.from(activeFilters).every((filter) =>
          (item.categories || []).includes(filter)
        );
      } else {
        return Array.from(activeFilters).some((filter) =>
          (item.categories || []).includes(filter)
        );
      }
    });

    // Sort the visible items
    const sortedItems = [...visibleItems].sort((a, b) => {
      switch (sortBy) {
        case "alpha":
          return a.title.localeCompare(b.title);
        case "alpha-desc":
          return b.title.localeCompare(a.title);
        case "rating":
          return (a.rating || 0) - (b.rating || 0);
        case "rating-desc":
          return (b.rating || 0) - (a.rating || 0);
        default:
          return 0;
      }
    });

    return {
      section,
      items: sortedItems,
      visible: visibleItems.length > 0,
    };
  });

  // Functions
  function initFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const tagsParam = urlParams.get("tags");
    if (tagsParam) {
      activeFilters = new Set(tagsParam.split(",").filter(Boolean));
    }
  }

  function updateURL() {
    const url = new URL(window.location.href);
    if (activeFilters.size > 0) {
      url.searchParams.set("tags", Array.from(activeFilters).join(","));
    } else {
      url.searchParams.delete("tags");
    }
    window.history.replaceState({}, "", url.toString());
  }

  function toggleFilter(category) {
    if (!category) return;

    const newFilters = new Set(activeFilters);
    if (newFilters.has(category)) {
      newFilters.delete(category);
    } else {
      newFilters.add(category);
    }
    activeFilters = newFilters;
    updateURL();
  }

  function clearFilters() {
    activeFilters = new Set();
    expandedItems = new Set();
    updateURL();
  }

  function toggleItemExpanded(itemId) {
    // Only allow expanding on mobile
    if (!isMobile) return;

    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.clear(); // Only one item expanded at a time
      newExpanded.add(itemId);
    }
    expandedItems = newExpanded;
  }

  function handleItemClick(event, itemId) {
    // Don't expand if clicking on a link or tag
    if (event.target.closest("a") || event.target.closest(".tag-pill")) {
      return;
    }
    // Only handle clicks on mobile
    if (isMobile) {
      toggleItemExpanded(itemId);
    }
  }

  function handleTagClick(event, category) {
    event.preventDefault();
    event.stopPropagation();
    toggleFilter(category);
  }

  function handleOutsideClick(event) {
    if (
      !event.target.closest(".favorite-item") &&
      !event.target.closest(".filter-controls")
    ) {
      expandedItems = new Set();
    }
  }

  function detectMobile() {
    isMobile = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  }

  function formatCategoryName(category) {
    return category
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function renderStars(rating) {
    return "★".repeat(rating) + "☆".repeat(5 - rating);
  }

  function isTagHighlighted(category, itemId) {
    return (
      activeFilters.has(category) &&
      (expandedItems.has(itemId) || activeFilters.size > 0)
    );
  }

  // Lifecycle
  onMount(() => {
    mounted = true;
    initFromURL();
    detectMobile();
    document.addEventListener("click", handleOutsideClick);
    window.addEventListener("resize", detectMobile);

    return () => {
      document.removeEventListener("click", handleOutsideClick);
      window.removeEventListener("resize", detectMobile);
    };
  });

  // Watch for changes to update URL
  $: if (mounted && typeof window !== "undefined") {
    updateURL();
  }
</script>

<div class="favorites-container">
  <div class="header-section compact">
    <h1>My Favorites</h1>
    <p>
      A curated collection of my favorite movies, shows, podcasts, books, blogs,
      articles, videos, and cool stuff that have shaped my thinking. Saved here
      to revisit as I get older.
    </p>
  </div>

  <!-- Filter Controls -->
  <div class="filter-controls">
    <div class="filter-header">
      <h3>Filters & Sort</h3>
      <div class="filter-options">
        <div class="filter-logic">
          <button
            class="logic-btn"
            class:active={filterLogic === "AND"}
            on:click={() => (filterLogic = "AND")}
          >
            All
          </button>
          <button
            class="logic-btn"
            class:active={filterLogic === "OR"}
            on:click={() => (filterLogic = "OR")}
          >
            Any
          </button>
        </div>
        <div class="sort-options">
          <select bind:value={sortBy}>
            <option value="alpha">A-Z</option>
            <option value="alpha-desc">Z-A</option>
            <option value="rating-desc">★ High</option>
            <option value="rating">★ Low</option>
          </select>
        </div>
      </div>
    </div>

    <div class="filter-tags-container">
      <div class="filter-tags">
        {#each allCategories as category}
          <button
            class="filter-chip"
            class:active={activeFilters.has(category)}
            on:click={() => toggleFilter(category)}
          >
            {formatCategoryName(category)}
          </button>
        {/each}
      </div>
    </div>

    {#if showClearButton}
      <button class="clear-btn" on:click={clearFilters}>Clear All</button>
    {/if}
  </div>

  {#each visibleSections as { section, items, visible }}
    {#if visible}
      <section class="content-section">
        <h2 class="section-title">
          {section === "cool"
            ? "Cool Stuff"
            : section.charAt(0).toUpperCase() + section.slice(1)}
        </h2>
        <div class="items-list">
          {#each items as item, index}
            {@const itemId = `${section}-${index}`}
            {@const isExpanded = expandedItems.has(itemId)}
            <div
              class="favorite-item"
              class:expanded={isExpanded}
              on:click={(e) => handleItemClick(e, itemId)}
              role="button"
              tabindex="0"
              on:keydown={(e) =>
                e.key === "Enter" && handleItemClick(e, itemId)}
            >
              <!-- Image/Icon -->
              <div class="item-image">
                {#if item.image}
                  <img
                    src={item.image}
                    alt={item.title}
                    class="item-img {section === 'books'
                      ? 'aspect-book'
                      : section === 'movies' || section === 'shows'
                        ? 'aspect-poster'
                        : 'aspect-square'}"
                    loading="lazy"
                  />
                {:else}
                  <div class="item-icon">
                    {item.icon || getDefaultIcon(section)}
                  </div>
                {/if}
              </div>

              <!-- Content -->
              <div class="item-content">
                <div class="item-header">
                  <div class="title-with-indicators">
                    <div class="title-and-meta">
                      <h3 class="item-title">
                        {#if item.url}
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {item.title}
                          </a>
                        {:else}
                          {item.title}
                        {/if}
                      </h3>
                      <div class="item-meta">
                        {#if item.author}<span class="author"
                            >by {item.author}</span
                          >{/if}
                        {#if item.year}<span class="year">({item.year})</span
                          >{/if}
                      </div>
                    </div>
                    <div class="rating-container">
                      {#if item.rating}
                        <div class="rating-top">
                          {renderStars(item.rating)}
                        </div>
                      {/if}
                      <div class="indicators">
                        {#if item.comment}
                          <span class="indicator" title="Has comment">💬</span>
                        {/if}
                        {#if section === "podcasts" && item.favoriteEpisodes}
                          <span class="indicator" title="Has favorite episodes"
                            >⭐</span
                          >
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>

                <p class="item-comment">
                  {#if item.comment}
                    {item.comment}
                  {:else}
                    <em>No comment</em>
                  {/if}
                </p>

                <!-- Favorite Episodes (for podcasts) - only show on hover/click -->
                {#if section === "podcasts" && item.favoriteEpisodes}
                  <div class="favorite-episodes">
                    <h4>Favorite Episodes:</h4>
                    <ul>
                      {#each item.favoriteEpisodes as episode}
                        <li>
                          {#if episode.number}
                            <strong
                              >{episode.number}{episode.guest
                                ? ` - ${episode.guest}:`
                                : ":"}</strong
                            >
                            {episode.title}
                          {:else}
                            <strong>{episode.title}</strong>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                <!-- Tags -->
                <div class="item-tags">
                  <div class="tags-list">
                    {#each item.categories || [] as category}
                      <button
                        class="tag-pill"
                        class:highlighted={isTagHighlighted(category, itemId)}
                        data-tag={category}
                        on:click={(e) => handleTagClick(e, category)}
                      >
                        {formatCategoryName(category)}
                      </button>
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/each}
</div>

<style>
  .favorites-container {
    max-width: 1200px;
    margin-left: 0;
    margin-right: auto;
    padding: 0;
  }

  .header-section {
    margin-bottom: 2rem;
    text-align: left;
    max-width: 1200px;
    margin-left: 0;
    margin-right: auto;
    padding: 0;
  }

  .header-section.compact h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: var(--text-color);
    letter-spacing: -0.01em;
  }

  .header-section.compact p {
    font-size: 1rem;
    color: var(--text-color);
    opacity: 0.7;
    margin: 0;
    font-weight: 400;
    line-height: 1.5;
  }

  .clear-btn {
    font-size: 0.875rem;
    padding: 0.5rem 1rem;
    background: #fee2e2;
    color: #dc2626;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .clear-btn:hover {
    background: #fecaca;
  }

  .filter-controls {
    margin-bottom: 2rem;
  }

  .filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .filter-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-color);
  }

  .filter-options {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .filter-logic {
    display: flex;
    gap: 0.25rem;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 0.5rem;
    padding: 0.25rem;
  }

  .logic-btn {
    font-family: var(--font-family);
    font-size: 0.875rem;
    color: var(--text-color);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    transition: all 0.2s;
    font-weight: 500;
  }

  .logic-btn:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  .logic-btn.active {
    background: var(--link-color);
    color: white;
  }

  .sort-options select {
    font-family: var(--font-family);
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 0.375rem;
    background: var(--background-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .filter-tags-container {
    position: relative;
  }

  .filter-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    max-height: 7.5rem; /* ~3 rows */
    overflow-y: auto;
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
  }

  .filter-tags::-webkit-scrollbar {
    width: 4px;
  }

  .filter-tags::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
  }

  .filter-tags::-webkit-scrollbar-thumb {
    background: var(--link-color);
    border-radius: 2px;
  }

  .filter-chip {
    padding: 0.375rem 0.75rem;
    background: transparent;
    color: var(--link-color);
    border: 1px solid var(--link-color);
    border-radius: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
    font-family: var(--font-family);
    font-weight: 500;
  }

  .filter-chip:hover {
    background: rgba(255, 136, 0, 0.1);
    transform: translateY(-1px);
  }

  .filter-chip.active {
    background: var(--link-color);
    color: white;
    box-shadow: 0 2px 4px rgba(255, 136, 0, 0.3);
  }

  .content-section {
    margin-bottom: 3rem;
  }

  .section-title {
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
    color: var(--text-color);
    text-transform: capitalize;
  }

  .items-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    align-items: start;
  }

  /* Responsive grid - 2 columns on larger screens */
  @media (min-width: 768px) {
    .items-list {
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      align-items: start;
    }
  }

  .favorite-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--background-color);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.5rem;
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .favorite-item:hover,
  .favorite-item.expanded {
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border-color: var(--link-color);
  }

  .item-image {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .item-img {
    width: 3rem;
    object-fit: cover;
    border-radius: 0.25rem;
  }

  .aspect-square {
    height: 3rem;
  }

  .aspect-book {
    height: 4rem;
  }

  .aspect-poster {
    height: 4rem;
  }

  .item-icon {
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    background: transparent;
    border: 1px solid var(--link-color);
    border-radius: 0.25rem;
    color: var(--link-color);
  }

  .item-content {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0;
  }

  .item-header {
    margin-bottom: 0.25rem;
  }

  .title-with-indicators {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .title-and-meta {
    flex: 1;
    min-width: 0;
  }

  .indicators {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
    justify-content: flex-end;
  }

  .rating-container {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .indicator {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .item-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.25rem 0;
    color: var(--text-color);
  }

  .item-title a {
    color: var(--text-color);
    text-decoration: none;
    transition: color 0.2s;
  }

  .item-title a:hover {
    color: var(--link-color);
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-color);
    opacity: 0.7;
    margin: 0;
  }

  .rating-top {
    color: var(--link-color);
    font-size: 0.75rem;
    font-weight: 600;
    display: flex;
    align-items: center;
  }

  .item-comment {
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--text-color);
    margin: 0;
    opacity: 0;
    visibility: hidden;
    max-height: 0;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  /* Desktop hover behavior */
  @media (hover: hover) and (pointer: fine) {
    .favorite-item:hover .item-comment {
      opacity: 1;
      visibility: visible;
      max-height: 10rem;
      margin: 0.5rem 0;
    }
  }

  /* Mobile click behavior */
  @media (hover: none) and (pointer: coarse) {
    .favorite-item.expanded .item-comment {
      opacity: 1;
      visibility: visible;
      max-height: 10rem;
      margin: 0.5rem 0;
    }
  }

  .item-comment em {
    opacity: 0.7;
  }

  .favorite-episodes {
    opacity: 0;
    visibility: hidden;
    max-height: 0;
    overflow: hidden;
    transition: all 0.2s ease;
    margin: 0;
    padding: 0;
    border-top: none;
  }

  /* Desktop hover behavior */
  @media (hover: hover) and (pointer: fine) {
    .favorite-item:hover .favorite-episodes {
      opacity: 1;
      visibility: visible;
      max-height: 20rem;
      margin: 0.75rem 0;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
    }
  }

  /* Mobile click behavior */
  @media (hover: none) and (pointer: coarse) {
    .favorite-item.expanded .favorite-episodes {
      opacity: 1;
      visibility: visible;
      max-height: 20rem;
      margin: 0.75rem 0;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
    }
  }

  .favorite-episodes h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-color);
  }

  .favorite-episodes ul {
    margin: 0;
    padding-left: 1.2rem;
    list-style-type: disc;
  }

  .favorite-episodes li {
    margin-bottom: 0.25rem;
    color: var(--text-color);
    font-size: 0.8rem;
    line-height: 1.3;
  }

  .favorite-episodes strong {
    color: var(--link-color);
    font-weight: 600;
  }

  .item-tags {
    opacity: 0;
    visibility: hidden;
    height: 0;
    overflow: hidden;
    transition:
      opacity 0.2s ease,
      visibility 0.2s ease,
      height 0.2s ease;
  }

  /* Desktop hover behavior */
  @media (hover: hover) and (pointer: fine) {
    .favorite-item:hover .item-tags {
      opacity: 1;
      visibility: visible;
      height: auto;
    }
  }

  /* Mobile click behavior - always show tags when expanded for filtering */
  @media (hover: none) and (pointer: coarse) {
    .favorite-item.expanded .item-tags {
      opacity: 1;
      visibility: visible;
      height: auto;
    }
  }

  .tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tag-pill {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: transparent;
    color: var(--link-color);
    border: 1px solid var(--link-color);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tag-pill:hover {
    background: var(--link-color);
    color: var(--background-color);
  }

  .tag-pill.highlighted {
    background: var(--link-color);
    color: var(--background-color);
    font-weight: 600;
    box-shadow: 0 0 0 2px rgba(255, 136, 0, 0.3);
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .favorite-item {
      border-color: rgba(255, 255, 255, 0.1);
    }

    .favorite-item:hover,
    .favorite-item.expanded {
      border-color: var(--link-color);
    }

    /* Dark mode favorite episodes border */
    .favorite-item:hover .favorite-episodes,
    .favorite-item.expanded .favorite-episodes {
      border-top-color: rgba(255, 255, 255, 0.1);
    }

    .filter-logic {
      background: rgba(255, 255, 255, 0.05);
    }

    .logic-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .sort-options select {
      background: var(--background-color);
      border-color: rgba(255, 255, 255, 0.2);
      color: var(--text-color);
    }

    .filter-tags::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .favorites-container {
      padding: 0 1rem;
    }

    .favorite-item {
      gap: 0.75rem;
    }

    .item-img,
    .item-icon {
      width: 2.5rem;
      height: 2.5rem;
    }

    .aspect-book,
    .aspect-poster {
      height: 3.5rem;
    }

    .item-icon {
      font-size: 1.25rem;
    }

    .filter-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .filter-options {
      align-self: stretch;
      justify-content: space-between;
    }

    .logic-btn {
      flex: 1;
    }

    .filter-tags {
      max-height: 6rem; /* Slightly less on mobile */
    }
  }
</style>
