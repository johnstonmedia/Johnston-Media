/**
 * Frequently asked questions.
 *
 * These do double duty. On the page they answer the questions people actually
 * email about; in FAQPage schema they're the passages search engines show as
 * rich results and AI answer engines quote when someone asks "who does sports
 * videography in NSW".
 *
 * Which is why the rule here is strict: every answer must be true and checkable
 * from the business as it actually operates. No invented turnaround times, no
 * prices that aren't set, no claims about equipment or clients. An answer
 * engine repeating a made-up fact is worse than it not mentioning you at all —
 * and unlike a marketing page, nobody sees the context it strips away.
 *
 * Answers are deliberately short and self-contained, because that's the form
 * that survives being lifted out of the page.
 */

export interface FaqItem {
  question: string;
  answer: string;
}

/** Hiring the studio — shown on /contact. */
export const STUDIO_FAQ: FaqItem[] = [
  {
    question: "What areas does Johnston Media cover?",
    answer:
      "Johnston Media works across New South Wales, Australia, and travels for projects that warrant it. Travel beyond the usual radius is quoted up front rather than added afterwards.",
  },
  {
    question: "What services does Johnston Media offer?",
    answer:
      "Photography, videography, aerial and drone media, and post-production — mainly for sports teams, brands and events. The studio also builds websites, client portals and booking automation.",
  },
  {
    question: "Who will actually turn up to the shoot?",
    answer:
      "Will Johnston. Johnston Media is a one-person studio by design, so the person you brief is the person behind the camera and in the edit. Larger jobs bring in trusted collaborators, agreed with you beforehand.",
  },
  {
    question: "How much does a shoot cost?",
    answer:
      "Every project is quoted individually, because a half-day brand shoot and a full season of fixtures aren't comparable. Send the details through the quote form and you'll get a written estimate with the figures itemised before anything is booked.",
  },
  {
    question: "How do I book?",
    answer:
      "Send a quote request through the website. You'll get an estimate by email, and accepting it raises an invoice through Square. A deposit confirms the booking and the balance falls due on delivery.",
  },
  {
    question: "How do payments work?",
    answer:
      "Invoicing runs through Square, so you pay by card through a standard Square invoice and get an automatic receipt. Deposits and balances are handled as separate payments on the same invoice.",
  },
  {
    question: "How do I get my photos and video?",
    answer:
      "Through your own login on this site. Files sit in your client portal rather than behind a download link that expires, and you can come back for them later.",
  },
  {
    question: "Is the drone work licensed?",
    answer:
      "Yes. Aerial work is flown in line with CASA rules for Australian airspace, including the restrictions that apply over people and near aerodromes.",
  },
];

/** Web work — shown on /web-development. */
export const WEB_FAQ: FaqItem[] = [
  {
    question: "What does a website from Johnston Media include?",
    answer:
      "A custom-designed site built from scratch, mobile-first, with the forms and email automation wired in. Quote requests reach your inbox, invoices can be raised through Square, and the search-engine groundwork is done before launch.",
  },
  {
    question: "Do I own the website?",
    answer:
      "Yes — the site, the domain and every account it runs on are in your name. There's no lock-in and no monthly fee just to keep your own website online.",
  },
  {
    question: "What does it cost to run?",
    answer:
      "At the scale most small businesses operate, hosting is free or close to it, because the sites are built to run on hosting tiers that cost nothing at low traffic. You pay for your domain, and for anything that genuinely charges per use.",
  },
  {
    question: "Can clients log in and see their own work?",
    answer:
      "Yes. A client portal gives each of your customers a private login to track their job, approve estimates, pay invoices and download their files. There's a working demonstration of one on the web development page.",
  },
  {
    question: "How long does a website take?",
    answer:
      "It depends on the size of the site and how quickly content and feedback come back. You get a fixed quote and a realistic timeline before the work starts, and a live preview link that updates as it's built.",
  },
  {
    question: "What happens if something breaks after launch?",
    answer:
      "You deal directly with the person who built it. The sites don't run on page builders or plugin stacks, which is most of the reason they don't break themselves overnight.",
  },
];

/** FAQPage JSON-LD for a set of questions. */
export function faqSchema(items: FaqItem[], id: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": id,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
