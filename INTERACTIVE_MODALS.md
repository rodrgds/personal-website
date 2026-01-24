# Interactive Modal System

This directory contains a flexible modal system that allows you to create interactive links with special effects that open modals with custom content.

## Components

### 1. Modal (`/src/components/ui/Modal.svelte`)
A reusable modal component built with Svelte 5 that provides:
- Native HTML `<dialog>` element for accessibility
- Customizable sizes: `sm`, `md`, `lg`, `xl`
- Optional title header
- Smooth animations
- Backdrop blur effect
- Responsive design
- Dark mode support

**Usage:**
```svelte
<script>
  import Modal from "../../ui/Modal.svelte";
  
  let isOpen = $state(false);
</script>

<Modal bind:isOpen title="My Title" size="lg">
  <p>Your content here</p>
</Modal>
```

### 2. InteractiveLink (`/src/components/ui/InteractiveLink.svelte`)
A special link component with visual effects:
- Animated wavy underline
- Subtle pulse/blink effect
- Glow on hover
- Respects `prefers-reduced-motion`

**Usage:**
```svelte
<script>
  import InteractiveLink from "../../ui/InteractiveLink.svelte";
  
  function handleClick() {
    console.log("Clicked!");
  }
</script>

<InteractiveLink text="Click me" onclick={handleClick} />
```

## Example: Weightlifting Modal

The weightlifting modal demonstrates the pattern:

1. **Content Component** (`hevy-routines.svelte`): Fetches and displays Hevy workout routines
2. **Wrapper Component** (`weightlifting-modal.svelte`): Combines InteractiveLink + Modal + Content
3. **Usage in Page** (`now.mdx`): Simple import and use with `client:load`

```tsx
<WeightliftingModal client:load />
```

## Creating New Interactive Modals

### Example: Ping Pong Game Modal

1. **Create the game component:**
```svelte
<!-- /src/components/features/home/ping-pong-game.svelte -->
<script>
  // Your game logic here
</script>

<div class="ping-pong-game">
  <!-- Game UI -->
</div>
```

2. **Create the wrapper component:**
```svelte
<!-- /src/components/features/home/ping-pong-modal.svelte -->
<script>
  import Modal from "../../ui/Modal.svelte";
  import InteractiveLink from "../../ui/InteractiveLink.svelte";
  import PingPongGame from "./ping-pong-game.svelte";

  let isModalOpen = $state(false);
</script>

<InteractiveLink text="Table Tennis" onclick={() => isModalOpen = true} />

<Modal bind:isOpen={isModalOpen} title="Ping Pong Game" size="md">
  <PingPongGame />
</Modal>
```

3. **Use in your page:**
```mdx
import PingPongModal from "../components/features/home/ping-pong-modal.svelte";

<li>🏓 <PingPongModal client:load /></li>
```

## Astro Actions

The system uses Astro Actions for backend functionality:

### Creating a New Action

Edit `/src/actions/index.ts`:

```typescript
export const server = {
  getHevyRoutines: defineAction({ /* ... */ }),
  
  // Add your new action:
  getMyData: defineAction({
    input: z.object({
      id: z.string(),
    }),
    handler: async (input) => {
      // Your backend logic
      return { data: "response" };
    },
  }),
};
```

### Using Actions in Components

```svelte
<script>
  import { actions } from "astro:actions";
  
  async function loadData() {
    const { data, error } = await actions.getMyData({ id: "123" });
    if (!error) {
      console.log(data);
    }
  }
</script>
```

## Caching

The actions include intelligent caching:

- **Routine folders and routines**: Cached for 3 days (data doesn't change frequently)
- **Workout statistics**: Cached for 3 hours (updated more frequently)

All actions support a `forceRefresh` parameter to bypass the cache when needed.

```typescript
const myCache = new SimpleCache<MyDataType>(3 * 24 * 60 * 60 * 1000); // 3 days

export const server = {
  myAction: defineAction({
    input: z.object({
      forceRefresh: z.boolean().optional(),
    }),
    handler: async (input) => {
      if (!input.forceRefresh) {
        const cached = myCache.get('key');
        if (cached) return cached;
      }
      
      const fresh = await fetchData();
      myCache.set('key', fresh);
      return fresh;
    },
  }),
};
```

## Hevy Integration Details

The Hevy routines modal demonstrates advanced API integration:

### Features Implemented

1. **Folder Filtering**: Automatically finds and displays only routines from the "Current" folder
2. **Pagination Handling**: Fetches all routines across multiple pages (Hevy API returns max 10 per page)
3. **Workout Statistics**: Displays total workout count and last workout with relative time (Today, Yesterday, etc.)
4. **Full Exercise Details**: Shows all exercises with complete set information (weight, reps, RPE, rest times, notes)
5. **Smart Caching**: 3-day cache for routines, 3-hour cache for stats

### API Calls Made

```typescript
// 1. Get routine folders to find "Current" folder
actions.getRoutineFolders({ forceRefresh: false })

// 2. Get routines filtered by folder (with pagination)
actions.getHevyRoutines({ forceRefresh: false, folderId: currentFolderId })

// 3. Get workout statistics
actions.getWorkoutStats({ forceRefresh: false })
```

### Hevy API Requirements

- **API Key**: Stored in `.env` as `HEVY_API_KEY`
- **Hevy Pro**: Required for API access
- **Folder Setup**: Create a routine folder named "Current" in the Hevy app

## Styling Tips

- All components use CSS custom properties (`var(--link-color)`, etc.)
- Dark mode is automatically supported via `@media (prefers-color-scheme: dark)`
- Animations respect `prefers-reduced-motion`
- Mobile responsive by default

## Configuration

### Modal Sizes
- `sm`: 400px
- `md`: 600px
- `lg`: 800px
- `xl`: 1000px

### Environment Variables
Add API keys to `.env`:
```
HEVY_API_KEY=your-key-here
MY_OTHER_API_KEY=another-key
```

Access in actions:
```typescript
const apiKey = import.meta.env.MY_OTHER_API_KEY;
```

## Deployment Notes

This setup uses Astro's static output with the Node adapter, allowing:
- Static pages for fast loading
- Server-side actions for dynamic data
- Works on Vercel, Netlify, Cloudflare Pages, etc.

The actions automatically create server endpoints at `/_actions/*`.
