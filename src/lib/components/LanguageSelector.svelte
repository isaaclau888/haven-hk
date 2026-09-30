<script lang="ts">
  import { onMount } from "svelte";

  export type Language = "en" | "zh";

  interface Props {
    onchange: (language: Language) => void;
  }

  let { onchange }: Props = $props();
  let open = $state(false);

  onMount(() => {
    open = true;
  });

  function select(language: Language) {
    onchange(language);
    open = false;
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-haven-green-deep/70 p-4 backdrop-blur-sm"
    role="presentation"
    onclick={(event) => event.currentTarget === event.target && (open = false)}
  >
    <dialog
      open
      class="relative m-0 w-full max-w-md rounded-[2rem] border-4 border-haven-brown-dark bg-haven-brown-light p-6 text-center shadow-[0_1rem_0_rgba(100,55,30,0.25)] sm:p-10"
      aria-modal="true"
      aria-labelledby="language-title"
    >
      <h2 id="language-title" class="font-display text-4xl leading-none text-haven-orange-deep sm:text-5xl">Select language</h2>
      <p class="mt-2 font-display text-2xl leading-none text-haven-orange-deep">選擇語言</p>

      <div class="mt-8 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="rounded-2xl border-2 border-haven-orange-deep bg-haven-yellow px-5 py-4 font-display text-2xl leading-none text-haven-orange-deep transition-transform hover:-translate-y-1 active:translate-y-0"
          onclick={() => select("en")}
        >
          English
        </button>
        <button
          type="button"
          class="rounded-2xl border-2 border-haven-orange-deep bg-haven-orange-bright px-5 py-4 font-display text-2xl leading-none text-white transition-transform hover:-translate-y-1 active:translate-y-0"
          onclick={() => select("zh")}
        >
          中文
        </button>
      </div>
    </dialog>
  </div>
{/if}
