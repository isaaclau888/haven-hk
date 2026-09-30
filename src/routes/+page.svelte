<script lang="ts">
  import Meta from "$lib/components/Meta.svelte";
  import LanguageSelector, { type Language } from "$lib/components/LanguageSelector.svelte";
  import { chineseContent } from "$lib/data/content.zh";
  import SiteHeader from "$lib/components/SiteHeader.svelte";
  import Hero from "$lib/components/Hero.svelte";
  import About from "$lib/components/About.svelte";
  import Pitch from "$lib/components/Pitch.svelte";
  import Steps from "$lib/components/Steps.svelte";
  import PastEvents from "$lib/components/PastEvents.svelte";
  import Faq from "$lib/components/Faq.svelte";
  import SiteFooter from "$lib/components/SiteFooter.svelte";
  import Sponsors from "$lib/components/Sponsors.svelte";
  import Schedule from "$lib/components/Schedule.svelte";
  import {
    about,
    event,
    faqs,
    faqCta,
    faqHeading,
    pitchHeading,
    pitches,
    pastEvents,
    pastEventsHeading,
    perks,
    schedule,
    scheduleHeading,
    scheduleTbd,
    supporters,
    sponsorsHeading,
    stepsHeading,
    stepsSubheading,
  } from "$lib/data/content";

  let { data } = $props();
  let language = $state<Language>("en");

  const englishContent = {
    en: {
      tagline: event.tagline,
      about: { title: about.title, body: about.body, perks },
      pitch: { heading: pitchHeading, items: pitches },
      steps: { heading: stepsHeading, subheading: stepsSubheading },
      schedule: { heading: scheduleHeading, tbd: scheduleTbd },
      sponsorsHeading,
      pastEvents: { heading: pastEventsHeading, items: pastEvents },
      faq: { heading: faqHeading, cta: faqCta, items: faqs },
    },
  };

  const localized = $derived(language === "zh" ? chineseContent : englishContent.en);

  $effect(() => {
    document.documentElement.dataset.language = language;
    document.documentElement.lang = language === "zh" ? "zh-Hant" : "en";
  });

  const isPoc = false;
</script>

<Meta />

<LanguageSelector onchange={(next) => (language = next)} />
<SiteHeader poc={isPoc} language={language} />

<main id="main" class="overflow-x-clip">
  <div class="relative z-20">
    <Hero
      poc={isPoc}
      title={["Hong Kong"]}
      tagline={localized.tagline}
      signupUrl={data.signupUrl}
      referral={data.referral}
      cities={data.cities}
      signup={language === "zh" ? { placeholder: "you@hackclub.com", button: "報名！" } : undefined}
      mapLabel={language === "zh" ? "尋找附近的活動" : undefined}
      scrollLabel={language === "zh" ? "更多資訊" : undefined}
    />
  </div>

  <div id="about" class="relative stage stage-middle z-10">
    <About title={localized.about.title} body={localized.about.body} perks={localized.about.perks} />
    <Pitch poc={isPoc} heading={localized.pitch.heading} items={localized.pitch.items} />
  </div>

  <div class="relative z-20">
    <Steps poc={isPoc} heading={localized.steps.heading} subheading={localized.steps.subheading} />
  </div>

  <div class="relative z-10">
    <Schedule heading={localized.schedule.heading} tbd={localized.schedule.tbd} days={schedule} />
  </div>

  <div class="stage stage-picnic">
    <PastEvents heading={localized.pastEvents.heading} items={localized.pastEvents.items} />
  </div>

  <Sponsors heading={localized.sponsorsHeading} items={supporters} />

  <Faq heading={localized.faq.heading} cta={localized.faq.cta} items={localized.faq.items} />
</main>

<SiteFooter />
