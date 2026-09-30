<script lang="ts">
  import { defaultSiteData } from "$lib/data/site";
  import type { SiteImages } from "$lib/data/images";
  import type { Sponsor } from "$lib/data/types";

  interface Props {
    heading: string;
    items: Sponsor[];
    images?: SiteImages;
  }

  let { heading, items, images = defaultSiteData.images }: Props = $props();

  const ROW_SIZE = 3;
  const tiers = ["Gold", "Silver", "Bronze"] as const;

  const groupedSponsors = $derived.by(() => {
    const groups: Record<(typeof tiers)[number], Sponsor[]> = {
      Gold: [],
      Silver: [],
      Bronze: [],
    };

    const other: Sponsor[] = [];

    for (const item of items) {
      if (item.tier === "Gold") groups.Gold.push(item);
      else if (item.tier === "Silver") groups.Silver.push(item);
      else if (item.tier === "Bronze") groups.Bronze.push(item);
      else other.push(item);
    }

    return { ...groups, Partners: other };
  });

  const rows = $derived.by(() => {
    const out: Sponsor[][] = [];
    for (let i = 0; i < items.length; i += ROW_SIZE) {
      out.push(items.slice(i, i + ROW_SIZE));
    }
    return out;
  });

  const hasMultipleRows = $derived(items.length > ROW_SIZE);
  const hasTieredItems = $derived(items.some((item) => item.tier));

  const sponsorRowPadding = [
    "top-[0%]",
    "mt-0 sm:mt-[clamp(0rem,1vw,3rem)] md:mt-[clamp(1rem,2vw,5rem)]",
    "mt-0 sm:mt-[clamp(0rem,2vw,1.5rem)] md:mt-[clamp(1rem,2vw,3rem)]",
    "mt-0 sm:mt-[clamp(0rem,2vw,1.5rem)] md:mt-[clamp(1rem,2vw,3rem)]",
    "mt-0 sm:mt-[clamp(0rem,2vw,1.5rem)] md:mt-[clamp(1rem,2vw,3rem)]",
  ];

  const boxRowPadding = [
    "mt-0",
    "mt-[clamp(2rem,10vw,4rem)] sm:mt-[clamp(2rem,5vw,5rem)] md:mt-[clamp(3rem,7vw,6rem)]",
    "mt-[clamp(2rem,8vw,4rem)] sm:mt-[clamp(2rem,5vw,4rem)] md:mt-[clamp(2rem,6vw,6rem)]",
    "mt-[clamp(2rem,8vw,4rem)] sm:mt-[clamp(2rem,5vw,4rem)] md:mt-[clamp(2rem,6vw,6rem)]",
    "mt-[clamp(2rem,8vw,4rem)] sm:mt-[clamp(2rem,5vw,4rem)] md:mt-[clamp(2rem,6vw,6rem)]",
  ];
</script>

