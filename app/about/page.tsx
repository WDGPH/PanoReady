import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, ShieldCheck } from "lucide-react";
import NavBar from "../../components/NavBar";

const workflowSteps = [
  ["Read", "Open an XML or Excel/XLSM file in the browser and inspect the import before processing."],
  ["Check", "Run local rules for required fields, controlled values, formats, duplicates, and known data issues."],
  ["Review", "Keep ambiguous address and identity decisions with the person who knows the source data."],
  ["Export", "Download cleaned XML, issue reports, CSV files, or an Excel workbook for the next step."],
];

export default function AboutPage() {
  return (
    <div className="about-page">
      <NavBar />
      <main className="about-shell">
        <Link href="./" className="about-back"><ArrowLeft size={13} /> Back to PanoReady</Link>
        <article className="about-document">
          <header className="about-intro">
            <p className="about-kicker">PanoReady / About</p>
            <h1>A careful pass before the upload.</h1>
            <p className="about-lede">PanoReady is a browser tool for checking Ontario school-enrollment files before they enter a Panorama/STIX workflow.</p>
          </header>

          <section className="about-section about-section--split">
            <div><p className="about-label">Why it exists</p><h2>Small file problems become submission problems.</h2></div>
            <div className="about-copy">
              <p>A missing value, unfamiliar code, or inconsistent address can be easy to miss in a large workbook. PanoReady puts those checks in one local step, before the file is handed off.</p>
              <p>It is designed for the people preparing and reviewing school enrollment data—not for a server to make decisions on their behalf.</p>
            </div>
          </section>

          <section className="about-section">
            <p className="about-label">The working path</p>
            <div className="about-steps">
              {workflowSteps.map(([name, description], index) => (
                <div className="about-step" key={name}>
                  <span className="about-step-number">0{index + 1}</span>
                  <div><h2>{name}</h2><p>{description}</p></div>
                  {index < workflowSteps.length - 1 && <ArrowRight className="about-step-arrow" size={16} aria-hidden="true" />}
                </div>
              ))}
            </div>
          </section>

          <section className="about-principles">
            <div className="about-principle"><LockKeyhole size={18} aria-hidden="true" /><div><h2>Files stay local</h2><p>Processing happens in this browser. There is no upload endpoint, account, or server-side data store.</p></div></div>
            <div className="about-principle"><ShieldCheck size={18} aria-hidden="true" /><div><h2>Automation has a boundary</h2><p>Deterministic changes can be applied automatically. Ambiguous decisions remain visible for review.</p></div></div>
          </section>

          <section className="about-note">
            <div className="about-note-heading"><Check size={16} aria-hidden="true" /><h2>Read the result carefully.</h2></div>
            <p><code>REVIEW_REQUIRED</code> means the implemented checks passed, but the authoritative STIX XSD is not available to this tool. PanoReady keeps that boundary visible instead of calling the file ready without the official schema and accepted-file tests.</p>
          </section>
        </article>
      </main>
    </div>
  );
}
