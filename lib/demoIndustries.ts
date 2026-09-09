/**
 * Sample businesses for the portal demo.
 *
 * The portal isn't a photography thing — it's a jobs-and-money thing, and it
 * lands better when a builder sees a builder's language rather than being asked
 * to imagine the translation. Same screens, same flow, different vocabulary.
 *
 * Figures here are illustrative sample data for a demonstration, not quotes.
 */

export interface DemoIndustry {
  id: string;
  /** Shown on the switcher. */
  label: string;
  /** The business using the portal. */
  studio: string;
  /** Their customer. */
  client: string;
  clientInitials: string;
  /** The job. */
  project: string;
  serviceType: string;
  /** What the customer's login is called in their words. */
  portalName: string;
  lineItems: { name: string; amount: number }[];
  /** Production stages, in this trade's language. */
  stages: string[];
  /** Deliverables at the end. */
  files: { name: string; size: string; kind: string }[];
  /** A message thread that sounds like this trade. */
  thread: { who: "them" | "you"; text: string }[];
  /** What the deliverables section is called. */
  filesLabel: string;
  filesEmpty: string;
}

export const INDUSTRIES: DemoIndustry[] = [
  {
    id: "construction",
    label: "Construction",
    studio: "Hartley Building Co.",
    client: "Dominic Fraser",
    clientInitials: "DF",
    project: "Rear extension — 14 Alder St",
    serviceType: "Extension and re-roof",
    portalName: "Your build",
    lineItems: [
      { name: "Site preparation and demolition", amount: 6800 },
      { name: "Slab, framing and roof structure", amount: 42500 },
      { name: "Windows, doors and external cladding", amount: 18400 },
      { name: "Certification and council fees", amount: 3200 },
    ],
    stages: ["Approvals", "Site prep", "Frame", "Fit-out", "Handover"],
    filesLabel: "Documents",
    filesEmpty:
      "Plans, certificates and warranties appear here as the build progresses.",
    files: [
      { name: "Approved_Plans_Stamped.pdf", size: "8.4 MB", kind: "Plans" },
      { name: "Structural_Engineering.pdf", size: "2.1 MB", kind: "Cert" },
      { name: "Occupation_Certificate.pdf", size: "640 KB", kind: "Cert" },
    ],
    thread: [
      {
        who: "them",
        text: "Frame inspection passed this morning. We'll start the roof Thursday, weather permitting — I'll send photos as it goes up.",
      },
      {
        who: "you",
        text: "Great news. Are we still on track for the window delivery next week?",
      },
    ],
  },
  {
    id: "hospitality",
    label: "Restaurant",
    studio: "Saltbush Kitchen",
    client: "Priya Raman",
    clientInitials: "PR",
    project: "Wedding reception — 120 guests",
    serviceType: "Full-service catering",
    portalName: "Your event",
    lineItems: [
      { name: "Canapés on arrival — 6 varieties", amount: 1740 },
      { name: "Three-course seated menu, 120 guests", amount: 10800 },
      { name: "Beverage service and staffing", amount: 4260 },
      { name: "Equipment hire and delivery", amount: 1450 },
    ],
    stages: ["Menu", "Tasting", "Confirmed", "Prep", "Served"],
    filesLabel: "Your documents",
    filesEmpty:
      "Your final menu, running sheet and dietary schedule appear here once confirmed.",
    files: [
      { name: "Final_Menu_and_Running_Sheet.pdf", size: "1.2 MB", kind: "Menu" },
      { name: "Dietary_Requirements.pdf", size: "310 KB", kind: "List" },
      { name: "Floor_Plan_120pax.pdf", size: "890 KB", kind: "Plan" },
    ],
    thread: [
      {
        who: "them",
        text: "Tasting is locked in for the 12th at 6pm. Bring anyone whose opinion matters — we'll run the full three courses.",
      },
      {
        who: "you",
        text: "Perfect. We've had two more guests flag a gluten intolerance since the last count.",
      },
    ],
  },
  {
    id: "trades",
    label: "Trades",
    studio: "Corliss Electrical",
    client: "Bramley Retail Group",
    clientInitials: "BR",
    project: "Switchboard upgrade — 3 sites",
    serviceType: "Commercial electrical",
    portalName: "Your job",
    lineItems: [
      { name: "Switchboard replacement — Wollongong", amount: 4900 },
      { name: "Switchboard replacement — Shellharbour", amount: 4900 },
      { name: "Switchboard replacement — Nowra", amount: 5400 },
      { name: "Compliance testing and certificates", amount: 1200 },
    ],
    stages: ["Scoped", "Scheduled", "On site", "Testing", "Certified"],
    filesLabel: "Certificates",
    filesEmpty:
      "Compliance certificates and test results appear here once the work is signed off.",
    files: [
      { name: "CCEW_Wollongong.pdf", size: "220 KB", kind: "Cert" },
      { name: "CCEW_Shellharbour.pdf", size: "218 KB", kind: "Cert" },
      { name: "Test_Results_All_Sites.pdf", size: "1.4 MB", kind: "Report" },
    ],
    thread: [
      {
        who: "them",
        text: "Wollongong is done and certified. Shellharbour is booked for Tuesday — we'll need the shop dark from 6am to about 10am.",
      },
      {
        who: "you",
        text: "That works. I'll let the store manager know not to open until 10.30.",
      },
    ],
  },
  {
    id: "creative",
    label: "Creative",
    studio: "Johnston Media",
    client: "Marlow & Co.",
    clientInitials: "MC",
    project: "Spring campaign shoot",
    serviceType: "Commercial photography and video",
    portalName: "Your project",
    lineItems: [
      { name: "Full-day shoot — two photographers", amount: 1800 },
      { name: "Aerial coverage (licensed drone)", amount: 650 },
      { name: "Edited gallery and highlight reel", amount: 750 },
    ],
    stages: ["Planning", "Shooting", "Editing", "Delivering", "Delivered"],
    filesLabel: "Your files",
    filesEmpty:
      "Your files appear here the moment they're ready — no download links that expire in a week.",
    files: [
      { name: "Highlights_4K.mp4", size: "1.2 GB", kind: "Video" },
      { name: "Gallery_Full_Resolution.zip", size: "3.8 GB", kind: "Photos" },
      { name: "Social_Cutdowns.zip", size: "420 MB", kind: "Video" },
    ],
    thread: [
      {
        who: "them",
        text: "Weather looks good for Thursday. Shall we start at the warehouse and move outside around 2pm for the light?",
      },
      { who: "you", text: "Perfect. I'll have the team there from 9." },
    ],
  },
];

export function industryTotal(industry: DemoIndustry): number {
  return industry.lineItems.reduce((sum, item) => sum + item.amount, 0);
}