{#if items.length > 0}
  <section class="relative z-10 bg-haven-green overflow-x-clip">
    <img
      src={images.sponsorsEdgeTop}
      alt=""
      aria-hidden="true"
      class="absolute top-0 w-full object-cover -translate-y-[80%] md:-translate-y-[60%]"
    />
    <img
      src={images.sponsorsEdgeBottom}
      alt=""
      aria-hidden="true"
      class="absolute scale-[-1] bottom-0 w-full object-cover translate-y-[20%] md:translate-y-[40%]"
    />
    <div>
      <img
        src={images.sponsorsBushSmall}
        alt=""
        aria-hidden="true"
        class="absolute top-7 z-15 left-[clamp(0.5rem,5vw,1.5rem)] w-[10%] object-cover sm:top-7 sm:left-[clamp(0.5rem,5vw,1.05rem)] md:top-[clamp(3rem,3vw,5rem)] md:left-[clamp(0.5rem,5vw,1.5rem)]"
      />
      {#if hasMultipleRows}
        <img
          src={images.sponsorsBushLarge}
          alt=""
          aria-hidden="true"
          class="absolute top-[clamp(8.5rem,30vw,18rem)] z-10 -left-[clamp(0.5rem,5vw,1rem)] w-[30%] object-cover sm:top-[clamp(5.5rem,20vw,15rem)] sm:-left-[clamp(1.5rem,7vw,2.5rem)] md:top-[clamp(6.5rem,25vw,20rem)] md:-left-[clamp(1.5rem,7vw,2.5rem)]"
        />
      {/if}
      <img
        src={images.sponsorsGrassSmall}
        alt=""
        aria-hidden="true"
        class="absolute top-[clamp(5rem,25vw,14rem)] z-5 -left-[clamp(0.5rem,5vw,1rem)] w-[12%] object-cover sm:top-[clamp(4rem,18vw,14rem)] sm:-left-[clamp(0.5rem,5vw,1rem)] md:top-[clamp(5rem,22vw,30rem)] md:-left-[clamp(0.5rem,5vw,1rem)]"
      />
      {#if hasMultipleRows}
        <img
          src={images.sponsorsGrassLarge}
          alt=""
          aria-hidden="true"
          class="absolute bottom-60 z-5 -left-[clamp(1.5rem,6vw,3rem)] w-[20%] object-cover sm:bottom-75 sm:-left-[clamp(3rem,9vw,6rem)] md:bottom-[clamp(25rem,40vw,40rem)] md:-left-[clamp(3rem,9vw,6rem)]"
        />
        <img
          src={images.sponsorsBushMedium}
          alt=""
          aria-hidden="true"
          class="absolute bottom-52 z-15 left-[clamp(1rem,6vw,3rem)] w-[15%] object-cover sm:bottom-60 sm:left-[clamp(1rem,6vw,3rem)] md:bottom-[clamp(15rem,30vw,50rem)] md:left-[clamp(1rem,6vw,3rem)]"
        />
      {/if}
      <img
        src={images.sponsorsPumpkins}
        alt=""
        aria-hidden="true"
        class="absolute top-10 -left-[clamp(2rem,15vw,6rem)] z-10 w-[25%] object-cover sm:top-15 sm:-left-[clamp(4rem,14vw,8rem)] md:top-25 md:-left-[clamp(4rem,14vw,18rem)]"
      />
      {#if hasMultipleRows}
        <img
          src={images.sponsorsPumpkins}
          alt=""
          aria-hidden="true"
          class="absolute bottom-30 -left-[clamp(2rem,15vw,6rem)] z-10 w-[25%] object-cover sm:bottom-35 sm:-left-[clamp(4rem,14vw,8rem)] md:bottom-[clamp(5rem,18vw,14rem)] md:-left-[clamp(4rem,15vw,17rem)]"
        />
      {/if}
    </div>
    <div>
      <img
        src={images.sponsorsBushSmall}
        alt=""
        aria-hidden="true"
        class="absolute scale-x-[-1] top-7 z-15 right-[clamp(0.5rem,5vw,1.5rem)] w-[10%] object-cover sm:top-7 sm:right-[clamp(0.5rem,5vw,1.05rem)] md:top-[clamp(3rem,3vw,5rem)] md:right[clamp(0.5rem,5vw,1.5rem)]"
      />
      {#if hasMultipleRows}
        <img
          src={images.sponsorsBushLarge}
          alt=""
          aria-hidden="true"
          class="absolute scale-x-[-1] bottom-[clamp(8rem,45vw,10rem)] z-15 -right-[clamp(0.5rem,5vw,1rem)] w-[30%] object-cover sm:bottom-43 sm:-right-[clamp(1.5rem,7vw,2.5rem)] md:bottom-[clamp(10rem,20vw,45rem)] md:-right-[clamp(1.5rem,7vw,2.5rem)]"
        />
        <img
          src={images.sponsorsGrassSmall}
          alt=""
          aria-hidden="true"
          class="absolute bottom-52 z-5 -right-[clamp(0.5rem,5vw,1rem)] w-[12%] object-cover sm:top-[clamp(4rem,18vw,14rem)] sm:-right-[clamp(0.5rem,5vw,1rem)] md:top-[clamp(5rem,22vw,30rem)] md:-right-[clamp(0.5rem,5vw,1rem)]"
        />
        <img
          src={images.sponsorsGrassLarge}
          alt=""
          aria-hidden="true"
          class="absolute bottom-60 z-5 -right-[clamp(1.5rem,6vw,3rem)] w-[20%] object-cover sm:bottom-75 sm:-right-[clamp(3rem,9vw,6rem)] md:bottom-[clamp(25rem,40vw,40rem)] md:-right-[clamp(3rem,9vw,6rem)]"
        />
      {/if}
      <img
        src={images.sponsorsBushMedium}
        alt=""
        aria-hidden="true"
        class="absolute scale-x-[-1] top-[clamp(10rem,30vw,40rem)] z-15 right-[clamp(1rem,6vw,3rem)] w-[15%] object-cover sm:top-[clamp(3.5rem,18vw,1-0rem)] sm:right-[clamp(1rem,6vw,3rem)] md:top-[clamp(6.5rem,25vw,20rem)] md:right-[clamp(1rem,6vw,3rem)]"
      />
      <img
        src={images.sponsorsPumpkins}
        alt=""
        aria-hidden="true"
        class="absolute top-10 -right-[clamp(2rem,15vw,6rem)] z-10 w-[25%] object-cover sm:top-15 sm:-right-[clamp(4rem,14vw,8rem)] md:top-25 md:-right-[clamp(4rem,14vw,18rem)]"
      />
      {#if hasMultipleRows}
        <img
          src={images.sponsorsPumpkins}
          alt=""
          aria-hidden="true"
          class="absolute bottom-60 -right-[clamp(2rem,15vw,6rem)] z-10 w-[25%] object-cover sm:bottom-75 sm:-right-[clamp(5rem,16vw,9rem)] md:bottom-[clamp(15rem,40vw,50rem)] md:-right-[clamp(5rem,16vw,19rem)]"
        />
      {/if}
    </div>
    <div class="pb-[clamp(8rem,20vw,40rem)]">
      <div
        class="absolute grid grid-cols-[1fr_auto_1fr] z-25 left-1/2 -translate-x-1/2 h-[clamp(2rem,7vw,5rem)] gap-[clamp(1rem,8vw,8rem)]"
      >
        <img
          src={images.sponsorsHouseLeft}
          alt=""
          aria-hidden="true"
          class="z-5 h-[clamp(2rem,7vw,10rem)] object-contain justify-self-end"
        />
        <img
          src={images.sponsorsHouseTop}
          alt=""
          aria-hidden="true"
          class="z-5 h-[clamp(2rem,7vw,10rem)] object-contain justify-self-center"
        />
        <img
          src={images.sponsorsHouseRight}
          alt=""
          aria-hidden="true"
          class="z-5 h-[clamp(2rem,7vw,10rem)] object-contain justify-self-start"
        />
      </div>
      <div class="shell relative">
        <div class="mx-auto max-w-[min(92rem,90vw)] rounded-[clamp(1rem,2vw,2rem)] border-4 border-haven-brown-dark/70 bg-haven-brown-light/90 px-[clamp(0.8rem,2.5vw,2.25rem)] py-[clamp(1.25rem,3vw,2.75rem)] shadow-[0_1rem_0_rgba(100,55,30,0.15)]">
          <h2
            class="sponsors-heading mb-[clamp(1.5rem,3vw,2.5rem)] pt-[clamp(0.75rem,1.5vw,1.5rem)] text-center font-display text-[clamp(2.4rem,5vw,5rem)] leading-none tracking-[-0.05em] text-haven-orange-deep"
          >
            {heading}
          </h2>

          {#if hasTieredItems}
            {#each tiers as tier}
              {#if groupedSponsors[tier].length > 0}
                <div class="mt-[clamp(1.25rem,2vw,2rem)] border-t-2 border-haven-orange-deep/20 pt-[clamp(1.25rem,2vw,2rem)]">
                  <h3 class={`mx-auto mb-[clamp(0.8rem,1.2vw,1.2rem)] w-fit rounded-full px-[clamp(1rem,2vw,1.75rem)] py-2 text-center font-display text-[clamp(1.35rem,2.2vw,2.3rem)] leading-none tracking-[-0.04em] text-white shadow-sm ${tier === "Gold" ? "bg-haven-gold" : tier === "Silver" ? "bg-haven-brown-dark" : "bg-haven-orange-deep"}`}>
                    {tier} Tier
                  </h3>

                  <div class="grid gap-[clamp(0.8rem,2vw,1.6rem)] sm:grid-cols-2 md:grid-cols-3">
                    {#each groupedSponsors[tier] as item}
                      <div class="flex min-h-[8rem] flex-col items-center justify-end rounded-xl border-2 border-white/60 bg-white/75 p-[clamp(0.7rem,1.2vw,1rem)] shadow-[0_0.25rem_0_hsla(20,50%,45%,0.18)] transition-transform hover:-translate-y-1 hover:bg-white">
                        <a href={item.href} target="_blank" rel="noopener" class="group flex flex-col items-center text-center">
                          <span class="flex h-[clamp(3.75rem,6vw,5rem)] w-[clamp(3.75rem,6vw,5rem)] items-center justify-center rounded-full bg-white p-2 shadow-sm">
                            <img src={item.image} alt={item.name} loading="lazy" decoding="async" class="h-full w-full object-contain" />
                          </span>
                          <span class="mt-2 block font-display text-[clamp(1.1rem,1.7vw,1.65rem)] leading-none tracking-[-0.04em] text-haven-orange-deep">
                            {item.name}
                          </span>
                        </a>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}

            {#if groupedSponsors.Partners.length > 0}
              <div class="mt-[clamp(1.25rem,2vw,2rem)] border-t-2 border-haven-orange-deep/20 pt-[clamp(1.25rem,2vw,2rem)]">
                <h3 class="mx-auto mb-[clamp(0.8rem,1.2vw,1.2rem)] w-fit rounded-full bg-haven-green-deep px-[clamp(1rem,2vw,1.75rem)] py-2 text-center font-display text-[clamp(1.35rem,2.2vw,2.3rem)] leading-none tracking-[-0.04em] text-white shadow-sm">
                  Our Partners
                </h3>

                <div class="grid gap-[clamp(0.8rem,2vw,1.6rem)] sm:grid-cols-2 md:grid-cols-3">
                  {#each groupedSponsors.Partners as item}
                    <div class="flex min-h-[8rem] flex-col items-center justify-end rounded-xl border-2 border-white/60 bg-white/75 p-[clamp(0.7rem,1.2vw,1rem)] shadow-[0_0.25rem_0_hsla(20,50%,45%,0.18)] transition-transform hover:-translate-y-1 hover:bg-white">
                      <a href={item.href} target="_blank" rel="noopener" class="group flex flex-col items-center text-center">
                        <span class="flex h-[clamp(3.75rem,6vw,5rem)] w-[clamp(3.75rem,6vw,5rem)] items-center justify-center rounded-full bg-white p-2 shadow-sm">
                          <img src={item.image} alt={item.name} loading="lazy" decoding="async" class="h-full w-full object-contain" />
                        </span>
                        <span class="mt-2 block font-display text-[clamp(1.1rem,1.7vw,1.65rem)] leading-none tracking-[-0.04em] text-haven-orange-deep">
                          {item.name}
                        </span>
                      </a>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {:else}
            {#each rows as row, rowIndex}
              <div
                class={`relative z-20 mx-auto mt-[clamp(1rem,2vw,2rem)] flex max-w-7xl flex-wrap items-center justify-center gap-x-[clamp(0rem,4vw,3rem)] gap-y-[clamp(1rem,4vw,3rem)] ${sponsorRowPadding[rowIndex + 1] ?? sponsorRowPadding[sponsorRowPadding.length - 1]}`}
              >
                {#each row as item}
                  <div class={`flex min-w-[clamp(7rem,12vw,15rem)] flex-1 flex-col items-center justify-end text-center ${boxRowPadding[rowIndex + 1] ?? boxRowPadding[boxRowPadding.length - 1]}`}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener"
                      class="block transition-transform hover:scale-[1.02] active:scale-100"
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        class="relative mx-auto max-h-[clamp(2rem,10vw,12rem)] z-20 w-full max-w-32 object-contain"
                      />
                      <p
                        class="text-haven-orange-deep md:text-[clamp(0.5rem,2vw,2rem)] md:leading-[1.05] md:pt-[clamp(0.5rem,1.2vw,1.2rem)]"
                      >
                        {item.name}
                      </p>
                    </a>
                  </div>
                {/each}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </section>
{/if}
